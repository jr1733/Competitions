"use client";

import { useSyncExternalStore } from "react";
import { db } from "../supabase/browser";
import { cacheGet, cacheSet } from "./cache";
import { errorText, isNetworkError } from "./network";
import { toast } from "./toast";

/**
 * Offline outbox. Every write goes through here: it's queued in IndexedDB,
 * then sent in order. If the network is down the queue waits and is flushed
 * when the device comes back online. Writes are idempotent (upserts keyed by
 * primary key, deletes by match), so a retry can't create duplicates.
 */

type Row = Record<string, unknown>;

export type Op =
  | { id: string; type: "upsert"; table: string; values: Row; onConflict?: string }
  | { id: string; type: "update"; table: string; values: Row; match: Row }
  | { id: string; type: "delete"; table: string; match: Row };

export type NewOp = Op extends infer O ? (O extends Op ? Omit<O, "id"> : never) : never;

let queue: Op[] = [];
let loaded = false;
let flushing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const failureHandlers = new Set<(op: Op) => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function persist() {
  await cacheSet("outbox", queue);
}

export async function loadOutbox() {
  if (loaded) return;
  loaded = true;
  const saved = await cacheGet<Op[]>("outbox");
  if (saved?.length) {
    queue = [...saved, ...queue];
    emit();
  }
}

export function resetOutbox() {
  queue = [];
  loaded = false;
  emit();
}

export function pendingCount() {
  return queue.length;
}

/** Called when the server rejects a write, so the UI can re-sync from the server. */
export function onWriteFailed(handler: (op: Op) => void) {
  failureHandlers.add(handler);
  return () => failureHandlers.delete(handler);
}

async function send(op: Op) {
  const table = db().from(op.table);
  switch (op.type) {
    case "upsert":
      return table.upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
    case "update":
      return table.update(op.values).match(op.match);
    case "delete":
      return table.delete().match(op.match);
  }
}

export function flushOutbox(): Promise<void> {
  flushing ??= (async () => {
    await loadOutbox();
    while (queue.length) {
      const op = queue[0];
      let error: unknown = null;
      try {
        ({ error } = await send(op));
      } catch (e) {
        error = e;
      }
      if (error && isNetworkError(error)) break; // Still offline: keep the queue.
      queue = queue.slice(1);
      await persist();
      emit();
      if (error) {
        toast(`Couldn't save a change: ${errorText(error)}`, { tone: "error" });
        failureHandlers.forEach((h) => h(op));
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export async function commit(op: NewOp) {
  await loadOutbox();
  queue = [...queue, { ...op, id: crypto.randomUUID() } as Op];
  emit();
  await persist();
  // A flush already in progress picks up the new op before it finishes.
  await (flushing ?? flushOutbox());
}

export function usePendingWrites(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => queue.length,
    () => 0,
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushOutbox());
}
