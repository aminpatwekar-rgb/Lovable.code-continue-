ALTER TABLE public.class_members
  ADD COLUMN IF NOT EXISTS member_role text NOT NULL DEFAULT 'student';

ALTER TABLE public.class_members
  DROP CONSTRAINT IF EXISTS class_members_member_role_chk;
ALTER TABLE public.class_members
  ADD CONSTRAINT class_members_member_role_chk CHECK (member_role IN ('student','teacher'));

-- identifiers are a student-only concept: co-teachers never collide with them
DROP INDEX IF EXISTS public.class_members_name_uniq;
CREATE UNIQUE INDEX class_members_name_uniq
  ON public.class_members (class_id, lower(btrim(full_name)))
  WHERE full_name IS NOT NULL AND member_role = 'student';

CREATE OR REPLACE FUNCTION public.join_class_by_code(_code text, _full_name text, _roll_no text, _er_no text, _sr_no text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cid uuid;
  owner uuid;
  uid uuid := auth.uid();
  is_staff boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, teacher_id INTO cid, owner FROM public.classes
   WHERE upper(join_code) = upper(btrim(_code)) AND archived = false;
  IF cid IS NULL THEN RAISE EXCEPTION 'Invalid join code'; END IF;

  is_staff := public.has_role(uid, 'teacher') OR public.has_role(uid, 'admin');

  IF is_staff AND owner = uid THEN
    RAISE EXCEPTION 'You already own this class';
  END IF;

  IF EXISTS (SELECT 1 FROM public.class_members WHERE class_id = cid AND student_id = uid) THEN
    RETURN cid;
  END IF;

  IF is_staff THEN
    -- Co-teachers join with their existing ONYX identity: no student identifiers.
    INSERT INTO public.class_members (class_id, student_id, full_name, member_role)
    VALUES (cid, uid,
            nullif(btrim(coalesce(_full_name, (SELECT p.full_name FROM public.profiles p WHERE p.id = uid), '')), ''),
            'teacher');
    RETURN cid;
  END IF;

  IF btrim(coalesce(_full_name,'')) = '' THEN RAISE EXCEPTION 'Full name is required'; END IF;
  IF btrim(coalesce(_roll_no,'')) = '' THEN RAISE EXCEPTION 'Roll No. is required'; END IF;
  IF btrim(coalesce(_er_no,'')) = '' THEN RAISE EXCEPTION 'ER No. is required'; END IF;
  IF btrim(coalesce(_sr_no,'')) = '' THEN RAISE EXCEPTION 'Sr No. is required'; END IF;

  BEGIN
    INSERT INTO public.class_members (class_id, student_id, full_name, roll_no, er_no, sr_no, member_role)
    VALUES (cid, uid, btrim(_full_name), btrim(_roll_no), btrim(_er_no), btrim(_sr_no), 'student');
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE '%class_members_roll_uniq%' THEN
      RAISE EXCEPTION 'This Roll No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_er_uniq%' THEN
      RAISE EXCEPTION 'This ER No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_sr_uniq%' THEN
      RAISE EXCEPTION 'This Sr No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_name_uniq%' THEN
      RAISE EXCEPTION 'A student with this name is already registered in this class.';
    ELSE
      RAISE EXCEPTION 'You are already registered in this class.';
    END IF;
  END;

  RETURN cid;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_class_by_code(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text, text, text, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_class_roster(uuid);
CREATE FUNCTION public.get_class_roster(_class_id uuid)
 RETURNS TABLE(id uuid, student_id uuid, full_name text, joined_at timestamp with time zone, roll_no text, er_no text, sr_no text, member_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id,
         m.student_id,
         coalesce(nullif(btrim(m.full_name), ''), p.full_name) AS full_name,
         m.joined_at,
         CASE WHEN priv.ok THEN m.roll_no END,
         CASE WHEN priv.ok THEN m.er_no END,
         CASE WHEN priv.ok THEN m.sr_no END,
         m.member_role
  FROM public.class_members m
  LEFT JOIN public.profiles p ON p.id = m.student_id
  CROSS JOIN LATERAL (
    SELECT (public.is_class_teacher(_class_id, auth.uid())
            OR public.has_role(auth.uid(), 'admin')
            OR m.student_id = auth.uid()) AS ok
  ) priv
  WHERE m.class_id = _class_id
    AND auth.uid() IS NOT NULL
    AND (public.is_class_member(_class_id, auth.uid())
         OR public.is_class_teacher(_class_id, auth.uid())
         OR public.has_role(auth.uid(), 'admin'))
  ORDER BY m.member_role DESC, m.joined_at;
$function$;

REVOKE ALL ON FUNCTION public.get_class_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_roster(uuid) TO authenticated;