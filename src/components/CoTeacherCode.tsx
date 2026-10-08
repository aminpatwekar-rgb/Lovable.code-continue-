import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Owner-only: the separate code teachers use to ask to co-teach this class. */
export function CoTeacherCode({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const key = ["co-teacher-code", classId];
  const code = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_co_teacher_code", { _class_id: classId });
      if (error) throw error;
      return data as string;
    },
  });
  const regenerate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("regenerate_co_teacher_code", {
        _class_id: classId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (fresh) => {
      qc.setQueryData(key, fresh);
      toast.success("New co-teacher code generated. The old one no longer works.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (code.isError || !code.data) return null;

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-md border border-primary/40 bg-primary/5">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code.data!);
          toast.success("Co-teacher code copied");
        }}
        title="Share this code with a teacher who should co-teach this class. You'll approve their request."
        className="inline-flex items-center gap-2 px-3 py-2 text-sm"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          Co-teacher
        </span>
        <span className="font-mono tracking-widest">{code.data}</span>
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Generate a new co-teacher code? The current code will stop working.")) {
            regenerate.mutate();
          }
        }}
        disabled={regenerate.isPending}
        title="Generate a new co-teacher code"
        aria-label="Generate a new co-teacher code"
        className="border-l border-primary/30 px-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={`size-3.5 ${regenerate.isPending ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
