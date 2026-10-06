"use client";

import type { Category, EntryType, Reentry } from "../constants";
import { nextDueAt } from "../dates";
import { normaliseUrl } from "../feed/url";
import { db } from "../supabase/browser";
import type { Competition, EntryWithCompetition, Feed, UserSettings, Win } from "../types";
import { commit, onWriteFailed } from "./outbox";
import { Resource } from "./resource";

let currentUserId = "";
export function setDataUser(userId: string) {
  currentUserId = userId;
}

// ---------------------------------------------------------------------------
// Resources (each cached in IndexedDB per user)
// ---------------------------------------------------------------------------

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

export const feedResource = new Resource<Competition[]>("feed", () =>
  rows(
    db()
      .from("feed_items")
      .select("*")
      .order("closes_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1500),
  ),
);

export const entriesResource = new Resource<EntryWithCompetition[]>("entries", () =>
  rows(
    db()
      .from("entries")
      .select("*, competition:competitions(*)")
      .eq("status", "entered")
      .order("last_entered_at", { ascending: false })
      .limit(3000),
  ),
);

export const winsResource = new Resource<Win[]>("wins", () =>
  rows(db().from("wins").select("*").order("won_on", { ascending: false }).order("created_at", { ascending: false })),
);

export const feedsResource = new Resource<Feed[]>("feeds", () =>
  rows(db().from("feeds").select("*").order("created_at", { ascending: true })),
);

export const settingsResource = new Resource<UserSettings>("settings", async () => {
  const existing = await rows<UserSettings | null>(db().from("user_settings").select("*").maybeSingle());
  if (existing) return existing;
  // The migration's trigger normally creates this row; this covers older users.
  return rows<UserSettings>(db().from("user_settings").upsert({ user_id: currentUserId }).select("*").single());
});

const ALL = [feedResource, entriesResource, winsResource, feedsResource, settingsResource];

export function resetAllResources() {
  ALL.forEach((r) => r.reset());
}

// If the server rejects a write, pull fresh data so the screen matches reality.
if (typeof window !== "undefined") {
  onWriteFailed((op) => {
    if (op.table === "entries") {
      void feedResource.refresh();
      void entriesResource.refresh();
    } else if (op.table === "wins") void winsResource.refresh();
    else if (op.table === "feeds") void feedsResource.refresh();
    else if (op.table === "user_settings") void settingsResource.refresh();
  });
}

// ---------------------------------------------------------------------------
// Feed actions
// ---------------------------------------------------------------------------

function byClosingDate(a: Competition, b: Competition) {
  if (a.closes_at && b.closes_at) return a.closes_at.localeCompare(b.closes_at);
  if (a.closes_at) return -1;
  if (b.closes_at) return 1;
  return b.created_at.localeCompare(a.created_at);
}

function isOpen(c: Competition) {
  return !c.closes_at || new Date(c.closes_at).getTime() > Date.now();
}

export function markEntered(competition: Competition) {
  const now = new Date();
  const entry: EntryWithCompetition = {
    user_id: currentUserId,
    competition_id: competition.id,
    status: "entered",
    reentry: competition.reentry,
    entry_count: 1,
    last_entered_at: now.toISOString(),
    next_due_at: nextDueAt(competition.reentry, now)?.toISOString() ?? null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    competition,
  };
  feedResource.mutate((list) => list.filter((c) => c.id !== competition.id));
  entriesResource.mutate((list) => [entry, ...list.filter((e) => e.competition_id !== competition.id)]);
  void commit({
    type: "upsert",
    table: "entries",
    onConflict: "user_id,competition_id",
    values: {
      user_id: currentUserId,
      competition_id: competition.id,
      status: "entered",
      reentry: entry.reentry,
      entry_count: 1,
      last_entered_at: entry.last_entered_at,
      next_due_at: entry.next_due_at,
    },
  });
}

export function skip(competition: Competition) {
  feedResource.mutate((list) => list.filter((c) => c.id !== competition.id));
  void commit({
    type: "upsert",
    table: "entries",
    onConflict: "user_id,competition_id",
    values: {
      user_id: currentUserId,
      competition_id: competition.id,
      status: "skipped",
      reentry: "none",
      entry_count: 0,
      last_entered_at: null,
      next_due_at: null,
    },
  });
}

/** Undo Entered/Skip from the feed, or remove an entry: the competition returns to the feed. */
export function returnToFeed(competition: Competition) {
  entriesResource.mutate((list) => list.filter((e) => e.competition_id !== competition.id));
  if (isOpen(competition)) {
    feedResource.mutate((list) => [...list.filter((c) => c.id !== competition.id), competition].sort(byClosingDate));
  }
  void commit({ type: "delete", table: "entries", match: { user_id: currentUserId, competition_id: competition.id } });
}

// ---------------------------------------------------------------------------
// Entered actions
// ---------------------------------------------------------------------------

function updateEntry(competitionId: string, patch: Partial<EntryWithCompetition>) {
  entriesResource.mutate((list) =>
    list.map((e) => (e.competition_id === competitionId ? { ...e, ...patch, updated_at: new Date().toISOString() } : e)),
  );
  const { competition: _omit, ...values } = patch;
  void _omit;
  void commit({ type: "update", table: "entries", values, match: { user_id: currentUserId, competition_id: competitionId } });
}

export function recordReentry(entry: EntryWithCompetition) {
  const now = new Date();
  updateEntry(entry.competition_id, {
    entry_count: entry.entry_count + 1,
    last_entered_at: now.toISOString(),
    next_due_at: nextDueAt(entry.reentry, now)?.toISOString() ?? null,
  });
}

export function setReentry(entry: EntryWithCompetition, reentry: Reentry) {
  const last = entry.last_entered_at ? new Date(entry.last_entered_at) : new Date();
  updateEntry(entry.competition_id, { reentry, next_due_at: nextDueAt(reentry, last)?.toISOString() ?? null });
}

// ---------------------------------------------------------------------------
// Wins
// ---------------------------------------------------------------------------

export interface WinInput {
  prize: string;
  value_gbp: number | null;
  won_on: string;
  url: string | null;
  entry_type: EntryType | null;
  competition_id: string | null;
  notes: string | null;
}

export function logWin(input: WinInput) {
  const win: Win = { ...input, id: crypto.randomUUID(), user_id: currentUserId, created_at: new Date().toISOString() };
  winsResource.mutate((list) =>
    [win, ...list].sort((a, b) => b.won_on.localeCompare(a.won_on) || b.created_at.localeCompare(a.created_at)),
  );
  const { created_at: _created, ...values } = win;
  void _created;
  void commit({ type: "upsert", table: "wins", values, onConflict: "id" });
}

export function deleteWin(id: string) {
  winsResource.mutate((list) => list.filter((w) => w.id !== id));
  void commit({ type: "delete", table: "wins", match: { id, user_id: currentUserId } });
}

// ---------------------------------------------------------------------------
// Feeds & settings
// ---------------------------------------------------------------------------

export function addFeed(input: { name: string; url: string }) {
  const feed: Feed = {
    id: crypto.randomUUID(),
    user_id: currentUserId,
    name: input.name,
    url: input.url,
    enabled: true,
    terms_checked: true,
    etag: null,
    last_modified: null,
    last_fetched_at: null,
    last_status: null,
    last_error: null,
    last_new_items: null,
    created_at: new Date().toISOString(),
  };
  feedsResource.mutate((list) => [...list, feed]);
  return commit({
    type: "upsert",
    table: "feeds",
    onConflict: "id",
    values: { id: feed.id, user_id: currentUserId, name: feed.name, url: feed.url, enabled: true, terms_checked: true },
  }).then(() => feed);
}

export function updateFeed(id: string, patch: Partial<Pick<Feed, "enabled" | "name">>) {
  feedsResource.mutate((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  void commit({ type: "update", table: "feeds", values: patch, match: { id, user_id: currentUserId } });
}

export function deleteFeed(id: string) {
  feedsResource.mutate((list) => list.filter((f) => f.id !== id));
  void commit({ type: "delete", table: "feeds", match: { id, user_id: currentUserId } });
}

export type SettingsPatch = Partial<
  Pick<
    UserSettings,
    "digest_enabled" | "digest_time" | "reentry_enabled" | "reentry_time" | "closing_enabled" | "quiet_start" | "quiet_end"
  >
>;

export function saveSettings(patch: SettingsPatch) {
  settingsResource.mutate((s) => ({ ...s, ...patch }));
  void commit({ type: "update", table: "user_settings", values: patch, match: { user_id: currentUserId } });
}

// ---------------------------------------------------------------------------
// Manual competitions (needs a connection: the URL must be checked for duplicates)
// ---------------------------------------------------------------------------

export interface ManualCompetitionInput {
  url: string;
  title: string;
  prize: string;
  closes_at: string | null;
  entry_type: EntryType;
  category: Category;
  reentry: Reentry;
  alreadyEntered: boolean;
}

export async function addCompetition(
  input: ManualCompetitionInput,
): Promise<{ status: "added" | "exists"; competition: Competition }> {
  const url = normaliseUrl(input.url);
  if (!url) throw new Error("That doesn't look like a web link");

  const { data, error } = await db()
    .from("competitions")
    .insert({
      url,
      title: input.title || input.prize,
      prize: input.prize || input.title,
      closes_at: input.closes_at,
      entry_type: input.entry_type,
      category: input.category,
      reentry: input.reentry,
      source: "Added by you",
      added_by: currentUserId,
    })
    .select("*")
    .single();

  let competition = data as Competition | null;
  let status: "added" | "exists" = "added";
  if (error) {
    if (error.code !== "23505") throw error;
    // Already in the database (from a feed or added before).
    const existing = await db().from("competitions").select("*").eq("url", url).single();
    if (existing.error) throw existing.error;
    competition = existing.data as Competition;
    status = "exists";
  }
  if (!competition) throw new Error("Couldn't save the competition");

  if (input.alreadyEntered) {
    markEntered(competition);
  } else if (status === "added" && isOpen(competition)) {
    feedResource.mutate((list) => [...list, competition].sort(byClosingDate));
  }
  return { status, competition };
}
