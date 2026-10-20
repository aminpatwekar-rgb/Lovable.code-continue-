-- INSERT ... RETURNING re-checks the SELECT policy. can_view_assignment() looks the row up in
-- public.assignments from a STABLE function, which cannot see the row being inserted, so creating
-- an assignment failed with "new row violates row-level security policy".
-- Let creators always read the assignments they created (no broader access).
DROP POLICY IF EXISTS assignments_read_own ON public.assignments;
CREATE POLICY assignments_read_own
  ON public.assignments
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());
