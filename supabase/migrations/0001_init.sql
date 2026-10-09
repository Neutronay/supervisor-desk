-- Supervision Desk schema. Run in the Supabase SQL editor, or with `supabase db push`.
-- Security model: Row Level Security does the real access control. The app never trusts the browser.

create extension if not exists pgcrypto;

create type user_role as enum ('coordinator', 'supervisor', 'student');
create type milestone_status as enum ('not_started', 'in_progress', 'submitted', 'approved');
create type doc_status as enum ('submitted', 'in_review', 'revision', 'approved');

-- ---------- reference data ----------
create table milestone_templates (
  id text primary key,
  position int not null unique,
  name text not null
);
insert into milestone_templates (id, position, name) values
  ('m1', 1, 'Topic approval'), ('m2', 2, 'Proposal defence'), ('m3', 3, 'Ethics clearance'),
  ('m4', 4, 'Literature review'), ('m5', 5, 'Methodology'), ('m6', 6, 'Data collection'),
  ('m7', 7, 'Analysis and findings'), ('m8', 8, 'Full draft'), ('m9', 9, 'Final defence');

-- ---------- people ----------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role user_role not null,
  created_at timestamptz not null default now()
);

create table supervisors (
  id uuid primary key references profiles (id) on delete cascade,
  areas text[] not null default '{}',
  capacity int not null default 4 check (capacity > 0)
);

create table students (
  id uuid primary key references profiles (id) on delete cascade,
  matric text not null unique,
  programme text not null,
  title text not null,
  area text not null,
  supervisor_id uuid references supervisors (id) on delete set null,
  assigned_on date,
  started_on date not null default current_date
);
create index students_supervisor_idx on students (supervisor_id);

-- ---------- milestones ----------
create table student_milestones (
  student_id uuid not null references students (id) on delete cascade,
  milestone_id text not null references milestone_templates (id),
  status milestone_status not null default 'not_started',
  due_on date not null,
  completed_on date,
  primary key (student_id, milestone_id)
);
create index student_milestones_due_idx on student_milestones (status, due_on);

-- ---------- documents ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  milestone_id text not null references milestone_templates (id),
  title text not null check (length(trim(title)) > 0),
  status doc_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_student_idx on documents (student_id);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  version int not null default 0,
  file_path text,                      -- null only for seeded demo rows
  file_name text not null,
  size_bytes bigint not null default 0,
  note text,
  uploaded_by uuid references profiles (id),
  uploaded_at timestamptz not null default now(),
  unique (document_id, version)
);

create table document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  author_id uuid not null references profiles (id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index document_comments_doc_idx on document_comments (document_id, created_at);

-- ---------- supervision logs ----------
create table supervision_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  supervisor_id uuid not null references supervisors (id),
  met_on date not null,
  mode text not null check (mode in ('In person', 'Video call', 'Phone call', 'Email')),
  minutes int not null check (minutes > 0 and minutes <= 600),
  summary text not null check (length(trim(summary)) > 0),
  actions text[] not null default '{}',
  next_meeting date,
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index supervision_logs_student_idx on supervision_logs (student_id, met_on desc);

-- ---------- helper functions (security definer so policies never recurse) ----------
create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function can_access_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select auth.uid() is not null and (
    sid = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'coordinator')
    or exists (select 1 from students where id = sid and supervisor_id = auth.uid())
  )
$$;

create or replace function can_review_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and role = 'coordinator')
    or exists (select 1 from students where id = sid and supervisor_id = auth.uid())
  )
$$;

-- ---------- triggers ----------
-- Create the profile (and role row) when the coordinator invites someone.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := new.raw_user_meta_data; r text := m ->> 'role';
begin
  if r is null then return new; end if;   -- e.g. the first coordinator, created by hand
  insert into profiles (id, full_name, role) values (new.id, coalesce(m ->> 'full_name', new.email), r::user_role);
  if r = 'supervisor' then
    insert into supervisors (id, areas, capacity)
    values (new.id, coalesce(array(select jsonb_array_elements_text(m -> 'areas')), '{}'), coalesce((m ->> 'capacity')::int, 4));
  elsif r = 'student' then
    insert into students (id, matric, programme, title, area, started_on)
    values (new.id, m ->> 'matric', m ->> 'programme', m ->> 'title', m ->> 'area', coalesce((m ->> 'started_on')::date, current_date));
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Nine milestones per student, spaced by programme (PhD 70 days, others 45).
create or replace function init_student_milestones() returns trigger
language plpgsql security definer set search_path = public as $$
declare gap int := case when new.programme = 'PhD' then 70 else 45 end;
begin
  insert into student_milestones (student_id, milestone_id, status, due_on)
  select new.id, id, case when position = 1 then 'in_progress'::milestone_status else 'not_started' end,
         new.started_on + position * gap
  from milestone_templates;
  return new;
end $$;
create trigger students_init_milestones after insert on students for each row execute function init_student_milestones();

-- A supervisor can never exceed capacity, whoever (or whatever) tries to assign.
create or replace function enforce_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int; cur int;
begin
  if new.supervisor_id is null then
    new.assigned_on := null;
  elsif tg_op = 'INSERT' or new.supervisor_id is distinct from old.supervisor_id then
    select capacity into cap from supervisors where id = new.supervisor_id;
    select count(*) into cur from students where supervisor_id = new.supervisor_id and id <> new.id;
    if cur >= cap then raise exception 'This supervisor is at capacity (% of %).', cur, cap; end if;
    if tg_op = 'INSERT' then new.assigned_on := coalesce(new.assigned_on, current_date);
    elsif new.assigned_on is not distinct from old.assigned_on then new.assigned_on := current_date;
    end if;
  end if;
  return new;
end $$;
create trigger students_capacity before insert or update of supervisor_id on students for each row execute function enforce_capacity();

create or replace function set_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(version), 0) + 1 into new.version from document_versions where document_id = new.document_id;
  return new;
end $$;
create trigger versions_set_number before insert on document_versions for each row execute function set_version();

-- A new upload always puts the document back in the supervisor's queue.
create or replace function reopen_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update documents set status = 'submitted', updated_at = now() where id = new.document_id;
  return new;
end $$;
create trigger versions_reopen after insert on document_versions for each row execute function reopen_document();

create or replace function touch_updated() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;
create trigger documents_touch before update on documents for each row execute function touch_updated();

-- ---------- workflow functions ----------
-- All milestone changes go through here so the rules live in one place.
create or replace function transition_milestone(p_student uuid, p_milestone text, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare cur milestone_status; pos int; nxt text; me uuid := auth.uid();
begin
  select status into cur from student_milestones where student_id = p_student and milestone_id = p_milestone for update;
  if cur is null then raise exception 'Milestone not found.'; end if;
  select position into pos from milestone_templates where id = p_milestone;

  if p_action in ('start', 'submit') then
    if me is distinct from p_student then raise exception 'Only the student can do this.'; end if;
    if p_action = 'start' then
      if cur <> 'not_started' then raise exception 'This milestone has already started.'; end if;
      if pos > 1 and not exists (
        select 1 from student_milestones sm join milestone_templates t on t.id = sm.milestone_id
        where sm.student_id = p_student and t.position = pos - 1 and sm.status = 'approved')
      then raise exception 'Finish the previous milestone first.'; end if;
      update student_milestones set status = 'in_progress' where student_id = p_student and milestone_id = p_milestone;
    else
      if cur <> 'in_progress' then raise exception 'Only a milestone in progress can be submitted.'; end if;
      update student_milestones set status = 'submitted' where student_id = p_student and milestone_id = p_milestone;
    end if;

  elsif p_action in ('approve', 'return') then
    if not can_review_student(p_student) then raise exception 'You cannot review this student.'; end if;
    if cur <> 'submitted' then raise exception 'Nothing awaiting approval here.'; end if;
    if p_action = 'return' then
      update student_milestones set status = 'in_progress' where student_id = p_student and milestone_id = p_milestone;
    else
      update student_milestones set status = 'approved', completed_on = current_date
        where student_id = p_student and milestone_id = p_milestone;
      select id into nxt from milestone_templates where position = pos + 1;
      if nxt is not null then
        update student_milestones set status = 'in_progress'
          where student_id = p_student and milestone_id = nxt and status = 'not_started';
      end if;
    end if;
  else
    raise exception 'Unknown action.';
  end if;
end $$;

create or replace function acknowledge_log(p_log uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update supervision_logs set acknowledged = true, acknowledged_at = now()
  where id = p_log and student_id = auth.uid();
  if not found then raise exception 'Log not found.'; end if;
end $$;

-- Loads for every supervisor, so a supervisor (who only sees their own students) still sees true capacity.
create or replace function supervisor_loads() returns table (supervisor_id uuid, load int)
language sql stable security definer set search_path = public as
$$ select s.id, (select count(*)::int from students st where st.supervisor_id = s.id) from supervisors s where auth.uid() is not null $$;

revoke execute on function transition_milestone, acknowledge_log, supervisor_loads from public, anon;
grant execute on function transition_milestone, acknowledge_log, supervisor_loads to authenticated;

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table supervisors enable row level security;
alter table students enable row level security;
alter table student_milestones enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table document_comments enable row level security;
alter table supervision_logs enable row level security;
alter table milestone_templates enable row level security;

create policy "templates readable" on milestone_templates for select to authenticated using (true);
create policy "profiles readable" on profiles for select to authenticated using (true);
create policy "supervisors readable" on supervisors for select to authenticated using (true);

create policy "students visible" on students for select to authenticated using (can_access_student(id));
create policy "coordinator assigns" on students for update to authenticated
  using (app_role() = 'coordinator') with check (app_role() = 'coordinator');

create policy "milestones visible" on student_milestones for select to authenticated using (can_access_student(student_id));

create policy "documents visible" on documents for select to authenticated using (can_access_student(student_id));
create policy "student creates document" on documents for insert to authenticated
  with check (student_id = auth.uid() and status = 'submitted');
create policy "reviewer sets status" on documents for update to authenticated
  using (can_review_student(student_id)) with check (can_review_student(student_id));

create policy "versions visible" on document_versions for select to authenticated
  using (can_access_student((select d.student_id from documents d where d.id = document_id)));
create policy "student uploads version" on document_versions for insert to authenticated
  with check (uploaded_by = auth.uid() and (select d.student_id from documents d where d.id = document_id) = auth.uid());

create policy "comments visible" on document_comments for select to authenticated
  using (can_access_student((select d.student_id from documents d where d.id = document_id)));
create policy "participants comment" on document_comments for insert to authenticated
  with check (author_id = auth.uid() and can_access_student((select d.student_id from documents d where d.id = document_id)));

create policy "logs visible" on supervision_logs for select to authenticated using (can_access_student(student_id));
create policy "supervisor records meeting" on supervision_logs for insert to authenticated
  with check (supervisor_id = auth.uid() and app_role() = 'supervisor'
              and exists (select 1 from students s where s.id = student_id and s.supervisor_id = auth.uid()));

-- ---------- file storage (private bucket; path = <student_id>/<document_id>/<file>) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (
  'documents', 'documents', false, 26214400,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) on conflict (id) do nothing;

create policy "documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and can_access_student(((storage.foldername(name))[1])::uuid));
create policy "documents upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
