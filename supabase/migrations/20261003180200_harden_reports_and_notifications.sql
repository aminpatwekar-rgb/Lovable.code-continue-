-- Harden progress reports and include quiz/attendance performance.
CREATE OR REPLACE FUNCTION public.get_progress_report(_student_id uuid,_class_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  requester uuid:=auth.uid();
  assignments_total integer;
  assignments_submitted integer;
  assignments_late integer;
  assignments_graded integer;
  average_marks numeric;
  average_percentage numeric;
  quiz_attempts integer;
  quiz_average_percentage numeric;
  attendance_total integer;
  attendance_present integer;
  attendance_late integer;
  attendance_percentage numeric;
BEGIN
  IF requester IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF requester<>_student_id
     AND NOT public.has_role(requester,'admin')
     AND NOT (
       _class_id IS NOT NULL
       AND public.is_class_teacher(_class_id,requester)
       AND public.is_class_member(_class_id,_student_id)
     )
  THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT count(a.id),
         count(s.id) FILTER (WHERE s.id IS NOT NULL),
         count(s.id) FILTER (WHERE s.is_late=true),
         count(s.id) FILTER (WHERE s.marks_awarded IS NOT NULL),
         ROUND(COALESCE(AVG(s.marks_awarded) FILTER (WHERE s.marks_awarded IS NOT NULL),0),2),
         ROUND(COALESCE(AVG((s.marks_awarded/NULLIF(a.max_marks,0))*100) FILTER (WHERE s.marks_awarded IS NOT NULL),0),2)
  INTO assignments_total,assignments_submitted,assignments_late,assignments_graded,average_marks,average_percentage
  FROM public.assignments a
  LEFT JOIN public.submissions s ON s.assignment_id=a.id AND s.student_id=_student_id
  WHERE a.published=true AND a.archived=false
    AND (_class_id IS NULL OR a.class_id=_class_id);

  SELECT count(at.id),
         ROUND(COALESCE(AVG((at.score/NULLIF(at.max_score,0))*100) FILTER (WHERE at.score IS NOT NULL AND at.max_score>0),0),2)
  INTO quiz_attempts,quiz_average_percentage
  FROM public.quiz_attempts at
  JOIN public.quizzes z ON z.id=at.quiz_id
  WHERE at.student_id=_student_id
    AND at.status IN ('submitted','graded')
    AND (_class_id IS NULL OR z.class_id=_class_id);

  SELECT count(*),
         count(*) FILTER (WHERE status='present' OR status='excused'),
         count(*) FILTER (WHERE status='late')
  INTO attendance_total,attendance_present,attendance_late
  FROM public.attendance_records
  WHERE student_id=_student_id
    AND (_class_id IS NULL OR class_id=_class_id);

  attendance_percentage:=CASE WHEN attendance_total=0 THEN 0 ELSE ROUND((attendance_present+attendance_late)::numeric/attendance_total*100,2) END;

  RETURN jsonb_build_object(
    'assignments_total',assignments_total,
    'assignments_submitted',assignments_submitted,
    'assignments_late',assignments_late,
    'assignments_graded',assignments_graded,
    'average_marks',average_marks,
    'average_percentage',average_percentage,
    'quiz_attempts',quiz_attempts,
    'quiz_average_percentage',quiz_average_percentage,
    'attendance_total',attendance_total,
    'attendance_present',attendance_present,
    'attendance_late',attendance_late,
    'attendance_percentage',attendance_percentage
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_progress_report(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS nt_insert ON public.notifications;
