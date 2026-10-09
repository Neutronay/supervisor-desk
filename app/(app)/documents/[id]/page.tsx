import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/data";
import { DOC_LABEL, DOC_TONE, fmtDate, fmtSize, msName, type DocStatus } from "@/lib/domain";
import { addComment, setVerdict } from "@/app/actions";
import { Pill } from "@/components/ui";

export const metadata = { title: "Document" };

export default async function DocDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const viewer = await getViewer();
  const { data: d } = await sb
    .from("documents")
    .select("id, title, status, milestone_id, student:profiles!documents_student_id_fkey(full_name)")
    .eq("id", id).maybeSingle();
  if (!d) notFound();

  const [{ data: versions }, { data: comments }] = await Promise.all([
    sb.from("document_versions").select("version, file_path, file_name, size_bytes, note, uploaded_at").eq("document_id", id).order("version", { ascending: false }),
    sb.from("document_comments").select("id, body, created_at, author:profiles!document_comments_author_id_fkey(full_name, role)").eq("document_id", id).order("created_at")
  ]);
  const paths = (versions ?? []).map((v: any) => v.file_path).filter(Boolean);
  const { data: signed } = paths.length ? await sb.storage.from("documents").createSignedUrls(paths, 600) : { data: [] };
  const urlFor = (p: string | null) => signed?.find((x) => x.path === p)?.signedUrl ?? undefined;
  const doc = d as any;
  const canReview = viewer.role !== "student";
  const status = doc.status as DocStatus;

  return (
    <>
      <Link href="/documents" className="text-[13px] text-accent">← All documents</Link>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{doc.title}</h1>
          <p className="text-soft">{doc.student?.full_name} · {msName(doc.milestone_id)}</p>
        </div>
        <Pill tone={DOC_TONE[status]}>{DOC_LABEL[status]}</Pill>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel">
          <h2 className="mb-2 text-[17px]">Versions</h2>
          {(versions ?? []).map((v: any) => (
            <div key={v.version} className="grid gap-0.5 border-b border-line py-2.5 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>v{v.version} <span className="font-normal text-soft">{v.file_name}</span></b>
                {urlFor(v.file_path) ? <a className="btn btn-sm" href={urlFor(v.file_path)}>Download</a> : <span className="hint">Demo entry, no file</span>}
              </div>
              <span className="hint">{fmtDate(v.uploaded_at)} · {fmtSize(v.size_bytes)}</span>
              {v.note && <p className="text-[13px]">{v.note}</p>}
            </div>
          ))}
        </section>

        <section className="panel grid content-start gap-3">
          <h2 className="text-[17px]">Discussion</h2>
          {!comments?.length && <p className="hint">No comments yet.</p>}
          {(comments ?? []).map((c: any) => (
            <div key={c.id} className={`rounded-md p-3 ${c.author?.role === "student" ? "bg-surface2" : "bg-accent-soft"}`}>
              <div className="mb-0.5 text-xs text-soft"><b className="text-fg">{c.author?.full_name}</b> · {fmtDate(c.created_at)}</div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          <form action={addComment} className="grid gap-2">
            <input type="hidden" name="doc" value={id} />
            <label className="label" htmlFor="body">{canReview ? "Comment, or explain a decision" : "Reply to your supervisor"}</label>
            <textarea id="body" name="body" className="input min-h-[80px]" />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-sm">Post comment</button>
              {canReview && (["in_review", "revision", "approved"] as DocStatus[]).map((s) => (
                <button key={s} formAction={setVerdict} name="status" value={s} className={`btn btn-sm ${s === "approved" ? "btn-primary" : ""}`} disabled={s === status}>
                  {s === "in_review" ? "Mark in review" : s === "revision" ? "Request revision" : "Approve"}
                </button>
              ))}
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
