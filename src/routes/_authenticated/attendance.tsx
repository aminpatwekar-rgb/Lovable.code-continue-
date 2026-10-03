import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const db = supabase as any;
const STATUSES = ["present","absent","late","excused"] as const;
type Status = typeof STATUSES[number];

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "Attendance — ONYX" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const today = new Date().toISOString().slice(0,10);
  const [classId,setClassId] = useState("");
  const [date,setDate] = useState(today);
  const [draft,setDraft] = useState<Record<string,Status>>({});

  const classes = useQuery({
    queryKey:["attendance-classes",user?.id,effectiveRole],
    enabled:Boolean(user),
    queryFn:async()=>{
      const q = isTeacher
        ? await db.from("classes").select("id,name,subject").eq("teacher_id",user!.id).eq("archived",false).order("name")
        : await db.from("class_members").select("class_id,classes(id,name,subject)").eq("student_id",user!.id);
      if(q.error) throw q.error;
      return (q.data ?? []).map((x:any)=>isTeacher?x:x.classes).filter(Boolean);
    }
  });

  const roster = useQuery({
    queryKey:["attendance-roster",classId],
    enabled:isTeacher && Boolean(classId),
    queryFn:async()=>{
      const q=await db.from("class_members").select("student_id,full_name,roll_no,er_no,sr_no,member_role").eq("class_id",classId).eq("member_role","student").order("full_name");
      if(q.error) throw q.error; return q.data ?? [];
    }
  });

  const records = useQuery({
    queryKey:["attendance-records",classId,date,user?.id,isTeacher],
    enabled:Boolean(classId && user),
    queryFn:async()=>{
      const q=isTeacher
        ? await db.from("attendance_records").select("student_id,status,note").eq("class_id",classId).eq("attendance_date",date)
        : await db.from("attendance_records").select("class_id,attendance_date,status,note,classes(name)").eq("student_id",user!.id).order("attendance_date",{ascending:false}).limit(200);
      if(q.error) throw q.error; return q.data ?? [];
    }
  });

  const current = useMemo(()=>Object.fromEntries((records.data ?? []).map((r:any)=>[r.student_id,r.status])) as Record<string,Status>,[records.data]);
  const values = {...current,...draft};

  async function save(){
    if(!classId || !roster.data?.length) return;
    const rows=(roster.data as any[]).map((s:any)=>({
      class_id:classId, student_id:s.student_id, attendance_date:date,
      status:values[s.student_id] ?? "present", marked_by:user!.id
    }));
    const q=await db.from("attendance_records").upsert(rows,{onConflict:"class_id,student_id,attendance_date"});
    if(q.error) throw q.error;
    setDraft({});
    await records.refetch();
  }

  if(!isTeacher) return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Attendance</h1><p className="text-sm text-muted-foreground">Your attendance history across classes.</p></header>
      <div className="grid gap-3">{(records.data ?? []).map((r:any)=><div className="panel flex items-center justify-between p-4" key={r.attendance_date+r.class_id}><div><p className="font-medium">{r.classes?.name ?? "Class"}</p><p className="text-xs text-muted-foreground">{r.attendance_date}</p></div><Badge>{r.status}</Badge></div>)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Attendance</h1><p className="text-sm text-muted-foreground">Mark and review attendance from the real class roster.</p></header>
      <div className="flex flex-wrap gap-3">
        <Select value={classId} onValueChange={v=>{setClassId(v);setDraft({});}}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select class" /></SelectTrigger>
          <SelectContent>{(classes.data ?? []).map((c:any)=><SelectItem value={c.id} key={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative"><CalendarDays className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input type="date" value={date} onChange={e=>{setDate(e.target.value);setDraft({});}} className="pl-9"/></div>
        <Button onClick={save} disabled={!classId || !roster.data?.length}><Save className="mr-2 size-4"/>Save attendance</Button>
      </div>
      {!classId ? <div className="panel p-8 text-center text-sm text-muted-foreground">Select a class to begin.</div> :
      <div className="panel divide-y divide-border">
        {(roster.data ?? []).map((s:any)=><div key={s.student_id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1"><p className="font-medium">{s.full_name || "Student"}</p><p className="text-xs text-muted-foreground">{[s.roll_no&&`Roll ${s.roll_no}`,s.er_no&&`ER ${s.er_no}`,s.sr_no&&`Sr ${s.sr_no}`].filter(Boolean).join(" · ")}</p></div>
          <Select value={values[s.student_id] ?? "present"} onValueChange={v=>setDraft(d=>({...d,[s.student_id]:v as Status}))}>
            <SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent>{STATUSES.map(v=><SelectItem value={v} key={v}>{v[0].toUpperCase()+v.slice(1)}</SelectItem>)}</SelectContent>
          </Select>
          {values[s.student_id] === "present" && <Check className="size-4 text-success"/>}
        </div>)}
      </div>}
    </div>
  );
}
