import Link from "next/link";
import { getLogs, getStudents, getSupervisors, getViewer } from "@/lib/data";
import { LOG_MODES, fmtDate, today } from "@/lib/domain";
import { ackLog, addLog } from "@/app/actions";
import { Empty, Pill } from "@/components/ui";

export const metadata = { title: "Logs" };

export default async function Logs({ searchParams }: { searchParams: Promise<{ student?: string; new?: string }> }) {
  const { student = "all", new: showForm } = await searchParams;
  const [viewer, logs, students, sups] = await Promise.all([getViewer(), getLogs(), getStudents(), getSupervisors()]);
  const sname = (id: string) => students.find((s) => s.id === id)?.full_name ?? "Unknown";
  const pname = (id: string) => sups.find((s) => s.id === id)?.full_name ?? "Unknown";
  const shown = logs.filter((l) => student === "all" || l.student_id === student);
  const mine = students.filter((s) => s.supervisor_id === viewer.id);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold">Supervision logs</h1>
          <p className="text-soft">A dated record of every meeting, with agreed actions and student sign-off.</p>
        </div>
        {viewer.role === "supervisor" && <Link href={showForm ? "/logs" : "/logs?new=1"} className="btn btn-primary">{showForm ? "Close form" : "Log a meeting"}</Link>}
      </header>

      {viewer.role === "supervisor" && showForm && (
        <form action={addLog} className="panel grid gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><label className="label" htmlFor="st">Student</label>
              <select id="st" name="student" className="input" required>{mine.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
            <div><label className="label" htmlFor="dt">Date</label><input id="dt" name="met_on" type="date" defaultValue={today()} max={today()} className="input" required /></div>
            <div><label className="label" htmlFor="mn">Minutes</label><input id="mn" name="minutes" type="number" min={5} max={600} defaultValue={45} className="input" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="md">How you met</label><select id="md" name="mode" className="input">{LOG_MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
            <div><label className="label" htmlFor="nx">Next meeting</label><input id="nx" name="next" type="date" min={today()} className="input" /></div>
          </div>
          <div><label className="label" htmlFor="sm">What was discussed</label><textarea id="sm" name="summary" className="input" required /></div>
          <div><label className="label" htmlFor="ac">Agreed actions, one per line</label><textarea id="ac" name="actions" className="input" /></div>
          <div><button className="btn btn-primary">Save log</button></div>
        </form>
      )}

      {viewer.role !== "student" && students.length > 1 && (
        <form className="max-w-xs"><label className="label" htmlFor="flt">Student</label>
          <div className="flex gap-2">
            <select id="flt" name="student" defaultValue={student} className="input"><option value="all">All students</option>{students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
            <button className="btn btn-sm">Filter</button>
          </div></form>
      )}

      <section className="grid gap-3">
        {!shown.length && <div className="panel"><Empty>No meetings logged yet.</Empty></div>}
        {shown.map((l) => (
          <article key={l.id} className="panel grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{sname(l.student_id)} <span className="font-normal text-soft">with {pname(l.supervisor_id)}</span></h3>
              <span className="font-mono text-xs text-soft">{fmtDate(l.met_on)} · {l.mode} · {l.minutes} min</span>
            </div>
            <p>{l.summary}</p>
            {l.actions.length > 0 && <ul className="list-disc pl-5 text-[13px]">{l.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="hint">{l.next_meeting ? `Next meeting ${fmtDate(l.next_meeting)}` : "No next meeting set"}</span>
              {l.acknowledged ? <Pill tone="good">Signed off</Pill> : viewer.id === l.student_id
                ? <form action={ackLog}><input type="hidden" name="log" value={l.id} /><button className="btn btn-sm btn-primary">Sign off</button></form>
                : <Pill tone="warn">Awaiting student sign-off</Pill>}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
