CREATE OR REPLACE FUNCTION public.enforce_class_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim numeric;
BEGIN
  IF public.has_role(NEW.teacher_id,'admin') THEN RETURN NEW; END IF;
  lim:=public.plan_limit(NEW.teacher_id,'max_classes');
  IF lim>=0 AND (SELECT count(*) FROM public.classes c WHERE c.teacher_id=NEW.teacher_id AND c.archived=false AND c.id<>COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid))>=lim THEN RAISE EXCEPTION 'Your plan allows up to % classes',lim; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS classes_plan_limit ON public.classes;
CREATE TRIGGER classes_plan_limit BEFORE INSERT ON public.classes FOR EACH ROW EXECUTE FUNCTION public.enforce_class_limit();

CREATE OR REPLACE FUNCTION public.enforce_students_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim numeric; owner uuid;
BEGIN
  IF NEW.member_role<>'student' OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  SELECT teacher_id INTO owner FROM public.classes WHERE id=NEW.class_id;
  lim:=public.plan_limit(owner,'max_students_per_class');
  IF lim>=0 AND (SELECT count(*) FROM public.class_members m WHERE m.class_id=NEW.class_id AND m.member_role='student')>=lim THEN RAISE EXCEPTION 'This plan allows up to % students per class',lim; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS class_members_plan_limit ON public.class_members;
CREATE TRIGGER class_members_plan_limit BEFORE INSERT ON public.class_members FOR EACH ROW EXECUTE FUNCTION public.enforce_students_limit();

CREATE OR REPLACE FUNCTION public.enforce_assignment_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim numeric;
BEGIN
  IF public.has_role(NEW.teacher_id,'admin') THEN RETURN NEW; END IF;
  lim:=public.plan_limit(NEW.teacher_id,'assignments_per_month');
  IF lim>=0 AND (SELECT count(*) FROM public.assignments a WHERE a.teacher_id=NEW.teacher_id AND a.created_at>=date_trunc('month',now()))>=lim THEN RAISE EXCEPTION 'Your plan has reached its monthly assignment limit'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS assignments_plan_limit ON public.assignments;
CREATE TRIGGER assignments_plan_limit BEFORE INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_quota();

CREATE OR REPLACE FUNCTION public.enforce_quiz_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim numeric;
BEGIN
  IF public.has_role(NEW.teacher_id,'admin') THEN RETURN NEW; END IF;
  lim:=public.plan_limit(NEW.teacher_id,'quizzes_per_month');
  IF lim>=0 AND (SELECT count(*) FROM public.quizzes q WHERE q.teacher_id=NEW.teacher_id AND q.created_at>=date_trunc('month',now()))>=lim THEN RAISE EXCEPTION 'Your plan has reached its monthly quiz limit'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS quizzes_plan_limit ON public.quizzes;
CREATE TRIGGER quizzes_plan_limit BEFORE INSERT ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.enforce_quiz_quota();

CREATE OR REPLACE FUNCTION public.enforce_question_bank_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim numeric;
BEGIN
  IF public.has_role(NEW.owner_id,'admin') THEN RETURN NEW; END IF;
  lim:=public.plan_limit(NEW.owner_id,'question_bank_total');
  IF lim>=0 AND (SELECT count(*) FROM public.question_bank q WHERE q.owner_id=NEW.owner_id)>=lim THEN RAISE EXCEPTION 'Your plan has reached its question bank limit'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS question_bank_plan_limit ON public.question_bank;
CREATE TRIGGER question_bank_plan_limit BEFORE INSERT ON public.question_bank FOR EACH ROW EXECUTE FUNCTION public.enforce_question_bank_limit();

CREATE OR REPLACE FUNCTION public.validate_rubric_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE criterion_max numeric; level_points numeric; level_criterion uuid;
BEGIN
  SELECT max_points INTO criterion_max FROM public.rubric_criteria WHERE id=NEW.criterion_id;
  IF criterion_max IS NULL THEN RAISE EXCEPTION 'Rubric criterion not found'; END IF;
  IF NEW.awarded_points>criterion_max THEN RAISE EXCEPTION 'Awarded points exceed criterion maximum'; END IF;
  IF NEW.level_id IS NOT NULL THEN
    SELECT points,criterion_id INTO level_points,level_criterion FROM public.rubric_levels WHERE id=NEW.level_id;
    IF level_criterion IS DISTINCT FROM NEW.criterion_id THEN RAISE EXCEPTION 'Rubric level does not belong to criterion'; END IF;
    IF NEW.awarded_points IS DISTINCT FROM level_points THEN RAISE EXCEPTION 'Awarded points must match rubric level'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.submissions s JOIN public.assignments a ON a.id=s.assignment_id JOIN public.rubrics r ON r.id=a.rubric_id JOIN public.rubric_criteria c ON c.rubric_id=r.id WHERE s.id=NEW.submission_id AND c.id=NEW.criterion_id) THEN RAISE EXCEPTION 'Criterion does not belong to submission rubric'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rubric_grades_validate ON public.rubric_grades;
CREATE TRIGGER rubric_grades_validate BEFORE INSERT OR UPDATE ON public.rubric_grades FOR EACH ROW EXECUTE FUNCTION public.validate_rubric_grade();

CREATE OR REPLACE FUNCTION public.generate_due_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record; u record; k text; target timestamptz; window_label text;
BEGIN
  FOR r IN SELECT a.id,a.title,a.class_id,a.due_date FROM public.assignments a WHERE a.published=true AND a.archived=false AND a.due_date IS NOT NULL LOOP
    FOR u IN SELECT cm.student_id FROM public.class_members cm WHERE cm.class_id=r.class_id AND cm.member_role='student' LOOP
      IF EXISTS(SELECT 1 FROM public.notification_preferences np WHERE np.user_id=u.student_id AND np.deadline_reminders=false) THEN CONTINUE; END IF;
      target:=r.due_date;
      IF target>now()+interval '6 days' AND target<=now()+interval '7 days' THEN window_label:='7 days'; k:='7d';
      ELSIF target>now()+interval '2 days' AND target<=now()+interval '3 days' THEN window_label:='3 days'; k:='3d';
      ELSIF target>now()+interval '23 hours' AND target<=now()+interval '24 hours' THEN window_label:='1 day'; k:='1d';
      ELSIF target>now()-interval '1 hour' AND target<=now() THEN window_label:='due now'; k:='due';
      ELSIF target>now()-interval '25 hours' AND target<=now()-interval '23 hours' THEN window_label:='overdue'; k:='late';
      ELSE CONTINUE; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.notifications x WHERE x.user_id=u.student_id AND x.link='/assignments/'||r.id::text AND x.kind='deadline_'||k) THEN
        INSERT INTO public.notifications(user_id,title,body,link,kind) VALUES(u.student_id,CASE WHEN k='late' THEN 'Assignment overdue' ELSE 'Assignment reminder' END,CASE WHEN k='late' THEN r.title||' is overdue.' ELSE r.title||' is due in '||window_label||'.' END,'/assignments/'||r.id::text,'deadline_'||k);
        n:=n+1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.generate_due_reminders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_due_reminders() TO service_role;