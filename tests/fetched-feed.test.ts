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

describe("feedLinksInPage", async () => {
  const { feedLinksInPage, isFeedishUrl } = await import("../artifact/fetched-feed");

  it("finds feed links and 'RSS feeds' pages on the same site", () => {
    const page = `# Prize Site

Thousands of UK competitions.

[Latest](https://www.prizes.example.com/latest) · [RSS Feeds](/feeds) · [Facebook](https://facebook.com/prizes)
Subscribe: https://www.prizes.example.com/rss/new-competitions.xml
[Other site feed](https://elsewhere.example.org/feed/)`;
    const links = feedLinksInPage(page, "https://www.prizes.example.com/");
    expect(links.feeds).toEqual(["https://www.prizes.example.com/rss/new-competitions.xml", "https://elsewhere.example.org/feed/"]);
    expect(links.feedPages).toEqual(["https://www.prizes.example.com/feeds"]);
  });

  it("recognises common feed addresses", () => {
    expect(isFeedishUrl("https://blog.example.com/feed/")).toBe(true);
    expect(isFeedishUrl("https://x.example.com/rss")).toBe(true);
    expect(isFeedishUrl("https://x.example.com/comps.xml")).toBe(true);
    expect(isFeedishUrl("https://x.example.com/?format=rss")).toBe(true);
    expect(isFeedishUrl("https://x.example.com/feeds")).toBe(false);
    expect(isFeedishUrl("https://x.example.com/")).toBe(false);
  });
});

describe("feedLinksInPage with icon links", async () => {
  const { feedLinksInPage } = await import("../artifact/fetched-feed");
  it("finds feed links wrapped round icons, relative or absolute", () => {
    const page = "* New Competitions [![RSS](/img/rss.png)](/rss/new.xml) [![Feedly](/img/feedly.png)](https://feedly.com/i/subscription/feed/x)";
    expect(feedLinksInPage(page, "https://www.prizes.example.com/feeds").feeds).toEqual(["https://www.prizes.example.com/rss/new.xml"]);
  });
});

describe("feedLinksInPage across hosts", async () => {
  const { feedLinksInPage, isFeedishUrl } = await import("../artifact/fetched-feed");
  it("accepts FeedBurner and feeds. subdomains", () => {
    expect(isFeedishUrl("https://feeds.feedburner.com/ThePrizeFinder-NewCompetitions")).toBe(true);
    expect(isFeedishUrl("https://feeds.example.com/new-comps")).toBe(true);
    const page = "* New Competitions [![](/i/rss.png)](https://feeds.feedburner.com/PrizeSite-New)";
    expect(feedLinksInPage(page, "https://www.prizes.example.com/feeds").feeds).toEqual(["https://feeds.feedburner.com/PrizeSite-New"]);
  });
  it("pulls the feed address out of 'Add to Yahoo / Feedly' links", () => {
    const page =
      "[![](/i/yahoo.png)](https://add.my.yahoo.com/rss?url=https%3A%2F%2Fwww.prizes.example.com%2Fcomps%2Fnew.php) " +
      "[![](/i/feedly.png)](https://feedly.com/i/subscription/feed%2Fhttps%3A%2F%2Fwww.prizes.example.com%2Frss%2Ftop.xml)";
    const links = feedLinksInPage(page, "https://www.prizes.example.com/feeds");
    expect(links.feeds).toContain("https://www.prizes.example.com/rss/top.xml");
    expect(links.hints.length).toBeGreaterThan(0);
  });
});

describe("subscribe services", async () => {
  const { feedLinksInPage } = await import("../artifact/fetched-feed");
  it("never treats the subscribe service itself as a feed", () => {
    const page = "[![](/i/yahoo.png)](https://add.my.yahoo.com/rss?url=https%3A%2F%2Ffeeds.feedburner.com%2FX)";
    expect(feedLinksInPage(page, "https://www.prizes.example.com/feeds").feeds).toEqual(["https://feeds.feedburner.com/X"]);
  });
});

describe("named feed addresses (from ThePrizeFinder's real feeds page)", async () => {
  const { feedLinksInPage, isFeedishUrl } = await import("../artifact/fetched-feed");
  it("treats /feed/<name> and /rss/<name> as feeds, but not /feeds", () => {
    expect(isFeedishUrl("https://www.theprizefinder.com/feed/new-competitions")).toBe(true);
    expect(isFeedishUrl("https://www.example.com/rss/top-prizes")).toBe(true);
    expect(isFeedishUrl("https://www.theprizefinder.com/feeds")).toBe(false);
    expect(isFeedishUrl("https://www.theprizefinder.com/competitions/new-competitions")).toBe(false);
  });
  it("finds the three feeds on a page shaped like ThePrizeFinder's", () => {
    const page = `#### Enter Competitions * [New Competitions](https://www.theprizefinder.com/competitions/new-competitions)
[Feedreader](http://www.feedreader.com/) [Feedly](http://www.feedly.com/)
* New Competitions [![](/img/rss.gif)](http://www.theprizefinder.com/feed/new-competitions) [![](/img/yahoo.gif)](http://add.my.yahoo.com/rss?url=http://www.theprizefinder.com/feed/new-competitions) [![](/img/google.gif)](http://fusion.google.com/add?feedurl=http://www.theprizefinder.com/feed/new-competitions)
* Top Prizes [![](/img/rss.gif)](http://www.theprizefinder.com/feed/top-prizes)
* Closing soon [![](/img/rss.gif)](http://www.theprizefinder.com/feed/closing-soon)`;
    expect(feedLinksInPage(page, "https://www.theprizefinder.com/feeds").feeds).toEqual([
      "https://www.theprizefinder.com/feed/new-competitions",
      "https://www.theprizefinder.com/feed/top-prizes",
      "https://www.theprizefinder.com/feed/closing-soon",
    ]);
  });
});
