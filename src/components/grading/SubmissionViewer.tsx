import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Download, FileUp, Loader2, ScanText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyzeHandwritingFile } from "@/lib/differentiation.functions";
import { FilePreviewDialog, type PreviewableFile } from "@/components/grading/FilePreviewDialog";
import { useState } from "react";
import { RenderMathText } from "@/components/math/RenderMathText";
import { formatDue } from "@/lib/assignments";

export type ViewerFile = {
  id: string;
  kind: string;
  url: string;
  file_name: string;
  mime_type?: string | null;
  caption: string | null;
};

export type ViewerViolation = { id: string; kind: string; occurred_at: string };

function isPhotoFile(file: ViewerFile) {
  return Boolean(
    file.mime_type?.startsWith("image/") ||
      /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.file_name ?? ""),
  );
}

function HandwritingAssist({ file }: { file: ViewerFile }) {
  const analyze = useServerFn(analyzeHandwritingFile);
  const mutation = useMutation({
    mutationFn: () => analyze({ data: { fileId: file.id } }),
  });

  return (
    <div className="space-y-2 border-t border-border p-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ScanText className="mr-2 size-4" />}
        {mutation.isPending ? "Transcribing…" : "Assist with transcription"}
      </Button>
      <p className="text-xs text-muted-foreground">
        AI transcription is a draft for the teacher to verify. It does not grade the answer or change marks.
      </p>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {(mutation.error as Error).message || "Handwriting transcription failed."}
        </p>
      )}
      {mutation.data && (
        <div className="space-y-3 rounded-md bg-muted/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Transcription draft</p>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {mutation.data.confidence} confidence
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{mutation.data.transcription}</p>
          {mutation.data.unclearSegments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Please verify these segments</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                {mutation.data.unclearSegments.map((segment, index) => <li key={`${index}-${segment}`}>{segment}</li>)}
              </ul>
            </div>
          )}
          {mutation.data.observations.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Image legibility</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                {mutation.data.observations.map((observation, index) => <li key={`${index}-${observation}`}>{observation}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function supportsHandwritingAssist(file: ViewerFile) {
  const mime = file.mime_type?.toLowerCase();
  return mime ? ["image/jpeg", "image/png", "image/webp"].includes(mime) : /\.(jpe?g|png|webp)$/i.test(file.file_name ?? "");
}

/** The student's work: photographed pages, typed answer with equations, and paste warnings. */
export function SubmissionViewer({
  files,
  typedContent,
  violations,
  violationCount,
}: {
  files: ViewerFile[];
  typedContent: string | null;
  violations: ViewerViolation[];
  violationCount: number;
}) {
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const pages = files.filter((f) => f.kind === "page" || f.kind === "attachment");
  const inline = files.filter((f) => f.kind === "inline_image");
  const hasWork = pages.length > 0 || Boolean(typedContent);

  return (
    <div className="space-y-5">
      {violationCount > 0 && (
        <div className="panel border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <ShieldAlert className="size-4" />
            {violationCount} blocked copy/paste attempt{violationCount === 1 ? "" : "s"}
          </p>
          {violations.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {violations.slice(0, 5).map((v) => (
                <li key={v.id}>
                  {v.kind} · {formatDue(v.occurred_at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!hasWork && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          This submission has no files or typed answer.
        </div>
      )}

      {pages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Uploaded files & photos ({pages.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {pages.map((p, i) => (
              <figure key={p.id} className="panel min-w-0 overflow-hidden p-0">
                {isPhotoFile(p) ? (
                  <button type="button" onClick={() => setPreviewFile(p)} aria-label={`Preview ${p.file_name || `photo ${i + 1}`}`} className="block w-full cursor-zoom-in">
                    <img src={p.url} alt={p.file_name || `Photo ${i + 1}`} loading="lazy" className="max-h-[70vh] w-full bg-muted/30 object-contain" />
                  </button>
                ) : (
                  <button type="button" onClick={() => setPreviewFile(p)} className="flex min-h-28 w-full items-center gap-3 p-4 text-left hover:bg-accent/40">
                    <FileUp className="size-6 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">{p.file_name}</span>
                    <span className="text-xs font-medium text-primary">Preview</span>
                  </button>
                )}
                <figcaption className="break-words px-3 py-2 text-xs text-muted-foreground">{p.file_name || `File ${i + 1}`}</figcaption>
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3"><Button type="button" variant="outline" size="sm" onClick={() => setPreviewFile(p)}>Preview file</Button></div>
                {isPhotoFile(p) && supportsHandwritingAssist(p) && <HandwritingAssist file={p} />}
              </figure>
            ))}
          </div>
        </section>
      )}

      <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />

      {typedContent && (
        <section className="panel p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Typed answer
          </h2>
          <RenderMathText text={typedContent} className="mt-3 text-[15px] leading-7" />
          {inline.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {inline.map((f) => (
                <figure key={f.id}>
                  <img
                    src={f.url}
                    alt={f.caption || "Student illustration"}
                    loading="lazy"
                    className="w-full rounded-md border border-border object-cover"
                  />
                  {f.caption && (
                    <figcaption className="mt-1 text-xs text-muted-foreground">
                      {f.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
