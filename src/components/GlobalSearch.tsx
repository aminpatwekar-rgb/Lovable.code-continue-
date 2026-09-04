import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardList, GraduationCap, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Result =
  | { kind: "class"; id: string; title: string; subtitle: string }
  | { kind: "assignment"; id: string; title: string; subtitle: string }
  | { kind: "quiz"; id: string; title: string; subtitle: string };

/**
 * Every query below runs through the browser client, so row-level security
 * decides what the signed-in user is allowed to see — the search can never
 * surface a class, assignment or quiz the user has no access to.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = term.trim();

  const results = useQuery({
    enabled: open && Boolean(user) && query.length >= 2,
    queryKey: ["global-search", query, user?.id],
    queryFn: async (): Promise<Result[]> => {
      const like = `%${query}%`;
      const [classes, assignments, quizzes] = await Promise.all([
        supabase.from("classes").select("id, name, subject, section").ilike("name", like).limit(6),
        supabase
          .from("assignments")
          .select("id, title, subject, classes(name)")
          .ilike("title", like)
          .limit(6),
        supabase.from("quizzes").select("id, title, kind, classes(name)").ilike("title", like).limit(6),
      ]);

      return [
        ...(classes.data ?? []).map((c) => ({
          kind: "class" as const,
          id: c.id,
          title: c.name,
          subtitle: [c.subject, c.section].filter(Boolean).join(" · ") || "Class",
        })),
        ...(assignments.data ?? []).map((a) => ({
          kind: "assignment" as const,
          id: a.id,
          title: a.title,
          subtitle: a.classes?.name ?? a.subject ?? "Assignment",
        })),
        ...(quizzes.data ?? []).map((q) => ({
          kind: "quiz" as const,
          id: q.id,
          title: q.title,
          subtitle: q.classes?.name ?? "Quiz",
        })),
      ];
    },
  });

  function go(item: Result) {
    setOpen(false);
    setTerm("");
    if (item.kind === "class")
      void navigate({ to: "/classes/$classId", params: { classId: item.id } });
    else if (item.kind === "assignment")
      void navigate({ to: "/assignments/$assignmentId", params: { assignmentId: item.id } });
    else void navigate({ to: "/quizzes/$quizId", params: { quizId: item.id } });
  }

  const items = results.data ?? [];
  const group = (kind: Result["kind"]) => items.filter((i) => i.kind === kind);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-border px-1 text-[10px] sm:inline">⌘K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search classes, assignments and quizzes…"
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          {query.length < 2 ? (
            <CommandEmpty>Type at least 2 characters.</CommandEmpty>
          ) : results.isFetching ? (
            <CommandEmpty>Searching…</CommandEmpty>
          ) : items.length === 0 ? (
            <CommandEmpty>No matches you have access to.</CommandEmpty>
          ) : null}

          {group("class").length > 0 && (
            <CommandGroup heading="Classes">
              {group("class").map((item) => (
                <CommandItem key={item.id} value={`class-${item.id}`} onSelect={() => go(item)}>
                  <GraduationCap className="mr-2 size-4" />
                  <span className="flex-1 truncate">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {group("assignment").length > 0 && (
            <CommandGroup heading="Assignments">
              {group("assignment").map((item) => (
                <CommandItem key={item.id} value={`assignment-${item.id}`} onSelect={() => go(item)}>
                  <BookOpen className="mr-2 size-4" />
                  <span className="flex-1 truncate">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {group("quiz").length > 0 && (
            <CommandGroup heading="Quizzes">
              {group("quiz").map((item) => (
                <CommandItem key={item.id} value={`quiz-${item.id}`} onSelect={() => go(item)}>
                  <ClipboardList className="mr-2 size-4" />
                  <span className="flex-1 truncate">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
