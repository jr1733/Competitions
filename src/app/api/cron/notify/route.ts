import { connection } from "next/server";
import { runNotifications } from "@/lib/notify/run";
import { isAuthorisedCron, jsonError } from "@/lib/server/auth";

export const maxDuration = 60;

/** Vercel Cron: every 15 minutes (see vercel.json). Sends digests, re-entry reminders and closing alerts. */
export async function GET(request: Request) {
  await connection();
  if (!isAuthorisedCron(request)) return jsonError(401, "Unauthorised");
  try {
    const results = await runNotifications();
    return Response.json({ users: results });
  } catch (error) {
    console.error("[notify]", error);
    return jsonError(500, error instanceof Error ? error.message : "Notification run failed");
  }
}
