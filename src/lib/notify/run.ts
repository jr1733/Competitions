import "server-only";
import { addLondonDays, describeClosing, londonDateKey } from "../dates";
import { isClosed } from "../entries";
import { sendToUser } from "../push/send";
import { adminClient } from "../supabase/admin";
import type { Competition, UserSettings } from "../types";
import { duePushes, listPrizes, plural } from "./plan";

interface UserResult {
  userId: string;
  digest?: number;
  reentry?: number;
  closing?: number;
  sent: number;
}

async function digest(settings: UserSettings, now: Date): Promise<{ count: number; sent: number }> {
  const db = adminClient();
  const since = settings.last_digest_at ?? new Date(now.getTime() - 86_400_000).toISOString();
  const nowIso = now.toISOString();

  const [{ data: fresh }, { data: acted }] = await Promise.all([
    db
      .from("competitions")
      .select("id, prize, closes_at")
      .gt("created_at", since)
      .or(`closes_at.is.null,closes_at.gt."${nowIso}"`)
      .order("closes_at", { ascending: true, nullsFirst: false })
      .limit(1000),
    // A competition created since `since` can only have been acted on since then too.
    db.from("entries").select("competition_id").eq("user_id", settings.user_id).gt("created_at", since),
  ]);
  const seen = new Set((acted ?? []).map((e) => e.competition_id as string));
  const items = ((fresh ?? []) as Pick<Competition, "id" | "prize">[]).filter((c) => !seen.has(c.id));

  let sent = 0;
  if (items.length) {
    ({ sent } = await sendToUser(settings.user_id, {
      title: `${plural(items.length, "new competition")} to look at`,
      body: listPrizes(items.map((c) => c.prize)),
      url: "/",
      tag: "digest",
    }));
  }
  await db
    .from("user_settings")
    .update({ last_digest_on: londonDateKey(now), last_digest_at: nowIso })
    .eq("user_id", settings.user_id);
  return { count: items.length, sent };
}

async function reentries(settings: UserSettings, now: Date): Promise<{ count: number; sent: number }> {
  const db = adminClient();
  const endOfToday = addLondonDays(now, 1).toISOString();
  const { data } = await db
    .from("entries")
    .select("competition_id, next_due_at, competition:competitions(prize, closes_at)")
    .eq("user_id", settings.user_id)
    .eq("status", "entered")
    .neq("reentry", "none")
    .lt("next_due_at", endOfToday)
    .order("next_due_at", { ascending: true });

  type Row = { competition: Pick<Competition, "prize" | "closes_at"> | null };
  const due = ((data ?? []) as unknown as Row[]).filter((r) => r.competition && !isClosed(r.competition, now));

  let sent = 0;
  if (due.length) {
    ({ sent } = await sendToUser(settings.user_id, {
      title: `${plural(due.length, "re-entry", "re-entries")} due today`,
      body: listPrizes(due.map((r) => r.competition!.prize)),
      url: "/entered",
      tag: "reentry",
    }));
  }
  await db.from("user_settings").update({ last_reentry_on: londonDateKey(now) }).eq("user_id", settings.user_id);
  return { count: due.length, sent };
}

async function closingSoon(settings: UserSettings, now: Date): Promise<{ count: number; sent: number }> {
  const db = adminClient();
  const in24h = new Date(now.getTime() + 86_400_000).toISOString();
  const [{ data }, { data: logged }] = await Promise.all([
    db
      .from("entries")
      .select("competition_id, competition:competitions!inner(prize, closes_at)")
      .eq("user_id", settings.user_id)
      .eq("status", "entered")
      .gt("competition.closes_at", now.toISOString())
      .lte("competition.closes_at", in24h),
    db.from("notification_log").select("competition_id").eq("user_id", settings.user_id).eq("kind", "closing"),
  ]);

  type Row = { competition_id: string; competition: Pick<Competition, "prize" | "closes_at"> };
  const already = new Set((logged ?? []).map((l) => l.competition_id as string));
  const closing = ((data ?? []) as unknown as Row[])
    .filter((r) => !already.has(r.competition_id))
    .sort((a, b) => (a.competition.closes_at ?? "").localeCompare(b.competition.closes_at ?? ""));
  if (!closing.length) return { count: 0, sent: 0 };

  const first = closing[0].competition;
  const { sent } = await sendToUser(
    settings.user_id,
    closing.length === 1
      ? { title: `Closing soon: ${first.prize}`, body: describeClosing(first.closes_at, now).text, url: "/entered", tag: "closing" }
      : {
          title: `${closing.length} entered competitions close within 24 hours`,
          body: listPrizes(closing.map((r) => r.competition.prize)),
          url: "/entered",
          tag: "closing",
        },
  );
  await db
    .from("notification_log")
    .upsert(
      closing.map((r) => ({ user_id: settings.user_id, kind: "closing", competition_id: r.competition_id })),
      { onConflict: "user_id,kind,competition_id", ignoreDuplicates: true },
    );
  return { count: closing.length, sent };
}

/** Run by the notify cron: digest, re-entry reminders and closing-soon alerts for every subscribed user. */
export async function runNotifications(now = new Date()): Promise<UserResult[]> {
  const db = adminClient();
  const [{ data: settingsRows, error }, { data: subs }] = await Promise.all([
    db.from("user_settings").select("*"),
    db.from("push_subscriptions").select("user_id"),
  ]);
  if (error) throw new Error(`Couldn't load settings: ${error.message}`);
  const subscribed = new Set((subs ?? []).map((s) => s.user_id as string));

  const results: UserResult[] = [];
  for (const settings of (settingsRows ?? []) as UserSettings[]) {
    if (!subscribed.has(settings.user_id)) continue;
    const due = duePushes(settings, now);
    const result: UserResult = { userId: settings.user_id, sent: 0 };
    if (due.digest) {
      const r = await digest(settings, now);
      result.digest = r.count;
      result.sent += r.sent;
    }
    if (due.reentry) {
      const r = await reentries(settings, now);
      result.reentry = r.count;
      result.sent += r.sent;
    }
    if (due.closing) {
      const r = await closingSoon(settings, now);
      result.closing = r.count;
      result.sent += r.sent;
    }
    results.push(result);
  }
  return results;
}
