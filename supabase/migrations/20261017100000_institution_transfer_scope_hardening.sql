-- Institution tenant scope hardening and safe member transfers.
-- Existing academic records are retained; only roster memberships from a
-- different institution are removed when a profile changes institution.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS institution_id uuid;

-- Departments are authoritative for department classes. For older classes that
-- did not have a department, use the owner's current institution as a one-time
-- backfill so those classes remain with their original tenant after transfers.
UPDATE public.classes c
SET institution_id = d.institution_id
FROM public.departments d
WHERE c.department_id = d.id
  AND c.institution_id IS DISTINCT FROM d.institution_id;

UPDATE public.classes c
SET institution_id = p.institution_id
FROM public.profiles p
WHERE c.teacher_id = p.id
  AND c.department_id IS NULL
  AND c.institution_id IS NULL
  AND p.institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS classes_institution_id_idx
  ON public.classes (institution_id);

-- New classes inherit tenant scope from their department, or from the creator
-- when no department is selected. Once established, a class keeps its tenant
-- when its owner changes institutions. Reassigning department moves tenant scope
-- only when the new department is valid for that actor (checked by the existing
-- validate_class_department trigger).
CREATE OR REPLACE FUNCTION public.set_class_institution_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  department_institution uuid;
  owner_institution uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN
    NEW.institution_id := OLD.institution_id;
    RETURN NEW;
  END IF;

  IF NEW.department_id IS NOT NULL THEN
    SELECT d.institution_id INTO department_institution
    FROM public.departments d
    WHERE d.id = NEW.department_id;

    IF department_institution IS NULL THEN
      RAISE EXCEPTION 'Department not found';
    END IF;
    NEW.institution_id := department_institution;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Clearing a department never turns a tenant class into a global class.
    NEW.institution_id := OLD.institution_id;
  ELSE
    SELECT p.institution_id INTO owner_institution
    FROM public.profiles p
    WHERE p.id = NEW.teacher_id;
    NEW.institution_id := owner_institution;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_class_institution_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS classes_scope_institution ON public.classes;
CREATE TRIGGER classes_scope_institution
  BEFORE INSERT OR UPDATE OF department_id, institution_id ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_class_institution_scope();

-- A transfer/removal clears tenant-specific class roster links that would grant
-- continued access to the former institution. Submissions, grades, comments,
-- assignments, classes, and files are not deleted.
CREATE OR REPLACE FUNCTION public.clear_class_members_on_institution_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    DELETE FROM public.class_members m
    USING public.classes c
    WHERE m.class_id = c.id
      AND m.student_id = NEW.id
      AND c.institution_id IS NOT NULL
      AND c.institution_id IS DISTINCT FROM NEW.institution_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_class_members_on_institution_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_clear_class_members ON public.profiles;
CREATE TRIGGER profiles_clear_class_members
  AFTER UPDATE OF institution_id ON public.profiles
  FOR EACH ROW
  WHEN (NEW.institution_id IS DISTINCT FROM OLD.institution_id)
  EXECUTE FUNCTION public.clear_class_members_on_institution_change();

-- Prevent a former class owner or co-member from retaining access to a class
-- owned by a different institution after their profile is transferred.
CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes c
    LEFT JOIN public.profiles p ON p.id = _user_id
    WHERE c.id = _class_id
      AND c.teacher_id = _user_id
      AND (c.institution_id IS NULL OR p.institution_id = c.institution_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(_class_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_members m
    JOIN public.classes c ON c.id = m.class_id
    JOIN public.profiles p ON p.id = _user_id
    WHERE m.class_id = _class_id
      AND m.student_id = _user_id
      AND (c.institution_id IS NULL OR p.institution_id = c.institution_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assignment_owner(_assignment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = _assignment_id
      AND a.teacher_id = _user_id
      AND public.is_class_teacher(a.class_id, _user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_assignment(_assignment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN public.classes c ON c.id = a.class_id
    WHERE a.id = _assignment_id
      AND (
        public.has_role(_user_id, 'admin')
        OR (c.institution_id IS NOT NULL AND public.is_institution_admin(c.institution_id))
        OR public.is_assignment_owner(a.id, _user_id)
        OR public.is_class_member(c.id, _user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id = _submission_id
      AND (
        s.student_id = _user_id
        OR public.is_assignment_owner(s.assignment_id, _user_id)
        OR EXISTS (
          SELECT 1
          FROM public.assignments a
          JOIN public.classes c ON c.id = a.class_id
          WHERE a.id = s.assignment_id
            AND c.institution_id IS NOT NULL
            AND public.is_institution_admin(c.institution_id)
        )
        OR public.has_role(_user_id, 'admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id = _submission_id
      AND s.student_id = _user_id
      AND public.can_view_assignment(s.assignment_id, _user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.reviews_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.id = _submission_id
      AND public.is_assignment_owner(s.assignment_id, _user_id)
  );
$$;

-- Classes remain available to their current tenant's administrator, but owners
-- and members must still belong to the class tenant.
DROP POLICY IF EXISTS classes_read ON public.classes;
CREATE POLICY classes_read ON public.classes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (institution_id IS NOT NULL AND public.is_institution_admin(institution_id))
    OR public.is_class_teacher(id, auth.uid())
    OR public.is_class_member(id, auth.uid())
  );

DROP POLICY IF EXISTS classes_update ON public.classes;
CREATE POLICY classes_update ON public.classes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_class_teacher(id, auth.uid()));

DROP POLICY IF EXISTS classes_delete ON public.classes;
CREATE POLICY classes_delete ON public.classes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_class_teacher(id, auth.uid()));

DROP POLICY IF EXISTS members_read ON public.class_members;
CREATE POLICY members_read ON public.class_members FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_class_teacher(class_id, auth.uid())
    OR (
      student_id = auth.uid()
      AND public.is_class_member(class_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_members.class_id
        AND c.institution_id IS NOT NULL
        AND public.is_institution_admin(c.institution_id)
    )
  );

DROP POLICY IF EXISTS members_join ON public.class_members;
CREATE POLICY members_join ON public.class_members FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.classes c
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE c.id = class_members.class_id
        AND (c.institution_id IS NULL OR p.institution_id = c.institution_id)
    )
  );

DROP POLICY IF EXISTS members_delete ON public.class_members;
CREATE POLICY members_delete ON public.class_members FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_class_teacher(class_id, auth.uid())
    OR (
      student_id = auth.uid()
      AND public.is_class_member(class_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS assignments_read ON public.assignments;
CREATE POLICY assignments_read ON public.assignments FOR SELECT TO authenticated
  USING (public.can_view_assignment(id, auth.uid()));

DROP POLICY IF EXISTS assignments_insert ON public.assignments;
CREATE POLICY assignments_insert ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND public.is_class_teacher(class_id, auth.uid())
  );

DROP POLICY IF EXISTS assignments_update ON public.assignments;
CREATE POLICY assignments_update ON public.assignments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_assignment_owner(id, auth.uid())
  );

DROP POLICY IF EXISTS assignments_delete ON public.assignments;
CREATE POLICY assignments_delete ON public.assignments FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_assignment_owner(id, auth.uid())
  );

DROP POLICY IF EXISTS att_read ON public.assignment_attachments;
CREATE POLICY att_read ON public.assignment_attachments FOR SELECT TO authenticated
  USING (public.can_view_assignment(assignment_id, auth.uid()));

DROP POLICY IF EXISTS att_write ON public.assignment_attachments;
CREATE POLICY att_write ON public.assignment_attachments FOR INSERT TO authenticated
  WITH CHECK (public.is_assignment_owner(assignment_id, auth.uid()));

DROP POLICY IF EXISTS att_delete ON public.assignment_attachments;
CREATE POLICY att_delete ON public.assignment_attachments FOR DELETE TO authenticated
  USING (public.is_assignment_owner(assignment_id, auth.uid()));

DROP POLICY IF EXISTS sub_read ON public.submissions;
CREATE POLICY sub_read ON public.submissions FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_assignment_owner(assignment_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.assignments a
      JOIN public.classes c ON c.id = a.class_id
      WHERE a.id = submissions.assignment_id
        AND c.institution_id IS NOT NULL
        AND public.is_institution_admin(c.institution_id)
    )
  );

DROP POLICY IF EXISTS sub_insert ON public.submissions;
CREATE POLICY sub_insert ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND public.can_view_assignment(assignment_id, auth.uid())
  );

DROP POLICY IF EXISTS sub_update ON public.submissions;
CREATE POLICY sub_update ON public.submissions FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_assignment_owner(assignment_id, auth.uid())
    OR (student_id = auth.uid() AND public.can_view_assignment(assignment_id, auth.uid()))
  );

DROP POLICY IF EXISTS sub_delete ON public.submissions;
CREATE POLICY sub_delete ON public.submissions FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (student_id = auth.uid() AND public.can_view_assignment(assignment_id, auth.uid()))
  );


-- Keep students' existing submission files readable as their own history, but
-- prevent new uploads/updates/deletes for assignments in their former institution.
DROP POLICY IF EXISTS sub_files_student_all ON storage.objects;

DROP POLICY IF EXISTS sub_files_student_read ON storage.objects;
CREATE POLICY sub_files_student_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS sub_files_student_write ON storage.objects;
CREATE POLICY sub_files_student_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.can_view_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS sub_files_student_update ON storage.objects;
CREATE POLICY sub_files_student_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.can_view_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  )
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.can_view_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS sub_files_student_delete ON storage.objects;
CREATE POLICY sub_files_student_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.can_view_assignment(((storage.foldername(name))[1])::uuid, auth.uid())
  );
