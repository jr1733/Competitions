import { describe, expect, it } from "vitest";
import { dedupeByUrl, itemToCompetition } from "@/lib/feed/normalise";
import { parseFeed } from "@/lib/feed/parse";
import { isPublicHttpUrl, normaliseUrl } from "@/lib/feed/url";
import { RSS_FEED } from "./fixtures";

const now = new Date("2026-10-06T12:00:00Z");

describe("normaliseUrl", () => {
  it("strips tracking, fragments and trailing slashes and lower-cases the host", () => {
    expect(normaliseUrl("https://COMPS.example.co.uk/argos-500/?utm_source=rss&b=2&a=1#x")).toBe(
      "https://comps.example.co.uk/argos-500?a=1&b=2",
    );
    expect(normaliseUrl("https://example.com/")).toBe("https://example.com/");
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("not a url")).toBeNull();
  });
});

describe("isPublicHttpUrl", () => {
  it("refuses internal addresses", () => {
    expect(isPublicHttpUrl("https://comps.example.co.uk/feed")).toBe(true);
    expect(isPublicHttpUrl("http://localhost:3000/feed")).toBe(false);
    expect(isPublicHttpUrl("http://127.0.0.1/feed")).toBe(false);
    expect(isPublicHttpUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isPublicHttpUrl("http://192.168.1.10/rss")).toBe(false);
    expect(isPublicHttpUrl("http://[::1]/rss")).toBe(false);
    expect(isPublicHttpUrl("ftp://example.com/rss")).toBe(false);
  });
});

describe("itemToCompetition", () => {
  const feed = parseFeed(RSS_FEED);
  const rows = feed.items.map((item) => itemToCompetition(item, { id: "feed-1", name: "Example Comps" }, now));

  it("builds a full competition row", () => {
    expect(rows[0]).toMatchObject({
      url: "https://comps.example.co.uk/argos-500",
      prize: "£500 Argos gift card",
      closes_at: "2026-10-09T22:59:59.000Z",
      entry_type: "online",
      category: "vouchers",
      reentry: "none",
      source: "Example Comps",
      feed_id: "feed-1",
      published_at: "2026-10-05T08:00:00.000Z",
    });
    expect(rows[0]?.summary).toContain("Fill in the online form");
  });

  it("classifies the other fixture items", () => {
    expect(rows[1]).toMatchObject({ entry_type: "social", category: "travel", url: "https://comps.example.co.uk/florida" });
    expect(rows[2]).toMatchObject({ reentry: "daily", category: "tech" });
    expect(rows[4]).toMatchObject({ entry_type: "email", category: "cash", reentry: "weekly", closes_at: "2026-11-30T23:59:59.000Z" });
  });

  it("drops closed and untitled items", () => {
    expect(rows[3]).toBeNull(); // closed 1 October
    expect(rows[6]).toBeNull(); // no title
  });

  it("de-duplicates by normalised URL, keeping the first", () => {
    const kept = dedupeByUrl(rows.filter((r) => r !== null));
    expect(kept.map((r) => r.url)).toEqual([
      "https://comps.example.co.uk/argos-500",
      "https://comps.example.co.uk/florida",
      "https://comps.example.co.uk/switch",
      "https://comps.example.co.uk/cash-1000",
    ]);
    expect(kept[0].title).toBe("WIN a £500 Argos gift card! | Example Comps");
  });
});
