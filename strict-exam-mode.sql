-- Strict Exam Mode hard lock rules
-- Run this in your Supabase SQL editor.
--
-- NOTE: The unique constraint below uses (exam_id, register_no). The app also keys
-- uniqueness by authenticated student_id in UI/API. Align register_no with the
-- student's official register number, or add a separate unique (exam_id, student_id)
-- constraint if your schema uses student_id as the stable identity.

-- 1) One submission per student per exam (DB-level safety)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'unique_exam_student'
  ) then
    alter table public.exam_submissions
    add constraint unique_exam_student unique (exam_id, register_no);
  end if;
end
$$;

-- 2) RLS insert guard (works with unique constraint)
alter table public.exam_submissions enable row level security;

drop policy if exists insert_exam_once on public.exam_submissions;
create policy insert_exam_once
on public.exam_submissions
for insert
with check (
  not exists (
    select 1
    from public.exam_submissions es
    where es.exam_id = exam_submissions.exam_id
      and es.register_no = exam_submissions.register_no
  )
);
