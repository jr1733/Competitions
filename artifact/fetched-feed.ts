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

const COMPETITION_WORDS = /\b(win|wins|won|competition|comp|giveaway|prize|prizes|draw|sweepstakes?|enter)\b/i;

/** A feed counts as a competition feed when at least 30% of its items read like competitions. */
export function looksLikeCompetitions(titles: string[]): boolean {
  if (!titles.length) return false;
  return titles.filter((t) => COMPETITION_WORDS.test(t)).length / titles.length >= 0.3;
}

const FEEDISH_PATH = /\/feed\/?$|\/rss(?:\/|\.xml|$)|\.(?:xml|rss|atom)$|\/atom(?:\/|\.xml|$)/i;
const FEEDISH_QUERY = /[?&](?:feed|format|type)=(?:rss|atom)/i;
const FEED_WORDS = /\b(rss|feeds?|atom)\b/i;

/** Does this address look like a feed rather than a page? */
export function isFeedishUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return FEEDISH_PATH.test(u.pathname) || FEEDISH_QUERY.test(u.search);
  } catch {
    return false;
  }
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
export function feedLinksInPage(content: string, pageUrl: string): { feeds: string[]; feedPages: string[] } {
  const page = new URL(pageUrl);
  const feeds: string[] = [];
  const feedPages: string[] = [];
  const consider = (raw: string, text: string) => {
    let url: URL;
    try {
      url = new URL(raw.replace(/[.,;]+$/, ""), page);
    } catch {
      return;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !sameSite(url.hostname, page.hostname)) return;
    url.hash = "";
    const href = url.toString();
    if (href === page.toString()) return;
    if (isFeedishUrl(href)) {
      if (!feeds.includes(href)) feeds.push(href);
    } else if ((FEED_WORDS.test(text) || FEED_WORDS.test(url.pathname)) && !feedPages.includes(href)) {
      feedPages.push(href);
    }
  };
  for (const m of content.matchAll(/\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) consider(m[2], m[1]);
  // Links wrapped round an icon, e.g. [![RSS](icon.png)](/rss/new.xml): take every "](href)".
  for (const m of content.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) consider(m[1], "");
  for (const m of content.matchAll(/https?:\/\/[^\s<>"'()[\]|]+/g)) consider(m[0], "");
  return { feeds: feeds.slice(0, 10), feedPages: feedPages.slice(0, 3) };
}

/** Where most sites keep their main feed, tried when a page doesn't link one. */
export const COMMON_FEED_PATHS = ["/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml"];

/** Pages that often list a site's feeds. */
export const COMMON_FEED_PAGES = ["/feeds", "/rss-feeds"];
