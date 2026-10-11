import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getViewer } from "@/lib/data";
import { AREAS, ROLE_LABEL, isManager, type Role } from "@/lib/domain";
import { movePerson, setPersonActive, updatePerson } from "@/app/actions";
import { Pill } from "@/components/ui";

export const metadata = { title: "Edit person" };
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

export default async function EditPerson({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!isManager(viewer.role)) redirect("/dashboard");
  const sb = await createClient();
  const { data } = await sb.from("profiles")
    .select("id, full_name, role, active, department_id, student:students(matric, programme, title, area), supervisor:supervisors(areas, capacity)")
    .eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as any;
  const role = p.role as Role;
  const stu = one<any>(p.student), sup = one<any>(p.supervisor);
  const admin = viewer.role === "admin";
  const locked = (role === "coordinator" || role === "admin") && !admin; // only administrators edit coordinators
  const depts = await getDepartments();

  return (
    <>
      <Link href="/people" className="text-[13px] text-accent">← People</Link>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-bold">{p.full_name}</h1><p className="text-soft">{ROLE_LABEL[role]}</p></div>
        {!p.active && <Pill tone="bad">Inactive</Pill>}
      </header>
      {locked && <div className="panel hint">Only an administrator can edit coordinators and administrators.</div>}

      {!locked && (
        <form action={updatePerson} className="panel grid max-w-2xl gap-3">
          <h2 className="text-[17px]">Details</h2>
          <input type="hidden" name="id" value={id} />
          <div><label className="label" htmlFor="n">Full name</label><input id="n" name="full_name" defaultValue={p.full_name} className="input" required /></div>
          {stu && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="mt">Matric number</label><input id="mt" name="matric" defaultValue={stu.matric} className="input" /></div>
                <div><label className="label" htmlFor="pg">Programme</label><select id="pg" name="programme" defaultValue={stu.programme} className="input">{["MEd", "PhD", "MSc", "MPhil"].map((x) => <option key={x}>{x}</option>)}</select></div>
              </div>
              <div><label className="label" htmlFor="ti">Project title</label><input id="ti" name="title" defaultValue={stu.title} className="input" /></div>
              <div><label className="label" htmlFor="ar">Research area</label><select id="ar" name="area" defaultValue={stu.area} className="input">{AREAS.map((x) => <option key={x}>{x}</option>)}</select></div>
              <p className="hint">Changing the programme does not move existing milestone deadlines.</p>
            </>
          )}
          {sup && (
            <>
              <input type="hidden" name="is_supervisor" value="1" />
              <div className="flex flex-wrap gap-x-4 gap-y-1">{AREAS.map((a) => <label key={a} className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="areas" value={a} defaultChecked={sup.areas.includes(a)} />{a}</label>)}</div>
              <div className="max-w-[140px]"><label className="label" htmlFor="cp">Capacity</label><input id="cp" name="capacity" type="number" min={1} defaultValue={sup.capacity} className="input" /></div>
            </>
          )}
          <div><button className="btn btn-primary">Save changes</button></div>
        </form>
      )}

      {!locked && p.id !== viewer.id && (
        <section className="panel grid max-w-2xl gap-3">
          <h2 className="text-[17px]">Access</h2>
          <p className="hint">{p.active ? "Deactivating blocks sign-in and hides all data from this person. Their history is kept." : "This account is deactivated."}</p>
          <form action={setPersonActive}>
            <input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={p.active ? "false" : "true"} />
            <button className={`btn btn-sm ${p.active ? "btn-danger" : "btn-primary"}`}>{p.active ? "Deactivate account" : "Reactivate account"}</button>
          </form>
        </section>
      )}

      {admin && role !== "admin" && depts.length > 1 && (
        <form action={movePerson} className="panel grid max-w-2xl gap-3">
          <h2 className="text-[17px]">Department</h2>
          <input type="hidden" name="id" value={id} />
          <select name="department_id" defaultValue={p.department_id ?? ""} aria-label="Department" className="input">{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <p className="hint">Moving a student clears their supervisor. A supervisor with students must have them reassigned first.</p>
          <div><button className="btn btn-sm">Move</button></div>
        </form>
      )}
    </>
  );
}
