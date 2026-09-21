CREATE OR REPLACE FUNCTION public.can_view_announcement(_announcement_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.announcements a
    WHERE a.id = _announcement_id
      AND (
        public.has_role(_user_id, 'admin')
        OR (a.class_id IS NULL AND (
          a.audience = 'everyone'
          OR (a.audience = 'teachers' AND public.has_role(_user_id, 'teacher'))
          OR (a.audience = 'students' AND public.has_role(_user_id, 'student'))
        ))
        OR (a.class_id IS NOT NULL AND (
          public.is_class_member(a.class_id, _user_id)
          OR public.is_class_teacher(a.class_id, _user_id)
        ))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_announcement(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_announcement(uuid, uuid) TO authenticated;

CREATE TABLE public.announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);
GRANT SELECT, INSERT, DELETE ON public.announcement_attachments TO authenticated;
GRANT ALL ON public.announcement_attachments TO service_role;
ALTER TABLE public.announcement_attachments ENABLE ROW LEVEL SECURITY;
CREATE INDEX announcement_attachments_announcement_idx ON public.announcement_attachments (announcement_id, created_at);

CREATE POLICY announcement_attachments_read ON public.announcement_attachments
FOR SELECT TO authenticated
USING (public.can_view_announcement(announcement_id, auth.uid()));
CREATE POLICY announcement_attachments_insert ON public.announcement_attachments
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.announcements a
  WHERE a.id = announcement_id AND a.author_id = auth.uid()
));
CREATE POLICY announcement_attachments_delete ON public.announcement_attachments
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.announcements a WHERE a.id = announcement_id AND a.author_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.announcements a
    WHERE a.id = announcement_id
      AND a.class_id IS NOT NULL
      AND public.is_class_teacher(a.class_id, auth.uid())
  )
);

CREATE TABLE public.class_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);
GRANT SELECT, INSERT, DELETE ON public.class_resources TO authenticated;
GRANT ALL ON public.class_resources TO service_role;
ALTER TABLE public.class_resources ENABLE ROW LEVEL SECURITY;
CREATE INDEX class_resources_class_idx ON public.class_resources (class_id, created_at DESC);

CREATE POLICY class_resources_read ON public.class_resources
FOR SELECT TO authenticated
USING (
  public.is_class_member(class_id, auth.uid())
  OR public.is_class_teacher(class_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY class_resources_insert ON public.class_resources
FOR INSERT TO authenticated
WITH CHECK (
  uploader_id = auth.uid()
  AND (public.is_class_teacher(class_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'))
);
CREATE POLICY class_resources_delete ON public.class_resources
FOR DELETE TO authenticated
USING (
  public.is_class_teacher(class_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY announcement_attachment_objects_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'announcement-attachments'
  AND public.can_view_announcement(((storage.foldername(name))[1])::uuid, auth.uid())
);
CREATE POLICY announcement_attachment_objects_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'announcement-attachments'
  AND EXISTS (
    SELECT 1 FROM public.announcements a
    WHERE a.id = ((storage.foldername(name))[1])::uuid
      AND a.author_id = auth.uid()
  )
);
CREATE POLICY announcement_attachment_objects_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'announcement-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = ((storage.foldername(name))[1])::uuid
        AND a.author_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = ((storage.foldername(name))[1])::uuid
        AND a.class_id IS NOT NULL
        AND public.is_class_teacher(a.class_id, auth.uid())
    )
  )
);

CREATE POLICY class_resource_objects_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'class-resources'
  AND (
    public.is_class_member(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  )
);
CREATE POLICY class_resource_objects_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'class-resources'
  AND (
    public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  )
);
CREATE POLICY class_resource_objects_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'class-resources'
  AND (
    public.is_class_teacher(((storage.foldername(name))[1])::uuid, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  )
);