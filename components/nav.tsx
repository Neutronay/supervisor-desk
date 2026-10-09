"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string; count?: number; alert?: boolean }

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Modules">
      {items.map((i) => {
        const on = path === i.href || path.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-2.5 py-2 ${on ? "bg-accent-soft font-semibold text-accent" : "text-soft hover:bg-surface2 hover:text-fg"}`}>
            <span>{i.label}</span>
            {i.count !== undefined && (
              <span className={`rounded-full px-1.5 font-mono text-[11px] ${i.alert && i.count ? "bg-bad-soft text-bad" : "bg-surface2 text-soft"}`}>{i.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
