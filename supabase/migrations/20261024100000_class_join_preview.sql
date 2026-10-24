-- Public preview for class invitation links (/join/<code>), so the page can say
-- "Join <class> by <teacher>" before sign-in. Exposes only non-sensitive fields.
CREATE OR REPLACE FUNCTION public.preview_class_join(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  teacher_name text;
BEGIN
  SELECT id, name, subject, section, teacher_id INTO c
    FROM public.classes
   WHERE upper(join_code) = upper(btrim(_code)) AND archived = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT p.full_name INTO teacher_name FROM public.profiles p WHERE p.id = c.teacher_id;

  RETURN jsonb_build_object(
    'valid', true,
    'className', c.name,
    'subject', c.subject,
    'section', c.section,
    'teacherName', teacher_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_class_join(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_class_join(text) TO anon, authenticated, service_role;
