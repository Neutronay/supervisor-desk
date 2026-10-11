import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer, pageNum } from "@/lib/data";
import { fmtDate, isManager } from "@/lib/domain";
import { AUDIT_TABLES, describe, type AuditRow } from "@/lib/audit";
import { Empty } from "@/components/ui";
import { Pager } from "@/components/pager";

export const metadata = { title: "Audit trail" };
const SIZE = 40;

export default async function Audit({ searchParams }: { searchParams: Promise<{ t?: string; page?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!isManager(viewer.role)) redirect("/dashboard");
  const page = pageNum(sp.page);
  const sb = await createClient();

  let q = sb.from("audit_log").select("*", { count: "exact" }).order("id", { ascending: false });
  if (sp.t && sp.t in AUDIT_TABLES) q = q.eq("table_name", sp.t);
  const { data, count } = await q.range((page - 1) * SIZE, page * SIZE - 1);
  const rows = (data ?? []) as AuditRow[];

  // Look up names for the people mentioned (students, supervisors in assignment changes).
  const ids = new Set<string>();
  rows.forEach((r) => {
    if (r.student_id) ids.add(r.student_id);
    ["supervisor_id"].forEach((k) => { const a = r.old_data?.[k], b = r.new_data?.[k]; if (typeof a === "string") ids.add(a); if (typeof b === "string") ids.add(b); });
  });
  const { data: people } = ids.size ? await sb.from("profiles").select("id, full_name").in("id", [...ids]) : { data: [] };
  const names = new Map<string, string>((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <header>
        <h1 className="text-[26px] font-bold">Audit trail</h1>
        <p className="text-soft">Every change to milestones, documents, meetings, assignments and accounts, newest first. Entries cannot be edited or deleted.</p>
      </header>
      <div className="flex flex-wrap gap-2" aria-label="Filter by type">
        {[["", "Everything"], ...Object.entries(AUDIT_TABLES)].map(([k, label]) => (
          <Link key={k} href={k ? `/audit?t=${k}` : "/audit"} aria-current={(sp.t ?? "") === k ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-[13px] ${(sp.t ?? "") === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface text-soft"}`}>{label}</Link>
        ))}
      </div>
      <section className="panel !p-0 overflow-x-auto">
        {!rows.length && <Empty>Nothing recorded yet.</Empty>}
        {rows.map((r) => (
          <div key={r.id} className="grid gap-0.5 border-b border-line px-4 py-2.5 last:border-0 sm:grid-cols-[150px_1fr]">
            <span className="font-mono text-xs text-soft">{fmtDate(r.at)} {new Date(r.at).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })}</span>
            <span>
              <b>{r.actor_name ?? "System"}</b> <span className="text-soft">· {AUDIT_TABLES[r.table_name] ?? r.table_name}{r.student_id && names.get(r.student_id) ? ` · ${names.get(r.student_id)}` : ""}</span>
              <br /><span className="text-[13px]">{describe(r, names)}</span>
            </span>
          </div>
        ))}
      </section>
      <Pager page={page} total={count ?? 0} path="/audit" params={{ t: sp.t }} size={SIZE} />
    </>
  );
}
