-- Co-teachers: teachers can join another teacher's class with its join code
-- (join_class_by_code already records them as class_members.member_role = 'teacher').
-- This migration makes that role count for permissions, and closes a hole that
-- would otherwise let anyone self-insert a 'teacher' membership.

-- 1. Members can only ever self-insert as students. Teacher memberships are created
--    solely by the SECURITY DEFINER join_class_by_code function (which checks the
--    caller really has the teacher/admin role).
DROP POLICY IF EXISTS "members_join" ON public.class_members;
CREATE POLICY "members_join" ON public.class_members FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND member_role = 'student');

-- 2. A "class teacher" is the owner OR a co-teacher of the class.
CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND (
    EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.class_members
      WHERE class_id = _class_id AND student_id = _user_id AND member_role = 'teacher')
  );
$$;

-- 3. Co-teachers can view and grade submissions for assignments in their class.
--    (Editing/deleting an assignment still belongs to its creator or an admin.)
CREATE OR REPLACE FUNCTION public.is_assignment_owner(_assignment_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = _assignment_id
      AND (a.teacher_id = _user_id OR public.is_class_teacher(a.class_id, _user_id)));
$$;

CREATE OR REPLACE FUNCTION public.reviews_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.id = _submission_id
      AND (a.teacher_id = _user_id OR public.is_class_teacher(a.class_id, _user_id)));
$$;
