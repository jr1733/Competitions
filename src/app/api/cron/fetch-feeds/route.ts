import { connection } from "next/server";
import { ingestFeeds } from "@/lib/feed/ingest";
import { isAuthorisedCron, jsonError } from "@/lib/server/auth";

export const maxDuration = 60;

/** Vercel Cron: every 6 hours (see vercel.json). */
export async function GET(request: Request) {
  await connection();
  if (!isAuthorisedCron(request)) return jsonError(401, "Unauthorised");
  try {
    const summary = await ingestFeeds();
    console.log(`[fetch-feeds] ${summary.newItems} new, ${summary.pruned} pruned, ${summary.feeds.length} feeds`);
    return Response.json(summary);
  } catch (error) {
    console.error("[fetch-feeds]", error);
    return jsonError(500, error instanceof Error ? error.message : "Feed refresh failed");
  }
}
