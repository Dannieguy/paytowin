import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side only. The board renders with the service role, so the browser
 * never talks to Supabase directly and there is no anon client to leak.
 *
 * Returns null when the project is not configured yet, so a fresh checkout
 * shows an empty board and working setup instructions rather than a 500.
 */
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
