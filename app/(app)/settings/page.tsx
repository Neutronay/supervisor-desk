import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/data";
import { saveSettings } from "@/app/actions";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const viewer = await getViewer();
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("email_notifications").eq("id", viewer.id).single();
  return (
    <>
      <header><h1 className="text-[26px] font-bold">Settings</h1></header>
      <form action={saveSettings} className="panel grid max-w-xl gap-3">
        <h2 className="text-[17px]">Email notifications</h2>
        <label className="flex items-start gap-2"><input type="checkbox" name="emails" defaultChecked={data?.email_notifications ?? true} className="mt-1" />
          <span>Email me when something needs my attention: submissions, approvals, comments, new meeting logs and weekly reminders.</span></label>
        <div><button className="btn btn-primary">Save</button></div>
      </form>
      <div className="panel max-w-xl"><h2 className="mb-1 text-[17px]">Password</h2><Link href="/set-password" className="text-accent">Change your password</Link></div>
    </>
  );
}
