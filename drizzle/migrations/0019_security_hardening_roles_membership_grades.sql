DROP POLICY IF EXISTS members_join ON public.class_members;

CREATE OR REPLACE FUNCTION public.protect_submission_insert_grading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.student_id = auth.uid() THEN
    NEW.marks_awarded := NULL;
    NEW.grade_released := false;
    NEW.teacher_feedback := NULL;
    NEW.improvement_notes := NULL;
    NEW.reviewed_at := NULL;
    IF NEW.status IN ('reviewed','returned','completed') THEN NEW.status := 'in_progress'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_submission_insert_grading ON public.submissions;
CREATE TRIGGER protect_submission_insert_grading BEFORE INSERT ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.protect_submission_insert_grading();

CREATE OR REPLACE FUNCTION public.protect_submission_file_path()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.submission_id IS DISTINCT FROM OLD.submission_id THEN
    RAISE EXCEPTION 'File location cannot be changed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_submission_file_path ON public.submission_files;
CREATE TRIGGER protect_submission_file_path BEFORE UPDATE ON public.submission_files
FOR EACH ROW EXECUTE FUNCTION public.protect_submission_file_path();

REVOKE EXECUTE ON FUNCTION public.institution_plan_code(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._has_role_any(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE EXECUTE ON FUNCTION public._has_role_any(uuid, app_role) FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.is_class_member(uuid,uuid)'::regprocedure) INTO d;
  d := regexp_replace(d, 'FUNCTION public\.is_class_member\(', 'FUNCTION public._is_class_member_any(');
  d := regexp_replace(d, '\mhas_role\(', '_has_role_any(', 'g');
  EXECUTE d;
END $do$;
REVOKE EXECUTE ON FUNCTION public._is_class_member_any(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Route internal privileged callers to the unrestricted helpers
DO $do$
DECLARE r record; d text; nd text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prokind = 'f'
    AND p.proname NOT IN ('has_role','is_class_member','_has_role_any','_is_class_member_any')
  LOOP
    d := pg_get_functiondef(r.oid);
    nd := regexp_replace(d, '\mhas_role\(', '_has_role_any(', 'g');
    nd := regexp_replace(nd, '\mis_class_member\(', '_is_class_member_any(', 'g');
    IF nd <> d THEN EXECUTE nd; END IF;
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND public._has_role_any(_user_id, _role);
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(_class_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND public._is_class_member_any(_class_id, _user_id);
$$;