import robotsParser from "robots-parser";
import { isPublicHttpUrl } from "./url";

export const BOT_NAME = "ComperBot";

export function userAgent(): string {
  const site =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  return `${BOT_NAME}/1.0 (personal RSS reader${site ? `; +${site}` : ""})`;
}

const MAX_FEED_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/** Read a response body as text, refusing anything larger than `limit` bytes. */
async function readLimited(res: Response, limit: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (declared && declared > limit) throw new Error(`Response too large (${declared} bytes)`);
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error(`Response too large (over ${limit} bytes)`);
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(buffer);
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

export interface RobotsVerdict {
  allowed: boolean;
  crawlDelaySeconds: number;
  reason?: string;
}

/**
 * Check robots.txt for `url`. Follows RFC 9309: a missing robots.txt (4xx)
 * means everything is allowed. If the server errors or can't be reached, we
 * treat the site as disallowed and try again next run.
 */
export async function checkRobots(url: string, cache?: Map<string, RobotsVerdictSource>): Promise<RobotsVerdict> {
  const origin = new URL(url).origin;
  let source = cache?.get(origin);
  if (!source) {
    source = await fetchRobots(origin);
    cache?.set(origin, source);
  }
  if (source.kind === "unreachable") {
    return { allowed: false, crawlDelaySeconds: 0, reason: `robots.txt unavailable (${source.detail})` };
  }
  if (source.kind === "missing") return { allowed: true, crawlDelaySeconds: 0 };

  const robots = robotsParser(`${origin}/robots.txt`, source.body);
  const allowed = robots.isAllowed(url, BOT_NAME) !== false;
  return {
    allowed,
    crawlDelaySeconds: Math.min(robots.getCrawlDelay(BOT_NAME) ?? 0, 30),
    reason: allowed ? undefined : "Disallowed by robots.txt",
  };
}

export type RobotsVerdictSource =
  | { kind: "found"; body: string }
  | { kind: "missing" }
  | { kind: "unreachable"; detail: string };

async function fetchRobots(origin: string): Promise<RobotsVerdictSource> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": userAgent(), Accept: "text/plain,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status >= 400 && res.status < 500) return { kind: "missing" };
    if (!res.ok) return { kind: "unreachable", detail: `HTTP ${res.status}` };
    return { kind: "found", body: await readLimited(res, 512 * 1024) };
  } catch (error) {
    return { kind: "unreachable", detail: error instanceof Error ? error.message : "network error" };
  }
}

// ---------------------------------------------------------------------------
// Feed download
// ---------------------------------------------------------------------------

export class RobotsBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobotsBlockedError";
  }
}

export type FeedFetchResult =
  | { status: "not_modified"; crawlDelaySeconds: number }
  | { status: "ok"; body: string; etag: string | null; lastModified: string | null; crawlDelaySeconds: number };

/**
 * Download a feed. robots.txt is checked before every request, including
 * each redirect hop, so a redirect can't take us somewhere we aren't allowed.
 */
export async function fetchFeed(
  url: string,
  previous: { etag?: string | null; lastModified?: string | null } = {},
  robotsCache = new Map<string, RobotsVerdictSource>(),
): Promise<FeedFetchResult> {
  const headers: Record<string, string> = {
    "User-Agent": userAgent(),
    Accept: "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1",
  };
  if (previous.etag) headers["If-None-Match"] = previous.etag;
  if (previous.lastModified) headers["If-Modified-Since"] = previous.lastModified;

  let current = url;
  let crawlDelaySeconds = 0;
  for (let hop = 0; hop < 5; hop++) {
    if (!isPublicHttpUrl(current)) throw new Error("Feed URLs must be public http(s) addresses");
    const robots = await checkRobots(current, robotsCache);
    if (!robots.allowed) throw new RobotsBlockedError(robots.reason ?? "Disallowed by robots.txt");
    crawlDelaySeconds = Math.max(crawlDelaySeconds, robots.crawlDelaySeconds);

    const res = await fetch(current, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`HTTP ${res.status} without a Location header`);
      current = new URL(location, current).toString();
      continue;
    }
    if (res.status === 304) return { status: "not_modified", crawlDelaySeconds };
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());

    const type = res.headers.get("content-type") ?? "";
    if (/text\/html/i.test(type)) {
      throw new Error("This URL returned a web page, not an RSS feed. Comper only reads RSS/Atom feeds.");
    }
    return {
      status: "ok",
      body: await readLimited(res, MAX_FEED_BYTES),
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      crawlDelaySeconds,
    };
  }
  throw new Error("Too many redirects");
}
