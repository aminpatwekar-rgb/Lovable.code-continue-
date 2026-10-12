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
- The browser Supabase client now uses native Supabase session persistence rather than the Lovable preview auth-storage adapter. The Google sign-in route now calls Supabase OAuth directly and redirects to `/auth`; the Google provider and allowed redirect URLs must be configured in Supabase Auth before this path can be considered verified.
- **Project identity mismatch still needs resolution in configuration:** the tracked `.env` on `main` references project ref `pvnwklrknyqqugikgiwr`, while the user confirmed that the accessible ONYX project with existing tables is `nhhrtzoztffqvcvqxapl`. The tracked `.env` has been removed from this migration branch only; no values were copied. Before cutover, verify which project the current live Lovable app actually uses and confirm the target's Auth users, files, and data are complete. Do not change production environment configuration until this is verified.
- The inspected Supabase project is active and already contains 27 public tables, 27 public functions, 97 public policies, and 2 storage buckets. Its migration-history listing is empty. Treat it as an existing production-like environment, not an empty destination. No SQL changes have been run.
- Inspected tables have RLS enabled, but table-by-table policy and schema compatibility has not been fully verified.
- The Supabase security advisor reports warnings involving SECURITY DEFINER function grants, a mutable function search_path, and leaked-password protection. Review each finding before cutover; do not blindly revoke grants because app flows may depend on functions.
- The server-only Supabase admin client reads `SUPABASE_SERVICE_ROLE_KEY`; keep it exclusively in server-only modules and verify every import path so it can never enter a browser bundle. The request middleware uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to validate user bearer tokens. Hosted preview environments need these variables set independently; do not place service-role credentials in `VITE_*` variables.
- The repository's README describes auth/roles, classes, assignments and submissions, private uploads, quizzes, resources, announcements, discussions, attendance, notifications, projects and analytics. These require code-level dependency mapping and end-to-end testing.
- **Preview status for commit `3e092dc1987b2ba3054e94065996844ab0a095da`:** Vercel reported a ready preview deployment, while Netlify reported a failed deploy. The Netlify log is not accessible through the current GitHub integration, so its exact failure is not yet diagnosed. Neither status establishes working authentication or feature parity; do not cut over based on a green deploy alone.

## Work completed safely
- Created this isolated branch and a draft pull request; nothing has been merged to `main`.
- Replaced the Google sign-in call on this branch with Supabase's native `signInWithOAuth` API and a `/auth` redirect. This is a preliminary implementation; the provider configuration and redirect behavior still require testing.
- Removed the tracked `.env` from this branch only, without opening or copying its contents into the migration work.
- Added ignore rules for `.env` and `.env.*` while explicitly allowing `.env.example`.
- No production database, Auth, storage, quotas, or Lovable Cloud settings have been changed.

## Mandatory rollback and recovery plan

Rollback is a release requirement, not an optional follow-up.

### Before any cutover
- Keep the currently working Lovable deployment, its backend, Auth configuration, data, and uploaded files intact and available.
- Do not change production environment variables, production routing, or the production branch during implementation and testing.
- Record the currently deployed production commit and configuration references (never copy secrets into docs).
- Back up/export source data and uploaded files before any copy or transformation. Verify backup readability and perform a restore test in an isolated environment.
- Create a cutover checklist and a rollback checklist; designate the last known-good Lovable deployment as the fallback.
- Test the Supabase candidate using a preview/staging deployment and separate test accounts before real users or production traffic are switched.

### Rollback triggers
Roll back if authentication or account confirmation fails, role/RLS checks are wrong, classes or submissions are missing, assignment attachments cannot be uploaded/downloaded securely, grading/quiz flows fail, error rates materially increase, or data parity cannot be confirmed.

### Rollback procedure
1. Stop the cutover and disable further writes to the candidate environment if it is safe to do so.
2. Restore production routing/deployment and production environment variables to the recorded last-known-good Lovable configuration.
3. Keep Lovable Cloud and its data intact; do not delete either backend during rollback.
4. If any writes occurred in Supabase during a trial, reconcile them explicitly before retrying. Do not automatically copy them back or overwrite source records; preserve IDs and compare row counts/files first.
5. Verify login, class lists, assignment submission and file access, grading, and role permissions on the restored Lovable version.
6. Record the failure and fix it on the migration branch, then repeat the full test plan before another cutover attempt.

### Rollback limitations
A rollback of application routing alone cannot automatically reverse data written after cutover, password/auth identity changes, emails already sent, or schema changes. Therefore, avoid production writes and destructive schema changes during migration; require an explicit, separately approved data-reconciliation plan if any production writes happen on the new backend.

## Migration phases

### Phase 0 — Read-only inventory (in progress)
1. Inventory routes, data services, server functions, edge functions, auth providers, scheduled jobs, and environment variables. The browser Google OAuth call is now native Supabase, but server/admin clients and build tooling still need migration work. Diagnose the failed Netlify preview from its deployment logs before using it as a supported target.
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
