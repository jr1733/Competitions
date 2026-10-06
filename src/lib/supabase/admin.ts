import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "../env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client for cron jobs and trusted route handlers. It bypasses
 * Row Level Security, so never import this from client code.
 */
export function adminClient(): SupabaseClient {
  if (admin) return admin;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing environment variable SUPABASE_SECRET_KEY. See README → Setup.");
  admin = createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
