"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { ok, fail, safeBack } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DOC_LABEL, LOG_MODES, type DocStatus } from "@/lib/domain";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/* ---------- auth ---------- */
export async function signIn(fd: FormData) {
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({ email: str(fd, "email"), password: str(fd, "password") });
  if (error) fail("/login", "Wrong email or password.");
  redirect("/dashboard");
}
export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
export async function requestReset(fd: FormData) {
  const email = str(fd, "email");
  if (!email) fail("/login", "Enter your email first.");
  const sb = await createClient();
  await sb.auth.resetPasswordForEmail(email);
  ok("/login", "If that email has an account, a reset link is on its way.");
}
export async function setPassword(fd: FormData) {
  const pw = str(fd, "password");
  if (pw.length < 8) fail("/set-password", "Use at least 8 characters.");
  if (pw !== str(fd, "confirm")) fail("/set-password", "The two passwords do not match.");
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) fail("/set-password", error.message);
  ok("/dashboard", "Password saved. Welcome.");
}

/* ---------- milestones ---------- */
const MS_OK: Record<string, string> = {
  start: "Milestone started.", submit: "Submitted for your supervisor's approval.",
  approve: "Milestone approved. The next one is now open.", return: "Returned to the student for more work."
};
export async function milestoneAction(fd: FormData) {
  const back = safeBack(fd.get("back"), "/dashboard");
  const op = str(fd, "op");
  const sb = await createClient();
  const { error } = await sb.rpc("transition_milestone", { p_student: str(fd, "student"), p_milestone: str(fd, "milestone"), p_action: op });
  if (error) fail(back, error.message);
  ok(back, MS_OK[op] ?? "Done.");
}

/* ---------- assignment (coordinator; RLS + capacity trigger enforce it) ---------- */
export async function assignSupervisor(fd: FormData) {
  const sup = str(fd, "supervisor");
  const sb = await createClient();
  const { error, data } = await sb.from("students").update({ supervisor_id: sup || null }).eq("id", str(fd, "student")).select("id");
  if (error) fail("/assign", error.message);
  if (!data?.length) fail("/assign", "Only the programme coordinator can change supervisors.");
  ok("/assign", sup ? "Supervisor assigned." : "Supervisor removed.");
}

/* ---------- documents ---------- */
export async function registerUpload(p: {
  docId: string; isNew: boolean; title: string; milestone: string; path: string; name: string; size: number; note: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (p.isNew) {
    if (!p.title.trim()) return { ok: false, error: "Give the document a title." };
    const { error } = await sb.from("documents").insert({ id: p.docId, student_id: user.id, milestone_id: p.milestone, title: p.title.trim() });
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await sb.from("document_versions").insert({
    document_id: p.docId, file_path: p.path, file_name: p.name, size_bytes: p.size, note: p.note.trim() || null, uploaded_by: user.id
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addComment(fd: FormData) {
  const id = str(fd, "doc");
  const back = `/documents/${id}`;
  const body = str(fd, "body");
  if (!body) fail(back, "Write a comment first.");
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("document_comments").insert({ document_id: id, author_id: user!.id, body });
  if (error) fail(back, error.message);
  ok(back, "Comment posted.");
}

export async function setVerdict(fd: FormData) {
  const id = str(fd, "doc");
  const back = `/documents/${id}`;
  const status = str(fd, "status") as DocStatus;
  const body = str(fd, "body");
  if (!(status in DOC_LABEL)) fail(back, "Unknown status.");
  if (status === "revision" && !body) fail(back, "Explain what needs revising so the student can act on it.");
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from("documents").update({ status }).eq("id", id).select("id");
  if (error) fail(back, error.message);
  if (!data?.length) fail(back, "You cannot review this document.");
  if (body) await sb.from("document_comments").insert({ document_id: id, author_id: user!.id, body });
  ok(back, `Status set to ${DOC_LABEL[status].toLowerCase()}.`);
}

/* ---------- supervision logs ---------- */
export async function addLog(fd: FormData) {
  const mode = str(fd, "mode");
  if (!LOG_MODES.includes(mode)) fail("/logs", "Pick how you met.");
  const summary = str(fd, "summary");
  if (!summary) fail("/logs", "Summarise the discussion.");
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("supervision_logs").insert({
    student_id: str(fd, "student"), supervisor_id: user!.id, met_on: str(fd, "met_on"), mode,
    minutes: Number(str(fd, "minutes")) || 30, summary,
    actions: str(fd, "actions").split("\n").map((s) => s.trim()).filter(Boolean),
    next_meeting: str(fd, "next") || null
  });
  if (error) fail("/logs", error.message);
  ok("/logs", "Meeting logged. The student will be asked to sign off.");
}
export async function ackLog(fd: FormData) {
  const sb = await createClient();
  const { error } = await sb.rpc("acknowledge_log", { p_log: str(fd, "log") });
  if (error) fail("/logs", error.message);
  ok("/logs", "Signed off. Thank you.");
}

/* ---------- people (coordinator only) ---------- */
export async function invitePerson(fd: FormData) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
  if (me?.role !== "coordinator") fail("/people", "Only the coordinator can invite people.");

  const role = str(fd, "role");
  const email = str(fd, "email");
  const full_name = str(fd, "full_name");
  if (!email || !full_name) fail("/people", "Name and email are required.");
  const meta: Record<string, unknown> = { role, full_name };
  if (role === "supervisor") {
    meta.areas = fd.getAll("areas").map(String);
    meta.capacity = Number(str(fd, "capacity")) || 4;
  } else if (role === "student") {
    for (const k of ["matric", "programme", "title", "area"]) {
      if (!str(fd, k)) fail("/people", "Students need a matric number, programme, title and research area.");
      meta[k] = str(fd, k);
    }
  } else if (role !== "coordinator") fail("/people", "Pick a role.");

  const { error } = await adminClient().auth.admin.inviteUserByEmail(email, {
    data: meta, redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/confirm`
  });
  if (error) fail("/people", error.message);
  ok("/people", `Invitation sent to ${email}.`);
}
