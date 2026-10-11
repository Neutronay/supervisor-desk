import { getLastMeetings, getStats, getStudent, getStudentsPage, getSupervisors, getViewer, pageNum } from "@/lib/data";
import { MS_LABEL, currentMs, fmtDate, health, isManager, isOverdue, msName, progressOf, today, type Student, type Viewer } from "@/lib/domain";
import { milestoneAction } from "@/app/actions";
import { Bar, Empty, Pill, Stat, Track } from "@/components/ui";
import { Pager } from "@/components/pager";

export const metadata = { title: "Milestones" };

function Actions({ s, viewer }: { s: Student; viewer: Viewer }) {
  const cur = currentMs(s);
  if (!cur) return <p className="hint">All nine milestones are approved.</p>;
  const prevApproved = s.ms.findIndex((m) => m.milestone_id === cur.milestone_id) === 0 || s.ms[s.ms.findIndex((m) => m.milestone_id === cur.milestone_id) - 1].status === "approved";
  const buttons: { op: string; label: string; primary?: boolean }[] = [];
  if (viewer.id === s.id) {
    if (cur.status === "not_started" && prevApproved) buttons.push({ op: "start", label: "Start this milestone", primary: true });
    if (cur.status === "in_progress") buttons.push({ op: "submit", label: "Submit for approval", primary: true });
  } else if (viewer.role !== "student" && cur.status === "submitted") {
    buttons.push({ op: "approve", label: "Approve", primary: true }, { op: "return", label: "Return for more work" });
  }
  if (!buttons.length) return <p className="hint">{MS_LABEL[cur.status]}. Nothing for you to do on {msName(cur.milestone_id)} right now.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <form key={b.op} action={milestoneAction}>
          <input type="hidden" name="student" value={s.id} /><input type="hidden" name="milestone" value={cur.milestone_id} />
          <input type="hidden" name="op" value={b.op} /><input type="hidden" name="back" value={`/dashboard?student=${s.id}`} />
          <button className={`btn btn-sm ${b.primary ? "btn-primary" : ""}`}>{b.label}</button>
        </form>
      ))}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ student?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = pageNum(sp.page);
  const [viewer, { rows, total }, sups, stats] = await Promise.all([getViewer(), getStudentsPage(page, sp.q), getSupervisors(), getStats()]);
  const open = sp.student;
  // A student opened from a link (e.g. an email) may be on another page of the list.
  const extra = open && !rows.some((r) => r.id === open) ? await getStudent(open) : null;
  const students = extra ? [extra, ...rows] : rows;
  const lastMeet = await getLastMeetings(students.map((x) => x.id));
  const supName = (id: string | null) => sups.find((x) => x.id === id)?.full_name ?? "No supervisor yet";
  const t = today();

  return (
    <>
      <header>
        <h1 className="text-[26px] font-bold">Milestone tracker</h1>
        <p className="text-soft">Progress, deadlines and approvals for {viewer.role === "student" ? "your own project" : viewer.role === "supervisor" ? "students you supervise" : "everyone in scope"}.</p>
      </header>

      {viewer.role !== "student" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Students" value={stats.students} />
          <Stat label="Overdue milestones" value={stats.overdue} tone={stats.overdue ? "bad" : "good"} />
          <Stat label="Awaiting approval" value={stats.awaiting} tone={stats.awaiting ? "info" : undefined} />
          <Stat label="Without supervisor" value={stats.unassigned} tone="warn" />
        </div>
      )}

      {viewer.role !== "student" && stats.students > PAGE_HINT && (
        <form className="flex max-w-md gap-2" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search by name or matric number" aria-label="Search students" className="input" />
          <button className="btn btn-sm">Search</button>
        </form>
      )}

      {!students.length && <div className="panel"><Empty>{sp.q ? "No students match that search." : "No students to show yet."}</Empty></div>}
      {students.map((s) => {
        const h = health(s, lastMeet.get(s.id) ?? null, t);
        const isOpen = open === s.id || (viewer.role === "student" && students.length === 1);
        const keep = (id?: string) => { const x = new URLSearchParams(); if (sp.q) x.set("q", sp.q); if (page > 1) x.set("page", String(page)); if (id) x.set("student", id); const qs = x.toString(); return qs ? `/dashboard?${qs}` : "/dashboard"; };
        return (
          <article key={s.id} className="panel grid gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{s.full_name} <span className="font-mono text-xs text-soft">{s.programme} · {s.matric}</span></h3>
                <p className="mt-0.5">{s.title}</p>
                <p className="hint">Supervisor: {supName(s.supervisor_id)}{viewer.role === "admin" && s.department_name ? ` · ${s.department_name}` : ""}</p>
              </div>
              <div className="flex items-center gap-2"><span className="chip">{s.area}</span><Pill tone={h.tone}>{h.label}</Pill></div>
            </div>
            <div className="flex items-center gap-3"><div className="flex-1"><Bar pct={progressOf(s)} /></div><span className="font-mono text-xs">{progressOf(s)}%</span></div>
            <Track s={s} href={open === s.id ? keep() : keep(s.id)} />
            {isOpen && (
              <div className="grid gap-3 border-t border-line pt-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead><tr className="text-left text-[11px] uppercase tracking-widest text-soft"><th className="py-1 pr-3">Milestone</th><th className="pr-3">Status</th><th className="pr-3">Due</th><th>Completed</th></tr></thead>
                    <tbody>
                      {s.ms.map((m) => (
                        <tr key={m.milestone_id} className="border-t border-line">
                          <td className="py-1.5 pr-3">{msName(m.milestone_id)}</td>
                          <td className="pr-3"><Pill tone={m.status === "approved" ? "good" : m.status === "submitted" ? "info" : isOverdue(m, t) ? "bad" : "warn"}>{isOverdue(m, t) ? "Overdue" : MS_LABEL[m.status]}</Pill></td>
                          <td className="pr-3 font-mono text-xs">{fmtDate(m.due_on)}</td>
                          <td className="font-mono text-xs">{m.completed_on ? fmtDate(m.completed_on) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Actions s={s} viewer={viewer} />
              </div>
            )}
          </article>
        );
      })}
      <Pager page={page} total={total} path="/dashboard" params={{ q: sp.q }} />
    </>
  );
}
const PAGE_HINT = 8; // show the search box once the list is long enough to need it
