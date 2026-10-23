import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCEPTED_MATERIAL, extractMaterialWithMedia } from "@/lib/quiz/extract";
import {
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_TOTAL_BYTES,
  type MaterialAttachment,
} from "@/lib/quiz/attachments";
import { QUESTION_TYPES, type QuestionType } from "@/lib/quiz/types";

export type GenerationOptions = {
  material: string;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  types: QuestionType[];
  withExplanations: boolean;
  topic: string;
  attachments: MaterialAttachment[];
};

/**
 * Study-material intake + AI generation controls. Files are parsed in the
 * browser; the extracted text plus any visual content (PDF pages, images,
 * pictures inside Word / PowerPoint) is handed to the generator so the AI
 * actually looks at charts and diagrams.
 */
export function AiGeneratorPanel({
  busy,
  onGenerate,
  material,
  onMaterialChange,
  attachments,
  onAttachmentsChange,
}: {
  busy: boolean;
  material: string;
  onMaterialChange: (text: string) => void;
  attachments: MaterialAttachment[];
  onAttachmentsChange: (next: MaterialAttachment[]) => void;
  onGenerate: (opts: GenerationOptions) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState<GenerationOptions["difficulty"]>("mixed");
  const [types, setTypes] = useState<QuestionType[]>(["mcq", "true_false", "short_answer"]);
  const [withExplanations, setWithExplanations] = useState(true);
  const [topic, setTopic] = useState("");

  async function ingest(files: FileList | null) {
    if (!files?.length) return;
    setReading(true);
    let added = 0;
    let textSoFar = material;
    let attachedSoFar = attachments;
    let bytes = attachedSoFar.reduce((n, a) => n + a.data.length, 0);
    for (const file of Array.from(files)) {
      try {
        const { text, attachments: media } = await extractMaterialWithMedia(file);
        if (!text.trim() && !media.length) {
          toast.error(`Nothing readable found in ${file.name}`);
          continue;
        }
        const mediaBytes = media.reduce((n, a) => n + a.data.length, 0);
        let keep = media;
        if (
          bytes + mediaBytes > MAX_ATTACHMENT_TOTAL_BYTES ||
          attachedSoFar.length + media.length > MAX_ATTACHMENT_COUNT
        ) {
          keep = [];
          if (text.trim()) {
            toast.warning(`${file.name}: too many images/pages attached already, using its text only.`);
          } else {
            toast.error(`${file.name} can't be added — the attached files are too large together.`);
            continue;
          }
        }
        if (text.trim()) {
          textSoFar = [textSoFar.trim(), `--- ${file.name} ---\n${text}`]
            .filter(Boolean)
            .join("\n\n");
          onMaterialChange(textSoFar);
        }
        if (keep.length) {
          attachedSoFar = [...attachedSoFar, ...keep];
          bytes += keep.reduce((n, a) => n + a.data.length, 0);
          onAttachmentsChange(attachedSoFar);
        }
        setSources((s) => [...s, file.name]);
        added += 1;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not read ${file.name}`);
      }
    }
    setReading(false);
    if (added) toast.success(`Added ${added} file${added === 1 ? "" : "s"}`);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleType(t: QuestionType) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const wordCount = material.trim() ? material.trim().split(/\s+/).length : 0;
  const canGenerate =
    !busy && !reading && (wordCount >= 10 || attachments.length > 0) && types.length > 0;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void ingest(e.dataTransfer.files);
        }}
        className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center"
      >
        <FileUp className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-medium">Drop notes here or upload</p>
        <p className="text-xs text-muted-foreground">PDF, DOCX, PPTX, images (PNG/JPG) or TXT — up to 20 MB each. Charts, diagrams and slides are read visually.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={reading}
          onClick={() => fileRef.current?.click()}
        >
          {reading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          Choose files
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPTED_MATERIAL}
          className="hidden"
          onChange={(e) => void ingest(e.target.files)}
        />
      </div>

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((s, i) => (
            <span
              key={`${s}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs"
            >
              {s}
              <button
                type="button"
                aria-label={`Remove ${s} from the list`}
                onClick={() => setSources((prev) => prev.filter((_, j) => j !== i))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {attachments.length} visual file{attachments.length === 1 ? "" : "s"} attached (images /
          PDF pages) — the AI will look at them directly.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              onAttachmentsChange([]);
              setSources([]);
            }}
          >
            Clear all
          </button>
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="material">Study material</Label>
        <Textarea
          id="material"
          value={material}
          onChange={(e) => onMaterialChange(e.target.value)}
          placeholder="Paste the chapter, notes or syllabus text the questions should come from."
          className="min-h-40"
        />
        <p className="text-xs text-muted-foreground">{wordCount.toLocaleString()} words</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="gen-count">Questions</Label>
          <Input
            id="gen-count"
            type="number"
            min={1}
            max={30}
            value={count}
            onChange={(e) => setCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gen-diff">Difficulty</Label>
          <Select
            value={difficulty}
            onValueChange={(v) => setDifficulty(v as GenerationOptions["difficulty"])}
          >
            <SelectTrigger id="gen-diff" className="capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["mixed", "easy", "medium", "hard"] as const).map((d) => (
                <SelectItem key={d} value={d} className="capitalize">
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gen-topic">Topic focus (optional)</Label>
          <Input
            id="gen-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Photosynthesis"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Question types</legend>
        <div className="flex flex-wrap gap-3">
          {QUESTION_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={types.includes(t.value)}
                onCheckedChange={() => toggleType(t.value)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={withExplanations}
          onCheckedChange={(v) => setWithExplanations(Boolean(v))}
        />
        Include answer explanations
      </label>

      <Button
        type="button"
        disabled={!canGenerate}
        onClick={() => onGenerate({ material, count, difficulty, types, withExplanations, topic, attachments })}
        className="w-full"
      >
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 size-4" />
        )}
        {busy ? "Generating…" : `Generate ${count} question${count === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
