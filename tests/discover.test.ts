import { describe, expect, it } from "vitest";
import { candidatesFromSearch, feedUrlsToTry, looksLikeCompetitions } from "../artifact/discover";

describe("candidatesFromSearch", () => {
  const hits = [
    { url: "https://www.comps.example.co.uk/latest", title: "Latest UK competitions", excerpts: ["Our feed: https://www.comps.example.co.uk/feed/ updated daily"] },
    { url: "https://www.facebook.com/somecomps", title: "Comps on Facebook" },
    { url: "https://blog.example.org/feed/", title: "Comping blog feed" },
    { url: "https://www.comps.example.co.uk/other", title: "Same site again" },
    { url: "not a url" },
  ];

  it("collects sites, skipping social networks and duplicates", () => {
    expect(candidatesFromSearch(hits).origins).toEqual(["https://www.comps.example.co.uk", "https://blog.example.org"]);
  });

  it("picks up feed URLs mentioned in results", () => {
    expect(candidatesFromSearch(hits).direct).toEqual(["https://www.comps.example.co.uk/feed/", "https://blog.example.org/feed/"]);
  });

  it("caps the number of sites", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ url: `https://site${i}.example.com/` }));
    expect(candidatesFromSearch(many, 8).origins).toHaveLength(8);
  });
});

describe("feedUrlsToTry", () => {
  it("tries mentioned feeds first, then common paths, without duplicates", () => {
    expect(feedUrlsToTry(["https://a.example.com", "https://b.example.com"], ["https://a.example.com/feed/"])).toEqual([
      "https://a.example.com/feed/",
      "https://b.example.com/feed/",
      "https://a.example.com/rss",
      "https://b.example.com/rss",
    ]);
  });

  it("stays within one connector call (20 URLs)", () => {
    const origins = Array.from({ length: 15 }, (_, i) => `https://s${i}.example.com`);
    expect(feedUrlsToTry(origins, [])).toHaveLength(20);
  });
});

describe("looksLikeCompetitions", () => {
  it("accepts competition feeds and rejects news feeds", () => {
    expect(looksLikeCompetitions(["Win a £500 voucher", "WIN a holiday", "New recipe ideas", "Giveaway: Dyson"])).toBe(true);
    expect(looksLikeCompetitions(["Election latest", "Weather warning", "Football results", "Markets fall"])).toBe(false);
    expect(looksLikeCompetitions([])).toBe(false);
  });
});
