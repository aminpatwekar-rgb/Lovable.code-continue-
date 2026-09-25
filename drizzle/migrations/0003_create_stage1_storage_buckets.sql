-- Stage 1: create the private storage buckets used by announcement
-- attachments and class resources. The metadata/RLS tables and object
-- policies are defined in migration 0000.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('announcement-attachments', 'announcement-attachments', false),
  ('class-resources', 'class-resources', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
