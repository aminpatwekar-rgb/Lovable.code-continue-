# ONYX Supabase Migration — Safe Start

## Non-negotiable safety rules
- All migration work stays on `migration/supabase-safe-start`; do not merge to `main` automatically.
- Keep the current Lovable Cloud deployment and its backend running.
- Do not change any existing Supabase schema, data, Auth users, storage buckets, policies, or storage quotas without explicit approval.
- Never put service-role keys, database passwords, or private credentials in source control.
- Do not change production environment variables or cut traffic over until the migration is verified and the user explicitly approves.

## Current audit findings (2026-10-12)
- Application: TanStack Start / React / TypeScript / Vite.
- Dependencies include `@supabase/supabase-js` and `@lovable.dev/cloud-auth-js`; Vite currently relies on `@lovable.dev/vite-tanstack-config`, which bundles important build/runtime configuration and must be replaced carefully before leaving Lovable tooling.
- The Supabase client reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, and uses a Lovable-preview auth-storage adapter. Outside Lovable preview domains, that adapter falls back to browser localStorage, but the full application has not yet been validated outside the current platform.
- **Project identity is a migration blocker:** the tracked `.env` on `main` references project ref `pvnwklrknyqqugikgiwr`, while the Supabase project currently available for read-only inspection is `nhhrtzoztffqvcvqxapl`. Access to the first project was denied by the connected Supabase integration. Do not silently switch the app to the second project; confirm which project is the intended destination and obtain access before changing environment configuration.
- The inspected Supabase project is active and already contains 27 public tables, 27 public functions, 97 public policies, and 2 storage buckets. Its migration-history listing is empty. Treat it as an existing production-like environment, not an empty destination. No SQL changes have been run.
- Inspected tables have RLS enabled, but table-by-table policy and schema compatibility has not been fully verified.
- The Supabase security advisor reports warnings involving SECURITY DEFINER function grants, a mutable function search_path, and leaked-password protection. Review each finding before cutover; do not blindly revoke grants because app flows may depend on functions.
- The repository's README describes auth/roles, classes, assignments and submissions, private uploads, quizzes, resources, announcements, discussions, attendance, notifications, projects and analytics. These require code-level dependency mapping and end-to-end testing.

## Work completed safely
- Created this isolated branch and a draft pull request; nothing has been merged to `main`.
- Removed the tracked `.env` from this branch only, without opening or copying its contents into the migration work.
- Added ignore rules for `.env` and `.env.*` while explicitly allowing `.env.example`.
- No production database, Auth, storage, quotas, or Lovable Cloud settings have been changed.

## Migration phases

### Phase 0 — Read-only inventory (in progress)
1. Inventory routes, data services, server functions, edge functions, auth providers, scheduled jobs, and environment variables.
2. Map each feature to its current auth/database/storage dependency and target Supabase equivalent.
3. Compare table definitions, enums, constraints, triggers, RPCs, RLS policies, and storage policies.
4. Confirm the intended Supabase project before any environment change.
5. Determine how source Auth identities, rows, and uploaded files can be exported safely.

### Phase 1 — Isolated branch implementation
1. Replace Lovable-only build/runtime dependencies only after their full behavior is understood and replaced.
2. Use normal Supabase configuration for local/hosted environments; keep publishable keys in browser code only.
3. Keep privileged credentials exclusively server-side.
4. Preserve private file access with scoped storage policies and signed URLs.
5. Keep schema and storage quotas unchanged unless a separate approved plan says otherwise.

### Phase 2 — Data and Auth migration
1. Back up/export source data and files; record row counts and checksums where possible.
2. Map tables and preserve IDs/foreign-key order where safe.
3. Migrate Auth identities using a supported procedure; verify sign-in/reset flows before switching.
4. Copy files separately and verify metadata paths and permissions.
5. Never expose student submissions through public buckets as a shortcut.

### Phase 3 — Verification and cutover
Test student, teacher, admin and super-admin permissions; class join codes; assignments and attachments; handwritten/typed submissions; grading/rubrics; quizzes and attempts; resources; announcements; discussions; attendance; notifications; analytics; and plan/entitlement checks.
Run build/lint and automated smoke tests. Cut over only after the intended project is confirmed, all checks pass, and a rollback plan is ready. Ask for approval before the final merge/cutover.

## Explicitly not done
- No database migrations or SQL writes against Supabase.
- No table, RLS, function, bucket, or storage-quota changes.
- No production environment-variable changes.
- No deletion or modification of Lovable Cloud data.
- No claim that the full migration is complete.
