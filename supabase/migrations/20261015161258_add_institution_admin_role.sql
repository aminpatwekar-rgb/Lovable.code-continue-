-- Add a tenant-scoped institution administrator role.
-- Keep this enum-only migration separate so PostgreSQL commits the new enum
-- value before later migrations reference it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'institution_admin';
