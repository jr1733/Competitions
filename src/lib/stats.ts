import { ENTRY_TYPES, type EntryType } from "./constants";
import { londonParts } from "./dates";
import type { EntryWithCompetition, Win } from "./types";

export interface TypeStats {
  type: EntryType;
  entered: number;
  wins: number;
  value: number;
  /** Wins per competition entered, or null if nothing entered. */
  rate: number | null;
}

export interface WinStats {
  wins: number;
  value: number;
  yearWins: number;
  yearValue: number;
  entered: number;
  rate: number | null;
  byType: TypeStats[];
}

/** Totals and win rate by entry type. A win counts against its competition's entry type when linked. */
export function winStats(entries: EntryWithCompetition[], wins: Win[], now = new Date()): WinStats {
  const typeOfCompetition = new Map(entries.map((e) => [e.competition_id, e.competition.entry_type]));
  const winType = (w: Win): EntryType | null =>
    (w.competition_id ? typeOfCompetition.get(w.competition_id) : undefined) ?? w.entry_type;
  const year = String(londonParts(now).year);
  const value = (list: Win[]) => list.reduce((sum, w) => sum + (Number(w.value_gbp) || 0), 0);
  const yearWins = wins.filter((w) => w.won_on.startsWith(year));

  return {
    wins: wins.length,
    value: value(wins),
    yearWins: yearWins.length,
    yearValue: value(yearWins),
    entered: entries.length,
    rate: entries.length ? wins.length / entries.length : null,
    byType: ENTRY_TYPES.map((type) => {
      const entered = entries.filter((e) => e.competition.entry_type === type).length;
      const typeWins = wins.filter((w) => winType(w) === type);
      return { type, entered, wins: typeWins.length, value: value(typeWins), rate: entered ? typeWins.length / entered : null };
    }),
  };
}

const wholePounds = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const withPence = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** £85.50, £120 (pence only when there are some). */
export function formatGbp(value: number): string {
  return Math.round(value * 100) % 100 === 0 ? wholePounds.format(value) : withPence.format(value);
}

/** 0.0222 → "1 in 45". */
export function formatRate(rate: number | null): string {
  if (rate === null || rate === 0) return "–";
  if (rate >= 1) return "Every time";
  return `1 in ${Math.round(1 / rate)}`;
}
