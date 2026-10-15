-- Recreate storage usage after attachment metadata tables are present.
-- Earlier business-feature migrations run before announcement_attachments exists on a clean replay.
CREATE OR REPLACE FUNCTION public.get_storage_usage(_user_id uuid DEFAULT auth.uid())
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.assignment_attachments aa JOIN public.assignments a ON a.id=aa.assignment_id WHERE a.teacher_id=_user_id),0)
  + COALESCE((SELECT SUM(COALESCE(sf.size_bytes,0)) FROM public.submission_files sf JOIN public.submissions s ON s.id=sf.submission_id WHERE s.student_id=_user_id),0)
  + COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.announcement_attachments aa JOIN public.announcements an ON an.id=aa.announcement_id WHERE an.author_id=_user_id),0)
  + COALESCE((SELECT SUM(COALESCE(cr.size_bytes,0)) FROM public.class_resources cr WHERE cr.uploader_id=_user_id),0);
$$;
GRANT EXECUTE ON FUNCTION public.get_storage_usage(uuid) TO authenticated;
