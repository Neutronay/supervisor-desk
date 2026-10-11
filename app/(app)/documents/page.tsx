import Link from "next/link";
import { getDocsPage, getMyDocs, getStudentOptions, getViewer, pageNum } from "@/lib/data";
import { DOC_LABEL, DOC_TONE, fmtDate, msName, type DocStatus } from "@/lib/domain";
import { Empty, Pill } from "@/components/ui";
import { UploadForm } from "@/components/upload-form";
import { Pager } from "@/components/pager";

export const metadata = { title: "Documents" };
const FILTERS: (DocStatus | "all")[] = ["all", "submitted", "in_review", "revision", "approved"];

export default async function Documents({ searchParams }: { searchParams: Promise<{ f?: string; page?: string }> }) {
  const sp = await searchParams;
  const f = sp.f ?? "all";
  const page = pageNum(sp.page);
  const viewer = await getViewer();
  const [{ rows: shown, total }, students, mine] = await Promise.all([
    getDocsPage(page, f), getStudentOptions(), viewer.role === "student" ? getMyDocs(viewer.id) : Promise.resolve([])
  ]);
  const name = (id: string) => students.find((s) => s.id === id)?.full_name ?? "Unknown";

  return (
    <>
      <header>
        <h1 className="text-[26px] font-bold">Documents and review</h1>
        <p className="text-soft">{viewer.role === "student" ? "Upload chapters and respond to supervisor feedback." : "Review submissions, comment and record a decision."}</p>
      </header>
      {viewer.role === "student" && <UploadForm studentId={viewer.id} docs={mine} />}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((k) => (
          <Link key={k} href={k === "all" ? "/documents" : `/documents?f=${k}`} aria-current={f === k ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-[13px] ${f === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface text-soft"}`}>
            {k === "all" ? "All" : DOC_LABEL[k]}
          </Link>
        ))}
      </div>
      <section className="panel !p-0">
        {!shown.length && <Empty>No documents here yet.</Empty>}
        {shown.map((d) => (
          <Link key={d.id} href={`/documents/${d.id}`} className="grid gap-1 border-b border-line px-4 py-3 last:border-0 hover:bg-surface2 sm:grid-cols-[1fr_auto] sm:items-center">
            <span><b>{d.title}</b><br /><span className="hint">{viewer.role !== "student" && `${name(d.student_id)} · `}{msName(d.milestone_id)} · v{d.versions.length} · updated {fmtDate(d.updated_at)}</span></span>
            <Pill tone={DOC_TONE[d.status]}>{DOC_LABEL[d.status]}</Pill>
          </Link>
        ))}
      </section>
      <Pager page={page} total={total} path="/documents" params={{ f: f === "all" ? undefined : f }} />
    </>
  );
}
