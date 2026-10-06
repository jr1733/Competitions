"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cacheGet, cacheSet } from "./cache";
import { errorText, isNetworkError } from "./network";
import { flushOutbox, pendingCount } from "./outbox";

export interface ResourceState<T> {
  data: T | null;
  /** When the data last came from the server (ms). */
  updatedAt: number | null;
  loading: boolean;
  offline: boolean;
  error: string | null;
}

const INITIAL: ResourceState<never> = { data: null, updatedAt: null, loading: false, offline: false, error: null };
const STALE_AFTER_MS = 60_000;

/**
 * A cached, shared list. On first use it loads from IndexedDB (instant), then
 * refreshes from Supabase. Local changes are applied with `mutate` and saved
 * back to the cache so they survive reloads while offline.
 */
export class Resource<T> {
  private state: ResourceState<T> = INITIAL;
  private listeners = new Set<() => void>();
  private hydrated: Promise<void> | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    readonly name: string,
    private fetcher: () => Promise<T>,
  ) {}

  getSnapshot = (): ResourceState<T> => this.state;
  getServerSnapshot = (): ResourceState<T> => INITIAL;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<ResourceState<T>>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  hydrate(): Promise<void> {
    this.hydrated ??= cacheGet<{ data: T; updatedAt: number }>(this.name).then((cached) => {
      if (cached && this.state.data === null) this.set({ data: cached.data, updatedAt: cached.updatedAt });
    });
    return this.hydrated;
  }

  refresh(): Promise<void> {
    this.inflight ??= (async () => {
      this.set({ loading: true });
      try {
        await this.hydrate();
        await flushOutbox();
        // Unsent local changes mean we're offline: keep the optimistic data.
        if (pendingCount() > 0) {
          this.set({ offline: true });
          return;
        }
        const data = await this.fetcher();
        const updatedAt = Date.now();
        this.set({ data, updatedAt, offline: false, error: null });
        await cacheSet(this.name, { data, updatedAt });
      } catch (error) {
        if (isNetworkError(error)) this.set({ offline: true });
        else this.set({ error: errorText(error) });
      } finally {
        this.set({ loading: false });
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Refresh if the data is missing or older than a minute. */
  refreshIfStale(): Promise<void> {
    const { updatedAt } = this.state;
    if (!updatedAt || Date.now() - updatedAt > STALE_AFTER_MS) return this.refresh();
    return Promise.resolve();
  }

  /** Apply a local (optimistic) change and persist it to the cache. */
  mutate(fn: (data: T) => T) {
    if (this.state.data === null) return;
    const data = fn(this.state.data);
    this.set({ data });
    void cacheSet(this.name, { data, updatedAt: this.state.updatedAt });
  }

  reset() {
    this.hydrated = null;
    this.state = INITIAL;
    this.listeners.forEach((l) => l());
  }
}

/** Subscribe to a resource; hydrates from cache and refreshes when shown, focused or back online. */
export function useResource<T>(resource: Resource<T>): ResourceState<T> {
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getServerSnapshot);

  useEffect(() => {
    void resource.hydrate().then(() => resource.refreshIfStale());
    const onVisible = () => {
      if (document.visibilityState === "visible") void resource.refreshIfStale();
    };
    const onOnline = () => void resource.refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [resource]);

  return state;
}
