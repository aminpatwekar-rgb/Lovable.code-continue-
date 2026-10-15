-- ONYX business features, persistent entitlements, academic workflows and quota enforcement
-- Safe to apply after the existing ONYX migrations.

CREATE TABLE IF NOT EXISTS public.question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('mcq','multi_select','true_false','fill_blank','short_answer','essay')),
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text,
  points numeric NOT NULL DEFAULT 1 CHECK (points > 0),
  subject text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_bank_owner_idx ON public.question_bank(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS question_bank_class_idx ON public.question_bank(class_id);
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank TO authenticated;
GRANT ALL ON public.question_bank TO service_role;
DROP POLICY IF EXISTS question_bank_read ON public.question_bank;
CREATE POLICY question_bank_read ON public.question_bank FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS question_bank_write ON public.question_bank;
CREATE POLICY question_bank_write ON public.question_bank FOR ALL TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR (class_id IS NOT NULL AND public.is_class_teacher(class_id, auth.uid()))
);

CREATE TABLE IF NOT EXISTS public.rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rubric_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id uuid NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  max_points numeric NOT NULL DEFAULT 1 CHECK (max_points > 0),
  UNIQUE(rubric_id, position)
);
CREATE TABLE IF NOT EXISTS public.rubric_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id uuid NOT NULL REFERENCES public.rubric_criteria(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  description text,
  points numeric NOT NULL DEFAULT 0 CHECK (points >= 0),
  UNIQUE(criterion_id, position)
);
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_levels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubrics, public.rubric_criteria, public.rubric_levels TO authenticated;
GRANT ALL ON public.rubrics, public.rubric_criteria, public.rubric_levels TO service_role;
DROP POLICY IF EXISTS rubrics_owner ON public.rubrics;
CREATE POLICY rubrics_owner ON public.rubrics FOR ALL TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS rubric_criteria_owner ON public.rubric_criteria;
CREATE POLICY rubric_criteria_owner ON public.rubric_criteria FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.rubrics r WHERE r.id = rubric_id AND (r.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.rubrics r WHERE r.id = rubric_id AND (r.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
DROP POLICY IF EXISTS rubric_levels_owner ON public.rubric_levels;
CREATE POLICY rubric_levels_owner ON public.rubric_levels FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rubric_criteria c JOIN public.rubrics r ON r.id=c.rubric_id
  WHERE c.id = criterion_id AND (r.owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.rubric_criteria c JOIN public.rubrics r ON r.id=c.rubric_id
  WHERE c.id = criterion_id AND (r.owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'))
));

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS rubric_id uuid REFERENCES public.rubrics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assignments_rubric_idx ON public.assignments(rubric_id);

CREATE TABLE IF NOT EXISTS public.rubric_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.rubric_criteria(id) ON DELETE CASCADE,
  level_id uuid REFERENCES public.rubric_levels(id) ON DELETE SET NULL,
  awarded_points numeric NOT NULL DEFAULT 0 CHECK (awarded_points >= 0),
  feedback text,
  graded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id, criterion_id)
);
ALTER TABLE public.rubric_grades ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_grades TO authenticated;
GRANT ALL ON public.rubric_grades TO service_role;
DROP POLICY IF EXISTS rubric_grades_access ON public.rubric_grades;
CREATE POLICY rubric_grades_access ON public.rubric_grades FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR graded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id=submission_id AND s.student_id=auth.uid() AND s.grade_released=true
  )
)
WITH CHECK (
  graded_by = auth.uid()
  AND (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1
      FROM public.submissions s
      JOIN public.assignments a ON a.id=s.assignment_id
      WHERE s.id=submission_id AND a.teacher_id=auth.uid()
    )
  )
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note text,
  marked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS attendance_class_date_idx ON public.attendance_records(class_id, attendance_date DESC);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
DROP POLICY IF EXISTS attendance_read ON public.attendance_records;
CREATE POLICY attendance_read ON public.attendance_records FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR public.is_class_teacher(class_id, auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
DROP POLICY IF EXISTS attendance_write ON public.attendance_records;
CREATE POLICY attendance_write ON public.attendance_records FOR ALL TO authenticated
USING (public.is_class_teacher(class_id,auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (marked_by=auth.uid() AND (public.is_class_teacher(class_id,auth.uid()) OR public.has_role(auth.uid(),'admin')));

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  new_assignments boolean NOT NULL DEFAULT true,
  deadline_reminders boolean NOT NULL DEFAULT true,
  submissions boolean NOT NULL DEFAULT true,
  grading boolean NOT NULL DEFAULT true,
  announcements boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
DROP POLICY IF EXISTS notification_preferences_self ON public.notification_preferences;
CREATE POLICY notification_preferences_self ON public.notification_preferences FOR ALL TO authenticated
USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'other' CHECK(event_type IN ('assignment','quiz','exam','project','other')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_events_class_time_idx ON public.calendar_events(class_id, starts_at);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
DROP POLICY IF EXISTS calendar_read ON public.calendar_events;
CREATE POLICY calendar_read ON public.calendar_events FOR SELECT TO authenticated
USING (
  owner_id=auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR (class_id IS NOT NULL AND public.is_class_member(class_id,auth.uid()))
  OR (class_id IS NOT NULL AND public.is_class_teacher(class_id,auth.uid()))
);
DROP POLICY IF EXISTS calendar_write ON public.calendar_events;
CREATE POLICY calendar_write ON public.calendar_events FOR ALL TO authenticated
USING (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  monthly_price_inr integer NOT NULL DEFAULT 0,
  annual_price_inr integer,
  active boolean NOT NULL DEFAULT true,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.billing_plans(id),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('trialing','active','past_due','cancelled','expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  provider text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_plans TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.billing_plans, public.subscriptions TO service_role;
DROP POLICY IF EXISTS billing_plans_read ON public.billing_plans;
CREATE POLICY billing_plans_read ON public.billing_plans FOR SELECT TO authenticated USING (active=true);
DROP POLICY IF EXISTS subscriptions_self_read ON public.subscriptions;
CREATE POLICY subscriptions_self_read ON public.subscriptions FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));

INSERT INTO public.billing_plans(code,name,monthly_price_inr,annual_price_inr,limits,features)
VALUES
('free','Free',0,0,
 '{"max_classes":1,"max_students_per_class":30,"assignments_per_month":10,"quizzes_per_month":5,"ai_questions_per_month":10,"question_bank_total":50,"storage_bytes":524288000}'::jsonb,
 '{"question_bank":true,"advanced_grading":true,"rubrics":false,"attendance":false,"calendar":false,"notifications":true,"advanced_analytics":false,"csv_import":false,"csv_export":true,"quiz_randomization":false,"time_attempt_controls":false,"lockdown":false,"progress_reports":false,"remove_branding":false}'::jsonb),
('starter','Starter',699,6990,
 '{"max_classes":3,"max_students_per_class":60,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":75,"question_bank_total":250,"storage_bytes":2147483648}'::jsonb,
 '{"question_bank":true,"advanced_grading":true,"rubrics":false,"attendance":false,"calendar":false,"notifications":true,"advanced_analytics":false,"csv_import":false,"csv_export":true,"quiz_randomization":false,"time_attempt_controls":false,"lockdown":false,"progress_reports":false,"remove_branding":false}'::jsonb),
('professional','Professional',1999,19990,
 '{"max_classes":15,"max_students_per_class":250,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":300,"question_bank_total":-1,"storage_bytes":10737418240}'::jsonb,
 '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":true,"csv_import":true,"csv_export":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"progress_reports":true,"remove_branding":false}'::jsonb),
('pro','Pro',4999,49990,
 '{"max_classes":-1,"max_students_per_class":400,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":500,"question_bank_total":-1,"storage_bytes":26843545600}'::jsonb,
 '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":true,"csv_import":true,"csv_export":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"progress_reports":true,"remove_branding":true}'::jsonb)
ON CONFLICT (code) DO UPDATE SET name=excluded.name,monthly_price_inr=excluded.monthly_price_inr,annual_price_inr=excluded.annual_price_inr,limits=excluded.limits,features=excluded.features,active=true;

CREATE OR REPLACE FUNCTION public.current_plan_code(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((
    SELECT p.code
    FROM public.subscriptions s
    JOIN public.billing_plans p ON p.id=s.plan_id
    WHERE s.user_id=_user_id AND s.status IN ('trialing','active')
      AND (s.expires_at IS NULL OR s.expires_at > now())
    LIMIT 1
  ),'free');
$$;
GRANT EXECUTE ON FUNCTION public.current_plan_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_limit(_user_id uuid,_key text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(((p.limits ->> _key)::numeric),0)
  FROM public.billing_plans p
  WHERE p.code=public.current_plan_code(_user_id);
$$;
GRANT EXECUTE ON FUNCTION public.plan_limit(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_has_feature(_user_id uuid,_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(((p.features ->> _key)::boolean),false)
  FROM public.billing_plans p
  WHERE p.code=public.current_plan_code(_user_id);
$$;
GRANT EXECUTE ON FUNCTION public.plan_has_feature(uuid,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.ai_usage_periods (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  used_questions integer NOT NULL DEFAULT 0 CHECK(used_questions>=0),
  reserved_questions integer NOT NULL DEFAULT 0 CHECK(reserved_questions>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,period_start)
);
CREATE TABLE IF NOT EXISTS public.ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  requested_questions integer NOT NULL,
  successful_questions integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK(status IN ('reserved','settled','released','failed')),
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
ALTER TABLE public.ai_usage_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ai_usage_periods, public.ai_usage_ledger TO authenticated;
GRANT ALL ON public.ai_usage_periods, public.ai_usage_ledger TO service_role;
DROP POLICY IF EXISTS ai_usage_self ON public.ai_usage_periods;
CREATE POLICY ai_usage_self ON public.ai_usage_periods FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS ai_ledger_self ON public.ai_usage_ledger;
CREATE POLICY ai_ledger_self ON public.ai_usage_ledger FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.reserve_ai_questions(_requested integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); period date:=date_trunc('month',now())::date; lim integer; avail integer; lid uuid;
BEGIN
  IF uid IS NULL OR _requested < 1 OR _requested > 100 THEN RAISE EXCEPTION 'Invalid AI request'; END IF;
  lim:=public.plan_limit(uid,'ai_questions_per_month');
  INSERT INTO public.ai_usage_periods(user_id,period_start) VALUES(uid,period) ON CONFLICT DO NOTHING;
  SELECT GREATEST(0,lim-used_questions-reserved_questions) INTO avail FROM public.ai_usage_periods WHERE user_id=uid AND period_start=period FOR UPDATE;
  IF lim >= 0 AND avail < _requested THEN RAISE EXCEPTION 'AI monthly limit reached';
  END IF;
  UPDATE public.ai_usage_periods SET reserved_questions=reserved_questions+_requested,updated_at=now() WHERE user_id=uid AND period_start=period;
  INSERT INTO public.ai_usage_ledger(user_id,period_start,requested_questions,status)
  VALUES(uid,period,_requested,'reserved') RETURNING id INTO lid;
  RETURN lid;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_questions(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_questions(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_ai_questions(_ledger_id uuid,_successful integer,_provider text,_model text,_input_tokens integer,_output_tokens integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); l public.ai_usage_ledger%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.ai_usage_ledger WHERE id=_ledger_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND OR l.status <> 'reserved' THEN RAISE EXCEPTION 'Invalid AI reservation'; END IF;
  IF _successful < 0 OR _successful > l.requested_questions THEN RAISE EXCEPTION 'Invalid AI settlement'; END IF;
  UPDATE public.ai_usage_periods SET reserved_questions=GREATEST(0,reserved_questions-l.requested_questions),used_questions=used_questions+_successful,updated_at=now()
   WHERE user_id=uid AND period_start=l.period_start;
  UPDATE public.ai_usage_ledger SET successful_questions=_successful,status='settled',provider=_provider,model=_model,input_tokens=_input_tokens,output_tokens=_output_tokens,settled_at=now()
   WHERE id=_ledger_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.settle_ai_questions(uuid,integer,text,text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_storage_usage(_user_id uuid DEFAULT auth.uid())
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.assignment_attachments aa JOIN public.assignments a ON a.id=aa.assignment_id WHERE a.teacher_id=_user_id),0)
  + COALESCE((SELECT SUM(COALESCE(sf.size_bytes,0)) FROM public.submission_files sf JOIN public.submissions s ON s.id=sf.submission_id WHERE s.student_id=_user_id),0)
  + COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.announcement_attachments aa JOIN public.announcements an ON an.id=aa.announcement_id WHERE an.author_id=_user_id),0);
$$;
GRANT EXECUTE ON FUNCTION public.get_storage_usage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_feature(_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.plan_has_feature(auth.uid(),_feature);
$$;
GRANT EXECUTE ON FUNCTION public.user_has_feature(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_remove_branding(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.plan_has_feature(_user_id,'remove_branding');
$$;
GRANT EXECUTE ON FUNCTION public.plan_remove_branding(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_class_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim numeric;
BEGIN
  IF public.has_role(NEW.teacher_id,'admin') THEN RETURN NEW; END IF;
  lim:=public.plan_limit(NEW.teacher_id,'max_classes');
  IF lim>=0 AND (SELECT count(*) FROM public.classes c WHERE c.teacher_id=NEW.teacher_id AND c.archived=false AND c.id<>COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid))>=lim
    THEN RAISE EXCEPTION 'Your plan allows up to % classes',lim; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS classes_plan_limit ON public.classes;
CREATE TRIGGER classes_plan_limit BEFORE INSERT ON public.classes FOR EACH ROW EXECUTE FUNCTION public.enforce_class_limit();

CREATE OR REPLACE FUNCTION public.enforce_students_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim numeric;
BEGIN
  IF NEW.member_role<>'student' OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  lim:=public.plan_limit((SELECT c.teacher_id FROM public.classes c WHERE c.id=NEW.class_id),'max_students_per_class');
  IF lim>=0 AND (SELECT count(*) FROM public.class_members m WHERE m.class_id=NEW.class_id AND m.member_role='student')>=lim
    THEN RAISE EXCEPTION 'Your plan allows up to % students per class',lim; END IF;
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
  IF lim>=0 AND (SELECT count(*) FROM public.assignments a WHERE a.teacher_id=NEW.teacher_id AND a.created_at>=date_trunc('month',now()))>=lim
    THEN RAISE EXCEPTION 'Your plan has reached its monthly assignment limit';
  END IF;
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
  IF lim>=0 AND (SELECT count(*) FROM public.quizzes q WHERE q.teacher_id=NEW.teacher_id AND q.created_at>=date_trunc('month',now()))>=lim
    THEN RAISE EXCEPTION 'Your plan has reached its monthly quiz limit';
  END IF;
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
  IF lim>=0 AND (SELECT count(*) FROM public.question_bank q WHERE q.owner_id=NEW.owner_id)>=lim
    THEN RAISE EXCEPTION 'Your plan has reached its question bank limit';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS question_bank_plan_limit ON public.question_bank;
CREATE TRIGGER question_bank_plan_limit BEFORE INSERT ON public.question_bank FOR EACH ROW EXECUTE FUNCTION public.enforce_question_bank_limit();

CREATE OR REPLACE FUNCTION public.generate_due_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record; u record; k text; target timestamptz; window_label text;
BEGIN
  FOR r IN SELECT a.id,a.title,a.class_id,a.due_date FROM public.assignments a WHERE a.published=true AND a.archived=false AND a.due_date IS NOT NULL LOOP
    FOR u IN SELECT cm.student_id FROM public.class_members cm WHERE cm.class_id=r.class_id AND cm.member_role='student' LOOP
      IF EXISTS(SELECT 1 FROM public.notification_preferences np WHERE np.user_id=u.student_id AND np.deadline_reminders=false) THEN CONTINUE; END IF;
      target:=r.due_date;
      IF target > now() + interval '6 days' AND target <= now() + interval '7 days' THEN window_label:='7 days'; k:='7d';
      ELSIF target > now() + interval '2 days' AND target <= now() + interval '3 days' THEN window_label:='3 days'; k:='3d';
      ELSIF target > now() + interval '23 hours' AND target <= now() + interval '24 hours' THEN window_label:='1 day'; k:='1d';
      ELSIF target > now() - interval '1 hour' AND target <= now() THEN window_label:='due now'; k:='due';
      ELSIF target > now() - interval '25 hours' AND target <= now() - interval '23 hours' THEN window_label:='overdue'; k:='late';
      ELSE CONTINUE;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.notifications n WHERE n.user_id=u.student_id AND n.link='/assignments/'||r.id::text AND n.kind='deadline_'||k) THEN
        INSERT INTO public.notifications(user_id,title,body,link,kind) VALUES(u.student_id,
          CASE WHEN k='late' THEN 'Assignment overdue' ELSE 'Assignment reminder' END,
          CASE WHEN k='late' THEN r.title||' is overdue.' ELSE r.title||' is due in '||window_label||'.' END,
          '/assignments/'||r.id::text,'deadline_'||k);
        n:=n+1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.generate_due_reminders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_due_reminders() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.notify_class_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record;
BEGIN
  IF NEW.published IS TRUE AND (TG_OP='INSERT' OR OLD.published IS FALSE) THEN
    FOR m IN SELECT cm.student_id FROM public.class_members cm WHERE cm.class_id=NEW.class_id AND cm.member_role='student' LOOP
      IF NOT EXISTS(SELECT 1 FROM public.notification_preferences np WHERE np.user_id=m.student_id AND np.new_assignments=false) THEN
        INSERT INTO public.notifications(user_id,title,body,link,kind)
        VALUES(m.student_id,'New assignment',NEW.title,'/assignments/'||NEW.id::text,'assignment');
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS assignments_notify_students ON public.assignments;
CREATE TRIGGER assignments_notify_students AFTER INSERT OR UPDATE OF published ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.notify_class_assignment();

CREATE OR REPLACE FUNCTION public.notify_submission_teacher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid;
BEGIN
  SELECT teacher_id INTO tid FROM public.assignments WHERE id=NEW.assignment_id;
  IF tid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.notification_preferences np WHERE np.user_id=tid AND np.submissions=false) THEN
    INSERT INTO public.notifications(user_id,title,body,link,kind)
    VALUES(tid,'Student submission','A student submitted work.','/submissions/'||NEW.id::text,'submission');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS submissions_notify_teacher ON public.submissions;
CREATE TRIGGER submissions_notify_teacher AFTER INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.notify_submission_teacher();

CREATE OR REPLACE FUNCTION public.notify_grade_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.grade_released=true AND COALESCE(OLD.grade_released,false)=false THEN
    IF NOT EXISTS(SELECT 1 FROM public.notification_preferences np WHERE np.user_id=NEW.student_id AND np.grading=false) THEN
      INSERT INTO public.notifications(user_id,title,body,link,kind)
      VALUES(NEW.student_id,'Grade released','Your assignment grade is now available.','/assignments/'||NEW.assignment_id::text,'grade');
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS submissions_notify_grade_release ON public.submissions;
CREATE TRIGGER submissions_notify_grade_release AFTER UPDATE OF grade_released ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.notify_grade_release();

CREATE OR REPLACE FUNCTION public.get_progress_report(_student_id uuid,_class_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid()<>_student_id AND NOT public.has_role(auth.uid(),'admin') AND NOT public.has_role(auth.uid(),'teacher') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT jsonb_build_object(
    'assignments_total',count(a.id),
    'assignments_submitted',count(s.id) FILTER(WHERE s.id IS NOT NULL),
    'assignments_late',count(s.id) FILTER(WHERE s.is_late=true),
    'assignments_graded',count(s.id) FILTER(WHERE s.marks_awarded IS NOT NULL),
    'average_marks',ROUND(COALESCE(AVG(s.marks_awarded) FILTER(WHERE s.marks_awarded IS NOT NULL),0),2),
    'average_percentage',ROUND(COALESCE(AVG((s.marks_awarded/NULLIF(a.max_marks,0))*100) FILTER(WHERE s.marks_awarded IS NOT NULL),0),2)
  ) INTO result
  FROM public.assignments a
  LEFT JOIN public.submissions s ON s.assignment_id=a.id AND s.student_id=_student_id
  WHERE a.published=true AND a.archived=false
    AND (_class_id IS NULL OR a.class_id=_class_id);
  RETURN result;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_progress_report(uuid,uuid) TO authenticated;
