-- Increase storage allowances for CORE and ORBIT.
-- This migration changes only the two storage_bytes limits; all other plan
-- limits, features, prices, subscriptions, and existing stored files remain unchanged.

UPDATE public.billing_plans
SET limits = jsonb_set(limits, '{storage_bytes}', '2147483648'::jsonb, true),
    updated_at = now()
WHERE code = 'core';

UPDATE public.billing_plans
SET limits = jsonb_set(limits, '{storage_bytes}', '10737418240'::jsonb, true),
    updated_at = now()
WHERE code = 'orbit';
