-- 1. Grade release ---------------------------------------------------------
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS grade_released boolean NOT NULL DEFAULT false;

UPDATE public.submissions SET grade_released = true WHERE marks_awarded IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_submission_grading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_assignment_owner(NEW.assignment_id, auth.uid())
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Students may edit their own work, never their grade.
  NEW.marks_awarded := OLD.marks_awarded;
  NEW.teacher_feedback := OLD.teacher_feedback;
  NEW.improvement_notes := OLD.improvement_notes;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.grade_released := OLD.grade_released;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submissions_protect_grading ON public.submissions;
CREATE TRIGGER submissions_protect_grading
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_submission_grading();

-- 2. Enrollment identity ----------------------------------------------------
ALTER TABLE public.class_members
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS roll_no text,
  ADD COLUMN IF NOT EXISTS er_no text,
  ADD COLUMN IF NOT EXISTS sr_no text;

CREATE UNIQUE INDEX IF NOT EXISTS class_members_roll_uniq
  ON public.class_members (class_id, lower(btrim(roll_no))) WHERE roll_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS class_members_er_uniq
  ON public.class_members (class_id, lower(btrim(er_no))) WHERE er_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS class_members_sr_uniq
  ON public.class_members (class_id, lower(btrim(sr_no))) WHERE sr_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS class_members_name_uniq
  ON public.class_members (class_id, lower(btrim(full_name))) WHERE full_name IS NOT NULL;

-- 3. Join with identity -----------------------------------------------------
DROP FUNCTION IF EXISTS public.join_class_by_code(text);

CREATE OR REPLACE FUNCTION public.join_class_by_code(
  _code text,
  _full_name text,
  _roll_no text,
  _er_no text,
  _sr_no text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF btrim(coalesce(_full_name,'')) = '' THEN RAISE EXCEPTION 'Full name is required'; END IF;
  IF btrim(coalesce(_roll_no,'')) = '' THEN RAISE EXCEPTION 'Roll No. is required'; END IF;
  IF btrim(coalesce(_er_no,'')) = '' THEN RAISE EXCEPTION 'ER No. is required'; END IF;
  IF btrim(coalesce(_sr_no,'')) = '' THEN RAISE EXCEPTION 'Sr No. is required'; END IF;

  SELECT id INTO cid FROM public.classes
   WHERE upper(join_code) = upper(btrim(_code)) AND archived = false;
  IF cid IS NULL THEN RAISE EXCEPTION 'Invalid join code'; END IF;

  IF EXISTS (SELECT 1 FROM public.class_members WHERE class_id = cid AND student_id = uid) THEN
    RETURN cid;
  END IF;

  BEGIN
    INSERT INTO public.class_members (class_id, student_id, full_name, roll_no, er_no, sr_no)
    VALUES (cid, uid, btrim(_full_name), btrim(_roll_no), btrim(_er_no), btrim(_sr_no));
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE '%class_members_roll_uniq%' THEN
      RAISE EXCEPTION 'This Roll No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_er_uniq%' THEN
      RAISE EXCEPTION 'This ER No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_sr_uniq%' THEN
      RAISE EXCEPTION 'This Sr No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_name_uniq%' THEN
      RAISE EXCEPTION 'A student with this name is already registered in this class.';
    ELSE
      RAISE EXCEPTION 'You are already registered in this class.';
    END IF;
  END;

  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.join_class_by_code(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text, text, text, text, text) TO authenticated;

-- 4. Privacy-safe roster ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_class_roster(_class_id uuid)
RETURNS TABLE(
  id uuid,
  student_id uuid,
  full_name text,
  joined_at timestamptz,
  roll_no text,
  er_no text,
  sr_no text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id,
         m.student_id,
         coalesce(nullif(btrim(m.full_name), ''), p.full_name) AS full_name,
         m.joined_at,
         CASE WHEN priv.ok THEN m.roll_no END,
         CASE WHEN priv.ok THEN m.er_no END,
         CASE WHEN priv.ok THEN m.sr_no END
  FROM public.class_members m
  LEFT JOIN public.profiles p ON p.id = m.student_id
  CROSS JOIN LATERAL (
    SELECT (public.is_class_teacher(_class_id, auth.uid())
            OR public.has_role(auth.uid(), 'admin')
            OR m.student_id = auth.uid()) AS ok
  ) priv
  WHERE m.class_id = _class_id
    AND auth.uid() IS NOT NULL
    AND (public.is_class_member(_class_id, auth.uid())
         OR public.is_class_teacher(_class_id, auth.uid())
         OR public.has_role(auth.uid(), 'admin'))
  ORDER BY m.joined_at;
$$;

REVOKE ALL ON FUNCTION public.get_class_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_roster(uuid) TO authenticated;

-- 5. Leave class ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_class(_class_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cname text;
  tid uuid;
  sname text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT c.name, c.teacher_id INTO cname, tid FROM public.classes c WHERE c.id = _class_id;
  IF cname IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;

  SELECT coalesce(nullif(btrim(m.full_name), ''), p.full_name, 'A student')
    INTO sname
  FROM public.class_members m
  LEFT JOIN public.profiles p ON p.id = m.student_id
  WHERE m.class_id = _class_id AND m.student_id = uid;

  IF sname IS NULL THEN RAISE EXCEPTION 'You are not enrolled in this class'; END IF;

  DELETE FROM public.class_members WHERE class_id = _class_id AND student_id = uid;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (tid, 'Student left class',
          sname || ' has left ' || cname || '.',
          'class', '/classes/' || _class_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_class(uuid) TO authenticated;