CREATE OR REPLACE FUNCTION public.protect_submission_grading()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_assignment_owner(NEW.assignment_id, auth.uid())
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Students may edit their own work, never their grade or its ownership.
  NEW.marks_awarded := OLD.marks_awarded;
  NEW.teacher_feedback := OLD.teacher_feedback;
  NEW.improvement_notes := OLD.improvement_notes;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.grade_released := OLD.grade_released;
  NEW.student_id := OLD.student_id;
  NEW.assignment_id := OLD.assignment_id;
  RETURN NEW;
END;
$function$;