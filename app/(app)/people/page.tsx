import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/data";
import { AREAS } from "@/lib/domain";
import { invitePerson } from "@/app/actions";

export const metadata = { title: "People" };

export default async function People() {
  const viewer = await getViewer();
  if (viewer.role !== "coordinator") redirect("/dashboard");
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id, full_name, role").order("role").order("full_name");

  return (
    <>
      <header>
        <h1 className="text-[26px] font-bold">People</h1>
        <p className="text-soft">Invite supervisors, students and co-ordinators. They get an email to set their own password.</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <form action={invitePerson} className="panel grid content-start gap-3">
          <h2 className="text-[17px]">Invite someone</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="fn">Full name</label><input id="fn" name="full_name" className="input" required /></div>
            <div><label className="label" htmlFor="em">Email</label><input id="em" name="email" type="email" className="input" required /></div>
          </div>
          <div><label className="label" htmlFor="rl">Role</label>
            <select id="rl" name="role" className="input"><option value="student">Student</option><option value="supervisor">Supervisor</option><option value="coordinator">Programme coordinator</option></select></div>
          <fieldset className="grid gap-3 rounded-md border border-line p-3">
            <legend className="px-1 text-xs text-soft">Student details (students only)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="mt">Matric number</label><input id="mt" name="matric" className="input" /></div>
              <div><label className="label" htmlFor="pg">Programme</label><select id="pg" name="programme" className="input"><option>MEd</option><option>PhD</option><option>MSc</option><option>MPhil</option></select></div>
            </div>
            <div><label className="label" htmlFor="ti">Project title</label><input id="ti" name="title" className="input" /></div>
            <div><label className="label" htmlFor="ar">Research area</label><select id="ar" name="area" className="input">{AREAS.map((a) => <option key={a}>{a}</option>)}</select></div>
          </fieldset>
          <fieldset className="grid gap-3 rounded-md border border-line p-3">
            <legend className="px-1 text-xs text-soft">Supervisor details (supervisors only)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">{AREAS.map((a) => <label key={a} className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="areas" value={a} />{a}</label>)}</div>
            <div className="max-w-[140px]"><label className="label" htmlFor="cp">Capacity</label><input id="cp" name="capacity" type="number" min={1} defaultValue={4} className="input" /></div>
          </fieldset>
          <div><button className="btn btn-primary">Send invitation</button></div>
        </form>
        <section className="panel">
          <h2 className="mb-2 text-[17px]">Everyone ({data?.length ?? 0})</h2>
          {(data ?? []).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between border-b border-line py-2 last:border-0"><span>{p.full_name}</span><span className="chip capitalize">{p.role}</span></div>
          ))}
        </section>
      </div>
    </>
  );
}
