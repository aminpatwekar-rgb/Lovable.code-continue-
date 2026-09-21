# Implement class workflow expansion

## Scope
Build the eight requested features in three approval-gated stages without changing the existing math, theme, or quiz-taking behavior. Stop after Stage 1 and await confirmation before Stage 2; stop again after Stage 2 before Stage 3.

## Implementation
### Stage 1 — Announcement attachments and class resources
1. **Announcement attachments**
   - Add a private `announcement-attachments` bucket and attachment metadata table.
   - Add RLS/storage rules matching announcement visibility and author/admin deletion rights.
   - Extend the composer for multiple uploads and show signed download links in the feed.

2. **Class resources**
   - Add a private `class-resources` bucket and resource metadata table.
   - Add a Resources class tab where the class owner/admin uploads or removes files and all class members download them.

After Stage 1, report the tables, buckets, functions, and file changes; confirm both requested checks pass; then wait for approval.

### Stage 2 — Grade export, student import, and pagination
3. **Grade CSV export**
   - Add a teacher/admin action on the class page.
   - Build a CSV from the real roster, assignments/submissions, quizzes/attempts, and trigger a browser download.

4. **Student CSV import**
   - Add a teacher/admin CSV dialog for `name,email` rows.
   - Use one authenticated database function to resolve existing profiles and enroll them securely; unresolved emails become pending class invites that are automatically claimed when that account exists or later signs up.
   - Show row-level import results without exposing unrelated account data.

5. **Pagination**
   - Add 20-row range-based loading to Classes, Assignments, and Quizzes while preserving their current tabs, filters, and cards.

After Stage 2, report the schema/functions and file changes; confirm both requested checks pass; then wait for approval.

### Stage 3 — Calendar, attendance, and rubric grading
6. **Due-date calendar**
   - Add a protected Calendar page and sidebar entry.
   - Query assignments plus quiz end dates allowed by existing RLS, render month navigation and a responsive date grid, and link events to their existing pages.

7. **Attendance**
   - Add attendance schema with status validation, unique student/date rows, grants, and RLS.
   - Add a class Attendance tab: teachers/admins mark the roster for a selected date; students see only their own history.

8. **Rubric grading**
   - Add rubric, criteria, and criterion score tables with assignment/submission-scoped RLS.
   - Extend assignment create/edit to author criteria and keep assignment maximum marks synchronized with the rubric total.
   - Replace the single grade input with criterion inputs when a rubric exists, persist criterion scores, and save their sum as the submission grade.

After Stage 3, run final verification and provide the complete numbered ✅/❌ checklist with file/line evidence and the requested file-by-file report.

## Technical details
- Use additive database migrations with explicit grants before RLS policies for every new public table.
- Use security-definer helpers only for narrow operations that cannot safely be done from the browser, with execute revoked from public/anonymous access.
- Store files privately and generate short-lived signed URLs at read time.
- Update generated database typings to match the applied schema.
- Keep new class-page features in focused components to avoid bloating the existing route.

## Verification
- Run `npx tsc --noEmit` and `npm run build` as requested.
- Check the latest build diagnostics.
- Exercise key authenticated flows in the browser where available.
- Return the numbered completion checklist with file/line evidence and the requested file-by-file change report.
