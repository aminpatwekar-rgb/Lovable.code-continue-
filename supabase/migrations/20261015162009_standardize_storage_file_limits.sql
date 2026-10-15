-- Standardize per-file upload limits across existing ONYX storage buckets.
-- This updates bucket configuration only; it does not change tables, plan quotas,
-- or total storage entitlements.
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id IN (
  'submissions',
  'assignment-attachments',
  'class-resources',
  'announcement-attachments'
);
