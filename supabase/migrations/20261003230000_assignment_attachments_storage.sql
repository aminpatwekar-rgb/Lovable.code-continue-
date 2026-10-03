-- Assignment attachment storage for ONYX.
-- Reuses the existing public.assignment_attachments table.

INSERT INTO storage.buckets (id, name, public)
VALUES ('assignment-attachments', 'assignment-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "assignment attachments read" ON storage.objects;
CREATE POLICY "assignment attachments read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'assignment-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.assignment_attachments aa
      WHERE aa.storage_path = storage.objects.name
        AND public.can_view_assignment(aa.assignment_id, auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "assignment attachments insert" ON storage.objects;
CREATE POLICY "assignment attachments insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'assignment-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.assignment_attachments aa
    WHERE aa.storage_path = storage.objects.name
      AND public.is_assignment_owner(aa.assignment_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "assignment attachments update" ON storage.objects;
CREATE POLICY "assignment attachments update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'assignment-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.assignment_attachments aa
    WHERE aa.storage_path = storage.objects.name
      AND public.is_assignment_owner(aa.assignment_id, auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'assignment-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.assignment_attachments aa
    WHERE aa.storage_path = storage.objects.name
      AND public.is_assignment_owner(aa.assignment_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "assignment attachments delete" ON storage.objects;
CREATE POLICY "assignment attachments delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'assignment-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.assignment_attachments aa
      WHERE aa.storage_path = storage.objects.name
        AND public.is_assignment_owner(aa.assignment_id, auth.uid())
    )
  )
);
