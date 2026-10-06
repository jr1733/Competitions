"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { usePendingWrites } from "@/lib/client/outbox";
import { timeAgo } from "@/lib/dates";

/** "Updated 2m ago", or an offline notice with the number of unsynced changes. */
export function SyncStatus({ updatedAt, offline, loading }: { updatedAt: number | null; offline: boolean; loading: boolean }) {
  const pending = usePendingWrites();
  if (offline || pending > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
        <CloudOff className="size-3.5" aria-hidden />
        Offline{pending > 0 ? ` · ${pending} change${pending === 1 ? "" : "s"} to sync` : " · showing saved copy"}
      </span>
    );
  }
  if (loading && !updatedAt) return <span>Loading…</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {loading && <RefreshCw className="size-3 animate-spin" aria-hidden />}
      Updated {timeAgo(updatedAt)}
    </span>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm ring-1 ring-zinc-200 active:scale-95 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
      aria-label="Refresh"
    >
      <RefreshCw className={`size-5 ${loading ? "animate-spin" : ""}`} aria-hidden />
    </button>
  );
}
