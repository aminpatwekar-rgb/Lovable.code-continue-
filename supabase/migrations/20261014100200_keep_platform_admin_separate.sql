-- ONYX keeps platform-wide administration separate from tenant administration.
-- A platform admin may appoint institution_admin accounts, but cannot add another
-- platform-wide admin from the normal user-management action.
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform administrators can change roles';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF _role = 'admin'
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Only the existing platform administrator may hold platform-wide admin access. Use institution_admin for institution-level access.';
  END IF;

  -- Never remove the last platform administrator.
  IF _role <> 'admin'
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
     AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'At least one platform administrator must remain';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles SET role = _role::text WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role) TO authenticated;
