ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS banner_url text;

CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'everyone',
  title text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_audience_check
  CHECK (audience IN ('everyone','teachers','students','class'));
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_author_profile_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX announcements_class_idx ON public.announcements (class_id, created_at DESC);
CREATE INDEX announcements_created_idx ON public.announcements (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY ann_platform_read ON public.announcements FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (class_id IS NULL AND (
        audience = 'everyone'
        OR (audience = 'teachers' AND public.has_role(auth.uid(), 'teacher'))
        OR (audience = 'students' AND public.has_role(auth.uid(), 'student'))
      ))
  OR (class_id IS NOT NULL AND (
        public.is_class_member(class_id, auth.uid())
        OR public.is_class_teacher(class_id, auth.uid())
      ))
);

CREATE POLICY ann_platform_insert ON public.announcements FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    (class_id IS NULL AND public.has_role(auth.uid(), 'admin'))
    OR (class_id IS NOT NULL AND audience = 'class' AND public.is_class_teacher(class_id, auth.uid()))
  )
);

CREATE POLICY ann_platform_update ON public.announcements FOR UPDATE TO authenticated
USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY ann_platform_delete ON public.announcements FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR (class_id IS NOT NULL AND public.is_class_teacher(class_id, auth.uid()))
);

CREATE TRIGGER announcements_updated BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.class_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.class_discussions(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.class_discussions
  ADD CONSTRAINT class_discussions_author_profile_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX class_discussions_class_idx ON public.class_discussions (class_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_discussions TO authenticated;
GRANT ALL ON public.class_discussions TO service_role;
ALTER TABLE public.class_discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY disc_read ON public.class_discussions FOR SELECT TO authenticated
USING (
  public.is_class_member(class_id, auth.uid())
  OR public.is_class_teacher(class_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY disc_insert ON public.class_discussions FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (public.is_class_member(class_id, auth.uid()) OR public.is_class_teacher(class_id, auth.uid()))
);

CREATE POLICY disc_delete ON public.class_discussions FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR public.is_class_teacher(class_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE TRIGGER class_discussions_updated BEFORE UPDATE ON public.class_discussions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.admin_transfer_class(_class_id uuid, _new_teacher uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can transfer classes';
  END IF;
  IF NOT public.has_role(_new_teacher, 'teacher') AND NOT public.has_role(_new_teacher, 'admin') THEN
    RAISE EXCEPTION 'The new owner must be a teacher';
  END IF;
  UPDATE public.classes SET teacher_id = _new_teacher WHERE id = _class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  UPDATE public.assignments SET teacher_id = _new_teacher WHERE class_id = _class_id;
  DELETE FROM public.class_members WHERE class_id = _class_id AND student_id = _new_teacher;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_transfer_class(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_class(uuid, uuid) TO authenticated;