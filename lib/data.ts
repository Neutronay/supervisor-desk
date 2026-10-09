import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Log, Student, Supervisor, Viewer, DocStatus } from "@/lib/domain";

// Every query runs as the signed-in user, so Postgres RLS decides what comes back.

export const getViewer = cache(async (): Promise<Viewer> => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: p } = await sb.from("profiles").select("id, full_name, role").eq("id", user.id).maybeSingle();
  if (!p) redirect("/no-access");
  return p as Viewer;
});

export const getStudents = cache(async (): Promise<Student[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("students")
    .select("id, matric, programme, title, area, supervisor_id, assigned_on, profile:profiles!students_id_fkey(full_name), ms:student_milestones(milestone_id, status, due_on, completed_on)")
    .order("matric");
  if (error) throw new Error(error.message);
  return (data as any[]).map((r) => ({
    ...r,
    full_name: r.profile?.full_name ?? "Unknown",
    ms: [...r.ms].sort((a: any, b: any) => Number(a.milestone_id.slice(1)) - Number(b.milestone_id.slice(1)))
  }));
});

export const getSupervisors = cache(async (): Promise<Supervisor[]> => {
  const sb = await createClient();
  const [{ data, error }, { data: loads }] = await Promise.all([
    sb.from("supervisors").select("id, areas, capacity, profile:profiles!supervisors_id_fkey(full_name)"),
    sb.rpc("supervisor_loads")
  ]);
  if (error) throw new Error(error.message);
  const load = new Map<string, number>((loads ?? []).map((l: any) => [l.supervisor_id, l.load]));
  return (data as any[])
    .map((r) => ({ id: r.id, areas: r.areas, capacity: r.capacity, full_name: r.profile?.full_name ?? "Unknown", load: load.get(r.id) ?? 0 }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
});

export const getLogs = cache(async (): Promise<Log[]> => {
  const sb = await createClient();
  const { data, error } = await sb.from("supervision_logs").select("*").order("met_on", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Log[];
});

export interface DocRow {
  id: string; student_id: string; milestone_id: string; title: string; status: DocStatus; updated_at: string;
  versions: { version: number; uploaded_at: string }[];
}
export async function getDocs(): Promise<DocRow[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("documents")
    .select("id, student_id, milestone_id, title, status, updated_at, versions:document_versions(version, uploaded_at)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as DocRow[];
}

export async function getNavCounts(role: string) {
  const sb = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const head = { count: "exact" as const, head: true };
  const [overdue, unassigned, docs, logs] = await Promise.all([
    sb.from("student_milestones").select("*", head).in("status", ["not_started", "in_progress"]).lt("due_on", today),
    role === "coordinator" ? sb.from("students").select("*", head).is("supervisor_id", null) : Promise.resolve({ count: 0 }),
    sb.from("documents").select("*", head).in("status", ["submitted", "in_review"]),
    sb.from("supervision_logs").select("*", head).eq("acknowledged", false)
  ]);
  return { dashboard: overdue.count ?? 0, assign: unassigned.count ?? 0, documents: docs.count ?? 0, logs: logs.count ?? 0 };
}
