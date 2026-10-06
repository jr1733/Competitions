import { XMLParser } from "fast-xml-parser";

/** One item from an RSS 2.0, RSS 1.0 (RDF) or Atom feed, before classification. */
export interface RawFeedItem {
  title: string;
  link: string;
  /** Description / content, still HTML. */
  html: string;
  categories: string[];
  publishedAt: string | null;
  /** Values of non-standard tags that look like closing dates, e.g. <closingDate>. */
  dateHints: string[];
}

export interface ParsedFeed {
  format: "rss" | "rdf" | "atom";
  title: string;
  items: RawFeedItem[];
}

export class NotAFeedError extends Error {
  constructor(message = "This URL didn't return an RSS or Atom feed") {
    super(message);
    this.name = "NotAFeedError";
  }
}

const ARRAY_TAGS = new Set(["item", "entry", "category", "link", "dc:subject"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type Node = Record<string, unknown>;

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") {
    const node = value as Node;
    if ("#text" in node) return text(node["#text"]);
  }
  return "";
}

function list(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

const DATE_HINT_TAG = /clos|deadline|expir|end_?date/i;

function dateHints(item: Node): string[] {
  const hints: string[] = [];
  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith("@_")) continue;
    if (DATE_HINT_TAG.test(key.replace(/^.*:/, ""))) {
      const v = text(value);
      if (v) hints.push(v);
    }
  }
  return hints;
}

function rssItem(item: Node): RawFeedItem {
  const guid = item.guid as Node | string | undefined;
  const guidIsLink =
    typeof guid === "object" && guid !== null ? guid["@_isPermaLink"] !== "false" : typeof guid === "string";
  const guidText = text(guid);
  const link = text(item.link) || (guidIsLink && /^https?:\/\//i.test(guidText) ? guidText : "");

  return {
    title: text(item.title),
    link,
    html: text(item["content:encoded"]) || text(item.description),
    categories: [...list(item.category), ...list(item["dc:subject"])].map(text).filter(Boolean),
    publishedAt: text(item.pubDate) || text(item["dc:date"]) || null,
    dateHints: dateHints(item),
  };
}

function atomLink(links: unknown[]): string {
  const nodes = links.filter((l): l is Node => typeof l === "object" && l !== null);
  const alternate =
    nodes.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? nodes.find((l) => typeof l["@_href"] === "string");
  if (alternate) return text(alternate["@_href"]);
  return text(links[0]);
}

function atomEntry(entry: Node): RawFeedItem {
  return {
    title: text(entry.title),
    link: atomLink(list(entry.link)),
    html: text(entry.content) || text(entry.summary),
    categories: list(entry.category)
      .map((c) => (typeof c === "object" && c !== null ? text((c as Node)["@_label"]) || text((c as Node)["@_term"]) : text(c)))
      .filter(Boolean),
    publishedAt: text(entry.published) || text(entry.updated) || null,
    dateHints: dateHints(entry),
  };
}

/** Parse feed XML. Throws NotAFeedError for HTML or anything else that isn't a feed. */
export function parseFeed(xml: string): ParsedFeed {
  const head = xml.slice(0, 2000).toLowerCase();
  if (head.includes("<!doctype html") || /<html[\s>]/.test(head)) {
    throw new NotAFeedError("This URL returned a web page, not an RSS feed. Comper only reads RSS/Atom feeds.");
  }

  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new NotAFeedError("The feed XML couldn't be parsed");
  }

  const rss = doc.rss as Node | undefined;
  if (rss && typeof rss === "object") {
    const channel = (Array.isArray(rss.channel) ? rss.channel[0] : rss.channel) as Node | undefined;
    if (!channel) throw new NotAFeedError();
    return {
      format: "rss",
      title: text(channel.title),
      items: list(channel.item).map((i) => rssItem(i as Node)),
    };
  }

  const rdf = doc["rdf:RDF"] as Node | undefined;
  if (rdf && typeof rdf === "object") {
    const channel = rdf.channel as Node | undefined;
    return {
      format: "rdf",
      title: text(channel?.title),
      items: list(rdf.item).map((i) => rssItem(i as Node)),
    };
  }

  const feed = doc.feed as Node | undefined;
  if (feed && typeof feed === "object") {
    return {
      format: "atom",
      title: text(feed.title),
      items: list(feed.entry).map((e) => atomEntry(e as Node)),
    };
  }

  throw new NotAFeedError();
}
