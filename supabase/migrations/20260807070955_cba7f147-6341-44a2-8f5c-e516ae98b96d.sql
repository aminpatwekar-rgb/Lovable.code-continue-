-- ENUMS
CREATE TYPE public.quiz_question_type AS ENUM ('mcq','multi_select','true_false','fill_blank','short_answer','essay');
CREATE TYPE public.quiz_kind AS ENUM ('practice','timed','scheduled','exam');
CREATE TYPE public.quiz_attempt_status AS ENUM ('in_progress','submitted','graded','locked','expired');
CREATE TYPE public.quiz_difficulty AS ENUM ('easy','medium','hard');

-- QUESTION BANK
CREATE TABLE public.question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  subject text,
  topic text,
  type public.quiz_question_type NOT NULL DEFAULT 'mcq',
  difficulty public.quiz_difficulty NOT NULL DEFAULT 'medium',
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text,
  points numeric NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank TO authenticated;
GRANT ALL ON public.question_bank TO service_role;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank owner select" ON public.question_bank FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "bank owner insert" ON public.question_bank FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "bank owner update" ON public.question_bank FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "bank owner delete" ON public.question_bank FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER question_bank_updated BEFORE UPDATE ON public.question_bank
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- QUIZZES
CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  subject text,
  kind public.quiz_kind NOT NULL DEFAULT 'practice',
  time_limit_minutes integer,
  passing_marks numeric NOT NULL DEFAULT 0,
  randomize_questions boolean NOT NULL DEFAULT false,
  randomize_choices boolean NOT NULL DEFAULT false,
  start_at timestamptz,
  end_at timestamptz,
  max_attempts integer NOT NULL DEFAULT 1,
  auto_submit boolean NOT NULL DEFAULT true,
  lockdown_enabled boolean NOT NULL DEFAULT false,
  show_results boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER quizzes_updated BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_quiz(_quiz_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND (
    EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = _quiz_id AND q.teacher_id = _user_id)
    OR public.has_role(_user_id,'admin'));
$$;
REVOKE EXECUTE ON FUNCTION public.owns_quiz(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owns_quiz(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_quiz(_quiz_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.quizzes q
    WHERE q.id = _quiz_id
      AND (q.teacher_id = _user_id
           OR public.has_role(_user_id,'admin')
           OR (q.published AND EXISTS (
                SELECT 1 FROM public.class_members m
                WHERE m.class_id = q.class_id AND m.student_id = _user_id))));
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_quiz(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_view_quiz(uuid,uuid) TO authenticated;

CREATE POLICY "quiz select" ON public.quizzes FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin')
         OR (published AND public.is_class_member(class_id, auth.uid())));
CREATE POLICY "quiz insert" ON public.quizzes FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND (public.is_class_teacher(class_id, auth.uid()) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "quiz update" ON public.quizzes FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "quiz delete" ON public.quizzes FOR DELETE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- QUIZ QUESTIONS
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  type public.quiz_question_type NOT NULL DEFAULT 'mcq',
  difficulty public.quiz_difficulty NOT NULL DEFAULT 'medium',
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text,
  points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qq select" ON public.quiz_questions FOR SELECT TO authenticated
  USING (public.can_view_quiz(quiz_id, auth.uid()));
CREATE POLICY "qq insert" ON public.quiz_questions FOR INSERT TO authenticated
  WITH CHECK (public.owns_quiz(quiz_id, auth.uid()));
CREATE POLICY "qq update" ON public.quiz_questions FOR UPDATE TO authenticated
  USING (public.owns_quiz(quiz_id, auth.uid())) WITH CHECK (public.owns_quiz(quiz_id, auth.uid()));
CREATE POLICY "qq delete" ON public.quiz_questions FOR DELETE TO authenticated
  USING (public.owns_quiz(quiz_id, auth.uid()));
CREATE TRIGGER quiz_questions_updated BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX quiz_questions_quiz_idx ON public.quiz_questions(quiz_id, position);

-- ATTEMPTS
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL DEFAULT 1,
  status public.quiz_attempt_status NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  score numeric,
  max_score numeric,
  needs_manual_grading boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  lock_reason text,
  question_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, student_id, attempt_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER quiz_attempts_updated BEFORE UPDATE ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_attempt(_attempt_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.quiz_attempts a WHERE a.id = _attempt_id AND a.student_id = _user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.owns_attempt(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owns_attempt(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reviews_attempt(_attempt_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.quiz_attempts a JOIN public.quizzes q ON q.id = a.quiz_id
    WHERE a.id = _attempt_id AND (q.teacher_id = _user_id OR public.has_role(_user_id,'admin')));
$$;
REVOKE EXECUTE ON FUNCTION public.reviews_attempt(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reviews_attempt(uuid,uuid) TO authenticated;

CREATE POLICY "attempt select" ON public.quiz_attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.owns_quiz(quiz_id, auth.uid()));
CREATE POLICY "attempt insert" ON public.quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND public.can_view_quiz(quiz_id, auth.uid()));
CREATE POLICY "attempt update" ON public.quiz_attempts FOR UPDATE TO authenticated
  USING (student_id = auth.uid() OR public.owns_quiz(quiz_id, auth.uid()))
  WITH CHECK (student_id = auth.uid() OR public.owns_quiz(quiz_id, auth.uid()));
CREATE POLICY "attempt delete" ON public.quiz_attempts FOR DELETE TO authenticated
  USING (public.owns_quiz(quiz_id, auth.uid()));

-- ANSWERS
CREATE TABLE public.quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  response jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_correct boolean,
  awarded_points numeric,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_answers TO authenticated;
GRANT ALL ON public.quiz_answers TO service_role;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER quiz_answers_updated BEFORE UPDATE ON public.quiz_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "answer select" ON public.quiz_answers FOR SELECT TO authenticated
  USING (public.owns_attempt(attempt_id, auth.uid()) OR public.reviews_attempt(attempt_id, auth.uid()));
CREATE POLICY "answer insert" ON public.quiz_answers FOR INSERT TO authenticated
  WITH CHECK (public.owns_attempt(attempt_id, auth.uid()));
CREATE POLICY "answer update" ON public.quiz_answers FOR UPDATE TO authenticated
  USING (public.owns_attempt(attempt_id, auth.uid()) OR public.reviews_attempt(attempt_id, auth.uid()))
  WITH CHECK (public.owns_attempt(attempt_id, auth.uid()) OR public.reviews_attempt(attempt_id, auth.uid()));
CREATE POLICY "answer delete" ON public.quiz_answers FOR DELETE TO authenticated
  USING (public.reviews_attempt(attempt_id, auth.uid()));

-- VIOLATIONS
CREATE TABLE public.quiz_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  away_ms integer NOT NULL DEFAULT 0,
  locked boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.quiz_violations TO authenticated;
GRANT ALL ON public.quiz_violations TO service_role;
ALTER TABLE public.quiz_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "violation select" ON public.quiz_violations FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.owns_quiz(quiz_id, auth.uid()));
CREATE POLICY "violation insert" ON public.quiz_violations FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND public.owns_attempt(attempt_id, auth.uid()));

-- BADGES
CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'award',
  tone text NOT NULL DEFAULT 'primary',
  points numeric NOT NULL DEFAULT 10,
  is_custom boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.badges TO authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges read" ON public.badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "badges insert" ON public.badges FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "badges update" ON public.badges FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "badges delete" ON public.badges FOR DELETE TO authenticated
  USING ((is_custom AND created_by = auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.student_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  awarded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, badge_id, class_id)
);
GRANT SELECT, INSERT, DELETE ON public.student_badges TO authenticated;
GRANT ALL ON public.student_badges TO service_role;
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student badges select" ON public.student_badges FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.shares_class_with(auth.uid(), student_id));
CREATE POLICY "student badges insert" ON public.student_badges FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin')
              OR (awarded_by = auth.uid() AND class_id IS NOT NULL AND public.is_class_teacher(class_id, auth.uid())));
CREATE POLICY "student badges delete" ON public.student_badges FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin')
         OR (class_id IS NOT NULL AND public.is_class_teacher(class_id, auth.uid())));

-- POINTS LEDGER
CREATE TABLE public.student_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  source text NOT NULL,
  reference_id uuid,
  points numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.student_points TO authenticated;
GRANT ALL ON public.student_points TO service_role;
ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;
CREATE INDEX student_points_class_idx ON public.student_points(class_id, created_at DESC);
CREATE POLICY "points select" ON public.student_points FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(),'admin')
         OR (class_id IS NOT NULL AND (public.is_class_teacher(class_id, auth.uid()) OR public.is_class_member(class_id, auth.uid()))));
CREATE POLICY "points insert" ON public.student_points FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() OR public.has_role(auth.uid(),'admin')
              OR (class_id IS NOT NULL AND public.is_class_teacher(class_id, auth.uid())));
CREATE POLICY "points delete" ON public.student_points FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (class_id IS NOT NULL AND public.is_class_teacher(class_id, auth.uid())));

-- SEED BADGE CATALOGUE
INSERT INTO public.badges (code, name, description, icon, tone, points) VALUES
  ('quiz_master','Quiz Master','Scored 90% or above on five quizzes','trophy','primary',50),
  ('assignment_master','Assignment Master','Submitted twenty assignments on time','check-check','primary',50),
  ('top_performer','Top Performer','Finished first on a class leaderboard','crown','warning',40),
  ('academic_excellence','Academic Excellence','Maintained a 90% average','graduation-cap','primary',60),
  ('perfect_attendance','Perfect Attendance','Never missed a session','calendar-check','success',30),
  ('fast_finisher','Fast Finisher','Completed a timed quiz in half the time','zap','warning',20),
  ('early_bird','Early Bird','Submitted work a full day early','sunrise','success',20),
  ('consistent_learner','Consistent Learner','Active every week for a month','activity','primary',30),
  ('streak_7','7-Day Streak','Seven days of activity in a row','flame','warning',25),
  ('streak_30','30-Day Streak','Thirty days of activity in a row','flame','destructive',75),
  ('perfect_quiz','100% Quiz Accuracy','Answered every question correctly','target','success',35),
  ('homework_hero','Homework Hero','Never missed an assignment deadline','book-check','primary',40);