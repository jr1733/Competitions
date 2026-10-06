import { ingestFeeds } from "@/lib/feed/ingest";
import { jsonError, userFromRequest } from "@/lib/server/auth";

export const maxDuration = 60;

/** "Refresh now" in Settings: fetch the signed-in user's feeds immediately. */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Sign in again to refresh feeds");

  let feedIds: string[] | undefined;
  try {
    const body = (await request.json()) as { feedIds?: unknown };
    if (Array.isArray(body.feedIds)) feedIds = body.feedIds.filter((id): id is string => typeof id === "string");
  } catch {
    // No body: refresh all of the user's feeds.
  }

  try {
    return Response.json(await ingestFeeds({ userId: user.id, feedIds }));
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : "Feed refresh failed");
  }
}
