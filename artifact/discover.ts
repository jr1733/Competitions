import { itemToCompetition, type CompetitionDraft } from "@/lib/feed/normalise";
import { capability, type McpError, type McpNs } from "./claude";
import { callConnector, ConnectorProblem, connectorMessage, fetchRobots, fetchUrls, readFeeds, robotsVerdict, urlKey } from "./data";
import { COMMON_FEED_PAGES, COMMON_FEED_PATHS, feedLinksInPage, isFeedishUrl, isOffTopicFeed, looksLikeCompetitions, looksLikePrizeDraws } from "./fetched-feed";
import { feedlySearchUrl, parseDirectory, routeUrl, type DirectoryHit, type FeedRoute } from "./readers";
import type { ParsedFeed } from "@/lib/feed/parse";

export { looksLikeCompetitions };

/**
 * "Find feeds for me": search Feedly's public directory of RSS feeds for UK
 * competition feeds, check each site's robots.txt, then read the feeds it
 * allows to show what's in them. If the directory can't be searched, fall
 * back to looking for feeds on UK comping sites themselves. Nothing is
 * saved: the viewer picks which feeds to add.
 */

export const SEARCH_TOOL = "web_search";

export interface SearchHit {
  url: string;
  title?: string | null;
  excerpts?: string[] | null;
}

export interface FeedCandidate {
  url: string;
  title: string;
  site: string;
  siteUrl: string;
  /** The feed was read just now, so the counts and sample are real. */
  verified: boolean;
  /** How it was read. */
  via: FeedRoute | null;
  itemCount: number;
  openCount: number;
  sample: string[];
  /** From the feed directory, when found there. */
  description?: string;
  followers?: number;
}

// Sites that are never competition feeds.
const SKIP_HOSTS =
  /(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|reddit|wikipedia|google|pinterest|linkedin|amazon|ebay|apple|threads|bsky)\.[a-z.]+$/i;

const FEED_URL = /https?:\/\/[^\s<>"'()[\]|]+?(?:\/feed\/?|\/rss(?:\.xml)?\/?|\/atom(?:\.xml)?|\/feed\.xml|\.rss)(?=[\s<>"'()[\]|,]|$)/gi;


function isFeedUrl(url: string): boolean {
  FEED_URL.lastIndex = 0;
  return FEED_URL.test(url);
}

/** Sites to look at, and any feed URLs mentioned outright, from search results. */
export function candidatesFromSearch(hits: SearchHit[], maxSites = 8): { origins: string[]; direct: string[] } {
  const origins: string[] = [];
  const direct: string[] = [];
  for (const hit of hits) {
    let url: URL;
    try {
      url = new URL(hit.url);
    } catch {
      continue;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || SKIP_HOSTS.test(url.hostname)) continue;
    if (isFeedUrl(hit.url) && !direct.includes(hit.url)) direct.push(hit.url);
    for (const text of [hit.title ?? "", ...(hit.excerpts ?? [])]) {
      for (const match of text.matchAll(FEED_URL)) {
        try {
          if (!SKIP_HOSTS.test(new URL(match[0]).hostname) && !direct.includes(match[0])) direct.push(match[0]);
        } catch {
          // not a URL
        }
      }
    }
    if (origins.length < maxSites && !origins.includes(url.origin)) origins.push(url.origin);
  }
  return { origins, direct: direct.slice(0, 6) };
}

/** Feed URLs to try: ones seen in the results first, then the common paths on each site. At most `limit`. */
export function feedUrlsToTry(origins: string[], direct: string[], limit = 20): string[] {
  const urls: string[] = [];
  const add = (u: string) => {
    if (urls.length < limit && !urls.some((x) => urlKey(x) === urlKey(u))) urls.push(u);
  };
  direct.forEach(add);
  for (const path of COMMON_FEED_PATHS.slice(0, 2)) for (const origin of origins) add(origin + path);
  return urls;
}

async function searchWeb(mcp: McpNs): Promise<SearchHit[]> {
  const input = {
    objective: "UK prize competition listing sites and comping blogs that publish an RSS feed of new free competitions",
    search_queries: ["UK competitions RSS feed", "UK comping blog free competitions", "free prize draws UK new competitions", "win prizes UK competitions list"],
  };
  try {
    const payload = await callConnector<{ results?: SearchHit[] }>(mcp, SEARCH_TOOL, input);
    return payload.results ?? [];
  } catch (error) {
    const e = error as McpError;
    throw new ConnectorProblem(e.code ?? "upstream_error", connectorMessage(e));
  }
}

const originOf = (url: string) => new URL(url).origin;

/**
 * Well-known UK comping sites, tried alongside whatever the search finds.
 * These are only starting points: each is still checked for robots.txt and
 * must actually serve a competition feed before it's shown.
 */
export const KNOWN_SITES = [
  "https://www.theprizefinder.com",
  "https://www.loquax.co.uk",
  "https://www.competitiondatabase.co.uk",
  "https://www.superlucky.me",
  "https://www.competitions-time.co.uk",
  "https://felixcompetitions.uk",
  "https://winninguk.co.uk",
];

const STOP_CODES = new Set(["rate_limited", "not_granted", "capability_disabled", "capability_removed", "not_in_manifest", "server_not_connected", "server_not_found", "needs_reauth", "selection_required", "blocked_by_policy", "approval_required"]);

export interface DiscoveryResult {
  feeds: FeedCandidate[];
  /** Feedly's directory couldn't be searched, so only comping sites themselves were checked. */
  directorySkipped: boolean;
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/**
 * Searches of Feedly's directory. It finds little for phrases ("uk
 * competitions" returns nothing), so: single topic words, then UK comping
 * sites and blogs by address, which it matches reliably.
 */
export const DIRECTORY_QUERIES = ["comping", "giveaways", "competitions", "freebies", "prize draws"];

export const DIRECTORY_SITES = [
  ...KNOWN_SITES.map((site) => bareHost(new URL(site).hostname)),
  "latestfreestuff.co.uk",
  "pixieprizes.co.uk",
  "prizeparadise.co.uk",
  "magicfreebiesuk.co.uk",
  "compersnews.com",
  "competitionsguide.co.uk",
  "ukcompetitions.org",
];

/**
 * UK competition feeds checked by hand (7 Oct 2026): robots.txt allows
 * them and their items are free prize draws. Always read alongside what
 * the directory finds, since Feedly lists only some of them. Each address
 * is the form that read cleanly: Feedly knows ThePrizeFinder's first two
 * by their http:// address; the other two read through rss2json.
 */
export const KNOWN_FEEDS: DirectoryHit[] = [
  ["http://www.theprizefinder.com/feed/new-competitions", "ThePrizeFinder: New competitions"],
  ["http://www.theprizefinder.com/feed/top-prizes", "ThePrizeFinder: Top prizes"],
  ["https://www.theprizefinder.com/feed/closing-soon", "ThePrizeFinder: Closing soon"],
  ["https://www.latestfreestuff.co.uk/free-competitions/feed/", "Latest Free Stuff: Free competitions"],
].map(([feedUrl, title]) => ({
  feedUrl,
  title,
  website: new URL(feedUrl).origin.replace(/^http:/, "https:"),
  description: "",
  subscribers: 0,
  lastUpdated: null,
  language: "en",
  topics: [],
}));

export function directorySearchUrls(): string[] {
  return [...DIRECTORY_QUERIES.map((q) => feedlySearchUrl(q, 10)), ...DIRECTORY_SITES.map((site) => feedlySearchUrl(site, 5))].slice(0, 20);
}

const DIRECTORY_OBJECTIVE = "Every feed in this list: feedId, title, website, description, subscribers, lastUpdated";

/** Words in a feed's title or description that point to prize draws. */
const PRIZE_TEXT = /\b(comping|compers?|giveaways?|prize draws?|freebies|sweepstakes|win)\b/i;
const COMPETITION_TEXT = /\bcompetitions\b/i;

export type HitStrength = "known" | "strong" | "weak";

const UK_TEXT = /\.uk\b|\buk\b|\bbritish\b|\bbritain\b|£/i;

/**
 * How sure the directory entry alone makes us: a known UK comping site,
 * prize-draw words, or just "competitions". Anything else needs to say
 * it's British and mustn't be about software, deals, design and so on.
 */
export function hitStrength(hit: DirectoryHit): HitStrength | null {
  const known = new Set(DIRECTORY_SITES);
  let host: string;
  let siteHost: string;
  try {
    host = bareHost(new URL(hit.feedUrl).hostname);
    siteHost = hit.website ? bareHost(new URL(hit.website).hostname) : host;
  } catch {
    return null;
  }
  if (known.has(host) || known.has(siteHost)) return "known";
  const text = `${hit.title} ${hit.description}`;
  if (isOffTopicFeed(`${text} ${(hit.topics ?? []).join(" ")}`)) return null;
  if (!UK_TEXT.test(`${text} ${hit.website ?? ""} ${hit.feedUrl}`)) return null;
  if (PRIZE_TEXT.test(text)) return "strong";
  if (COMPETITION_TEXT.test(`${text} ${hit.website ?? ""} ${hit.feedUrl}`)) return "weak";
  return null;
}

/**
 * Directory results worth reading: English, still updated in the last 90
 * days, about prize draws (or from a known comping site), not about another
 * kind of competition, and not already added. Known sites first, then UK
 * ones, then by followers.
 */
export function pickDirectoryHits(hits: DirectoryHit[], existing: Set<string>, max = 12, nowMs = Date.now()): DirectoryHit[] {
  const seen = new Set<string>();
  const scored: { hit: DirectoryHit; score: number }[] = [];
  for (const hit of hits) {
    let host: string;
    let siteHost: string;
    try {
      host = bareHost(new URL(hit.feedUrl).hostname);
      siteHost = hit.website ? bareHost(new URL(hit.website).hostname) : host;
    } catch {
      continue;
    }
    if (SKIP_HOSTS.test(host) || SKIP_HOSTS.test(siteHost)) continue;
    const key = urlKey(hit.feedUrl);
    if (seen.has(key) || existing.has(key)) continue;
    seen.add(key);
    if (hit.language && !/^en/i.test(hit.language)) continue;
    if (hit.lastUpdated && nowMs - hit.lastUpdated > 90 * 86_400_000) continue;
    const strength = hitStrength(hit);
    if (!strength) continue;
    const text = `${hit.title} ${hit.description} ${hit.website ?? ""} ${hit.feedUrl}`;
    const uk = /\.uk\b|\buk\b|\bbritish\b|\bbritain\b/i.test(text);
    const rank = { known: 2e9, strong: 1e9, weak: 0 }[strength];
    scored.push({ hit, score: rank + (uk ? 1e8 : 0) + Math.min(hit.subscribers, 1e7) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.hit);
}

/** Search Feedly's directory (one call; one more through Jina Reader if Parallel can't read Feedly's answer). */
async function searchDirectory(mcp: McpNs): Promise<DirectoryHit[]> {
  const urls = directorySearchUrls();
  const collect = (fetched: Map<string, { content?: string }>, asked: string[]) =>
    asked.flatMap((u) => {
      const content = fetched.get(urlKey(u))?.content;
      return content ? parseDirectory(content) : [];
    });
  let hits = collect(await fetchUrls(mcp, urls, DIRECTORY_OBJECTIVE, { detail: true }), urls);
  if (!hits.length) {
    const viaJina = urls.map((u) => routeUrl("jina", u));
    hits = collect(await fetchUrls(mcp, viaJina, DIRECTORY_OBJECTIVE, { detail: true }), viaJina);
  }
  return hits;
}

function candidate(
  url: string,
  parsed: ParsedFeed | undefined,
  via: FeedRoute | null,
  extra: { title?: string; siteUrl?: string | null; description?: string; followers?: number } = {},
): FeedCandidate {
  const siteUrl = extra.siteUrl ?? originOf(url);
  const site = bareHost(new URL(siteUrl).hostname);
  const title = (extra.title || parsed?.title || site).slice(0, 80);
  const drafts = (parsed?.items ?? [])
    .map((item) => itemToCompetition(item, { id: null, name: title }))
    .filter((d): d is CompetitionDraft => d !== null);
  return {
    url,
    title,
    site,
    siteUrl,
    verified: !!parsed,
    via,
    itemCount: parsed?.items.length ?? 0,
    openCount: drafts.length,
    sample: drafts.slice(0, 3).map((d) => d.prize),
    description: extra.description ? extra.description.slice(0, 200) : undefined,
    followers: extra.followers,
  };
}

/**
 * Check robots.txt for each directory hit's site, then read the feeds it
 * allows (through Feedly first, since it found them). Feeds that read but
 * aren't about competitions are dropped; ones that couldn't be read are kept,
 * unverified, so they can still be added.
 */
async function readDirectoryHits(mcp: McpNs, hits: DirectoryHit[], onProgress: (message: string) => void): Promise<FeedCandidate[]> {
  const origins = [...new Set(hits.map((h) => originOf(h.feedUrl)))];
  onProgress(`Found ${hits.length} likely feeds. Checking robots.txt on ${origins.length} sites…`);
  const robots = await fetchRobots(mcp, origins);
  const allowed = hits.filter((h) => robotsVerdict(h.feedUrl, robots.get(urlKey(`${originOf(h.feedUrl)}/robots.txt`))).allowed);
  if (!allowed.length) return [];

  onProgress(`Reading ${allowed.length} feed${allowed.length === 1 ? "" : "s"}…`);
  const reads = await readFeeds(
    mcp,
    allowed.map((h) => ({ url: h.feedUrl })),
    { detail: true, first: "feedly", count: 10, maxFallback: 6 },
  );
  const out: FeedCandidate[] = [];
  for (const hit of allowed) {
    const read = reads.get(urlKey(hit.feedUrl));
    const parsed = read?.parsed?.items.length ? read.parsed : undefined;
    // Read: keep it only if its items are prize draws. Unread: only if the directory entry says so clearly.
    if (parsed ? !looksLikePrizeDraws(parsed.items) || isOffTopicFeed(parsed.title) : hitStrength(hit) === "weak") continue;
    out.push(
      candidate(hit.feedUrl, parsed, parsed ? (read?.via ?? null) : null, {
        title: hit.title,
        siteUrl: hit.website,
        description: hit.description,
        followers: hit.subscribers,
      }),
    );
  }
  return out;
}

export async function discoverFeeds(existingUrls: string[], onProgress: (message: string) => void): Promise<DiscoveryResult> {
  const mcp = await capability("mcp");
  if (!mcp) throw new ConnectorProblem("not_granted", "Connectors aren't available in this view of Comper. Open it in Claude.");
  const existing = new Set(existingUrls.map(urlKey));

  onProgress("Searching Feedly's directory of RSS feeds…");
  let directorySkipped = false;
  let found: FeedCandidate[] = [];
  let listed: DirectoryHit[] = [];
  try {
    listed = await searchDirectory(mcp);
  } catch (error) {
    if (error instanceof ConnectorProblem && STOP_CODES.has(error.code)) throw error;
    directorySkipped = true;
  }
  // The hand-checked feeds are read even when the directory doesn't answer.
  const hits = pickDirectoryHits([...KNOWN_FEEDS, ...listed], existing);
  try {
    if (hits.length) found = await readDirectoryHits(mcp, hits, onProgress);
  } catch (error) {
    if (error instanceof ConnectorProblem && STOP_CODES.has(error.code)) throw error;
  }
  if (!found.length) {
    found = await discoverOnSites(mcp, existing, onProgress);
    directorySkipped = true;
  }
  const order = (c: FeedCandidate) => (c.verified ? 1e9 : 0) + c.openCount * 1e4 + Math.min(c.followers ?? 0, 9999);
  return { feeds: found.sort((a, b) => order(b) - order(a)), directorySkipped };
}

/** The fallback: look for feeds on UK comping sites (from a web search and the well-known list). */
async function discoverOnSites(mcp: McpNs, existing: Set<string>, onProgress: (message: string) => void): Promise<FeedCandidate[]> {
  onProgress("Searching the web for UK competition sites…");
  // The search is a bonus: if it fails, carry on with the well-known sites.
  let hits: SearchHit[] = [];
  try {
    hits = await searchWeb(mcp);
  } catch (error) {
    if (error instanceof ConnectorProblem && STOP_CODES.has(error.code)) throw error;
  }
  const { origins, direct } = candidatesFromSearch(hits);
  const sites = [...new Set([...KNOWN_SITES, ...origins, ...direct.map(originOf)])].slice(0, 12);

  onProgress(`Checking robots.txt on ${sites.length} sites…`);
  const robots = await fetchRobots(mcp, sites);
  const allowed = (u: string) => !existing.has(urlKey(u)) && robotsVerdict(u, robots.get(urlKey(`${originOf(u)}/robots.txt`))).allowed;
  // Feed links can point at other hosts (FeedBurner…): read their robots.txt before fetching.
  const learnRobots = async (urls: string[]) => {
    const missing = [...new Set(urls.map(originOf))].filter((o) => !robots.has(urlKey(`${o}/robots.txt`)));
    if (!missing.length) return;
    const more = await fetchRobots(mcp, missing);
    for (const o of missing) {
      const key = urlKey(`${o}/robots.txt`);
      robots.set(key, more.get(key) ?? { url: `${o}/robots.txt`, error: "no answer" });
    }
  };

  const tried = new Set<string>();
  const feeds: { url: string; parsed: ParsedFeed; via: FeedRoute | null }[] = [];
  const pages = new Map<string, string>();
  const probe = async (urls: string[]) => {
    const batch = urls.filter((u) => !tried.has(urlKey(u)) && allowed(u));
    batch.forEach((u) => tried.add(urlKey(u)));
    if (!batch.length) return;
    // Addresses that look like feeds but can't be read directly are read through the feed readers.
    const reads = await readFeeds(
      mcp,
      batch.map((url) => ({ url })),
      { detail: true, fallback: isFeedishUrl },
    );
    for (const read of reads.values()) {
      if (read.parsed?.items.length) feeds.push({ url: read.url, parsed: read.parsed, via: read.via ?? null });
      else if (read.page !== undefined) pages.set(read.url, read.page);
    }
  };
  const sitesWithFeeds = () => new Set(feeds.map((f) => originOf(f.url)));

  // 1. Feed addresses mentioned in the results, and each site's "RSS feeds" pages.
  onProgress("Looking for each site's RSS feeds page…");
  await probe([...direct, ...sites.flatMap((o) => COMMON_FEED_PAGES.map((p) => o + p))]);

  // 2. The feeds those pages list.
  const listed = [...new Set([...pages].flatMap(([url, content]) => feedLinksInPage(content, url).feeds))].filter((u) => !tried.has(urlKey(u)));
  if (listed.length) {
    onProgress(`Reading ${listed.length} feed${listed.length === 1 ? "" : "s"} listed on those pages…`);
    await learnRobots(listed);
    await probe(listed);
  }

  // 3. The usual feed addresses, on sites that still have none.
  const remaining = sites.filter((o) => !sitesWithFeeds().has(o));
  if (remaining.length) {
    onProgress(`Trying the usual feed addresses on ${remaining.length} sites…`);
    await probe(remaining.flatMap((o) => COMMON_FEED_PATHS.slice(0, 2).map((p) => o + p)));
  }

  // /feed/ and /rss are often the same feed: keep one per site and content.
  const unique = new Map<string, FeedCandidate>();
  for (const { url, parsed, via } of feeds) {
    if (!looksLikePrizeDraws(parsed.items) || isOffTopicFeed(parsed.title)) continue;
    const signature = `${bareHost(new URL(url).hostname)}|${parsed.items[0]?.link ?? ""}`;
    if (!unique.has(signature)) unique.set(signature, candidate(url, parsed, via));
  }
  return [...unique.values()];
}
