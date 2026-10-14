import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PreviewFileSource = "submission" | "assignment";

export type PreviewFileRef = {
  id: string;
  source?: PreviewFileSource;
};

export function useProxiedFileUrl(file: PreviewFileRef | null) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setUrl("");
    setError("");
    if (!file?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const source = file.source ?? "submission";

    void (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Sign in again to preview this file.");

      const response = await fetch(
        `/api/file-preview/${source}/${encodeURIComponent(file.id)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        },
      );
      if (!response.ok) {
        let message = "Unable to load this file preview.";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep the safe fallback message if the server returned non-JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })()
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load this file preview.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file?.id, file?.source]);

  return { url, loading, error };
}

export function ProxiedFileImage({
  fileId,
  source = "submission",
  alt,
  className,
  onClick,
}: {
  fileId: string;
  source?: PreviewFileSource;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const { url, loading, error } = useProxiedFileUrl({ id: fileId, source });
  if (url) {
    return <img src={url} alt={alt} loading="lazy" className={className} onClick={onClick} />;
  }
  return (
    <div
      className={`flex min-h-20 items-center justify-center bg-muted/20 p-3 text-xs text-muted-foreground ${className ?? ""}`}
      role={error ? "alert" : undefined}
      title={error || undefined}
    >
      {loading ? "Loading preview…" : error ? "Image preview unavailable" : "No preview"}
    </div>
  );
}
