-- Allow users to permanently dismiss their own ONYX notifications.
-- Keep this narrowly scoped to the authenticated user's rows.
GRANT DELETE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;

CREATE POLICY notifications_delete_own
ON public.notifications
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
