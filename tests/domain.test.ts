import { describe, expect, it } from "vitest";
import { addDays, diffDays, fmtDate, health, isOverdue, pageCount, progressOf, suggestFor, type Student, type Supervisor } from "@/lib/domain";
import { safeBack } from "@/lib/safe-back";
import { describe as describeAudit } from "@/lib/audit";

const T = "2026-10-10";
const ms = (statuses: string[], due = "2027-01-01") =>
  statuses.map((status, i) => ({ milestone_id: `m${i + 1}`, status: status as any, due_on: due, completed_on: null }));
const student = (over: Partial<Student> = {}): Student => ({
  id: "s", full_name: "S", matric: "1", programme: "MEd", title: "t", area: "Science Education",
  supervisor_id: "p", assigned_on: null, ms: ms(["approved", "in_progress", "not_started"]), ...over
});
const sup = (id: string, areas: string[], capacity: number, load: number, department_id: string | null = null): Supervisor =>
  ({ id, full_name: id, areas, capacity, load, department_id });

describe("dates", () => {
  it("adds and diffs days across month ends", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(diffDays("2026-03-01", "2026-02-01")).toBe(28);
    expect(fmtDate("2026-10-09")).toBe("9 Oct 2026");
    expect(fmtDate(null)).toBe("Not set");
  });
});

describe("milestones", () => {
  it("is overdue only when unfinished and past due", () => {
    expect(isOverdue({ milestone_id: "m1", status: "in_progress", due_on: "2026-10-09", completed_on: null }, T)).toBe(true);
    expect(isOverdue({ milestone_id: "m1", status: "in_progress", due_on: "2026-10-10", completed_on: null }, T)).toBe(false);
    expect(isOverdue({ milestone_id: "m1", status: "submitted", due_on: "2020-01-01", completed_on: null }, T)).toBe(false);
    expect(isOverdue({ milestone_id: "m1", status: "approved", due_on: "2020-01-01", completed_on: null }, T)).toBe(false);
  });
  it("measures progress by approved milestones", () => {
    expect(progressOf(student({ ms: ms(["approved", "approved", "in_progress", "not_started"]) }))).toBe(50);
  });
});

describe("health", () => {
  it("flags a missing supervisor first", () => expect(health(student({ supervisor_id: null }), null, T).key).toBe("unassigned"));
  it("flags overdue work next, with a count", () => {
    const h = health(student({ ms: ms(["in_progress", "not_started"], "2026-09-01") }), "2026-10-09", T);
    expect(h).toMatchObject({ key: "overdue", label: "2 overdue" });
  });
  it("flags a month without a meeting", () => {
    expect(health(student(), "2026-08-01", T).key).toBe("quiet");
    expect(health(student(), null, T).key).toBe("quiet");
    expect(health(student(), "2026-10-01", T).key).toBe("ontrack");
  });
  it("reports completion", () => expect(health(student({ ms: ms(["approved", "approved"]) }), "2026-10-09", T).key).toBe("done"));
});

describe("supervisor suggestions", () => {
  it("prefers area match, then free capacity, and never suggests a full supervisor first", () => {
    const out = suggestFor(student(), [sup("full", ["Science Education"], 2, 2), sup("match", ["Science Education"], 4, 1), sup("other", [], 4, 0)]);
    expect(out.map((o) => o.sp.id)).toEqual(["match", "other", "full"]);
    expect(out[2].free).toBe(0);
  });
  it("only suggests supervisors from the student's own department", () => {
    const out = suggestFor(student({ department_id: "A" }), [sup("a", [], 4, 0, "A"), sup("b", ["Science Education"], 4, 0, "B")]);
    expect(out.map((o) => o.sp.id)).toEqual(["a"]);
  });
});

describe("helpers", () => {
  it("counts pages, at least one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(21)).toBe(2);
    expect(pageCount(40)).toBe(2);
  });
  it("only redirects to same-site paths", () => {
    expect(safeBack("/documents?f=revision", "/x")).toBe("/documents?f=revision");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", null])
      expect(safeBack(bad as any, "/x")).toBe("/x");
  });
  it("describes audit rows in plain English", () => {
    const names = new Map([["p1", "Dr. A"]]);
    const row = { id: 1, at: "", actor_name: "C", action: "update" as const, table_name: "students", row_id: "s", student_id: "s", old_data: { supervisor_id: null }, new_data: { supervisor_id: "p1" } };
    expect(describeAudit(row, names)).toBe("supervisor: none → Dr. A");
    expect(describeAudit({ ...row, table_name: "student_milestones", row_id: "u:m2", old_data: { status: "in_progress" }, new_data: { status: "submitted" } }, names))
      .toBe("Proposal defence. status: in_progress → submitted");
  });
});
