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

  RETURN jsonb_build_object('institution', inst, 'classes', n_classes, 'assignments', n_assignments, 'submissions', n_submissions, 'roster', roster);
END;
$$;
REVOKE ALL ON FUNCTION public.institution_admin_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_admin_overview(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';