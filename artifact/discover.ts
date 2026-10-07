import { itemToCompetition, type CompetitionDraft } from "@/lib/feed/normalise";
import { capability, type McpError, type McpNs } from "./claude";
import { callConnector, ConnectorProblem, connectorMessage, fetchUrls, robotsVerdict, urlKey } from "./data";
import { looksLikeCompetitions, parseFetchedFeed } from "./fetched-feed";

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

/** Paths most sites use for their main feed (WordPress first: most comping blogs run on it). */
const COMMON_FEED_PATHS = ["/feed/", "/rss"];

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
  for (const path of COMMON_FEED_PATHS) for (const origin of origins) add(origin + path);
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

export async function discoverFeeds(existingUrls: string[], onProgress: (message: string) => void): Promise<FeedCandidate[]> {
  const mcp = await capability("mcp");
  if (!mcp) throw new ConnectorProblem("not_granted", "Connectors aren't available in this view of Comper. Open it in Claude.");
  const existing = new Set(existingUrls.map(urlKey));

  onProgress("Searching the web for UK competition sites…");
  const { origins, direct } = candidatesFromSearch(await searchWeb(mcp));
  if (!origins.length && !direct.length) return [];

  const sites = [...new Set([...origins, ...direct.map(originOf)])].slice(0, 20);
  onProgress(`Checking robots.txt on ${sites.length} site${sites.length === 1 ? "" : "s"}…`);
  const robots = await fetchUrls(mcp, sites.map((o) => `${o}/robots.txt`), "The robots.txt rules for crawlers");

  const toTry = feedUrlsToTry(origins, direct).filter(
    (u) => !existing.has(urlKey(u)) && robotsVerdict(u, robots.get(urlKey(`${originOf(u)}/robots.txt`))).allowed,
  );
  if (!toTry.length) return [];
  onProgress(`Looking for feeds on ${new Set(toTry.map(originOf)).size} sites…`);
  const fetched = await fetchUrls(mcp, toTry, "Every item in this RSS feed: title, link, published date and description");

  const found: (FeedCandidate & { signature: string })[] = [];
  for (const url of toTry) {
    const res = fetched.get(urlKey(url));
    if (!res?.content) continue;
    let parsed;
    try {
      parsed = parseFetchedFeed(res.content);
    } catch {
      continue; // not a feed
    }
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
  return [...unique.values()]
    .map(({ signature: _signature, ...c }) => {
      void _signature;
      return c;
    })
    .sort((a, b) => b.openCount - a.openCount);
}
