-- Restore Calendar access for institution admins without changing other role entitlements.

CREATE OR REPLACE FUNCTION public.user_has_feature(_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.plan_has_feature(auth.uid(), _feature)
    OR (_feature = 'calendar' AND public.has_role(auth.uid(), 'institution_admin'));
$$;

GRANT EXECUTE ON FUNCTION public.user_has_feature(text) TO authenticated;

-- Institution admins may read quizzes attached to classes in their own institution.
CREATE OR REPLACE FUNCTION public.can_view_quiz(_quiz_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id = _quiz_id
      AND (
        public.has_role(_user_id, 'admin')
        OR (q.teacher_id = _user_id AND public.is_class_teacher(q.class_id, _user_id))
        OR (q.published AND public.is_class_member(q.class_id, _user_id))
        OR EXISTS (
          SELECT 1
          FROM public.classes c
          WHERE c.id = q.class_id
            AND c.institution_id IS NOT NULL
            AND public.is_institution_admin(c.institution_id)
        )
      )
  );
$$;

DROP POLICY IF EXISTS "quiz select" ON public.quizzes;
CREATE POLICY "quiz select" ON public.quizzes
  FOR SELECT TO authenticated
  USING (public.can_view_quiz(id, auth.uid()));

-- Institution admins may read calendar events for their institution.
-- Existing class-owner plan gating for students and teachers remains in place.
DROP POLICY IF EXISTS calendar_read ON public.calendar_events;
CREATE POLICY calendar_read ON public.calendar_events
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.id = calendar_events.class_id
        AND c.institution_id IS NOT NULL
        AND public.is_institution_admin(c.institution_id)
    )
    OR (
      class_id IS NOT NULL
      AND (public.is_class_member(class_id, auth.uid()) OR public.is_class_teacher(class_id, auth.uid()))
      AND EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = calendar_events.class_id
          AND public.plan_has_feature(c.teacher_id, 'calendar')
      )
    )
  );
