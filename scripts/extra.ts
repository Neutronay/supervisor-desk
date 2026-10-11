import type { SupabaseClient } from "@supabase/supabase-js";

export const PASSWORD = "SupervisionDemo1!";

/**
 * Demo data for the multi-department features: an administrator, plus a second department with its own
 * coordinator, supervisor and student. Safe to run more than once. Returns the user ids it touched.
 */
export async function seedExtra(sb: SupabaseClient): Promise<string[]> {
  const NAME = "Faculty of Science (demo)";
  let { data: dept } = await sb.from("departments").select("id").eq("name", NAME).maybeSingle();
  if (!dept) {
    const r = await sb.from("departments").insert({ name: NAME }).select("id").single();
    if (r.error) throw new Error(`department: ${r.error.message}`);
    dept = r.data;
  }
  const made: Record<string, string> = {};
  const make = async (email: string, meta: Record<string, unknown>) => {
    const { data, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return console.log(`  skipped ${email} (already exists)`);
      throw new Error(`${email}: ${error.message}`);
    }
    made[email] = data.user.id;
  };
  await make("admin@supdesk.demo", { role: "admin", full_name: "Site administrator" });
  await make("coordinator2@supdesk.demo", { role: "coordinator", full_name: "Science coordinator", department_id: dept.id });
  await make("ibrahim.yusuf@supdesk.demo", { role: "supervisor", full_name: "Dr. Ibrahim Yusuf", department_id: dept.id, areas: ["Science Education", "Curriculum Studies"], capacity: 3 });
  await make("blessing.okafor@supdesk.demo", {
    role: "student", full_name: "Blessing Okafor", department_id: dept.id, matric: "249031001", programme: "MEd",
    title: "Practical Work and Learning Outcomes in Senior Secondary Physics", area: "Science Education"
  });
  if (made["blessing.okafor@supdesk.demo"] && made["ibrahim.yusuf@supdesk.demo"]) {
    const r = await sb.from("students").update({ supervisor_id: made["ibrahim.yusuf@supdesk.demo"] }).eq("id", made["blessing.okafor@supdesk.demo"]);
    if (r.error) throw new Error(`assign: ${r.error.message}`);
  }
  console.log("Extra demo accounts: admin@supdesk.demo, coordinator2@supdesk.demo, ibrahim.yusuf@supdesk.demo, blessing.okafor@supdesk.demo");
  return Object.values(made);
}

/** Demo accounts are not real inboxes, so drop any emails their setup queued. */
export async function clearDemoNotifications(sb: SupabaseClient, userIds: string[]) {
  if (userIds.length) await sb.from("notifications").delete().in("user_id", userIds);
}
