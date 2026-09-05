# Fix quiz counts, persistence, and deletion

## Database integrity and access
- Preserve all existing quizzes and questions.
- Add a student-safe question-count function that returns `COUNT(quiz_questions.id)` only for quizzes the signed-in user may view; it will not expose answer keys.
- Keep RLS enabled and retain owner/admin-only question management.
- Add an authenticated delete-or-archive function: owners may act on their quizzes, admins may act on any quiz, and students/other teachers are rejected. Quizzes with attempts are archived to preserve academic records; quizzes without attempts are permanently deleted through existing cascading foreign keys.
- Confirm the existing `quiz_questions.quiz_id → quizzes.id` foreign key, non-null column, `(quiz_id, position)` index, and dependent cascade rules remain intact.

## Quiz interface and data flow
- Replace embedded relationship counts in both teacher and student lists with the safe real count result.
- Show derived Draft, Published, Closed, and Archived states from existing persisted fields.
- Add an accessible Delete action and confirmation to teacher/admin quiz management and quiz detail pages; refresh all relevant lists after completion.
- Keep archived quizzes out of the active student list while retaining them in teacher management.
- Harden save behavior so question insert/update/delete errors are surfaced and the editor reloads persisted data after saving.

## Verification
- Compare every existing quiz’s database count with the rendered list (currently verified in the database: 8 and 1).
- Test teacher/admin/student authorization boundaries for deletion/archive.
- Test opening an existing published quiz, question ordering, attempt creation/resume, answer persistence across refresh, timer initialization, and submission where available with real authenticated sessions.
- Run focused checks, inspect current build diagnostics, and report any path that cannot be exercised as unverified rather than claiming success.
