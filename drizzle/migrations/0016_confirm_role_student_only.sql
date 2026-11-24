CREATE OR REPLACE FUNCTION public.confirm_account_role(_role app_role)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _user_id UUID := auth.uid();
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _role <> 'student'::public.app_role THEN
    RAISE EXCEPTION 'Teacher access must be approved by an administrator';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role_confirmed_at IS NULL) THEN
    RAISE EXCEPTION 'Role has already been confirmed or profile is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin'::public.app_role,'teacher'::public.app_role)) THEN
    UPDATE public.profiles SET role_confirmed_at = now() WHERE id = _user_id AND role_confirmed_at IS NULL;
    RETURN TRUE;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'student') ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET role = 'student', role_confirmed_at = now() WHERE id = _user_id AND role_confirmed_at IS NULL;
  RETURN TRUE;
END;
$function$;