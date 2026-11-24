CREATE OR REPLACE FUNCTION public.join_institution_with_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  link record;
  prof record;
  inst_name text;
  dept_name text;
  pending_teacher boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO link FROM public.institution_join_links l WHERE l.code = upper(trim(_code)) FOR UPDATE;
  IF NOT FOUND OR NOT link.is_active
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
      IF NOT public.has_role(uid, 'student') THEN
        RAISE EXCEPTION 'This is a student link, but your account has a different role.';
      END IF;
      PERFORM public._place_student_in_department(link.department_id, uid);
      UPDATE public.institution_join_links l SET use_count = l.use_count + 1 WHERE l.id = link.id;
      RETURN jsonb_build_object('status','joined','institutionName',inst_name,'departmentName',dept_name,'role',link.role);
    END IF;
    RETURN jsonb_build_object('status','already_member','institutionName',inst_name,'role',link.role);
  END IF;
  IF prof.institution_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to another institution. Ask your administrator to move you.';
  END IF;
  IF public.has_role(uid,'admin') OR public.has_role(uid,'institution_admin') THEN
    RAISE EXCEPTION 'Administrator accounts are assigned by the platform administrator, not through join links.';
  END IF;

  -- A teacher link that needs approval grants the teacher role only when approved.
  pending_teacher := link.role = 'teacher' AND link.requires_approval;

  IF prof.role_confirmed_at IS NULL THEN
    DELETE FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role IN ('student'::public.app_role,'teacher'::public.app_role);
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, (CASE WHEN pending_teacher THEN 'student' ELSE link.role END)::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles p SET role = CASE WHEN pending_teacher THEN 'student' ELSE link.role END, role_confirmed_at = now()
    WHERE p.id = uid AND p.role_confirmed_at IS NULL;
  ELSIF NOT public.has_role(uid, link.role::public.app_role)
        AND NOT (pending_teacher AND public.has_role(uid,'student')) THEN
    RAISE EXCEPTION 'This is a % link, but your account has a different role.', link.role;
  END IF;

  UPDATE public.institution_join_links l SET use_count = l.use_count + 1 WHERE l.id = link.id;

  IF link.requires_approval THEN
    INSERT INTO public.institution_join_requests (institution_id, user_id, role)
    VALUES (link.institution_id, uid, link.role)
    ON CONFLICT (institution_id, user_id) WHERE status = 'pending' DO NOTHING;
    RETURN jsonb_build_object('status','pending','institutionName',inst_name,'role',link.role);
  END IF;

  PERFORM set_config('onyx.institution_write','on',true);
  UPDATE public.profiles p SET institution_id = link.institution_id WHERE p.id = uid;
  IF link.department_id IS NOT NULL THEN
    PERFORM public._place_student_in_department(link.department_id, uid);
  END IF;
  RETURN jsonb_build_object('status','joined','institutionName',inst_name,'departmentName',dept_name,'role',link.role);
END;
$$;
REVOKE ALL ON FUNCTION public.join_institution_with_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_institution_with_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_institution_join_request(_request_id uuid, _approve boolean, _department_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF _department_id IS NOT NULL AND public._department_institution(_department_id) IS DISTINCT FROM req.institution_id THEN
      RAISE EXCEPTION 'That department belongs to a different institution';
    END IF;
    SELECT p.institution_id INTO current_inst FROM public.profiles p WHERE p.id = req.user_id;
    IF current_inst IS NOT NULL AND current_inst <> req.institution_id THEN
      RAISE EXCEPTION 'This person has since joined a different institution';
    END IF;
    IF req.role = 'teacher'
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = req.user_id AND ur.role::text IN ('teacher','admin','institution_admin')) THEN
      DELETE FROM public.user_roles ur WHERE ur.user_id = req.user_id AND ur.role = 'student'::public.app_role;
      INSERT INTO public.user_roles (user_id, role) VALUES (req.user_id, 'teacher'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
      UPDATE public.profiles p SET role = 'teacher' WHERE p.id = req.user_id;
    END IF;
    PERFORM set_config('onyx.institution_write','on',true);
    UPDATE public.profiles p SET institution_id = req.institution_id WHERE p.id = req.user_id;
    IF _department_id IS NOT NULL THEN
      IF req.role = 'teacher' THEN
        INSERT INTO public.department_members (department_id, user_id, role) VALUES (_department_id, req.user_id, 'teacher')
        ON CONFLICT (department_id, user_id) DO NOTHING;
      ELSE
        PERFORM public._place_student_in_department(_department_id, req.user_id);
      END IF;
    END IF;
  ELSE
    UPDATE public.institution_join_links l SET use_count = greatest(l.use_count - 1, 0)
    WHERE l.institution_id = req.institution_id AND l.role = req.role AND l.department_id IS NULL;
  END IF;

  UPDATE public.institution_join_requests r
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'declined' END, decided_by = auth.uid(), decided_at = now()
  WHERE r.id = _request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_institution_join_request(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_institution_join_request(uuid, boolean, uuid) TO authenticated;

DROP POLICY IF EXISTS classes_insert ON public.classes;
CREATE POLICY classes_insert ON public.classes FOR INSERT TO authenticated
WITH CHECK (
  teacher_id = auth.uid()
  AND (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'institution_admin') OR public.has_role(auth.uid(),'admin'))
);

DROP POLICY IF EXISTS departments_select_platform_admin ON public.departments;
CREATE POLICY departments_select_platform_admin ON public.departments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

GRANT SELECT ON public.institution_join_links TO authenticated;
DROP POLICY IF EXISTS institution_join_links_manager_read ON public.institution_join_links;
CREATE POLICY institution_join_links_manager_read ON public.institution_join_links FOR SELECT TO authenticated
USING (public._can_manage_institution(institution_id));