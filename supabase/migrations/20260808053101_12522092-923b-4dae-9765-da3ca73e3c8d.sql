-- 1. Hide the email column from ordinary authenticated reads
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url, institution, created_at, updated_at, is_active)
  ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_emails(_ids uuid[])
RETURNS TABLE (id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.email
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
    AND auth.uid() IS NOT NULL
    AND (
      p.id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.classes c
        JOIN public.class_members m ON m.class_id = c.id
        WHERE c.teacher_id = auth.uid() AND m.student_id = p.id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_profile_emails(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_emails(uuid[]) TO authenticated;

-- 2. Allow authorized staff to clean up violation records
CREATE POLICY "pv_delete" ON public.paste_violations
  FOR DELETE TO authenticated
  USING (public.reviews_submission(submission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "violation delete" ON public.quiz_violations
  FOR DELETE TO authenticated
  USING (public.owns_quiz(quiz_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- 3. Submission storage must match a real, owned submission
CREATE OR REPLACE FUNCTION public.owns_submission_for_assignment(_assignment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.assignment_id = _assignment_id AND s.student_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.owns_submission_for_assignment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_submission_for_assignment(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "sub_files_student_all" ON storage.objects;

CREATE POLICY "sub_files_student_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.owns_submission_for_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "sub_files_student_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.owns_submission_for_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "sub_files_student_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.owns_submission_for_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  )
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.owns_submission_for_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "sub_files_student_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.owns_submission_for_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  );