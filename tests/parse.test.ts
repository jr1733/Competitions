import { describe, expect, it } from "vitest";
import { NotAFeedError, parseFeed } from "@/lib/feed/parse";
import { ATOM_FEED, HTML_PAGE, RDF_FEED, RSS_FEED } from "./fixtures";

describe("parseFeed", () => {
  it("reads RSS 2.0 items, categories, CDATA and guid permalinks", () => {
    const feed = parseFeed(RSS_FEED);
    expect(feed.format).toBe("rss");
    expect(feed.title).toBe("Example Comps");
    expect(feed.items).toHaveLength(7);
    expect(feed.items[0].title).toBe("WIN a £500 Argos gift card! | Example Comps");
    expect(feed.items[0].html).toContain("Closes 9th October 2026");
    expect(feed.items[0].categories).toEqual(["Online", "Vouchers"]);
    expect(feed.items[4].link).toBe("https://comps.example.co.uk/cash-1000");
    expect(feed.items[4].dateHints).toEqual(["2026-11-30"]);
  });

  it("reads Atom entries and picks the alternate link", () => {
    const feed = parseFeed(ATOM_FEED);
    expect(feed.format).toBe("atom");
    expect(feed.items[0].link).toBe("https://atom.example.com/show");
    expect(feed.items[0].categories).toEqual(["Experiences"]);
    expect(feed.items[0].publishedAt).toBe("2026-10-01T12:00:00Z");
  });

  it("reads RSS 1.0 (RDF)", () => {
    const feed = parseFeed(RDF_FEED);
    expect(feed.format).toBe("rdf");
    expect(feed.items[0].link).toBe("https://rdf.example.com/ipad");
    expect(feed.items[0].categories).toEqual(["Tech"]);
  });

  it("refuses HTML pages: RSS only, no scraping", () => {
    expect(() => parseFeed(HTML_PAGE)).toThrow(NotAFeedError);
    expect(() => parseFeed("<foo><bar/></foo>")).toThrow(NotAFeedError);
  });
});
