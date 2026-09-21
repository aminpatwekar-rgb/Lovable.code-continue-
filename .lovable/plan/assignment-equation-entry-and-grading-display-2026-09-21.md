# Assignment equation entry and grading display

## Scope
- Add equation entry only to the existing typed assignment editor.
- Render saved equations only in the teacher/admin submission review page.
- Leave quizzes, Notebook, math libraries, routes, and data access unchanged.

## Changes
1. **Typed assignment editor**
   - Add an optional `allowMath` prop defaulting to `true`.
   - Add a Sigma “Insert equation” toolbar action.
   - Open the existing `MathEditor` in the app’s existing dialog.
   - Remember the textarea selection when opening the dialog, insert the confirmed LaTeX as `$...$`, update the parent value, close, restore focus, and place the caret after the equation.

2. **Reusable math-aware text renderer**
   - Add `RenderMathText`, which separates `$$...$$` block equations and `$...$` inline equations from ordinary text.
   - Render equations through the existing `MathPreview`; preserve all non-equation text and whitespace unchanged.

3. **Grading view**
   - Replace the raw typed-answer text in the submission review page with `RenderMathText`.

## Verification
- Check types and the preview build.
- Exercise the assignment editor in the browser: insert an equation at a selected cursor position, confirm focus/caret restoration, and verify saved LaTeX renders in the grading view without raw delimiters.
- Report the requested file-by-file updated sections and the new component.
