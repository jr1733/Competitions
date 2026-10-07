import { NotAFeedError, parseFeed, type ParsedFeed, type RawFeedItem } from "@/lib/feed/parse";

/**
 * Parse a feed as returned by the Parallel Search connector's `web_fetch`
 * with `full_content: true`. It usually returns RSS/Atom rendered as
 * markdown:
 *
 *   # Feed title
 *   Feed description
 *
 *   ## Item title
 *   Published: Tue, 06 Oct 2026 04:25:22 GMT  ·  Link: https://…
 *
 *   Item description
 *
 *   ---
 *
 * If it hands back raw XML instead, the normal XML parser is used.
 */
export function parseFetchedFeed(content: string): ParsedFeed {
  const text = content.trim();
  if (/^(<\?xml|<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>])/i.test(text)) return parseFeed(text);

  const lines = text.split(/\r?\n/);
  const title = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "").trim() ?? "";

  // Split into "## " sections.
  const sections: { heading: string; body: string[] }[] = [];
  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) sections.push({ heading: heading[1].trim(), body: [] });
    else if (sections.length) sections[sections.length - 1].body.push(line);
  }

  const items: RawFeedItem[] = [];
  for (const { heading, body } of sections) {
    const joined = body.join("\n");
    const link = /\bLink:\s*(https?:\/\/\S+)/i.exec(joined)?.[1] ?? markdownLink(heading);
    // A section without a Link line is page content, not a feed item.
    if (!/\bLink:/i.test(joined) || !link) continue;

    const published = /\b(?:Published|Updated|Date):\s*(.+?)(?:\s+·|\s{2,}|$)/im.exec(joined)?.[1]?.trim() ?? null;
    const categoriesLine = /^\s*(?:Categories|Category|Tags):\s*(.+)$/im.exec(joined)?.[1] ?? "";
    const description = body
      .filter((l) => !/\bLink:\s*/i.test(l) && !/^\s*(?:Published|Updated|Date|Categories|Category|Tags):/i.test(l))
      .filter((l) => !/^\s*(?:-{3,}|\*{3,})\s*$/.test(l) && !/^\s*https?:\/\/\S+\s*$/.test(l))
      .join("\n")
      .trim();

    items.push({
      title: unescapeMarkdown(stripMarkdownLink(heading)),
      link,
      html: unescapeMarkdown(description),
      categories: categoriesLine
        .split(/[,;|]/)
        .map((c) => c.trim())
        .filter(Boolean),
      publishedAt: published,
      dateHints: [],
    });
  }

  if (!items.length) {
    throw new NotAFeedError("This doesn't look like an RSS feed. Check you've pasted the feed's URL, not a web page.");
  }
  return { format: "rss", title: unescapeMarkdown(title), items };
}

function markdownLink(text: string): string | null {
  return /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/.exec(text)?.[1] ?? null;
}

function stripMarkdownLink(text: string): string {
  return text.replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, "$1");
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1");
}

// ---------------------------------------------------------------------------
// Finding a site's feed from one of its pages
// ---------------------------------------------------------------------------

/** Free prize draws and giveaways: the kind of competition Comper is for. */
const PRIZE_WORDS = /\bwin\b|\bgive-?aways?\b|\bprize draws?\b|\bfree draws?\b|\bsweepstakes?\b|\bup for grabs\b/i;

/**
 * Competitions of another kind: judged on skill or with an entry fee
 * (architecture, writing, hackathons…), or "competition" in another sense
 * (competition law, workers' comp).
 */
const NOT_PRIZE_DRAWS =
  /\barchitect(?:s|ure|ural)?\b|\burban design\b|\bdesign (?:competition|challenge|contest|award)s?\b|\bcall for (?:entries|submissions|proposals|papers|artists|projects)\b|\b(?:entry|registration|submission) fees?\b|\bhackathons?\b|\bantitrust\b|\bmergers?\b|\bcartels?\b|\bworkers'? comp\b|\bscholarships?\b|\bfellowships?\b|\bresidenc(?:y|ies)\b|\bmanuscripts?\b|\bscreenplays?\b|\bshort stor(?:y|ies)\b|\bpoetry\b|\bessay (?:competition|contest|prize)s?\b/i;

/** Feed titles and descriptions that mean a feed is about something else, even if it says "competitions". */
const OFF_TOPIC_FEED =
  /\bdesign\b|\blaw\b|\blegal\b|\bmusic\b|\bgarage\b|\brhetoric\b|\bchess\b|\be-?sports?\b|\bphotograph(?:y|ers?)\b|\bwriting\b|\bwriters?\b|\bstart-?ups?\b|\bprogramming\b|\bcoding\b/i;

const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 400);

/**
 * A feed counts as prize draws when at least 40% of its item titles offer
 * something to win or give away, and under 20% of its items read like
 * skill or paid competitions.
 */
export function looksLikePrizeDraws(items: { title: string; html?: string }[]): boolean {
  if (!items.length) return false;
  const prizes = items.filter((i) => PRIZE_WORDS.test(i.title)).length;
  const others = items.filter((i) => NOT_PRIZE_DRAWS.test(`${i.title} ${plain(i.html ?? "")}`)).length;
  return prizes / items.length >= 0.4 && others / items.length < 0.2;
}

/** The same test from titles alone. */
export function looksLikeCompetitions(titles: string[]): boolean {
  return looksLikePrizeDraws(titles.map((title) => ({ title })));
}

/** Is a feed's title or description about some other kind of competition? */
export function isOffTopicFeed(text: string): boolean {
  return NOT_PRIZE_DRAWS.test(text) || OFF_TOPIC_FEED.test(text);
}

// /feed/, /rss, .xml… and named feeds such as /feed/new-competitions or /rss/top-prizes.
const FEEDISH_PATH = /\/feed\/?$|\/rss(?:\/|\.xml|$)|\.(?:xml|rss|atom)$|\/atom(?:\/|\.xml|$)|\/(?:feed|rss|atom)\/[\w.-]+\/?$/i;
const FEEDISH_QUERY = /[?&](?:feed|format|type)=(?:rss|atom)/i;
const FEED_WORDS = /\b(rss|feeds?|atom)\b/i;

/** Hosts that only serve feeds (FeedBurner and friends). */
const FEED_HOSTS = /(^|\.)(feedburner\.com|feedproxy\.google\.com)$|^feeds?\./i;

/** Does this address look like a feed rather than a page? */
export function isFeedishUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return FEEDISH_PATH.test(u.pathname) || FEEDISH_QUERY.test(u.search) || (FEED_HOSTS.test(u.hostname) && u.pathname.length > 1);
  } catch {
    return false;
  }
}

/** Feed-reader "subscribe" services: never fetched themselves. */
const SUBSCRIBE_SERVICES = /(^|\.)(add\.my\.yahoo\.com|my\.yahoo\.com|feedly\.com|fusion\.google\.com|google\.com|bloglines\.com|netvibes\.com|newsgator\.com|inoreader\.com|theoldreader\.com)$/i;

/** "Add to Yahoo/Google/Feedly" style links carry the feed's own address in the query string. */
function embeddedUrls(url: URL): string[] {
  const out: string[] = [];
  for (const [key, value] of url.searchParams) {
    if (!/^(url|feed|feedurl|rss|uri|u|subscribe)$/i.test(key)) continue;
    let v = value;
    if (/^feed\//i.test(v)) v = v.slice(5); // Feedly: feed/https://…
    if (/^https?:\/\//i.test(v)) out.push(v);
  }
  const feedly = /\/subscription\/feed\/(https?:\/\/.+)$/i.exec(decodeURIComponent(url.pathname));
  if (feedly) out.push(feedly[1]);
  return out;
}

function sameSite(a: string, b: string): boolean {
  const base = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const ha = base(a);
  const hb = base(b);
  return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
}

/**
 * Links on a fetched page (markdown or plain text) that lead to this site's
 * feeds: `feeds` look like feed addresses; `feedPages` are pages about feeds
 * (e.g. "RSS Feeds" in a footer) that may list them.
 */
export function feedLinksInPage(content: string, pageUrl: string): { feeds: string[]; feedPages: string[]; hints: string[] } {
  const page = new URL(pageUrl);
  const feeds: string[] = [];
  const feedPages: string[] = [];
  const hints: string[] = [];
  const consider = (raw: string, text: string, depth = 0) => {
    let url: URL;
    try {
      url = new URL(raw.replace(/[.,;]+$/, ""), page);
    } catch {
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    url.hash = "";
    // Old pages often link their own feeds over http: use https like the page itself.
    if (url.protocol === "http:" && page.protocol === "https:" && sameSite(url.hostname, page.hostname)) url.protocol = "https:";
    const href = url.toString();
    if (href === page.toString()) return;
    if ((FEED_WORDS.test(text) || /rss|feed|xml|atom|subscribe/i.test(href)) && !hints.includes(href)) hints.push(href);
    if (depth === 0) for (const inner of embeddedUrls(url)) consider(inner, text, 1);
    if (SUBSCRIBE_SERVICES.test(url.hostname)) return; // "Add to Yahoo/Feedly…": only the feed inside matters
    if (isFeedishUrl(href)) {
      // Feed links may point at another host (FeedBurner, a feeds. subdomain): that's fine for feeds.
      if (!feeds.includes(href)) feeds.push(href);
    } else if (
      sameSite(url.hostname, page.hostname) &&
      (FEED_WORDS.test(text) || FEED_WORDS.test(url.pathname)) &&
      !feedPages.includes(href)
    ) {
      feedPages.push(href);
    }
  };
  for (const m of content.matchAll(/\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) consider(m[2], m[1]);
  // Links wrapped round an icon, e.g. [![RSS](icon.png)](/rss/new.xml): take every "](href)".
  for (const m of content.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) consider(m[1], "");
  for (const m of content.matchAll(/https?:\/\/[^\s<>"'()[\]|]+/g)) consider(m[0], "");
  // The site's own feeds first, then feeds hosted elsewhere (FeedBurner, partners).
  const own = (u: string) => (sameSite(new URL(u).hostname, page.hostname) ? 0 : 1);
  const ordered = [...feeds].sort((a, b) => own(a) - own(b));
  return { feeds: ordered.slice(0, 10), feedPages: feedPages.slice(0, 3), hints: hints.slice(0, 8) };
}

/** Where most sites keep their main feed, tried when a page doesn't link one. */
export const COMMON_FEED_PATHS = ["/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml"];

/** Pages that often list a site's feeds. */
export const COMMON_FEED_PAGES = ["/feeds"];
