-- Append-only audit trail. Nobody can edit or delete rows through the API.

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,                       -- null actor = system (seed script, service role)
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  row_id text,
  student_id uuid,                       -- the student this concerns, when there is one
  department_id uuid,
  old_data jsonb,                        -- on update: only the columns that changed
  new_data jsonb
);
create index audit_log_at_idx on audit_log (at desc);
create index audit_log_dept_idx on audit_log (department_id, at desc);
create index audit_log_student_idx on audit_log (student_id, at desc);

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; od jsonb; nd jsonb; rec jsonb; rid text; pid uuid; dept uuid; an text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  rec := coalesce(n, o);

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, o -> k), jsonb_object_agg(k, n -> k) into od, nd
    from jsonb_object_keys(n) k where (n -> k) is distinct from (o -> k);
    if nd is null then return null; end if;
    o := od; n := nd;
  end if;

  rid := case tg_table_name when 'student_milestones' then (rec ->> 'student_id') || ':' || (rec ->> 'milestone_id') else rec ->> 'id' end;
  pid := case
    when tg_table_name = 'departments' then null
    when tg_table_name = 'document_versions' then (select d.student_id from documents d where d.id = (rec ->> 'document_id')::uuid)
    when rec ? 'student_id' then (rec ->> 'student_id')::uuid
    else (rec ->> 'id')::uuid end;
  dept := case
    when tg_table_name = 'departments' then (rec ->> 'id')::uuid
    when tg_table_name = 'profiles' then (rec ->> 'department_id')::uuid
    else dept_of(pid) end;
  select full_name into an from profiles where id = auth.uid();

  insert into audit_log (actor_id, actor_name, action, table_name, row_id, student_id, department_id, old_data, new_data)
  values (auth.uid(), an, lower(tg_op), tg_table_name, rid,
          case when tg_table_name in ('departments') then null else pid end, dept, o, n);
  return null;
end $$;

create trigger audit_profiles after insert or update or delete on profiles for each row execute function audit_row();
create trigger audit_supervisors after insert or update or delete on supervisors for each row execute function audit_row();
create trigger audit_students after insert or update or delete on students for each row execute function audit_row();
create trigger audit_milestones after update or delete on student_milestones for each row execute function audit_row();
create trigger audit_documents after insert or update or delete on documents for each row execute function audit_row();
create trigger audit_versions after insert or delete on document_versions for each row execute function audit_row();
create trigger audit_logs after insert or update or delete on supervision_logs for each row execute function audit_row();
create trigger audit_departments after insert or update or delete on departments for each row execute function audit_row();

alter table audit_log enable row level security;
create policy "managers read audit" on audit_log for select to authenticated
  using (is_admin() or (app_role() = 'coordinator' and department_id = my_dept()));
revoke insert, update, delete, truncate on audit_log from authenticated, anon;
