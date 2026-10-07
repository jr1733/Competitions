import { describe, expect, it } from "vitest";
import { directorySearchUrls, pickDirectoryHits } from "../artifact/discover";
import { feedlySearchUrl, jsonIn, parseAnyFeed, parseDirectory, routeUrl, type DirectoryHit } from "../artifact/readers";
import { NotAFeedError } from "@/lib/feed/parse";
import { RSS_FEED } from "./fixtures";

const FEED = "https://comps.example.co.uk/feed/";

const FEEDLY_STREAM = {
  id: `feed/${FEED}`,
  title: "Example Comps",
  items: [
    {
      title: "WIN a £500 Argos gift card",
      canonicalUrl: "https://comps.example.co.uk/argos",
      published: Date.UTC(2026, 9, 5, 9),
      summary: { content: "<p>Fill in the form. Closes 9th October 2026.</p>" },
      keywords: ["Online"],
    },
    {
      title: "Win a holiday",
      alternate: [{ href: "https://comps.example.co.uk/holiday", type: "text/html" }],
      crawled: Date.UTC(2026, 9, 5, 10),
    },
    { title: "No link at all" },
  ],
};

const RSS2JSON = {
  status: "ok",
  feed: { url: FEED, title: "Example Comps" },
  items: [
    { title: "Win a Dyson", pubDate: "2026-10-05 09:00:00", link: "https://comps.example.co.uk/dyson", description: "Ends 31/10/2026", categories: ["Tech"] },
  ],
};

describe("routeUrl", () => {
  it("builds each reader's address for a feed", () => {
    expect(routeUrl("direct", FEED)).toBe(FEED);
    expect(routeUrl("feedly", FEED, 10)).toBe(
      "https://cloud.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fcomps.example.co.uk%2Ffeed%2F&count=10",
    );
    expect(routeUrl("rss2json", FEED)).toBe("https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fcomps.example.co.uk%2Ffeed%2F");
    expect(routeUrl("jina", FEED)).toBe(`https://r.jina.ai/${FEED}`);
  });
});

describe("jsonIn", () => {
  it("finds JSON bare, fenced, after a header, or with markdown escapes", () => {
    expect(jsonIn('{"a":1}')).toEqual({ a: 1 });
    expect(jsonIn('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(jsonIn('Title: x\nURL Source: y\n\nMarkdown Content:\n{"a":[1,2]}')).toEqual({ a: [1, 2] });
    expect(jsonIn('{"feed\\_id":"x\\_y","n":"a\\nb"}')).toEqual({ feed_id: "x_y", n: "a\nb" });
    expect(jsonIn("# Just a page")).toBeNull();
  });
});

describe("parseAnyFeed", () => {
  it("reads Feedly's stream answer", () => {
    const feed = parseAnyFeed(JSON.stringify(FEEDLY_STREAM));
    expect(feed.title).toBe("Example Comps");
    expect(feed.items.map((i) => i.link)).toEqual(["https://comps.example.co.uk/argos", "https://comps.example.co.uk/holiday"]);
    expect(feed.items[0].html).toContain("Closes 9th October");
    expect(feed.items[0].categories).toEqual(["Online"]);
    expect(new Date(feed.items[0].publishedAt!).toISOString()).toBe("2026-10-05T09:00:00.000Z");
  });

  it("reads rss2json's answer, treating its dates as UTC", () => {
    const feed = parseAnyFeed("```json\n" + JSON.stringify(RSS2JSON, null, 2) + "\n```");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ title: "Win a Dyson", link: "https://comps.example.co.uk/dyson", publishedAt: "2026-10-05T09:00:00Z", categories: ["Tech"] });
  });

  it("reads raw XML after Jina Reader's header", () => {
    const feed = parseAnyFeed(`Title: \n\nURL Source: ${FEED}\n\nMarkdown Content:\n${RSS_FEED}`);
    expect(feed.items.length).toBeGreaterThan(0);
  });

  it("still reads the connector's markdown rendering", () => {
    const feed = parseAnyFeed("# Comps\n\n## Win a car\nLink: https://comps.example.co.uk/car\n\nBig prize.\n\n---");
    expect(feed.items[0].link).toBe("https://comps.example.co.uk/car");
  });

  it("rejects empty reader answers and ordinary pages", () => {
    expect(() => parseAnyFeed(JSON.stringify({ id: `feed/${FEED}`, items: [] }))).toThrow(NotAFeedError);
    expect(() => parseAnyFeed(JSON.stringify({ status: "error", message: "Cannot download this RSS feed" }))).toThrow(NotAFeedError);
    expect(() => parseAnyFeed("[Skip to content](#main)\n\n# Welcome\n\nSome {curly} text.")).toThrow(NotAFeedError);
  });
});

const DIRECTORY = {
  results: [
    {
      feedId: "feed/http://www.theprizefinder.com/feed/new-competitions",
      title: "ThePrizeFinder - New Competitions",
      website: "https://www.theprizefinder.com",
      description: "The latest free UK competitions",
      subscribers: 812,
      lastUpdated: Date.UTC(2026, 9, 6),
      language: "en",
    },
    { feedId: "feed/https://news.example.net/feed/", title: "Daily news", description: "Top stories", subscribers: 50_000, lastUpdated: Date.UTC(2026, 9, 6) },
    { feedId: "feed/https://old.example.co.uk/feed/", title: "Old comps", description: "Competitions", subscribers: 10, lastUpdated: Date.UTC(2024, 0, 1) },
    { feedId: "feed/https://concours.example.fr/feed/", title: "Concours gratuits", description: "Gagnez des prizes", language: "fr" },
    { feedId: "feed/https://giveaways.example.com/feed/", title: "Giveaway Hub", description: "Win prizes daily", subscribers: 300, lastUpdated: 1_790_000_000 },
    { feedId: "feed/https://www.facebook.com/comps", title: "Comps on Facebook", description: "competitions" },
    { id: "topic/competitions", title: "Not a feed" },
  ],
};

describe("parseDirectory", () => {
  it("reads Feedly's search answer", () => {
    const hits = parseDirectory(JSON.stringify(DIRECTORY));
    expect(hits).toHaveLength(6);
    expect(hits[0]).toEqual({
      feedUrl: "http://www.theprizefinder.com/feed/new-competitions",
      title: "ThePrizeFinder - New Competitions",
      website: "https://www.theprizefinder.com",
      description: "The latest free UK competitions",
      subscribers: 812,
      lastUpdated: Date.UTC(2026, 9, 6),
      language: "en",
    });
    // Seconds are turned into milliseconds.
    expect(hits[4].lastUpdated).toBe(1_790_000_000_000);
  });

  it("picks the fields out when the answer isn't valid JSON", () => {
    const broken = JSON.stringify(DIRECTORY).slice(0, -5);
    const hits = parseDirectory(broken);
    expect(hits[0].feedUrl).toBe("http://www.theprizefinder.com/feed/new-competitions");
    expect(hits[0].title).toBe("ThePrizeFinder - New Competitions");
    expect(hits[0].subscribers).toBe(812);
  });
});

describe("pickDirectoryHits", () => {
  const hits = parseDirectory(JSON.stringify(DIRECTORY));
  const now = Date.UTC(2026, 9, 7);

  it("keeps recent English competition feeds, well-known sites first", () => {
    expect(pickDirectoryHits(hits, new Set(), 15, now).map((h) => h.feedUrl)).toEqual([
      "http://www.theprizefinder.com/feed/new-competitions",
      "https://giveaways.example.com/feed/",
    ]);
  });

  it("leaves out feeds already added", () => {
    const existing = new Set(["http://www.theprizefinder.com/feed/new-competitions"]);
    expect(pickDirectoryHits(hits, existing, 15, now).map((h) => h.feedUrl)).toEqual(["https://giveaways.example.com/feed/"]);
  });

  it("caps the number to read", () => {
    const many: DirectoryHit[] = Array.from({ length: 30 }, (_, i) => ({
      feedUrl: `https://comps${i}.example.co.uk/feed/`,
      title: `Comps ${i}`,
      website: null,
      description: "UK competitions",
      subscribers: i,
      lastUpdated: null,
      language: null,
    }));
    const picked = pickDirectoryHits(many, new Set(), 15, now);
    expect(picked).toHaveLength(15);
    expect(picked[0].feedUrl).toBe("https://comps29.example.co.uk/feed/");
  });
});

describe("directorySearchUrls", () => {
  it("searches topics and each well-known site, in one batch", () => {
    const urls = directorySearchUrls();
    expect(urls.length).toBeLessThanOrEqual(20);
    expect(urls).toContain(feedlySearchUrl("uk competitions", 10));
    expect(urls).toContain(feedlySearchUrl("theprizefinder.com", 5));
  });
});
