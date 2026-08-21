import { createClient } from "@supabase/supabase-js";

// Server-side only. The board renders with the service role, so the browser
// never talks to Supabase directly and there is no anon client to leak.
export const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
