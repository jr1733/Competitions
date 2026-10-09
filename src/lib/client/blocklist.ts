"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_BLOCKED } from "@/lib/feed/risk";

/**
 * Words and promoters whose competitions are hidden as likely scams
 * (Settings → Scam filter, and each card's Report scam). Kept on this
 * device; the Claude artifact keeps its list in your Comper data instead.
 */

const KEY = "comper:blocked";
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cache = Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [...DEFAULT_BLOCKED];
  } catch {
    cache = [...DEFAULT_BLOCKED];
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setBlocked(list: string[]) {
  cache = [...new Set(list.map((p) => p.trim()).filter(Boolean))];
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // private browsing: keep it for this visit
  }
  listeners.forEach((l) => l());
}

export function addBlocked(phrase: string) {
  setBlocked([...read(), phrase]);
}

export function removeBlocked(phrase: string) {
  setBlocked(read().filter((p) => p !== phrase));
}

export function useBlocked(): string[] {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_BLOCKED);
}
