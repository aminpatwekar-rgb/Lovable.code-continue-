/**
 * Visual study-material attachments (images, PDFs and pictures embedded in
 * Word / PowerPoint files). Shared by the browser and the server function.
 */

export type MaterialAttachment = {
  name: string;
  mime: string;
  /** base64 (no data: prefix) */
  data: string;
};

export const ATTACHMENT_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** Total base64 payload we are willing to send in one generation request. */
export const MAX_ATTACHMENT_TOTAL_BYTES = 14 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 24;
