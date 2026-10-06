"use client";

import { Check, Clock, ExternalLink, ListChecks, MoreHorizontal, Repeat, Trophy, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { entriesResource, recordReentry, returnToFeed, setReentry } from "@/lib/client/data";
import { useResource } from "@/lib/client/resource";
import { toast } from "@/lib/client/toast";
import { useNow } from "@/lib/client/use-now";
import { REENTRY_FREQUENCIES, REENTRY_LABELS } from "@/lib/constants";
import { describeClosing, describeDue, formatDayHeading, londonDateKey } from "@/lib/dates";
import { isClosed, isDue } from "@/lib/entries";
import type { EntryWithCompetition } from "@/lib/types";
import { DueBadge, EntryTypeBadge } from "../Badges";
import { EmptyState } from "../EmptyState";
import { LogWinForm } from "../LogWinForm";
import { PageHeader } from "../PageHeader";
import { Sheet } from "../Sheet";
import { RefreshButton, SyncStatus } from "../SyncStatus";

type View = "all" | "reentry" | "closing";

function EntryRow({
  entry,
  now,
  onMore,
}: {
  entry: EntryWithCompetition;
  now: Date;
  onMore: () => void;
}) {
  const c = entry.competition;
  const due = isDue(entry, now);
  const closed = isClosed(c, now);
  const closing = describeClosing(c.closes_at, now);

  return (
    <article className={`card p-4 ${closed ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <EntryTypeBadge type={c.entry_type} />
        {entry.reentry !== "none" && !closed && (
          <DueBadge due={due} text={`${REENTRY_LABELS[entry.reentry]} · ${describeDue(entry.next_due_at, now)}`} />
        )}
        <button
          type="button"
          onClick={onMore}
          className="-my-2 -mr-2 ml-auto rounded-full p-2.5 text-zinc-500"
          aria-label={`More options for ${c.prize}`}
        >
          <MoreHorizontal className="size-5" aria-hidden />
        </button>
      </div>
      <h3 className="mt-1.5 leading-snug font-semibold">{c.prize}</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {closing.text}
        </span>
        {entry.entry_count > 1 && <span>Entered {entry.entry_count}×</span>}
        <span className="truncate">{c.source}</span>
      </div>
      {due && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            Enter again <ExternalLink className="size-4" aria-hidden />
          </a>
          <button
            type="button"
            className="btn btn-success"
            onClick={() => {
              recordReentry(entry);
              toast("Re-entry recorded", { tone: "success" });
            }}
          >
            <Check className="size-5" aria-hidden /> Done
          </button>
        </div>
      )}
    </article>
  );
}

export function EnteredScreen() {
  const router = useRouter();
  const { data, loading, offline, updatedAt, error } = useResource(entriesResource);
  const now = useNow();
  const [view, setView] = useState<View>("all");
  const [selected, setSelected] = useState<EntryWithCompetition | null>(null);
  const [winFor, setWinFor] = useState<string | null>(null);

  const { due, groups, counts } = useMemo(() => {
    const entries = data ?? [];
    const weekAhead = now.getTime() + 7 * 86_400_000;
    const inView = entries.filter((e) => {
      if (view === "reentry") return e.reentry !== "none";
      if (view === "closing") {
        const t = e.competition.closes_at ? new Date(e.competition.closes_at).getTime() : Infinity;
        return t > now.getTime() && t <= weekAhead;
      }
      return true;
    });
    const dueNow = inView
      .filter((e) => isDue(e, now))
      .sort((a, b) => (a.next_due_at ?? "").localeCompare(b.next_due_at ?? ""));
    const rest = new Map<string, EntryWithCompetition[]>();
    for (const e of inView) {
      if (isDue(e, now)) continue;
      const key = londonDateKey(new Date(e.last_entered_at ?? e.created_at));
      rest.set(key, [...(rest.get(key) ?? []), e]);
    }
    return {
      due: dueNow,
      groups: [...rest.entries()].sort(([a], [b]) => b.localeCompare(a)),
      counts: { total: entries.length, reentry: entries.filter((e) => e.reentry !== "none").length },
    };
  }, [data, view, now]);

  const current = selected && data?.find((e) => e.competition_id === selected.competition_id);

  return (
    <>
      <PageHeader
        title="Entered"
        subtitle={
          <>
            {data ? `${counts.total} entered · ` : ""}
            <SyncStatus updatedAt={updatedAt} offline={offline} loading={loading} />
          </>
        }
        actions={<RefreshButton loading={loading} onClick={() => void entriesResource.refresh()} />}
      >
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4" role="group" aria-label="Show">
          {(
            [
              ["all", "All"],
              ["reentry", `Re-entries · ${counts.reentry}`],
              ["closing", "Closing this week"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`chip ${view === value ? "chip-on" : "chip-off"}`}
              onClick={() => setView(value)}
              aria-pressed={view === value}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      <main className="flex flex-col gap-3 px-4 pt-4">
        {error && !data && <p className="card p-4 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load entries: {error}</p>}

        {data && data.length === 0 && (
          <EmptyState icon={ListChecks} title="Nothing entered yet">
            Tap <strong>Entered</strong> on a competition (or swipe it right) and it&apos;ll appear here.
          </EmptyState>
        )}

        {due.length > 0 && (
          <section aria-labelledby="due-heading" className="flex flex-col gap-3">
            <h2 id="due-heading" className="section-title flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Repeat className="size-3.5" aria-hidden /> Due for re-entry · {due.length}
            </h2>
            {due.map((e) => (
              <EntryRow key={e.competition_id} entry={e} now={now} onMore={() => setSelected(e)} />
            ))}
          </section>
        )}

        {groups.map(([day, entries]) => (
          <section key={day} aria-label={formatDayHeading(day, now)} className="flex flex-col gap-3">
            <h2 className="section-title mt-2">{formatDayHeading(day, now)}</h2>
            {entries.map((e) => (
              <EntryRow key={e.competition_id} entry={e} now={now} onMore={() => setSelected(e)} />
            ))}
          </section>
        ))}

        {data && data.length > 0 && due.length === 0 && groups.length === 0 && (
          <p className="py-10 text-center text-sm text-zinc-500">Nothing here for this filter.</p>
        )}
      </main>

      <Sheet open={!!current} onClose={() => setSelected(null)} title={current?.competition.prize ?? ""}>
        {current && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="section-title mb-2">Can be entered</h3>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Re-entry frequency">
                {REENTRY_FREQUENCIES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={current.reentry === r}
                    onClick={() => setReentry(current, r)}
                    className={`btn ${current.reentry === r ? "btn-primary" : "btn-secondary"}`}
                  >
                    {r === "none" ? "Once" : REENTRY_LABELS[r]}
                  </button>
                ))}
              </div>
              {current.reentry !== "none" && (
                <p className="mt-2 text-sm text-zinc-500">{describeDue(current.next_due_at, now)}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <a href={current.competition.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                Open competition <ExternalLink className="size-4" aria-hidden />
              </a>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSelected(null);
                  setWinFor(current.competition_id);
                }}
              >
                <Trophy className="size-5" aria-hidden /> I won this!
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const c = current.competition;
                  setSelected(null);
                  returnToFeed(c);
                  toast("Moved back to the feed");
                }}
              >
                <Undo2 className="size-5" aria-hidden /> Not entered: move back to feed
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!winFor} onClose={() => setWinFor(null)} title="Log a win">
        {winFor && (
          <LogWinForm
            key={winFor}
            entries={data ?? []}
            initialCompetitionId={winFor}
            onDone={() => setWinFor(null)}
            winsLink={{ label: "View", onClick: () => router.push("/wins") }}
          />
        )}
      </Sheet>
    </>
  );
}
