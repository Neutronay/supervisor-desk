import { msName } from "@/lib/domain";

export interface AuditRow {
  id: number; at: string; actor_name: string | null; action: "insert" | "update" | "delete";
  table_name: string; row_id: string | null; student_id: string | null;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
}

export const AUDIT_TABLES: Record<string, string> = {
  student_milestones: "Milestone", documents: "Document", document_versions: "Upload", supervision_logs: "Meeting log",
  students: "Student record", supervisors: "Supervisor record", profiles: "Account", departments: "Department"
};

const FIELD: Record<string, string> = {
  supervisor_id: "supervisor", assigned_on: "assigned on", full_name: "name", email_notifications: "email notifications",
  completed_on: "completed on", due_on: "due", department_id: "department", file_name: "file"
};
const show = (v: unknown, names: Map<string, string>) =>
  v === null || v === undefined ? "none" : typeof v === "string" && names.has(v) ? names.get(v)! : Array.isArray(v) ? v.join(", ") || "none" : String(v);

/** A short plain-English line for one audit row. `names` maps user ids to names. */
export function describe(r: AuditRow, names: Map<string, string>): string {
  const d = { ...(r.old_data ?? {}), ...(r.new_data ?? {}) } as Record<string, unknown>;
  const subject =
    r.table_name === "student_milestones" ? msName(String(r.row_id ?? "").split(":")[1] ?? "") :
    r.table_name === "documents" ? String(d.title ?? "") :
    r.table_name === "document_versions" ? `${d.file_name ?? "file"} (v${d.version ?? "?"})` :
    r.table_name === "supervision_logs" ? `meeting on ${d.met_on ?? ""}` :
    r.table_name === "departments" || r.table_name === "profiles" ? String(d.name ?? d.full_name ?? "") : "";
  if (r.action === "insert") return `Created${subject ? `: ${subject}` : ""}`;
  if (r.action === "delete") return `Deleted${subject ? `: ${subject}` : ""}`;
  const changes = Object.keys(r.new_data ?? {})
    .filter((k) => k !== "updated_at")
    .map((k) => `${FIELD[k] ?? k.replace(/_/g, " ")}: ${show(r.old_data?.[k], names)} → ${show(r.new_data?.[k], names)}`);
  return `${subject ? `${subject}. ` : ""}${changes.slice(0, 4).join("; ")}${changes.length > 4 ? "; …" : ""}`;
}
