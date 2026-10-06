"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * The browser Supabase client. Every query runs as the signed-in user and is
 * limited by Row Level Security. Returns null when the env vars are missing.
 */
export function browserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: true, storageKey: "comper-auth", detectSessionInUrl: false },
        })
      : null;
  return client;
}

export function db(): SupabaseClient {
  const c = browserClient();
  if (!c) throw new Error("Supabase isn't configured");
  return c;
}
