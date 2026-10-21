DROP POLICY IF EXISTS calendar_read ON public.calendar_events;
CREATE POLICY calendar_read ON public.calendar_events
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    class_id IS NOT NULL
    AND (public.is_class_member(class_id, auth.uid()) OR public.is_class_teacher(class_id, auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = calendar_events.class_id
        AND public.plan_has_feature(c.teacher_id, 'calendar')
    )
  )
);