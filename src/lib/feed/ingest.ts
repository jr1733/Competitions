import "server-only";
import { adminClient } from "../supabase/admin";
import type { Feed, FeedStatus } from "../types";
import { fetchFeed, RobotsBlockedError, type RobotsVerdictSource } from "./http";
import { dedupeByUrl, itemToCompetition, type CompetitionDraft } from "./normalise";
import { parseFeed } from "./parse";

export interface FeedRunResult {
  feedId: string;
  name: string;
  status: FeedStatus | "skipped_time_budget";
  parsedItems: number;
  newItems: number;
  error?: string;
}

export interface IngestSummary {
  feeds: FeedRunResult[];
  newItems: number;
  pruned: number;
  durationMs: number;
}

const CONCURRENT_HOSTS = 4;
const UPSERT_CHUNK = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "Timed out";
    return error.message.slice(0, 300);
  }
  return "Unknown error";
}

async function insertNew(drafts: CompetitionDraft[]): Promise<number> {
  const db = adminClient();
  let inserted = 0;
  for (let i = 0; i < drafts.length; i += UPSERT_CHUNK) {
    const chunk = drafts.slice(i, i + UPSERT_CHUNK);
    // ignoreDuplicates: a URL we've already stored keeps its first-seen row.
    const { data, error } = await db
      .from("competitions")
      .upsert(chunk, { onConflict: "url", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Database error: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  return inserted;
}

async function runFeed(feed: Feed, robotsCache: Map<string, RobotsVerdictSource>, now: Date) {
  const result: FeedRunResult = { feedId: feed.id, name: feed.name, status: "ok", parsedItems: 0, newItems: 0 };
  const update: Partial<Feed> = { last_fetched_at: now.toISOString() };
  let crawlDelaySeconds = 0;

  try {
    const fetched = await fetchFeed(feed.url, { etag: feed.etag, lastModified: feed.last_modified }, robotsCache);
    crawlDelaySeconds = fetched.crawlDelaySeconds;
    if (fetched.status === "not_modified") {
      result.status = "not_modified";
    } else {
      const parsed = parseFeed(fetched.body);
      result.parsedItems = parsed.items.length;
      const drafts = dedupeByUrl(
        parsed.items
          .map((item) => itemToCompetition(item, { id: feed.id, name: feed.name }, now))
          .filter((d): d is CompetitionDraft => d !== null),
      );
      result.newItems = await insertNew(drafts);
      update.etag = fetched.etag;
      update.last_modified = fetched.lastModified;
    }
    update.last_error = null;
  } catch (error) {
    result.status = error instanceof RobotsBlockedError ? "blocked_by_robots" : "error";
    result.error = errorMessage(error);
    update.last_error = result.error;
  }

  update.last_status = result.status as FeedStatus;
  update.last_new_items = result.newItems;
  await adminClient().from("feeds").update(update).eq("id", feed.id);
  return { result, crawlDelaySeconds };
}

/**
 * Fetch every enabled feed (or just `feedIds`, or one user's feeds), store new
 * competitions, then prune old closed ones. Feeds on the same host run one
 * after another, honouring Crawl-delay; different hosts run in parallel.
 */
export async function ingestFeeds(
  options: { userId?: string; feedIds?: string[]; budgetMs?: number; now?: Date } = {},
): Promise<IngestSummary> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const budgetMs = options.budgetMs ?? 50_000;
  const db = adminClient();

  let query = db.from("feeds").select("*").eq("enabled", true);
  if (options.userId) query = query.eq("user_id", options.userId);
  if (options.feedIds?.length) query = query.in("id", options.feedIds);
  const { data: feeds, error } = await query.order("last_fetched_at", { ascending: true, nullsFirst: true });
  if (error) throw new Error(`Couldn't load feeds: ${error.message}`);

  const byHost = new Map<string, Feed[]>();
  for (const feed of (feeds ?? []) as Feed[]) {
    let host = "invalid";
    try {
      host = new URL(feed.url).host;
    } catch {
      // Recorded as an error by fetchFeed below.
    }
    byHost.set(host, [...(byHost.get(host) ?? []), feed]);
  }

  const robotsCache = new Map<string, RobotsVerdictSource>();
  const results: FeedRunResult[] = [];
  const queue = [...byHost.values()];

  async function worker() {
    for (let group = queue.shift(); group; group = queue.shift()) {
      for (const [index, feed] of group.entries()) {
        if (Date.now() - started > budgetMs) {
          results.push({ feedId: feed.id, name: feed.name, status: "skipped_time_budget", parsedItems: 0, newItems: 0 });
          continue;
        }
        const { result, crawlDelaySeconds } = await runFeed(feed, robotsCache, now);
        results.push(result);
        if (crawlDelaySeconds && index < group.length - 1) await sleep(crawlDelaySeconds * 1000);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_HOSTS, queue.length) }, worker));

  const { data: pruned } = await db.rpc("prune_competitions");

  return {
    feeds: results,
    newItems: results.reduce((sum, r) => sum + r.newItems, 0),
    pruned: typeof pruned === "number" ? pruned : 0,
    durationMs: Date.now() - started,
  };
}

/** Fetch and parse a feed without saving anything: used by "Test feed" in Settings. */
export async function previewFeed(url: string, now = new Date()) {
  const fetched = await fetchFeed(url);
  if (fetched.status !== "ok") throw new Error("Unexpected 304 response");
  const parsed = parseFeed(fetched.body);
  const drafts = parsed.items
    .map((item) => itemToCompetition(item, { id: null, name: parsed.title || new URL(url).hostname }, now))
    .filter((d): d is CompetitionDraft => d !== null);
  return {
    title: parsed.title,
    format: parsed.format,
    itemCount: parsed.items.length,
    openCount: drafts.length,
    sample: drafts.slice(0, 5),
  };
}
