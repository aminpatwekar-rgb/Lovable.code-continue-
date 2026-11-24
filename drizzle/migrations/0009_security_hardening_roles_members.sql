REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon, authenticated;
UPDATE public.platform_bootstrap SET admin_initialized = true WHERE id = true AND EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin');

REVOKE EXECUTE ON FUNCTION public.current_plan_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_plan_code(uuid) TO service_role;

DROP POLICY IF EXISTS members_join ON public.class_members;
CREATE POLICY members_join ON public.class_members FOR INSERT TO authenticated
WITH CHECK (
  student_id = auth.uid() AND member_role = 'student' AND EXISTS (
    SELECT 1 FROM public.classes c LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = class_members.class_id AND (c.institution_id IS NULL OR p.institution_id = c.institution_id)
  )
);

DROP POLICY IF EXISTS assignments_read_own ON public.assignments;
CREATE POLICY assignments_read_own ON public.assignments FOR SELECT TO authenticated
USING (teacher_id = auth.uid() AND (public.is_class_teacher(class_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE OR REPLACE FUNCTION public.protect_profile_is_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can change account status';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_protect_is_active ON public.profiles;
CREATE TRIGGER profiles_protect_is_active BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_is_active();