import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";

type FileSource = "submission" | "assignment" | "resource" | "announcement";
type StoredFile = {
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

const MAX_PREVIEW_BYTES = 60 * 1024 * 1024;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Streams a file through the ONYX origin so browser privacy filters do not need
 * to open a Supabase-hosted URL. Access is checked with the signed-in user's
 * JWT and existing Supabase RLS policies; this endpoint never uses service role.
 */
export const Route = createFileRoute("/api/file-preview/$source/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
        if (!token) return errorResponse("Sign in to preview this file.", 401);

        const { source, fileId } = params as { source: string; fileId: string };
        if (source !== "submission" && source !== "assignment" && source !== "resource" && source !== "announcement") {
          return errorResponse("Unsupported file source.", 400);
        }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
          return errorResponse("Invalid file identifier.", 400);
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey) {
          return errorResponse("File preview is not configured on this server.", 503);
        }

        const supabase = createClient<Database>(supabaseUrl, publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: authData, error: authError } = await supabase.auth.getClaims(token);
        if (authError || !authData?.claims?.sub) {
          return errorResponse("Your session expired. Sign in again and retry.", 401);
        }

        let file: StoredFile | null = null;
        let bucket: "submissions" | "assignment-attachments" | "class-resources" | "announcement-attachments";
        if (source === "submission") {
          const { data, error } = await supabase
            .from("submission_files")
            .select("storage_path, file_name, mime_type, size_bytes")
            .eq("id", fileId)
            .maybeSingle();
          if (error) return errorResponse("Unable to verify submission-file access.", 403);
          file = data;
          bucket = "submissions";
        } else if (source === "assignment") {
          const { data, error } = await supabase
            .from("assignment_attachments")
            .select("storage_path, file_name, mime_type, size_bytes")
            .eq("id", fileId)
            .maybeSingle();
          if (error) return errorResponse("Unable to verify attachment access.", 403);
          file = data;
          bucket = "assignment-attachments";
        } else if (source === "resource") {
          const { data, error } = await supabase
            .from("class_resources")
            .select("storage_path, file_name, mime_type, size_bytes")
            .eq("id", fileId)
            .maybeSingle();
          if (error) return errorResponse("Unable to verify class-resource access.", 403);
          file = data;
          bucket = "class-resources";
        } else {
          const { data, error } = await supabase
            .from("announcement_attachments")
            .select("storage_path, file_name, mime_type, size_bytes")
            .eq("id", fileId)
            .maybeSingle();
          if (error) return errorResponse("Unable to verify announcement-attachment access.", 403);
          file = data;
          bucket = "announcement-attachments";
        }

        // RLS-filtered rows appear as not found to users without access.
        if (!file) return errorResponse("File not found or you do not have permission to view it.", 404);
        if (file.size_bytes != null && Number(file.size_bytes) > MAX_PREVIEW_BYTES) {
          return errorResponse("This file is too large to preview in the browser. Download it instead.", 413);
        }

        const { data: signed, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(file.storage_path, 60);
        if (signedError || !signed?.signedUrl) {
          return errorResponse("Could not prepare a secure file preview.", 403);
        }

        // The signed URL is used only server-to-server and is never sent to the browser.
        const upstream = await fetch(signed.signedUrl, { cache: "no-store" });
        if (!upstream.ok || !upstream.body) {
          return errorResponse("The stored file could not be retrieved. Please retry.", 502);
        }

        const safeName = file.file_name.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "preview-file";
        const headers = new Headers({
          "Content-Type": file.mime_type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeName}"`,
          "Cache-Control": "private, no-store, max-age=0",
          "Pragma": "no-cache",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'",
          "Referrer-Policy": "no-referrer",
        });
        const length = upstream.headers.get("content-length");
        if (length) headers.set("Content-Length", length);
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
