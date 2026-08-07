-- 1. notifications: only self-targeted inserts
DROP POLICY IF EXISTS nt_insert ON public.notifications;
CREATE POLICY nt_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. platform_bootstrap: admin-only reads
DROP POLICY IF EXISTS bootstrap_read ON public.platform_bootstrap;
CREATE POLICY bootstrap_read ON public.platform_bootstrap FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. security definer helpers: only answer about the calling user
CREATE OR REPLACE FUNCTION public.is_class_member(_class_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.class_members WHERE class_id = _class_id AND student_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_assignment_owner(_assignment_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.assignments WHERE id = _assignment_id AND teacher_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.owns_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.submissions WHERE id = _submission_id AND student_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.reviews_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.id = _submission_id AND a.teacher_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_assignment(_assignment_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = _assignment_id
      AND (a.teacher_id = _user_id OR public.is_class_member(a.class_id, _user_id)));
$$;

CREATE OR REPLACE FUNCTION public.can_view_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = _submission_id
      AND (s.student_id = _user_id OR public.is_assignment_owner(s.assignment_id, _user_id)));
$$;

CREATE OR REPLACE FUNCTION public.shares_class_with(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _a = auth.uid() AND (EXISTS (
    SELECT 1 FROM public.class_members m1
    JOIN public.class_members m2 ON m1.class_id = m2.class_id
    WHERE m1.student_id = _a AND m2.student_id = _b
  ) OR EXISTS (
    SELECT 1 FROM public.classes c JOIN public.class_members m ON m.class_id = c.id
    WHERE c.teacher_id = _a AND m.student_id = _b
  ) OR EXISTS (
    SELECT 1 FROM public.classes c JOIN public.class_members m ON m.class_id = c.id
    WHERE c.teacher_id = _b AND m.student_id = _a
  ));
$$;

-- 4. no anonymous execution of any security definer function
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;
END $$;
