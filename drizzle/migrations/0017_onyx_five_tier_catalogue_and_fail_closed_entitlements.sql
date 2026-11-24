-- 1. Catalogue: move old codes to new codes, preserving row ids / subscription FKs.
DO $$
DECLARE m record; old_id uuid; new_id uuid;
BEGIN
  FOR m IN SELECT * FROM (VALUES ('free','spark'),('starter','core'),('pro','nexus'),('professional','orbit')) v(old_code,new_code) LOOP
    SELECT id INTO old_id FROM public.billing_plans WHERE code = m.old_code;
    CONTINUE WHEN old_id IS NULL;
    SELECT id INTO new_id FROM public.billing_plans WHERE code = m.new_code;
    IF new_id IS NULL THEN
      UPDATE public.billing_plans SET code = m.new_code, updated_at = now() WHERE id = old_id;
    ELSE
      UPDATE public.subscriptions SET plan_id = new_id, updated_at = now() WHERE plan_id = old_id;
      DELETE FROM public.billing_plans WHERE id = old_id;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.billing_plans(code, name, monthly_price_inr, annual_price_inr, active, limits, features) VALUES
('spark','SPARK',0,0,true,
 '{"max_classes":1,"max_students_per_class":30,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":10,"question_bank_total":50,"storage_bytes":524288000}',
 '{"question_bank":true,"notifications":true,"csv_export":true,"advanced_grading":false,"rubrics":false,"attendance":false,"calendar":false,"quiz_randomization":false,"time_attempt_controls":false,"lockdown":false,"advanced_analytics":false,"progress_reports":false,"csv_import":false,"remove_branding":false}'),
('core','CORE',499,NULL,true,
 '{"max_classes":3,"max_students_per_class":60,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":50,"question_bank_total":200,"storage_bytes":1073741824}',
 '{"question_bank":true,"notifications":true,"csv_export":true,"advanced_grading":false,"rubrics":false,"attendance":false,"calendar":false,"quiz_randomization":false,"time_attempt_controls":false,"lockdown":false,"advanced_analytics":false,"progress_reports":false,"csv_import":false,"remove_branding":false}'),
('orbit','ORBIT',2499,NULL,true,
 '{"max_classes":10,"max_students_per_class":100,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":200,"question_bank_total":-1,"storage_bytes":8589934592}',
 '{"question_bank":true,"notifications":true,"csv_export":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"advanced_analytics":false,"progress_reports":false,"csv_import":false,"remove_branding":false}'),
('nexus','NEXUS',9999,NULL,true,
 '{"max_classes":30,"max_students_per_class":100,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":1000,"question_bank_total":-1,"storage_bytes":32212254720}',
 '{"question_bank":true,"notifications":true,"csv_export":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"advanced_analytics":true,"progress_reports":true,"csv_import":true,"remove_branding":false}'),
('apex','APEX',0,NULL,true,
 '{"max_classes":-1,"max_students_per_class":-1,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":2000,"question_bank_total":-1,"storage_bytes":107374182400}',
 '{"question_bank":true,"notifications":true,"csv_export":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"advanced_analytics":true,"progress_reports":true,"csv_import":true,"remove_branding":true}')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, monthly_price_inr=EXCLUDED.monthly_price_inr,
  annual_price_inr=EXCLUDED.annual_price_inr, active=true, limits=EXCLUDED.limits, features=EXCLUDED.features, updated_at=now();

-- Any leftover non-tier plan row: repoint subscriptions to SPARK, then remove it.
UPDATE public.subscriptions SET plan_id=(SELECT id FROM public.billing_plans WHERE code='spark'), status='expired', updated_at=now()
 WHERE plan_id IN (SELECT id FROM public.billing_plans WHERE code NOT IN ('spark','core','orbit','nexus','apex'));
DELETE FROM public.billing_plans WHERE code NOT IN ('spark','core','orbit','nexus','apex');

-- 2. Fail-closed plan resolution: only active, unexpired subscriptions count.
CREATE OR REPLACE FUNCTION public.current_plan_code(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((
    SELECT p.code FROM public.subscriptions s JOIN public.billing_plans p ON p.id=s.plan_id
    WHERE s.user_id=_user_id AND s.status='active' AND p.active
      AND (s.expires_at IS NULL OR s.expires_at>now())
    ORDER BY s.updated_at DESC LIMIT 1), 'spark');
$$;

CREATE OR REPLACE FUNCTION public.plan_limit(_user_id uuid, _key text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN 0::numeric
    WHEN public.has_role(_user_id,'admin') THEN -1::numeric
    ELSE COALESCE(
      (SELECT ((p.limits->>_key))::numeric FROM public.billing_plans p WHERE p.code=public.current_plan_code(_user_id)),
      (SELECT ((p.limits->>_key))::numeric FROM public.billing_plans p WHERE p.code='spark'),
      0::numeric)
  END;
$$;

CREATE OR REPLACE FUNCTION public.plan_has_feature(_user_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.has_role(_user_id,'admin') THEN true
    ELSE COALESCE(
      (SELECT (p.features->>_key)::boolean FROM public.billing_plans p WHERE p.code=public.current_plan_code(_user_id)),
      false)
  END;
$$;

-- Caller-scoped helpers (derive identity from auth.uid()).
CREATE OR REPLACE FUNCTION public.user_has_feature(_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.plan_has_feature(auth.uid(), _feature);
$$;

CREATE OR REPLACE FUNCTION public.plan_remove_branding(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN public.plan_has_feature(auth.uid(),'remove_branding') ELSE false END;
$$;

-- Feature of a class owner's plan, answered only to people in that class (or admins).
CREATE OR REPLACE FUNCTION public.class_has_feature(_class_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN NOT (public.has_role(auth.uid(),'admin') OR public.is_class_member(_class_id, auth.uid()) OR public.is_class_teacher(_class_id, auth.uid())) THEN false
    ELSE public.plan_has_feature((SELECT teacher_id FROM public.classes WHERE id=_class_id), _key)
  END;
$$;

-- 3. Calendar read policy: use the caller-checked helper instead of arbitrary-user lookup.
DROP POLICY IF EXISTS calendar_read ON public.calendar_events;
CREATE POLICY calendar_read ON public.calendar_events FOR SELECT TO authenticated USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id=calendar_events.class_id AND c.institution_id IS NOT NULL AND public.is_institution_admin(c.institution_id))
  OR (class_id IS NOT NULL AND (public.is_class_member(class_id, auth.uid()) OR public.is_class_teacher(class_id, auth.uid()))
      AND public.class_has_feature(class_id,'calendar'))
);

-- 4. Rubric grading requires the class owner's plan to include rubrics.
CREATE OR REPLACE FUNCTION public.enforce_feature_on_rubric_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  SELECT c.teacher_id INTO owner FROM public.submissions s JOIN public.assignments a ON a.id=s.assignment_id JOIN public.classes c ON c.id=a.class_id WHERE s.id=NEW.submission_id;
  IF NOT public.plan_has_feature(owner,'rubrics') THEN
    RAISE EXCEPTION 'Rubric grading is not included in your current plan';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_feature_on_rubric_grade ON public.rubric_grades;
CREATE TRIGGER enforce_feature_on_rubric_grade BEFORE INSERT OR UPDATE ON public.rubric_grades
  FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_on_rubric_grade();

-- 5. Lock down arbitrary-user entitlement lookups.
REVOKE ALL ON FUNCTION public.current_plan_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_limit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_has_feature(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_storage_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_plan_code(uuid), public.plan_limit(uuid, text), public.plan_has_feature(uuid, text), public.get_storage_usage(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.user_has_feature(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plan_remove_branding(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.class_has_feature(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_csv_import_feature(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_feature(text), public.plan_remove_branding(uuid), public.class_has_feature(uuid, text), public.enforce_csv_import_feature(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_feature_on_rubric_grade() FROM PUBLIC, anon, authenticated;