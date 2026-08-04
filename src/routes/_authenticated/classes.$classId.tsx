import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDue } from "@/lib/assignments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/classes/$classId")({
  head: () => ({
    meta: [
      { title: "Class — Scriptio" },
      { name: "description", content: "Class roster, assignments and join code." },
      { property: "og:title", content: "Class — Scriptio" },
      { property: "og:description", content: "Class roster and assignments." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClassDetail,
});

function ClassDetail() {
  const { classId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isTeacher = role === "teacher" || role === "admin";
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [priority, setPriority] = useState("normal");
  const [type, setType] = useState<"handwritten" | "typed" | "either">("handwritten");
  const [allowImages, setAllowImages] = useState(true);
  const [allowAutocorrect, setAllowAutocorrect] = useState(false);
  const [allowVoice, setAllowVoice] = useState(false);

  const klass = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, section, description, join_code, teacher_id")
        .eq("id", classId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const roster = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("class_members")
        .select("id, joined_at, student_id, profiles:student_id(full_name, email)")
        .eq("class_id", classId);
      return data ?? [];
    },
  });

  const assignments = useQuery({
    queryKey: ["class-assignments", classId, isTeacher],
    queryFn: async () => {
      let q = supabase
        .from("assignments")
        .select("id, title, subject, due_date, published, priority, submission_type")
        .eq("class_id", classId)
        .order("due_date", { ascending: true });
      if (!isTeacher) q = q.eq("published", true);
      const { data } = await q;
      return data ?? [];
    },
  });

  const createAssignment = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!title.trim()) throw new Error("Title is required");
      const marks = Number(maxMarks);
      if (!Number.isFinite(marks) || marks <= 0 || marks > 1000)
        throw new Error("Max marks must be between 1 and 1000");
      const { data, error } = await supabase
        .from("assignments")
        .insert({
          class_id: classId,
          teacher_id: user!.id,
          title: title.trim().slice(0, 160),
          subject: subject.trim() || null,
          instructions: instructions.trim() || null,
          due_date: due ? new Date(due).toISOString() : null,
          max_marks: marks,
          priority,
          submission_type: type,
          allow_images: allowImages,
          allow_autocorrect: allowAutocorrect,
          allow_voice_typing: allowVoice,
          published: publish,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Assignment created");
      setOpen(false);
      setTitle("");
      setInstructions("");
      setDue("");
      void qc.invalidateQueries({ queryKey: ["class-assignments"] });
      void navigate({ to: "/assignments/$assignmentId", params: { assignmentId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (klass.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!klass.data) return <p className="text-muted-foreground">Class not found.</p>;

  return (
    <div className="space-y-8">
      <Link
        to="/classes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All classes
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{klass.data.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {[klass.data.subject, klass.data.section].filter(Boolean).join(" · ") || "No subject"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isTeacher && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(klass.data!.join_code);
                toast.success("Join code copied");
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-mono text-sm tracking-widest"
            >
              {klass.data.join_code}
              <Copy className="size-3.5" />
            </button>
          )}
          {isTeacher && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1.5 size-4" /> New assignment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New assignment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="t">Title</Label>
                    <Input
                      id="t"
                      maxLength={160}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Chapter 4 problem set"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="s">Subject</Label>
                      <Input
                        id="s"
                        maxLength={60}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m">Max marks</Label>
                      <Input
                        id="m"
                        type="number"
                        min={1}
                        max={1000}
                        value={maxMarks}
                        onChange={(e) => setMaxMarks(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="d">Due date</Label>
                      <Input
                        id="d"
                        type="datetime-local"
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Submission type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="handwritten">Handwritten (photo upload)</SelectItem>
                        <SelectItem value="typed">Typed (paste protected)</SelectItem>
                        <SelectItem value="either">Student's choice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="i">Instructions</Label>
                    <Textarea
                      id="i"
                      maxLength={4000}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      className="min-h-28"
                    />
                  </div>
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    {(
                      [
                        ["Allow images in typed answers", allowImages, setAllowImages],
                        ["Allow autocorrect / spellcheck", allowAutocorrect, setAllowAutocorrect],
                        ["Allow voice typing", allowVoice, setAllowVoice],
                      ] as const
                    ).map(([label, val, set]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-sm">{label}</span>
                        <Switch checked={val} onCheckedChange={set} />
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => createAssignment.mutate(false)}
                    disabled={createAssignment.isPending}
                  >
                    Save draft
                  </Button>
                  <Button
                    onClick={() => createAssignment.mutate(true)}
                    disabled={createAssignment.isPending}
                  >
                    Publish
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="mt-5 space-y-3">
          {(assignments.data ?? []).length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">No assignments yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {(assignments.data ?? []).map((a) => (
                <li key={a.id}>
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: a.id }}
                    className="panel lift block p-4 hover:lift-hover"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{a.title}</p>
                      {!a.published && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Due {formatDue(a.due_date)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="students" className="mt-5">
          {(roster.data ?? []).length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">
              No students yet. Share the join code above.
            </p>
          ) : (
            <ul className="panel divide-y divide-border">
              {(roster.data ?? []).map((m) => {
                const p = m.profiles as unknown as { full_name: string; email: string } | null;
                return (
                  <li key={m.id} className="flex items-center gap-3 p-4">
                    <Avatar className="size-9">
                      <AvatarFallback>{(p?.full_name ?? "?").slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p?.full_name ?? "Student"}</p>
                      <p className="truncate text-xs text-muted-foreground">{p?.email}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
