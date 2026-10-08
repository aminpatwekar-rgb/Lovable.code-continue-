import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Shown to the class owner: teachers waiting to be approved as co-teachers. */
export function CoTeacherRequests({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const requests = useQuery({
    queryKey: ["co-teacher-requests", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_co_teacher_requests")
        .select("id, full_name, created_at")
        .eq("class_id", classId)
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const respond = useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("respond_co_teacher_request", {
        _request_id: v.id,
        _approve: v.approve,
      });
      if (error) throw error;
      return v.approve;
    },
    onSuccess: (approved) => {
      toast.success(approved ? "Co-teacher approved" : "Request declined");
      void qc.invalidateQueries({ queryKey: ["co-teacher-requests", classId] });
      void qc.invalidateQueries({ queryKey: ["roster", classId] });
      void qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = requests.data ?? [];
  if (!rows.length) return null;

  return (
    <div className="panel space-y-3 border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="size-4 text-primary" />
        Co-teacher requests ({rows.length})
      </p>
      <p className="text-xs text-muted-foreground">
        These teachers entered your class code. They only get access once you approve them.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/70 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.full_name || "Teacher"}</p>
              <p className="text-xs text-muted-foreground">
                Requested {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => respond.mutate({ id: r.id, approve: true })}
                disabled={respond.isPending}
              >
                <Check className="mr-1 size-4" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => respond.mutate({ id: r.id, approve: false })}
                disabled={respond.isPending}
              >
                <X className="mr-1 size-4" /> Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
