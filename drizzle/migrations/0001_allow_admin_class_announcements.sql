DROP POLICY IF EXISTS ann_platform_insert ON public.announcements;

CREATE POLICY ann_platform_insert
ON public.announcements
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    (class_id IS NULL AND public.has_role(auth.uid(), 'admin'))
    OR (
      class_id IS NOT NULL
      AND audience = 'class'
      AND (
        public.is_class_teacher(class_id, auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      )
    )
  )
);