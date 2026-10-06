"use client";

import { ExternalLink, Plus, Trash2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteWin, entriesResource, winsResource } from "@/lib/client/data";
import { useResource } from "@/lib/client/resource";
import { useNow } from "@/lib/client/use-now";
import { ENTRY_TYPE_LABELS } from "@/lib/constants";
import { formatShortDate, londonDateTime } from "@/lib/dates";
import { formatRate, gbp, gbpExact, winStats } from "@/lib/stats";
import { EntryTypeBadge } from "../Badges";
import { EmptyState } from "../EmptyState";
import { LogWinForm } from "../LogWinForm";
import { PageHeader } from "../PageHeader";
import { Sheet } from "../Sheet";
import { SyncStatus } from "../SyncStatus";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>}
    </div>
  );
}

function wonOnLabel(wonOn: string, now: Date) {
  const [y, m, d] = wonOn.split("-").map(Number);
  return formatShortDate(londonDateTime(y, m, d, 12), now);
}

export function WinsScreen() {
  const wins = useResource(winsResource);
  const entries = useResource(entriesResource);
  const now = useNow();
  const [logging, setLogging] = useState(false);

  const stats = useMemo(() => winStats(entries.data ?? [], wins.data ?? [], now), [entries.data, wins.data, now]);
  const loaded = wins.data !== null && entries.data !== null;

  return (
    <>
      <PageHeader
        title="Wins"
        subtitle={<SyncStatus updatedAt={wins.updatedAt} offline={wins.offline} loading={wins.loading} />}
        actions={
          <button type="button" className="btn btn-primary min-h-11 px-3.5" onClick={() => setLogging(true)}>
            <Plus className="size-5" aria-hidden /> Log a win
          </button>
        }
      />

      <main className="flex flex-col gap-5 px-4 pt-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Total wins" value={loaded ? String(stats.wins) : "–"} hint={`${stats.yearWins} this year`} />
          <Stat label="Total value" value={loaded ? gbp.format(stats.value) : "–"} hint={`${gbp.format(stats.yearValue)} this year`} />
          <Stat label="Win rate" value={loaded ? formatRate(stats.rate) : "–"} hint="per competition entered" />
          <Stat label="Entered" value={loaded ? String(stats.entered) : "–"} hint="competitions" />
        </div>

        <section aria-labelledby="by-type" className="card overflow-hidden">
          <h2 id="by-type" className="px-4 pt-4 pb-2 font-semibold">
            By entry type
          </h2>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-zinc-500 dark:text-zinc-400">
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th scope="col" className="px-4 py-2 text-left font-medium">Type</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Entered</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Wins</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Rate</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {stats.byType.map((t) => (
                <tr key={t.type} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <th scope="row" className="px-4 py-3 text-left font-medium">{ENTRY_TYPE_LABELS[t.type]}</th>
                  <td className="px-2 py-3 text-right">{t.entered}</td>
                  <td className="px-2 py-3 text-right">{t.wins}</td>
                  <td className="px-2 py-3 text-right whitespace-nowrap">{formatRate(t.rate)}</td>
                  <td className="px-4 py-3 text-right">{gbp.format(t.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="win-list" className="flex flex-col gap-3">
          <h2 id="win-list" className="section-title">
            Your wins
          </h2>
          {wins.data?.length === 0 && (
            <EmptyState icon={Trophy} title="No wins yet">
              Keep going. When you win, log it here to track your totals.
            </EmptyState>
          )}
          {wins.data?.map((w) => (
            <article key={w.id} className="card flex items-start gap-3 p-4">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <Trophy className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="leading-snug font-semibold">{w.prize}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <span>{wonOnLabel(w.won_on, now)}</span>
                  {w.value_gbp !== null && <span className="font-semibold text-emerald-700 dark:text-emerald-400">{gbpExact.format(Number(w.value_gbp))}</span>}
                  {w.entry_type && <EntryTypeBadge type={w.entry_type} />}
                </div>
                {w.notes && <p className="mt-1 text-sm text-zinc-500">{w.notes}</p>}
              </div>
              <div className="flex flex-col">
                {w.url && (
                  <a href={w.url} target="_blank" rel="noopener noreferrer" className="rounded-full p-2.5 text-zinc-500" aria-label="Open competition">
                    <ExternalLink className="size-5" aria-hidden />
                  </a>
                )}
                <button
                  type="button"
                  className="rounded-full p-2.5 text-zinc-400"
                  aria-label={`Delete win ${w.prize}`}
                  onClick={() => {
                    if (confirm(`Delete "${w.prize}"?`)) deleteWin(w.id);
                  }}
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>

      <Sheet open={logging} onClose={() => setLogging(false)} title="Log a win">
        <LogWinForm entries={entries.data ?? []} initialCompetitionId={null} onDone={() => setLogging(false)} />
      </Sheet>
    </>
  );
}
