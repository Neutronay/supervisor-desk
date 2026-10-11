-- Multi-department support, an administrator role, and editing/deactivating people.
-- Existing data is moved into one department called "Main department" (rename it in the app).

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
insert into departments (name) values ('Main department');

alter table profiles
  add column department_id uuid references departments (id),
  add column active boolean not null default true,
  add column email_notifications boolean not null default true;
update profiles set department_id = (select id from departments order by created_at limit 1) where role <> 'admin';
alter table profiles add constraint profiles_department_required check (role = 'admin' or department_id is not null);
create index profiles_department_idx on profiles (department_id);

-- ---------- helpers ----------
create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active) $$;

create or replace function my_dept() returns uuid
language sql stable security definer set search_path = public as
$$ select department_id from profiles where id = auth.uid() and active $$;

create or replace function dept_of(pid uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select department_id from profiles where id = pid $$;

-- True for an administrator (any department) or the coordinator of department d.
create or replace function is_manager_of_dept(d uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and active
     and (role = 'admin' or (role = 'coordinator' and department_id = d))) $$;

create or replace function can_access_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (select 1 from profiles where id = auth.uid() and active) and (
    sid = auth.uid()
    or is_manager_of_dept(dept_of(sid))
    or exists (select 1 from students where id = sid and supervisor_id = auth.uid())
  )
$$;

create or replace function can_review_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (select 1 from profiles where id = auth.uid() and active) and (
    is_manager_of_dept(dept_of(sid))
    or exists (select 1 from students where id = sid and supervisor_id = auth.uid())
  )
$$;

-- ---------- new accounts carry their department ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := new.raw_user_meta_data; r text := m ->> 'role';
begin
  if r is null then return new; end if;
  insert into profiles (id, full_name, role, department_id)
  values (new.id, coalesce(m ->> 'full_name', new.email), r::user_role, nullif(m ->> 'department_id', '')::uuid);
  if r = 'supervisor' then
    insert into supervisors (id, areas, capacity)
    values (new.id, coalesce(array(select jsonb_array_elements_text(m -> 'areas')), '{}'), coalesce((m ->> 'capacity')::int, 4));
  elsif r = 'student' then
    insert into students (id, matric, programme, title, area, started_on)
    values (new.id, m ->> 'matric', m ->> 'programme', m ->> 'title', m ->> 'area', coalesce((m ->> 'started_on')::date, current_date));
  end if;
  return new;
end $$;

-- Capacity and department are enforced for every assignment, whoever makes it.
create or replace function enforce_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int; cur int;
begin
  if new.supervisor_id is null then
    new.assigned_on := null;
  elsif tg_op = 'INSERT' or new.supervisor_id is distinct from old.supervisor_id then
    if dept_of(new.supervisor_id) is distinct from dept_of(new.id) then
      raise exception 'A supervisor can only be assigned students in the same department.';
    end if;
    select capacity into cap from supervisors where id = new.supervisor_id;
    select count(*) into cur from students where supervisor_id = new.supervisor_id and id <> new.id;
    if cur >= cap then raise exception 'This supervisor is at capacity (% of %).', cur, cap; end if;
    if tg_op = 'INSERT' then new.assigned_on := coalesce(new.assigned_on, current_date);
    elsif new.assigned_on is not distinct from old.assigned_on then new.assigned_on := current_date;
    end if;
  end if;
  return new;
end $$;

create or replace function supervisor_loads() returns table (supervisor_id uuid, load int)
language sql stable security definer set search_path = public as
$$ select s.id, (select count(*)::int from students st where st.supervisor_id = s.id)
   from supervisors s where is_admin() or dept_of(s.id) = my_dept() $$;

-- ---------- policies: everything is scoped to the department ----------
drop policy "profiles readable" on profiles;
create policy "profiles in scope" on profiles for select to authenticated
  using (id = auth.uid() or is_admin() or department_id = my_dept());

drop policy "supervisors readable" on supervisors;
create policy "supervisors in scope" on supervisors for select to authenticated
  using (is_admin() or dept_of(id) = my_dept());

drop policy "coordinator assigns" on students;
create policy "managers assign" on students for update to authenticated
  using (is_manager_of_dept(dept_of(id))) with check (is_manager_of_dept(dept_of(id)));

alter table departments enable row level security;
create policy "departments readable" on departments for select to authenticated using (is_admin() or id = my_dept());
create policy "admin manages departments" on departments for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- people management (functions, so callers cannot touch columns they should not) ----------
create or replace function update_person(
  p_id uuid, p_name text, p_matric text default null, p_programme text default null, p_title text default null,
  p_area text default null, p_areas text[] default null, p_capacity int default null) returns void
language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  select role into r from profiles where id = p_id;
  if r is null then raise exception 'Person not found.'; end if;
  if not is_manager_of_dept(dept_of(p_id)) then raise exception 'You cannot edit this person.'; end if;
  if r in ('coordinator', 'admin') and not is_admin() then raise exception 'Only an administrator can edit coordinators.'; end if;
  update profiles set full_name = coalesce(nullif(trim(p_name), ''), full_name) where id = p_id;
  if r = 'student' then
    update students set matric = coalesce(nullif(trim(p_matric), ''), matric), programme = coalesce(nullif(trim(p_programme), ''), programme),
      title = coalesce(nullif(trim(p_title), ''), title), area = coalesce(nullif(trim(p_area), ''), area) where id = p_id;
  elsif r = 'supervisor' then
    if p_capacity is not null and p_capacity < (select count(*) from students where supervisor_id = p_id) then
      raise exception 'Capacity cannot be lower than the current number of students.';
    end if;
    update supervisors set areas = coalesce(p_areas, areas), capacity = coalesce(p_capacity, capacity) where id = p_id;
  end if;
end $$;

create or replace function set_person_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  select role into r from profiles where id = p_id;
  if r is null then raise exception 'Person not found.'; end if;
  if p_id = auth.uid() then raise exception 'You cannot deactivate your own account.'; end if;
  if not is_manager_of_dept(dept_of(p_id)) then raise exception 'You cannot change this person.'; end if;
  if r in ('coordinator', 'admin') and not is_admin() then raise exception 'Only an administrator can change coordinators.'; end if;
  update profiles set active = p_active where id = p_id;
end $$;

create or replace function move_person_department(p_id uuid, p_dept uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  if not is_admin() then raise exception 'Only an administrator can move people between departments.'; end if;
  select role into r from profiles where id = p_id;
  if r is null or r = 'admin' then raise exception 'That person cannot be moved.'; end if;
  if r = 'student' then update students set supervisor_id = null where id = p_id; end if;
  if r = 'supervisor' and exists (select 1 from students where supervisor_id = p_id) then
    raise exception 'Reassign this supervisor''s students first.';
  end if;
  update profiles set department_id = p_dept where id = p_id;
end $$;

create or replace function set_my_notifications(p_on boolean) returns void
language sql security definer set search_path = public as
$$ update profiles set email_notifications = p_on where id = auth.uid() $$;

-- Newest first, restricted by RLS because this runs as the caller.
create or replace function last_meetings(p_ids uuid[]) returns table (student_id uuid, last_met date)
language sql stable as
$$ select student_id, max(met_on) from supervision_logs where student_id = any (p_ids) group by student_id $$;

revoke execute on function update_person, set_person_active, move_person_department, set_my_notifications, last_meetings from public, anon;
grant execute on function update_person, set_person_active, move_person_department, set_my_notifications, last_meetings to authenticated;
