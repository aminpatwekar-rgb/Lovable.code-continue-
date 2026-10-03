CREATE OR REPLACE FUNCTION public.release_ai_questions(_ledger_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); l public.ai_usage_ledger%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.ai_usage_ledger WHERE id=_ledger_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND OR l.status <> 'reserved' THEN RAISE EXCEPTION 'Invalid AI reservation'; END IF;
  UPDATE public.ai_usage_periods SET reserved_questions=GREATEST(0,reserved_questions-l.requested_questions),updated_at=now()
   WHERE user_id=uid AND period_start=l.period_start;
  UPDATE public.ai_usage_ledger SET status='released',settled_at=now() WHERE id=_ledger_id;
END; $$;
REVOKE ALL ON FUNCTION public.release_ai_questions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_ai_questions(uuid) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.enforce_csv_import_feature(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.plan_has_feature((SELECT teacher_id FROM public.classes WHERE id=_class_id),'csv_import');
$$;
GRANT EXECUTE ON FUNCTION public.enforce_csv_import_feature(uuid) TO authenticated;