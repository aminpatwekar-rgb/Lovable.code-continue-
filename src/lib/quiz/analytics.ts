import { supabase } from "@/integrations/supabase/client";
import { percent, type QuestionType } from "@/lib/quiz/types";

/**
 * Read-only analytics for one quiz. Everything is derived from existing rows:
 * quizzes / quiz_questions / quiz_attempts / quiz_answers / class_members.
 * Only quiz owners and admins can read these tables (RLS), so no extra
 * database objects are required.
 */

export type AttemptRow = {
  id: string;
  student_id: string;
  attempt_no: number;
  status: string;
  score: number | null;
  max_score: number | null;
  started_at: string;
  submitted_at: string | null;
};

export type AnswerRow = {
  attempt_id: string;
  question_id: string;
  response: string[];
  is_correct: boolean | null;
  awarded_points: number | null;
};

export type QuestionRow = {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  options: string[];
  points: number;
};

export type StudentStat = {
  studentId: string;
  name: string;
  status: "completed" | "in_progress" | "not_attempted";
  attemptId: string | null;
  score: number | null;
  maxScore: number | null;
  pct: number | null;
  correct: number;
  incorrect: number;
  unanswered: number;
  timeTakenMs: number | null;
  submittedAt: string | null;
};

export type OptionStat = { label: string; count: number; pct: number };

export type QuestionStat = {
  id: string;
  index: number;
  prompt: string;
  type: QuestionType;
  points: number;
  responses: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  correctPct: number;
  incorrectPct: number;
  avgMarks: number;
  difficulty: "Easy" | "Moderate" | "Difficult";
  options: OptionStat[];
};

export type QuizAnalytics = {
  quiz: {
    id: string;
    title: string;
    passing_marks: number;
    published: boolean;
    class_id: string;
    className: string | null;
  };
  totals: {
    assigned: number;
    attempted: number;
    completed: number;
    notAttempted: number;
    totalAttempts: number;
    avgScore: number | null;
    avgPct: number | null;
    highest: number | null;
    lowest: number | null;
    passRate: number | null;
    maxScore: number;
  };
  students: StudentStat[];
  questions: QuestionStat[];
};

const DONE = new Set(["submitted", "graded", "expired"]);

export function difficultyOf(correctPct: number): QuestionStat["difficulty"] {
  if (correctPct >= 70) return "Easy";
  if (correctPct >= 40) return "Moderate";
  return "Difficult";
}

export function formatDuration(ms: number | null) {
  if (ms == null || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

export async function fetchQuizAnalytics(quizId: string): Promise<QuizAnalytics> {
  const { data: quiz, error: qErr } = await supabase
    .from("quizzes")
    .select("id, title, passing_marks, published, class_id, classes(name)")
    .eq("id", quizId)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quiz) throw new Error("Quiz not found.");

  const [questionsRes, attemptsRes, rosterRes] = await Promise.all([
    supabase
      .from("quiz_questions")
      .select("id, position, type, prompt, options, points")
      .eq("quiz_id", quizId)
      .order("position"),
    supabase
      .from("quiz_attempts")
      .select("id, student_id, attempt_no, status, score, max_score, started_at, submitted_at")
      .eq("quiz_id", quizId),
    supabase
      .from("class_members")
      .select("student_id, full_name, member_role")
      .eq("class_id", quiz.class_id),
  ]);
  if (questionsRes.error) throw questionsRes.error;
  if (attemptsRes.error) throw attemptsRes.error;
  if (rosterRes.error) throw rosterRes.error;

  const questions: QuestionRow[] = (questionsRes.data ?? []).map((q) => ({
    id: q.id,
    position: q.position,
    type: q.type as QuestionType,
    prompt: q.prompt,
    options: toStrings(q.options),
    points: Number(q.points) || 0,
  }));

  const attempts = (attemptsRes.data ?? []) as AttemptRow[];

  let answers: AnswerRow[] = [];
  if (attempts.length) {
    const { data, error } = await supabase
      .from("quiz_answers")
      .select("attempt_id, question_id, response, is_correct, awarded_points")
      .in(
        "attempt_id",
        attempts.map((a) => a.id),
      );
    if (error) throw error;
    answers = (data ?? []).map((a) => ({
      attempt_id: a.attempt_id,
      question_id: a.question_id,
      response: toStrings(a.response),
      is_correct: a.is_correct,
      awarded_points: a.awarded_points == null ? null : Number(a.awarded_points),
    }));
  }

  // Names: roster names first, then profiles for anyone missing.
  const roster = (rosterRes.data ?? []).filter((m) => m.member_role !== "teacher");
  const names = new Map<string, string>();
  for (const m of roster) if (m.full_name) names.set(m.student_id, m.full_name);
  const missing = [
    ...new Set(
      [...roster.map((r) => r.student_id), ...attempts.map((a) => a.student_id)].filter(
        (id) => !names.get(id),
      ),
    ),
  ];
  if (missing.length) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", missing);
    for (const p of data ?? []) names.set(p.id, p.full_name);
  }

  const maxScore = questions.reduce((s, q) => s + q.points, 0);

  // One representative attempt per student: best finished attempt, else the
  // most recent in-progress one.
  const byStudent = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const list = byStudent.get(a.student_id) ?? [];
    list.push(a);
    byStudent.set(a.student_id, list);
  }

  const studentIds = [...new Set([...roster.map((r) => r.student_id), ...byStudent.keys()])];

  const answersByAttempt = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const list = answersByAttempt.get(a.attempt_id) ?? [];
    list.push(a);
    answersByAttempt.set(a.attempt_id, list);
  }

  const students: StudentStat[] = studentIds.map((id) => {
    const list = byStudent.get(id) ?? [];
    const finished = list.filter((a) => DONE.has(a.status));
    const chosen =
      finished.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0] ??
      list.sort((a, b) => (b.started_at > a.started_at ? 1 : -1))[0] ??
      null;

    if (!chosen) {
      return {
        studentId: id,
        name: names.get(id) ?? "Student",
        status: "not_attempted",
        attemptId: null,
        score: null,
        maxScore: null,
        pct: null,
        correct: 0,
        incorrect: 0,
        unanswered: questions.length,
        timeTakenMs: null,
        submittedAt: null,
      };
    }

    const done = DONE.has(chosen.status);
    const rows = answersByAttempt.get(chosen.id) ?? [];
    const answered = rows.filter((r) => r.response.some((v) => v.trim()));
    const correct = answered.filter((r) => r.is_correct === true).length;
    const incorrect = answered.filter((r) => r.is_correct === false).length;

    return {
      studentId: id,
      name: names.get(id) ?? "Student",
      status: done ? "completed" : "in_progress",
      attemptId: chosen.id,
      score: chosen.score == null ? null : Number(chosen.score),
      maxScore: chosen.max_score == null ? null : Number(chosen.max_score),
      pct:
        chosen.score == null || !chosen.max_score
          ? null
          : percent(Number(chosen.score), Number(chosen.max_score)),
      correct,
      incorrect,
      unanswered: Math.max(0, questions.length - answered.length),
      timeTakenMs:
        done && chosen.submitted_at
          ? new Date(chosen.submitted_at).getTime() - new Date(chosen.started_at).getTime()
          : null,
      submittedAt: chosen.submitted_at,
    };
  });

  const scored = students.filter((s) => s.status === "completed" && s.score != null);
  const pcts = scored.filter((s) => s.pct != null).map((s) => s.pct!);
  const scores = scored.map((s) => s.score!);
  const passing = Number(quiz.passing_marks) || 0;

  // Question analytics only count finished attempts.
  const finishedAttemptIds = new Set(attempts.filter((a) => DONE.has(a.status)).map((a) => a.id));
  const denominator = finishedAttemptIds.size;

  const questionStats: QuestionStat[] = questions.map((q, i) => {
    const rows = answers.filter(
      (a) => a.question_id === q.id && finishedAttemptIds.has(a.attempt_id),
    );
    const answered = rows.filter((r) => r.response.some((v) => v.trim()));
    const correct = answered.filter((r) => r.is_correct === true).length;
    const incorrect = answered.filter((r) => r.is_correct === false).length;
    const responses = answered.length;
    const base = denominator || 0;
    const correctPct = base ? Math.round((correct / base) * 100) : 0;
    const incorrectPct = base ? Math.round((incorrect / base) * 100) : 0;
    const avgMarks = responses
      ? Math.round(
          (answered.reduce((s, r) => s + (r.awarded_points ?? 0), 0) / responses) * 100,
        ) / 100
      : 0;

    const options: OptionStat[] =
      q.type === "mcq" || q.type === "multi_select" || q.type === "true_false"
        ? (q.options.length ? q.options : ["True", "False"]).map((label) => {
            const count = answered.filter((r) => r.response.includes(label)).length;
            return {
              label,
              count,
              pct: responses ? Math.round((count / responses) * 100) : 0,
            };
          })
        : [];

    return {
      id: q.id,
      index: i + 1,
      prompt: q.prompt,
      type: q.type,
      points: q.points,
      responses,
      correct,
      incorrect,
      unanswered: Math.max(0, base - responses),
      correctPct,
      incorrectPct,
      avgMarks,
      difficulty: difficultyOf(correctPct),
      options,
    };
  });

  const attemptedStudents = students.filter((s) => s.status !== "not_attempted").length;
  const completedStudents = students.filter((s) => s.status === "completed").length;

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      passing_marks: passing,
      published: quiz.published,
      class_id: quiz.class_id,
      className: quiz.classes?.name ?? null,
    },
    totals: {
      assigned: roster.length,
      attempted: attemptedStudents,
      completed: completedStudents,
      notAttempted: Math.max(0, roster.length - attemptedStudents),
      totalAttempts: attempts.length,
      avgScore: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null,
      avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      highest: scores.length ? Math.max(...scores) : null,
      lowest: scores.length ? Math.min(...scores) : null,
      passRate: scored.length
        ? Math.round((scored.filter((s) => (s.score ?? 0) >= passing).length / scored.length) * 100)
        : null,
      maxScore,
    },
    students,
    questions: questionStats,
  };
}
