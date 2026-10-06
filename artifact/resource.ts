"use client";

import { useSyncExternalStore } from "react";

/**
 * Artifact stand-in for src/lib/client/resource.ts. Same shape, so the
 * shared screens work unchanged, but the data arrives live from the
 * artifact's database (see data.ts) instead of an IndexedDB cache.
 */

export interface ResourceState<T> {
  data: T | null;
  updatedAt: number | null;
  loading: boolean;
  offline: boolean;
  error: string | null;
}

const INITIAL: ResourceState<never> = { data: null, updatedAt: null, loading: false, offline: false, error: null };

export class Resource<T> {
  private state: ResourceState<T> = INITIAL;
  private listeners = new Set<() => void>();
  private onRefresh: (() => Promise<unknown>) | null = null;

  constructor(readonly name: string) {}

  getSnapshot = (): ResourceState<T> => this.state;
  getServerSnapshot = (): ResourceState<T> => INITIAL;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setState(patch: Partial<ResourceState<T>>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** What the screen's refresh button does for this resource. */
  setRefresh(fn: () => Promise<unknown>) {
    this.onRefresh = fn;
  }

  async refresh(): Promise<void> {
    await this.onRefresh?.();
  }

  refreshIfStale(): Promise<void> {
    return Promise.resolve();
  }

  hydrate(): Promise<void> {
    return Promise.resolve();
  }

  mutate(fn: (data: T) => T) {
    if (this.state.data !== null) this.setState({ data: fn(this.state.data) });
  }
}

export function useResource<T>(resource: Resource<T>): ResourceState<T> {
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getServerSnapshot);
}
