/**
 * Runs every migration on an in-memory Postgres (PGlite) and checks the security rules:
 * who can see what, who can change what, and that the workflow functions refuse bad moves.
 * No Supabase project or network is needed.   npm test
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const id: Record<string, string> = {};
const deptA = "00000000-0000-0000-0000-00000000000a";
const deptB = "00000000-0000-0000-0000-00000000000b";

async function as<T>(who: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id[who]}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[];

async function makeUser(key: string, meta: Record<string, unknown>) {
  const r = await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [`${key}@t.test`, JSON.stringify(meta)]);
  id[key] = r[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(__dirname, "stubs.sql"), "utf8"));
  const dir = path.join(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8").replace(/create extension[^;]*;/gi, ""));
  }
  await q(`insert into departments (id, name) values ($1, 'Dept A'), ($2, 'Dept B')`, [deptA, deptB]);
  await makeUser("admin", { role: "admin", full_name: "Admin" });
  await makeUser("coordA", { role: "coordinator", full_name: "Coord A", department_id: deptA });
  await makeUser("coordB", { role: "coordinator", full_name: "Coord B", department_id: deptB });
  await makeUser("supA1", { role: "supervisor", full_name: "Sup A1", department_id: deptA, areas: ["Science Education"], capacity: 2 });
  await makeUser("supA2", { role: "supervisor", full_name: "Sup A2", department_id: deptA, areas: [], capacity: 1 });
  await makeUser("supB", { role: "supervisor", full_name: "Sup B", department_id: deptB, areas: [], capacity: 3 });
  for (const [k, d, m] of [["stuA1", deptA, "1"], ["stuA2", deptA, "2"], ["stuA3", deptA, "3"], ["stuB", deptB, "4"]] as const)
    await makeUser(k, { role: "student", full_name: k, department_id: d, matric: m, programme: "MEd", title: "T", area: "Science Education" });
  await as("coordA", () => q(`update students set supervisor_id = $1 where id = $2`, [id.supA1, id.stuA1]));
});

describe("visibility", () => {
  it("a student sees only their own record and milestones", async () => {
    const s = await as("stuA1", () => q(`select id from students`));
    expect(s.map((r) => r.id)).toEqual([id.stuA1]);
    const m = await as("stuA1", () => q(`select distinct student_id from student_milestones`));
    expect(m.map((r) => r.student_id)).toEqual([id.stuA1]);
  });
  it("a supervisor sees only the students assigned to them", async () => {
    const s = await as("supA1", () => q(`select id from students`));
    expect(s.map((r) => r.id)).toEqual([id.stuA1]);
  });
  it("a coordinator sees their own department only; an admin sees everything", async () => {
    expect((await as("coordA", () => q(`select id from students`))).length).toBe(3);
    expect((await as("coordB", () => q(`select id from students`))).map((r) => r.id)).toEqual([id.stuB]);
    expect((await as("admin", () => q(`select id from students`))).length).toBe(4);
    const profiles = await as("coordA", () => q(`select department_id from profiles`));
    expect(profiles.every((p) => p.department_id === deptA)).toBe(true);
  });
  it("supervisor capacity is visible only inside the department", async () => {
    const l = await as("coordA", () => q(`select * from supervisor_loads()`));
    expect(l.map((r) => r.supervisor_id).sort()).toEqual([id.supA1, id.supA2].sort());
  });
});

describe("assignment rules", () => {
  it("a student cannot assign themselves a supervisor", async () => {
    const r = await as("stuA2", () => q(`update students set supervisor_id = $1 where id = $2 returning id`, [id.supA1, id.stuA2]));
    expect(r.length).toBe(0);
  });
  it("a coordinator cannot touch another department's students", async () => {
    const r = await as("coordA", () => q(`update students set supervisor_id = $1 where id = $2 returning id`, [id.supB, id.stuB]));
    expect(r.length).toBe(0);
  });
  it("a supervisor cannot be assigned a student from another department", async () => {
    await expect(as("admin", () => q(`update students set supervisor_id = $1 where id = $2`, [id.supB, id.stuA2]))).rejects.toThrow(/same department/);
  });
  it("capacity cannot be exceeded", async () => {
    await as("coordA", () => q(`update students set supervisor_id = $1 where id = $2`, [id.supA2, id.stuA2]));
    await expect(as("coordA", () => q(`update students set supervisor_id = $1 where id = $2`, [id.supA2, id.stuA3]))).rejects.toThrow(/at capacity/);
  });
});

describe("milestone workflow", () => {
  it("only the student can submit, and only their supervisor can approve", async () => {
    await expect(as("supA1", () => q(`select transition_milestone($1, 'm1', 'submit')`, [id.stuA1]))).rejects.toThrow(/Only the student/);
    await as("stuA1", () => q(`select transition_milestone($1, 'm1', 'submit')`, [id.stuA1]));
    await expect(as("stuA1", () => q(`select transition_milestone($1, 'm1', 'approve')`, [id.stuA1]))).rejects.toThrow(/cannot review/);
    await expect(as("supA2", () => q(`select transition_milestone($1, 'm1', 'approve')`, [id.stuA1]))).rejects.toThrow(/cannot review/);
    await expect(as("coordB", () => q(`select transition_milestone($1, 'm1', 'approve')`, [id.stuA1]))).rejects.toThrow(/cannot review/);
    await as("supA1", () => q(`select transition_milestone($1, 'm1', 'approve')`, [id.stuA1]));
    const ms = await as("stuA1", () => q(`select milestone_id, status from student_milestones order by milestone_id limit 2`));
    expect(ms).toEqual([{ milestone_id: "m1", status: "approved" }, { milestone_id: "m2", status: "in_progress" }]);
  });
  it("milestones cannot be edited directly", async () => {
    const r = await as("stuA1", () => q(`update student_milestones set status = 'approved' where student_id = $1 returning 1`, [id.stuA1]));
    expect(r.length).toBe(0);
  });
});

describe("documents, comments and logs", () => {
  it("a student cannot create an already-approved document, but can create a submitted one", async () => {
    await expect(as("stuA1", () => q(`insert into documents (student_id, milestone_id, title, status) values ($1, 'm2', 'X', 'approved')`, [id.stuA1]))).rejects.toThrow(/row-level security/);
    const d = await as("stuA1", () => q(`insert into documents (student_id, milestone_id, title) values ($1, 'm2', 'Proposal') returning id`, [id.stuA1]));
    id.doc = d[0].id;
    await as("stuA1", () => q(`insert into document_versions (document_id, file_name, file_path, uploaded_by) values ($1, 'a.pdf', 'p', $2)`, [id.doc, id.stuA1]));
    const v = await as("stuA1", () => q(`select version from document_versions where document_id = $1`, [id.doc]));
    expect(v[0].version).toBe(1);
  });
  it("only the reviewing supervisor can change status, and other students cannot see the document", async () => {
    expect((await as("stuA1", () => q(`update documents set status = 'approved' where id = $1 returning 1`, [id.doc]))).length).toBe(0);
    expect((await as("supA2", () => q(`update documents set status = 'approved' where id = $1 returning 1`, [id.doc]))).length).toBe(0);
    expect((await as("stuA2", () => q(`select id from documents`))).length).toBe(0);
    expect((await as("supA1", () => q(`update documents set status = 'revision' where id = $1 returning 1`, [id.doc]))).length).toBe(1);
  });
  it("a new upload puts the document back in the queue", async () => {
    await as("stuA1", () => q(`insert into document_versions (document_id, file_name, uploaded_by) values ($1, 'b.pdf', $2)`, [id.doc, id.stuA1]));
    expect((await q(`select status from documents where id = $1`, [id.doc]))[0].status).toBe("submitted");
  });
  it("a supervisor can log meetings only for their own students", async () => {
    const ins = (who: string, student: string) =>
      as(who, () => q(`insert into supervision_logs (student_id, supervisor_id, met_on, mode, minutes, summary) values ($1, $2, current_date, 'In person', 30, 'x')`, [id[student], id[who]]));
    await ins("supA1", "stuA1");
    await expect(ins("supA1", "stuA2")).rejects.toThrow(/row-level security/);
    const last = await as("supA1", () => q(`select * from last_meetings($1)`, [[id.stuA1, id.stuA2]]));
    expect(last.map((r) => r.student_id)).toEqual([id.stuA1]);
  });
  it("only the student can sign off a log", async () => {
    const log = (await q(`select id from supervision_logs limit 1`))[0].id;
    await expect(as("supA1", () => q(`select acknowledge_log($1)`, [log]))).rejects.toThrow(/not found/i);
    await as("stuA1", () => q(`select acknowledge_log($1)`, [log]));
  });
});

describe("audit trail", () => {
  it("records who did what, scoped to the department, and cannot be altered", async () => {
    const rows = await as("coordA", () => q(`select table_name, actor_name from audit_log where table_name = 'student_milestones' and actor_name = 'Sup A1'`));
    expect(rows.length).toBeGreaterThan(0);
    expect((await as("coordB", () => q(`select 1 from audit_log where table_name = 'student_milestones'`))).length).toBe(0);
    expect((await as("stuA1", () => q(`select 1 from audit_log`))).length).toBe(0);
    expect((await as("coordA", () => q(`delete from audit_log returning 1`).catch(() => []))).length).toBe(0);
    const upd = (await q(`select old_data, new_data from audit_log where table_name = 'student_milestones' and new_data ->> 'status' = 'approved' limit 1`))[0];
    expect(upd.old_data).toMatchObject({ status: "submitted" });
    expect(Object.keys(upd.new_data)).toEqual(expect.arrayContaining(["status", "completed_on"])); // only changed columns are stored
  });
});

describe("notifications", () => {
  it("queues the right emails and respects opt-out", async () => {
    const forSup = await q(`select kind from notifications where user_id = $1`, [id.supA1]);
    expect(forSup.map((r) => r.kind)).toEqual(expect.arrayContaining(["assigned", "milestone_submitted", "document_uploaded"]));
    const forStu = await q(`select kind from notifications where user_id = $1`, [id.stuA1]);
    expect(forStu.map((r) => r.kind)).toEqual(expect.arrayContaining(["milestone_approved", "document_status", "log"]));
    const before = (await q(`select count(*)::int c from notifications where user_id = $1`, [id.supA1]))[0].c;
    await as("supA1", () => q(`select set_my_notifications(false)`));
    await as("stuA1", () => q(`select transition_milestone($1, 'm2', 'submit')`, [id.stuA1]));
    expect((await q(`select count(*)::int c from notifications where user_id = $1`, [id.supA1]))[0].c).toBe(before);
  });
  it("hands each pending email to one sender only", async () => {
    const a = await q(`select * from claim_notifications(100)`);
    expect(a.length).toBeGreaterThan(0);
    expect((await q(`select max(attempts)::int m from notifications`))[0].m).toBe(1);
  });
});

describe("people management", () => {
  it("a coordinator can edit people in their department, not coordinators or other departments", async () => {
    await as("coordA", () => q(`select update_person($1, 'Renamed', null, null, 'New title')`, [id.stuA1]));
    expect((await q(`select title from students where id = $1`, [id.stuA1]))[0].title).toBe("New title");
    await expect(as("coordA", () => q(`select update_person($1, 'Hack')`, [id.stuB]))).rejects.toThrow(/cannot edit/);
    await expect(as("coordA", () => q(`select update_person($1, 'Hack')`, [id.coordA]))).rejects.toThrow(/administrator/);
  });
  it("capacity cannot drop below the current load", async () => {
    await expect(as("coordA", () => q(`select update_person($1, 'Sup A1', null, null, null, null, null, 0)`, [id.supA1]))).rejects.toThrow(/lower than/);
  });
  it("a deactivated person loses all access", async () => {
    await as("coordA", () => q(`select set_person_active($1, false)`, [id.stuA3]));
    expect((await as("stuA3", () => q(`select id from students`))).length).toBe(0);
    await expect(as("coordA", () => q(`select set_person_active($1, false)`, [id.coordA]))).rejects.toThrow(/own account/);
  });
  it("only an admin can move people between departments", async () => {
    await expect(as("coordA", () => q(`select move_person_department($1, $2)`, [id.stuA2, deptB]))).rejects.toThrow(/administrator/);
    await as("admin", () => q(`select move_person_department($1, $2)`, [id.stuA2, deptB]));
    expect((await q(`select supervisor_id from students where id = $1`, [id.stuA2]))[0].supervisor_id).toBeNull();
    expect((await q(`select department_id from profiles where id = $1`, [id.stuA2]))[0].department_id).toBe(deptB);
  });
});
