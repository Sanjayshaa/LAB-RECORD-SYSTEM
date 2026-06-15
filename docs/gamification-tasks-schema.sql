-- Individual XP quests assigned to students (faculty/admin).
-- Run in Supabase SQL after gamification-schema.sql.

CREATE TABLE IF NOT EXISTS public.student_gamification_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  xp_reward integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT student_gamification_tasks_status_check CHECK (status IN ('pending', 'completed', 'cancelled')),
  CONSTRAINT student_gamification_tasks_xp_check CHECK (xp_reward >= 1 AND xp_reward <= 500)
);

CREATE INDEX IF NOT EXISTS idx_student_gamification_tasks_student_status
  ON public.student_gamification_tasks(student_id, status);

CREATE INDEX IF NOT EXISTS idx_student_gamification_tasks_assigner
  ON public.student_gamification_tasks(assigned_by, created_at DESC);

COMMENT ON TABLE public.student_gamification_tasks IS 'Quest-style tasks; completing pending rows awards XP via API (server updates profiles.xp_points).';
