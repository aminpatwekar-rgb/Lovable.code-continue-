-- Departments: who belongs to a department, which classes belong to it, and how students
-- get into classes. Only institution admins create departments and assign people to them.
-- Also adds a student join link per department.

-- ---------------------------------------------------------------------------
-- 1. Department membership
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.department_members (
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('student', 'teacher')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, user_id)
);
-- Teachers may be in several departments; a student is in exactly one.
CREATE UNIQUE INDEX IF NOT EXISTS department_members_one_department_per_student
  ON public.department_members (user_id) WHERE role = 'student';
CREATE INDEX IF NOT EXISTS department_members_user_idx ON public.department_members (user_id);

CREATE OR REPLACE FUNCTION public._department_institution(_department_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.institution_id FROM public.departments d WHERE d.id = _department_id;
$$;

CREATE OR REPLACE FUNCTION public.is_department_member(_department_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.department_members dm
    WHERE dm.department_id = _department_id AND dm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public._department_institution(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_department_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_department_member(uuid) TO authenticated;

ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.department_members TO authenticated;
GRANT ALL ON public.department_members TO service_role;
DROP POLICY IF EXISTS department_members_read ON public.department_members;
CREATE POLICY department_members_read
  ON public.department_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_institution_admin(public._department_institution(department_id)));

-- Members can see the departments they belong to (needed for the class form).
DROP POLICY IF EXISTS departments_select_member ON public.departments;
CREATE POLICY departments_select_member
  ON public.departments FOR SELECT TO authenticated
  USING (public.is_department_member(id));

-- Leaving an institution also leaves its departments.
CREATE OR REPLACE FUNCTION public.clear_department_members_on_institution_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    DELETE FROM public.department_members dm
    USING public.departments d
    WHERE dm.user_id = NEW.id
      AND d.id = dm.department_id
      AND d.institution_id IS DISTINCT FROM NEW.institution_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_department_members_on_institution_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_clear_department_members ON public.profiles;
CREATE TRIGGER profiles_clear_department_members
  AFTER UPDATE ON public.profiles
  FOR EACH ROW WHEN (NEW.institution_id IS DISTINCT FROM OLD.institution_id)
  EXECUTE FUNCTION public.clear_department_members_on_institution_change();

-- ---------------------------------------------------------------------------
-- 2. Classes belong to a department
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS classes_department_id_idx ON public.classes (department_id);

CREATE OR REPLACE FUNCTION public.validate_class_department()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dept_inst uuid;
BEGIN
  IF NEW.department_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service role

  dept_inst := public._department_institution(NEW.department_id);
  IF dept_inst IS NULL THEN RAISE EXCEPTION 'Department not found'; END IF;

  IF public.has_role(auth.uid(), 'admin')
     OR public.is_institution_admin(dept_inst)
     OR EXISTS (
       SELECT 1 FROM public.department_members dm
       WHERE dm.department_id = NEW.department_id
         AND dm.user_id = NEW.teacher_id
         AND dm.role = 'teacher'
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'You can only create classes in departments you belong to';
END;
$$;
REVOKE ALL ON FUNCTION public.validate_class_department() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS classes_validate_department ON public.classes;
CREATE TRIGGER classes_validate_department
  BEFORE INSERT OR UPDATE OF department_id ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.validate_class_department();

-- Class codes of institution classes only work for that institution's students.
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

  -- Classes that belong to an institution department only accept that institution's students.
  SELECT d.institution_id INTO class_inst
  FROM public.classes c JOIN public.departments d ON d.id = c.department_id
  WHERE c.id = cid;
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

-- ---------------------------------------------------------------------------
-- 3. Department student links (extends institution_join_links)
-- ---------------------------------------------------------------------------
ALTER TABLE public.institution_join_links
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE;
ALTER TABLE public.institution_join_links
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.institution_join_links DROP CONSTRAINT IF EXISTS institution_join_links_pkey;
ALTER TABLE public.institution_join_links ADD PRIMARY KEY (id);
ALTER TABLE public.institution_join_links DROP CONSTRAINT IF EXISTS institution_join_links_department_students_only;
ALTER TABLE public.institution_join_links
  ADD CONSTRAINT institution_join_links_department_students_only
  CHECK (department_id IS NULL OR (role = 'student' AND requires_approval = false));

CREATE UNIQUE INDEX IF NOT EXISTS institution_join_links_institution_role_uidx
  ON public.institution_join_links (institution_id, role) WHERE department_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS institution_join_links_department_uidx
  ON public.institution_join_links (department_id) WHERE department_id IS NOT NULL;

-- Institution-level link functions now ignore department links.
CREATE OR REPLACE FUNCTION public.get_institution_join_links(_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  r text;
BEGIN
  IF NOT public._can_manage_institution(_institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join links for this institution';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = _institution_id) THEN
    RAISE EXCEPTION 'Institution not found';
  END IF;

  FOREACH r IN ARRAY ARRAY['student', 'teacher'] LOOP
    INSERT INTO public.institution_join_links (institution_id, role, code, requires_approval)
    VALUES (_institution_id, r, public._new_institution_join_code(), r = 'teacher')
    ON CONFLICT (institution_id, role) WHERE department_id IS NULL DO NOTHING;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'role', l.role,
    'code', l.code,
    'isActive', l.is_active,
    'requiresApproval', l.requires_approval,
    'expiresAt', l.expires_at,
    'maxUses', l.max_uses,
    'useCount', l.use_count
  ) ORDER BY l.role DESC), '[]'::jsonb)
  INTO result
  FROM public.institution_join_links l
  WHERE l.institution_id = _institution_id AND l.department_id IS NULL;

  RETURN result;
END;
$$;

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
  SET code = fresh, use_count = 0, is_active = true
  WHERE l.institution_id = _institution_id AND l.role = _role AND l.department_id IS NULL;
  RETURN fresh;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_institution_join_link(
  _institution_id uuid,
  _role text,
  _is_active boolean,
  _requires_approval boolean,
  _expires_at timestamptz,
  _max_uses integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._can_manage_institution(_institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join links for this institution';
  END IF;
  IF _role NOT IN ('student', 'teacher') THEN
    RAISE EXCEPTION 'Role must be student or teacher';
  END IF;
  IF _max_uses IS NOT NULL AND _max_uses < 1 THEN
    RAISE EXCEPTION 'Maximum uses must be at least 1';
  END IF;

  PERFORM public.get_institution_join_links(_institution_id);
  UPDATE public.institution_join_links l
  SET is_active = _is_active,
      requires_approval = _requires_approval,
      expires_at = _expires_at,
      max_uses = _max_uses
  WHERE l.institution_id = _institution_id AND l.role = _role AND l.department_id IS NULL;
END;
$$;

-- Department student link: get (creating on first use), regenerate, update.
CREATE OR REPLACE FUNCTION public.get_department_join_link(_department_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inst uuid := public._department_institution(_department_id);
  result jsonb;
BEGIN
  IF inst IS NULL THEN RAISE EXCEPTION 'Department not found'; END IF;
  IF NOT public._can_manage_institution(inst) THEN
    RAISE EXCEPTION 'You cannot manage join links for this institution';
  END IF;

  INSERT INTO public.institution_join_links (institution_id, department_id, role, code, requires_approval)
  VALUES (inst, _department_id, 'student', public._new_institution_join_code(), false)
  ON CONFLICT (department_id) WHERE department_id IS NOT NULL DO NOTHING;

  SELECT jsonb_build_object(
    'role', l.role, 'code', l.code, 'isActive', l.is_active, 'requiresApproval', l.requires_approval,
    'expiresAt', l.expires_at, 'maxUses', l.max_uses, 'useCount', l.use_count
  ) INTO result
  FROM public.institution_join_links l WHERE l.department_id = _department_id;
  RETURN result;
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
  PERFORM public.get_department_join_link(_department_id);
  fresh := public._new_institution_join_code();
  UPDATE public.institution_join_links l
  SET code = fresh, use_count = 0, is_active = true
  WHERE l.department_id = _department_id;
  RETURN fresh;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_department_join_link(
  _department_id uuid,
  _is_active boolean,
  _expires_at timestamptz,
  _max_uses integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _max_uses IS NOT NULL AND _max_uses < 1 THEN
    RAISE EXCEPTION 'Maximum uses must be at least 1';
  END IF;
  PERFORM public.get_department_join_link(_department_id);
  UPDATE public.institution_join_links l
  SET is_active = _is_active, expires_at = _expires_at, max_uses = _max_uses
  WHERE l.department_id = _department_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_department_join_link(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.regenerate_department_join_link(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_department_join_link(uuid, boolean, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_join_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_department_join_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_department_join_link(uuid, boolean, timestamptz, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Placing people in departments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._place_student_in_department(_department_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.department_members dm
  WHERE dm.user_id = _user_id AND dm.role = 'student' AND dm.department_id <> _department_id;
  INSERT INTO public.department_members (department_id, user_id, role)
  VALUES (_department_id, _user_id, 'student')
  ON CONFLICT (department_id, user_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public._place_student_in_department(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_institution_people(_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._can_manage_institution(_institution_id) THEN
    RAISE EXCEPTION 'You cannot view people for this institution';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', p.id,
      'fullName', p.full_name,
      'email', p.email,
      'role', CASE
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'teacher'::public.app_role) THEN 'teacher'
        ELSE 'student' END,
      'departmentIds', COALESCE((SELECT jsonb_agg(dm.department_id) FROM public.department_members dm WHERE dm.user_id = p.id), '[]'::jsonb)
    ) ORDER BY p.full_name)
    FROM public.profiles p
    WHERE p.institution_id = _institution_id
      AND p.is_active IS NOT FALSE
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('student'::public.app_role, 'teacher'::public.app_role)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role::text IN ('admin', 'institution_admin')
      )
  ), '[]'::jsonb);
END;
$$;

-- Add people to a department. Students move from their previous department; teachers can be in several.
CREATE OR REPLACE FUNCTION public.assign_department_members(_department_id uuid, _user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inst uuid := public._department_institution(_department_id);
  uid uuid;
  prof record;
  is_teacher boolean;
  is_student boolean;
  assigned integer := 0;
  skipped jsonb := '[]'::jsonb;
BEGIN
  IF inst IS NULL THEN RAISE EXCEPTION 'Department not found'; END IF;
  IF NOT public._can_manage_institution(inst) THEN
    RAISE EXCEPTION 'Only the institution administrator can assign people to departments';
  END IF;
  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('assigned', 0, 'skipped', skipped);
  END IF;
  IF array_length(_user_ids, 1) > 500 THEN RAISE EXCEPTION 'Assign up to 500 people at a time'; END IF;

  FOREACH uid IN ARRAY _user_ids LOOP
    SELECT p.id, p.institution_id, p.is_active INTO prof FROM public.profiles p WHERE p.id = uid;
    IF NOT FOUND OR prof.institution_id IS DISTINCT FROM inst THEN
      skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'Not a member of this institution');
      CONTINUE;
    END IF;
    IF prof.is_active = false THEN
      skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'Account is suspended');
      CONTINUE;
    END IF;

    is_teacher := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role = 'teacher'::public.app_role);
    is_student := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role = 'student'::public.app_role);
    IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role::text IN ('admin', 'institution_admin')) THEN
      skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'Administrators are not placed in departments');
      CONTINUE;
    END IF;

    IF is_teacher THEN
      INSERT INTO public.department_members (department_id, user_id, role)
      VALUES (_department_id, uid, 'teacher')
      ON CONFLICT (department_id, user_id) DO NOTHING;
      assigned := assigned + 1;
    ELSIF is_student THEN
      PERFORM public._place_student_in_department(_department_id, uid);
      assigned := assigned + 1;
    ELSE
      skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'Only students and teachers can be placed in departments');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('assigned', assigned, 'skipped', skipped);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_department_member(_department_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inst uuid := public._department_institution(_department_id);
BEGIN
  IF inst IS NULL THEN RAISE EXCEPTION 'Department not found'; END IF;
  IF NOT public._can_manage_institution(inst) THEN
    RAISE EXCEPTION 'Only the institution administrator can change department membership';
  END IF;
  DELETE FROM public.department_members dm WHERE dm.department_id = _department_id AND dm.user_id = _user_id;
END;
$$;

-- Departments a teacher can create classes in (an institution admin sees all of theirs).
CREATE OR REPLACE FUNCTION public.list_my_departments()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'code', d.code) ORDER BY d.name), '[]'::jsonb)
  FROM public.departments d
  WHERE auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.department_members dm
      WHERE dm.department_id = d.id AND dm.user_id = auth.uid() AND dm.role = 'teacher'
    )
    OR public.is_institution_admin(d.institution_id)
  );
$$;

-- Students of a department: for the institution admin and the department's teachers.
CREATE OR REPLACE FUNCTION public.list_department_students(_department_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inst uuid := public._department_institution(_department_id);
BEGIN
  IF inst IS NULL THEN RAISE EXCEPTION 'Department not found'; END IF;
  IF NOT (
    public._can_manage_institution(inst)
    OR EXISTS (
      SELECT 1 FROM public.department_members dm
      WHERE dm.department_id = _department_id AND dm.user_id = auth.uid() AND dm.role = 'teacher'
    )
  ) THEN
    RAISE EXCEPTION 'You cannot view this department''s students';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', p.id, 'fullName', p.full_name, 'email', p.email) ORDER BY p.full_name)
    FROM public.department_members dm
    JOIN public.profiles p ON p.id = dm.user_id
    WHERE dm.department_id = _department_id AND dm.role = 'student' AND p.is_active IS NOT FALSE
  ), '[]'::jsonb);
END;
$$;

-- Classes in a department: for the institution admin.
CREATE OR REPLACE FUNCTION public.list_department_classes(_department_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inst uuid := public._department_institution(_department_id);
BEGIN
  IF inst IS NULL THEN RAISE EXCEPTION 'Department not found'; END IF;
  IF NOT public._can_manage_institution(inst) THEN
    RAISE EXCEPTION 'You cannot view this department''s classes';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'subject', c.subject, 'section', c.section,
      'teacherName', p.full_name,
      'studentCount', (SELECT count(*) FROM public.class_members m WHERE m.class_id = c.id AND m.member_role = 'student')
    ) ORDER BY c.name)
    FROM public.classes c
    JOIN public.profiles p ON p.id = c.teacher_id
    WHERE c.department_id = _department_id AND c.archived = false
  ), '[]'::jsonb);
END;
$$;

-- Enroll department students into a class. Allowed for the class owner, its co-teachers,
-- and the institution administrator. Students must belong to the class's department.
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
        skipped := skipped || jsonb_build_object('userId', uid, 'reason', 'Another student with the same name is already in the class');
      WHEN raise_exception THEN
        skipped := skipped || jsonb_build_object('userId', uid, 'reason', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('enrolled', enrolled, 'skipped', skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.list_institution_people(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_department_members(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_department_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_departments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_department_students(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_department_classes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enroll_students_in_class(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_institution_people(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_department_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_department_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_departments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_department_students(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_department_classes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_students_in_class(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Join flow: preview shows the department; joining through a department link places the student
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_institution_join(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link record;
  inst_name text;
  dept_name text;
BEGIN
  SELECT * INTO link FROM public.institution_join_links l WHERE l.code = upper(trim(_code));
  IF NOT FOUND
     OR NOT link.is_active
     OR (link.expires_at IS NOT NULL AND link.expires_at < now())
     OR (link.max_uses IS NOT NULL AND link.use_count >= link.max_uses) THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT i.name INTO inst_name FROM public.institutions i WHERE i.id = link.institution_id;
  IF link.department_id IS NOT NULL THEN
    SELECT d.name INTO dept_name FROM public.departments d WHERE d.id = link.department_id;
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'institutionName', inst_name,
    'departmentName', dept_name,
    'role', link.role,
    'requiresApproval', link.requires_approval
  );
END;
$$;

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

  SELECT * INTO prof FROM public.profiles p WHERE p.id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF prof.is_active = false THEN RAISE EXCEPTION 'This account is suspended'; END IF;

  SELECT i.name INTO inst_name FROM public.institutions i WHERE i.id = link.institution_id;
  IF link.department_id IS NOT NULL THEN
    SELECT d.name INTO dept_name FROM public.departments d WHERE d.id = link.department_id;
  END IF;

  IF prof.institution_id = link.institution_id THEN
    IF link.department_id IS NOT NULL THEN
      -- Already in the institution: a department link just places a student in that department.
      IF NOT public.has_role(uid, 'student') THEN
        RAISE EXCEPTION 'This is a student link, but your account has a different role.';
      END IF;
      PERFORM public._place_student_in_department(link.department_id, uid);
      UPDATE public.institution_join_links l SET use_count = l.use_count + 1 WHERE l.id = link.id;
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

  IF prof.role_confirmed_at IS NULL THEN
    DELETE FROM public.user_roles ur
    WHERE ur.user_id = uid AND ur.role IN ('student'::public.app_role, 'teacher'::public.app_role);
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, link.role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles p
    SET role = link.role, role_confirmed_at = now()
    WHERE p.id = uid AND p.role_confirmed_at IS NULL;
  ELSIF NOT public.has_role(uid, link.role::public.app_role) THEN
    RAISE EXCEPTION 'This is a % link, but your account has a different role.', link.role;
  END IF;

  UPDATE public.institution_join_links l SET use_count = l.use_count + 1 WHERE l.id = link.id;

  IF link.requires_approval THEN
    INSERT INTO public.institution_join_requests (institution_id, user_id, role)
    VALUES (link.institution_id, uid, link.role)
    ON CONFLICT (institution_id, user_id) WHERE status = 'pending' DO NOTHING;
    RETURN jsonb_build_object('status', 'pending', 'institutionName', inst_name, 'role', link.role);
  END IF;

  PERFORM set_config('onyx.institution_write', 'on', true);
  UPDATE public.profiles p SET institution_id = link.institution_id WHERE p.id = uid;
  IF link.department_id IS NOT NULL THEN
    PERFORM public._place_student_in_department(link.department_id, uid);
  END IF;
  RETURN jsonb_build_object('status', 'joined', 'institutionName', inst_name, 'departmentName', dept_name, 'role', link.role);
END;
$$;

-- Approving a teacher can place them in a department at the same time.
DROP FUNCTION IF EXISTS public.decide_institution_join_request(uuid, boolean);
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
