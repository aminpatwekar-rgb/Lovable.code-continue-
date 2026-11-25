CREATE OR REPLACE FUNCTION public.confirm_account_role(_role app_role)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _user_id UUID := auth.uid();
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _role NOT IN ('student'::public.app_role,'teacher'::public.app_role) THEN
    RAISE EXCEPTION 'This role cannot be self-selected';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role_confirmed_at IS NULL) THEN
    RAISE EXCEPTION 'Role has already been confirmed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin'::public.app_role,'teacher'::public.app_role,'institution_admin'::public.app_role)) THEN
    UPDATE public.profiles SET role_confirmed_at = now() WHERE id = _user_id AND role_confirmed_at IS NULL;
    RETURN TRUE;
  END IF;
  -- Privileges are never granted from the caller's choice: everyone starts as student.
  -- A Teacher choice is recorded on the profile as a pending request for admin approval.
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'student') ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles
     SET role = CASE WHEN _role = 'teacher'::public.app_role THEN 'teacher_pending' ELSE 'student' END,
         role_confirmed_at = now()
   WHERE id = _user_id AND role_confirmed_at IS NULL;
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.confirm_account_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_account_role(public.app_role) TO authenticated;