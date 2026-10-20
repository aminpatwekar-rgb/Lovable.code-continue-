-- Lets students and teachers see which institution they belong to: institution, their
-- departments, their classes, and the NAMES (only) of the classmates and teachers they share them with.
CREATE OR REPLACE FUNCTION public.get_my_institution()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  uid uuid := auth.uid();
  inst uuid;
  inst_json jsonb := NULL;
  pending_json jsonb;
  depts_json jsonb := '[]'::jsonb;
  classes_json jsonb := '[]'::jsonb;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;

  SELECT p.institution_id INTO inst FROM public.profiles p WHERE p.id = uid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'institutionName', i.name, 'role', r.role, 'requestedAt', r.created_at
         ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO pending_json
  FROM public.institution_join_requests r
  JOIN public.institutions i ON i.id = r.institution_id
  WHERE r.user_id = uid AND r.status = 'pending';

  IF inst IS NOT NULL THEN
    SELECT jsonb_build_object('id', i.id, 'name', i.name, 'city', i.city)
    INTO inst_json FROM public.institutions i WHERE i.id = inst;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'code', d.code,
      'myRole', my.role,
      'teachers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('fullName', p.full_name) ORDER BY p.full_name)
        FROM public.department_members dm
        JOIN public.profiles p ON p.id = dm.user_id
        WHERE dm.department_id = d.id AND dm.role = 'teacher'
          AND dm.user_id <> uid AND p.institution_id = inst AND p.is_active IS NOT FALSE
      ), '[]'::jsonb),
      'students', COALESCE((
        SELECT jsonb_agg(x.j ORDER BY x.n) FROM (
          SELECT p.full_name AS n, jsonb_build_object('fullName', p.full_name) AS j
          FROM public.department_members dm
          JOIN public.profiles p ON p.id = dm.user_id
          WHERE dm.department_id = d.id AND dm.role = 'student'
            AND dm.user_id <> uid AND p.institution_id = inst AND p.is_active IS NOT FALSE
          ORDER BY p.full_name LIMIT 300
        ) x
      ), '[]'::jsonb),
      'studentCount', (
        SELECT count(*) FROM public.department_members dm
        JOIN public.profiles p ON p.id = dm.user_id
        WHERE dm.department_id = d.id AND dm.role = 'student'
          AND p.institution_id = inst AND p.is_active IS NOT FALSE
      )
    ) ORDER BY d.name), '[]'::jsonb)
    INTO depts_json
    FROM public.departments d
    JOIN public.department_members my ON my.department_id = d.id AND my.user_id = uid
    WHERE d.institution_id = inst;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'subject', c.subject,
      'section', c.section,
      'departmentName', (SELECT d.name FROM public.departments d WHERE d.id = c.department_id),
      'myRole', CASE WHEN c.teacher_id = uid OR EXISTS (
                  SELECT 1 FROM public.class_members m
                  WHERE m.class_id = c.id AND m.student_id = uid AND m.member_role = 'teacher')
                THEN 'teacher' ELSE 'student' END,
      'teachers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('fullName', t.n) ORDER BY t.n) FROM (
          SELECT p.full_name AS n FROM public.profiles p
          WHERE p.id = c.teacher_id AND p.id <> uid
          UNION
          SELECT COALESCE(p.full_name, m.full_name) FROM public.class_members m
          LEFT JOIN public.profiles p ON p.id = m.student_id
          WHERE m.class_id = c.id AND m.member_role = 'teacher' AND m.student_id <> uid
        ) t WHERE t.n IS NOT NULL
      ), '[]'::jsonb),
      'classmates', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('fullName', s.n) ORDER BY s.n) FROM (
          SELECT COALESCE(p.full_name, m.full_name) AS n
          FROM public.class_members m
          LEFT JOIN public.profiles p ON p.id = m.student_id
          WHERE m.class_id = c.id AND COALESCE(m.member_role, 'student') = 'student'
            AND m.student_id <> uid AND (p.id IS NULL OR p.is_active IS NOT FALSE)
          ORDER BY 1 LIMIT 300
        ) s WHERE s.n IS NOT NULL
      ), '[]'::jsonb)
    ) ORDER BY c.name), '[]'::jsonb)
    INTO classes_json
    FROM public.classes c
    WHERE c.institution_id = inst AND c.archived = false
      AND (c.teacher_id = uid OR EXISTS (
            SELECT 1 FROM public.class_members m WHERE m.class_id = c.id AND m.student_id = uid));
  END IF;

  RETURN jsonb_build_object(
    'institution', inst_json,
    'pending', pending_json,
    'departments', depts_json,
    'classes', classes_json
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_institution() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_institution() TO authenticated;

-- Notifications ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_department_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE dept_name text; inst_name text;
BEGIN
  SELECT d.name, i.name INTO dept_name, inst_name
  FROM public.departments d JOIN public.institutions i ON i.id = d.institution_id
  WHERE d.id = NEW.department_id;
  IF dept_name IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, title, body, link, kind)
  VALUES (NEW.user_id, 'Added to a department',
          'You are now in ' || dept_name || ' at ' || inst_name || '.',
          '/my-institution', 'institution');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS department_members_notify ON public.department_members;
CREATE TRIGGER department_members_notify AFTER INSERT ON public.department_members
FOR EACH ROW EXECUTE FUNCTION public.notify_department_added();

CREATE OR REPLACE FUNCTION public.notify_join_request_decided()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE inst_name text;
BEGIN
  SELECT i.name INTO inst_name FROM public.institutions i WHERE i.id = NEW.institution_id;
  IF inst_name IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'approved' THEN
    INSERT INTO public.notifications (user_id, title, body, link, kind)
    VALUES (NEW.user_id, 'Welcome to ' || inst_name,
            'Your request to join ' || inst_name || ' as a ' || NEW.role || ' was approved.',
            '/my-institution', 'institution');
  ELSE
    INSERT INTO public.notifications (user_id, title, body, link, kind)
    VALUES (NEW.user_id, 'Join request declined',
            inst_name || ' did not approve your request to join.',
            '/dashboard', 'institution');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_join_requests_notify ON public.institution_join_requests;
CREATE TRIGGER institution_join_requests_notify AFTER UPDATE OF status ON public.institution_join_requests
FOR EACH ROW WHEN (OLD.status = 'pending' AND NEW.status IN ('approved','declined'))
EXECUTE FUNCTION public.notify_join_request_decided();
