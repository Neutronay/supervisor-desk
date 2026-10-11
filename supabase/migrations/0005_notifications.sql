-- Email notifications: database events write to an outbox; the app sends them (see lib/notify.ts).

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  subject text not null,
  body text not null,
  link text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index notifications_pending_idx on notifications (created_at) where sent_at is null;
alter table notifications enable row level security;   -- no policies: only the server (service role) reads it

create or replace function notify(p_user uuid, p_kind text, p_subject text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if exists (select 1 from profiles where id = p_user and active and email_notifications) then
    insert into notifications (user_id, kind, subject, body, link) values (p_user, p_kind, p_subject, p_body, p_link);
  end if;
end $$;

-- Hands out pending rows to exactly one sender at a time.
create or replace function claim_notifications(p_limit int default 50) returns setof notifications
language sql security definer set search_path = public as $$
  update notifications n set attempts = n.attempts + 1
  where n.id in (select id from notifications where sent_at is null and attempts < 5 order by created_at limit p_limit for update skip locked)
  returning n.*
$$;

-- ---------- events ----------
create or replace function trg_notify_milestone() returns trigger
language plpgsql security definer set search_path = public as $$
declare sname text; sup uuid; mname text;
begin
  select p.full_name, s.supervisor_id into sname, sup from students s join profiles p on p.id = s.id where s.id = new.student_id;
  select name into mname from milestone_templates where id = new.milestone_id;
  if new.status = 'submitted' then
    perform notify(sup, 'milestone_submitted', sname || ' submitted "' || mname || '"',
      sname || ' has submitted the milestone "' || mname || '" for your approval.', '/dashboard?student=' || new.student_id);
  elsif new.status = 'approved' then
    perform notify(new.student_id, 'milestone_approved', '"' || mname || '" was approved',
      'Your milestone "' || mname || '" has been approved.', '/dashboard?student=' || new.student_id);
  elsif old.status = 'submitted' and new.status = 'in_progress' then
    perform notify(new.student_id, 'milestone_returned', '"' || mname || '" was returned',
      'Your supervisor returned "' || mname || '" for more work.', '/dashboard?student=' || new.student_id);
  end if;
  return null;
end $$;
create trigger notify_milestone after update on student_milestones for each row
  when (old.status is distinct from new.status) execute function trg_notify_milestone();

create or replace function trg_notify_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare sname text; pname text;
begin
  select full_name into sname from profiles where id = new.id;
  select full_name into pname from profiles where id = new.supervisor_id;
  perform notify(new.id, 'assigned', 'You have been assigned a supervisor', pname || ' is now your supervisor.', '/dashboard');
  perform notify(new.supervisor_id, 'assigned', sname || ' has been assigned to you', sname || ' is now one of your students.', '/dashboard?student=' || new.id);
  return null;
end $$;
create trigger notify_assignment after update of supervisor_id on students for each row
  when (new.supervisor_id is not null and new.supervisor_id is distinct from old.supervisor_id) execute function trg_notify_assignment();

create or replace function trg_notify_version() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select doc.title, doc.student_id, s.supervisor_id, p.full_name into d
  from documents doc join students s on s.id = doc.student_id join profiles p on p.id = doc.student_id where doc.id = new.document_id;
  perform notify(d.supervisor_id, 'document_uploaded', d.full_name || ' uploaded "' || d.title || '" (v' || new.version || ')',
    d.full_name || ' uploaded version ' || new.version || ' of "' || d.title || '" for your review.', '/documents/' || new.document_id);
  return null;
end $$;
create trigger notify_version after insert on document_versions for each row execute function trg_notify_version();

create or replace function trg_notify_doc_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('in_review', 'revision', 'approved') then
    perform notify(new.student_id, 'document_status', '"' || new.title || '": ' ||
      case new.status when 'in_review' then 'now in review' when 'revision' then 'revision requested' else 'approved' end,
      'Your document "' || new.title || '" is now ' ||
      case new.status when 'in_review' then 'in review.' when 'revision' then 'marked as needing revision. Open it to read the feedback.' else 'approved.' end,
      '/documents/' || new.id);
  end if;
  return null;
end $$;
create trigger notify_doc_status after update of status on documents for each row
  when (old.status is distinct from new.status) execute function trg_notify_doc_status();

create or replace function trg_notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record; who text;
begin
  select doc.title, doc.student_id, s.supervisor_id into d from documents doc join students s on s.id = doc.student_id where doc.id = new.document_id;
  select full_name into who from profiles where id = new.author_id;
  if new.author_id = d.student_id then
    perform notify(d.supervisor_id, 'comment', who || ' commented on "' || d.title || '"', who || ' wrote: ' || left(new.body, 300), '/documents/' || new.document_id);
  else
    perform notify(d.student_id, 'comment', who || ' commented on "' || d.title || '"', who || ' wrote: ' || left(new.body, 300), '/documents/' || new.document_id);
  end if;
  return null;
end $$;
create trigger notify_comment after insert on document_comments for each row execute function trg_notify_comment();

create or replace function trg_notify_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  select full_name into pname from profiles where id = new.supervisor_id;
  perform notify(new.student_id, 'log', 'Please sign off your supervision meeting',
    pname || ' recorded your meeting of ' || to_char(new.met_on, 'DD Mon YYYY') || '. Open it to review and sign off.', '/logs');
  return null;
end $$;
create trigger notify_log after insert on supervision_logs for each row execute function trg_notify_log();

-- Weekly reminders (called by the Monday cron). Returns how many were queued.
create or replace function queue_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; t date := (now() at time zone 'Africa/Lagos')::date;
begin
  for r in
    select s.id, count(*) as c from students s join student_milestones m on m.student_id = s.id
    where m.status in ('not_started', 'in_progress') and m.due_on < t group by s.id
  loop
    perform notify(r.id, 'reminder', 'You have ' || r.c || ' overdue milestone' || case when r.c = 1 then '' else 's' end,
      'Open Supervision Desk to see what is overdue and agree a plan with your supervisor.', '/dashboard');
    n := n + 1;
  end loop;
  for r in
    select sp.id,
      (select count(*) from student_milestones m join students s on s.id = m.student_id where s.supervisor_id = sp.id and m.status = 'submitted') as ms_wait,
      (select count(*) from documents d join students s on s.id = d.student_id where s.supervisor_id = sp.id and d.status in ('submitted', 'in_review')) as doc_wait
    from supervisors sp
  loop
    if r.ms_wait + r.doc_wait > 0 then
      perform notify(r.id, 'reminder', 'Waiting for you: ' || r.ms_wait || ' approval(s), ' || r.doc_wait || ' document(s)',
        r.ms_wait || ' milestone(s) await approval and ' || r.doc_wait || ' document(s) await review.', '/dashboard');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function notify, claim_notifications, queue_reminders from public, anon, authenticated;
grant execute on function notify, claim_notifications, queue_reminders to service_role;
