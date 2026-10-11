# Supervision Desk

Postgraduate project supervision: milestone tracking, supervisor assignment, document review and meeting logs, for three roles (programme coordinator, supervisor, student).

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind · Supabase (Postgres, Auth, Storage, Row Level Security) · Vercel.

## How it is built

- **Access control lives in Postgres.** Every query runs as the signed-in user, and RLS policies decide what each role can see or change. The UI hides buttons, but the database is what enforces the rules.
- **Workflow rules live in SQL functions.** Milestone changes go through `transition_milestone()`, so a student cannot approve their own work and a supervisor cannot skip a step. Supervisor capacity is enforced by a trigger.
- **Files go browser → private Storage bucket directly** (25 MB limit, PDF/Word only), then the app records the version. This avoids Vercel's 4.5 MB request limit. Downloads use 10-minute signed URLs.
- **Business logic** from the prototype (health status, supervisor suggestions) is in `lib/domain.ts`.

## Migrations

Run these in order in the Supabase SQL editor, **each as its own run** (0002 must finish before 0003):

| File | What it adds |
| --- | --- |
| `0001_init.sql` | tables, security rules, workflow functions, file bucket |
| `0002_admin_role.sql` | the `admin` role |
| `0003_departments_and_people.sql` | departments, department-scoped access, edit/deactivate/move people |
| `0004_audit.sql` | append-only audit trail |
| `0005_notifications.sql` | email outbox, triggers, weekly reminders |

Upgrading an existing project: run 0002 to 0005. Your people and data move into a department called "Main department".

## Set up

1. Create a project at supabase.com.
2. SQL editor: paste and run `supabase/migrations/0001_init.sql`.
3. `cp .env.example .env.local` and fill in the three Supabase values (Project Settings → API).
4. `npm install`
5. **Demo data (optional):** `npm run seed` loads the prototype's people, projects, documents and meetings. All demo accounts use the password printed at the end.
   **Real use instead:** in Supabase → Authentication → Users, add yourself, then run in the SQL editor:
   ```sql
   insert into profiles (id, full_name, role)
   select id, 'Your Name', 'coordinator' from auth.users where email = 'you@example.com';
   ```
   After that, invite everyone else from the **People** page.
6. `npm run dev`, open http://localhost:3000.

### Invite and reset emails (required once)

In Supabase → Authentication → Email Templates, change the link in the **Invite user** and **Reset password** templates to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

Also set **Site URL** (and add it to Redirect URLs) under Authentication → URL Configuration.
Supabase's built-in mailer is heavily rate-limited, so connect your own SMTP (Resend, Brevo, etc.) before onboarding a real cohort.

## Deploy

Push to GitHub, import into Vercel, add the four environment variables from `.env.example` (set `NEXT_PUBLIC_SITE_URL` to your production URL), and deploy. Update Supabase Site URL to match.

## Roles

- **Administrator**: sees every department. Creates departments, invites coordinators, moves people between departments.
- **Coordinator**: runs one department. Invites supervisors and students, assigns supervisors, edits and deactivates people, reads the audit trail.
- **Supervisor**: sees only the students assigned to them. Approves milestones, reviews documents, logs meetings.
- **Student**: sees only their own project.

Make yourself the first administrator (replace the email):

```sql
update profiles set role = 'admin', department_id = null
where id = (select id from auth.users where email = 'you@example.com');
```

## Email notifications

Database events (submissions, approvals, uploads, review decisions, comments, new meeting logs, assignments) queue emails in a `notifications` table. The app sends them through [Resend](https://resend.com) right after each action, and a daily cron job (`vercel.json`) sends anything left over and queues **Monday reminders** (overdue work for students, waiting approvals and documents for supervisors).

1. Create a Resend account, verify your sending domain, and create an API key.
2. Set `RESEND_API_KEY`, `EMAIL_FROM` and `CRON_SECRET` (any long random string) in `.env.local` and in Vercel.

Until `RESEND_API_KEY` is set nothing is sent and nothing is lost: emails wait in the queue. Everyone can opt out in **Settings**.

## Tests

`npm test` runs 34 checks with no setup and no network:

- The database tests run every migration on an in-memory Postgres and check the security rules: who can see what, who can change what, department isolation, capacity, the milestone workflow, audit scoping, notification opt-out, deactivation.
- The unit tests cover the business rules (health status, supervisor suggestions, dates, redirect safety).

## Audit trail

The **Audit trail** page (coordinators and administrators) lists every change with who made it, newest first, filterable by type. Rows cannot be edited or deleted through the app or the API. A coordinator sees only their own department.

## Not built yet

An in-app notification bell, changing a person's email address, rescheduling a student's milestones when their programme changes, bulk import of students from a spreadsheet, and end-to-end browser tests.


SuperCoordinator1!