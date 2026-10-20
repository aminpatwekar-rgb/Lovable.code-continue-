import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Sparkles,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlanGate } from "@/components/PlanGate";
import { generateRubricWithAI } from "@/lib/grading/rubric-ai.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const db = supabase as any;

export const Route = createFileRoute("/_authenticated/rubrics")({
  head: () => ({ meta: [{ title: "Rubrics — ONYX" }] }),
  component: Page,
});

type RubricLevel = {
  id?: string;
  key: string;
  label: string;
  description: string;
  points: number;
};

type Criterion = {
  id?: string;
  key: string;
  title: string;
  description: string;
  max_points: number;
  levels: RubricLevel[];
};

type RubricForm = {
  id: string | null;
  title: string;
  description: string;
  criteria: Criterion[];
};

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random()}`;
}

function makeLevel(label: string, points: number, description = ""): RubricLevel {
  return { key: newKey(), label, points, description };
}

function makeCriterion(title = "New criterion", maxPoints = 4): Criterion {
  return {
    key: newKey(),
    title,
    description: "",
    max_points: maxPoints,
    levels: [
      makeLevel("Excellent", Math.min(4, maxPoints), "Meets or exceeds expectations"),
      makeLevel("Good", Math.min(3, maxPoints), "Meets most expectations"),
      makeLevel("Developing", Math.min(2, maxPoints), "Meets some expectations"),
      makeLevel("Needs improvement", Math.min(1, maxPoints), "Needs more work"),
    ],
  };
}

function emptyForm(): RubricForm {
  return {
    id: null,
    title: "",
    description: "",
    criteria: [makeCriterion("Technical accuracy"), makeCriterion("Presentation")],
  };
}

function Page() {
  const { effectiveRole } = useViewRole();
  const allowed = effectiveRole === "teacher" || effectiveRole === "admin";
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<RubricForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [aiDescription, setAiDescription] = useState("");
  const [aiTotalPoints, setAiTotalPoints] = useState("100");
  const [aiLevelCount, setAiLevelCount] = useState("4");

  const aiGenerateMutation = useMutation({
    mutationFn: () => generateRubricWithAI({ data: { description: aiDescription, totalPoints: Number(aiTotalPoints), levelCount: Number(aiLevelCount) } }),
    onSuccess: (generated) => {
      setForm({
        id: null,
        title: generated.title,
        description: generated.description,
        criteria: generated.criteria.map((criterion: Omit<Criterion, "key" | "id">) => ({
          key: newKey(), title: criterion.title, description: criterion.description,
          max_points: criterion.max_points,
          levels: criterion.levels.map((level: Omit<RubricLevel, "key" | "id">) => ({ key: newKey(), label: level.label, description: level.description, points: level.points })),
        })),
      });
      toast.success("Rubric generated. Review it and edit anything before saving.");
    },
    onError: (error: Error) => toast.error(error.message || "Could not generate a rubric."),
  });

  const rubricsQuery = useQuery({
    queryKey: ["rubrics"],
    enabled: allowed,
    queryFn: async () => {
      const result = await db
        .from("rubrics")
        .select(
          "id,title,description,created_at,updated_at,rubric_criteria(id,position,title,description,max_points,rubric_levels(id,position,label,description,points))",
        )
        .order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      return (result.data ?? []).map((rubric: any) => ({
        ...rubric,
        rubric_criteria: [...(rubric.rubric_criteria ?? [])]
          .sort((a: any, b: any) => a.position - b.position)
          .map((criterion: any) => ({
            ...criterion,
            rubric_levels: [...(criterion.rubric_levels ?? [])].sort(
              (a: any, b: any) => a.position - b.position,
            ),
          })),
      }));
    },
  });

  const totalPoints = useMemo(
    () => form.criteria.reduce((sum, criterion) => sum + Number(criterion.max_points || 0), 0),
    [form.criteria],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const title = form.title.trim();
      if (!title) throw new Error("Add a rubric title before saving.");
      if (form.criteria.length === 0) throw new Error("Add at least one criterion.");
      for (const [index, criterion] of form.criteria.entries()) {
        if (!criterion.title.trim()) throw new Error(`Add a title for criterion ${index + 1}.`);
        if (!Number.isFinite(Number(criterion.max_points)) || Number(criterion.max_points) <= 0) {
          throw new Error(`Enter a maximum score greater than zero for “${criterion.title}”.`);
        }
        if (criterion.levels.length === 0) {
          throw new Error(`Add at least one performance level for “${criterion.title}”.`);
        }
        for (const level of criterion.levels) {
          if (!level.label.trim()) throw new Error(`Name every performance level in “${criterion.title}”.`);
          if (!Number.isFinite(Number(level.points)) || Number(level.points) < 0) {
            throw new Error(`Enter a valid score for “${level.label}”.`);
          }
          if (Number(level.points) > Number(criterion.max_points)) {
            throw new Error(`“${level.label}” cannot score more than the ${criterion.max_points}-point maximum for “${criterion.title}”.`);
          }
        }
      }

      const userResult = await db.auth.getUser();
      if (userResult.error) throw userResult.error;
      if (!userResult.data.user) throw new Error("Your session has expired. Sign in again.");

      let rubricId = form.id as string;
      if (form.id) {
        // Protect historical grading records: removing a criterion that has been graded
        // would cascade-delete those records, so prevent that edit.
        const existingResult = await db.from("rubric_criteria").select("id").eq("rubric_id", form.id);
        if (existingResult.error) throw existingResult.error;
        const currentIds = new Set(form.criteria.flatMap((criterion) => criterion.id ? [criterion.id] : []));
        const removedIds = (existingResult.data ?? [])
          .map((criterion: any) => criterion.id as string)
          .filter((id: string) => !currentIds.has(id));

        if (removedIds.length) {
          const gradesResult = await db
            .from("rubric_grades")
            .select("criterion_id")
            .in("criterion_id", removedIds)
            .limit(1);
          if (gradesResult.error) throw gradesResult.error;
          if ((gradesResult.data ?? []).length > 0) {
            throw new Error(
              "A criterion you removed has already been used for grading. Keep it in this rubric to preserve those grades, or create a separate rubric for future work.",
            );
          }
        }

        const updateResult = await db
          .from("rubrics")
          .update({
            title,
            description: form.description.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", form.id);
        if (updateResult.error) throw updateResult.error;

        if (removedIds.length) {
          const deleteResult = await db.from("rubric_criteria").delete().in("id", removedIds);
          if (deleteResult.error) throw deleteResult.error;
        }
      } else {
        const createResult = await db
          .from("rubrics")
          .insert({
            owner_id: userResult.data.user.id,
            title,
            description: form.description.trim() || null,
          })
          .select("id")
          .single();
        if (createResult.error) throw createResult.error;
        rubricId = createResult.data.id;
      }

      for (const [position, criterion] of form.criteria.entries()) {
        let criterionId = criterion.id;
        const criterionValues = {
          rubric_id: rubricId,
          position,
          title: criterion.title.trim(),
          description: criterion.description.trim() || null,
          max_points: Number(criterion.max_points),
        };

        if (criterionId) {
          const updateCriterion = await db
            .from("rubric_criteria")
            .update(criterionValues)
            .eq("id", criterionId);
          if (updateCriterion.error) throw updateCriterion.error;
        } else {
          const insertCriterion = await db
            .from("rubric_criteria")
            .insert(criterionValues)
            .select("id")
            .single();
          if (insertCriterion.error) throw insertCriterion.error;
          criterionId = insertCriterion.data.id;
        }

        const levelsResult = await db.from("rubric_levels").select("id").eq("criterion_id", criterionId);
        if (levelsResult.error) throw levelsResult.error;
        const levelIds = new Set(criterion.levels.flatMap((level) => level.id ? [level.id] : []));
        const removedLevelIds = (levelsResult.data ?? [])
          .map((level: any) => level.id as string)
          .filter((id: string) => !levelIds.has(id));
        if (removedLevelIds.length) {
          const removeLevels = await db.from("rubric_levels").delete().in("id", removedLevelIds);
          if (removeLevels.error) throw removeLevels.error;
        }

        for (const [levelPosition, level] of criterion.levels.entries()) {
          const levelValues = {
            criterion_id: criterionId,
            position: levelPosition,
            label: level.label.trim(),
            description: level.description.trim() || null,
            points: Number(level.points),
          };
          if (level.id) {
            const updateLevel = await db.from("rubric_levels").update(levelValues).eq("id", level.id);
            if (updateLevel.error) throw updateLevel.error;
          } else {
            const insertLevel = await db.from("rubric_levels").insert(levelValues);
            if (insertLevel.error) throw insertLevel.error;
          }
        }
      }
      return form.id ? "updated" : "created";
    },
    onSuccess: async (action) => {
      toast.success(action === "updated" ? "Rubric updated" : "Rubric created");
      setEditorOpen(false);
      await qc.invalidateQueries({ queryKey: ["rubrics"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save this rubric."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await db.from("rubrics").delete().eq("id", id);
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      toast.success("Rubric deleted");
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ["rubrics"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete this rubric."),
  });

  function openNew() {
    setForm(emptyForm());
    setAiDescription("");
    setAiTotalPoints("100");
    setAiLevelCount("4");
    setEditorOpen(true);
  }

  function openEdit(rubric: any) {
    setForm({
      id: rubric.id,
      title: rubric.title ?? "",
      description: rubric.description ?? "",
      criteria: (rubric.rubric_criteria ?? []).map((criterion: any) => ({
        id: criterion.id,
        key: criterion.id ?? newKey(),
        title: criterion.title ?? "",
        description: criterion.description ?? "",
        max_points: Number(criterion.max_points ?? 1),
        levels: (criterion.rubric_levels ?? []).map((level: any) => ({
          id: level.id,
          key: level.id ?? newKey(),
          label: level.label ?? "",
          description: level.description ?? "",
          points: Number(level.points ?? 0),
        })),
      })),
    });
    setEditorOpen(true);
  }

  function updateCriterion(key: string, updates: Partial<Criterion>) {
    setForm((current) => ({
      ...current,
      criteria: current.criteria.map((criterion) =>
        criterion.key === key ? { ...criterion, ...updates } : criterion,
      ),
    }));
  }

  function updateLevel(criterionKey: string, levelKey: string, updates: Partial<RubricLevel>) {
    setForm((current) => ({
      ...current,
      criteria: current.criteria.map((criterion) =>
        criterion.key === criterionKey
          ? {
              ...criterion,
              levels: criterion.levels.map((level) =>
                level.key === levelKey ? { ...level, ...updates } : level,
              ),
            }
          : criterion,
      ),
    }));
  }

  if (!allowed) {
    return <div className="panel p-10 text-center text-sm text-muted-foreground">Rubrics are available on eligible teacher plans.</div>;
  }

  return (
    <PlanGate feature="rubrics">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-primary" aria-hidden="true" />
              <h1 className="text-2xl font-semibold tracking-tight">Rubrics</h1>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Build reusable grading guides with clear criteria, performance levels, and points.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 size-4" />
            Create rubric
          </Button>
        </header>

        {rubricsQuery.isLoading ? (
          <div className="panel p-8 text-sm text-muted-foreground">Loading your rubrics…</div>
        ) : rubricsQuery.isError ? (
          <div className="panel space-y-3 p-8">
            <p className="font-medium">Rubrics couldn’t be loaded.</p>
            <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
            <Button variant="outline" onClick={() => rubricsQuery.refetch()}>Try again</Button>
          </div>
        ) : (rubricsQuery.data ?? []).length === 0 ? (
          <div className="panel flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <BookOpen className="size-6" />
            </div>
            <h2 className="font-semibold">Start with your first rubric</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Add criteria such as accuracy and presentation, then set the score for each performance level.
            </p>
            <Button className="mt-5" onClick={openNew}><Plus className="mr-2 size-4" />Create rubric</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {(rubricsQuery.data ?? []).map((rubric: any) => {
              const criteria = rubric.rubric_criteria ?? [];
              const points = criteria.reduce((sum: number, criterion: any) => sum + Number(criterion.max_points || 0), 0);
              const isExpanded = expanded[rubric.id] ?? true;
              return (
                <article key={rubric.id} className="panel min-w-0 overflow-hidden">
                  <div className="flex flex-col gap-4 border-b border-border/70 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words text-lg font-semibold">{rubric.title}</h2>
                      {rubric.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{rubric.description}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                          {criteria.length} {criteria.length === 1 ? "criterion" : "criteria"}
                        </span>
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                          {points} total points
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Updated {new Date(rubric.updated_at ?? rubric.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(rubric)}>
                        <Pencil className="mr-2 size-4" />Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${rubric.title}`}
                        title="Delete rubric"
                        onClick={() => setDeleteTarget({ id: rubric.id, title: rubric.title })}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={isExpanded ? "Hide rubric details" : "Show rubric details"}
                        title={isExpanded ? "Hide details" : "Show details"}
                        onClick={() => setExpanded((current) => ({ ...current, [rubric.id]: !isExpanded }))}
                      >
                        {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 p-4 sm:p-5">
                      {criteria.length === 0 ? (
                        <p className="text-sm text-muted-foreground">This rubric doesn’t have any criteria yet. Select Edit to add some.</p>
                      ) : criteria.map((criterion: any, index: number) => (
                        <section key={criterion.id} className="rounded-xl border border-border/80 bg-background p-3 sm:p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">{index + 1}</span>
                              <div className="min-w-0">
                                <h3 className="break-words font-medium">{criterion.title}</h3>
                                {criterion.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{criterion.description}</p>}
                              </div>
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{criterion.max_points} pts</span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {(criterion.rubric_levels ?? []).map((level: any) => (
                              <div key={level.id} className="min-w-0 rounded-lg bg-muted/50 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="break-words text-sm font-medium">{level.label}</p>
                                  <span className="shrink-0 rounded-md bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">{level.points}</span>
                                </div>
                                {level.description && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{level.description}</p>}
                              </div>
                            ))}
                            {!(criterion.rubric_levels ?? []).length && <p className="text-sm text-muted-foreground">No performance levels.</p>}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit rubric" : "Create a rubric"}</DialogTitle>
              <DialogDescription>
                Name the rubric, add each criterion, and describe what each score means. Changes are saved when you select Save rubric.
              </DialogDescription>
            </DialogHeader>

            {!form.id && (
              <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <h3 className="font-semibold">Generate with AI</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Describe the assignment and how you want it graded. AI will draft criteria, performance levels, descriptions, and points for you to review.
                </p>
                <Textarea
                  value={aiDescription}
                  onChange={(event) => setAiDescription(event.target.value)}
                  placeholder="Example: Create a 100-point rubric for a robotics project report. Prioritize technical accuracy, design justification, testing results, diagrams, and presentation. Reward evidence-based reasoning and clear explanations."
                  rows={4}
                  maxLength={4000}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-rubric-total">Total marks</Label>
                    <Input id="ai-rubric-total" type="number" min="1" max="500" value={aiTotalPoints} onChange={(event) => setAiTotalPoints(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-rubric-levels">Performance levels</Label>
                    <select id="ai-rubric-levels" value={aiLevelCount} onChange={(event) => setAiLevelCount(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="2">2 levels</option>
                      <option value="3">3 levels</option>
                      <option value="4">4 levels</option>
                      <option value="5">5 levels</option>
                    </select>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => aiGenerateMutation.mutate()}
                  disabled={aiGenerateMutation.isPending || aiDescription.trim().length < 20 || !(Number(aiTotalPoints) > 0)}
                >
                  {aiGenerateMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                  {aiGenerateMutation.isPending ? "Generating rubric…" : "Generate rubric"}
                </Button>
                <p className="text-xs text-muted-foreground">This fills the editor but does not save automatically. Check the criteria and scores before saving.</p>
              </section>
            )}

            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rubric-title">Rubric name <span className="text-destructive">*</span></Label>
                  <Input
                    id="rubric-title"
                    autoFocus
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="e.g. Research assignment"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rubric-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    id="rubric-description"
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="What is this rubric used to assess?"
                    rows={2}
                    maxLength={1000}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <div>
                  <p className="font-medium">Grading criteria</p>
                  <p className="text-xs text-muted-foreground">Each criterion has its own maximum score and performance levels.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">{totalPoints} total points</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((current) => ({ ...current, criteria: [...current.criteria, makeCriterion()] }))}
                  >
                    <Plus className="mr-1.5 size-4" />Add criterion
                  </Button>
                </div>
              </div>

              {form.criteria.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">No criteria added yet.</p>
                  <Button className="mt-3" variant="outline" onClick={() => setForm((current) => ({ ...current, criteria: [makeCriterion()] }))}>
                    <Plus className="mr-2 size-4" />Add first criterion
                  </Button>
                </div>
              )}

              <div className="space-y-4">
                {form.criteria.map((criterion, index) => (
                  <section key={criterion.key} className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="font-semibold">Criterion {index + 1}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setForm((current) => ({
                          ...current,
                          criteria: current.criteria.filter((item) => item.key !== criterion.key),
                        }))}
                      >
                        <Trash2 className="mr-1.5 size-4" />Remove criterion
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                      <div className="space-y-2">
                        <Label htmlFor={`criterion-title-${criterion.key}`}>Criterion name <span className="text-destructive">*</span></Label>
                        <Input
                          id={`criterion-title-${criterion.key}`}
                          value={criterion.title}
                          onChange={(event) => updateCriterion(criterion.key, { title: event.target.value })}
                          placeholder="e.g. Technical accuracy"
                          maxLength={120}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`criterion-points-${criterion.key}`}>Maximum points</Label>
                        <Input
                          id={`criterion-points-${criterion.key}`}
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={criterion.max_points}
                          onChange={(event) => updateCriterion(criterion.key, { max_points: Number(event.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label htmlFor={`criterion-description-${criterion.key}`}>What is being assessed? <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Textarea
                        id={`criterion-description-${criterion.key}`}
                        value={criterion.description}
                        onChange={(event) => updateCriterion(criterion.key, { description: event.target.value })}
                        placeholder="Explain what students should demonstrate."
                        rows={2}
                        maxLength={800}
                      />
                    </div>

                    <div className="mt-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Performance levels</p>
                          <p className="text-xs text-muted-foreground">Use clear descriptions so students understand each score.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateCriterion(criterion.key, {
                            levels: [...criterion.levels, makeLevel("New level", 0)],
                          })}
                        >
                          <Plus className="mr-1.5 size-4" />Add level
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {criterion.levels.map((level, levelIndex) => (
                          <div key={level.key} className="grid min-w-0 gap-3 rounded-lg bg-muted/35 p-3 sm:grid-cols-[minmax(0,1fr)_100px_40px]">
                            <div className="min-w-0 space-y-2">
                              <Label htmlFor={`level-label-${level.key}`}>Level {levelIndex + 1} name</Label>
                              <Input
                                id={`level-label-${level.key}`}
                                value={level.label}
                                onChange={(event) => updateLevel(criterion.key, level.key, { label: event.target.value })}
                                placeholder="e.g. Excellent"
                                maxLength={80}
                              />
                              <Label htmlFor={`level-description-${level.key}`}>Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                              <Textarea
                                id={`level-description-${level.key}`}
                                value={level.description}
                                onChange={(event) => updateLevel(criterion.key, level.key, { description: event.target.value })}
                                placeholder="What does this level look like?"
                                rows={2}
                                maxLength={500}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`level-points-${level.key}`}>Points</Label>
                              <Input
                                id={`level-points-${level.key}`}
                                type="number"
                                min="0"
                                max={criterion.max_points}
                                step="0.5"
                                value={level.points}
                                onChange={(event) => updateLevel(criterion.key, level.key, { points: Number(event.target.value) })}
                              />
                              <p className="text-xs text-muted-foreground">Up to {criterion.max_points}</p>
                            </div>
                            <div className="flex items-start justify-end sm:justify-center sm:pt-7">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${level.label || "performance level"}`}
                                title="Remove level"
                                disabled={criterion.levels.length <= 1}
                                onClick={() => updateCriterion(criterion.key, {
                                  levels: criterion.levels.filter((item) => item.key !== level.key),
                                })}
                              >
                                {criterion.levels.length <= 1 ? <X className="size-4 text-muted-foreground" /> : <Trash2 className="size-4 text-destructive" />}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 border-t border-border pt-4 sm:gap-0">
              <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saveMutation.isPending}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : form.id ? "Save changes" : "Save rubric"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this rubric?</AlertDialogTitle>
              <AlertDialogDescription>
                “{deleteTarget?.title}” will be permanently deleted. Its criteria and any rubric grades connected to those criteria may also be deleted. Assignments using this rubric will be unlinked. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(event) => {
                  event.preventDefault();
                  if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete rubric"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PlanGate>
  );
}
