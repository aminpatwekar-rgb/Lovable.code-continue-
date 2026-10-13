-- Institution departments are tenant-scoped. This migration only adds schema and
-- row-level access rules; it does not modify existing class, student, or storage data.
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_name_length_check
    CHECK (length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT departments_code_length_check
    CHECK (code IS NULL OR length(trim(code)) <= 40),
  CONSTRAINT departments_description_length_check
    CHECK (description IS NULL OR length(trim(description)) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_institution_name_unique
  ON public.departments (institution_id, lower(trim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS departments_institution_code_unique
  ON public.departments (institution_id, lower(trim(code)))
  WHERE code IS NOT NULL AND trim(code) <> '';

CREATE INDEX IF NOT EXISTS departments_institution_id_idx
  ON public.departments (institution_id);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;

DROP POLICY IF EXISTS departments_select_own_institution ON public.departments;
CREATE POLICY departments_select_own_institution
  ON public.departments
  FOR SELECT
  TO authenticated
  USING (public.is_institution_admin(institution_id));

DROP POLICY IF EXISTS departments_insert_own_institution ON public.departments;
CREATE POLICY departments_insert_own_institution
  ON public.departments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_institution_admin(institution_id)
    AND (created_by IS NULL OR created_by = auth.uid())
  );

DROP TRIGGER IF EXISTS departments_updated ON public.departments;
CREATE TRIGGER departments_updated
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
