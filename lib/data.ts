import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, type DocStatus, type Log, type Student, type Supervisor, type Viewer } from "@/lib/domain";

// Every query runs as the signed-in user, so Postgres RLS decides what comes back.
const range = (page: number, size = PAGE_SIZE) => [(page - 1) * size, page * size - 1] as const;
export const pageNum = (v: string | undefined) => Math.max(1, Number.parseInt(v ?? "1", 10) || 1);
const msOrder = (a: { milestone_id: string }, b: { milestone_id: string }) => Number(a.milestone_id.slice(1)) - Number(b.milestone_id.slice(1));

export const getViewer = cache(async (): Promise<Viewer> => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: p } = await sb.from("profiles").select("id, full_name, role, department_id, active").eq("id", user.id).maybeSingle();
  if (!p || !p.active) redirect("/no-access");
  return p as Viewer;
});

export const getDepartments = cache(async (): Promise<{ id: string; name: string }[]> => {
  const sb = await createClient();
  const { data } = await sb.from("departments").select("id, name").order("name");
  return data ?? [];
});

const STUDENT_COLS = "id, matric, programme, title, area, supervisor_id, assigned_on, profile:profiles!students_id_fkey(full_name, department_id, department:departments(name)), ms:student_milestones(milestone_id, status, due_on, completed_on)";
const toStudent = (r: any): Student => ({
  ...r, full_name: r.profile?.full_name ?? "Unknown", department_id: r.profile?.department_id ?? null,
  department_name: r.profile?.department?.name ?? null, ms: [...r.ms].sort(msOrder)
});

/** One page of students, optionally narrowed by name or matric number. */
export async function getStudentsPage(page: number, q?: string): Promise<{ rows: Student[]; total: number }> {
  const sb = await createClient();
  let ids: string[] | null = null;
  const term = q?.trim().replace(/[%,()]/g, "");
  if (term) {
    const [byName, byMatric] = await Promise.all([
      sb.from("profiles").select("id").eq("role", "student").ilike("full_name", `%${term}%`).limit(500),
      sb.from("students").select("id").ilike("matric", `%${term}%`).limit(500)
    ]);
    ids = [...new Set([...(byName.data ?? []), ...(byMatric.data ?? [])].map((r) => r.id))];
    if (!ids.length) return { rows: [], total: 0 };
  }
  let query = sb.from("students").select(STUDENT_COLS, { count: "exact" }).order("matric");
  if (ids) query = query.in("id", ids);
  const [from, to] = range(page);
  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);
  return { rows: (data as any[]).map(toStudent), total: count ?? 0 };
}

export async function getStudent(id: string): Promise<Student | null> {
  const sb = await createClient();
  const { data } = await sb.from("students").select(STUDENT_COLS).eq("id", id).maybeSingle();
  return data ? toStudent(data) : null;
}

/** Id and name of every student the viewer can see, for filters and name lookups. */
export const getStudentOptions = cache(async (): Promise<{ id: string; full_name: string }[]> => {
  const sb = await createClient();
  const { data } = await sb.from("students").select("id, profile:profiles!students_id_fkey(full_name)").limit(1000);
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, full_name: r.profile?.full_name ?? "Unknown" })).sort((a, b) => a.full_name.localeCompare(b.full_name));
});

export async function getLastMeetings(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const sb = await createClient();
  const { data } = await sb.rpc("last_meetings", { p_ids: ids });
  return new Map(((data ?? []) as { student_id: string; last_met: string }[]).map((r) => [r.student_id, r.last_met]));
}

export async function getStats() {
  const sb = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const head = { count: "exact" as const, head: true };
  const [students, overdue, awaiting, unassigned] = await Promise.all([
    sb.from("students").select("*", head),
    sb.from("student_milestones").select("*", head).in("status", ["not_started", "in_progress"]).lt("due_on", today),
    sb.from("student_milestones").select("*", head).eq("status", "submitted"),
    sb.from("students").select("*", head).is("supervisor_id", null)
  ]);
  return { students: students.count ?? 0, overdue: overdue.count ?? 0, awaiting: awaiting.count ?? 0, unassigned: unassigned.count ?? 0 };
}

export const getSupervisors = cache(async (): Promise<Supervisor[]> => {
  const sb = await createClient();
  const [{ data, error }, { data: loads }] = await Promise.all([
    sb.from("supervisors").select("id, areas, capacity, profile:profiles!supervisors_id_fkey(full_name, department_id)"),
    sb.rpc("supervisor_loads")
  ]);
  if (error) throw new Error(error.message);
  const load = new Map<string, number>((loads ?? []).map((l: any) => [l.supervisor_id, l.load]));
  return (data as any[])
    .map((r) => ({ id: r.id, areas: r.areas, capacity: r.capacity, full_name: r.profile?.full_name ?? "Unknown", department_id: r.profile?.department_id ?? null, load: load.get(r.id) ?? 0 }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
});

/** Assignment screen: a page of unassigned students, plus a light list of everyone already assigned. */
export async function getAssignData(page: number) {
  const sb = await createClient();
  const [from, to] = range(page);
  const [un, assigned] = await Promise.all([
    sb.from("students").select("id, matric, programme, title, area, supervisor_id, profile:profiles!students_id_fkey(full_name, department_id)", { count: "exact" }).is("supervisor_id", null).order("matric").range(from, to),
    sb.from("students").select("id, programme, supervisor_id, profile:profiles!students_id_fkey(full_name)").not("supervisor_id", "is", null).limit(1000)
  ]);
  const light = (r: any) => ({ ...r, full_name: r.profile?.full_name ?? "Unknown", department_id: r.profile?.department_id ?? null, ms: [] });
  return {
    unassigned: ((un.data ?? []) as any[]).map(light) as Student[],
    unassignedTotal: un.count ?? 0,
    assigned: ((assigned.data ?? []) as any[]).map(light) as Student[]
  };
}

export async function getLogsPage(page: number, student?: string): Promise<{ rows: Log[]; total: number }> {
  const sb = await createClient();
  let q = sb.from("supervision_logs").select("*", { count: "exact" }).order("met_on", { ascending: false });
  if (student && student !== "all") q = q.eq("student_id", student);
  const [from, to] = range(page, 15);
  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(error.message);
  return { rows: data as Log[], total: count ?? 0 };
}

export interface DocRow {
  id: string; student_id: string; milestone_id: string; title: string; status: DocStatus; updated_at: string;
  versions: { version: number }[];
}
export async function getDocsPage(page: number, status?: string): Promise<{ rows: DocRow[]; total: number }> {
  const sb = await createClient();
  let q = sb.from("documents").select("id, student_id, milestone_id, title, status, updated_at, versions:document_versions(version)", { count: "exact" }).order("updated_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const [from, to] = range(page);
  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(error.message);
  return { rows: data as DocRow[], total: count ?? 0 };
}
export async function getMyDocs(studentId: string) {
  const sb = await createClient();
  const { data } = await sb.from("documents").select("id, title, status, milestone_id").eq("student_id", studentId).order("updated_at", { ascending: false });
  return (data ?? []) as { id: string; title: string; status: DocStatus; milestone_id: string }[];
}

export async function getNavCounts(role: string) {
  const sb = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const head = { count: "exact" as const, head: true };
  const [overdue, unassigned, docs, logs] = await Promise.all([
    sb.from("student_milestones").select("*", head).in("status", ["not_started", "in_progress"]).lt("due_on", today),
    role === "coordinator" || role === "admin" ? sb.from("students").select("*", head).is("supervisor_id", null) : Promise.resolve({ count: 0 }),
    sb.from("documents").select("*", head).in("status", ["submitted", "in_review"]),
    sb.from("supervision_logs").select("*", head).eq("acknowledged", false)
  ]);
  return { dashboard: overdue.count ?? 0, assign: unassigned.count ?? 0, documents: docs.count ?? 0, logs: logs.count ?? 0 };
}
