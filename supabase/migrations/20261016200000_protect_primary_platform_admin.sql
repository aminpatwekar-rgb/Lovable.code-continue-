-- The named primary platform-admin account is immutable; it can appoint additional admins.
-- All other platform admins retain the normal platform-admin capabilities.

-- Ensure the designated account holds the admin role if it already exists.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(trim(u.email)) = 'aminpatwekar@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles p
SET role = 'admin', is_active = true
FROM auth.users u
WHERE p.id = u.id
  AND lower(trim(u.email)) = 'aminpatwekar@gmail.com';

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  actor_email text;
  target_email text;
  target_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only platform administrators can change roles';
  END IF;

  SELECT lower(trim(email)) INTO actor_email FROM auth.users WHERE id = auth.uid();
  SELECT lower(trim(email)) INTO target_email FROM auth.users WHERE id = _user_id;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF target_email = 'aminpatwekar@gmail.com' THEN
    RAISE EXCEPTION 'The primary platform administrator account cannot be reassigned.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  ) INTO target_is_admin;

  IF _role = 'admin' AND actor_email IS DISTINCT FROM 'aminpatwekar@gmail.com' THEN
    RAISE EXCEPTION 'Only aminpatwekar@gmail.com can promote users to platform admin.';
  END IF;

  IF target_is_admin AND _role <> 'admin'
     AND actor_email IS DISTINCT FROM 'aminpatwekar@gmail.com' THEN
    RAISE EXCEPTION 'Only the primary platform administrator can demote another platform admin.';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET role = _role::text WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role) TO authenticated;

-- Backstop for unexpected role-management paths and cascaded user deletion.
CREATE OR REPLACE FUNCTION public.guard_primary_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_id uuid;
  target_role public.app_role;
  target_email text;
  actor_email text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_id := NEW.user_id;
    target_role := NEW.role;
  ELSE
    target_id := OLD.user_id;
    target_role := OLD.role;
  END IF;

  SELECT lower(trim(email)) INTO target_email FROM auth.users WHERE id = target_id;

  IF TG_OP = 'DELETE' AND target_email = 'aminpatwekar@gmail.com' AND target_role = 'admin' THEN
    RAISE EXCEPTION 'The primary platform administrator cannot lose admin access or be deleted.';
  END IF;

  IF TG_OP = 'UPDATE' AND target_email = 'aminpatwekar@gmail.com'
     AND OLD.role = 'admin'
     AND (NEW.role IS DISTINCT FROM 'admin' OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'The primary platform administrator cannot lose admin access.';
  END IF;

  IF TG_OP = 'UPDATE' AND target_role = 'admin'
     AND target_email IS DISTINCT FROM 'aminpatwekar@gmail.com'
     AND (NEW.role IS DISTINCT FROM 'admin' OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND auth.uid() IS NOT NULL THEN
    SELECT lower(trim(email)) INTO actor_email FROM auth.users WHERE id = auth.uid();
    IF actor_email IS DISTINCT FROM 'aminpatwekar@gmail.com' THEN
      RAISE EXCEPTION 'Only the primary platform administrator can demote another platform admin.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role = 'admin' AND auth.uid() IS NOT NULL THEN
    SELECT lower(trim(email)) INTO actor_email FROM auth.users WHERE id = auth.uid();
    IF actor_email IS DISTINCT FROM 'aminpatwekar@gmail.com' THEN
      RAISE EXCEPTION 'Only the primary platform administrator can grant platform-admin status.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND target_role = 'admin'
     AND target_email IS DISTINCT FROM 'aminpatwekar@gmail.com'
     AND auth.uid() IS NOT NULL THEN
    SELECT lower(trim(email)) INTO actor_email FROM auth.users WHERE id = auth.uid();
    IF actor_email IS DISTINCT FROM 'aminpatwekar@gmail.com' THEN
      RAISE EXCEPTION 'Only the primary platform administrator can demote another platform admin.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_primary_admin_role() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_guard_primary_admin ON public.user_roles;
CREATE TRIGGER user_roles_guard_primary_admin
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_primary_admin_role();

-- Profiles.is_active is the app's suspension switch. Protect it as well as the role mirror.
CREATE OR REPLACE FUNCTION public.guard_primary_admin_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE target_email text;
BEGIN
  SELECT lower(trim(email)) INTO target_email FROM auth.users WHERE id = OLD.id;
  IF target_email = 'aminpatwekar@gmail.com' THEN
    IF NEW.role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'The primary platform administrator role is protected.';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active IS FALSE THEN
      RAISE EXCEPTION 'The primary platform administrator account cannot be suspended.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_primary_admin_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_guard_primary_admin ON public.profiles;
CREATE TRIGGER profiles_guard_primary_admin
  BEFORE UPDATE OF role, is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_primary_admin_profile();
