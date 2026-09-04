CREATE OR REPLACE FUNCTION public.get_quiz_question_counts(_quiz_ids uuid[])
RETURNS TABLE(quiz_id uuid, question_count integer, total_points numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.quiz_id, count(*)::int, coalesce(sum(q.points), 0)
  FROM public.quiz_questions q
  WHERE q.quiz_id = ANY(_quiz_ids)
    AND public.can_view_quiz(q.quiz_id, auth.uid())
  GROUP BY q.quiz_id;
$$;

REVOKE ALL ON FUNCTION public.get_quiz_question_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_question_counts(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.join_class_by_code(_code text, _full_name text, _roll_no text, _er_no text, _sr_no text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  owner uuid;
  uid uuid := auth.uid();
  is_staff boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, teacher_id INTO cid, owner FROM public.classes
   WHERE upper(join_code) = upper(btrim(_code)) AND archived = false;
  IF cid IS NULL THEN RAISE EXCEPTION 'Invalid join code'; END IF;

  is_staff := public.has_role(uid, 'teacher') OR public.has_role(uid, 'admin');

  IF owner = uid THEN
    RAISE EXCEPTION 'You already own this class';
  END IF;

  IF EXISTS (SELECT 1 FROM public.class_members WHERE class_id = cid AND student_id = uid) THEN
    RETURN cid;
  END IF;

  IF is_staff THEN
    INSERT INTO public.class_members (class_id, student_id, full_name, member_role)
    VALUES (cid, uid,
            nullif(btrim(coalesce(_full_name, (SELECT p.full_name FROM public.profiles p WHERE p.id = uid), '')), ''),
            'teacher');
    RETURN cid;
  END IF;

  IF btrim(coalesce(_full_name,'')) = '' THEN RAISE EXCEPTION 'Full name is required'; END IF;
  IF btrim(coalesce(_roll_no,'')) = ''
     AND btrim(coalesce(_er_no,'')) = ''
     AND btrim(coalesce(_sr_no,'')) = '' THEN
    RAISE EXCEPTION 'Provide at least one of Roll No., ER No. or Sr No.';
  END IF;

  BEGIN
    INSERT INTO public.class_members (class_id, student_id, full_name, roll_no, er_no, sr_no, member_role)
    VALUES (cid, uid, btrim(_full_name),
            nullif(btrim(coalesce(_roll_no,'')), ''),
            nullif(btrim(coalesce(_er_no,'')), ''),
            nullif(btrim(coalesce(_sr_no,'')), ''),
            'student');
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
  mrole text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT c.name, c.teacher_id INTO cname, tid FROM public.classes c WHERE c.id = _class_id;
  IF cname IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;

  IF tid = uid THEN
    RAISE EXCEPTION 'You own this class and cannot leave it. Transfer or delete it instead.';
  END IF;

  SELECT coalesce(nullif(btrim(m.full_name), ''), p.full_name, 'A member'), m.member_role
    INTO sname, mrole
  FROM public.class_members m
  LEFT JOIN public.profiles p ON p.id = m.student_id
  WHERE m.class_id = _class_id AND m.student_id = uid;

  IF sname IS NULL THEN RAISE EXCEPTION 'You are not enrolled in this class'; END IF;

  DELETE FROM public.class_members WHERE class_id = _class_id AND student_id = uid;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (tid,
          CASE WHEN mrole = 'teacher' THEN 'Co-teacher left class' ELSE 'Student left class' END,
          sname || ' has left ' || cname || '.',
          'class', '/classes/' || _class_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.join_class_by_code(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_class(uuid) TO authenticated, service_role;