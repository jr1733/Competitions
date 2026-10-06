import { RobotsBlockedError } from "@/lib/feed/http";
import { previewFeed } from "@/lib/feed/ingest";
import { jsonError, userFromRequest } from "@/lib/server/auth";

export const maxDuration = 30;

/** "Test feed" in Settings: check robots.txt, fetch and parse, save nothing. */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Sign in again to test feeds");

  let url: string;
  try {
    const body = (await request.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url.trim() : "";
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
  } catch {
    return jsonError(400, "Enter a valid http(s) feed URL");
  }

  try {
    return Response.json({ ok: true, ...(await previewFeed(url)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't read that feed";
    return Response.json(
      { ok: false, blockedByRobots: error instanceof RobotsBlockedError, error: message },
      { status: 200 },
    );
  }
}
