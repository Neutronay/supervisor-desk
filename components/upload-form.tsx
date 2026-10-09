"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerUpload } from "@/app/actions";
import { MILESTONES, DOC_LABEL, type DocStatus } from "@/lib/domain";

const MAX = 25 * 1024 * 1024;
const EXT = /\.(pdf|docx?)$/i;

interface Props { studentId: string; docs: { id: string; title: string; status: DocStatus; milestone_id: string }[] }

/** Uploads straight from the browser to private Supabase Storage (RLS-checked), then records the version. */
export function UploadForm({ studentId, docs }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState("new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File;
    if (!file?.size) return setError("Choose a file.");
    if (!EXT.test(file.name)) return setError("Upload a PDF or Word file.");
    if (file.size > MAX) return setError("Files can be up to 25 MB.");

    const isNew = target === "new";
    const docId = isNew ? crypto.randomUUID() : target;
    const path = `${studentId}/${docId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    setBusy(true);
    const sb = createClient();
    const up = await sb.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
    if (up.error) { setBusy(false); return setError(up.error.message); }
    const res = await registerUpload({
      docId, isNew, path, name: file.name, size: file.size,
      title: String(form.get("title") ?? ""), milestone: String(form.get("milestone") ?? "m1"), note: String(form.get("note") ?? "")
    });
    if (!res.ok) { await sb.storage.from("documents").remove([path]); setBusy(false); return setError(res.error ?? "Upload failed."); }
    router.push(`/documents/${docId}?ok=${encodeURIComponent("Uploaded. Your supervisor has been notified in their queue.")}`);
  }

  const current = docs.find((d) => d.id === target);
  return (
    <form onSubmit={onSubmit} className="panel grid gap-3">
      <h2 className="text-[17px]">Upload a document</h2>
      <div>
        <label className="label" htmlFor="up-target">Upload as</label>
        <select id="up-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="new">A new document</option>
          {docs.map((d) => <option key={d.id} value={d.id}>New version of: {d.title} ({DOC_LABEL[d.status]})</option>)}
        </select>
      </div>
      {target === "new" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="up-title">Title</label><input id="up-title" name="title" className="input" placeholder="Chapter Two: Literature Review" /></div>
          <div><label className="label" htmlFor="up-ms">Milestone</label>
            <select id="up-ms" name="milestone" className="input">{MILESTONES.map((m, i) => <option key={i} value={`m${i + 1}`}>{i + 1}. {m}</option>)}</select></div>
        </div>
      )}
      {current && <p className="hint">Uploading again returns this document to your supervisor's queue.</p>}
      <div><label className="label" htmlFor="up-file">File (PDF or Word, up to 25 MB)</label><input id="up-file" name="file" type="file" accept=".pdf,.doc,.docx" className="input" /></div>
      <div><label className="label" htmlFor="up-note">What changed?</label><textarea id="up-note" name="note" className="input min-h-[70px]" placeholder="Short note for your supervisor" /></div>
      {error && <p className="text-sm font-medium text-bad" role="alert">{error}</p>}
      <div><button className="btn btn-primary" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button></div>
    </form>
  );
}
