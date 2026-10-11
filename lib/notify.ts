import "server-only";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Sends queued notification emails through Resend (https://resend.com).
 * Database triggers fill the `notifications` table; this drains it.
 * With no RESEND_API_KEY the queue is left untouched, so nothing is lost while email is not set up.
 */
export async function flushNotifications(limit = 50): Promise<{ sent: number; failed: number; skipped?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: 0, failed: 0, skipped: "RESEND_API_KEY is not set" };
  const from = process.env.EMAIL_FROM ?? "Supervision Desk <onboarding@resend.dev>";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const sb = adminClient();

  const { data: rows, error } = await sb.rpc("claim_notifications", { p_limit: limit });
  if (error) return { sent: 0, failed: 0, skipped: error.message };

  let sent = 0, failed = 0;
  const emails = new Map<string, string | undefined>();
  for (const n of (rows ?? []) as { id: string; user_id: string; subject: string; body: string; link: string | null }[]) {
    try {
      if (!emails.has(n.user_id)) emails.set(n.user_id, (await sb.auth.admin.getUserById(n.user_id)).data.user?.email);
      const to = emails.get(n.user_id);
      if (!to) throw new Error("No email address for this user");
      if (to.endsWith(".demo")) { // seeded demo accounts are not real inboxes
        await sb.from("notifications").update({ sent_at: new Date().toISOString(), last_error: "demo address, not sent" }).eq("id", n.id);
        continue;
      }
      const text = `${n.body}${n.link && site ? `\n\nOpen it: ${site}${n.link}` : ""}\n\nYou can turn these emails off in Settings.`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject: n.subject, text })
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      await sb.from("notifications").update({ sent_at: new Date().toISOString(), last_error: null }).eq("id", n.id);
      sent++;
    } catch (e) {
      failed++;
      await sb.from("notifications").update({ last_error: String((e as Error).message).slice(0, 300) }).eq("id", n.id);
    }
  }
  return { sent, failed };
}
