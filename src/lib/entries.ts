import type { Competition, EntryWithCompetition } from "./types";

export function isClosed(competition: Pick<Competition, "closes_at">, now: Date): boolean {
  return !!competition.closes_at && new Date(competition.closes_at).getTime() <= now.getTime();
}

/** A daily/weekly competition whose next entry window has opened and that hasn't closed. */
export function isDue(entry: EntryWithCompetition, now: Date): boolean {
  return (
    entry.reentry !== "none" &&
    !!entry.next_due_at &&
    new Date(entry.next_due_at).getTime() <= now.getTime() &&
    !isClosed(entry.competition, now)
  );
}
