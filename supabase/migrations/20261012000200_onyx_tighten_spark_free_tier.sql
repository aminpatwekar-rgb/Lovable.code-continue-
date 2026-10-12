-- Tighten SPARK (free) into a small pilot tier while preserving core academic workflows.
-- Manual assignment and quiz creation remain unlimited; only capacity and premium resources are reduced.

BEGIN;

UPDATE public.billing_plans
SET limits = jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    COALESCE(limits, '{}'::jsonb),
                    '{max_students_per_class}', '20'::jsonb, true
                  ),
                  '{ai_questions_per_month}', '3'::jsonb, true
                ),
                '{question_bank_total}', '20'::jsonb, true
              ),
              '{storage_bytes}', '262144000'::jsonb, true
            ),
    features = jsonb_set(COALESCE(features, '{}'::jsonb), '{rubrics}', 'false'::jsonb, true),
    updated_at = now()
WHERE code = 'free';

-- Preserve the product promise on every tier: no monthly cap on assignment creation
-- or manually authored quiz creation.
UPDATE public.billing_plans
SET limits = jsonb_set(
               jsonb_set(COALESCE(limits, '{}'::jsonb), '{assignments_per_month}', '-1'::jsonb, true),
               '{quizzes_per_month}', '-1'::jsonb, true
             ),
    updated_at = now()
WHERE code IN ('free', 'core', 'orbit', 'nexus', 'apex');

COMMIT;
