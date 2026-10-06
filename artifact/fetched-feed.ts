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
