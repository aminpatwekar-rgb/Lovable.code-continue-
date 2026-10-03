-- Align the visible ONYX pricing catalog with the current business model.
UPDATE public.billing_plans
SET name='Starter',
    monthly_price_inr=399,
    annual_price_inr=3990,
    limits='{"max_classes":3,"max_students_per_class":60,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":50,"question_bank_total":250,"storage_bytes":2147483648}'::jsonb
WHERE code='starter';

UPDATE public.billing_plans
SET name='Plus',
    monthly_price_inr=999,
    annual_price_inr=9990,
    limits='{"max_classes":10,"max_students_per_class":150,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":200,"question_bank_total":-1,"storage_bytes":10737418240}'::jsonb
WHERE code='professional';

UPDATE public.billing_plans
SET name='Pro',
    monthly_price_inr=1999,
    annual_price_inr=19990,
    limits='{"max_classes":-1,"max_students_per_class":400,"assignments_per_month":-1,"quizzes_per_month":-1,"ai_questions_per_month":500,"question_bank_total":-1,"storage_bytes":26843545600}'::jsonb
WHERE code='pro';
