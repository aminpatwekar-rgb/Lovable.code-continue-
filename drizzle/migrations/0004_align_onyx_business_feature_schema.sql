CREATE TABLE IF NOT EXISTS public.rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubrics TO authenticated;
GRANT ALL ON public.rubrics TO service_role;
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.rubric_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id uuid NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  max_points numeric NOT NULL DEFAULT 1 CHECK (max_points > 0),
  UNIQUE(rubric_id, position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_criteria TO authenticated;
GRANT ALL ON public.rubric_criteria TO service_role;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.rubric_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id uuid NOT NULL REFERENCES public.rubric_criteria(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  description text,
  points numeric NOT NULL DEFAULT 0 CHECK (points >= 0),
  UNIQUE(criterion_id, position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_levels TO authenticated;
GRANT ALL ON public.rubric_levels TO service_role;
ALTER TABLE public.rubric_levels ENABLE ROW LEVEL SECURITY;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_grades TO authenticated;
GRANT ALL ON public.rubric_grades TO service_role;
ALTER TABLE public.rubric_grades ENABLE ROW LEVEL SECURITY;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS attendance_class_date_idx ON public.attendance_records(class_id, attendance_date DESC);
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
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS calendar_events_class_time_idx ON public.calendar_events(class_id, starts_at);
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
GRANT SELECT ON public.billing_plans TO authenticated;
GRANT ALL ON public.billing_plans TO service_role;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
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
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS subscriptions_plan_idx ON public.subscriptions(plan_id);
CREATE TABLE IF NOT EXISTS public.ai_usage_periods (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  used_questions integer NOT NULL DEFAULT 0 CHECK(used_questions>=0),
  reserved_questions integer NOT NULL DEFAULT 0 CHECK(reserved_questions>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,period_start)
);
GRANT SELECT ON public.ai_usage_periods TO authenticated;
GRANT ALL ON public.ai_usage_periods TO service_role;
ALTER TABLE public.ai_usage_periods ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  requested_questions integer NOT NULL CHECK(requested_questions > 0),
  successful_questions integer NOT NULL DEFAULT 0 CHECK(successful_questions >= 0),
  status text NOT NULL CHECK(status IN ('reserved','settled','released','failed')),
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
GRANT SELECT ON public.ai_usage_ledger TO authenticated;
GRANT ALL ON public.ai_usage_ledger TO service_role;
ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ai_usage_ledger_user_period_idx ON public.ai_usage_ledger(user_id, period_start DESC);
DROP POLICY IF EXISTS rubrics_owner ON public.rubrics;
CREATE POLICY rubrics_owner ON public.rubrics FOR ALL TO authenticated USING (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS rubric_criteria_owner ON public.rubric_criteria;
CREATE POLICY rubric_criteria_owner ON public.rubric_criteria FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.rubrics r WHERE r.id=rubric_id AND (r.owner_id=auth.uid() OR public.has_role(auth.uid(),'admin')))) WITH CHECK (EXISTS (SELECT 1 FROM public.rubrics r WHERE r.id=rubric_id AND (r.owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
DROP POLICY IF EXISTS rubric_levels_owner ON public.rubric_levels;
CREATE POLICY rubric_levels_owner ON public.rubric_levels FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.rubric_criteria c JOIN public.rubrics r ON r.id=c.rubric_id WHERE c.id=criterion_id AND (r.owner_id=auth.uid() OR public.has_role(auth.uid(),'admin')))) WITH CHECK (EXISTS (SELECT 1 FROM public.rubric_criteria c JOIN public.rubrics r ON r.id=c.rubric_id WHERE c.id=criterion_id AND (r.owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
DROP POLICY IF EXISTS rubric_grades_access ON public.rubric_grades;
CREATE POLICY rubric_grades_access ON public.rubric_grades FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR graded_by=auth.uid() OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id=submission_id AND s.student_id=auth.uid() AND s.grade_released=true)) WITH CHECK (graded_by=auth.uid() AND (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.submissions s JOIN public.assignments a ON a.id=s.assignment_id WHERE s.id=submission_id AND a.teacher_id=auth.uid())));
DROP POLICY IF EXISTS attendance_read ON public.attendance_records;
CREATE POLICY attendance_read ON public.attendance_records FOR SELECT TO authenticated USING (student_id=auth.uid() OR public.is_class_teacher(class_id,auth.uid()) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS attendance_write ON public.attendance_records;
CREATE POLICY attendance_write ON public.attendance_records FOR ALL TO authenticated USING (public.is_class_teacher(class_id,auth.uid()) OR public.has_role(auth.uid(),'admin')) WITH CHECK (marked_by=auth.uid() AND (public.is_class_teacher(class_id,auth.uid()) OR public.has_role(auth.uid(),'admin')));
DROP POLICY IF EXISTS notification_preferences_self ON public.notification_preferences;
CREATE POLICY notification_preferences_self ON public.notification_preferences FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS calendar_read ON public.calendar_events;
CREATE POLICY calendar_read ON public.calendar_events FOR SELECT TO authenticated USING (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR (class_id IS NOT NULL AND public.is_class_member(class_id,auth.uid())) OR (class_id IS NOT NULL AND public.is_class_teacher(class_id,auth.uid())));
DROP POLICY IF EXISTS calendar_write ON public.calendar_events;
CREATE POLICY calendar_write ON public.calendar_events FOR ALL TO authenticated USING (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS billing_plans_read ON public.billing_plans;
CREATE POLICY billing_plans_read ON public.billing_plans FOR SELECT TO authenticated USING (active=true);
DROP POLICY IF EXISTS subscriptions_self_read ON public.subscriptions;
CREATE POLICY subscriptions_self_read ON public.subscriptions FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS ai_usage_self ON public.ai_usage_periods;
CREATE POLICY ai_usage_self ON public.ai_usage_periods FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS ai_ledger_self ON public.ai_usage_ledger;
CREATE POLICY ai_ledger_self ON public.ai_usage_ledger FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.current_plan_code(_user_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT COALESCE((SELECT p.code FROM public.subscriptions s JOIN public.billing_plans p ON p.id=s.plan_id WHERE s.user_id=_user_id AND s.status IN ('trialing','active') AND (s.expires_at IS NULL OR s.expires_at>now()) LIMIT 1),'free'); $$;
CREATE OR REPLACE FUNCTION public.plan_limit(_user_id uuid,_key text) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT CASE WHEN public.has_role(_user_id,'admin') THEN -1::numeric ELSE COALESCE(((p.limits->_key)::text)::numeric,0) END FROM public.billing_plans p WHERE p.code=public.current_plan_code(_user_id); $$;
CREATE OR REPLACE FUNCTION public.plan_has_feature(_user_id uuid,_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT CASE WHEN public.has_role(_user_id,'admin') THEN true ELSE COALESCE((p.features->>_key)::boolean,false) END FROM public.billing_plans p WHERE p.code=public.current_plan_code(_user_id); $$;
CREATE OR REPLACE FUNCTION public.user_has_feature(_feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.plan_has_feature(auth.uid(),_feature); $$;
CREATE OR REPLACE FUNCTION public.plan_remove_branding(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.plan_has_feature(_user_id,'remove_branding'); $$;
GRANT EXECUTE ON FUNCTION public.current_plan_code(uuid), public.plan_limit(uuid,text), public.plan_has_feature(uuid,text), public.user_has_feature(text), public.plan_remove_branding(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.reserve_ai_questions(_requested integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=auth.uid(); period date:=date_trunc('month',now())::date; lim integer; avail integer; lid uuid; BEGIN IF uid IS NULL OR _requested<1 OR _requested>100 THEN RAISE EXCEPTION 'Invalid AI request'; END IF; lim:=public.plan_limit(uid,'ai_questions_per_month'); INSERT INTO public.ai_usage_periods(user_id,period_start) VALUES(uid,period) ON CONFLICT DO NOTHING; SELECT GREATEST(0,lim-used_questions-reserved_questions) INTO avail FROM public.ai_usage_periods WHERE user_id=uid AND period_start=period FOR UPDATE; IF lim>=0 AND avail<_requested THEN RAISE EXCEPTION 'AI monthly limit reached'; END IF; UPDATE public.ai_usage_periods SET reserved_questions=reserved_questions+_requested,updated_at=now() WHERE user_id=uid AND period_start=period; INSERT INTO public.ai_usage_ledger(user_id,period_start,requested_questions,status) VALUES(uid,period,_requested,'reserved') RETURNING id INTO lid; RETURN lid; END; $$;
CREATE OR REPLACE FUNCTION public.settle_ai_questions(_ledger_id uuid,_successful integer,_provider text,_model text,_input_tokens integer,_output_tokens integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=auth.uid(); l public.ai_usage_ledger%ROWTYPE; BEGIN SELECT * INTO l FROM public.ai_usage_ledger WHERE id=_ledger_id AND user_id=uid FOR UPDATE; IF NOT FOUND OR l.status<>'reserved' THEN RAISE EXCEPTION 'Invalid AI reservation'; END IF; IF _successful<0 OR _successful>l.requested_questions THEN RAISE EXCEPTION 'Invalid AI settlement'; END IF; UPDATE public.ai_usage_periods SET reserved_questions=GREATEST(0,reserved_questions-l.requested_questions),used_questions=used_questions+_successful,updated_at=now() WHERE user_id=uid AND period_start=l.period_start; UPDATE public.ai_usage_ledger SET successful_questions=_successful,status='settled',provider=_provider,model=_model,input_tokens=_input_tokens,output_tokens=_output_tokens,settled_at=now() WHERE id=_ledger_id; END; $$;
CREATE OR REPLACE FUNCTION public.release_ai_questions(_ledger_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=auth.uid(); l public.ai_usage_ledger%ROWTYPE; BEGIN SELECT * INTO l FROM public.ai_usage_ledger WHERE id=_ledger_id AND user_id=uid FOR UPDATE; IF NOT FOUND OR l.status<>'reserved' THEN RAISE EXCEPTION 'Invalid AI reservation'; END IF; UPDATE public.ai_usage_periods SET reserved_questions=GREATEST(0,reserved_questions-l.requested_questions),updated_at=now() WHERE user_id=uid AND period_start=l.period_start; UPDATE public.ai_usage_ledger SET status='released',settled_at=now() WHERE id=_ledger_id; END; $$;
REVOKE ALL ON FUNCTION public.reserve_ai_questions(integer), public.settle_ai_questions(uuid,integer,text,text,integer,integer), public.release_ai_questions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_questions(integer), public.settle_ai_questions(uuid,integer,text,text,integer,integer), public.release_ai_questions(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_storage_usage(_user_id uuid DEFAULT auth.uid()) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.assignment_attachments aa JOIN public.assignments a ON a.id=aa.assignment_id WHERE a.teacher_id=_user_id),0)+COALESCE((SELECT SUM(COALESCE(sf.size_bytes,0)) FROM public.submission_files sf JOIN public.submissions s ON s.id=sf.submission_id WHERE s.student_id=_user_id),0)+COALESCE((SELECT SUM(COALESCE(aa.size_bytes,0)) FROM public.announcement_attachments aa JOIN public.announcements an ON an.id=aa.announcement_id WHERE an.author_id=_user_id),0)+COALESCE((SELECT SUM(COALESCE(cr.size_bytes,0)) FROM public.class_resources cr WHERE cr.uploader_id=_user_id),0); $$;
CREATE OR REPLACE FUNCTION public.assert_storage_available(_additional_bytes bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=auth.uid(); lim bigint; used bigint; BEGIN IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF; IF _additional_bytes<0 OR _additional_bytes>524288000 THEN RAISE EXCEPTION 'Invalid file size'; END IF; lim:=public.plan_limit(uid,'storage_bytes'); used:=public.get_storage_usage(uid); IF lim>=0 AND used+_additional_bytes>lim THEN RAISE EXCEPTION 'Storage limit reached'; END IF; RETURN true; END; $$;
REVOKE ALL ON FUNCTION public.assert_storage_available(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_storage_usage(uuid), public.assert_storage_available(bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.enforce_csv_import_feature(_class_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_role(auth.uid(),'admin') OR public.plan_has_feature((SELECT teacher_id FROM public.classes WHERE id=_class_id),'csv_import'); $$;
GRANT EXECUTE ON FUNCTION public.enforce_csv_import_feature(uuid) TO authenticated;