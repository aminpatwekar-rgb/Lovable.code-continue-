-- Simplify the pre-launch catalog: retire the "Plus" tier (code 'professional').
-- Catalog becomes Free / Starter / Pro. The row is kept (not deleted) so existing
-- foreign keys and history stay valid; it is simply hidden from the plan list.

-- Move anyone currently on Plus to Pro so they keep the features they had.
UPDATE public.subscriptions
SET plan_id = (SELECT id FROM public.billing_plans WHERE code = 'pro')
WHERE plan_id = (SELECT id FROM public.billing_plans WHERE code = 'professional');

UPDATE public.billing_plans
SET active = false
WHERE code = 'professional';
