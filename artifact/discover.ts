import { itemToCompetition, type CompetitionDraft } from "@/lib/feed/normalise";
import { capability, type McpError, type McpNs } from "./claude";
import { callConnector, ConnectorProblem, connectorMessage, fetchUrls, robotsVerdict, urlKey } from "./data";
import { COMMON_FEED_PAGES, COMMON_FEED_PATHS, feedLinksInPage, looksLikeCompetitions, parseFetchedFeed } from "./fetched-feed";
import type { ParsedFeed } from "@/lib/feed/parse";

export { looksLikeCompetitions };

/**
 * "Find feeds for me": search the web for UK competition sites, then look
 * for their RSS feeds. Only feed URLs are fetched (never ordinary pages), and
 * only on sites whose robots.txt allows it. Nothing is saved: the viewer picks
 * which feeds to add.
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
  itemCount: number;
  openCount: number;
  sample: string[];
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

const FEED_OBJECTIVE = "Every item in this RSS feed: title, link, published date and description";

const STOP_CODES = new Set(["not_granted", "capability_disabled", "capability_removed", "not_in_manifest", "server_not_connected", "server_not_found", "needs_reauth", "selection_required", "blocked_by_policy", "approval_required"]);

export interface DiscoveryResult {
  feeds: FeedCandidate[];
  /** The web search failed, so only the well-known sites were checked. */
  searchSkipped: boolean;
}

export async function discoverFeeds(existingUrls: string[], onProgress: (message: string) => void): Promise<DiscoveryResult> {
  const mcp = await capability("mcp");
  if (!mcp) throw new ConnectorProblem("not_granted", "Connectors aren't available in this view of Comper. Open it in Claude.");
  const existing = new Set(existingUrls.map(urlKey));

  onProgress("Searching the web for UK competition sites…");
  // The search is a bonus: if it fails, carry on with the well-known sites.
  let hits: SearchHit[] = [];
  let searchSkipped = false;
  try {
    hits = await searchWeb(mcp);
  } catch (error) {
    if (error instanceof ConnectorProblem && STOP_CODES.has(error.code)) throw error;
    searchSkipped = true;
  }
  const { origins, direct } = candidatesFromSearch(hits);
  const sites = [...new Set([...KNOWN_SITES, ...origins, ...direct.map(originOf)])].slice(0, 12);

  onProgress(`Checking robots.txt on ${sites.length} sites…`);
  const robots = await fetchUrls(mcp, sites.map((o) => `${o}/robots.txt`), "The robots.txt rules for crawlers");
  const allowed = (u: string) => !existing.has(urlKey(u)) && robotsVerdict(u, robots.get(urlKey(`${originOf(u)}/robots.txt`))).allowed;
  // Feed links can point at other hosts (FeedBurner…): read their robots.txt before fetching.
  const learnRobots = async (urls: string[]) => {
    const missing = [...new Set(urls.map(originOf))].filter((o) => !robots.has(urlKey(`${o}/robots.txt`)));
    if (!missing.length) return;
    const more = await fetchUrls(mcp, missing.map((o) => `${o}/robots.txt`), "The robots.txt rules for crawlers");
    for (const o of missing) {
      const key = urlKey(`${o}/robots.txt`);
      robots.set(key, more.get(key) ?? { url: `${o}/robots.txt`, error: "no answer" });
    }
  };

  const tried = new Set<string>();
  const feeds: { url: string; parsed: ParsedFeed }[] = [];
  const pages = new Map<string, string>();
  const probe = async (urls: string[]) => {
    const batch = urls.filter((u) => !tried.has(urlKey(u)) && allowed(u));
    batch.forEach((u) => tried.add(urlKey(u)));
    if (!batch.length) return;
    const fetched = await fetchUrls(mcp, batch, FEED_OBJECTIVE, { detail: true });
    for (const u of batch) {
      const content = fetched.get(urlKey(u))?.content;
      if (!content) continue;
      try {
        const parsed = parseFetchedFeed(content);
        if (parsed.items.length) feeds.push({ url: u, parsed });
      } catch {
        pages.set(u, content);
      }
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

  const found: (FeedCandidate & { signature: string })[] = [];
  for (const { url, parsed } of feeds) {
    if (!looksLikeCompetitions(parsed.items.map((i) => i.title))) continue;
    const site = new URL(url).hostname.replace(/^www\./, "");
    const drafts = parsed.items
      .map((item) => itemToCompetition(item, { id: null, name: parsed.title || site }))
      .filter((d): d is CompetitionDraft => d !== null);
    found.push({
      url,
      title: (parsed.title || site).slice(0, 80),
      site,
      siteUrl: originOf(url),
      itemCount: parsed.items.length,
      openCount: drafts.length,
      sample: drafts.slice(0, 3).map((d) => d.prize),
      // /feed/ and /rss are often the same feed: keep one per site and content.
      signature: `${site}|${parsed.items[0]?.link ?? ""}`,
    });
  }

  const unique = new Map<string, FeedCandidate & { signature: string }>();
  for (const c of found) if (!unique.has(c.signature)) unique.set(c.signature, c);
  const feedsFound = [...unique.values()]
    .map(({ signature: _signature, ...c }) => {
      void _signature;
      return c;
    })
    .sort((a, b) => b.openCount - a.openCount);
  return { feeds: feedsFound, searchSkipped };
}
