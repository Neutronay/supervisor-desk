/**
 * Demo data: the same people, projects, documents and meetings as the original prototype.
 * Run once against a fresh project:  npm run seed
 * Every demo account gets the password below. Delete them before real use.
 */
import { createClient } from "@supabase/supabase-js";

const PASSWORD = "SupervisionDemo1!";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const addDays = (iso: string, n: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function user(email: string, meta: Record<string, unknown>) {
  const { data, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user.id;
}

async function main() {
  // supervisors: key, name, areas, capacity
  const SUPS: [string, string, string[], number][] = [
    ["s1", "Prof. Adaeze Okonkwo", ["Educational Technology", "Science Education"], 5],
    ["s2", "Dr. Babatunde Adeyemi", ["Educational Technology", "Vocational Education", "Measurement and Evaluation"], 4],
    ["s3", "Dr. Hauwa Bello", ["Science Education", "Curriculum Studies"], 4],
    ["s4", "Dr. Chinedu Eze", ["Guidance and Counselling", "Educational Administration"], 4],
    ["s5", "Dr. Folasade Ogunleye", ["Educational Administration", "Curriculum Studies", "Measurement and Evaluation"], 3]
  ];
  // id, name, matric, programme, title, area, supervisor, approved count, current status, started (days ago), interval
  const STUDENTS: [string, string, string, string, string, string, string | null, number, string, number][] = [
    ["u1", "Ngozi Umeh", "169031012", "PhD", "Augmented Reality Laboratories and Chemistry Achievement in Lagos Senior Secondary Schools", "Educational Technology", "s1", 4, "in_progress", 330],
    ["u2", "Tunde Balogun", "219031044", "MEd", "Learning Management System Adoption among Lecturers in Lagos Tertiary Institutions", "Educational Technology", "s2", 3, "submitted", 170],
    ["u3", "Amina Sani", "189031007", "PhD", "Inquiry-Based Instruction and Retention in Senior Secondary Biology", "Science Education", "s3", 2, "in_progress", 260],
    ["u4", "Kelechi Obi", "219031090", "MEd", "Peer Counselling and Examination Anxiety among SS3 Students", "Guidance and Counselling", "s4", 5, "in_progress", 250],
    ["u5", "Yetunde Adebayo", "229031023", "MEd", "Principal Instructional Leadership and Teacher Job Performance", "Educational Administration", "s5", 1, "in_progress", 120],
    ["u6", "Emeka Nwosu", "159031051", "PhD", "Competency-Based Curriculum Delivery in Technical Colleges", "Vocational Education", "s2", 6, "submitted", 560],
    ["u7", "Zainab Lawal", "229031068", "MEd", "Computer Adaptive Testing and the Validity of Physics Assessment", "Measurement and Evaluation", null, 0, "in_progress", 20],
    ["u8", "Seun Adeola", "229031071", "MEd", "Mobile Learning and Mathematics Self-Efficacy among JSS Students", "Educational Technology", null, 0, "in_progress", 18],
    ["u9", "Ifeoma Chukwu", "209031015", "PhD", "Gamification and Learner Engagement in Online Teacher Courses", "Educational Technology", null, 0, "in_progress", 25],
    ["u10", "Musa Garba", "219031102", "MEd", "Teacher Professional Development and Classroom Practice", "Curriculum Studies", "s3", 2, "in_progress", 140]
  ];
  const slug = (n: string) => n.toLowerCase().replace(/^(prof\.|dr\.)\s*/, "").replace(/[^a-z]+/g, ".");
  const id: Record<string, string> = {};

  id.coord = await user("coordinator@supdesk.demo", { role: "coordinator", full_name: "Programme coordinator" });
  for (const [k, name, areas, capacity] of SUPS) id[k] = await user(`${slug(name)}@supdesk.demo`, { role: "supervisor", full_name: name, areas, capacity });
  for (const [k, name, matric, programme, title, area, , , , ago] of STUDENTS)
    id[k] = await user(`${slug(name)}@supdesk.demo`, { role: "student", full_name: name, matric, programme, title, area, started_on: addDays(today, -ago) });

  for (const [k, , , programme, , , sup, done, cur, ago] of STUDENTS) {
    const gap = programme === "PhD" ? 70 : 45, start = addDays(today, -ago);
    if (sup) must(await sb.from("students").update({ supervisor_id: id[sup], assigned_on: addDays(start, 6) }).eq("id", id[k]), "assign");
    for (let i = 0; i < 9; i++) {
      const due = addDays(start, (i + 1) * gap);
      const row = i < done ? { status: "approved", completed_on: addDays(due, -((i * 3) % 9) - 2) } : i === done ? { status: cur, completed_on: null } : { status: "not_started", completed_on: null };
      must(await sb.from("student_milestones").update(row).eq("student_id", id[k]).eq("milestone_id", `m${i + 1}`), "milestone");
    }
  }

  // documents: key, student, milestone, title, final status, versions [file, kb, daysAgo, note], comments [authorKey, daysAgo, text]
  type Doc = [string, string, string, string, string, [string, number, number, string][], [string, number, string][]];
  const DOCS: Doc[] = [
    ["d1", "u1", "m5", "Chapter Three: Research Methodology", "in_review",
      [["Umeh_Ch3_v1.docx", 412, 21, "First draft of design and instruments."], ["Umeh_Ch3_v2.docx", 436, 6, "Revised sampling frame and validity section."]],
      [["s1", 14, "The sampling frame needs a clearer justification for the number of schools per local government area."], ["u1", 6, "Version 2 adds the sampling table and a power analysis in section 3.5."]]],
    ["d2", "u2", "m4", "Chapter Two: Literature Review", "submitted", [["Balogun_Ch2_v1.pdf", 880, 4, "Complete review, 62 sources."]], []],
    ["d3", "u3", "m2", "Approved Proposal with Defence Corrections", "revision", [["Sani_Proposal_corrected.docx", 540, 30, "Corrections from the panel."]],
      [["s3", 22, "Two panel corrections are still open: the hypotheses numbering and the delimitation of the study."]]],
    ["d4", "u4", "m5", "Chapter Three: Methodology", "approved", [["Obi_Ch3.docx", 380, 80, "Methodology chapter."]], [["s4", 70, "Approved. Proceed to instrument pilot."]]],
    ["d5", "u6", "m7", "Chapter Four: Data Analysis and Findings", "submitted", [["Nwosu_Ch4_v1.docx", 1260, 9, "Tables 4.1 to 4.14 and discussion of findings."]], []],
    ["d6", "u10", "m2", "Research Proposal", "approved", [["Garba_Proposal.pdf", 310, 70, "Proposal for defence."]], [["s3", 60, "Good. Approved for the defence panel."]]]
  ];
  for (const [, st, ms, title, status, versions, comments] of DOCS) {
    const doc = must(await sb.from("documents").insert({ student_id: id[st], milestone_id: ms, title }).select("id").single(), "document") as { id: string };
    for (const [file, kb, ago, note] of versions)
      must(await sb.from("document_versions").insert({ document_id: doc.id, file_name: file, size_bytes: kb * 1024, note, uploaded_by: id[st], uploaded_at: addDays(today, -ago) }), "version");
    for (const [by, ago, body] of comments)
      must(await sb.from("document_comments").insert({ document_id: doc.id, author_id: id[by], body, created_at: addDays(today, -ago) }), "comment");
    must(await sb.from("documents").update({ status }).eq("id", doc.id), "status");
  }

  // logs: student, supervisor, daysAgo, mode, minutes, summary, actions, next (days from today), acknowledged
  const LOGS: [string, string, number, string, number, string, string[], number | null, boolean][] = [
    ["u1", "s1", 14, "In person", 60, "Reviewed the first draft of Chapter Three. Discussed sampling of schools and the choice of a non-equivalent control group design.", ["Revise the sampling frame and add a power analysis", "Draft the instrument validation plan"], 7, true],
    ["u1", "s1", 35, "Video call", 45, "Walked through the ethics application and the consent forms for parents.", ["Submit the ethics application", "Update the information sheet"], null, true],
    ["u2", "s2", 9, "Video call", 40, "Checked progress on the literature review and the gap statement.", ["Add recent studies on LMS adoption from 2023 to 2026", "Send the full chapter for review"], 10, false],
    ["u3", "s3", 52, "In person", 50, "Proposal corrections discussed with the panel feedback in hand.", ["Fix hypotheses numbering", "Re-write the delimitation"], null, true],
    ["u4", "s4", 12, "In person", 55, "Pilot study results for the anxiety scale. Reliability looked acceptable.", ["Proceed with full data collection in four schools"], 14, true],
    ["u6", "s2", 6, "In person", 70, "Went through the first set of regression tables and how to present them.", ["Finish discussion of findings", "Prepare slides for internal defence"], 12, false],
    ["u10", "s3", 33, "Phone call", 25, "Brief check on ethics paperwork timeline.", ["Send ethics forms to the faculty committee"], null, true]
  ];
  for (const [st, sp, ago, mode, minutes, summary, actions, next, ack] of LOGS)
    must(await sb.from("supervision_logs").insert({ student_id: id[st], supervisor_id: id[sp], met_on: addDays(today, -ago), mode, minutes, summary, actions, next_meeting: next == null ? null : addDays(today, next), acknowledged: ack }), "log");

  console.log(`Seeded. Sign in as coordinator@supdesk.demo / ${PASSWORD}`);
  console.log(`Other demo logins: ${slug(SUPS[0][1])}@supdesk.demo (supervisor), ${slug(STUDENTS[0][1])}@supdesk.demo (student), same password.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
