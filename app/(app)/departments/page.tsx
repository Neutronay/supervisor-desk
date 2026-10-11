import { redirect } from "next/navigation";
import { getDepartments, getViewer } from "@/lib/data";
import { saveDepartment } from "@/app/actions";

export const metadata = { title: "Departments" };

export default async function Departments() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") redirect("/dashboard");
  const depts = await getDepartments();
  return (
    <>
      <header>
        <h1 className="text-[26px] font-bold">Departments</h1>
        <p className="text-soft">Each department has its own coordinator, supervisors and students. Coordinators only ever see their own department.</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel grid content-start gap-2">
          <h2 className="text-[17px]">All departments</h2>
          {depts.map((d) => (
            <form key={d.id} action={saveDepartment} className="flex gap-2">
              <input type="hidden" name="id" value={d.id} />
              <input name="name" defaultValue={d.name} aria-label={`Name of ${d.name}`} className="input" />
              <button className="btn btn-sm">Rename</button>
            </form>
          ))}
        </section>
        <form action={saveDepartment} className="panel grid content-start gap-3">
          <h2 className="text-[17px]">Add a department</h2>
          <div><label className="label" htmlFor="nm">Name</label><input id="nm" name="name" className="input" placeholder="Faculty of Science, Postgraduate" required /></div>
          <p className="hint">After adding it, invite its coordinator from People and choose this department.</p>
          <div><button className="btn btn-primary">Add department</button></div>
        </form>
      </div>
    </>
  );
}
