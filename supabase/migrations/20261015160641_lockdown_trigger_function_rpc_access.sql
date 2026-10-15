-- Trigger functions execute through table triggers and should not be callable as public RPCs.
REVOKE EXECUTE ON FUNCTION public.enforce_feature_on_calendar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_feature_on_quiz_settings() FROM PUBLIC, anon, authenticated;
