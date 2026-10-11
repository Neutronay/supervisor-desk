import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getViewer, pageNum } from "@/lib/data";
import { AREAS, PAGE_SIZE, ROLE_LABEL, isManager, type Role } from "@/lib/domain";
import { invitePerson } from "@/app/actions";
import { Pager } from "@/components/pager";
import { Pill } from "@/components/ui";

export const metadata = { title: "People" };

export default async function People({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; role?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!isManager(viewer.role)) redirect("/dashboard");
  const page = pageNum(sp.page);
  const admin = viewer.role === "admin";
  const depts = await getDepartments();
  const sb = await createClient();

  let q = sb.from("profiles").select("id, full_name, role, active, department:departments(name)", { count: "exact" }).order("role").order("full_name");
  if (sp.role) q = q.eq("role", sp.role);
  if (sp.q?.trim()) q = q.ilike("full_name", `%${sp.q.trim().replace(/[%,()]/g, "")}%`);
  const { data, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const roles: Role[] = ["student", "supervisor", ...(admin ? (["coordinator", "admin"] as Role[]) : [])];

  return (
    <>
      <header>
        <h1 className="text-[26px] font-bold">People</h1>
        <p className="text-soft">Invite people and manage their details. Invited people get an email to set their own password.</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <form action={invitePerson} className="panel grid content-start gap-3">
          <h2 className="text-[17px]">Invite someone</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="fn">Full name</label><input id="fn" name="full_name" className="input" required /></div>
            <div><label className="label" htmlFor="em">Email</label><input id="em" name="email" type="email" className="input" required /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="rl">Role</label>
              <select id="rl" name="role" className="input">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
            {admin && (
              <div><label className="label" htmlFor="dp">Department</label>
                <select id="dp" name="department_id" className="input">{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                <span className="hint">Not used for administrators.</span></div>
            )}
          </div>
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

        <section className="panel grid content-start gap-3">
          <h2 className="text-[17px]">Everyone ({count ?? 0})</h2>
          <form className="flex flex-wrap gap-2" role="search">
            <input name="q" defaultValue={sp.q} placeholder="Search by name" aria-label="Search people" className="input !w-auto flex-1" />
            <select name="role" defaultValue={sp.role ?? ""} aria-label="Filter by role" className="input !w-auto"><option value="">All roles</option>{(["student", "supervisor", "coordinator", "admin"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            <button className="btn btn-sm">Filter</button>
          </form>
          <div>
            {(data ?? []).map((p: any) => (
              <Link key={p.id} href={`/people/${p.id}`} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-0 hover:text-accent">
                <span>{p.full_name}{admin && p.department?.name ? <span className="hint"> · {p.department.name}</span> : null}</span>
                <span className="flex items-center gap-2">{!p.active && <Pill tone="bad">Inactive</Pill>}<span className="chip">{ROLE_LABEL[p.role as Role]}</span></span>
              </Link>
            ))}
          </div>
          <Pager page={page} total={count ?? 0} path="/people" params={{ q: sp.q, role: sp.role }} />
        </section>
      </div>
    </>
  );
}
