CREATE OR REPLACE FUNCTION public.get_storage_usage(_user_id uuid DEFAULT auth.uid())
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.assignment_attachments aa JOIN public.assignments a ON a.id=aa.assignment_id WHERE a.teacher_id=_user_id),0)
  + COALESCE((SELECT SUM(COALESCE(sf.size_bytes,0)) FROM public.submission_files sf JOIN public.submissions s ON s.id=sf.submission_id WHERE s.student_id=_user_id),0)
  + COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.announcement_attachments aa JOIN public.announcements an ON an.id=aa.announcement_id WHERE an.author_id=_user_id),0)
  + COALESCE((SELECT SUM(COALESCE(cr.size_bytes,0)) FROM public.class_resources cr WHERE cr.uploader_id=_user_id),0);
$$;

CREATE OR REPLACE FUNCTION public.assert_storage_available(_additional_bytes bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); lim bigint; used bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _additional_bytes < 0 OR _additional_bytes > 524288000 THEN RAISE EXCEPTION 'Invalid file size'; END IF;
  lim:=public.plan_limit(uid,'storage_bytes');
  used:=public.get_storage_usage(uid);
  IF lim>=0 AND used + _additional_bytes > lim THEN
    RAISE EXCEPTION 'Storage limit reached. You are using % of % bytes.',used,lim;
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.assert_storage_available(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assert_storage_available(bigint) TO authenticated;
