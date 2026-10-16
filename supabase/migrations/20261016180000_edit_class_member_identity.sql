-- Allow a class teacher (owner or approved co-teacher) or platform admin
-- to correct a student's roster identifiers without granting table-wide UPDATE.
CREATE OR REPLACE FUNCTION public.update_class_member_identity(
  _class_id uuid,
  _member_id uuid,
  _full_name text,
  _roll_no text,
  _er_no text,
  _sr_no text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target public.class_members%ROWTYPE;
  cleaned_name text := btrim(coalesce(_full_name, ''));
  cleaned_roll text := nullif(btrim(coalesce(_roll_no, '')), '');
  cleaned_er text := nullif(btrim(coalesce(_er_no, '')), '');
  cleaned_sr text := nullif(btrim(coalesce(_sr_no, '')), '');
  violated_constraint text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.is_class_teacher(_class_id, uid)
    OR public.has_role(uid, 'admin')
  ) THEN
    RAISE EXCEPTION 'Only this class''s teacher or a platform admin can edit student details.';
  END IF;

  SELECT m.* INTO target
  FROM public.class_members m
  WHERE m.id = _member_id AND m.class_id = _class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found in this class.';
  END IF;

  IF target.member_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Only student roster details can be edited here.';
  END IF;

  IF cleaned_name = '' THEN
    RAISE EXCEPTION 'Student full name is required.';
  END IF;
  IF length(cleaned_name) > 120 THEN
    RAISE EXCEPTION 'Student full name must be 120 characters or fewer.';
  END IF;
  IF cleaned_roll IS NULL AND cleaned_er IS NULL AND cleaned_sr IS NULL THEN
    RAISE EXCEPTION 'Enter at least one identifier: Roll No., ER No., or Sr No.';
  END IF;
  IF length(coalesce(cleaned_roll, '')) > 80
     OR length(coalesce(cleaned_er, '')) > 80
     OR length(coalesce(cleaned_sr, '')) > 80 THEN
    RAISE EXCEPTION 'Each student identifier must be 80 characters or fewer.';
  END IF;

  BEGIN
    UPDATE public.class_members
    SET full_name = cleaned_name,
        roll_no = cleaned_roll,
        er_no = cleaned_er,
        sr_no = cleaned_sr
    WHERE id = _member_id AND class_id = _class_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
    IF violated_constraint = 'class_members_roll_uniq' THEN
      RAISE EXCEPTION 'This Roll No. is already registered in this class.';
    ELSIF violated_constraint = 'class_members_er_uniq' THEN
      RAISE EXCEPTION 'This ER No. is already registered in this class.';
    ELSIF violated_constraint = 'class_members_sr_uniq' THEN
      RAISE EXCEPTION 'This Sr No. is already registered in this class.';
    ELSIF violated_constraint = 'class_members_name_uniq' THEN
      RAISE EXCEPTION 'A student with this name is already registered in this class.';
    ELSE
      RAISE EXCEPTION 'These student details conflict with another roster entry.';
    END IF;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.update_class_member_identity(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_class_member_identity(uuid, uuid, text, text, text, text) TO authenticated, service_role;
