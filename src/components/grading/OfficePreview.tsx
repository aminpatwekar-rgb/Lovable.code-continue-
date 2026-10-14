import { useEffect, useState } from "react";
import { strFromU8, unzipSync } from "fflate";
import { Button } from "@/components/ui/button";

type OfficeKind = "pptx" | "docx" | "xlsx";
type SlideElement = { key: string; left: number; top: number; width: number; height: number; text?: string; imageSrc?: string };
type Slide = { width: number; height: number; elements: SlideElement[] };
type DocBlock = { type: "paragraph"; text: string; heading?: boolean } | { type: "table"; rows: string[][] };
type Sheet = { name: string; rows: string[][] };

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("This Office file contains invalid or unsupported XML.");
  return doc;
}
function all(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", name));
}
function first(root: Document | Element, name: string): Element | null {
  return all(root, name)[0] ?? null;
}
function value(node: Element | null, name: string) {
  return node ? (first(node, name)?.textContent ?? "") : "";
}
function normalizePath(base: string, target: string) {
  const parts = (target.startsWith("/") ? target.slice(1) : (base ? base + "/" : "") + target).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}
function relationships(zip: Record<string, Uint8Array>, path: string, baseDir: string) {
  const xml = zip[path];
  if (!xml) return new Map<string, string>();
  const doc = parseXml(strFromU8(xml));
  return new Map(all(doc, "Relationship").map((el) => [
    el.getAttribute("Id") ?? "",
    normalizePath(baseDir, el.getAttribute("Target") ?? ""),
  ]));
}
function textFromNode(node: Element) {
  return all(node, "t").map((t) => t.textContent ?? "").join("");
}
function slideText(node: Element) {
  return all(node, "p").map((paragraph) => all(paragraph, "t").map((t) => t.textContent ?? "").join("")).join("\n");
}
function colIndex(cellRef: string) {
  const letters = cellRef.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let index = 0;
  for (const ch of letters) index = index * 26 + ch.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}
function base64(bytes: Uint8Array) {
  let result = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    result += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(result);
}
function imageData(zip: Record<string, Uint8Array>, path: string) {
  const bytes = zip[path];
  if (!bytes) return undefined;
  const ext = path.split(".").pop()?.toLowerCase();
  const mime: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", tif: "image/tiff", tiff: "image/tiff" };
  const type = mime[ext ?? ""] ?? "application/octet-stream";
  return `data:${type};base64,${base64(bytes)}`;
}
function readPresentation(zip: Record<string, Uint8Array>): Slide[] {
  const presentationBytes = zip["ppt/presentation.xml"];
  if (!presentationBytes) throw new Error("This file does not contain a PowerPoint presentation.");
  const presentation = parseXml(strFromU8(presentationBytes));
  const size = first(presentation, "sldSz");
  const slideW = Number(size?.getAttribute("cx") ?? 9144000);
  const slideH = Number(size?.getAttribute("cy") ?? 5143500);
  const rels = relationships(zip, "ppt/_rels/presentation.xml.rels", "ppt");
  const slideOrder = all(presentation, "sldId").map((el) => rels.get(el.getAttribute("r:id") ?? el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "")).filter((p): p is string => Boolean(p));
  const paths = slideOrder.length ? slideOrder : Object.keys(zip).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
  if (!paths.length) throw new Error("No slides were found in this presentation.");
  return paths.map((path, slideIndex) => {
    const doc = parseXml(strFromU8(zip[path]));
    const slideRelsPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
    const relsForSlide = relationships(zip, slideRelsPath, path.slice(0, path.lastIndexOf("/")));
    const tree = first(doc, "spTree");
    const elements: SlideElement[] = [];
    if (tree) {
      Array.from(tree.children).forEach((shape, shapeIndex) => {
        if (!["sp", "pic"].includes(shape.localName)) return;
        const off = first(shape, "off");
        const ext = first(shape, "ext");
        const x = Number(off?.getAttribute("x") ?? 0);
        const y = Number(off?.getAttribute("y") ?? 0);
        const cx = Number(ext?.getAttribute("cx") ?? slideW * 0.2);
        const cy = Number(ext?.getAttribute("cy") ?? slideH * 0.08);
        const base = {
          key: `${slideIndex}-${shapeIndex}`,
          left: Math.max(0, x / slideW * 100),
          top: Math.max(0, y / slideH * 100),
          width: Math.min(100, cx / slideW * 100),
          height: Math.min(100, cy / slideH * 100),
        };
        if (shape.localName === "pic") {
          const blip = first(shape, "blip");
          const relId = blip?.getAttribute("r:embed") ?? blip?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") ?? "";
          const mediaPath = relsForSlide.get(relId);
          const src = mediaPath ? imageData(zip, mediaPath) : undefined;
          if (src) elements.push({ ...base, imageSrc: src });
        } else {
          const text = slideText(shape);
          if (text.trim()) elements.push({ ...base, text });
        }
      });
    }
    return { width: slideW, height: slideH, elements };
  });
}
function readDocument(zip: Record<string, Uint8Array>): DocBlock[] {
  const bytes = zip["word/document.xml"];
  if (!bytes) throw new Error("This file does not contain a Word document.");
  const doc = parseXml(strFromU8(bytes));
  const body = first(doc, "body");
  if (!body) return [];
  return Array.from(body.children).flatMap((node): DocBlock[] => {
    if (node.localName === "p") {
      const text = textFromNode(node);
      if (!text.trim()) return [];
      const style = value(first(node, "pPr") ?? node, "pStyle");
      return [{ type: "paragraph", text, heading: /^heading/i.test(style) }];
    }
    if (node.localName === "tbl") {
      const rows = all(node, "tr").map((row) => all(row, "tc").map((cell) => all(cell, "p").map(textFromNode).join("\n")));
      return [{ type: "table", rows }];
    }
    return [];
  });
}
function readWorkbook(zip: Record<string, Uint8Array>): Sheet[] {
  const workbookBytes = zip["xl/workbook.xml"];
  if (!workbookBytes) throw new Error("This file does not contain an Excel workbook.");
  const workbook = parseXml(strFromU8(workbookBytes));
  const workbookRels = relationships(zip, "xl/_rels/workbook.xml.rels", "xl");
  const sharedDoc = zip["xl/sharedStrings.xml"] ? parseXml(strFromU8(zip["xl/sharedStrings.xml"])) : null;
  const shared = sharedDoc ? all(sharedDoc, "si").map(textFromNode) : [];
  return all(workbook, "sheet").map((sheet) => {
    const name = sheet.getAttribute("name") || "Sheet";
    const relId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const path = workbookRels.get(relId);
    if (!path || !zip[path]) return { name, rows: [] };
    const doc = parseXml(strFromU8(zip[path]));
    const matrix: string[][] = [];
    for (const row of all(doc, "row").slice(0, 250)) {
      const cells: string[] = [];
      for (const cell of all(row, "c")) {
        const idx = colIndex(cell.getAttribute("r") ?? "A1");
        if (idx > 49) continue;
        const type = cell.getAttribute("t");
        let val = type === "inlineStr" ? textFromNode(cell) : value(cell, "v");
        if (type === "s") val = shared[Number(val)] ?? val;
        if (type === "b") val = val === "1" ? "TRUE" : "FALSE";
        cells[idx] = val;
      }
      matrix.push(Array.from({ length: cells.length }, (_, idx) => cells[idx] ?? ""));
    }
    return { name, rows: matrix.map((row) => row ?? []) };
  });
}

export function OfficePreview({ url, fileName }: { url: string; fileName: string }) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setSlides([]); setBlocks([]); setSheets([]); setSheetIndex(0); setSlideIndex(0); setSheetIndex(0); setSlideIndex(0);
    fetch(url).then((response) => {
      if (!response.ok) throw new Error("The private file link expired. Close and reopen the submission to refresh it.");
      return response.arrayBuffer();
    }).then((buffer) => {
      if (!active) return;
      const zip = unzipSync(new Uint8Array(buffer));
      if (ext === "pptx") setSlides(readPresentation(zip));
      else if (ext === "docx") setBlocks(readDocument(zip));
      else if (ext === "xlsx") setSheets(readWorkbook(zip));
      else throw new Error("This older binary Office format cannot be rendered in the browser. Download it to open in an Office-compatible application.");
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not render this Office file.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url, ext]);

  const currentSheet = sheets[sheetIndex];
  const slide = slides[slideIndex];
  const unsupported = !["pptx", "docx", "xlsx"].includes(ext ?? "");
  return (
    <div className="h-full min-h-0 overflow-auto p-3 sm:p-5">
      {loading ? <div className="py-12 text-center text-sm text-muted-foreground">Preparing private file preview…</div>
        : error ? <div className="mx-auto max-w-xl py-12 text-center"><p role="alert" className="text-sm text-destructive">{error}</p></div>
        : unsupported ? <p className="py-10 text-center text-sm text-muted-foreground">Use the Download option for this legacy format.</p>
        : ext === "pptx" && slide ? (
          <div className="mx-auto max-w-5xl space-y-3">
            <div className="flex items-center justify-between gap-3"><Button variant="outline" size="sm" disabled={slideIndex === 0} onClick={() => setSlideIndex((n) => n - 1)}>Previous</Button><span className="text-sm text-muted-foreground">Slide {slideIndex + 1} of {slides.length}</span><Button variant="outline" size="sm" disabled={slideIndex >= slides.length - 1} onClick={() => setSlideIndex((n) => n + 1)}>Next</Button></div>
            <div className="relative mx-auto w-full overflow-hidden border border-border bg-white shadow-sm" style={{ aspectRatio: `${slide.width} / ${slide.height}` }}>
              {slide.elements.map((element) => element.imageSrc ? <img key={element.key} src={element.imageSrc} alt="" className="absolute object-contain" style={{ left: `${element.left}%`, top: `${element.top}%`, width: `${element.width}%`, height: `${element.height}%` }} /> : <div key={element.key} className="absolute overflow-hidden whitespace-pre-wrap break-words px-1 py-0.5 text-[clamp(7px,1.4vw,20px)] leading-tight text-slate-900" style={{ left: `${element.left}%`, top: `${element.top}%`, width: `${element.width}%`, height: `${element.height}%` }}>{element.text}</div>)}
            </div>
            <p className="text-center text-xs text-muted-foreground">Basic browser rendering; complex slide effects and formatting may differ from PowerPoint.</p>
          </div>
        ) : ext === "docx" ? (
          <article className="mx-auto max-w-4xl space-y-2 border border-border bg-background p-6 sm:p-10">
            {blocks.length ? blocks.map((block, i) => block.type === "paragraph" ? <p key={i} className={block.heading ? "pt-3 text-lg font-semibold" : "whitespace-pre-wrap text-sm leading-6"}>{block.text}</p> : <div key={i} className="overflow-auto"><table className="w-full border-collapse text-sm"><tbody>{block.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="border border-border p-2 align-top">{cell}</td>)}</tr>)}</tbody></table></div>) : <p className="text-sm text-muted-foreground">This document has no readable text.</p>}
            <p className="pt-4 text-xs text-muted-foreground">Text and tables are rendered in-browser; advanced page layout, embedded objects and some styles may differ from Word.</p>
          </article>
        ) : ext === "xlsx" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">{sheets.map((sheet, i) => <Button key={sheet.name + i} variant={i === sheetIndex ? "default" : "outline"} size="sm" onClick={() => setSheetIndex(i)}>{sheet.name}</Button>)}</div>
            {currentSheet?.rows.length ? <div className="max-h-[70vh] overflow-auto rounded-md border border-border bg-background"><table className="w-full border-collapse text-sm"><tbody>{currentSheet.rows.map((row, ri) => <tr key={ri} className="border-b border-border last:border-0">{row.slice(0, 50).map((cell, ci) => <td key={ci} className="min-w-20 border-r border-border px-3 py-2 align-top last:border-0">{cell ?? ""}</td>)}</tr>)}</tbody></table></div> : <p className="py-10 text-center text-sm text-muted-foreground">This sheet has no readable cell data.</p>}
            <p className="text-xs text-muted-foreground">Showing up to 250 rows and 50 columns per worksheet. Formula results are shown as saved in the file.</p>
          </div>
        ) : null}
    </div>
  );
}
