-- Complete the first five-tier pricing pass with server-side corrections.
-- Keeps core classroom workflows free and removes stale storage assumptions.

BEGIN;

-- Storage must use the signed-in user's plan limit (plan_limit expects user id).
-- The existing assertion is retained, with its 500 MB per-file safety ceiling.
CREATE OR REPLACE FUNCTION public.assert_storage_available(_additional_bytes bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  uid uuid := auth.uid();
  lim bigint;
  used bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _additional_bytes < 0 OR _additional_bytes > 524288000 THEN
    RAISE EXCEPTION 'Invalid file size. A single file cannot exceed 500 MB.';
  END IF;
  lim := public.plan_limit(uid, 'storage_bytes');
  used := public.get_storage_usage(uid);
  IF lim >= 0 AND used + _additional_bytes > lim THEN
    RAISE EXCEPTION 'Cloud storage limit reached. Current usage: % bytes; plan limit: % bytes.', used, lim;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_storage_available(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_storage_available(bigint) TO authenticated;

-- Unlimited assignment and manual quiz creation are invariant plan rules.
UPDATE public.billing_plans
SET limits = jsonb_set(
  jsonb_set(COALESCE(limits, '{}'::jsonb), '{assignments_per_month}', '-1'::jsonb, true),
  '{quizzes_per_month}', '-1'::jsonb, true
),
updated_at = now()
WHERE code IN ('free', 'core', 'orbit', 'nexus', 'apex');

COMMIT;
