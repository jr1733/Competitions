"use client";

import { browserClient } from "../supabase/browser";

/** Call one of our route handlers as the signed-in user. */
export async function apiFetch<T>(path: string, body?: unknown): Promise<T> {
  const { data } = (await browserClient()?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}
