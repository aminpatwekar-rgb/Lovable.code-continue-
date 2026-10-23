/**
 * Study-material extraction. Runs in the browser: files are parsed on the
 * device, then the text plus any visual content (PDF pages, images, pictures
 * embedded in Word / PowerPoint) is sent to the AI generator.
 * All heavy parsers are dynamically imported so they stay out of the SSR graph.
 */

import type { MaterialAttachment } from "./attachments";

export const ACCEPTED_MATERIAL =
  ".pdf,.docx,.doc,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,application/pdf,text/plain,image/*";

const MAX_IMAGE_EDGE = 1600;
const MAX_EMBEDDED_IMAGES_PER_FILE = 12;
const MIN_EMBEDDED_IMAGE_BYTES = 4 * 1024; // skips bullets, icons and logos
const MAX_PDF_ATTACH_BYTES = 10 * 1024 * 1024;

export type ExtractedMaterial = { text: string; attachments: MaterialAttachment[] };

function bytesToBase64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Shrinks large photos/screenshots so requests stay small; falls back to the original. */
async function imageToAttachment(
  name: string,
  mime: string,
  bytes: Uint8Array,
): Promise<MaterialAttachment> {
  try {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bmp.width, bmp.height));
    if (scale < 1 || bytes.length > 1.5 * 1024 * 1024) {
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0, w, h);
        const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
        bmp.close?.();
        if (out) {
          const buf = new Uint8Array(await out.arrayBuffer());
          return { name, mime: "image/jpeg", data: bytesToBase64(buf) };
        }
      }
    }
    bmp.close?.();
  } catch {
    /* fall through to the raw bytes */
  }
  return { name, mime, data: bytesToBase64(bytes) };
}

export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;

function xmlText(xml: string) {
  return xml
    .replace(/<\/w:p>|<\/a:p>|<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromZipXml(
  file: File,
  match: (name: string) => boolean,
  mediaPrefix: string,
): Promise<ExtractedMaterial> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);
  const sortNames = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  const names = Object.keys(files).filter(match).sort(sortNames);
  const parts = names.map((n) => xmlText(strFromU8(files[n]!)));

  // Pictures, diagrams and screenshots embedded in the document.
  const attachments: MaterialAttachment[] = [];
  const media = Object.keys(files)
    .filter((n) => n.startsWith(mediaPrefix))
    .sort(sortNames);
  for (const n of media) {
    if (attachments.length >= MAX_EMBEDDED_IMAGES_PER_FILE) break;
    const ext = n.split(".").pop()?.toLowerCase() ?? "";
    const mime = IMAGE_MIME_BY_EXT[ext];
    const bytes = files[n]!;
    if (!mime || bytes.length < MIN_EMBEDDED_IMAGE_BYTES) continue; // emf/wmf/svg aren't supported
    attachments.push(await imageToAttachment(`${file.name} · ${n.split("/").pop()}`, mime, bytes));
  }
  return { text: parts.filter(Boolean).join("\n\n"), attachments };
}

async function fromPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((it) =>
          typeof (it as { str?: string }).str === "string" ? (it as { str: string }).str : "",
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  await doc.cleanup();
  return pages.filter(Boolean).join("\n\n");
}

export class UnsupportedMaterialError extends Error {}

/**
 * Reads a study file and returns BOTH its text and any visual content the AI
 * should actually look at (the PDF itself, uploaded images, pictures embedded
 * in Word / PowerPoint files).
 */
export async function extractMaterialWithMedia(file: File): Promise<ExtractedMaterial> {
  if (file.size > MAX_MATERIAL_BYTES) {
    throw new UnsupportedMaterialError("That file is larger than 20 MB.");
  }
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";

  if (IMAGE_MIME_BY_EXT[ext] || file.type.startsWith("image/")) {
    const mime = IMAGE_MIME_BY_EXT[ext] ?? file.type;
    if (!Object.values(IMAGE_MIME_BY_EXT).includes(mime)) {
      throw new UnsupportedMaterialError("Images must be PNG, JPG, WEBP or GIF.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { text: "", attachments: [await imageToAttachment(file.name, mime, bytes)] };
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return { text: (await file.text()).trim(), attachments: [] };
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await fromPdf(file).catch(() => "");
    const attachments: MaterialAttachment[] = [];
    if (file.size <= MAX_PDF_ATTACH_BYTES) {
      attachments.push({
        name: file.name,
        mime: "application/pdf",
        data: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
      });
    }
    return { text, attachments };
  }
  if (name.endsWith(".docx")) {
    return fromZipXml(
      file,
      (n) =>
        n === "word/document.xml" ||
        n.startsWith("word/footnotes") ||
        /^word\/charts\/chart\d+\.xml$/.test(n),
      "word/media/",
    );
  }
  if (name.endsWith(".pptx")) {
    return fromZipXml(
      file,
      (n) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(n) ||
        /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n) ||
        /^ppt\/charts\/chart\d+\.xml$/.test(n),
      "ppt/media/",
    );
  }
  if (name.endsWith(".doc") || name.endsWith(".ppt")) {
    throw new UnsupportedMaterialError(
      "Legacy .doc / .ppt files aren't readable — please save as .docx or .pptx and try again.",
    );
  }
  throw new UnsupportedMaterialError(
    "Unsupported file type. Use PDF, DOCX, PPTX, an image, or TXT.",
  );
}

/** Text-only variant kept for any caller that doesn't handle attachments. */
export async function extractMaterial(file: File): Promise<string> {
  return (await extractMaterialWithMedia(file)).text;
}
