-- ONYX five-tier pricing and fair-use quotas.
-- Core academic workflows are intentionally unlimited on every tier. Commercial
-- limits apply to class capacity, storage, saved question-bank size, and AI generation.
-- Existing plan rows are reused where possible so subscription foreign keys remain valid.

BEGIN;

UPDATE public.billing_plans
SET name = 'SPARK',
    monthly_price_inr = 0,
    annual_price_inr = 0,
    active = true,
    limits = '{"max_classes":1,"max_students_per_class":30,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":10,"question_bank_total":50,"storage_bytes":524288000}'::jsonb,
    features = '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":false,"calendar":false,"notifications":true,"advanced_analytics":false,"csv_import":false,"csv_export":true,"quiz_randomization":false,"time_attempt_controls":false,"lockdown":false,"progress_reports":false,"remove_branding":false}'::jsonb,
    updated_at = now()
WHERE code = 'free';

-- Reuse existing Starter row so existing subscribers retain a valid plan reference.
UPDATE public.billing_plans
SET code = 'core',
    name = 'CORE',
    monthly_price_inr = 499,
    annual_price_inr = 4990,
    active = true,
    limits = '{"max_classes":3,"max_students_per_class":60,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":75,"question_bank_total":250,"storage_bytes":2147483648}'::jsonb,
    features = '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":false,"csv_import":false,"csv_export":true,"quiz_randomization":false,"time_attempt_controls":false,"lockdown":false,"progress_reports":false,"remove_branding":false}'::jsonb,
    updated_at = now()
WHERE code = 'starter';

-- Reuse the retired Professional row for ORBIT, keeping its subscription FK intact.
UPDATE public.billing_plans
SET code = 'orbit',
    name = 'ORBIT',
    monthly_price_inr = 999,
    annual_price_inr = 9990,
    active = true,
    limits = '{"max_classes":10,"max_students_per_class":150,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":250,"question_bank_total":-1,"storage_bytes":10737418240}'::jsonb,
    features = '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":false,"csv_import":false,"csv_export":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"progress_reports":false,"remove_branding":false}'::jsonb,
    updated_at = now()
WHERE code = 'professional';

-- Reuse the previous Pro row for NEXUS.
UPDATE public.billing_plans
SET code = 'nexus',
    name = 'NEXUS',
    monthly_price_inr = 2999,
    annual_price_inr = 29990,
    active = true,
    limits = '{"max_classes":30,"max_students_per_class":400,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":1000,"question_bank_total":-1,"storage_bytes":53687091200}'::jsonb,
    features = '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":true,"csv_import":true,"csv_export":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"progress_reports":true,"remove_branding":false}'::jsonb,
    updated_at = now()
WHERE code = 'pro';

-- APEX is an institution-level contract tier. Its AI allowance is a safe default
-- that can be customized for a signed agreement; unlike core workflows, AI is not unlimited.
INSERT INTO public.billing_plans(code, name, monthly_price_inr, annual_price_inr, active, limits, features)
VALUES (
  'apex',
  'APEX',
  0,
  0,
  true,
  '{"max_classes":-1,"max_students_per_class":-1,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":2000,"question_bank_total":-1,"storage_bytes":107374182400}'::jsonb,
  '{"question_bank":true,"advanced_grading":true,"rubrics":true,"attendance":true,"calendar":true,"notifications":true,"advanced_analytics":true,"csv_import":true,"csv_export":true,"quiz_randomization":true,"time_attempt_controls":true,"lockdown":true,"progress_reports":true,"remove_branding":true}'::jsonb
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    monthly_price_inr = EXCLUDED.monthly_price_inr,
    annual_price_inr = EXCLUDED.annual_price_inr,
    active = EXCLUDED.active,
    limits = EXCLUDED.limits,
    features = EXCLUDED.features,
    updated_at = now();

-- Defense in depth: all five plans must always permit unlimited assignment creation
-- and unlimited manually authored quiz creation. AI-generated questions remain metered
-- independently through ai_questions_per_month / the AI usage ledger.
UPDATE public.billing_plans
SET limits = jsonb_set(
               jsonb_set(limits, '{assignments_per_month}', '-1'::jsonb, true),
               '{quizzes_per_month}', '-1'::jsonb, true
             ),
    updated_at = now()
WHERE code IN ('free', 'core', 'orbit', 'nexus', 'apex');

COMMIT;
