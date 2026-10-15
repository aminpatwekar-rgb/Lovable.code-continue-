-- ONYX reliability + admin entitlements + plan visibility
-- This migration is intentionally idempotent so it can repair projects where earlier
-- business migrations were not applied or the PostgREST schema cache is stale.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  new_assignments boolean NOT NULL DEFAULT true,
  deadline_reminders boolean NOT NULL DEFAULT true,
  submissions boolean NOT NULL DEFAULT true,
  grading boolean NOT NULL DEFAULT true,
  announcements boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

DROP POLICY IF EXISTS notification_preferences_self ON public.notification_preferences;
CREATE POLICY notification_preferences_self
ON public.notification_preferences
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Administrators are platform owners: they bypass all commercial plan limits/features.
CREATE OR REPLACE FUNCTION public.plan_limit(_user_id uuid, _key text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN public.has_role(_user_id,'admin') THEN -1::numeric
    ELSE COALESCE(((p.limits ->> _key)::numeric),0)
  END
  FROM public.billing_plans p
  WHERE p.code=public.current_plan_code(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.plan_has_feature(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN public.has_role(_user_id,'admin') THEN true
    ELSE COALESCE(((p.features ->> _key)::boolean),false)
  END
  FROM public.billing_plans p
  WHERE p.code=public.current_plan_code(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.user_has_feature(_feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.plan_has_feature(auth.uid(),_feature);
$$;

CREATE OR REPLACE FUNCTION public.plan_remove_branding(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(_user_id,'admin') OR public.plan_has_feature(_user_id,'remove_branding');
$$;

GRANT EXECUTE ON FUNCTION public.plan_limit(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_has_feature(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_feature(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_remove_branding(uuid) TO authenticated;
