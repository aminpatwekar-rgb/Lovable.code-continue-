import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  blankQuestion,
  KIND_LABEL,
  type Difficulty,
  type QuestionDraft,
  type QuestionType,
  type QuizKind,
} from "@/lib/quiz/types";
import { generateQuizQuestions, regenerateQuizQuestion } from "@/lib/quiz/ai.functions";
import { QuestionEditor } from "@/components/quiz/QuestionEditor";
import { AiGeneratorPanel, type GenerationOptions } from "@/components/quiz/AiGeneratorPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/edit")({
  head: () => ({
    meta: [
      { title: "Quiz builder — ONYX" },
      { name: "description", content: "Build and publish quizzes in ONYX." },
      { property: "og:title", content: "Quiz builder — ONYX" },
      { property: "og:description", content: "Build and publish quizzes in ONYX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Settings = {
  title: string;
  description: string;
  kind: QuizKind;
  time_limit_minutes: number | null;
  max_attempts: number;
  passing_marks: number;
  lockdown_enabled: boolean;
  randomize_questions: boolean;
  randomize_choices: boolean;
  show_results: boolean;
  start_at: string | null;
  end_at: string | null;
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Page() {
  const { quizId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const generate = useServerFn(generateQuizQuestions);
  const regenerate = useServerFn(regenerateQuizQuestion);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [material, setMaterial] = useState("");
  const [regenIndex, setRegenIndex] = useState<number | null>(null);

  const quiz = useQuery({
    queryKey: ["quiz-edit", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("*, classes(name)")
        .eq("id", quizId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Quiz not found");
      const { data: qs, error: qErr } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("position");
      if (qErr) throw qErr;
      return { quiz: data, questions: qs ?? [] };
    },
  });

  useEffect(() => {
    if (!quiz.data || settings) return;
    const q = quiz.data.quiz;
    setSettings({
      title: q.title,
      description: q.description ?? "",
      kind: q.kind as QuizKind,
      time_limit_minutes: q.time_limit_minutes,
      max_attempts: q.max_attempts,
      passing_marks: q.passing_marks,
      lockdown_enabled: q.lockdown_enabled,
      randomize_questions: q.randomize_questions,
      randomize_choices: q.randomize_choices,
      show_results: q.show_results,
      start_at: q.start_at,
      end_at: q.end_at,
    });
    setQuestions(
      quiz.data.questions.map((row) => ({
        id: row.id,
        type: row.type as QuestionType,
        difficulty: row.difficulty as Difficulty,
        prompt: row.prompt,
        options: Array.isArray(row.options) ? (row.options as unknown[]).map(String) : [],
        correct: Array.isArray(row.correct) ? (row.correct as unknown[]).map(String) : [],
        explanation: row.explanation ?? "",
        points: Number(row.points) || 1,
      })),
    );
  }, [quiz.data, settings]);

  const totalMarks = useMemo(
    () => questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
    [questions],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) return;
      const { error } = await supabase
        .from("quizzes")
        .update({
          title: settings.title.trim(),
          description: settings.description.trim() || null,
          kind: settings.kind,
          time_limit_minutes: settings.time_limit_minutes,
          max_attempts: settings.max_attempts,
          passing_marks: settings.passing_marks,
          lockdown_enabled: settings.lockdown_enabled,
          randomize_questions: settings.randomize_questions,
          randomize_choices: settings.randomize_choices,
          show_results: settings.show_results,
          start_at: settings.start_at,
          end_at: settings.end_at,
        })
        .eq("id", quizId);
      if (error) throw error;

      if (removed.length) {
        const { error: delErr } = await supabase
          .from("quiz_questions")
          .delete()
          .in("id", removed);
        if (delErr) throw delErr;
      }

      const existing = questions.filter((q) => !q.id.startsWith("draft-"));
      const fresh = questions.filter((q) => q.id.startsWith("draft-"));

      for (const q of existing) {
        const { error: upErr } = await supabase
          .from("quiz_questions")
          .update({
            type: q.type,
            difficulty: q.difficulty,
            prompt: q.prompt.trim(),
            options: q.options,
            correct: q.correct,
            explanation: q.explanation.trim() || null,
            points: q.points,
            position: questions.indexOf(q),
          })
          .eq("id", q.id);
        if (upErr) throw upErr;
      }

      if (fresh.length) {
        const { error: insErr } = await supabase.from("quiz_questions").insert(
          fresh.map((q) => ({
            quiz_id: quizId,
            type: q.type,
            difficulty: q.difficulty,
            prompt: q.prompt.trim(),
            options: q.options,
            correct: q.correct,
            explanation: q.explanation.trim() || null,
            points: q.points,
            position: questions.indexOf(q),
          })),
        );
        if (insErr) throw insErr;
      }
    },
    onSuccess: async () => {
      setRemoved([]);
      toast.success("Quiz saved");
      await qc.invalidateQueries({ queryKey: ["quiz-edit", quizId] });
      await qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
      setSettings(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: async (published: boolean) => {
      const { error } = await supabase.from("quizzes").update({ published }).eq("id", quizId);
      if (error) throw error;
      return published;
    },
    onSuccess: async (published) => {
      toast.success(published ? "Quiz published" : "Quiz unpublished");
      await qc.invalidateQueries({ queryKey: ["quiz-edit", quizId] });
      await qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aiGenerate = useMutation({
    mutationFn: async (opts: GenerationOptions) =>
      generate({
        data: {
          material: opts.material,
          count: opts.count,
          difficulty: opts.difficulty,
          types: opts.types,
          withExplanations: opts.withExplanations,
          topic: opts.topic || undefined,
          avoid: questions.map((q) => q.prompt).filter(Boolean),
        },
      }),
    onSuccess: (res) => {
      const added = res.questions.map((q) => ({
        ...blankQuestion(q.type as QuestionType),
        type: q.type as QuestionType,
        difficulty: q.difficulty as Difficulty,
        prompt: q.prompt,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation,
        points: q.points,
      }));
      setQuestions((prev) => [...prev, ...added]);
      toast.success(`Added ${added.length} question${added.length === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function regenerateAt(index: number) {
    const target = questions[index];
    if (!target) return;
    if (material.trim().length < 40) {
      toast.error("Add study material in the AI tab first.");
      return;
    }
    setRegenIndex(index);
    try {
      const res = await regenerate({
        data: {
          material,
          count: 1,
          difficulty: target.difficulty,
          types: [target.type],
          withExplanations: true,
          avoid: questions.map((q) => q.prompt).filter(Boolean),
        },
      });
      const q = res.question;
      setQuestions((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                type: q.type as QuestionType,
                difficulty: q.difficulty as Difficulty,
                prompt: q.prompt,
                options: q.options,
                correct: q.correct,
                explanation: q.explanation,
                points: q.points,
              }
            : item,
        ),
      );
      toast.success("Question regenerated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setRegenIndex(null);
    }
  }

  async function saveToBank(index: number) {
    const q = questions[index];
    if (!q || !user) return;
    const { error } = await supabase.from("question_bank").insert({
      owner_id: user.id,
      class_id: quiz.data?.quiz.class_id ?? null,
      type: q.type,
      difficulty: q.difficulty,
      prompt: q.prompt.trim(),
      options: q.options,
      correct: q.correct,
      explanation: q.explanation.trim() || null,
      points: q.points,
    });
    if (error) toast.error(error.message);
    else toast.success("Saved to question bank");
  }

  if (quiz.isLoading || !settings) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (quiz.isError) {
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load this quiz. {(quiz.error as Error).message}
      </div>
    );
  }

  const isOwner = quiz.data!.quiz.teacher_id === user?.id || role === "admin";
  if (!isOwner) {
    return (
      <div className="panel space-y-3 p-10 text-center">
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-sm text-muted-foreground">Only the quiz owner can edit this quiz.</p>
        <Button onClick={() => void navigate({ to: "/quizzes" })}>Back to quizzes</Button>
      </div>
    );
  }

  const published = quiz.data!.quiz.published;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/quizzes">
              <ArrowLeft className="mr-1.5 size-4" /> Quizzes
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{settings.title}</h1>
          <p className="text-sm text-muted-foreground">
            {quiz.data!.quiz.classes?.name ?? "Class"} · {questions.length} question
            {questions.length === 1 ? "" : "s"} · {totalMarks} marks
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/quizzes/$quizId" params={{ quizId }}>
              Overview
            </Link>
          </Button>
          <Button
            variant={published ? "ghost" : "secondary"}
            disabled={publish.isPending || (!published && questions.length === 0)}
            onClick={() => publish.mutate(!published)}
          >
            {published ? "Unpublish" : "Publish"}
          </Button>
          <Button disabled={save.isPending || !settings.title.trim()} onClick={() => save.mutate()}>
            {save.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save
          </Button>
        </div>
      </header>

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
          <TabsTrigger value="ai">AI generator</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-4 space-y-3">
          {questions.length === 0 && (
            <div className="panel p-10 text-center">
              <p className="font-medium">No questions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add one manually or generate a set from your notes in the AI generator tab.
              </p>
            </div>
          )}
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              index={i}
              question={q}
              regenerating={regenIndex === i}
              onChange={(next) => setQuestions((prev) => prev.map((x, j) => (j === i ? next : x)))}
              onDelete={() => {
                if (!q.id.startsWith("draft-")) setRemoved((prev) => [...prev, q.id]);
                setQuestions((prev) => prev.filter((_, j) => j !== i));
              }}
              onMove={(dir) =>
                setQuestions((prev) => {
                  const target = i + dir;
                  if (target < 0 || target >= prev.length) return prev;
                  const next = [...prev];
                  [next[i], next[target]] = [next[target]!, next[i]!];
                  return next;
                })
              }
              onRegenerate={() => void regenerateAt(i)}
              onSaveToBank={() => void saveToBank(i)}
            />
          ))}
          <Button variant="outline" onClick={() => setQuestions((p) => [...p, blankQuestion()])}>
            <Plus className="mr-2 size-4" /> Add question
          </Button>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <div className="panel p-5">
            <AiGeneratorPanel
              busy={aiGenerate.isPending}
              material={material}
              onMaterialChange={setMaterial}
              onGenerate={(opts) => aiGenerate.mutate(opts)}
            />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <div className="panel space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-title">Title</Label>
                <Input
                  id="s-title"
                  value={settings.title}
                  onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-kind">Type</Label>
                <Select
                  value={settings.kind}
                  onValueChange={(v) => setSettings({ ...settings, kind: v as QuizKind })}
                >
                  <SelectTrigger id="s-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABEL) as QuizKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-desc">Instructions</Label>
              <Textarea
                id="s-desc"
                value={settings.description}
                onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                className="min-h-20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-time">Time limit (minutes)</Label>
                <Input
                  id="s-time"
                  type="number"
                  min={0}
                  value={settings.time_limit_minutes ?? ""}
                  placeholder="No limit"
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      time_limit_minutes: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-att">Max attempts</Label>
                <Input
                  id="s-att"
                  type="number"
                  min={1}
                  value={settings.max_attempts}
                  onChange={(e) =>
                    setSettings({ ...settings, max_attempts: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-pass">Passing marks</Label>
                <Input
                  id="s-pass"
                  type="number"
                  min={0}
                  value={settings.passing_marks}
                  onChange={(e) =>
                    setSettings({ ...settings, passing_marks: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-start">Opens at</Label>
                <Input
                  id="s-start"
                  type="datetime-local"
                  value={toLocalInput(settings.start_at)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      start_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-end">Closes at</Label>
                <Input
                  id="s-end"
                  type="datetime-local"
                  value={toLocalInput(settings.end_at)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      end_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              {(
                [
                  ["lockdown_enabled", "Lockdown mode", "Warn and lock the attempt if the student leaves the tab."],
                  ["randomize_questions", "Shuffle questions", "Each student sees a different order."],
                  ["randomize_choices", "Shuffle options", "Randomise answer choices per student."],
                  ["show_results", "Show results", "Let students see their score after submitting."],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <Switch
                    checked={settings[key]}
                    onCheckedChange={(v) => setSettings({ ...settings, [key]: v })}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
