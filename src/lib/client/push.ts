"use client";

import { db } from "../supabase/browser";

/** Web Push helpers. iOS only allows push for apps added to the Home Screen (iOS 16.4+). */

export type PushSupport = "supported" | "unsupported" | "needs-install";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isIos && !standalone) return "needs-install";
  return hasApis ? "supported" : "unsupported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Ask permission, subscribe this device and save the subscription to Supabase. */
export async function subscribeThisDevice(userId: string): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Push isn't configured: NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser or phone settings.");

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));

  const json = subscription.toJSON();
  const { error } = await db()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: subscription.endpoint,
        user_id: userId,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent.slice(0, 300),
      },
      { onConflict: "endpoint" },
    );
  if (error) throw error;
}

export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await db().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe();
}
