import { adminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/server/auth";

interface Body {
  oldEndpoint?: unknown;
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
}

const isHttps = (v: unknown): v is string => typeof v === "string" && v.startsWith("https://") && v.length < 2000;
const isKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,200}={0,2}$/.test(v);

/**
 * Called by the service worker when the browser rotates a push subscription.
 * Knowing the old (unguessable) endpoint is what authorises the swap.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const { oldEndpoint, subscription } = body;
  if (!isHttps(oldEndpoint) || !isHttps(subscription?.endpoint) || !isKey(subscription?.keys?.p256dh) || !isKey(subscription?.keys?.auth)) {
    return jsonError(400, "Invalid subscription");
  }
  const { error } = await adminClient()
    .from("push_subscriptions")
    .update({ endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth })
    .eq("endpoint", oldEndpoint);
  if (error) return jsonError(500, error.message);
  return new Response(null, { status: 204 });
}
