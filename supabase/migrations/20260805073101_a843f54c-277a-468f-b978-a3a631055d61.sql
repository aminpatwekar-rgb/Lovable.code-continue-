ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.platform_bootstrap (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  admin_initialized boolean NOT NULL DEFAULT false,
  initialized_by uuid,
  initialized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_bootstrap TO authenticated;
GRANT ALL ON public.platform_bootstrap TO service_role;

ALTER TABLE public.platform_bootstrap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bootstrap_read" ON public.platform_bootstrap
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.platform_bootstrap (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER platform_bootstrap_updated
  BEFORE UPDATE ON public.platform_bootstrap
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- One-time admin initialization. Returns true only when it actually promoted the caller.
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  done boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT admin_initialized INTO done FROM public.platform_bootstrap WHERE id = true FOR UPDATE;
  IF done THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    UPDATE public.platform_bootstrap SET admin_initialized = true WHERE id = true;
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin') ON CONFLICT DO NOTHING;
  UPDATE public.platform_bootstrap
     SET admin_initialized = true, initialized_by = uid, initialized_at = now()
   WHERE id = true;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;

-- Admin role management
CREATE POLICY "roles_admin_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "roles_admin_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id <> auth.uid());

CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;