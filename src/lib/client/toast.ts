"use client";

import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  message: string;
  tone: "default" | "success" | "error";
  action?: { label: string; onClick: () => void };
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(message: string, options: Partial<Omit<Toast, "id" | "message">> & { durationMs?: number } = {}) {
  const id = nextId++;
  // Keep at most two on screen: the newest matters most.
  toasts = [...toasts.slice(-1), { id, message, tone: options.tone ?? "default", action: options.action }];
  emit();
  setTimeout(() => dismissToast(id), options.durationMs ?? (options.action ? 5000 : 2500));
  return id;
}

const EMPTY: Toast[] = [];

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => EMPTY,
  );
}
