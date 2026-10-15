import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { enrollStudentsInClass, fetchDepartmentStudents } from "@/lib/institution-departments";

/** Lets a class teacher (or the institution admin) enroll students of the class's department. */
export function EnrollDepartmentStudents({
  classId,
  departmentId,
  departmentName,
  onDone,
}: {
  classId: string;
  departmentId: string;
  departmentName: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const students = useQuery({
    queryKey: ["department-students", departmentId],
    queryFn: () => fetchDepartmentStudents(departmentId),
  });

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (students.data ?? []).filter(
      (s) => !q || s.fullName.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q),
    );
  }, [students.data, filter]);

  const allShownSelected = shown.length > 0 && shown.every((s) => selected.has(s.id));

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }
  function toggleAllShown(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      shown.forEach((s) => (on ? next.add(s.id) : next.delete(s.id)));
      return next;
    });
  }

  const enroll = useMutation({
    mutationFn: (ids: string[]) => enrollStudentsInClass(classId, ids),
    onSuccess: async (result) => {
      const skipped = result.skipped.length;
      if (result.enrolled > 0) {
        toast.success(`${result.enrolled} student${result.enrolled === 1 ? "" : "s"} added to the class.${skipped ? ` ${skipped} skipped.` : ""}`);
      } else if (skipped > 0) {
        toast.info(result.skipped[0]?.reason ?? "Nobody to add.");
      } else {
        toast.info("Nobody to add.");
      }
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ["roster", classId] });
      await qc.invalidateQueries({ queryKey: ["department-classes"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-start gap-2.5">
        <UserPlus className="mt-0.5 size-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Add students from {departmentName}</h3>
          <p className="text-xs text-muted-foreground">
            Pick students from this department. Anyone already in the class is skipped.
          </p>
        </div>
      </div>

      {students.isLoading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : students.isError ? (
        <p className="text-sm text-destructive">{(students.error as Error).message}</p>
      ) : !students.data?.length ? (
        <p className="text-sm text-muted-foreground">
          No students are in this department yet. The institution admin can add them, or share the department's student link.
        </p>
      ) : (
        <>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search students" aria-label="Search department students" />
          <label className="flex items-center gap-2 text-xs font-medium">
            <Checkbox checked={allShownSelected} onCheckedChange={(v) => toggleAllShown(v === true)} />
            Select all{filter ? " shown" : ""} ({shown.length})
          </label>
          <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {shown.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{s.fullName || "Unnamed"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.email}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            disabled={selected.size === 0 || enroll.isPending}
            onClick={() => enroll.mutate([...selected])}
          >
            {enroll.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Add {selected.size || ""} to class
          </Button>
        </>
      )}
    </div>
  );
}
