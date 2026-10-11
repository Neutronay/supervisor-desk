import Link from "next/link";
import { pageCount } from "@/lib/domain";

/** Previous/next links that keep the other query parameters (filters, search). */
export function Pager({ page, total, path, params = {}, size }: { page: number; total: number; path: string; params?: Record<string, string | undefined>; size?: number }) {
  const pages = pageCount(total, size);
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const cls = "btn btn-sm";
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? <Link className={cls} href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="font-mono text-xs text-soft">Page {page} of {pages} · {total} total</span>
      {page < pages ? <Link className={cls} href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
