import type { Category, EntryType, Reentry } from "./constants";

/** Row shapes for the tables in supabase/migrations. Timestamps are ISO strings. */

export interface Competition {
  id: string;
  url: string;
  title: string;
  prize: string;
  summary: string | null;
  closes_at: string | null;
  entry_type: EntryType;
  category: Category;
  reentry: Reentry;
  source: string;
  feed_id: string | null;
  added_by: string | null;
  published_at: string | null;
  created_at: string;
}

export type EntryStatus = "entered" | "skipped";

export interface Entry {
  user_id: string;
  competition_id: string;
  status: EntryStatus;
  reentry: Reentry;
  entry_count: number;
  last_entered_at: string | null;
  next_due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryWithCompetition extends Entry {
  competition: Competition;
}

export interface Win {
  id: string;
  user_id: string;
  competition_id: string | null;
  prize: string;
  value_gbp: number | null;
  won_on: string; // yyyy-mm-dd
  url: string | null;
  entry_type: EntryType | null;
  notes: string | null;
  created_at: string;
}

export type FeedStatus = "ok" | "not_modified" | "blocked_by_robots" | "error";

export interface Feed {
  id: string;
  user_id: string;
  name: string;
  url: string;
  enabled: boolean;
  terms_checked: boolean;
  etag: string | null;
  last_modified: string | null;
  last_fetched_at: string | null;
  last_status: FeedStatus | null;
  last_error: string | null;
  last_new_items: number | null;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  digest_enabled: boolean;
  digest_time: string; // HH:MM[:SS]
  reentry_enabled: boolean;
  reentry_time: string;
  closing_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  last_digest_on: string | null;
  last_digest_at: string | null;
  last_reentry_on: string | null;
  updated_at: string;
}

export interface PushSubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
}
