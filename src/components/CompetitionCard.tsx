"use client";

import { Check, Clock, ExternalLink, SkipForward } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/constants";
import { describeClosing } from "@/lib/dates";
import type { Competition } from "@/lib/types";
import { EntryTypeBadge, ReentryBadge } from "./Badges";

const URGENCY: Record<string, string> = {
  today: "text-red-600 dark:text-red-400 font-semibold",
  soon: "text-amber-700 dark:text-amber-400 font-medium",
  normal: "text-zinc-600 dark:text-zinc-400",
  none: "text-zinc-500 dark:text-zinc-500",
  closed: "text-zinc-400 line-through",
};

export function CompetitionCard({
  competition: c,
  now,
  opened,
  onOpen,
  onEntered,
  onSkip,
}: {
  competition: Competition;
  now: Date;
  opened: boolean;
  onOpen: () => void;
  onEntered: () => void;
  onSkip: () => void;
}) {
  const closing = describeClosing(c.closes_at, now);
  return (
    <article className="card select-none p-4" aria-label={c.prize}>
      <div className="flex flex-wrap items-center gap-1.5">
        <EntryTypeBadge type={c.entry_type} />
        <ReentryBadge reentry={c.reentry} />
        <span className="ml-auto text-xs font-medium text-zinc-500 dark:text-zinc-400">{CATEGORY_LABELS[c.category]}</span>
      </div>

      <h2 className="mt-2.5 text-lg leading-snug font-semibold text-balance">{c.prize}</h2>
      {c.summary && <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{c.summary}</p>}

      <div className="mt-2.5 flex items-center gap-1.5 text-sm">
        <Clock className="size-4 shrink-0 text-zinc-400" aria-hidden />
        <span className={URGENCY[closing.urgency]}>{closing.text}</span>
        <span className="ml-auto truncate pl-2 text-xs text-zinc-400">{c.source}</span>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2 text-[15px]">
        <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={onOpen} className="btn btn-primary px-2 text-[15px]">
          Enter <ExternalLink className="size-4" aria-hidden />
        </a>
        <button
          type="button"
          onClick={onEntered}
          className={`btn btn-success px-2 text-[15px] ${opened ? "ring-4 ring-emerald-400/60 dark:ring-emerald-300/40" : ""}`}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden /> Entered
        </button>
        <button type="button" onClick={onSkip} className="btn btn-secondary px-2 text-[15px]">
          Skip <SkipForward className="size-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}

export function CardSkeleton() {
  return (
    <div className="card animate-pulse p-4" aria-hidden>
      <div className="flex gap-2">
        <div className="h-6 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-6 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="mt-3 h-6 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-2 h-4 w-full rounded bg-zinc-100 dark:bg-zinc-800/60" />
      <div className="mt-3 h-4 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800/60" />
      <div className="mt-4 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
    </div>
  );
}
