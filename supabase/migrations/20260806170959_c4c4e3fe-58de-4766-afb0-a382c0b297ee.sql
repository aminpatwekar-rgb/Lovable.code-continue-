CREATE POLICY "class banners readable by class members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'class-banners'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.is_class_member(((storage.foldername(name))[1])::uuid, auth.uid())
  )
);

CREATE POLICY "class banners writable by class teacher"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'class-banners'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
  )
);

CREATE POLICY "class banners updatable by class teacher"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'class-banners'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
  )
);

CREATE POLICY "class banners deletable by class teacher"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'class-banners'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
  )
);