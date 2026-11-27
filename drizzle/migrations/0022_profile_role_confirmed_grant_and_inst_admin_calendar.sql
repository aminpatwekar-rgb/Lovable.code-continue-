GRANT SELECT (role_confirmed_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_feature(_feature text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.plan_has_feature(auth.uid(), _feature)
      OR (_feature = 'calendar' AND public.has_role(auth.uid(), 'institution_admin'::public.app_role));
$function$;