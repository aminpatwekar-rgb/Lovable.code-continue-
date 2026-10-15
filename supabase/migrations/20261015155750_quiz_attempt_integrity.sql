-- Quiz integrity: once a student submits, the attempt is frozen.
--
-- Until now the database only protected the *grading* columns (score, is_correct,
-- awarded_points, feedback). Students could still, directly through the API:
--   * edit or add answers after submitting,
--   * set a graded attempt back to "in_progress" and have it graded again,
--   * start more attempts than the quiz allows,
--   * start a quiz before it opens / after it closes,
--   * keep saving answers after the time limit or after the attempt was locked.
--
-- The server-side grader (service role, auth.uid() IS NULL), the quiz owner/teacher and
-- admins are unaffected: every rule below only applies to the student's own session.

-- 1. quiz_attempts ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_quiz_attempt_grading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.quizzes%ROWTYPE;
  used integer;
BEGIN
  -- Service role (the server-side grader) is trusted.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Quiz owner and admins are trusted (marking, unlocking, corrections).
  IF public.owns_quiz(NEW.quiz_id, auth.uid())
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO q FROM public.quizzes WHERE id = NEW.quiz_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Quiz not found' USING ERRCODE = '42501';
    END IF;

    IF q.start_at IS NOT NULL AND now() < q.start_at THEN
      RAISE EXCEPTION 'This quiz has not opened yet' USING ERRCODE = '42501';
    END IF;
    IF q.end_at IS NOT NULL AND now() > q.end_at THEN
      RAISE EXCEPTION 'This quiz has closed' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO used
      FROM public.quiz_attempts
     WHERE quiz_id = NEW.quiz_id AND student_id = NEW.student_id;
    IF used >= q.max_attempts THEN
      RAISE EXCEPTION 'You have used all your attempts for this quiz' USING ERRCODE = '42501';
    END IF;

    -- Everything about a new attempt is decided by the platform, not the browser.
    NEW.attempt_no := used + 1;
    NEW.started_at := now();
    NEW.submitted_at := NULL;
    NEW.score := NULL;
    NEW.max_score := NULL;
    NEW.graded_at := NULL;
    NEW.needs_manual_grading := false;
    NEW.locked_at := NULL;
    NEW.lock_reason := NULL;
    NEW.status := 'in_progress';
    RETURN NEW;
  END IF;

  -- Student updates: result and lifecycle columns are immutable.
  NEW.score := OLD.score;
  NEW.max_score := OLD.max_score;
  NEW.graded_at := OLD.graded_at;
  NEW.needs_manual_grading := OLD.needs_manual_grading;
  NEW.student_id := OLD.student_id;
  NEW.quiz_id := OLD.quiz_id;
  NEW.attempt_no := OLD.attempt_no;
  NEW.started_at := OLD.started_at;
  NEW.submitted_at := OLD.submitted_at;
  NEW.status := OLD.status;            -- only the platform moves an attempt forward
  NEW.question_order := OLD.question_order;

  -- A student may lock their own attempt (lockdown mode), never unlock it.
  IF OLD.locked_at IS NOT NULL THEN
    NEW.locked_at := OLD.locked_at;
    NEW.lock_reason := OLD.lock_reason;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. quiz_answers ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_quiz_answer_grading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.quiz_attempts%ROWTYPE;
  limit_minutes integer;
BEGIN
  -- Service role (the server-side grader) is trusted.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Reviewers (quiz owner / teacher with review rights) and admins are trusted.
  IF public.reviews_attempt(NEW.attempt_id, auth.uid())
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO a FROM public.quiz_attempts WHERE id = NEW.attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = '42501';
  END IF;

  -- A student can only write answers into an attempt that is still open.
  IF a.status <> 'in_progress' THEN
    RAISE EXCEPTION 'This attempt has already been submitted' USING ERRCODE = '42501';
  END IF;
  IF a.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This attempt is locked' USING ERRCODE = '42501';
  END IF;

  SELECT time_limit_minutes INTO limit_minutes FROM public.quizzes WHERE id = a.quiz_id;
  -- 60 seconds of grace so the final autosave at the buzzer is not lost.
  IF limit_minutes IS NOT NULL AND limit_minutes > 0
     AND now() > a.started_at + make_interval(mins => limit_minutes) + interval '60 seconds' THEN
    RAISE EXCEPTION 'Time is up for this attempt' USING ERRCODE = '42501';
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
