
CREATE POLICY "sub_files_student_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'submissions' AND (storage.foldername(name))[2] = auth.uid()::text)
  WITH CHECK (bucket_id = 'submissions' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "sub_files_teacher_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND public.is_assignment_owner(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "assign_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-files'
    AND (
      public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
      OR public.is_class_member(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );

CREATE POLICY "assign_files_teacher_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-files'
    AND public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "assign_files_teacher_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'assignment-files'
    AND public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
  );
