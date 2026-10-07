import { describe, expect, it } from "vitest";
import { KNOWN_FEEDS, pickDirectoryHits } from "../artifact/discover";
import { isPrizeItem, looksLikePrizeDraws } from "../artifact/fetched-feed";
import { isStale, parseDirectory } from "../artifact/readers";
import { REAL_DIRECTORY, REAL_TITLES } from "./fixtures-real";

// Everything here is what Feedly really returned through Parallel Search on 7 Oct 2026.
const now = Date.UTC(2026, 9, 7, 14);

describe("Find feeds on the real directory results", () => {
  const hits = parseDirectory(JSON.stringify(REAL_DIRECTORY));

  it("parses every result", () => {
    expect(hits).toHaveLength(44);
    expect(hits.find((h) => h.title === "Giveaway of the Day")?.topics).toEqual(["software", "deals", "tech"]);
  });

  it("keeps only UK prize-draw feeds: no architecture, software giveaways, US freebies or workers' comp", () => {
    const picked = pickDirectoryHits([...KNOWN_FEEDS, ...hits], new Set(), 12, now).map((h) => h.feedUrl);
    expect(picked).toEqual(expect.arrayContaining(KNOWN_FEEDS.map((f) => f.feedUrl)));
    expect(picked).toEqual(
      expect.arrayContaining(["http://superlucky.me/feed/", "http://www.latestfreestuff.co.uk/feed/"]),
    );
    // Those two are read and then dropped (a blog about comping; mostly freebies), see below.
    expect(picked).toHaveLength(KNOWN_FEEDS.length + 2);
  });

  it("doesn't pick the hand-checked feeds twice when the directory lists them too", () => {
    const picked = pickDirectoryHits([...KNOWN_FEEDS, ...hits], new Set(), 12, now);
    expect(picked.filter((h) => h.feedUrl.includes("new-competitions"))).toHaveLength(1);
    expect(picked.find((h) => h.feedUrl.includes("new-competitions"))?.title).toBe("ThePrizeFinder: New competitions");
  });
});

describe("prize draws in real feeds", () => {
  it("accepts ThePrizeFinder", () => {
    expect(looksLikePrizeDraws(REAL_TITLES.theprizefinder.map((title) => ({ title })))).toBe(true);
  });

  it("rejects a blog about comping and a freebies feed", () => {
    expect(looksLikePrizeDraws(REAL_TITLES.superlucky.map((title) => ({ title })))).toBe(false);
    expect(looksLikePrizeDraws(REAL_TITLES.latestfreestuffMain.map((title) => ({ title })))).toBe(false);
  });

  it("counts a freebies site's competitions by their category", () => {
    // Latest Free Stuff's free-competitions feed: half the titles say "Free…", every item is filed under Free Competitions.
    const items = [
      ["Win Up To £2,500 Every Day", ["Top 20 Freebies", "Free Competitions", "Free Lottery Tickets"]],
      ["Free Paco Rabanne Perfume Bottle", ["Top 20 Freebies", "Free Competitions", "Free Perfume"]],
      ["Free Red Bull Drinks & Playing Cards", ["Free Competitions", "Free Days Out"]],
      ["Win A 1kg Kinder Chocolate Gift Box", ["Free Competitions", "Free Food and Drink"]],
      ["Free Inch’s Cider Bucket Hats", ["Free Competitions", "Free Fashion Stuff"]],
      ["Win A Swizzels Party Mix Tub", ["Free Competitions", "Free Food and Drink"]],
    ].map(([title, categories]) => ({ title: title as string, categories: categories as string[] }));
    expect(looksLikePrizeDraws(items)).toBe(true);
    expect(isPrizeItem({ title: "Free Pizza Express Kids Pizza Pack", categories: ["Free Food and Drink"] })).toBe(false);
  });

  it("tells prizes from talk about winning", () => {
    expect(isPrizeItem({ title: "Win 1 of 3 £100 eGift cards from Lounge" })).toBe(true);
    expect(isPrizeItem({ title: "Win £250 To Spend On Levi’s at Standout" })).toBe(true);
    expect(isPrizeItem({ title: "How to win Whatnot giveaways" })).toBe(false);
    expect(isPrizeItem({ title: "August unboxing & a big radio win!" })).toBe(false);
    expect(isPrizeItem({ title: "Winners announced for the 2026 Housing Ideas Competition" })).toBe(false);
  });
});

describe("isStale", () => {
  const feed = (dates: (string | null)[]) => ({
    format: "rss" as const,
    title: "",
    items: dates.map((publishedAt, i) => ({ title: `Win ${i}`, link: `https://x.example/${i}`, html: "", categories: [], publishedAt, dateHints: [] })),
  });

  it("spots a reader's copy that stopped updating", () => {
    // Feedly's copy of ThePrizeFinder's "Closing soon" ended in December 2025.
    expect(isStale(feed(["Mon, 22 Dec 2025 16:43:38 GMT", "Mon, 22 Dec 2025 15:07:13 GMT"]), now)).toBe(true);
    expect(isStale(feed(["Wed, 07 Oct 2026 11:16:47 GMT", "Mon, 22 Dec 2025 15:07:13 GMT"]), now)).toBe(false);
    expect(isStale(feed([null, null]), now)).toBe(false);
  });
});
