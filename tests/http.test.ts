import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeed, RobotsBlockedError } from "@/lib/feed/http";
import { RSS_FEED } from "./fixtures";

type Handler = (url: string, init?: RequestInit) => Response;

function mockFetch(routes: Record<string, Handler>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const handler = routes[url];
    if (!handler) return new Response("not found", { status: 404 });
    return handler(url, init);
  });
  return calls;
}

const rss = () => new Response(RSS_FEED, { headers: { "content-type": "application/rss+xml", etag: '"v1"' } });

afterEach(() => vi.unstubAllGlobals());

describe("fetchFeed", () => {
  it("fetches when robots.txt is missing and sends our user agent", async () => {
    let ua = "";
    const calls = mockFetch({
      "https://a.example/feed": (_url, init) => {
        ua = (init?.headers as Record<string, string>)["User-Agent"];
        return rss();
      },
    });
    const result = await fetchFeed("https://a.example/feed");
    expect(result.status).toBe("ok");
    expect(calls).toEqual(["https://a.example/robots.txt", "https://a.example/feed"]);
    expect(ua).toMatch(/^ComperBot\/1\.0/);
  });

  it("does not fetch a feed that robots.txt disallows", async () => {
    const calls = mockFetch({
      "https://b.example/robots.txt": () => new Response("User-agent: *\nDisallow: /feeds/"),
      "https://b.example/feeds/rss": rss,
    });
    await expect(fetchFeed("https://b.example/feeds/rss")).rejects.toBeInstanceOf(RobotsBlockedError);
    expect(calls).not.toContain("https://b.example/feeds/rss");
  });

  it("honours a ComperBot-specific group and reports Crawl-delay", async () => {
    mockFetch({
      "https://c.example/robots.txt": () =>
        new Response("User-agent: *\nDisallow: /\n\nUser-agent: ComperBot\nAllow: /rss\nCrawl-delay: 5"),
      "https://c.example/rss": rss,
    });
    const result = await fetchFeed("https://c.example/rss");
    expect(result).toMatchObject({ status: "ok", crawlDelaySeconds: 5 });
  });

  it("treats an unreachable robots.txt as disallowed", async () => {
    mockFetch({ "https://d.example/robots.txt": () => new Response("oops", { status: 503 }) });
    await expect(fetchFeed("https://d.example/rss")).rejects.toThrow(/robots\.txt unavailable/);
  });

  it("checks robots.txt again when a redirect changes host", async () => {
    const calls = mockFetch({
      "https://e.example/rss": () => new Response(null, { status: 301, headers: { location: "https://f.example/private/rss" } }),
      "https://f.example/robots.txt": () => new Response("User-agent: *\nDisallow: /private"),
    });
    await expect(fetchFeed("https://e.example/rss")).rejects.toBeInstanceOf(RobotsBlockedError);
    expect(calls).not.toContain("https://f.example/private/rss");
  });

  it("sends conditional headers and handles 304", async () => {
    let headers: Record<string, string> = {};
    mockFetch({
      "https://g.example/rss": (_url, init) => {
        headers = init?.headers as Record<string, string>;
        return new Response(null, { status: 304 });
      },
    });
    const result = await fetchFeed("https://g.example/rss", { etag: '"v1"', lastModified: "Mon, 05 Oct 2026 09:00:00 GMT" });
    expect(result.status).toBe("not_modified");
    expect(headers["If-None-Match"]).toBe('"v1"');
    expect(headers["If-Modified-Since"]).toBe("Mon, 05 Oct 2026 09:00:00 GMT");
  });

  it("rejects HTML pages and internal addresses", async () => {
    mockFetch({ "https://h.example/page": () => new Response("<html></html>", { headers: { "content-type": "text/html" } }) });
    await expect(fetchFeed("https://h.example/page")).rejects.toThrow(/not an RSS feed/);
    await expect(fetchFeed("http://127.0.0.1/rss")).rejects.toThrow(/public/);
  });
});
