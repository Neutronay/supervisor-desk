# Supervision Desk

Postgraduate project supervision: milestone tracking, supervisor assignment, document review and meeting logs, for three roles (programme coordinator, supervisor, student).

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind · Supabase (Postgres, Auth, Storage, Row Level Security) · Vercel.

## How it is built

- **Access control lives in Postgres.** Every query runs as the signed-in user, and RLS policies decide what each role can see or change. The UI hides buttons, but the database is what enforces the rules.
- **Workflow rules live in SQL functions.** Milestone changes go through `transition_milestone()`, so a student cannot approve their own work and a supervisor cannot skip a step. Supervisor capacity is enforced by a trigger.
- **Files go browser → private Storage bucket directly** (25 MB limit, PDF/Word only), then the app records the version. This avoids Vercel's 4.5 MB request limit. Downloads use 10-minute signed URLs.
- **Business logic** from the prototype (health status, supervisor suggestions) is in `lib/domain.ts`.

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

## Not built yet

Email notifications (e.g. "chapter awaiting review"), an audit trail, automated tests, pagination for large cohorts, editing a person after invitation, and a per-programme (multi-department) split.


PS C:\Users\DELL\Downloads\supervision-desk\supervision-desk> npm run seed                

> supervision-desk@1.0.0 seed
> tsx --env-file=.env.local scripts/seed.ts

Seeded. Sign in as coordinator@supdesk.demo / SupervisionDemo1!
Other demo logins: adaeze.okonkwo@supdesk.demo (supervisor), ngozi.umeh@supdesk.demo (student), same password.
PS C:\Users\DELL\Downloads\supervision-desk\supervision-desk> 