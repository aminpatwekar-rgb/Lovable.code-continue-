DROP POLICY IF EXISTS ann_platform_update ON public.announcements;
CREATE POLICY ann_platform_update ON public.announcements FOR UPDATE TO authenticated
USING ((author_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (author_id = auth.uid() AND class_id IS NOT NULL AND audience = 'class' AND public.is_class_teacher(class_id, auth.uid()))
);

DROP POLICY IF EXISTS "student badges insert" ON public.student_badges;
CREATE POLICY "student badges insert" ON public.student_badges FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (awarded_by = auth.uid() AND student_id <> auth.uid() AND class_id IS NOT NULL
      AND public.is_class_teacher(class_id, auth.uid())
      AND EXISTS (SELECT 1 FROM public.class_members cm WHERE cm.class_id = student_badges.class_id AND cm.student_id = student_badges.student_id AND cm.member_role = 'student'))
);

CREATE OR REPLACE FUNCTION public.enforce_assignment_attachment_size()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE owner uuid; lim numeric; used bigint;
BEGIN
  IF split_part(NEW.storage_path, '/', 1) <> NEW.assignment_id::text THEN
    RAISE EXCEPTION 'Invalid attachment path';
  END IF;
  IF NEW.size_bytes IS NULL OR NEW.size_bytes <= 0 THEN
    RAISE EXCEPTION 'Invalid file size';
  END IF;
  SELECT teacher_id INTO owner FROM public.assignments WHERE id = NEW.assignment_id;
  lim := public.plan_limit(owner, 'storage_bytes');
  used := public.get_storage_usage(owner);
  IF lim >= 0 AND used + NEW.size_bytes > lim THEN
    RAISE EXCEPTION 'Storage limit reached';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_assignment_attachment_size ON public.assignment_attachments;
CREATE TRIGGER enforce_assignment_attachment_size BEFORE INSERT ON public.assignment_attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_attachment_size();

CREATE OR REPLACE FUNCTION public.get_storage_usage(_user_id uuid DEFAULT auth.uid())
 RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage'
AS $function$ SELECT COALESCE((SELECT SUM(GREATEST(COALESCE(aa.size_bytes,0), COALESCE((SELECT (o.metadata->>'size')::bigint FROM storage.objects o WHERE o.bucket_id='assignment-attachments' AND o.name=aa.storage_path),0))) FROM public.assignment_attachments aa JOIN public.assignments a ON a.id=aa.assignment_id WHERE a.teacher_id=_user_id),0)+COALESCE((SELECT SUM(COALESCE(sf.size_bytes,0)) FROM public.submission_files sf JOIN public.submissions s ON s.id=sf.submission_id WHERE s.student_id=_user_id),0)+COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.announcement_attachments aa JOIN public.announcements an ON an.id=aa.announcement_id WHERE an.author_id=_user_id),0)+COALESCE((SELECT SUM(COALESCE(cr.size_bytes,0)) FROM public.class_resources cr WHERE cr.uploader_id=_user_id),0); $function$;

CREATE OR REPLACE FUNCTION public._is_active_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._has_role_any(auth.uid(), 'admin')
     AND COALESCE((SELECT is_active FROM public.profiles WHERE id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION public._is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_active_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(_user_id uuid, _active boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_active_admin() THEN
    RAISE EXCEPTION 'Only active administrators can change account status';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;
  UPDATE public.profiles SET is_active = _active WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role app_role)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_active_admin() THEN
    RAISE EXCEPTION 'Only active platform administrators can change roles';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF _role = 'admin' AND EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND user_id <> _user_id) THEN
    RAISE EXCEPTION 'Only one platform administrator is allowed. Use institution_admin for institution-level access.';
  END IF;
  IF _role <> 'admin'
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
     AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'At least one platform administrator must remain';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET role = _role::text WHERE id = _user_id;
END;
$function$;