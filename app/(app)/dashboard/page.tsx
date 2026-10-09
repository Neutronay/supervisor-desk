import { getLogs, getStudents, getSupervisors, getViewer } from "@/lib/data";
import { MS_LABEL, currentMs, fmtDate, health, isOverdue, msName, progressOf, today, type Student, type Viewer } from "@/lib/domain";
import { milestoneAction } from "@/app/actions";
import { Bar, Empty, Pill, Stat, Track } from "@/components/ui";

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

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { student: open } = await searchParams;
  const [viewer, students, sups, logs] = await Promise.all([getViewer(), getStudents(), getSupervisors(), getLogs()]);
  const supName = (id: string | null) => sups.find((x) => x.id === id)?.full_name ?? "No supervisor yet";
  const lastMeet = (id: string) => logs.find((l) => l.student_id === id)?.met_on ?? null; // logs are newest first
  const t = today();
  const overdue = students.reduce((n, s) => n + s.ms.filter((m) => isOverdue(m, t)).length, 0);
  const awaiting = students.reduce((n, s) => n + s.ms.filter((m) => m.status === "submitted").length, 0);

  return (
    <>
      <header>
        <h1 className="text-[26px] font-bold">Milestone tracker</h1>
        <p className="text-soft">Progress, deadlines and approvals for {viewer.role === "coordinator" ? "all students in the programme" : viewer.role === "supervisor" ? "students you supervise" : "your own project"}.</p>
      </header>

      {viewer.role !== "student" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Students" value={students.length} />
          <Stat label="Overdue milestones" value={overdue} tone={overdue ? "bad" : "good"} />
          <Stat label="Awaiting approval" value={awaiting} tone={awaiting ? "info" : undefined} />
          <Stat label="Without supervisor" value={students.filter((s) => !s.supervisor_id).length} tone="warn" />
        </div>
      )}

      {!students.length && <div className="panel"><Empty>No students to show yet.</Empty></div>}
      {students.map((s) => {
        const h = health(s, lastMeet(s.id), t);
        const isOpen = open === s.id || (viewer.role === "student" && students.length === 1);
        return (
          <article key={s.id} className="panel grid gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{s.full_name} <span className="font-mono text-xs text-soft">{s.programme} · {s.matric}</span></h3>
                <p className="mt-0.5">{s.title}</p>
                <p className="hint">Supervisor: {supName(s.supervisor_id)}</p>
              </div>
              <div className="flex items-center gap-2"><span className="chip">{s.area}</span><Pill tone={h.tone}>{h.label}</Pill></div>
            </div>
            <div className="flex items-center gap-3"><div className="flex-1"><Bar pct={progressOf(s)} /></div><span className="font-mono text-xs">{progressOf(s)}%</span></div>
            <Track s={s} href={isOpen && open === s.id ? "/dashboard" : `/dashboard?student=${s.id}`} />
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
    </>
  );
}
