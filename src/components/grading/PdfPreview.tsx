import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfPreview({ url, fileName }: { url: string; fileName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | null = null;
    setLoading(true);
    setError("");
    setDocument(null);
    setPageNumber(1);

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error("The private file link may have expired. Close and reopen the submission, then try again.");
        }
        return response.arrayBuffer();
      })
      .then((buffer) => pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise)
      .then((pdf) => {
        loaded = pdf;
        if (!active) {
          void pdf.destroy();
          return;
        }
        setDocument(pdf);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "The browser could not load this PDF.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (loaded) void loaded.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!document || !canvasRef.current || !containerRef.current) return;
    let active = true;
    let task: RenderTask | null = null;
    setRendering(true);
    setError("");

    const render = async () => {
      try {
        const page: PDFPageProxy = await document.getPage(pageNumber);
        if (!active || !canvasRef.current || !containerRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(280, containerRef.current.clientWidth - 32);
        const scale = Math.min(2.5, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser could not create a canvas for the PDF preview.");

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        task = page.render({ canvasContext: context, viewport });
        await task.promise;
      } catch (cause: unknown) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not render this PDF page.");
      } finally {
        if (active) setRendering(false);
      }
    };

    void render();
    return () => {
      active = false;
      task?.cancel();
    };
  }, [document, pageNumber]);

  return (
    <div ref={containerRef} className="h-full min-h-0 overflow-auto p-3 sm:p-5">
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Opening private PDF preview…</p>
      ) : error ? (
        <div className="mx-auto max-w-xl py-12 text-center">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">The file remains private. Try reopening this submission to refresh its temporary link.</p>
        </div>
      ) : document ? (
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3">
          <div className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background/95 p-2 backdrop-blur">
            <Button type="button" size="sm" variant="outline" disabled={pageNumber <= 1 || rendering} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {pageNumber} of {document.numPages}{rendering ? " · Rendering…" : ""}</span>
            <Button type="button" size="sm" variant="outline" disabled={pageNumber >= document.numPages || rendering} onClick={() => setPageNumber((value) => Math.min(document.numPages, value + 1))}>Next</Button>
          </div>
          <div className="w-full overflow-auto rounded-md border border-border bg-white p-2 shadow-sm">
            <canvas ref={canvasRef} role="img" aria-label={`${fileName}, page ${pageNumber}`} className="mx-auto block max-w-full" />
          </div>
          <p className="text-center text-xs text-muted-foreground">Rendered securely in ONYX; no external document viewer is used.</p>
        </div>
      ) : null}
    </div>
  );
}
