"use client";

import { DEFAULT_BLOCKED } from "@/lib/feed/risk";
import { blockedResource, saveBlocked } from "./data";
import { useResource } from "./resource";

/** Artifact stand-in for src/lib/client/blocklist.ts: the list lives in your private Comper data. */

export function setBlocked(list: string[]) {
  saveBlocked([...new Set(list.map((p) => p.trim()).filter(Boolean))]);
}

export function addBlocked(phrase: string) {
  setBlocked([...(blockedResource.getSnapshot().data ?? DEFAULT_BLOCKED), phrase]);
}

export function removeBlocked(phrase: string) {
  setBlocked((blockedResource.getSnapshot().data ?? DEFAULT_BLOCKED).filter((p) => p !== phrase));
}

export function useBlocked(): string[] {
  return useResource(blockedResource).data ?? DEFAULT_BLOCKED;
}
