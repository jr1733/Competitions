"use client";

import { createStore, del, get, keys, set, type UseStore } from "idb-keyval";

/**
 * IndexedDB cache for lists, so screens render instantly (and offline) before
 * the network refresh lands. Every call fails soft: if IndexedDB is
 * unavailable (some private modes), the app simply loads from the network.
 */

let store: UseStore | null = null;
let userPrefix = "anon";

function idb(): UseStore | null {
  if (typeof indexedDB === "undefined") return null;
  store ??= createStore("comper", "cache");
  return store;
}

export function setCacheUser(userId: string) {
  userPrefix = userId;
}

function key(name: string) {
  return `${userPrefix}:${name}`;
}

export async function cacheGet<T>(name: string): Promise<T | undefined> {
  const s = idb();
  if (!s) return undefined;
  try {
    return await get<T>(key(name), s);
  } catch {
    return undefined;
  }
}

export async function cacheSet(name: string, value: unknown): Promise<void> {
  const s = idb();
  if (!s) return;
  try {
    await set(key(name), value, s);
  } catch {
    // Quota or private mode: ignore.
  }
}

/** Remove everything cached for the current user (on sign-out). */
export async function cacheClearUser(): Promise<void> {
  const s = idb();
  if (!s) return;
  try {
    const prefix = `${userPrefix}:`;
    const all = await keys(s);
    await Promise.all(all.filter((k) => String(k).startsWith(prefix)).map((k) => del(k, s)));
  } catch {
    // ignore
  }
}
