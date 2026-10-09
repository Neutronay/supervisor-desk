import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Invite and password-reset emails link here with ?token_hash=...&type=invite|recovery
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const sb = await createClient();
    const { error } = await sb.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}/set-password`);
  }
  return NextResponse.redirect(`${origin}/login?err=${encodeURIComponent("That link is invalid or has expired. Ask for a new one.")}`);
}
