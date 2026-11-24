CREATE OR REPLACE FUNCTION public.can_view_assignment(_assignment_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.assignments a JOIN public.classes c ON c.id = a.class_id
    WHERE a.id = _assignment_id
      AND (public.has_role(_user_id, 'admin')
        OR (c.institution_id IS NOT NULL AND public.is_institution_admin(c.institution_id))
        OR public.is_assignment_owner(a.id, _user_id)
        OR public.is_class_member(c.id, _user_id)));
$function$;

CREATE OR REPLACE FUNCTION public.can_view_submission(_submission_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = _submission_id
      AND (s.student_id = _user_id
        OR public.is_assignment_owner(s.assignment_id, _user_id)
        OR EXISTS (SELECT 1 FROM public.assignments a JOIN public.classes c ON c.id = a.class_id
          WHERE a.id = s.assignment_id AND c.institution_id IS NOT NULL AND public.is_institution_admin(c.institution_id))
        OR public.has_role(_user_id, 'admin')));
$function$;

CREATE OR REPLACE FUNCTION public.enforce_csv_import_feature(_class_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(),'admin')
    OR (public.is_class_teacher(_class_id, auth.uid())
        AND public.plan_has_feature((SELECT teacher_id FROM public.classes WHERE id=_class_id),'csv_import'));
$function$;