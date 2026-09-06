
-- 1. quiz_answers: only reviewers/admins (or the server-side grader, where auth.uid() is null) may write grading columns
CREATE OR REPLACE FUNCTION public.protect_quiz_answer_grading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.reviews_attempt(NEW.attempt_id, auth.uid())
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_correct := NULL;
    NEW.awarded_points := NULL;
    NEW.feedback := NULL;
  ELSE
    NEW.is_correct := OLD.is_correct;
    NEW.awarded_points := OLD.awarded_points;
    NEW.feedback := OLD.feedback;
    NEW.attempt_id := OLD.attempt_id;
    NEW.question_id := OLD.question_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_answers_protect_grading ON public.quiz_answers;
CREATE TRIGGER quiz_answers_protect_grading
BEFORE INSERT OR UPDATE ON public.quiz_answers
FOR EACH ROW EXECUTE FUNCTION public.protect_quiz_answer_grading();

-- 2. quiz_attempts: students cannot change scoring/lock state
CREATE OR REPLACE FUNCTION public.protect_quiz_attempt_grading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.owns_quiz(NEW.quiz_id, auth.uid())
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.score := NULL;
    NEW.max_score := NULL;
    NEW.graded_at := NULL;
    NEW.needs_manual_grading := false;
    NEW.locked_at := NULL;
    NEW.lock_reason := NULL;
    IF NEW.status <> 'in_progress' THEN
      NEW.status := 'in_progress';
    END IF;
    RETURN NEW;
  END IF;

  -- Student updates: grading columns are immutable.
  NEW.score := OLD.score;
  NEW.max_score := OLD.max_score;
  NEW.graded_at := OLD.graded_at;
  NEW.needs_manual_grading := OLD.needs_manual_grading;
  NEW.student_id := OLD.student_id;
  NEW.quiz_id := OLD.quiz_id;
  NEW.attempt_no := OLD.attempt_no;
  NEW.started_at := OLD.started_at;

  -- A student may lock their own attempt, never unlock it.
  IF OLD.locked_at IS NOT NULL THEN
    NEW.locked_at := OLD.locked_at;
    NEW.lock_reason := OLD.lock_reason;
  END IF;

  -- Only the platform may mark an attempt graded.
  IF NEW.status = 'graded' AND OLD.status <> 'graded' THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_attempts_protect_grading ON public.quiz_attempts;
CREATE TRIGGER quiz_attempts_protect_grading
BEFORE INSERT OR UPDATE ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.protect_quiz_attempt_grading();

-- 3. student_points: no self-awarding
DROP POLICY IF EXISTS "points insert" ON public.student_points;
CREATE POLICY "points insert" ON public.student_points
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (class_id IS NOT NULL AND public.is_class_teacher(class_id, auth.uid()))
);

-- 4. submissions: make the existing grading guard explicit on INSERT too
DROP POLICY IF EXISTS "sub_update" ON public.submissions;
CREATE POLICY "sub_update" ON public.submissions
FOR UPDATE TO authenticated
USING (
  student_id = auth.uid()
  OR public.is_assignment_owner(assignment_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  student_id = auth.uid()
  OR public.is_assignment_owner(assignment_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
