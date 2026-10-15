-- Restore the current ONYX catalog after the earlier legacy five-tier migration.
-- Final values keep SPARK free, CORE ₹499, ORBIT ₹2,499, NEXUS ₹2,999 and APEX bespoke.
-- Current ONYX catalog: assignments and manual quizzes remain unlimited.
UPDATE public.billing_plans
SET name='SPARK', monthly_price_inr=0, annual_price_inr=0, active=true,
    limits='{"max_classes":1,"max_students_per_class":30,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":10,"question_bank_total":-1,"storage_bytes":524288000}'::jsonb,
    features='{"question_bank":true,"advanced_grading":false,"rubrics":false,"attendance":false,"calendar":false,"notifications":true,"advanced_analytics":false,"csv_import":false,"csv_export":true,"quiz_randomization":false,"time_attempt_controls":false,"lockdown":false,"progress_reports":false,"remove_branding":false}'::jsonb,
    updated_at=now()
WHERE code='free';

DELETE FROM public.billing_plans WHERE code IN ('starter','professional','pro');

INSERT INTO public.billing_plans
  (code,name,monthly_price_inr,annual_price_inr,active,limits,features)
VALUES
  ('core','CORE',499,4990,true,
   '{"max_classes":3,"max_students_per_class":60,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":50,"question_bank_total":-1,"storage_bytes":2147483648}'::jsonb,
   '{"question_bank":true,"advanced_grading":false,"rubrics":false,"attendance":false,"calendar":false,"notifications":true,"advanced_analytics":false,"csv_import":false,"csv_export":true,"quiz_randomization":false,"time_attempt_controls":false,"lockdown":false,"progress_reports":false,"remove_branding":false}'::jsonb),
  ('orbit','ORBIT',2499,24990,true,
   '{"max_classes":8,"max_students_per_class":150,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":200,"question_bank_total":-1,"storage_bytes":10737418240}'::jsonb,
   '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":true,"csv_import":false,"csv_export":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"progress_reports":true,"remove_branding":false}'::jsonb),
  ('nexus','NEXUS',2999,29990,true,
   '{"max_classes":-1,"max_students_per_class":400,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":500,"question_bank_total":-1,"storage_bytes":32212254720}'::jsonb,
   '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":true,"csv_import":true,"csv_export":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"progress_reports":true,"remove_branding":true}'::jsonb),
  ('apex','APEX',0,0,true,
   '{"max_classes":-1,"max_students_per_class":-1,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":-1,"question_bank_total":-1,"storage_bytes":-1}'::jsonb,
   '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":true,"csv_import":true,"csv_export":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"progress_reports":true,"remove_branding":true}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name, monthly_price_inr=excluded.monthly_price_inr,
  annual_price_inr=excluded.annual_price_inr, active=excluded.active,
  limits=excluded.limits, features=excluded.features, updated_at=now();
