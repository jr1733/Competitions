import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { adminClient } from "../supabase/admin";

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else is
 * rejected, including every request when CRON_SECRET isn't set.
 */
export function isAuthorisedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The signed-in user, from the Supabase access token the app sends as a Bearer token. */
export async function userFromRequest(request: Request): Promise<User | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
