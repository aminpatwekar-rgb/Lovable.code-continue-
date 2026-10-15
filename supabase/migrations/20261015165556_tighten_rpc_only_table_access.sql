-- Restrict internal RPC-only tables and synchronize the one-time admin bootstrap flag.
-- The join-link preview RPC remains intentionally callable by anon because public
-- invitation pages must validate a code before a user signs in.

REVOKE ALL PRIVILEGES ON TABLE public.class_co_teacher_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.institution_join_links FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.onyx_pre_migration_backup_20261015 FROM PUBLIC, anon, authenticated;

UPDATE public.platform_bootstrap AS pb
SET admin_initialized = true,
    initialized_by = admin.user_id,
    initialized_at = COALESCE(pb.initialized_at, now())
FROM (
  SELECT user_id FROM public.user_roles
  WHERE role = 'admin'
  ORDER BY user_id
  LIMIT 1
) AS admin
WHERE pb.id = true AND pb.admin_initialized = false;

COMMENT ON TABLE public.class_co_teacher_codes IS
  'Internal RPC-only secrets. Do not grant direct client table access; use guarded SECURITY DEFINER RPCs.';
COMMENT ON TABLE public.institution_join_links IS
  'Internal RPC-only join-link records. Client access must use guarded preview/join RPCs.';
COMMENT ON TABLE public.onyx_pre_migration_backup_20261015 IS
  'Private migration snapshot; never grant direct access to client roles.';
