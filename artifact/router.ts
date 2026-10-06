"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny in-page router for the artifact: the tabs live in one page, so
 * navigation just swaps which screen is visible. The last tab is remembered
 * per device, and each tab keeps its own scroll position.
 */

export const TABS = ["/", "/entered", "/wins", "/settings"] as const;
const STORAGE_KEY = "comper:tab";

interface Location {
  pathname: string;
  search: string;
  hash: string;
}

function initial(): Location {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (TABS as readonly string[]).includes(saved)) return { pathname: saved, search: "", hash: "" };
  } catch {
    // Storage unavailable: start on the feed.
  }
  return { pathname: "/", search: "", hash: "" };
}

let location: Location = typeof window === "undefined" ? { pathname: "/", search: "", hash: "" } : initial();
const listeners = new Set<() => void>();
const scrollByPath = new Map<string, number>();

export function navigate(href: string) {
  const url = new URL(href, "https://comper.local/");
  const next: Location = { pathname: url.pathname, search: url.search, hash: url.hash.slice(1) };
  scrollByPath.set(location.pathname, window.scrollY);
  const samePage = next.pathname === location.pathname;
  location = next;
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(STORAGE_KEY, next.pathname);
  } catch {
    // ignore
  }
  requestAnimationFrame(() => {
    const target = next.hash ? document.getElementById(next.hash) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else if (!samePage) window.scrollTo(0, scrollByPath.get(next.pathname) ?? 0);
  });
}

export function useLocation(): Location {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => location,
    () => location,
  );
}
