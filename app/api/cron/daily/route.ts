import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { flushNotifications } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Called once a day by Vercel Cron (see vercel.json). Mondays also queue the weekly reminders.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let reminders = 0;
  const monday = new Date().toLocaleDateString("en-US", { timeZone: "Africa/Lagos", weekday: "long" }) === "Monday";
  if (monday) {
    const { data, error } = await adminClient().rpc("queue_reminders");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    reminders = data ?? 0;
  }
  const result = await flushNotifications(200);
  return NextResponse.json({ monday, reminders, ...result });
}
