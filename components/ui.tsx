import Link from "next/link";
import { isOverdue, msName, type Student, type Tone } from "@/lib/domain";

const TONES: Record<Tone, string> = {
  good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", info: "bg-info-soft text-info"
};
export const Pill = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>
);

export function Bar({ pct, tone }: { pct: number; tone?: "bad" | "warn" }) {
  const c = tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface2" role="img" aria-label={`${pct} percent`}>
      <i className={`block h-full ${c}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const STEP: Record<string, string> = {
  approved: "bg-good-soft border-good text-good",
  submitted: "bg-info-soft border-info text-info",
  in_progress: "bg-accent-soft border-accent text-accent",
  not_started: "bg-surface border-line text-soft"
};
/** Nine-step milestone strip. Each step links to the student's detail panel. */
export function Track({ s, href }: { s: Student; href: string }) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {s.ms.map((m, i) => (
        <Link key={m.milestone_id} href={href} title={`${msName(m.milestone_id)}: ${m.status.replace("_", " ")}`} scroll={false}
          className={`rounded border px-0.5 py-1 text-center font-mono text-[11px] ${STEP[m.status]} ${isOverdue(m) ? "!border-bad !bg-bad-soft !text-bad" : ""}`}>
          {m.status === "approved" ? "✓" : i + 1}
        </Link>
      ))}
    </div>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="px-3 py-8 text-center text-soft">{children}</div>
);
export const Stat = ({ label, value, tone }: { label: string; value: number; tone?: Tone }) => (
  <div className="panel">
    <div className="text-[11px] uppercase tracking-widest text-soft">{label}</div>
    <div className={`font-display text-3xl font-bold ${tone ? TONES[tone].split(" ")[1] : ""}`}>{value}</div>
  </div>
);
