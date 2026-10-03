import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Makes every graded-but-hidden submission of an assignment visible to its student. */
export function ReleaseGradesButton({
  assignmentId,
  assignmentTitle,
  count,
  size = "sm",
  variant = "default",
}: {
  assignmentId: string;
  assignmentTitle: string;
  count: number;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const release = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("submissions")
        .update({ grade_released: true })
        .eq("assignment_id", assignmentId)
        .in("status", ["reviewed", "completed"])
        .eq("grade_released", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Released ${count} grade${count === 1 ? "" : "s"}`);
      setOpen(false);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (count <= 0) return null;
  return (
    <>
      <Button size={size} variant={variant} className="gap-1.5" onClick={() => setOpen(true)}>
        <Eye className="size-4" /> Release {count}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Release {count} grade{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Students in &ldquo;{assignmentTitle}&rdquo; will see their marks and feedback right
              away. You can still edit a grade afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                release.mutate();
              }}
              disabled={release.isPending}
            >
              {release.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Release grades
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
