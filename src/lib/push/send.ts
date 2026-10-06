import "server-only";
import webpush, { WebPushError } from "web-push";
import { adminClient } from "../supabase/admin";
import type { PushSubscriptionRow } from "../types";

export interface PushPayload {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

let configured = false;

function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("Push isn't configured: set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:comper@example.com", publicKey, privateKey);
  configured = true;
}

/** Send to every device the user has subscribed. Dead subscriptions are removed. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  configure();
  const db = adminClient();
  const { data, error } = await db.from("push_subscriptions").select("*").eq("user_id", userId);
  if (error) throw new Error(`Couldn't load push subscriptions: ${error.message}`);

  let sent = 0;
  let removed = 0;
  await Promise.all(
    ((data ?? []) as PushSubscriptionRow[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 6 * 60 * 60, urgency: "normal", ...(payload.tag ? { topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}) },
        );
        sent++;
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          removed++;
        } else {
          console.error("[push] send failed", err instanceof Error ? err.message : err);
        }
      }
    }),
  );
  return { sent, removed };
}
