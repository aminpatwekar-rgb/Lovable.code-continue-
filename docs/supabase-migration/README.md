# ONYX Supabase Migration — Safe Start

## Safety rules
- This branch is based on `main`; do not merge it automatically.
- Keep Lovable Cloud and the current production app running during migration.
- Do not change the Supabase production schema, data, storage buckets, or quotas during the audit phase.
- Never copy service-role keys, database passwords, or other secrets into source control.
- Do not switch production environment variables until the migration is verified and explicitly approved.

## Current audit findings (2026-10-12)
- Application: TanStack Start / React / TypeScript / Vite.
- Dependencies include `@supabase/supabase-js` and `@lovable.dev/cloud-auth-js`.
- The Supabase client source currently reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, and uses Lovable preview authentication storage. This is not yet proof that every feature works outside Lovable.
- The target Supabase project already has ONYX-style tables, RLS enabled on the inspected public tables, and existing data (including classes and badges). Treat it as an existing environment, not an empty destination.
- Supabase security advisor reports warnings about SECURITY DEFINER function execution grants, a mutable function search_path, and disabled leaked-password protection. Review each finding before production cutover; do not blindly revoke grants because some functions may be required by app flows.
- Lovable source README describes private file uploads, role-based access, assignments/submissions, quizzes, resources, announcements, discussions, notifications, projects and analytics. Each must be verified in code and against the target project.

## Migration phases

### Phase 0 — Read-only inventory
1. Inventory app routes, data services, server functions, edge functions, auth providers, scheduled jobs, and environment variables.
2. Map each feature to its current Lovable database/auth/storage dependency and its target Supabase equivalent.
3. Compare table definitions, enums, constraints, triggers, RPCs, RLS policies and storage policies.
4. Identify which source data can be exported safely. Do not assume Supabase Auth users can be recreated with the same IDs/passwords without a supported export/import process.

### Phase 1 — Isolated branch implementation
1. Remove Lovable-only runtime dependencies only after each usage has been located and replaced.
2. Use a normal Supabase client configuration for local/hosted environments; keep only publishable keys in browser code.
3. Keep privileged service-role credentials exclusively server-side.
4. Implement storage uploads using private buckets and scoped policies; use signed URLs for downloads.
5. Keep current quotas and schema unchanged until the full migration design is approved.

### Phase 2 — Data and auth migration
1. Back up/export source data and files, record row counts and checksums where possible.
2. Map source tables to target tables and preserve IDs/foreign-key order where safe.
3. Migrate Auth identities using a supported procedure; verify sign-in/reset flows before switching.
4. Copy files separately and verify metadata paths and file access.
5. Never expose private student submissions or use public buckets as a shortcut.

### Phase 3 — Verification and cutover
Test student, teacher, admin and super-admin permissions; class join codes; assignments and attachments; handwritten/typed submissions; grading/rubrics; quizzes and attempts; resources; announcements; discussions; attendance; notifications; analytics; and plan/entitlement checks.
Run build/lint and automated smoke tests. Cut over only after user approval and a rollback plan.

## Explicitly out of scope for this initial commit
- No database migrations or SQL executed against Supabase.
- No table, RLS, function, bucket, or storage-quota changes.
- No production environment-variable changes.
- No deletion or modification of Lovable Cloud data.
- No claim that the full migration is complete.
