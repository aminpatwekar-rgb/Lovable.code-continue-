# Align Lovable Cloud with implemented ONYX features

## Scope
Bring the live Lovable Cloud database up to the schema already required by the implemented ONYX features. Preserve existing data, reuse existing tables, and make no unrelated product or UI changes.

## Implementation
1. Compare the live schema with all recent ONYX migrations and application queries.
2. Apply the existing pending business migrations in dependency order, byte-for-byte:
   - business feature tables, relationships, indexes, grants, RLS, triggers, plan catalog, AI usage, reports, and notifications
   - feature enforcement and AI reservation release
   - report/notification hardening
   - storage quota accounting
   - administrator unlimited entitlements
   - current pricing alignment and retired-tier handling
   - assignment attachment storage rules if still absent
3. Add a final additive repair migration only if validation finds a real gap not covered by those existing migrations. Do not duplicate tables or columns.
4. Regenerate database typings through the supported migration workflow and update application code only if generated schema types reveal an existing mismatch.

## Safety rules
- No fake users, demo records, or unrelated seed data.
- No destructive schema changes.
- Preserve all existing rows and working policies.
- Every new public table keeps explicit grants and RLS.
- Administrator access remains unlimited through server-validated roles.
- Roles remain in the dedicated role table.

## Verification
- Confirm required tables, columns, foreign keys, indexes, functions, triggers, grants, and RLS exist in Lovable Cloud.
- Run the database linter and address only issues introduced by or blocking this alignment.
- Check current build diagnostics and run focused checks if generated types affect the app.
- Report each migration and database object created or changed.
