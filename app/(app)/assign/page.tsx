import { getStudents, getSupervisors, getViewer } from "@/lib/data";
import { suggestFor } from "@/lib/domain";
import { assignSupervisor } from "@/app/actions";
import { Bar, Empty, Pill } from "@/components/ui";

export const metadata = { title: "Supervisors" };

export default async function Assign() {
  const [viewer, students, sups] = await Promise.all([getViewer(), getStudents(), getSupervisors()]);
  const edit = viewer.role === "coordinator";
  const un = students.filter((s) => !s.supervisor_id);

  return (
    <>
      <header>
        <h1 className="text-[26px] font-bold">Supervisor assignment</h1>
        <p className="text-soft">Match students to supervisors by research area and available capacity.</p>
      </header>
      {!edit && <div className="panel hint">Only the programme coordinator can assign or change supervisors. You can see current loads below.</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        {edit && (
          <section className="panel">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-[17px]">Awaiting a supervisor</h2><Pill tone={un.length ? "warn" : "good"}>{un.length}</Pill></div>
            {!un.length && <Empty>Every student has a supervisor.</Empty>}
            {un.map((s) => (
              <div key={s.id} className="grid gap-1.5 border-b border-line py-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{s.full_name} <span className="font-mono text-xs text-soft">{s.programme}</span></h3><span className="chip">{s.area}</span></div>
                <p className="text-[13px]">{s.title}</p>
                <span className="hint">Suggested supervisors, best match first</span>
                {suggestFor(s, sups).map((o) => (
                  <form key={o.sp.id} action={assignSupervisor} className="grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-md bg-surface2 px-3 py-2">
                    <b>{o.sp.full_name}</b>
                    <input type="hidden" name="student" value={s.id} /><input type="hidden" name="supervisor" value={o.sp.id} />
                    <button className="btn btn-sm btn-primary row-span-2" disabled={o.free <= 0}>Assign</button>
                    <span className="hint">{o.why}</span>
                  </form>
                ))}
              </div>
            ))}
          </section>
        )}
        <section className={`panel ${edit ? "" : "lg:col-span-2"}`}>
          <h2 className="mb-3 text-[17px]">Supervisor capacity</h2>
          {sups.map((sp) => {
            const pct = Math.round((100 * sp.load) / sp.capacity);
            const mine = students.filter((s) => s.supervisor_id === sp.id);
            return (
              <div key={sp.id} className="grid gap-1.5 border-b border-line py-3 last:border-0">
                <div className="flex justify-between"><b>{sp.full_name}</b><span className="font-mono text-xs">{sp.load} / {sp.capacity}</span></div>
                <Bar pct={Math.min(100, pct)} tone={pct >= 100 ? "bad" : pct >= 75 ? "warn" : undefined} />
                <div className="flex flex-wrap gap-1.5">{sp.areas.map((a) => <span key={a} className="chip">{a}</span>)}</div>
                {mine.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span>{s.full_name} <span className="text-soft">{s.programme}</span></span>
                    {edit && (
                      <span className="flex items-center gap-2">
                        <form action={assignSupervisor} className="flex gap-1.5">
                          <input type="hidden" name="student" value={s.id} />
                          <select name="supervisor" defaultValue={sp.id} className="input !w-auto !py-0.5 text-[12.5px]" aria-label={`Reassign ${s.full_name}`}>
                            {sups.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                          </select>
                          <button className="btn btn-sm">Move</button>
                        </form>
                        <form action={assignSupervisor}><input type="hidden" name="student" value={s.id} /><input type="hidden" name="supervisor" value="" /><button className="btn btn-sm btn-danger">Remove</button></form>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}
