import { describe, expect, it } from "vitest";
import { parseFetchedFeed } from "../artifact/fetched-feed";
import { itemToCompetition } from "@/lib/feed/normalise";
import { NotAFeedError } from "@/lib/feed/parse";
import { RSS_FEED } from "./fixtures";

// Shape returned by the Parallel Search connector for an RSS feed (full_content).
const MARKDOWN_FEED = `# Example Comps

Daily UK competitions

## WIN a £500 Argos gift card\\!
Published: Mon, 05 Oct 2026 09:00:00 GMT  ·  Link: https://comps.example.co.uk/argos-500/?utm_source=rss

Fill in the online form to enter. Closes 9th October 2026.

---

## Win a family holiday to Florida
Published: Mon, 05 Oct 2026 10:00:00 GMT  ·  Link:
https://comps.example.co.uk/florida

Follow us on Instagram and tag a friend. Ends 31/12/2026.

---

## Win a Nintendo Switch 2 – enter daily
Link: https://comps.example.co.uk/switch
Categories: Daily, Tech

Enter once a day. Deadline: Friday 16 October.

---`;

const now = new Date("2026-10-06T12:00:00Z");

describe("parseFetchedFeed", () => {
  it("reads the connector's markdown rendering of a feed", () => {
    const feed = parseFetchedFeed(MARKDOWN_FEED);
    expect(feed.title).toBe("Example Comps");
    expect(feed.items).toHaveLength(3);
    expect(feed.items[0]).toMatchObject({
      title: "WIN a £500 Argos gift card!",
      link: "https://comps.example.co.uk/argos-500/?utm_source=rss",
      publishedAt: "Mon, 05 Oct 2026 09:00:00 GMT",
    });
    expect(feed.items[0].html).toBe("Fill in the online form to enter. Closes 9th October 2026.");
    expect(feed.items[1].link).toBe("https://comps.example.co.uk/florida");
    expect(feed.items[1].html).not.toContain("http");
    expect(feed.items[2].categories).toEqual(["Daily", "Tech"]);
  });

  it("feeds the same classifier as the server version", () => {
    const rows = parseFetchedFeed(MARKDOWN_FEED).items.map((i) => itemToCompetition(i, { id: "f", name: "Example" }, now));
    expect(rows[0]).toMatchObject({
      url: "https://comps.example.co.uk/argos-500",
      prize: "£500 Argos gift card",
      closes_at: "2026-10-09T22:59:59.000Z",
      category: "vouchers",
    });
    expect(rows[1]).toMatchObject({ entry_type: "social", category: "travel" });
    expect(rows[2]).toMatchObject({ reentry: "daily", closes_at: "2026-10-16T22:59:59.000Z" });
  });

  it("falls back to the XML parser for raw feeds", () => {
    expect(parseFetchedFeed(RSS_FEED).items).toHaveLength(7);
  });

  it("rejects ordinary web pages", () => {
    expect(() => parseFetchedFeed("# My blog\n\n## About me\nI like cats.\n\n## Contact\nEmail me.")).toThrow(NotAFeedError);
  });
});
