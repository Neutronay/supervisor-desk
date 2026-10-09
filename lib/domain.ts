// Pure domain logic, ported from the demo. No I/O in this file.

export type Role = "coordinator" | "supervisor" | "student";
export type MsStatus = "not_started" | "in_progress" | "submitted" | "approved";
export type DocStatus = "submitted" | "in_review" | "revision" | "approved";
export type Tone = "good" | "warn" | "bad" | "info";

export interface Milestone { milestone_id: string; status: MsStatus; due_on: string; completed_on: string | null }
export interface Student {
  id: string; full_name: string; matric: string; programme: string; title: string; area: string;
  supervisor_id: string | null; assigned_on: string | null; ms: Milestone[];
}
export interface Supervisor { id: string; full_name: string; areas: string[]; capacity: number; load: number }
export interface Log {
  id: string; student_id: string; supervisor_id: string; met_on: string; mode: string; minutes: number;
  summary: string; actions: string[]; next_meeting: string | null; acknowledged: boolean;
}
export interface Viewer { id: string; full_name: string; role: Role }

export const MILESTONES = [
  "Topic approval", "Proposal defence", "Ethics clearance", "Literature review", "Methodology",
  "Data collection", "Analysis and findings", "Full draft", "Final defence"
];
export const msName = (id: string) => MILESTONES[Number(id.slice(1)) - 1] ?? id;
export const MS_LABEL: Record<MsStatus, string> = {
  not_started: "Not started", in_progress: "In progress", submitted: "Awaiting approval", approved: "Approved"
};
export const DOC_LABEL: Record<DocStatus, string> = {
  submitted: "Submitted", in_review: "In review", revision: "Revision requested", approved: "Approved"
};
export const DOC_TONE: Record<DocStatus, Tone> = { submitted: "info", in_review: "warn", revision: "bad", approved: "good" };
export const AREAS = [
  "Educational Technology", "Science Education", "Vocational Education", "Measurement and Evaluation",
  "Curriculum Studies", "Guidance and Counselling", "Educational Administration"
];
export const LOG_MODES = ["In person", "Video call", "Phone call", "Email"];

// ---------- dates (Africa/Lagos, as ISO yyyy-mm-dd strings) ----------
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (iso: string, n: number) => new Date(parse(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) => Math.round((parse(a).getTime() - parse(b).getTime()) / 864e5);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string | null) => {
  if (!iso) return "Not set";
  const d = parse(iso.slice(0, 10));
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

// ---------- derived values ----------
export const isOverdue = (m: Milestone, t = today()) =>
  (m.status === "not_started" || m.status === "in_progress") && m.due_on < t;
export const currentMs = (s: Student) => s.ms.find((m) => m.status !== "approved") ?? null;
export const progressOf = (s: Student) => Math.round((100 * s.ms.filter((m) => m.status === "approved").length) / s.ms.length);

export function health(s: Student, lastMeeting: string | null, t = today()): { key: string; label: string; tone: Tone } {
  if (!s.supervisor_id) return { key: "unassigned", label: "Needs supervisor", tone: "warn" };
  const over = s.ms.filter((m) => isOverdue(m, t)).length;
  if (over) return { key: "overdue", label: `${over} overdue`, tone: "bad" };
  const gap = lastMeeting ? diffDays(t, lastMeeting) : 999;
  if (gap > 30) return { key: "quiet", label: `No meeting in ${gap === 999 ? "30+" : gap} days`, tone: "warn" };
  if (!currentMs(s)) return { key: "done", label: "Complete", tone: "good" };
  return { key: "ontrack", label: "On track", tone: "good" };
}

/** Best three supervisors for a student: area match first, then free capacity. */
export function suggestFor(s: Student, sups: Supervisor[]) {
  return sups
    .map((sp) => {
      const free = sp.capacity - sp.load;
      const match = sp.areas.includes(s.area);
      const score = (match ? 60 : 0) + Math.max(0, free) * 10 + (free <= 0 ? -100 : 0);
      const why = [
        match ? `Works in ${s.area}` : `Different area from ${s.area}`,
        free > 0 ? `${free} open slot${free === 1 ? "" : "s"} of ${sp.capacity}` : "At capacity"
      ].join(", ");
      return { sp, score, why, free };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
