import { parseFeed, type ParsedFeed, type RawFeedItem } from "@/lib/feed/parse";
import { parseFetchedFeed } from "./fetched-feed";

/**
 * Ways to read an RSS feed through the connector.
 *
 * Parallel Search reads some feeds itself, but answers "fetch_error" for
 * many others (most WordPress feeds among them). The same feed can then be
 * read through a feed-reader service instead: Feedly's public API and
 * rss2json return the feed's items as JSON, and Jina Reader returns the
 * feed as text. Every route reads only the RSS feed; no site pages are
 * scraped, and the site's robots.txt is still checked first.
 */
export type FeedRoute = "direct" | "feedly" | "rss2json" | "jina";

export const ROUTE_ORDER: FeedRoute[] = ["direct", "feedly", "rss2json", "jina"];

export const ROUTE_LABEL: Record<FeedRoute, string> = {
  direct: "directly",
  feedly: "through Feedly",
  rss2json: "through rss2json",
  jina: "through Jina Reader",
};

export function isFeedRoute(value: unknown): value is FeedRoute {
  return typeof value === "string" && (ROUTE_ORDER as string[]).includes(value);
}

/** The address to fetch to read `feedUrl` by `route`. */
export function routeUrl(route: FeedRoute, feedUrl: string, count = 40): string {
  switch (route) {
    case "direct":
      return feedUrl;
    case "feedly":
      return `https://cloud.feedly.com/v3/streams/contents?streamId=${encodeURIComponent(`feed/${feedUrl}`)}&count=${count}`;
    case "rss2json":
      return `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
    case "jina":
      return `https://r.jina.ai/${feedUrl}`;
  }
}

/** Feedly's feed directory: feeds matching a word, a site's name or its address. */
export function feedlySearchUrl(query: string, count = 10): string {
  return `https://cloud.feedly.com/v3/search/feeds?query=${encodeURIComponent(query)}&count=${count}&locale=en-GB`;
}

// ---------------------------------------------------------------------------
// Reading what came back
// ---------------------------------------------------------------------------

/** JSON inside fetched text: bare, in a code fence, after a header, or with markdown escapes added. */
export function jsonIn(content: string): unknown {
  const text = content.trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  const between = (open: string, close: string) => {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
  };
  for (const candidate of [text, between("{", "}"), between("[", "]")]) {
    if (!candidate) continue;
    for (const variant of [candidate, candidate.replace(/\\([^"\\/bfnrtu])/g, "$1")]) {
      try {
        return JSON.parse(variant);
      } catch {
        // try the next form
      }
    }
  }
  return null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

interface FeedlyEntry {
  title?: string;
  canonicalUrl?: string;
  alternate?: { href?: string }[];
  originId?: string;
  published?: number;
  crawled?: number;
  summary?: { content?: string };
  content?: { content?: string };
  keywords?: string[];
}

/** Feedly's /v3/streams/contents answer. */
function fromFeedly(data: { title?: unknown; items?: unknown }): ParsedFeed | null {
  if (!Array.isArray(data.items)) return null;
  const items: RawFeedItem[] = [];
  for (const entry of data.items as FeedlyEntry[]) {
    const link = str(entry.canonicalUrl) || str(entry.alternate?.find((a) => /^https?:/.test(str(a?.href)))?.href) || (/^https?:/.test(str(entry.originId)) ? str(entry.originId) : "");
    if (!link || !str(entry.title)) continue;
    const when = entry.published ?? entry.crawled;
    items.push({
      title: str(entry.title),
      link,
      html: str(entry.content?.content) || str(entry.summary?.content),
      categories: Array.isArray(entry.keywords) ? entry.keywords.filter((k): k is string => typeof k === "string") : [],
      publishedAt: typeof when === "number" ? new Date(when).toUTCString() : null,
      dateHints: [],
    });
  }
  return items.length ? { format: "rss", title: str(data.title), items } : null;
}

interface Rss2JsonItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  content?: string;
  categories?: unknown[];
}

/** rss2json's /v1/api.json answer. Its dates are UTC without a zone ("2026-10-06 10:00:00"). */
function fromRss2Json(data: { status?: unknown; feed?: { title?: unknown }; items?: unknown }): ParsedFeed | null {
  if (data.status !== "ok" || !Array.isArray(data.items)) return null;
  const items: RawFeedItem[] = [];
  for (const entry of data.items as Rss2JsonItem[]) {
    if (!str(entry.link) || !str(entry.title)) continue;
    const date = str(entry.pubDate);
    items.push({
      title: str(entry.title),
      link: str(entry.link),
      html: str(entry.content) || str(entry.description),
      categories: (entry.categories ?? []).filter((c): c is string => typeof c === "string"),
      publishedAt: date ? (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(date) ? `${date.replace(" ", "T")}Z` : date) : null,
      dateHints: [],
    });
  }
  return items.length ? { format: "rss", title: str(data.feed?.title), items } : null;
}

const XML_START = /<\?xml|<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]/i;

/**
 * Parse a feed however it came back: Parallel's markdown rendering, raw
 * XML (possibly after a reader's header), or a reader's JSON. Throws
 * NotAFeedError when it's an ordinary page or a reader had no items.
 */
export function parseAnyFeed(content: string): ParsedFeed {
  const text = content.trim();
  if (/^(```[a-z]*\s*)?[{[]/i.test(text) || /Markdown Content:\s*\n\s*[{[]/i.test(text.slice(0, 1500))) {
    const data = jsonIn(text);
    if (data && typeof data === "object") {
      const parsed = fromFeedly(data as never) ?? fromRss2Json(data as never);
      if (parsed) return parsed;
    }
  }
  // Raw XML near the top (Jina Reader puts a short header first).
  const at = text.slice(0, 2000).search(XML_START);
  if (at > 0) {
    try {
      const parsed = parseFeed(text.slice(at));
      if (parsed.items.length) return parsed;
    } catch {
      // not a whole feed: fall through
    }
  }
  return parseFetchedFeed(text);
}

/**
 * A reader's copy that has stopped updating: its newest item is over 45
 * days old. Feedly keeps serving its last copy of a feed it no longer
 * polls (ThePrizeFinder's "Closing soon" was months behind), so another
 * route is tried instead.
 */
export function isStale(feed: ParsedFeed, nowMs = Date.now()): boolean {
  const times = feed.items.map((i) => (i.publishedAt ? Date.parse(i.publishedAt) : NaN)).filter((t) => !Number.isNaN(t));
  return times.length > 0 && Math.max(...times) < nowMs - 45 * 86_400_000;
}

// ---------------------------------------------------------------------------
// Feedly's feed directory
// ---------------------------------------------------------------------------

export interface DirectoryHit {
  feedUrl: string;
  title: string;
  website: string | null;
  description: string;
  subscribers: number;
  /** When Feedly last saw a new item, if it says. */
  lastUpdated: number | null;
  language: string | null;
  /** Feedly's topics for the feed, e.g. "software", "deals", "architecture". */
  topics: string[];
}

interface FeedlySearchResult {
  feedId?: string;
  id?: string;
  title?: string;
  website?: string;
  description?: string;
  subscribers?: number;
  lastUpdated?: number;
  updated?: number;
  language?: string;
  topics?: unknown[];
}

function hitFrom(r: FeedlySearchResult): DirectoryHit | null {
  const id = str(r.feedId) || str(r.id);
  if (!/^feed\/https?:\/\//i.test(id)) return null;
  let when = r.lastUpdated ?? r.updated;
  if (typeof when === "number" && when < 1e12) when *= 1000; // seconds, not milliseconds
  return {
    feedUrl: id.slice(5),
    title: str(r.title).trim(),
    website: /^https?:\/\//i.test(str(r.website)) ? str(r.website) : null,
    description: str(r.description).replace(/\s+/g, " ").trim(),
    subscribers: typeof r.subscribers === "number" ? r.subscribers : 0,
    lastUpdated: typeof when === "number" ? when : null,
    language: str(r.language) || null,
    topics: Array.isArray(r.topics) ? r.topics.filter((t): t is string => typeof t === "string") : [],
  };
}

/** Feeds listed in a Feedly /v3/search/feeds answer. Falls back to picking fields out of the text. */
export function parseDirectory(content: string): DirectoryHit[] {
  const data = jsonIn(content) as { results?: unknown } | null;
  if (data && Array.isArray(data.results)) {
    return (data.results as FeedlySearchResult[]).map(hitFrom).filter((h): h is DirectoryHit => h !== null);
  }
  const field = (chunk: string, name: string) => {
    const m = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(chunk);
    if (!m) return "";
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1];
    }
  };
  const hits: DirectoryHit[] = [];
  for (const chunk of content.split(/\{\s*(?=[^{}]*"feedId"\s*:)/).slice(1)) {
    const hit = hitFrom({
      feedId: field(chunk, "feedId"),
      title: field(chunk, "title"),
      website: field(chunk, "website"),
      description: field(chunk, "description"),
      subscribers: Number(/"subscribers"\s*:\s*(\d+)/.exec(chunk)?.[1] ?? 0),
      lastUpdated: Number(/"lastUpdated"\s*:\s*(\d+)/.exec(chunk)?.[1]) || undefined,
      language: field(chunk, "language"),
    });
    if (hit) hits.push(hit);
  }
  return hits;
}
