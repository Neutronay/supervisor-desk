import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client. Bypasses RLS. Only call from code that has already checked the caller is a coordinator. */
export const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
