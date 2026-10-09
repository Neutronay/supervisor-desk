import { Suspense } from "react";
import { getNavCounts, getViewer } from "@/lib/data";
import { signOut } from "@/app/actions";
import { Nav, type NavItem } from "@/components/nav";
import { Toast } from "@/components/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const c = await getNavCounts(viewer.role);
  const items: NavItem[] = [
    { href: "/dashboard", label: "Milestones", count: c.dashboard, alert: true },
    { href: "/assign", label: "Supervisors", count: c.assign },
    { href: "/documents", label: "Documents", count: c.documents },
    { href: "/logs", label: "Logs", count: c.logs },
    ...(viewer.role === "coordinator" ? [{ href: "/people", label: "People" }] : [])
  ];
  return (
    <div className="grid min-h-screen md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 border-b border-line bg-surface p-3 md:sticky md:top-0 md:h-screen md:gap-6 md:border-b-0 md:border-r md:px-3.5 md:py-5">
        <div className="px-1.5">
          <b className="font-display text-xl tracking-tight">Supervision Desk</b>
          <div className="text-[11px] uppercase tracking-widest text-soft">Postgraduate projects</div>
        </div>
        <Nav items={items} />
        <div className="flex items-center justify-between gap-2 text-xs text-soft md:mt-auto md:flex-col md:items-start">
          <span><b className="text-fg">{viewer.full_name}</b><br />{viewer.role === "coordinator" ? "Programme coordinator" : viewer.role === "supervisor" ? "Supervisor" : "Student"}</span>
          <form action={signOut}><button className="btn btn-sm">Sign out</button></form>
        </div>
      </aside>
      <main className="flex min-w-0 flex-col gap-5 px-4 pb-16 pt-5 md:px-7">{children}</main>
      <Suspense><Toast /></Suspense>
    </div>
  );
}
