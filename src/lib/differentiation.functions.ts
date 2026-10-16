import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ClassAccess = {
  supabaseAdmin: any;
  classId: string;
  userId: string;
};

/** Verify a real class relationship before any service-role reads. */
async function requireClassManager(
  context: { supabase: any; userId: string },
  classId: string,
): Promise<ClassAccess> {
  const { data: isAdmin, error: adminError } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (adminError) throw new Error("Could not verify administrator permissions.");

  const { data: canManage, error: teacherError } = await context.supabase.rpc("is_class_teacher", {
    _class_id: classId,
    _user_id: context.userId,
  });
  if (teacherError) throw new Error("Could not verify class permissions.");
  if (!isAdmin && !canManage) throw new Error("You are not allowed to view reports for this class.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: klass, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id")
    .eq("id", classId)
    .maybeSingle();
  if (classError) throw new Error(classError.message);
  if (!klass) throw new Error("Class not found.");

  return { supabaseAdmin, classId, userId: context.userId };
}

function hasResponse(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((part) => hasResponse(part));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((part) => hasResponse(part));
  }
  return false;
}

function isAttemptComplete(status: string) {
  return status === "submitted" || status === "graded" || status === "expired";
}

export type WeakQuestion = {
  quizId: string;
  quizTitle: string;
  questionId: string;
  questionType: string;
  prompt: string;
  awardedPoints: number | null;
  maxPoints: number;
  submittedAt: string | null;
};

export type StudentWeaknessReport = {
  studentId: string;
  quizzesAvailable: number;
  quizzesCompleted: number;
  averagePct: number | null;
  weakQuestionCount: number;
  questionTypes: {
    type: string;
    answered: number;
    graded: number;
    correct: number;
    accuracyPct: number | null;
  }[];
  weakQuestions: WeakQuestion[];
};

export const getStudentWeaknessInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { classId: string; studentId: string }) => {
    if (!input?.classId || typeof input.classId !== "string" ||
        !input?.studentId || typeof input.studentId !== "string") {
      throw new Error("A class and student are required.");
    }
    return { classId: input.classId, studentId: input.studentId };
  })
  .handler(async ({ data, context }): Promise<StudentWeaknessReport> => {
    const { classId, studentId } = data;
    const { supabaseAdmin, userId } = await requireClassManager(context as never, classId);

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("class_members")
      .select("student_id, member_role")
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .eq("member_role", "student")
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (!membership) throw new Error("That student is not in the selected class.");

    const { data: quizzes, error: quizzesError } = await supabaseAdmin
      .from("quizzes")
      .select("id, title, passing_marks")
      .eq("class_id", classId);
    if (quizzesError) throw new Error(quizzesError.message);
    const quizRows = quizzes ?? [];
    if (!quizRows.length) {
      return {
        studentId,
        quizzesAvailable: 0,
        quizzesCompleted: 0,
        averagePct: null,
        weakQuestionCount: 0,
        questionTypes: [],
        weakQuestions: [],
      };
    }

    const quizIds = quizRows.map((quiz) => quiz.id);
    const [{ data: attempts, error: attemptsError }, { data: questions, error: questionsError }] =
      await Promise.all([
        supabaseAdmin
          .from("quiz_attempts")
          .select("id, quiz_id, status, score, max_score, submitted_at, started_at")
          .eq("student_id", studentId)
          .in("quiz_id", quizIds),
        supabaseAdmin
          .from("quiz_questions")
          .select("id, quiz_id, prompt, type, points, position")
          .in("quiz_id", quizIds)
          .order("position"),
      ]);
    if (attemptsError) throw new Error(attemptsError.message);
    if (questionsError) throw new Error(questionsError.message);

    const finished = (attempts ?? []).filter((attempt) => isAttemptComplete(attempt.status));
    // A student's best completed attempt per quiz is used, so retrying does not
    // artificially inflate the number of observations in this report.
    const bestByQuiz = new Map<string, (typeof finished)[number]>();
    for (const attempt of finished) {
      const previous = bestByQuiz.get(attempt.quiz_id);
      const previousPct = previous && previous.max_score
        ? (Number(previous.score ?? 0) / Number(previous.max_score)) * 100
        : -1;
      const currentPct = attempt.max_score
        ? (Number(attempt.score ?? 0) / Number(attempt.max_score)) * 100
        : -1;
      if (
        !previous ||
        currentPct > previousPct ||
        (currentPct === previousPct &&
          new Date(attempt.submitted_at ?? attempt.started_at).getTime() >
            new Date(previous.submitted_at ?? previous.started_at).getTime())
      ) {
        bestByQuiz.set(attempt.quiz_id, attempt);
      }
    }

    const bestAttempts = [...bestByQuiz.values()];
    const attemptIds = bestAttempts.map((attempt) => attempt.id);
    const { data: answers, error: answersError } = attemptIds.length
      ? await supabaseAdmin
          .from("quiz_answers")
          .select("attempt_id, question_id, response, is_correct, awarded_points")
          .in("attempt_id", attemptIds)
      : { data: [], error: null };
    if (answersError) throw new Error(answersError.message);

    const questionById = new Map((questions ?? []).map((question) => [question.id, question]));
    const quizById = new Map(quizRows.map((quiz) => [quiz.id, quiz]));
    const attemptById = new Map(bestAttempts.map((attempt) => [attempt.id, attempt]));
    const typeCounts = new Map<string, { answered: number; graded: number; correct: number }>();
    const weakQuestions: WeakQuestion[] = [];

    for (const answer of answers ?? []) {
      const question = questionById.get(answer.question_id);
      const attempt = attemptById.get(answer.attempt_id);
      if (!question || !attempt) continue;

      const response = hasResponse(answer.response);
      if (!response) continue;

      const type = String(question.type ?? "unknown").replaceAll("_", " ");
      const stat = typeCounts.get(type) ?? { answered: 0, graded: 0, correct: 0 };
      stat.answered += 1;

      let isCorrect: boolean | null = answer.is_correct === true ? true : answer.is_correct === false ? false : null;
      const awarded = answer.awarded_points == null ? null : Number(answer.awarded_points);
      const maxPoints = Number(question.points) || 0;
      if (isCorrect === null && awarded !== null) isCorrect = awarded >= maxPoints && maxPoints > 0;
      if (isCorrect !== null) {
        stat.graded += 1;
        if (isCorrect) stat.correct += 1;
      }
      typeCounts.set(type, stat);

      if (isCorrect === false) {
        const quiz = quizById.get(question.quiz_id);
        weakQuestions.push({
          quizId: question.quiz_id,
          quizTitle: quiz?.title ?? "Quiz",
          questionId: question.id,
          questionType: type,
          prompt: String(question.prompt ?? ""),
          awardedPoints: awarded,
          maxPoints,
          submittedAt: attempt.submitted_at,
        });
      }
    }

    const pcts = bestAttempts
      .filter((attempt) => attempt.score != null && Number(attempt.max_score) > 0)
      .map((attempt) => Math.round((Number(attempt.score) / Number(attempt.max_score)) * 100));
    const questionTypes = [...typeCounts.entries()]
      .map(([type, stat]) => ({
        type,
        answered: stat.answered,
        graded: stat.graded,
        correct: stat.correct,
        accuracyPct: stat.graded ? Math.round((stat.correct / stat.graded) * 100) : null,
      }))
      .sort((a, b) => (a.accuracyPct ?? 101) - (b.accuracyPct ?? 101));

    return {
      studentId,
      quizzesAvailable: quizRows.length,
      quizzesCompleted: bestAttempts.length,
      averagePct: pcts.length ? Math.round(pcts.reduce((sum, pct) => sum + pct, 0) / pcts.length) : null,
      weakQuestionCount: weakQuestions.length,
      questionTypes,
      weakQuestions: weakQuestions
        .sort((a, b) => new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime())
        .slice(0, 20),
    };
  });

export type IntegrityAlert = {
  kind: "paste_warning" | "locked_attempt" | "manual_review" | "late_submission";
  studentName: string;
  activityName: string;
  details: string;
  occurredAt: string;
};

export type AssessmentIntegrityReport = {
  pasteWarnings: number;
  studentsWithPasteWarnings: number;
  lockedAttempts: number;
  manualReviewAttempts: number;
  lateSubmissions: number;
  alerts: IntegrityAlert[];
};

export const getAssessmentIntegrityReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { classId: string }) => {
    if (!input?.classId || typeof input.classId !== "string") {
      throw new Error("A valid class id is required.");
    }
    return { classId: input.classId };
  })
  .handler(async ({ data, context }): Promise<AssessmentIntegrityReport> => {
    const { supabaseAdmin } = await requireClassManager(context as never, data.classId);

    const [
      { data: assignments, error: assignmentsError },
      { data: quizzes, error: quizzesError },
    ] = await Promise.all([
      supabaseAdmin
        .from("assignments")
        .select("id, title")
        .eq("class_id", data.classId),
      supabaseAdmin
        .from("quizzes")
        .select("id, title")
        .eq("class_id", data.classId),
    ]);
    if (assignmentsError) throw new Error(assignmentsError.message);
    if (quizzesError) throw new Error(quizzesError.message);

    const assignmentRows = assignments ?? [];
    const quizRows = quizzes ?? [];
    const assignmentIds = assignmentRows.map((row) => row.id);
    const quizIds = quizRows.map((row) => row.id);

    const [{ data: submissions, error: submissionsError }, { data: attempts, error: attemptsError }] =
      await Promise.all([
        assignmentIds.length
          ? supabaseAdmin
              .from("submissions")
              .select("id, assignment_id, student_id, status, is_late, submitted_at, reviewed_at, paste_violation_count")
              .in("assignment_id", assignmentIds)
          : Promise.resolve({ data: [], error: null }),
        quizIds.length
          ? supabaseAdmin
              .from("quiz_attempts")
              .select("id, quiz_id, student_id, status, started_at, submitted_at, locked_at, lock_reason, needs_manual_grading")
              .in("quiz_id", quizIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (submissionsError) throw new Error(submissionsError.message);
    if (attemptsError) throw new Error(attemptsError.message);

    const submissionRows = submissions ?? [];
    const submissionIds = submissionRows.map((row) => row.id);
    const { data: violations, error: violationsError } = submissionIds.length
      ? await supabaseAdmin
          .from("paste_violations")
          .select("id, submission_id, student_id, kind, occurred_at")
          .in("submission_id", submissionIds)
      : { data: [], error: null };
    if (violationsError) throw new Error(violationsError.message);

    const studentIds = [
      ...new Set([
        ...submissionRows.map((row) => row.student_id),
        ...(attempts ?? []).map((attempt) => attempt.student_id),
      ]),
    ];
    const { data: profiles, error: profilesError } = studentIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", studentIds)
      : { data: [], error: null };
    if (profilesError) throw new Error(profilesError.message);

    const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || "Student"]));
    const assignmentById = new Map(assignmentRows.map((row) => [row.id, row.title]));
    const quizById = new Map(quizRows.map((row) => [row.id, row.title]));
    const alerts: IntegrityAlert[] = [];

    for (const violation of violations ?? []) {
      alerts.push({
        kind: "paste_warning",
        studentName: nameById.get(violation.student_id) ?? "Student",
        activityName: assignmentById.get(
          submissionRows.find((submission) => submission.id === violation.submission_id)?.assignment_id ?? "",
        ) ?? "Assignment",
        details: `Paste/copy warning: ${String(violation.kind ?? "unknown").replaceAll("_", " ")}`,
        occurredAt: violation.occurred_at,
      });
    }

    for (const submission of submissionRows) {
      if (submission.is_late || submission.status === "late") {
        alerts.push({
          kind: "late_submission",
          studentName: nameById.get(submission.student_id) ?? "Student",
          activityName: assignmentById.get(submission.assignment_id) ?? "Assignment",
          details: "Submitted after the deadline.",
          occurredAt: submission.submitted_at ?? submission.reviewed_at ?? new Date(0).toISOString(),
        });
      }
    }

    for (const attempt of attempts ?? []) {
      const title = quizById.get(attempt.quiz_id) ?? "Quiz";
      if (attempt.locked_at || attempt.status === "locked") {
        alerts.push({
          kind: "locked_attempt",
          studentName: nameById.get(attempt.student_id) ?? "Student",
          activityName: title,
          details: attempt.lock_reason ? `Attempt locked: ${attempt.lock_reason}` : "Attempt was locked.",
          occurredAt: attempt.locked_at ?? attempt.submitted_at ?? attempt.started_at,
        });
      }
      if (attempt.needs_manual_grading) {
        alerts.push({
          kind: "manual_review",
          studentName: nameById.get(attempt.student_id) ?? "Student",
          activityName: title,
          details: "Quiz attempt contains answers that need manual review.",
          occurredAt: attempt.submitted_at ?? attempt.started_at,
        });
      }
    }

    alerts.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return {
      pasteWarnings: (violations ?? []).length,
      studentsWithPasteWarnings: new Set((violations ?? []).map((item) => item.student_id)).size,
      lockedAttempts: (attempts ?? []).filter((attempt) => Boolean(attempt.locked_at) || attempt.status === "locked").length,
      manualReviewAttempts: (attempts ?? []).filter((attempt) => Boolean(attempt.needs_manual_grading)).length,
      lateSubmissions: submissionRows.filter((submission) => Boolean(submission.is_late) || submission.status === "late").length,
      alerts: alerts.slice(0, 50),
    };
  });

export type HandwritingAnalysis = {
  transcription: string;
  unclearSegments: string[];
  observations: string[];
  confidence: "low" | "medium" | "high";
};

export const analyzeHandwritingFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => {
    if (!input?.fileId || typeof input.fileId !== "string") {
      throw new Error("A valid submission file is required.");
    }
    return { fileId: input.fileId };
  })
  .handler(async ({ data, context }): Promise<HandwritingAnalysis> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error: fileError } = await supabaseAdmin
      .from("submission_files")
      .select("id, submission_id, storage_path, file_name, mime_type, size_bytes, kind")
      .eq("id", data.fileId)
      .maybeSingle();
    if (fileError) throw new Error(fileError.message);
    if (!file) throw new Error("Submission file not found.");
    if (file.kind !== "page") throw new Error("Only uploaded page images can be transcribed.");
    if (file.size_bytes != null && Number(file.size_bytes) > 10 * 1024 * 1024) {
      throw new Error("For handwriting analysis, use an image under 10 MB.");
    }

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("submissions")
      .select("id, assignment_id, student_id")
      .eq("id", file.submission_id)
      .maybeSingle();
    if (submissionError) throw new Error(submissionError.message);
    if (!submission) throw new Error("Submission not found.");

    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from("assignments")
      .select("id, class_id, teacher_id")
      .eq("id", submission.assignment_id)
      .maybeSingle();
    if (assignmentError) throw new Error(assignmentError.message);
    if (!assignment) throw new Error("Assignment not found.");

    const [{ data: isAdmin, error: adminError }, { data: canManage, error: teacherError }] =
      await Promise.all([
        context.supabase.rpc("has_role", {
          _user_id: context.userId,
          _role: "admin",
        }),
        context.supabase.rpc("is_class_teacher", {
          _class_id: assignment.class_id,
          _user_id: context.userId,
        }),
      ]);
    if (adminError) throw new Error("Could not verify administrator permissions.");
    if (teacherError) throw new Error("Could not verify class permissions.");
    if (!isAdmin && !canManage) {
      throw new Error("Only the class teacher, approved co-teachers or admins can analyze handwriting.");
    }

    const mimeType = String(file.mime_type ?? "").toLowerCase();
    const extension = String(file.file_name ?? "").split(".").pop()?.toLowerCase() ?? "";
    const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const extensionMimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const detectedMime = supportedMimeTypes.has(mimeType) ? mimeType : extensionMimeTypes[extension];
    if (!detectedMime) {
      throw new Error("Handwriting AI currently supports JPEG, PNG and WebP page photos. Other document types stay available for normal grading.");
    }

    const key = process.env["GEMINI_API_KEY"];
    if (!key) throw new Error("Handwriting AI is not configured. Add GEMINI_API_KEY to the server secrets.");

    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from("submissions")
      .download(file.storage_path);
    if (downloadError) throw new Error("Could not read the uploaded handwriting image.");
    if (blob.size > 10 * 1024 * 1024) throw new Error("For handwriting analysis, use an image under 10 MB.");
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
        {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "You are an assistive handwriting transcription tool for teachers. Transcribe the visible writing faithfully. Do not grade, infer marks, judge a student's ability, or invent text that is not visible. Mark uncertain words explicitly and return only a JSON object."
              }],
            },
            contents: [{
              role: "user",
              parts: [
                { text: "Transcribe the handwriting in this image as faithfully as possible. Preserve equations, numbers, line breaks, and spelling. Use [unclear] for unreadable words. List visibly uncertain snippets separately. Add short observations only about image legibility (for example blur, cropping, glare, or faint writing), never about student intelligence or effort. Return JSON with keys transcription (string), unclearSegments (string array), observations (string array), confidence (low|medium|high). This is a transcription aid; do not grade the answer." },
                { inlineData: { mimeType: detectedMime, data: base64 } },
              ],
            }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
          }),
        },
      );
    } catch (error) {
      clearTimeout(timer);
      if ((error as Error)?.name === "AbortError") {
        throw new Error("Handwriting analysis timed out. Try a smaller, clearer image.");
      }
      throw new Error("Could not reach the handwriting AI service.");
    }
    clearTimeout(timer);
    if (response.status === 429) throw new Error("The AI rate limit was reached. Please try again later.");
    if (response.status === 401 || response.status === 403) {
      throw new Error("The handwriting AI key was rejected. Check the GEMINI_API_KEY server secret.");
    }
    if (!response.ok) {
      console.error("Handwriting AI request failed", response.status, await response.text());
      throw new Error("Handwriting AI could not process this image right now.");
    }

    const raw = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const output = raw.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Handwriting AI returned an unreadable result.");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(output.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      throw new Error("Handwriting AI returned invalid structured data.");
    }

    const transcription = typeof parsed.transcription === "string" ? parsed.transcription.trim().slice(0, 20_000) : "";
    const unclearSegments = Array.isArray(parsed.unclearSegments)
      ? parsed.unclearSegments.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 240)).slice(0, 30)
      : [];
    const observations = Array.isArray(parsed.observations)
      ? parsed.observations.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 240)).slice(0, 10)
      : [];
    const confidence = parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low";
    if (!transcription) throw new Error("No handwriting could be transcribed from this image.");

    return { transcription, unclearSegments, observations, confidence };
  });
