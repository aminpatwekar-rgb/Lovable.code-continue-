import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Copy, Plus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { makeJoinCode } from "@/lib/assignments";
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
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");

  const isTeacher = role === "teacher" || role === "admin";

  const classes = useQuery({
    queryKey: ["classes", user?.id, role],
    enabled: Boolean(user && role),
    queryFn: async () => {
      if (isTeacher) {
        const { data, error } = await supabase
          .from("classes")
          .select("id, name, subject, section, join_code, description, class_members(count)")
          .eq("teacher_id", user!.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      const { data: m } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", user!.id);
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
      const { data, error } = await supabase.rpc("join_class_by_code", {
        _code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      if (!data) throw new Error("No class found with that code");
      return data;
    },
    onSuccess: () => {
      toast.success("You've joined the class");
      setJoinOpen(false);
      setCode("");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Classes</h1>
          <p className="mt-1 text-muted-foreground">
            {isTeacher
              ? "Create a class and share the join code with your students."
              : "Classes you've joined."}
          </p>
        </div>
        {isTeacher ? (
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
              <DialogFooter>
                <Button onClick={() => join.mutate()} disabled={join.isPending}>
                  Join
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
      ) : (classes.data ?? []).length === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          {isTeacher ? "No classes yet." : "You haven't joined any classes yet."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(classes.data ?? []).map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <Link
                to="/classes/$classId"
                params={{ classId: c.id }}
                className="panel lift block h-full p-5 hover:lift-hover"
              >
                <h2 className="font-semibold">{c.name}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[c.subject, c.section].filter(Boolean).join(" · ") || "No subject"}
                </p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Users className="size-3.5" />
                    {(c.class_members as unknown as { count: number }[])?.[0]?.count ?? 0} students
                  </span>
                  {isTeacher && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        void navigator.clipboard.writeText(c.join_code);
                        toast.success("Join code copied");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-xs tracking-widest"
                    >
                      {c.join_code}
                      <Copy className="size-3" />
                    </button>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
