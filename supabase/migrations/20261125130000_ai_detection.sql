-- AI-writing detection: plan feature flag + saved scan results.
-- Available on ORBIT, NEXUS and APEX only (SPARK and CORE do not get it).
-- Institution members inherit access through current_plan_code(), as for every other feature.

UPDATE public.billing_plans
SET features = COALESCE(features, '{}'::jsonb)
  || jsonb_build_object('ai_detection', code IN ('orbit', 'nexus', 'apex'));

CREATE TABLE IF NOT EXISTS public.ai_detection_scans (
  submission_id uuid PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
  scanned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'too_short', 'no_text')),
  score integer CHECK (score BETWEEN 0 AND 100),
  risk text CHECK (risk IN ('low', 'medium', 'high')),
  word_count integer NOT NULL DEFAULT 0,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  flagged jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_detection_scans ENABLE ROW LEVEL SECURITY;

-- Only the class teacher (or an admin) can read a scan. Students never can.
-- There is deliberately no INSERT/UPDATE/DELETE policy: scans are written only by the
-- server function (service role), which checks the plan and the teacher's permission first.
DROP POLICY IF EXISTS ai_detection_scans_read ON public.ai_detection_scans;
CREATE POLICY ai_detection_scans_read ON public.ai_detection_scans
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE s.id = ai_detection_scans.submission_id
        AND public.is_class_teacher(a.class_id, auth.uid())
    )
  );
