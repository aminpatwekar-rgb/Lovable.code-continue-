# ONYX read-only audit: findings and a plan for what to fix first

Nothing was changed. This is a quick first pass. I did not test any flow while signed in.

## 1. What the product is
- Name: ONYX (workonyx.org). Roles in the code: student, teacher, admin, institution_admin, plus co-teachers per class.
- Public pages: home, sign-in, password reset, join by class code.
- Signed-in pages: dashboard, classes (with roster import), assignments, submissions, grading (per assignment, bulk, quiz), quizzes (build, take, analytics), question bank, rubrics, reports, progress, attendance, calendar, achievements and leaderboard, institution, institution admin, my institution, admin, settings.

## 2. What it is built on (from the code)
- Database, sign-in and file storage: Supabase, running on Lovable Cloud. Tables cover classes, assignments, submissions, quizzes, rubrics, departments, plans and subscriptions, and AI usage.
- Front end: React with TanStack Start, Tailwind and Radix-based components. The typed editor uses Tiptap, with maths support.
- AI: the Google Gemini API, using your own key, for quiz questions, rubric help and reading handwriting.
- Payments: Razorpay, handled on the server.
- Email: Lovable's email service from notify.workonyx.org, for sign-in emails and class alerts.

## 3. Your brief compared with the code
Pages and data already exist for these: handwriting and typed submissions, classes, assignments, quizzes, grading, bulk grading, roster import, rubrics, institutions and departments, reports and analytics, plans and limits, AI question generation and email alerts. There is also a file preview feature for uploads. I have not checked how far each one is finished.

## 4. Findings
Confirmed:
- Students can see and start quizzes that have 0 questions (your screenshot: "a" and "dad").
- Admins can still be blocked when creating an assignment for another teacher. The safety check needs the creator to be the teacher. A fix exists but may not be live yet.
- The handwriting reader asks Google for a model called "gemini-3.8-flash". That name looks wrong and could make the feature fail.

Not checked yet:
- Whether the live site runs the latest code.
- Emails arriving in a real inbox.
- Razorpay checkout from start to finish.
- PowerPoint and Office file previews.
- Exporting results.

## 5. Poster
No poster was attached. Your uploads only have a logo and a quiz screenshot. Send the poster and I will proofread it.

## 6. Tool credits for the poster
- The code proves Supabase is used, so you can name it.
- The code cannot show whether Antigravity or Stitch were used. You can still list them as tools you used, but don't present them as part of how the app runs.
- Not naming Lovable is your choice. Just avoid wording that suggests ONYX runs anywhere other than where it actually runs.

## 7. What to fix first (later, once you say so)
1. Get the assignment fix onto the live site, then test creating an assignment.
2. Check the Gemini model name.
3. Hide or block quizzes that have no questions.
4. Test checkout, emails and file previews while signed in.
5. Do a fuller audit of each feature against your brief.
