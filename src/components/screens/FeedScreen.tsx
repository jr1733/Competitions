"use client";

import { Inbox, Rss, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { feedResource, feedsResource, markEntered, returnToFeed, skip } from "@/lib/client/data";
import { useResource } from "@/lib/client/resource";
import { toast } from "@/lib/client/toast";
import { useNow } from "@/lib/client/use-now";
import { CATEGORIES, CATEGORY_LABELS, ENTRY_TYPE_LABELS, ENTRY_TYPES, type Category, type EntryType } from "@/lib/constants";
import { isClosed } from "@/lib/entries";
import type { Competition } from "@/lib/types";
import { CardSkeleton, CompetitionCard } from "../CompetitionCard";
import { EmptyState } from "../EmptyState";
import { PageHeader } from "../PageHeader";
import { SwipeCard } from "../SwipeCard";
import { RefreshButton, SyncStatus } from "../SyncStatus";

const PAGE_SIZE = 40;

function matches(c: Competition, query: string) {
  if (!query) return true;
  const haystack = `${c.prize} ${c.title} ${c.source} ${c.summary ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export function FeedScreen({
  emptyAction = { href: "/settings#feeds", label: "Add a feed" },
}: {
  /** Where the "no feeds yet" button goes. */
  emptyAction?: { href: string; label: string };
} = {}) {
  const { data, loading, offline, updatedAt, error } = useResource(feedResource);
  const feeds = useResource(feedsResource).data;
  const now = useNow();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<EntryType | "all">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const sentinel = useRef<HTMLDivElement>(null);

  const open = useMemo(() => (data ?? []).filter((c) => !isClosed(c, now)), [data, now]);

  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(ENTRY_TYPES.map((t) => [t, 0])) as Record<EntryType, number>;
    for (const c of open) if (category === "all" || c.category === category) counts[c.entry_type]++;
    return counts;
  }, [open, category]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const c of open) if (type === "all" || c.entry_type === type) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    return counts;
  }, [open, type]);

  const filtered = useMemo(
    () =>
      open.filter(
        (c) =>
          (type === "all" || c.entry_type === type) &&
          (category === "all" || c.category === category) &&
          matches(c, deferredQuery),
      ),
    [open, type, category, deferredQuery],
  );

  // Render in pages so a long feed stays smooth. Changing a filter starts again at page one.
  const filterKey = `${type}|${category}|${deferredQuery}`;
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE_SIZE });
  const limit = paging.key === filterKey ? paging.limit : PAGE_SIZE;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPaging((p) => ({ key: filterKey, limit: (p.key === filterKey ? p.limit : PAGE_SIZE) + PAGE_SIZE }));
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, filterKey]);

  function entered(c: Competition) {
    markEntered(c);
    setOpenedId(null);
    toast("Marked as entered", { tone: "success", action: { label: "Undo", onClick: () => returnToFeed(c) } });
  }

  function skipped(c: Competition) {
    skip(c);
    toast("Skipped", { action: { label: "Undo", onClick: () => returnToFeed(c) } });
  }

  const filtersActive = type !== "all" || category !== "all" || deferredQuery !== "";

  return (
    <>
      <PageHeader
        title="Feed"
        subtitle={
          <>
            {data ? `${open.length} open · ` : ""}
            <SyncStatus updatedAt={updatedAt} offline={offline} loading={loading} />
          </>
        }
        actions={<RefreshButton loading={loading} onClick={() => void feedResource.refresh()} />}
      >
        <div className="px-4">
          <label className="relative block">
            <span className="sr-only">Search competitions</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              placeholder="Search prizes, brands, sources"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-2.5 text-zinc-400"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </label>
        </div>

        <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Entry type">
          <button type="button" className={`chip ${type === "all" ? "chip-on" : "chip-off"}`} onClick={() => setType("all")} aria-pressed={type === "all"}>
            All types
          </button>
          {ENTRY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${type === t ? "chip-on" : "chip-off"}`}
              onClick={() => setType(type === t ? "all" : t)}
              aria-pressed={type === t}
            >
              {ENTRY_TYPE_LABELS[t]}
              <span className="opacity-60">{typeCounts[t]}</span>
            </button>
          ))}
        </div>

        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Prize category">
          <button
            type="button"
            className={`chip min-h-9 text-[13px] ${category === "all" ? "chip-on" : "chip-off"}`}
            onClick={() => setCategory("all")}
            aria-pressed={category === "all"}
          >
            All prizes
          </button>
          {CATEGORIES.filter((c) => categoryCounts.get(c) || category === c).map((c) => (
            <button
              key={c}
              type="button"
              className={`chip min-h-9 text-[13px] ${category === c ? "chip-on" : "chip-off"}`}
              onClick={() => setCategory(category === c ? "all" : c)}
              aria-pressed={category === c}
            >
              {CATEGORY_LABELS[c]}
              <span className="opacity-60">{categoryCounts.get(c) ?? 0}</span>
            </button>
          ))}
        </div>
      </PageHeader>

      <main className="flex flex-col gap-3 px-4 pt-4">
        {error && !data && <p className="card p-4 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load the feed: {error}</p>}

        {!data && !error && [0, 1, 2].map((i) => <CardSkeleton key={i} />)}

        {data && open.length === 0 && (feeds?.length ?? 0) === 0 && (
          <EmptyState icon={Rss} title="Add your first feed">
            <p>Comper reads competition RSS feeds every 6 hours.</p>
            <Link href={emptyAction.href} className="btn btn-primary mt-4">
              {emptyAction.label}
            </Link>
          </EmptyState>
        )}

        {data && open.length === 0 && (feeds?.length ?? 0) > 0 && (
          <EmptyState icon={Inbox} title="All caught up">
            New competitions arrive every 6 hours.
          </EmptyState>
        )}

        {data && open.length > 0 && filtered.length === 0 && (
          <EmptyState icon={SearchX} title="Nothing matches">
            {filtersActive && (
              <button
                type="button"
                className="btn btn-secondary mt-4"
                onClick={() => {
                  setQuery("");
                  setType("all");
                  setCategory("all");
                }}
              >
                Clear filters
              </button>
            )}
          </EmptyState>
        )}

        {filtered.slice(0, limit).map((c) => (
          <SwipeCard key={c.id} onSwipeRight={() => entered(c)} onSwipeLeft={() => skipped(c)}>
            <CompetitionCard
              competition={c}
              now={now}
              opened={openedId === c.id}
              onOpen={() => setOpenedId(c.id)}
              onEntered={() => entered(c)}
              onSkip={() => skipped(c)}
            />
          </SwipeCard>
        ))}

        {filtered.length > limit && <div ref={sentinel} className="h-24" aria-hidden />}

        {filtered.length > 0 && (
          <p className="py-4 text-center text-xs text-zinc-400">
            Swipe right for entered, left to skip
            {filtersActive ? ` · ${filtered.length} of ${open.length} shown` : ""}
          </p>
        )}
      </main>
    </>
  );
}
