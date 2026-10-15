CREATE OR REPLACE FUNCTION public.enforce_feature_on_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid;
BEGIN
  SELECT teacher_id INTO owner FROM public.classes WHERE id=NEW.class_id;
  IF NOT public.has_role(auth.uid(),'admin') AND NOT public.plan_has_feature(owner,'attendance') THEN
    RAISE EXCEPTION 'Attendance is not included in your current plan';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS attendance_plan_feature ON public.attendance_records;
CREATE TRIGGER attendance_plan_feature BEFORE INSERT OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_on_attendance();

CREATE OR REPLACE FUNCTION public.enforce_feature_on_rubric()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') AND NOT public.plan_has_feature(NEW.owner_id,'rubrics') THEN
    RAISE EXCEPTION 'Rubrics are not included in your current plan';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rubrics_plan_feature ON public.rubrics;
CREATE TRIGGER rubrics_plan_feature BEFORE INSERT OR UPDATE ON public.rubrics FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_on_rubric();

CREATE OR REPLACE FUNCTION public.enforce_feature_on_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') AND NOT public.plan_has_feature(NEW.owner_id,'calendar') THEN
    RAISE EXCEPTION 'Calendar is not included in your current plan';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS calendar_plan_feature ON public.calendar_events;
CREATE TRIGGER calendar_plan_feature BEFORE INSERT OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_on_calendar();

CREATE OR REPLACE FUNCTION public.enforce_feature_on_quiz_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.has_role(NEW.teacher_id,'admin') THEN RETURN NEW; END IF;
  IF (NEW.randomize_questions OR NEW.randomize_choices) AND NOT public.plan_has_feature(NEW.teacher_id,'quiz_randomization') THEN
    RAISE EXCEPTION 'Quiz randomization is not included in your current plan';
  END IF;
  IF NEW.time_limit_minutes IS NOT NULL AND NOT public.plan_has_feature(NEW.teacher_id,'time_attempt_controls') THEN
    RAISE EXCEPTION 'Timed attempts are not included in your current plan';
  END IF;
  IF NEW.lockdown_enabled AND NOT public.plan_has_feature(NEW.teacher_id,'lockdown') THEN
    RAISE EXCEPTION 'Lockdown mode is not included in your current plan';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS quiz_settings_plan_feature ON public.quizzes;
CREATE TRIGGER quiz_settings_plan_feature BEFORE INSERT OR UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_on_quiz_settings();

CREATE OR REPLACE FUNCTION public.get_progress_report(_student_id uuid,_class_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE requester uuid:=auth.uid(); assignments_total integer; assignments_submitted integer; assignments_late integer; assignments_graded integer; average_marks numeric; average_percentage numeric; quiz_attempts integer; quiz_average_percentage numeric; attendance_total integer; attendance_present integer; attendance_late integer; attendance_percentage numeric; report_owner uuid;
BEGIN
  IF requester IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF requester<>_student_id AND NOT public.has_role(requester,'admin') AND NOT (_class_id IS NOT NULL AND public.is_class_teacher(_class_id,requester) AND public.is_class_member(_class_id,_student_id)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF requester<>_student_id AND NOT public.has_role(requester,'admin') AND NOT public.plan_has_feature(requester,'progress_reports') THEN RAISE EXCEPTION 'Progress reports are not included in your current plan'; END IF;
  SELECT count(a.id),count(s.id) FILTER (WHERE s.id IS NOT NULL),count(s.id) FILTER (WHERE s.is_late=true),count(s.id) FILTER (WHERE s.marks_awarded IS NOT NULL),ROUND(COALESCE(AVG(s.marks_awarded) FILTER (WHERE s.marks_awarded IS NOT NULL),0),2),ROUND(COALESCE(AVG((s.marks_awarded/NULLIF(a.max_marks,0))*100) FILTER (WHERE s.marks_awarded IS NOT NULL),0),2)
  INTO assignments_total,assignments_submitted,assignments_late,assignments_graded,average_marks,average_percentage
  FROM public.assignments a LEFT JOIN public.submissions s ON s.assignment_id=a.id AND s.student_id=_student_id
  WHERE a.published=true AND a.archived=false AND (_class_id IS NULL OR a.class_id=_class_id);
  SELECT count(at.id),ROUND(COALESCE(AVG((at.score/NULLIF(at.max_score,0))*100) FILTER (WHERE at.score IS NOT NULL AND at.max_score>0),0),2)
  INTO quiz_attempts,quiz_average_percentage FROM public.quiz_attempts at JOIN public.quizzes z ON z.id=at.quiz_id
  WHERE at.student_id=_student_id AND at.status IN ('submitted','graded') AND (_class_id IS NULL OR z.class_id=_class_id);
  SELECT count(*),count(*) FILTER (WHERE status='present' OR status='excused'),count(*) FILTER (WHERE status='late')
  INTO attendance_total,attendance_present,attendance_late FROM public.attendance_records WHERE student_id=_student_id AND (_class_id IS NULL OR class_id=_class_id);
  attendance_percentage:=CASE WHEN attendance_total=0 THEN 0 ELSE ROUND((attendance_present+attendance_late)::numeric/attendance_total*100,2) END;
  RETURN jsonb_build_object('assignments_total',assignments_total,'assignments_submitted',assignments_submitted,'assignments_late',assignments_late,'assignments_graded',assignments_graded,'average_marks',average_marks,'average_percentage',average_percentage,'quiz_attempts',quiz_attempts,'quiz_average_percentage',quiz_average_percentage,'attendance_total',attendance_total,'attendance_present',attendance_present,'attendance_late',attendance_late,'attendance_percentage',attendance_percentage);
END; $$;
REVOKE ALL ON FUNCTION public.get_progress_report(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_progress_report(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_class_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record;
BEGIN
 IF NEW.published IS TRUE AND (TG_OP='INSERT' OR OLD.published IS FALSE) THEN FOR m IN SELECT cm.student_id FROM public.class_members cm WHERE cm.class_id=NEW.class_id AND cm.member_role='student' LOOP IF NOT EXISTS(SELECT 1 FROM public.notification_preferences np WHERE np.user_id=m.student_id AND np.new_assignments=false) THEN INSERT INTO public.notifications(user_id,title,body,link,kind) VALUES(m.student_id,'New assignment',NEW.title,'/assignments/'||NEW.id::text,'assignment'); END IF; END LOOP; END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS assignments_notify_students ON public.assignments;
CREATE TRIGGER assignments_notify_students AFTER INSERT OR UPDATE OF published ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.notify_class_assignment();
CREATE OR REPLACE FUNCTION public.notify_submission_teacher() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid;
BEGIN SELECT teacher_id INTO tid FROM public.assignments WHERE id=NEW.assignment_id; IF tid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.notification_preferences np WHERE np.user_id=tid AND np.submissions=false) THEN INSERT INTO public.notifications(user_id,title,body,link,kind) VALUES(tid,'Student submission','A student submitted work.','/submissions/'||NEW.id::text,'submission'); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS submissions_notify_teacher ON public.submissions;
CREATE TRIGGER submissions_notify_teacher AFTER INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.notify_submission_teacher();
CREATE OR REPLACE FUNCTION public.notify_grade_release() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NEW.grade_released=true AND COALESCE(OLD.grade_released,false)=false AND NOT EXISTS(SELECT 1 FROM public.notification_preferences np WHERE np.user_id=NEW.student_id AND np.grading=false) THEN INSERT INTO public.notifications(user_id,title,body,link,kind) VALUES(NEW.student_id,'Grade released','Your assignment grade is now available.','/assignments/'||NEW.assignment_id::text,'grade'); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS submissions_notify_grade_release ON public.submissions;
CREATE TRIGGER submissions_notify_grade_release AFTER UPDATE OF grade_released ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.notify_grade_release();

DROP POLICY IF EXISTS nt_insert ON public.notifications;
COMMENT ON TABLE public.notifications IS 'Client INSERT intentionally disabled; notifications are created by trusted SECURITY DEFINER workflow functions.';