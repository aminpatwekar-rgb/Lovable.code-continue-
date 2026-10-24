-- Institution workflow fixes.
-- 1) Join codes come from a secure random source.
-- 2) use_count only counts real joins / new requests; declines refund; declined people wait 7 days.
-- 3) Regenerating a link keeps it switched off if it was off.
-- 4) Teacher links that need approval no longer grant the teacher role until approval.
-- 5) Admins are notified of new join requests.
-- 6) Class codes check the class's own institution (not just its department).
-- 7) Department enrollment copes with duplicate names; identity edit no longer forces an ID on ID-less members.
-- 8) Members see department student counts, not every student's name.
-- 9) One SQL function for the institution admin overview.

CREATE OR REPLACE FUNCTION public._new_institution_join_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  idx constant int[] := ARRAY[0, 1, 2, 3, 4, 5, 9, 10];
  b bytea;
  c text;
  i int;
BEGIN
  LOOP
    -- gen_random_uuid() is backed by a cryptographic source; bytes 6 and 8 hold fixed version bits, so skip them.
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    c := '';
    FOREACH i IN ARRAY idx LOOP
      c := c || substr(chars, 1 + (get_byte(b, i) % 32), 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.institution_join_links l WHERE l.code = c) THEN
      RETURN c;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._new_institution_join_code() FROM PUBLIC, anon, authenticated;

-- Regenerate keeps the on/off switch as it was.
CREATE OR REPLACE FUNCTION public.regenerate_institution_join_link(_institution_id uuid, _role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fresh text;
BEGIN
  IF NOT public._can_manage_institution(_institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join links for this institution';
  END IF;
  IF _role NOT IN ('student', 'teacher') THEN
    RAISE EXCEPTION 'Role must be student or teacher';
  END IF;

  PERFORM public.get_institution_join_links(_institution_id);
  fresh := public._new_institution_join_code();
  UPDATE public.institution_join_links l
  SET code = fresh, use_count = 0
  WHERE l.institution_id = _institution_id AND l.role = _role AND l.department_id IS NULL;
  RETURN fresh;
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerate_department_join_link(_department_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fresh text;
BEGIN
  PERFORM public.get_department_join_link(_department_id); -- also checks permission
  fresh := public._new_institution_join_code();
  UPDATE public.institution_join_links l
  SET code = fresh, use_count = 0
  WHERE l.department_id = _department_id;
  RETURN fresh;
END;
$$;

-- Join: counts only real joins/requests, cooldown after a decline, teacher role waits for approval.
CREATE OR REPLACE FUNCTION public.join_institution_with_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  link record;
  prof record;
  inst_name text;
  dept_name text;
  eff_role text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO link FROM public.institution_join_links l
  WHERE l.code = upper(trim(_code)) FOR UPDATE;
  IF NOT FOUND
     OR NOT link.is_active
     OR (link.expires_at IS NOT NULL AND link.expires_at < now())
     OR (link.max_uses IS NOT NULL AND link.use_count >= link.max_uses) THEN
    RAISE EXCEPTION 'This join link is no longer active. Ask your institution for a new one.';
  END IF;

  SELECT * INTO prof FROM public.profiles p WHERE p.id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF prof.is_active = false THEN RAISE EXCEPTION 'This account is suspended'; END IF;

  SELECT i.name INTO inst_name FROM public.institutions i WHERE i.id = link.institution_id;
  IF link.department_id IS NOT NULL THEN
    SELECT d.name INTO dept_name FROM public.departments d WHERE d.id = link.department_id;
  END IF;

  IF prof.institution_id = link.institution_id THEN
    IF link.department_id IS NOT NULL THEN
      IF NOT public.has_role(uid, 'student') THEN
        RAISE EXCEPTION 'This is a student link, but your account has a different role.';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.department_members dm WHERE dm.department_id = link.department_id AND dm.user_id = uid) THEN
        PERFORM public._place_student_in_department(link.department_id, uid);
        UPDATE public.institution_join_links l SET use_count = l.use_count + 1 WHERE l.id = link.id;
      END IF;
      RETURN jsonb_build_object('status', 'joined', 'institutionName', inst_name, 'departmentName', dept_name, 'role', link.role);
    END IF;
    RETURN jsonb_build_object('status', 'already_member', 'institutionName', inst_name, 'role', link.role);
  END IF;
  IF prof.institution_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to another institution. Ask your administrator to move you.';
  END IF;

  IF public.has_role(uid, 'admin') OR public.has_role(uid, 'institution_admin') THEN
    RAISE EXCEPTION 'Administrator accounts are assigned by the platform administrator, not through join links.';
  END IF;

  -- Already waiting: do not create or count a second request.
  IF EXISTS (
    SELECT 1 FROM public.institution_join_requests r
    WHERE r.institution_id = link.institution_id AND r.user_id = uid AND r.status = 'pending'
  ) THEN
    RETURN jsonb_build_object('status', 'pending', 'institutionName', inst_name, 'role', link.role);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.institution_join_requests r
    WHERE r.institution_id = link.institution_id AND r.user_id = uid
      AND r.status = 'declined' AND r.decided_at > now() - interval '7 days'
  ) THEN
    RAISE EXCEPTION 'Your earlier request was declined. Please contact the institution administrator before asking again.';
  END IF;

  IF prof.role_confirmed_at IS NULL THEN
    -- Brand-new signup. A teacher link that needs approval starts the account as a student;
    -- the teacher role is granted when an administrator approves.
    eff_role := CASE WHEN link.role = 'teacher' AND link.requires_approval THEN 'student' ELSE link.role END;
    DELETE FROM public.user_roles ur
    WHERE ur.user_id = uid AND ur.role IN ('student'::public.app_role, 'teacher'::public.app_role);
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, eff_role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles p
    SET role = eff_role, role_confirmed_at = now()
    WHERE p.id = uid AND p.role_confirmed_at IS NULL;
  ELSIF NOT public.has_role(uid, link.role::public.app_role) THEN
    RAISE EXCEPTION 'This is a % link, but your account has a different role.', link.role;
  END IF;

  IF link.requires_approval THEN
    INSERT INTO public.institution_join_requests (institution_id, user_id, role)
    VALUES (link.institution_id, uid, link.role);
    UPDATE public.institution_join_links l SET use_count = l.use_count + 1 WHERE l.id = link.id;
    RETURN jsonb_build_object('status', 'pending', 'institutionName', inst_name, 'role', link.role);
  END IF;

  UPDATE public.institution_join_links l SET use_count = l.use_count + 1 WHERE l.id = link.id;
  PERFORM set_config('onyx.institution_write', 'on', true);
  UPDATE public.profiles p SET institution_id = link.institution_id WHERE p.id = uid;
  IF link.department_id IS NOT NULL THEN
    PERFORM public._place_student_in_department(link.department_id, uid);
  END IF;
  RETURN jsonb_build_object('status', 'joined', 'institutionName', inst_name, 'departmentName', dept_name, 'role', link.role);
END;
$$;
REVOKE ALL ON FUNCTION public.join_institution_with_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_institution_with_code(text) TO authenticated;

-- Decide: approval grants the teacher role; a decline refunds the use.
CREATE OR REPLACE FUNCTION public.decide_institution_join_request(
  _request_id uuid,
  _approve boolean,
  _department_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req record;
  current_inst uuid;
BEGIN
  SELECT * INTO req FROM public.institution_join_requests r WHERE r.id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public._can_manage_institution(req.institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join requests for this institution';
  END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been decided'; END IF;

  IF _approve THEN
    IF _department_id IS NOT NULL
       AND public._department_institution(_department_id) IS DISTINCT FROM req.institution_id THEN
      RAISE EXCEPTION 'That department belongs to a different institution';
    END IF;
    SELECT p.institution_id INTO current_inst FROM public.profiles p WHERE p.id = req.user_id;
    IF current_inst IS NOT NULL AND current_inst <> req.institution_id THEN
      RAISE EXCEPTION 'This person has since joined a different institution';
    END IF;

    IF req.role = 'teacher'
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = req.user_id AND ur.role = 'teacher'::public.app_role)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = req.user_id AND ur.role::text IN ('admin', 'institution_admin')) THEN
      DELETE FROM public.user_roles ur WHERE ur.user_id = req.user_id AND ur.role = 'student'::public.app_role;
      INSERT INTO public.user_roles (user_id, role) VALUES (req.user_id, 'teacher'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
      UPDATE public.profiles p SET role = 'teacher' WHERE p.id = req.user_id;
    END IF;

    PERFORM set_config('onyx.institution_write', 'on', true);
    UPDATE public.profiles p SET institution_id = req.institution_id WHERE p.id = req.user_id;
    IF _department_id IS NOT NULL THEN
      IF req.role = 'teacher' THEN
        INSERT INTO public.department_members (department_id, user_id, role)
        VALUES (_department_id, req.user_id, 'teacher')
        ON CONFLICT (department_id, user_id) DO NOTHING;
      ELSE
        PERFORM public._place_student_in_department(_department_id, req.user_id);
      END IF;
    END IF;
  ELSE
    UPDATE public.institution_join_links l
    SET use_count = greatest(l.use_count - 1, 0)
    WHERE l.institution_id = req.institution_id AND l.role = req.role AND l.department_id IS NULL;
  END IF;

  UPDATE public.institution_join_requests r
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'declined' END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE r.id = _request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_institution_join_request(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_institution_join_request(uuid, boolean, uuid) TO authenticated;

-- Tell institution admins when someone is waiting.
CREATE OR REPLACE FUNCTION public.notify_join_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE who text;
BEGIN
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Someone') INTO who FROM public.profiles p WHERE p.id = NEW.user_id;
  INSERT INTO public.notifications (user_id, title, body, link, kind)
  SELECT ur.user_id, 'Join request waiting',
         who || ' wants to join as a ' || NEW.role || '.',
         '/institution-admin', 'institution'
  FROM public.user_roles ur
  JOIN public.profiles ap ON ap.id = ur.user_id
  WHERE ur.role::text = 'institution_admin' AND ap.institution_id = NEW.institution_id AND ap.is_active IS NOT FALSE;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_join_request_created() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS institution_join_requests_notify_new ON public.institution_join_requests;
CREATE TRIGGER institution_join_requests_notify_new
  AFTER INSERT ON public.institution_join_requests
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_join_request_created();

-- Class codes: use the class's own institution scope.
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
  class_inst uuid;
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

  
  SELECT c.institution_id INTO class_inst FROM public.classes c WHERE c.id = cid;
  IF class_inst IS NOT NULL AND NOT is_staff
     AND (SELECT p.institution_id FROM public.profiles p WHERE p.id = uid) IS DISTINCT FROM class_inst THEN
    RAISE EXCEPTION 'This class belongs to an institution. Join the institution first with its student link.';
  END IF;


  IF is_staff THEN
    RAISE EXCEPTION 'Teachers join as co-teacher: send a request and wait for the class owner to approve it.';
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

REVOKE ALL ON FUNCTION public.join_class_by_code(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text, text, text, text, text) TO authenticated, service_role;

-- Department enrollment: tolerate duplicate display names.
CREATE OR REPLACE FUNCTION public.enroll_students_in_class(_class_id uuid, _user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  inst uuid;
  uid uuid;
  nm text;
  n integer;
  enrolled integer := 0;
  skipped jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO c FROM public.classes k WHERE k.id = _class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF c.department_id IS NULL THEN RAISE EXCEPTION 'This class is not in a department yet'; END IF;
  inst := public._department_institution(c.department_id);

  IF NOT (
    auth.uid() = c.teacher_id
    OR EXISTS (
      SELECT 1 FROM public.class_members m
      WHERE m.class_id = _class_id AND m.student_id = auth.uid() AND m.member_role = 'teacher'
    )
    OR public._can_manage_institution(inst)
  ) THEN
    RAISE EXCEPTION 'Only this class''s teachers or the institution administrator can enroll students';
  END IF;
  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('enrolled', 0, 'skipped', skipped);
  END IF;
  IF array_length(_user_ids, 1) > 500 THEN RAISE EXCEPTION 'Enroll up to 500 students at a time'; END IF;

  FOREACH uid IN ARRAY _user_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.department_members dm
      WHERE dm.department_id = c.department_id AND dm.user_id = uid AND dm.role = 'student'
    ) THEN
      skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'Not a student of this department');
      CONTINUE;
    END IF;

    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(split_part(COALESCE(p.email, ''), '@', 1), ''), 'Student')
    INTO nm FROM public.profiles p WHERE p.id = uid;

    BEGIN
      INSERT INTO public.class_members (class_id, student_id, full_name, member_role)
      VALUES (_class_id, uid, nm, 'student')
      ON CONFLICT (class_id, student_id) DO NOTHING;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 1 THEN
        enrolled := enrolled + 1;
      ELSE
        skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'Already in the class');
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        -- Same display name as someone already in the class: retry with the email name added.
        BEGIN
          INSERT INTO public.class_members (class_id, student_id, full_name, member_role)
          VALUES (_class_id, uid, nm || ' (' || COALESCE(NULLIF(split_part((SELECT p.email FROM public.profiles p WHERE p.id = uid), '@', 1), ''), 'student') || ')', 'student')
          ON CONFLICT (class_id, student_id) DO NOTHING;
          GET DIAGNOSTICS n = ROW_COUNT;
          IF n = 1 THEN
            enrolled := enrolled + 1;
          ELSE
            skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'Already in the class');
          END IF;
        EXCEPTION WHEN unique_violation THEN
          skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'A student with the same name is already in the class');
        END;
      WHEN raise_exception THEN
        skipped := skipped || jsonb_build_object('userId', uid, 'reason', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('enrolled', enrolled, 'skipped', skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_students_in_class(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_students_in_class(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_class_member_identity(
  _class_id uuid,
  _member_id uuid,
  _full_name text,
  _roll_no text,
  _er_no text,
  _sr_no text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target public.class_members%ROWTYPE;
  cleaned_name text := btrim(coalesce(_full_name, ''));
  cleaned_roll text := nullif(btrim(coalesce(_roll_no, '')), '');
  cleaned_er text := nullif(btrim(coalesce(_er_no, '')), '');
  cleaned_sr text := nullif(btrim(coalesce(_sr_no, '')), '');
  violated_constraint text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.is_class_teacher(_class_id, uid)
    OR public.has_role(uid, 'admin')
  ) THEN
    RAISE EXCEPTION 'Only this class''s teacher or a platform admin can edit student details.';
  END IF;

  SELECT m.* INTO target
  FROM public.class_members m
  WHERE m.id = _member_id AND m.class_id = _class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found in this class.';
  END IF;

  IF target.member_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Only student roster details can be edited here.';
  END IF;

  IF cleaned_name = '' THEN
    RAISE EXCEPTION 'Student full name is required.';
  END IF;
  IF length(cleaned_name) > 120 THEN
    RAISE EXCEPTION 'Student full name must be 120 characters or fewer.';
  END IF;
  -- Students added through a department may have no IDs yet; only insist on one if they already had one.
  IF cleaned_roll IS NULL AND cleaned_er IS NULL AND cleaned_sr IS NULL
     AND (target.roll_no IS NOT NULL OR target.er_no IS NOT NULL OR target.sr_no IS NOT NULL) THEN
    RAISE EXCEPTION 'Enter at least one identifier: Roll No., ER No., or Sr No.';
  END IF;
  IF length(coalesce(cleaned_roll, '')) > 80
     OR length(coalesce(cleaned_er, '')) > 80
     OR length(coalesce(cleaned_sr, '')) > 80 THEN
    RAISE EXCEPTION 'Each student identifier must be 80 characters or fewer.';
  END IF;

  BEGIN
    UPDATE public.class_members
    SET full_name = cleaned_name,
        roll_no = cleaned_roll,
        er_no = cleaned_er,
        sr_no = cleaned_sr
    WHERE id = _member_id AND class_id = _class_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
    IF violated_constraint = 'class_members_roll_uniq' THEN
      RAISE EXCEPTION 'This Roll No. is already registered in this class.';
    ELSIF violated_constraint = 'class_members_er_uniq' THEN
      RAISE EXCEPTION 'This ER No. is already registered in this class.';
    ELSIF violated_constraint = 'class_members_sr_uniq' THEN
      RAISE EXCEPTION 'This Sr No. is already registered in this class.';
    ELSIF violated_constraint = 'class_members_name_uniq' THEN
      RAISE EXCEPTION 'A student with this name is already registered in this class.';
    ELSE
      RAISE EXCEPTION 'These student details conflict with another roster entry.';
    END IF;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.update_class_member_identity(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_class_member_identity(uuid, uuid, text, text, text, text) TO authenticated, service_role;

-- My institution: department student counts only (no full student name list).
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
      'students', '[]'::jsonb,
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

-- One round trip for the institution admin console (replaces many service-role queries).
CREATE OR REPLACE FUNCTION public.institution_admin_overview(_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inst jsonb;
  roster jsonb;
  n_classes integer;
  n_assignments integer;
  n_submissions integer;
BEGIN
  IF NOT public.is_institution_admin(_institution_id) THEN
    RAISE EXCEPTION 'You are not authorized to manage this institution.';
  END IF;

  SELECT jsonb_build_object('id', i.id, 'name', i.name, 'code', i.code, 'city', i.city)
  INTO inst FROM public.institutions i WHERE i.id = _institution_id;
  IF inst IS NULL THEN RAISE EXCEPTION 'Institution not found'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', m.id, 'fullName', COALESCE(m.full_name, ''), 'email', COALESCE(m.email, ''),
           'role', m.role, 'isActive', m.is_active IS NOT FALSE, 'createdAt', m.created_at
         ) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO roster
  FROM (
    SELECT * FROM (
      SELECT p.id, p.full_name, p.email, p.is_active, p.created_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'admin') THEN NULL
          WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'institution_admin') THEN 'institution_admin'
          WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'teacher') THEN 'teacher'
          WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'student') THEN 'student'
        END AS role
      FROM public.profiles p
      WHERE p.institution_id = _institution_id
    ) x WHERE x.role IS NOT NULL
    ORDER BY x.created_at DESC LIMIT 5000
  ) m;

  SELECT count(*) INTO n_classes FROM public.classes c WHERE c.institution_id = _institution_id;
  SELECT count(*) INTO n_assignments
  FROM public.assignments a JOIN public.classes c ON c.id = a.class_id WHERE c.institution_id = _institution_id;
  SELECT count(*) INTO n_submissions
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  JOIN public.classes c ON c.id = a.class_id
  WHERE c.institution_id = _institution_id;

  RETURN jsonb_build_object(
    'institution', inst,
    'classes', n_classes,
    'assignments', n_assignments,
    'submissions', n_submissions,
    'roster', roster
  );
END;
$$;
REVOKE ALL ON FUNCTION public.institution_admin_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_admin_overview(uuid) TO authenticated;
