"use client";

import robotsParser from "robots-parser";
import { toast } from "@/lib/client/toast";
import type { Category, EntryType, Reentry } from "@/lib/constants";
import { nextDueAt } from "@/lib/dates";
import { dedupeByUrl, itemToCompetition, type CompetitionDraft } from "@/lib/feed/normalise";
import { normaliseUrl } from "@/lib/feed/url";
import type { Competition, EntryStatus, EntryWithCompetition, Feed, FeedStatus, Win } from "@/lib/types";
import { capability, FETCH_CONNECTOR, FETCH_TOOL, type CollectionRef, type DocRef, type McpError, type McpNs } from "./claude";
import { COMMON_FEED_PAGES, COMMON_FEED_PATHS, feedLinksInPage, looksLikeCompetitions, parseFetchedFeed } from "./fetched-feed";
import { NotAFeedError, type ParsedFeed } from "@/lib/feed/parse";
import { Resource } from "./resource";

/**
 * Comper's data layer inside Claude. Same exports as src/lib/client/data.ts,
 * so the shared screens run unchanged, but everything lives in the
 * artifact's own database, in the viewer's private subtree:
 *
 *   data/users/<id>/comper             feeds list, last check time
 *   data/users/<id>/comper/comps/<id>  one competition, with your entry on it
 *   data/users/<id>/comper/wins/<id>   one win
 */

interface EntryState {
  status: EntryStatus;
  reentry: Reentry;
  entry_count: number;
  last_entered_at: string | null;
  next_due_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CompDoc extends Omit<Competition, "id" | "added_by"> {
  manual?: boolean;
  entry?: EntryState | null;
}

/** A feed as stored here: robots_ok_at remembers when robots.txt last allowed it (re-checked daily). */
type StoredFeed = Feed & { robots_ok_at?: string | null };

interface RootDoc {
  feeds: StoredFeed[];
  last_refresh_at: string | null;
  created_at: string;
  /** Stable id sent to the connector as `session_id`, as its free tier asks. */
  fetch_session_id?: string;
  /** When the last feed check failed at the connector, so automatic checks can back off. */
  last_check_error_at?: string | null;
}

interface LogEntry {
  at: string;
  tool: string;
  urls: number;
  ok: boolean;
  ms: number;
  code?: string;
  message?: string;
  results?: number;
  errors?: number;
  /** Per-address outcome for feed searches: address, status, size, first characters. */
  detail?: { u: string; s: string; n?: number; h?: string }[];
}

// ---------------------------------------------------------------------------
// Resources the screens subscribe to
// ---------------------------------------------------------------------------

export const feedResource = new Resource<Competition[]>("feed");
export const entriesResource = new Resource<EntryWithCompetition[]>("entries");
export const winsResource = new Resource<Win[]>("wins");
export const feedsResource = new Resource<Feed[]>("feeds");
export const statsResource = new Resource<{ competitions: number; lastCheckAt: string | null; lastCheckErrorAt: string | null }>(
  "stats",
);

let uid = "";
let root: DocRef | null = null;
let compsCol: CollectionRef | null = null;
let winsCol: CollectionRef | null = null;
let comps = new Map<string, CompDoc>();
let rootDoc: RootDoc | null = null;
let wins: Win[] = [];
let logRef: DocRef | null = null;
let log: LogEntry[] = [];

function now() {
  return new Date().toISOString();
}

function isOpen(c: Pick<Competition, "closes_at">) {
  return !c.closes_at || new Date(c.closes_at).getTime() > Date.now();
}

function byClosingDate(a: Competition, b: Competition) {
  if (a.closes_at && b.closes_at) return a.closes_at.localeCompare(b.closes_at);
  if (a.closes_at) return -1;
  if (b.closes_at) return 1;
  return b.created_at.localeCompare(a.created_at);
}

function toCompetition(id: string, doc: CompDoc): Competition {
  return {
    id,
    url: doc.url,
    title: doc.title,
    prize: doc.prize,
    summary: doc.summary ?? null,
    closes_at: doc.closes_at ?? null,
    entry_type: doc.entry_type,
    category: doc.category,
    reentry: doc.reentry,
    source: doc.source,
    feed_id: doc.feed_id ?? null,
    added_by: doc.manual ? uid : null,
    published_at: doc.published_at ?? null,
    created_at: doc.created_at,
  };
}

function derive() {
  const feed: Competition[] = [];
  const entered: EntryWithCompetition[] = [];
  for (const [id, doc] of comps) {
    const competition = toCompetition(id, doc);
    const entry = doc.entry;
    if (!entry) {
      if (isOpen(competition)) feed.push(competition);
    } else if (entry.status === "entered") {
      entered.push({ ...entry, user_id: uid, competition_id: id, competition });
    }
  }
  feed.sort(byClosingDate);
  entered.sort((a, b) => (b.last_entered_at ?? b.created_at).localeCompare(a.last_entered_at ?? a.created_at));
  const t = Date.now();
  feedResource.setState({ data: feed, error: null });
  entriesResource.setState({ data: entered, updatedAt: t, error: null });
  statsResource.setState({
    data: { competitions: comps.size, lastCheckAt: rootDoc?.last_refresh_at ?? null, lastCheckErrorAt: rootDoc?.last_check_error_at ?? null },
  });
}

/** Stable document id for a competition URL, so the same competition is only ever stored once. */
export function competitionId(url: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < url.length; i++) {
    const ch = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `c${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------

export type ConnectResult = { ok: true } | { ok: false; reason: "no-db" | "no-user" | "error"; message?: string };

/** Find the viewer's private space in the artifact database and start live updates. */
export async function connect(): Promise<ConnectResult> {
  const [db, user] = await Promise.all([capability("db"), capability("user")]);
  if (!db) return { ok: false, reason: "no-db" };
  const id = await user?.id();
  if (!id) return { ok: false, reason: "no-user" };
  uid = id;

  try {
    root = db.doc(`data/users/${id}/comper`);
    compsCol = root.collection("comps");
    winsCol = root.collection("wins");
    logRef = db.doc(`data/users/${id}/comper-log`);
    void logRef
      .get()
      .then((snap) => {
        const entries = (snap.data() as { entries?: LogEntry[] } | undefined)?.entries;
        if (Array.isArray(entries)) log = [...entries, ...log].slice(-40);
      })
      .catch(() => undefined);
    const first = await root.get();
    if (!first.exists) await root.set({ feeds: [], last_refresh_at: null, created_at: now() });
  } catch (error) {
    return { ok: false, reason: "error", message: (error as { message?: string }).message };
  }

  const onError = (resource: Resource<unknown>) => (e: { code: string; message: string }) =>
    resource.setState({ error: e.code === "revoked" ? "Comper lost access to its data. Reopen it." : e.message });

  root.onSnapshot((snap) => applyRoot((snap.data() as RootDoc | undefined) ?? null), onError(feedsResource as Resource<unknown>));

  compsCol.onSnapshot((snap) => {
    comps = new Map(snap.docs.map((d) => [d.id, d.data() as unknown as CompDoc]));
    derive();
  }, onError(feedResource as Resource<unknown>));

  winsCol.onSnapshot((snap) => {
    wins = snap.docs
      .map((d) => ({ ...(d.data() as unknown as Win), id: d.id }))
      .sort((a, b) => b.won_on.localeCompare(a.won_on) || b.created_at.localeCompare(a.created_at));
    winsResource.setState({ data: wins, updatedAt: Date.now(), error: null });
  }, onError(winsResource as Resource<unknown>));

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Writes: one at a time per document, failures reported as toasts
// ---------------------------------------------------------------------------

const chains = new Map<string, Promise<unknown>>();

function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  chains.set(key, next);
  return next;
}

function describeDbError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e.code === "quota_exceeded") return "Comper's storage is full. Remove some old competitions or wins.";
  if (e.code === "resource_exhausted") return "Too many changes at once. Wait a moment and try again.";
  return e.message ?? String(error);
}

function write(key: string, fn: () => Promise<unknown>, failure: string) {
  return serial(key, fn).catch((error) => {
    toast(`${failure}: ${describeDbError(error)}`, { tone: "error" });
    throw error;
  });
}

function compRef(id: string): DocRef {
  if (!compsCol) throw new Error("Comper isn't connected yet");
  return compsCol.doc(id);
}

function applyRoot(doc: RootDoc | null) {
  rootDoc = doc;
  feedsResource.setState({ data: doc?.feeds ?? [], updatedAt: Date.now() });
  feedResource.setState({ updatedAt: doc?.last_refresh_at ? new Date(doc.last_refresh_at).getTime() : null });
  statsResource.setState({
    data: { competitions: comps.size, lastCheckAt: doc?.last_refresh_at ?? null, lastCheckErrorAt: doc?.last_check_error_at ?? null },
  });
}

/** Change the root document. The change is applied locally straight away so the next step sees it; the snapshot confirms it. */
function updateRoot(fn: (current: RootDoc) => Partial<RootDoc>, failure: string) {
  return write(
    "root",
    async () => {
      if (!root) throw new Error("Comper isn't connected yet");
      const current = rootDoc ?? { feeds: [], last_refresh_at: null, created_at: now() };
      const patch = fn(current);
      applyRoot({ ...current, ...patch });
      try {
        await root.update(patch as Record<string, unknown>);
      } catch (error) {
        applyRoot(current);
        throw error;
      }
    },
    failure,
  );
}

const quiet = () => undefined;

// ---------------------------------------------------------------------------
// Feed actions (same API as the Supabase version)
// ---------------------------------------------------------------------------

export function markEntered(competition: Competition) {
  const at = new Date();
  const entry: EntryState = {
    status: "entered",
    reentry: competition.reentry,
    entry_count: 1,
    last_entered_at: at.toISOString(),
    next_due_at: nextDueAt(competition.reentry, at)?.toISOString() ?? null,
    created_at: at.toISOString(),
    updated_at: at.toISOString(),
  };
  write(competition.id, () => compRef(competition.id).update({ entry }), "Couldn't mark it entered").catch(quiet);
}

export function skip(competition: Competition) {
  const at = now();
  const entry: EntryState = {
    status: "skipped",
    reentry: "none",
    entry_count: 0,
    last_entered_at: null,
    next_due_at: null,
    created_at: at,
    updated_at: at,
  };
  write(competition.id, () => compRef(competition.id).update({ entry }), "Couldn't skip it").catch(quiet);
}

export function returnToFeed(competition: Competition) {
  write(competition.id, () => compRef(competition.id).update({ entry: null }), "Couldn't move it back").catch(quiet);
}

export function recordReentry(entry: EntryWithCompetition) {
  const at = new Date();
  write(
    entry.competition_id,
    () =>
      compRef(entry.competition_id).update({
        entry: {
          entry_count: entry.entry_count + 1,
          last_entered_at: at.toISOString(),
          next_due_at: nextDueAt(entry.reentry, at)?.toISOString() ?? null,
          updated_at: at.toISOString(),
        },
      }),
    "Couldn't record the re-entry",
  ).catch(quiet);
}

export function setReentry(entry: EntryWithCompetition, reentry: Reentry) {
  const last = entry.last_entered_at ? new Date(entry.last_entered_at) : new Date();
  write(
    entry.competition_id,
    () =>
      compRef(entry.competition_id).update({
        entry: { reentry, next_due_at: nextDueAt(reentry, last)?.toISOString() ?? null, updated_at: now() },
      }),
    "Couldn't change how often it can be entered",
  ).catch(quiet);
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
  const id = crypto.randomUUID();
  const win: Win = { ...input, id, user_id: uid, created_at: now() };
  write(`win:${id}`, () => winsCol!.doc(id).set({ ...win }), "Couldn't save the win").catch(quiet);
}

export function deleteWin(id: string) {
  write(`win:${id}`, () => winsCol!.doc(id).delete(), "Couldn't delete the win").catch(quiet);
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

export async function addFeed(input: { name: string; url: string }): Promise<Feed> {
  const feed: Feed = {
    id: crypto.randomUUID(),
    user_id: uid,
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
    created_at: now(),
  };
  await updateRoot((r) => {
    if (r.feeds.some((f) => f.url === feed.url)) throw new Error("That feed is already in your list");
    return { feeds: [...r.feeds, feed] };
  }, "Couldn't add the feed");
  return feed;
}

export function updateFeed(id: string, patch: Partial<Pick<Feed, "enabled" | "name">>) {
  updateRoot((r) => ({ feeds: r.feeds.map((f) => (f.id === id ? { ...f, ...patch } : f)) }), "Couldn't update the feed").catch(quiet);
}

export function deleteFeed(id: string) {
  updateRoot((r) => ({ feeds: r.feeds.filter((f) => f.id !== id) }), "Couldn't remove the feed").catch(quiet);
}

// ---------------------------------------------------------------------------
// Manual competitions
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
  const id = competitionId(url);
  const existing = comps.get(id);
  if (existing) {
    const competition = toCompetition(id, existing);
    if (input.alreadyEntered) markEntered(competition);
    return { status: "exists", competition };
  }

  const doc: CompDoc = {
    url,
    title: input.title || input.prize,
    prize: input.prize || input.title,
    summary: null,
    closes_at: input.closes_at,
    entry_type: input.entry_type,
    category: input.category,
    reentry: input.reentry,
    source: "Added by you",
    feed_id: null,
    published_at: null,
    created_at: now(),
    manual: true,
    entry: null,
  };
  if (input.alreadyEntered) {
    const at = new Date();
    doc.entry = {
      status: "entered",
      reentry: input.reentry,
      entry_count: 1,
      last_entered_at: at.toISOString(),
      next_due_at: nextDueAt(input.reentry, at)?.toISOString() ?? null,
      created_at: at.toISOString(),
      updated_at: at.toISOString(),
    };
  }
  await serial(id, () => compRef(id).set({ ...doc }));
  return { status: "added", competition: toCompetition(id, doc) };
}

// ---------------------------------------------------------------------------
// Checking feeds through the Parallel Search connector
// ---------------------------------------------------------------------------

export class ConnectorProblem extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorProblem";
  }
}

/** Text the connector itself sent back, when the platform passes it along (tool_error carries the result). */
function connectorDetail(error: McpError): string {
  const result = (error as McpError & { result?: unknown }).result as { content?: { type?: string; text?: string }[] } | undefined;
  return (result?.content ?? [])
    .map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : ""))
    .join(" ")
    .trim();
}

const RATE_LIMITED = `${FETCH_CONNECTOR} is busy or over its free usage limit right now. It's a free, shared service, so try again in a little while.`;

export function connectorMessage(error: McpError): string {
  const detail = connectorDetail(error);
  if (/rate.?limit|too many requests|\b429\b|quota/i.test(`${error.message ?? ""} ${detail}`)) return RATE_LIMITED;
  switch (error.code) {
    case "server_not_connected":
    case "server_not_found":
      return `Add the ${FETCH_CONNECTOR} connector in claude.ai Settings → Connectors, then reopen Comper.`;
    case "needs_reauth":
      return `Reconnect ${FETCH_CONNECTOR} in claude.ai Settings → Connectors.`;
    case "selection_required":
      return `You have more than one ${FETCH_CONNECTOR} connector. Choose one when Claude asks.`;
    case "not_in_manifest":
      return `${FETCH_CONNECTOR} is turned off for Comper. Turn it on in this page's Permissions menu.`;
    case "blocked_by_policy":
    case "approval_required":
      return `Your organisation doesn't allow ${FETCH_CONNECTOR} here.`;
    case "server_unavailable":
      return `${FETCH_CONNECTOR} isn't responding right now. Try again in a few minutes.`;
    case "not_granted":
    case "capability_disabled":
    case "capability_removed":
      return "Connectors aren't available in this view of Comper. Open it in Claude.";
    case "tool_error":
    case "upstream_error":
    default:
      // The platform reports connector-side failures (including the free-tier limit) as a generic
      // "Connector call failed", so say what usually causes it.
      return `${FETCH_CONNECTOR} didn't answer this time${detail ? ` (${detail.slice(0, 160)})` : ""}. It's a free, shared service that limits how often it can be used, so try again in a little while. [${error.code || "error"}]`;
  }
}

export interface FetchResult {
  url: string;
  content?: string;
  status?: number;
  error?: string;
}

interface FetchPayload {
  results?: { url: string; full_content?: string | null; excerpts?: string[] | null }[];
  errors?: { url: string; error_type?: string; http_status_code?: number | null; content?: string | null }[];
}

export function urlKey(url: string): string {
  return (normaliseUrl(url) ?? url).replace(/\/$/, "");
}

/** Fetch up to 20 URLs per call; at most one retry, and only for errors the connector marks retryable. */
const LIFECYCLE_CODES = new Set(["not_granted", "capability_disabled", "capability_removed", "not_in_manifest", "server_not_connected", "server_not_found", "needs_reauth", "selection_required", "blocked_by_policy", "approval_required"]);

function isRateLimit(e: McpError): boolean {
  return /rate.?limit|too many requests|\b429\b/i.test(`${e.message ?? ""} ${connectorDetail(e)}`);
}

/**
 * Fetch up to 20 URLs per call. A call is retried once only when the
 * connector marks the error retryable. If a call with several URLs fails
 * outright (one bad address can sink a whole batch), it's split in two and
 * each half tried once; only when nothing gets through is it reported.
 */
export async function fetchUrls(
  mcp: McpNs,
  urls: string[],
  objective: string,
  options: { detail?: boolean } = {},
): Promise<Map<string, FetchResult>> {
  const out = new Map<string, FetchResult>();

  const absorb = (payload: FetchPayload) => {
    for (const r of payload.results ?? []) {
      out.set(urlKey(r.url), { url: r.url, content: r.full_content ?? (r.excerpts ?? []).join("\n\n") });
    }
    for (const e of payload.errors ?? []) {
      out.set(urlKey(e.url), { url: e.url, status: e.http_status_code ?? undefined, error: e.error_type ?? "fetch error" });
    }
  };

  const once = async (batch: string[]) => {
    const input = { urls: batch, full_content: true, objective, allow_live_fetch: true };
    try {
      return await call(mcp, input);
    } catch (error) {
      const e = error as McpError;
      if (!e.retryable) throw e;
      await new Promise((r) => setTimeout(r, Math.min(e.retryAfterMs ?? 2000, 10_000) + Math.random() * 1000));
      return await call(mcp, input);
    }
  };

  // On failure, split and retry each half, at most two levels deep: one bad address then costs a
  // few extra calls and loses at most a quarter of the batch, not the whole of it.
  let lastError: McpError | null = null;
  let anyOk = false;
  const attempt = async (batch: string[], depth: number): Promise<void> => {
    try {
      absorb(await once(batch));
      anyOk = true;
    } catch (error) {
      const e = error as McpError;
      lastError = e;
      if (isRateLimit(e) || LIFECYCLE_CODES.has(e.code)) throw new ConnectorProblem(e.code, connectorMessage(e));
      if (batch.length < 2 || depth >= 2) {
        for (const u of batch) out.set(urlKey(u), { url: u, error: `connector failed (${e.code})` });
        return;
      }
      const half = Math.ceil(batch.length / 2);
      await attempt(batch.slice(0, half), depth + 1);
      await attempt(batch.slice(half), depth + 1);
    }
  };

  for (let i = 0; i < urls.length; i += 20) await attempt(urls.slice(i, i + 20), 0);
  if (!anyOk && lastError) {
    const e: McpError = lastError;
    throw new ConnectorProblem(e.code, connectorMessage(e));
  }

  if (options.detail) {
    record({
      at: now(),
      tool: "detail",
      urls: urls.length,
      ok: true,
      ms: 0,
      detail: urls.map((u) => {
        const r = out.get(urlKey(u));
        const short = u.replace(/^https?:\/\//, "").slice(0, 90);
        if (!r) return { u: short, s: "no answer" };
        if (r.content === undefined) return { u: short, s: r.status ? `HTTP ${r.status}` : (r.error ?? "error") };
        return { u: short, s: "ok", n: r.content.length, h: r.content.replace(/\s+/g, " ").slice(0, 100) };
      }),
    });
  }
  return out;
}

/** The stable id the connector asks every call to carry (its free tier counts usage per session). */
function connectorSessionId(): string {
  if (rootDoc?.fetch_session_id) return rootDoc.fetch_session_id;
  const id = `comper-${crypto.randomUUID().replace(/-/g, "")}`;
  updateRoot(() => ({ fetch_session_id: id }), "Couldn't save Comper's connector id").catch(quiet);
  return id;
}

/** Record each connector call (outcome, timing, error code) so problems can be diagnosed later. */
function record(entry: LogEntry) {
  // Keep the log document small: 40 entries, per-address detail only on the latest few.
  const kept = [...log, entry].slice(-40);
  const detailed = kept.map((e, i) => i).filter((i) => kept[i].detail).slice(-6);
  log = kept.map((e, i) => (e.detail && !detailed.includes(i) ? { ...e, detail: undefined } : e));
  const snapshot = JSON.parse(JSON.stringify(log)) as LogEntry[];
  if (logRef) serial("log", () => logRef!.set({ entries: snapshot })).catch(quiet);
}

/** Call one of the connector's tools with the session id, logging the outcome. Rejects with the McpError. */
export async function callConnector<T>(mcp: McpNs, tool: string, input: Record<string, unknown>): Promise<T> {
  const started = Date.now();
  const urls = Array.isArray(input.urls) ? input.urls.length : 0;
  try {
    const result = await mcp.callTool(FETCH_CONNECTOR, tool, { ...input, session_id: connectorSessionId() }, { cache: false });
    let payload = result.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        // leave as text
      }
    }
    const p = (payload && typeof payload === "object" ? payload : {}) as { results?: unknown[]; errors?: unknown[] };
    record({ at: now(), tool, urls, ok: true, ms: Date.now() - started, results: p.results?.length ?? 0, errors: p.errors?.length ?? 0 });
    return p as T;
  } catch (error) {
    const e = error as McpError;
    record({
      at: now(),
      tool,
      urls,
      ok: false,
      ms: Date.now() - started,
      code: e.code,
      message: `${e.message ?? ""} ${connectorDetail(e)}`.trim().slice(0, 300),
    });
    throw error;
  }
}

function call(mcp: McpNs, input: Record<string, unknown>): Promise<FetchPayload> {
  return callConnector<FetchPayload>(mcp, FETCH_TOOL, input);
}

export type RobotsVerdict = { allowed: true } | { allowed: false; reason: string };

/** robots.txt rules, RFC 9309 style: missing (4xx) = allowed; unreachable = skip for now. */
export function robotsVerdict(feedUrl: string, robots: FetchResult | undefined): RobotsVerdict {
  if (!robots) return { allowed: false, reason: "robots.txt couldn't be checked" };
  if (robots.content !== undefined) {
    const parsed = robotsParser(new URL("/robots.txt", feedUrl).toString(), robots.content);
    return parsed.isAllowed(feedUrl, "ComperBot") === false
      ? { allowed: false, reason: "Disallowed by robots.txt" }
      : { allowed: true };
  }
  if (robots.status && robots.status >= 400 && robots.status < 500) return { allowed: true };
  return { allowed: false, reason: `robots.txt unavailable (${robots.status ? `HTTP ${robots.status}` : robots.error})` };
}

const FEED_OBJECTIVE = "Every item in this RSS feed: title, link, published date and description";

/**
 * The address given was an ordinary page, not a feed: look for the site's feed.
 * Tries feed links on that page, the usual feed addresses, then any "RSS feeds"
 * page it links to. Only paths the site's robots.txt allows are fetched.
 * Costs one or two connector calls.
 */
export async function findFeedOnSite(
  mcp: McpNs,
  pageUrl: string,
  pageContent: string,
  robots: FetchResult | undefined,
): Promise<{ url: string; parsed: ParsedFeed } | null> {
  const origin = new URL(pageUrl).origin;
  const allowed = (u: string) => robotsVerdict(u, robots).allowed;
  const tried = new Set<string>([urlKey(pageUrl)]);
  const found: { url: string; parsed: ParsedFeed }[] = [];

  async function tryBatch(urls: string[]): Promise<Map<string, FetchResult>> {
    const batch = urls.filter((u) => !tried.has(urlKey(u)) && allowed(u)).slice(0, 20);
    batch.forEach((u) => tried.add(urlKey(u)));
    if (!batch.length) return new Map();
    const fetched = await fetchUrls(mcp, batch, FEED_OBJECTIVE, { detail: true });
    for (const u of batch) {
      const content = fetched.get(urlKey(u))?.content;
      if (!content) continue;
      try {
        const parsed = parseFetchedFeed(content);
        if (parsed.items.length) found.push({ url: u, parsed });
      } catch {
        // a page, not a feed
      }
    }
    return fetched;
  }

  // 1. Feed links on the page, and pages about feeds ("RSS Feeds" links, /feeds).
  const links = feedLinksInPage(pageContent, pageUrl);
  const feedPages = [...new Set([...links.feedPages, ...COMMON_FEED_PAGES.map((p) => origin + p)])];
  const first = await tryBatch([...links.feeds, ...feedPages]);
  // 2. The feeds those pages list.
  const listed = feedPages.flatMap((p) => {
    const content = first.get(urlKey(p))?.content;
    return content ? feedLinksInPage(content, p).feeds : [];
  });
  if (listed.length) await tryBatch(listed);
  // 3. Last resort: the usual feed addresses.
  if (!found.length) await tryBatch(COMMON_FEED_PATHS.map((p) => origin + p));
  if (!found.length) return null;
  const score = (f: { parsed: ParsedFeed }) =>
    (looksLikeCompetitions(f.parsed.items.map((i) => i.title)) ? 10_000 : 0) + f.parsed.items.length;
  return found.sort((a, b) => score(b) - score(a))[0];
}

export interface CheckSummary {
  newItems: number;
  checked: number;
  problems: { feed: string; message: string }[];
}

let checking: Promise<CheckSummary> | null = null;

/** Remember a failed check so the automatic check on opening backs off for a while. */
function noteCheckFailure() {
  return updateRoot(() => ({ last_check_error_at: now() }), "Couldn't save the check status").catch(quiet);
}

/**
 * Check enabled feeds (or just `feedIds`): read each site's robots.txt, then
 * fetch the feeds it allows, then store competitions we haven't seen.
 * Item pages are never fetched.
 */
export function checkFeeds(feedIds?: string[]): Promise<CheckSummary> {
  if (checking) return checking;
  const run = (async (): Promise<CheckSummary> => {
    feedResource.setState({ loading: true });
    try {
      const feeds: StoredFeed[] = (rootDoc?.feeds ?? []).filter((f) => f.enabled && (!feedIds || feedIds.includes(f.id)));
      if (!feeds.length) return { newItems: 0, checked: 0, problems: [] };
      const mcp = await capability("mcp");
      if (!mcp) throw new ConnectorProblem("not_granted", "Connectors aren't available in this view of Comper. Open it in Claude.");

      // robots.txt is re-read at most once a day per feed (RFC 9309 allows caching for 24 hours).
      const dayAgo = Date.now() - 86_400_000;
      const recentlyAllowed = (f: StoredFeed) => !!f.robots_ok_at && new Date(f.robots_ok_at).getTime() > dayAgo;
      const robotsUrls = [...new Set(feeds.filter((f) => !recentlyAllowed(f)).map((f) => new URL("/robots.txt", f.url).toString()))];
      let robots = new Map<string, FetchResult>();
      try {
        if (robotsUrls.length) robots = await fetchUrls(mcp, robotsUrls, "The robots.txt rules for crawlers");
      } catch (error) {
        await noteCheckFailure();
        throw error;
      }
      const verdicts = new Map<string, RobotsVerdict>(
        feeds.map((f) => [
          f.id,
          recentlyAllowed(f) ? { allowed: true } : robotsVerdict(f.url, robots.get(urlKey(new URL("/robots.txt", f.url).toString()))),
        ]),
      );
      const allowed = feeds.filter((f) => verdicts.get(f.id)?.allowed);
      let fetched = new Map<string, FetchResult>();
      try {
        if (allowed.length) fetched = await fetchUrls(mcp, allowed.map((f) => f.url), FEED_OBJECTIVE);
      } catch (error) {
        await noteCheckFailure();
        throw error;
      }

      const at = now();
      const robotsOkAt = (f: StoredFeed) => (recentlyAllowed(f) ? f.robots_ok_at : at);
      const results = new Map<string, Partial<StoredFeed>>();
      const fresh: (CompetitionDraft & { id: string })[] = [];
      const problems: CheckSummary["problems"] = [];
      const pages: { feed: Feed; content: string }[] = [];

      const ingest = (feed: Feed, parsed: ParsedFeed) => {
        const drafts = dedupeByUrl(
          parsed.items.map((item) => itemToCompetition(item, { id: feed.id, name: feed.name })).filter((d): d is CompetitionDraft => d !== null),
        );
        const newOnes = drafts
          .map((d) => ({ ...d, id: competitionId(d.url) }))
          .filter((d) => !comps.has(d.id) && !fresh.some((f) => f.id === d.id));
        fresh.push(...newOnes);
        return newOnes.length;
      };
      const fail = (feed: Feed, message: string) => {
        results.set(feed.id, { last_status: "error" as FeedStatus, last_error: message, last_new_items: 0, last_fetched_at: at });
        problems.push({ feed: feed.name, message });
      };

      for (const feed of feeds) {
        const verdict = verdicts.get(feed.id)!;
        if (!verdict.allowed) {
          results.set(feed.id, { last_status: "blocked_by_robots", last_error: verdict.reason, last_new_items: 0, last_fetched_at: at });
          problems.push({ feed: feed.name, message: verdict.reason });
          continue;
        }
        const res = fetched.get(urlKey(feed.url));
        if (!res || res.content === undefined) {
          fail(feed, res?.status ? `The feed returned HTTP ${res.status}` : `Couldn't fetch the feed (${res?.error ?? "no response"})`);
          continue;
        }
        try {
          const added = ingest(feed, parseFetchedFeed(res.content));
          results.set(feed.id, { last_status: "ok", last_error: null, last_new_items: added, last_fetched_at: at, robots_ok_at: robotsOkAt(feed) });
        } catch (error) {
          if (error instanceof NotAFeedError) pages.push({ feed, content: res.content });
          else fail(feed, error instanceof Error ? error.message : String(error));
        }
      }

      // Addresses that turned out to be ordinary pages: look for the site's feed and remember it.
      for (const { feed, content } of pages.slice(0, 3)) {
        const robotsUrl = new URL("/robots.txt", feed.url).toString();
        let robotsResult = robots.get(urlKey(robotsUrl));
        const found = await (async () => {
          robotsResult ??= (await fetchUrls(mcp, [robotsUrl], "The robots.txt rules for crawlers")).get(urlKey(robotsUrl));
          return findFeedOnSite(mcp, feed.url, content, robotsResult);
        })().catch(async (error) => {
          if (error instanceof ConnectorProblem) {
            await noteCheckFailure();
            throw error;
          }
          return null;
        });
        if (found) {
          const added = ingest(feed, found.parsed);
          results.set(feed.id, { url: found.url, last_status: "ok", last_error: null, last_new_items: added, last_fetched_at: at, robots_ok_at: at });
        } else {
          fail(feed, `No RSS feed found on ${new URL(feed.url).hostname}. Look for an RSS link on the site and paste that address instead.`);
        }
      }
      for (const { feed } of pages.slice(3)) fail(feed, "This address is a web page, not an RSS feed. It will be looked into on the next check.");

      // Store new competitions a few at a time.
      let stored = 0;
      for (let i = 0; i < fresh.length; i += 4) {
        const batch = fresh.slice(i, i + 4);
        const done = await Promise.allSettled(
          batch.map(({ id, ...draft }) => serial(id, () => compRef(id).set({ ...draft, created_at: at, manual: false, entry: null }))),
        );
        stored += done.filter((d) => d.status === "fulfilled").length;
        const failed = done.find((d): d is PromiseRejectedResult => d.status === "rejected");
        if (failed) {
          problems.push({ feed: "Saving", message: describeDbError(failed.reason) });
          break;
        }
      }

      await updateRoot(
        (r) => ({
          last_refresh_at: at,
          last_check_error_at: null,
          feeds: r.feeds.map((f) => (results.has(f.id) ? { ...f, ...results.get(f.id) } : f)),
        }),
        "Couldn't save the feed status",
      ).catch(quiet);
      await pruneOld().catch(quiet);
      return { newItems: stored, checked: feeds.length, problems };
    } finally {
      feedResource.setState({ loading: false });
    }
  })();
  // Clear the in-progress marker only after it has been set (the run can finish synchronously).
  checking = run;
  run.then(
    () => undefined,
    () => undefined,
  ).finally(() => {
    if (checking === run) checking = null;
  });
  return run;
}

/** Fetch and parse one feed without saving anything: "Test feed" in Settings. */
export async function previewFeed(url: string) {
  const mcp = await capability("mcp");
  if (!mcp) throw new ConnectorProblem("not_granted", "Connectors aren't available in this view of Comper. Open it in Claude.");
  const robotsUrl = new URL("/robots.txt", url).toString();
  const robots = (await fetchUrls(mcp, [robotsUrl], "The robots.txt rules for crawlers")).get(urlKey(robotsUrl));
  const verdict = robotsVerdict(url, robots);
  if (!verdict.allowed) return { ok: false as const, blockedByRobots: true, error: verdict.reason };
  const res = (await fetchUrls(mcp, [url], FEED_OBJECTIVE)).get(urlKey(url));
  if (!res || res.content === undefined) {
    return { ok: false as const, blockedByRobots: false, error: res?.status ? `The feed returned HTTP ${res.status}` : "Couldn't fetch that URL" };
  }

  let feedUrl = url;
  let parsed: ParsedFeed;
  try {
    parsed = parseFetchedFeed(res.content);
  } catch (error) {
    if (!(error instanceof NotAFeedError)) {
      return { ok: false as const, blockedByRobots: false, error: error instanceof Error ? error.message : String(error) };
    }
    const found = await findFeedOnSite(mcp, url, res.content, robots);
    if (!found) {
      return {
        ok: false as const,
        blockedByRobots: false,
        error: `That's a web page, and no RSS feed turned up on ${new URL(url).hostname}. Look for an RSS link on the site and paste that address.`,
      };
    }
    feedUrl = found.url;
    parsed = found.parsed;
  }

  const drafts = parsed.items
    .map((item) => itemToCompetition(item, { id: null, name: parsed.title || new URL(feedUrl).hostname }))
    .filter((d): d is CompetitionDraft => d !== null);
  return {
    ok: true as const,
    feedUrl,
    resolved: feedUrl !== url,
    title: parsed.title,
    itemCount: parsed.items.length,
    openCount: drafts.length,
    sample: drafts.slice(0, 5),
  };
}

/** Keep the store small: drop competitions that closed 30+ days ago unless you entered or won them. */
async function pruneOld() {
  const cutoff = Date.now() - 30 * 86_400_000;
  const won = new Set(wins.map((w) => w.competition_id).filter(Boolean));
  const old = [...comps]
    .filter(([id, d]) => d.closes_at && new Date(d.closes_at).getTime() < cutoff && d.entry?.status !== "entered" && !won.has(id))
    .slice(0, 100);
  for (const [id] of old) await serial(id, () => compRef(id).delete());
}

feedResource.setRefresh(async () => {
  try {
    const summary = await checkFeeds();
    reportCheck(summary);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), { tone: "error", durationMs: 6000 });
  }
});

export function reportCheck(summary: CheckSummary) {
  if (!summary.checked) {
    toast("Add a feed in Settings first");
    return;
  }
  if (summary.problems.length) {
    toast(`${summary.newItems} new · ${summary.problems.length} feed${summary.problems.length === 1 ? "" : "s"} had a problem (see Settings)`, {
      tone: summary.newItems ? "success" : "error",
      durationMs: 5000,
    });
  } else {
    toast(summary.newItems ? `${summary.newItems} new competition${summary.newItems === 1 ? "" : "s"}` : "No new competitions", {
      tone: summary.newItems ? "success" : "default",
    });
  }
}
