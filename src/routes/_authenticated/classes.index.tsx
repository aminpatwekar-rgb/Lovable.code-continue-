import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { ChevronRight, Copy, LogOut, Plus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { makeJoinCode } from "@/lib/assignments";
import { SPRING_PRESS, getPressProps } from "@/lib/motionPresets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/classes/")({
  head: () => ({
    meta: [
      { title: "Classes — ONYX" },
      {
        name: "description",
        content: "Create classes, share join codes, and manage your class rosters.",
      },
      { property: "og:title", content: "Classes — ONYX" },
      { property: "og:description", content: "Your classes and join codes in one place." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Classes,
});

function Classes() {
  const { role, user, profile } = useAuth();
  const { effectiveRole } = useViewRole();
  const shouldReduceMotion = useReducedMotion();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [erNo, setErNo] = useState("");
  const [srNo, setSrNo] = useState("");

  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";

  const classes = useQuery({
    queryKey: ["classes", user?.id, effectiveRole],
    enabled: Boolean(user && effectiveRole),
    queryFn: async () => {
      if (isTeacher) {
        const [{ data: owned, error: ownedError }, { data: memberships, error: membershipError }] =
          await Promise.all([
            supabase
              .from("classes")
              .select("id, name, subject, section, join_code, description, teacher_id, class_members(count)")
              .eq("teacher_id", user!.id)
              .order("created_at", { ascending: false }),
            supabase
              .from("class_members")
              .select("class_id")
              .eq("student_id", user!.id)
              .eq("member_role", "teacher"),
          ]);
        if (ownedError) throw ownedError;
        if (membershipError) throw membershipError;

        const ownedRows = owned ?? [];
        const joinedIds = (memberships ?? [])
          .map((m) => m.class_id)
          .filter((id) => !ownedRows.some((c) => c.id === id));

        if (!joinedIds.length) return ownedRows;
        const { data: joined, error: joinedError } = await supabase
          .from("classes")
          .select("id, name, subject, section, join_code, description, class_members(count)")
          .in("id", joinedIds)
          .order("created_at", { ascending: false });
        if (joinedError) throw joinedError;

        return [...ownedRows, ...(joined ?? [])];
      }
      const { data: m, error: membershipError } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", user!.id);
      if (membershipError) throw membershipError;
      const ids = (m ?? []).map((x) => x.class_id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, section, join_code, description, class_members(count)")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Class name is required");
      const { error } = await supabase.from("classes").insert({
        name: name.trim().slice(0, 120),
        subject: subject.trim() || null,
        section: section.trim() || null,
        description: description.trim() || null,
        join_code: makeJoinCode(),
        teacher_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Class created");
      setOpen(false);
      setName("");
      setSubject("");
      setSection("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const join = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error("Enter the join code");

      const identity = {
        _full_name: studentName.trim() || profile?.full_name?.trim() || "",
        _roll_no: rollNo.trim(),
        _er_no: erNo.trim(),
        _sr_no: srNo.trim(),
      };

      if (!isTeacher) {
        if (!identity._full_name) throw new Error("Full name is required");
        if (!identity._roll_no && !identity._er_no && !identity._sr_no) {
          throw new Error("Enter at least one of Roll No., ER No., or Sr No.");
        }
      }

      const { data, error } = await supabase.rpc("join_class_by_code", {
        _code: code.trim().toUpperCase(),
        ...identity,
      });
      if (error) throw error;
      if (!data) throw new Error("No class found with that code");
      return data;
    },
    onSuccess: () => {
      toast.success(isTeacher ? "You've joined the class as a co-teacher" : "You've joined the class");
      setJoinOpen(false);
      setCode("");
      setStudentName("");
      setRollNo("");
      setErNo("");
      setSrNo("");
      void qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leave = useMutation({
    mutationFn: async (classId: string) => {
      const { error } = await supabase
        .from("class_members")
        .delete()
        .eq("class_id", classId)
        .eq("student_id", user!.id)
        .eq("member_role", "teacher");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("You've left the class");
      void qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Classes</h1>
          <p className="mt-1 text-muted-foreground">
            {isTeacher
              ? "Create classes, join as a co-teacher, and manage your class roster."
              : "Classes you've joined."}
          </p>
        </div>
        {isTeacher ? (
          <>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1.5 size-4" /> New class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a class</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cname">Class name</Label>
                  <Input
                    id="cname"
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Physics 101"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="csub">Subject</Label>
                    <Input
                      id="csub"
                      maxLength={60}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="csec">Section</Label>
                    <Input
                      id="csec"
                      maxLength={30}
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cdesc">Description</Label>
                  <Textarea
                    id="cdesc"
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  Create class
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="mr-1.5 size-4" /> Join class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join as a co-teacher</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-code">Class join code</Label>
                  <Input
                    id="teacher-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="AB12CD"
                    className="font-mono tracking-[0.3em] uppercase"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter only the class code. You will be added as a co-teacher; student identifiers are not required.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => join.mutate()} disabled={join.isPending}>
                  {join.isPending ? "Joining…" : "Join as co-teacher"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        ) : (
          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1.5 size-4" /> Join class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join a class</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Join code</Label>
                  <Input
                    id="code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="AB12CD"
                    className="font-mono tracking-[0.3em] uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sname">Full name</Label>
                  <Input
                    id="sname"
                    maxLength={100}
                    value={studentName || profile?.full_name || ""}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Mohammed Amin"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="roll">Roll No.</Label>
                    <Input
                      id="roll"
                      maxLength={40}
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="er">ER No.</Label>
                    <Input
                      id="er"
                      maxLength={40}
                      value={erNo}
                      onChange={(e) => setErNo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sr">Sr No.</Label>
                    <Input
                      id="sr"
                      maxLength={40}
                      value={srNo}
                      onChange={(e) => setSrNo(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  These identifiers must be unique inside the class. Your teacher uses them to match
                  your work.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => join.mutate()} disabled={join.isPending}>
                  {join.isPending ? "Joining…" : "Join"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      {classes.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : classes.isError ? (
        <div className="panel p-6 text-sm text-destructive">
          Couldn't load classes. {(classes.error as Error).message}
        </div>
      ) : (classes.data ?? []).length === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          {isTeacher ? "No classes yet." : "You haven't joined any classes yet."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {(classes.data ?? []).map((c, i) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                {...(!shouldReduceMotion ? { whileTap: { scale: 0.98 } } : {})}
                transition={{
                  delay: Math.min(i * 0.035, 0.3),
                  duration: 0.22,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Link
                  to="/classes/$classId"
                  params={{ classId: c.id }}
                  className="group panel lift block h-full border border-border shadow-sm p-5 cursor-pointer hover:border-primary/40 hover:lift-hover"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {c.name}
                    </h2>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-60 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-primary mt-0.5" />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[c.subject, c.section].filter(Boolean).join(" · ") || "No subject"}
                  </p>
                  {isTeacher && c.teacher_id !== user?.id && (
                    <span className="mt-2 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      Co-teacher
                    </span>
                  )}
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Users className="size-3.5" />
                      {(c.class_members as unknown as { count: number }[])?.[0]?.count ?? 0}{" "}
                      students
                    </span>
                    {isTeacher && (
                      <div className="flex items-center gap-2">
                        <motion.button
                          type="button"
                          {...getPressProps(shouldReduceMotion, { hoverScale: 1.05, tapScale: 0.95 })}
                          onClick={(e) => {
                            e.preventDefault();
                            void navigator.clipboard.writeText(c.join_code);
                            toast.success("Join code copied");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-xs tracking-widest cursor-pointer hover:bg-muted"
                        >
                          {c.join_code}
                          <Copy className="size-3" />
                        </motion.button>
                        {c.teacher_id !== user?.id && (
                          <motion.button
                            type="button"
                            {...getPressProps(shouldReduceMotion, { hoverScale: 1.05, tapScale: 0.95 })}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (window.confirm("Leave this class as a co-teacher?")) leave.mutate(c.id);
                            }}
                            disabled={leave.isPending}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
                            aria-label="Leave class"
                          >
                            <LogOut className="size-3" /> Leave
                          </motion.button>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
