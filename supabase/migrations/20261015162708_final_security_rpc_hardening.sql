-- Trigger/scheduler-only SECURITY DEFINER functions must not be callable as public RPCs.
REVOKE EXECUTE ON FUNCTION public.validate_rubric_grade() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_due_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_reminders() TO service_role;
