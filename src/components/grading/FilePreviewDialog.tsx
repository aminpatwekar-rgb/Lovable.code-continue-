import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfficePreview } from "@/components/grading/OfficePreview";
import { PdfPreview } from "@/components/grading/PdfPreview";

export type PreviewableFile = {
  id: string;
  file_name: string;
  mime_type?: string | null;
  url: string;
};

function extension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' && quoted && source[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length >= 300) break;
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.slice(0, 30));
}

function kind(file: PreviewableFile) {
  const mime = file.mime_type?.toLowerCase() ?? "";
  const ext = extension(file.file_name);
  if (mime.startsWith("image/") || /^(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/.test(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "csv" || mime === "text/csv") return "csv";
  if (mime.startsWith("text/") || /^(txt|tsv|md|json|xml)$/.test(ext)) return "text";
  if (/^(ppt|pptx|doc|docx|xls|xlsx)$/.test(ext)) return "office";
  return "other";
}

/** In-app viewer for private submission files; URLs are short-lived Supabase signed URLs. */
export function FilePreviewDialog({ file, onClose }: { file: PreviewableFile | null; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const type = file ? kind(file) : "other";

  useEffect(() => {
    let active = true;
    setText(null);
    setError("");
    if (!file || (type !== "text" && type !== "csv")) return;
    setLoading(true);
    fetch(file.url)
      .then((response) => {
        if (!response.ok) throw new Error("The file link may have expired. Reopen the submission to refresh it.");
        return response.text();
      })
      .then((value) => { if (active) setText(value.slice(0, 1_000_000)); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not preview this file."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [file?.id, file?.url, type]);

  useEffect(() => {
    if (!file) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [file, onClose]);

  if (!file) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label={`Preview ${file.file_name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex h-[min(92vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <header className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3">
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.file_name}</p>
            <p className="text-xs text-muted-foreground">Private in-app preview</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={file.url} download={file.file_name}><Download className="mr-1.5 size-4" /> Download</a>
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview"><X className="size-5" /></Button>
        </header>
        <main className="min-h-0 flex-1 overflow-auto bg-muted/20">
          {type === "image" && <div className="flex h-full items-center justify-center p-3"><img src={file.url} alt={file.file_name} className="max-h-full max-w-full object-contain" /></div>}
          {type === "pdf" && <PdfPreview url={file.url} fileName={file.file_name} />}
          {type === "csv" && (
            <div className="h-full overflow-auto p-3">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading spreadsheet preview…
                </div>
              ) : error ? (
                <p role="alert" className="text-sm text-destructive">{error}</p>
              ) : (
                <div className="max-h-full overflow-auto rounded-md border border-border bg-background">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {parseCsv(text ?? "").map((row, ri) => (
                        <tr key={ri} className="border-b border-border last:border-0">
                          {row.map((cell, ci) => (
                            <td key={ci} className="min-w-24 border-r border-border px-3 py-2 align-top last:border-0">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Showing up to 300 rows and 30 columns.</p>
            </div>
          )}
          {type === "text" && (
            <div className="h-full overflow-auto p-4">
              {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading preview…</div>
                : error ? <p role="alert" className="text-sm text-destructive">{error}</p>
                : <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-4 font-mono text-xs leading-5">{text ?? ""}{text && text.length >= 1_000_000 ? "\n\n[Preview truncated at 1 MB of text]" : ""}</pre>}
            </div>
          )}
          {type === "office" && <OfficePreview url={file.url} fileName={file.file_name} />}
          {type === "other" && (
            <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
              <Maximize2 className="size-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{type === "office" ? "Office file preview needs conversion" : "Preview isn't available for this file type"}</h3>
              <p className="text-sm text-muted-foreground">{type === "office" ? "This PowerPoint, Word, or Excel file is private. ONYX needs a secure server-side renderer to display it here; opening it in a public online viewer could expose student work." : "You can download this file to open it in a compatible application."}</p>
              <Button asChild><a href={file.url} download={file.file_name}><Download className="mr-2 size-4" /> Download file</a></Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
