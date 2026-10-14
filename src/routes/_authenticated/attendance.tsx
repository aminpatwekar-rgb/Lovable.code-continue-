import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Download, Loader2, Save, Search, StickyNote, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  STATUSES, STATUS_LABEL, STATUS_LETTER, STATUS_TONE, LOW_ATTENDANCE_THRESHOLD,
  attendancePercent, compareRoster, currentMonth, formatDay, isLow, localDateString, monthBounds, shiftDate,
  tallyStatuses, type AttendanceStatus,
} from "@/lib/attendance";
import { toast } from "sonner";

const db = supabase as any;

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "Attendance — ONYX" }] }),
  component: Page,
});

type ClassRow = { id: string; name: string; subject: string | null; section: string | null };
type RosterRow = { student_id: string; full_name: string | null; roll_no: string | null; er_no: string | null; sr_no: string | null };
type SavedRecord = { student_id: string; status: AttendanceStatus; note: string | null };

const STATUS_ICON = { present: Check, absent: X, late: Clock3, excused: StickyNote } as const;

function StatusPill({ status }: { status: AttendanceStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function classLabel(c: ClassRow) {
  return c.section ? `${c.name} (${c.section})` : c.name;
}

function Page() {
  const { effectiveRole } = useViewRole();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  return (
    <PlanGate feature="attendance">
      {isTeacher ? <TeacherView isAdmin={effectiveRole === "admin"} /> : <StudentView />}
    </PlanGate>
  );
}

/* ------------------------------------------------------------------ teacher */

function TeacherView({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const [classId, setClassId] = useState("");
  const [tab, setTab] = useState<"mark" | "history">("mark");
  const dirtyRef = useRef(false);

  // Classes this person teaches: ones they own plus ones they co-teach (admins see every class).
  const classes = useQuery({
    queryKey: ["attendance-classes", user?.id, isAdmin],
    enabled: Boolean(user),
    queryFn: async (): Promise<ClassRow[]> => {
      if (isAdmin) {
        const all = await db.from("classes").select("id,name,subject,section").eq("archived", false).order("name").limit(300);
        if (all.error) throw all.error;
        return all.data ?? [];
      }
      const [owned, co] = await Promise.all([
        db.from("classes").select("id,name,subject,section").eq("teacher_id", user!.id).eq("archived", false),
        db.from("class_members").select("classes(id,name,subject,section,archived)").eq("student_id", user!.id).eq("member_role", "teacher"),
      ]);
      if (owned.error) throw owned.error;
      if (co.error) throw co.error;
      const byId = new Map<string, ClassRow>();
      for (const c of (owned.data ?? []) as ClassRow[]) byId.set(c.id, c);
      for (const row of (co.data ?? []) as { classes: (ClassRow & { archived: boolean }) | null }[]) {
        if (row.classes && !row.classes.archived) byId.set(row.classes.id, row.classes);
      }
      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // Pick the only class automatically.
  useEffect(() => {
    if (!classId && classes.data?.length === 1) setClassId(classes.data[0]!.id);
  }, [classes.data, classId]);

  function confirmLeave(): boolean {
    return !dirtyRef.current || window.confirm("You have unsaved attendance changes. Discard them?");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <p className="text-sm text-muted-foreground">Mark attendance for a class, then review the month.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={classId}
          onValueChange={(v) => {
            if (v !== classId && confirmLeave()) { dirtyRef.current = false; setClassId(v); }
          }}
        >
          <SelectTrigger className="w-full sm:w-[280px]"><SelectValue placeholder={classes.isLoading ? "Loading classes…" : "Select class"} /></SelectTrigger>
          <SelectContent>
            {(classes.data ?? []).map((c) => <SelectItem value={c.id} key={c.id}>{classLabel(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Attendance view">
          {(["mark", "history"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              size="sm"
              variant={tab === t ? "default" : "ghost"}
              onClick={() => { if (t !== tab && confirmLeave()) { dirtyRef.current = false; setTab(t); } }}
            >
              {t === "mark" ? "Mark" : "History"}
            </Button>
          ))}
        </div>
      </div>

      {classes.isError && <p role="alert" className="text-sm text-destructive">Couldn't load your classes. Try again.</p>}
      {classes.data && classes.data.length === 0 && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">You don't have any active classes yet.</div>
      )}
      {!classId && classes.data && classes.data.length > 1 && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">Select a class to begin.</div>
      )}
      {classId && tab === "mark" && <MarkTab key={classId} classId={classId} userId={user!.id} dirtyRef={dirtyRef} />}
      {classId && tab === "history" && <HistoryTab key={classId} classId={classId} className={classes.data?.find((c) => c.id === classId)?.name ?? "class"} />}
    </div>
  );
}

function useRoster(classId: string) {
  return useQuery({
    queryKey: ["attendance-roster", classId],
    queryFn: async (): Promise<RosterRow[]> => {
      const q = await db.from("class_members").select("student_id,full_name,roll_no,er_no,sr_no").eq("class_id", classId).eq("member_role", "student");
      if (q.error) throw q.error;
      return ((q.data ?? []) as RosterRow[]).sort(compareRoster);
    },
  });
}

function MarkTab({ classId, userId, dirtyRef }: { classId: string; userId: string; dirtyRef: MutableRefObject<boolean> }) {
  const qc = useQueryClient();
  const today = localDateString();
  const [date, setDate] = useState(today);
  const [statusDraft, setStatusDraft] = useState<Record<string, AttendanceStatus>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const roster = useRoster(classId);
  const records = useQuery({
    queryKey: ["attendance-records", classId, date],
    queryFn: async (): Promise<SavedRecord[]> => {
      const q = await db.from("attendance_records").select("student_id,status,note").eq("class_id", classId).eq("attendance_date", date);
      if (q.error) throw q.error;
      return q.data ?? [];
    },
  });

  const students = roster.data ?? [];
  const existing = useMemo(
    () => Object.fromEntries((records.data ?? []).map((r) => [r.student_id, r])) as Record<string, SavedRecord>,
    [records.data],
  );
  const hasRecords = (records.data ?? []).length > 0;
  const edited = Object.keys(statusDraft).length > 0 || Object.keys(noteDraft).length > 0;

  useEffect(() => { dirtyRef.current = edited; return () => { dirtyRef.current = false; }; }, [edited, dirtyRef]);
  useEffect(() => {
    if (!edited) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited]);

  const statusOf = (id: string): AttendanceStatus => statusDraft[id] ?? existing[id]?.status ?? "present";
  const noteOf = (id: string): string => noteDraft[id] ?? existing[id]?.note ?? "";

  // Rows that actually need writing: everyone on a first save, only changed rows afterwards.
  const pendingRows = students.filter((s) => {
    const ex = existing[s.student_id];
    if (!ex) return true;
    const statusChanged = statusDraft[s.student_id] !== undefined && statusDraft[s.student_id] !== ex.status;
    const noteChanged = noteDraft[s.student_id] !== undefined && noteDraft[s.student_id]!.trim() !== (ex.note ?? "").trim();
    return statusChanged || noteChanged;
  });

  const tally = tallyStatuses(students.map((s) => statusOf(s.student_id)));
  const q = filter.trim().toLowerCase();
  const shown = students.filter((s) =>
    !q || [s.full_name, s.roll_no, s.er_no, s.sr_no].some((v) => (v ?? "").toLowerCase().includes(q)),
  );

  function changeDate(next: string) {
    if (next > today || next === date) return;
    if (edited && !window.confirm("You have unsaved attendance changes. Discard them?")) return;
    setStatusDraft({}); setNoteDraft({}); setOpenNotes(new Set()); setDate(next);
  }

  function markAll(status: AttendanceStatus) {
    setStatusDraft(Object.fromEntries(students.map((s) => [s.student_id, status])));
  }

  async function save() {
    if (!pendingRows.length) return;
    setSaving(true);
    try {
      const rows = pendingRows.map((s) => ({
        class_id: classId,
        student_id: s.student_id,
        attendance_date: date,
        status: statusOf(s.student_id),
        note: noteOf(s.student_id).trim() || null,
        marked_by: userId,
      }));
      const res = await db.from("attendance_records").upsert(rows, { onConflict: "class_id,student_id,attendance_date" });
      if (res.error) throw res.error;
      setStatusDraft({}); setNoteDraft({});
      await qc.invalidateQueries({ queryKey: ["attendance-records", classId] });
      await qc.invalidateQueries({ queryKey: ["attendance-history", classId] });
      toast.success(hasRecords ? `Updated ${rows.length} record${rows.length === 1 ? "" : "s"}.` : `Attendance saved for ${rows.length} student${rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save attendance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Previous day" onClick={() => changeDate(shiftDate(date, -1))}><ChevronLeft className="size-4" /></Button>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input type="date" value={date} max={today} onChange={(e) => e.target.value && changeDate(e.target.value)} className="w-[11rem] pl-9" aria-label="Attendance date" />
        </div>
        <Button type="button" variant="outline" size="icon" aria-label="Next day" disabled={date >= today} onClick={() => changeDate(shiftDate(date, 1))}><ChevronRight className="size-4" /></Button>
        {date !== today && <Button type="button" variant="ghost" size="sm" onClick={() => changeDate(today)}>Today</Button>}
        <span className="text-sm text-muted-foreground">{formatDay(date)}</span>
        <div className="ml-auto">
          {records.isLoading ? null : hasRecords && !pendingRows.length ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><Check className="size-3" />Saved</span>
          ) : hasRecords ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">Unsaved changes</span>
          ) : (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">Not taken yet</span>
          )}
        </div>
      </div>

      {roster.isLoading || records.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : roster.isError || records.isError ? (
        <p role="alert" className="text-sm text-destructive">Couldn't load this class's attendance. Try again.</p>
      ) : !students.length ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">No students are in this class yet.</div>
      ) : (
        <>
          <div className="panel flex flex-wrap items-center gap-2 p-3">
            {STATUSES.map((s) => (
              <span key={s} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_TONE[s]}`}>
                {STATUS_LABEL[s]} <span className="tabular-nums">{tally[s]}</span>
              </span>
            ))}
            <span className="text-xs text-muted-foreground">of {tally.total}</span>
            <div className="ml-auto flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => markAll("present")}>All present</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => markAll("absent")}>All absent</Button>
            </div>
          </div>

          {!hasRecords && <p className="text-xs text-muted-foreground">Nothing is saved for this day yet. Everyone starts as Present. Change anyone who wasn't, then save.</p>}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by name or roll number" className="pl-9" aria-label="Search students" />
          </div>

          <div className="panel divide-y divide-border">
            {shown.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No students match your search.</p>}
            {shown.map((s) => {
              const current = statusOf(s.student_id);
              const noteOpen = openNotes.has(s.student_id) || Boolean(noteOf(s.student_id));
              return (
                <div key={s.student_id} className="space-y-2 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.full_name || "Student"}</p>
                      <p className="truncate text-xs text-muted-foreground">{[s.roll_no && `Roll ${s.roll_no}`, s.er_no && `ER ${s.er_no}`, s.sr_no && `Sr ${s.sr_no}`].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="grid w-full grid-cols-4 gap-1 sm:w-auto sm:gap-2" role="group" aria-label={`Attendance status for ${s.full_name || "student"}`}>
                      {STATUSES.map((v) => {
                        const selected = current === v;
                        const Icon = STATUS_ICON[v];
                        return (
                          <Button
                            key={v}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "outline"}
                            aria-pressed={selected}
                            aria-label={STATUS_LABEL[v]}
                            onClick={() => setStatusDraft((d) => ({ ...d, [s.student_id]: v }))}
                            className="sm:min-w-[84px]"
                          >
                            <Icon className="size-4 sm:mr-1" />
                            <span className="hidden sm:inline">{STATUS_LABEL[v]}</span>
                            <span className="ml-1 text-xs sm:hidden">{STATUS_LETTER[v]}</span>
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant={noteOf(s.student_id) ? "secondary" : "ghost"}
                      aria-label={`Note for ${s.full_name || "student"}`}
                      aria-expanded={noteOpen}
                      onClick={() => setOpenNotes((prev) => { const n = new Set(prev); if (n.has(s.student_id)) n.delete(s.student_id); else n.add(s.student_id); return n; })}
                    >
                      <StickyNote className="size-4" />
                    </Button>
                  </div>
                  {noteOpen && (
                    <Input
                      value={noteOf(s.student_id)}
                      maxLength={200}
                      onChange={(e) => setNoteDraft((d) => ({ ...d, [s.student_id]: e.target.value }))}
                      placeholder="Add a note (for example: medical leave, bus delay)"
                      aria-label={`Note for ${s.full_name || "student"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-3 flex justify-end">
            <Button onClick={() => void save()} disabled={!pendingRows.length || saving} className="shadow-lg">
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              {!hasRecords ? "Save attendance" : pendingRows.length ? `Save ${pendingRows.length} change${pendingRows.length === 1 ? "" : "s"}` : "All saved"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryTab({ classId, className }: { classId: string; className: string }) {
  const [month, setMonth] = useState(currentMonth());
  const roster = useRoster(classId);
  const { start, end } = monthBounds(month);

  const history = useQuery({
    queryKey: ["attendance-history", classId, month],
    queryFn: async (): Promise<{ student_id: string; attendance_date: string; status: AttendanceStatus }[]> => {
      const q = await db.from("attendance_records").select("student_id,attendance_date,status").eq("class_id", classId).gte("attendance_date", start).lte("attendance_date", end).limit(5000);
      if (q.error) throw q.error;
      return q.data ?? [];
    },
  });

  const records = history.data ?? [];
  const dates = useMemo(() => [...new Set(records.map((r) => r.attendance_date))].sort(), [records]);
  const cell = useMemo(() => new Map(records.map((r) => [`${r.student_id}|${r.attendance_date}`, r.status])), [records]);
  const rows = (roster.data ?? []).map((s) => {
    const t = tallyStatuses(dates.map((d) => cell.get(`${s.student_id}|${d}`)).filter((x): x is AttendanceStatus => Boolean(x)));
    return { student: s, tally: t, pct: attendancePercent(t) };
  });
  const withData = rows.filter((r) => r.pct !== null);
  const classAvg = withData.length ? Math.round((withData.reduce((a, r) => a + (r.pct ?? 0), 0) / withData.length) * 10) / 10 : null;
  const lowCount = rows.filter((r) => isLow(r.pct)).length;

  function exportCsv() {
    const header = ["Name", "Roll No", "ER No", "Sr No", ...dates, "Present", "Late", "Excused", "Absent", "Attendance %"];
    const body = rows.map(({ student: s, tally: t, pct }) => [
      s.full_name ?? "", s.roll_no ?? "", s.er_no ?? "", s.sr_no ?? "",
      ...dates.map((d) => { const st = cell.get(`${s.student_id}|${d}`); return st ? STATUS_LETTER[st] : ""; }),
      t.present, t.late, t.excused, t.absent, pct === null ? "" : pct,
    ]);
    downloadCsv(`attendance-${className.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${month}.csv`, toCsv(header, body));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-[11rem]" aria-label="Month" />
        <Button type="button" variant="outline" onClick={exportCsv} disabled={!dates.length}><Download className="mr-2 size-4" />Export CSV</Button>
      </div>

      {history.isLoading || roster.isLoading ? <Skeleton className="h-64 w-full rounded-xl" /> : history.isError || roster.isError ? (
        <p role="alert" className="text-sm text-destructive">Couldn't load attendance history. Try again.</p>
      ) : !dates.length ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">No attendance was taken in this month.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Days taken</p><p className="mt-1 text-2xl font-semibold">{dates.length}</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Class average</p><p className="mt-1 text-2xl font-semibold">{classAvg === null ? "—" : `${classAvg}%`}</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Below {LOW_ATTENDANCE_THRESHOLD}%</p><p className="mt-1 text-2xl font-semibold">{lowCount}</p></div>
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">Student</th>
                  {dates.map((d) => <th key={d} scope="col" className="px-1.5 py-2 text-center font-medium tabular-nums" title={formatDay(d)}>{Number(d.slice(8))}</th>)}
                  <th scope="col" className="px-3 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ student: s, pct }) => (
                  <tr key={s.student_id} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="sticky left-0 z-10 max-w-[12rem] truncate bg-card px-3 py-1.5 text-left font-medium">{s.full_name || "Student"}</th>
                    {dates.map((d) => {
                      const st = cell.get(`${s.student_id}|${d}`);
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          {st ? <span title={`${formatDay(d)}: ${STATUS_LABEL[st]}`} className={`inline-flex size-6 items-center justify-center rounded border text-[11px] font-semibold ${STATUS_TONE[st]}`}>{STATUS_LETTER[st]}</span> : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <span className={isLow(pct) ? "inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400" : ""}>
                        {isLow(pct) && <AlertTriangle className="size-3.5" aria-label="Low attendance" />}
                        {pct === null ? "—" : `${pct}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">P present · A absent · L late · E excused. Only absences count against the percentage, the same as on the reports page.</p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ student */

type StudentRecord = { class_id: string; attendance_date: string; status: AttendanceStatus; note: string | null; classes: { name: string } | null };
type Period = "all" | "month" | "30";

function StudentView() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("all");

  const records = useQuery({
    queryKey: ["attendance-mine", user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<StudentRecord[]> => {
      const q = await db.from("attendance_records").select("class_id,attendance_date,status,note,classes(name)").eq("student_id", user!.id).order("attendance_date", { ascending: false }).limit(3000);
      if (q.error) throw q.error;
      return q.data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const all = records.data ?? [];
    if (period === "all") return all;
    const from = period === "month" ? `${currentMonth()}-01` : shiftDate(localDateString(), -29);
    return all.filter((r) => r.attendance_date >= from);
  }, [records.data, period]);

  const perClass = useMemo(() => {
    const groups = new Map<string, { name: string; statuses: AttendanceStatus[] }>();
    for (const r of filtered) {
      const g = groups.get(r.class_id) ?? { name: r.classes?.name ?? "Class", statuses: [] };
      g.statuses.push(r.status);
      groups.set(r.class_id, g);
    }
    return [...groups.entries()].map(([id, g]) => ({ id, name: g.name, tally: tallyStatuses(g.statuses) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const overall = attendancePercent(tallyStatuses(filtered.map((r) => r.status)));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-muted-foreground">Your attendance across classes.</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[11rem]" aria-label="Period"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {records.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : records.isError ? (
        <p role="alert" className="text-sm text-destructive">Couldn't load your attendance. Try again.</p>
      ) : !filtered.length ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">No attendance has been recorded for this period.</div>
      ) : (
        <>
          <div className="panel p-4">
            <p className="text-xs text-muted-foreground">Overall attendance</p>
            <p className={`mt-1 text-3xl font-semibold ${isLow(overall) ? "text-red-600 dark:text-red-400" : ""}`}>{overall === null ? "—" : `${overall}%`}</p>
            {isLow(overall) && <p className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><AlertTriangle className="size-3.5" />Below {LOW_ATTENDANCE_THRESHOLD}%. Talk to your teacher if any of these records look wrong.</p>}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {perClass.map(({ id, name, tally }) => {
              const pct = attendancePercent(tally);
              return (
                <div key={id} className="panel space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{name}</p>
                    <p className={`text-sm font-semibold tabular-nums ${isLow(pct) ? "text-red-600 dark:text-red-400" : ""}`}>{pct === null ? "—" : `${pct}%`}</p>
                  </div>
                  <Progress value={pct ?? 0} aria-label={`${name} attendance`} />
                  <p className="text-xs text-muted-foreground">
                    {tally.present} present · {tally.late} late · {tally.excused} excused · {tally.absent} absent
                  </p>
                </div>
              );
            })}
          </div>

          <div className="panel divide-y divide-border">
            {filtered.slice(0, 100).map((r) => (
              <div key={`${r.class_id}-${r.attendance_date}`} className="flex items-center justify-between gap-3 p-3 sm:p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.classes?.name ?? "Class"}</p>
                  <p className="text-xs text-muted-foreground">{formatDay(r.attendance_date)}</p>
                  {r.note && <p className="mt-0.5 text-xs text-muted-foreground">Note: {r.note}</p>}
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
          {filtered.length > 100 && <p className="text-xs text-muted-foreground">Showing the latest 100 of {filtered.length} records. The percentages above include all of them.</p>}
        </>
      )}
    </div>
  );
}
