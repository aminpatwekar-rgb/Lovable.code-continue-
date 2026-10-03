import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsv,toCsv } from "@/lib/csv";

const db=supabase as any;

export const Route=createFileRoute("/_authenticated/reports")({
  head:()=>({meta:[{title:"Progress Reports — ONYX"}]}),
  component:Page,
});

function Page(){
  const {user}=useAuth();
  const {effectiveRole}=useViewRole();
  const isTeacher=effectiveRole==="teacher"||effectiveRole==="admin";
  const [classId,setClassId]=useState("");
  const [studentId,setStudentId]=useState("");
  const classes=useQuery({queryKey:["report-classes",user?.id,isTeacher],enabled:Boolean(user),queryFn:async()=>{const q=isTeacher?await db.from("classes").select("id,name").eq("teacher_id",user!.id).eq("archived",false).order("name"):await db.from("class_members").select("class_id,classes(id,name)").eq("student_id",user!.id);if(q.error)throw q.error;return (q.data??[]).map((x:any)=>isTeacher?x:x.classes).filter(Boolean);}});
  const roster=useQuery({queryKey:["report-roster",classId],enabled:isTeacher&&Boolean(classId),queryFn:async()=>{const q=await db.from("class_members").select("student_id,full_name").eq("class_id",classId).eq("member_role","student").order("full_name");if(q.error)throw q.error;return q.data??[];}});
  const target=isTeacher?(studentId||roster.data?.[0]?.student_id):user?.id;
  const report=useQuery({queryKey:["progress-report",target,classId],enabled:Boolean(target),queryFn:async()=>{const q=await db.rpc("get_progress_report",{_student_id:target,_class_id:classId||null});if(q.error)throw q.error;return q.data as any;}});
  const exportReport=()=>{if(!report.data)return;const r=report.data;downloadCsv(`onyx-progress-${target}.csv`,toCsv(["Metric","Value"],Object.entries(r)));};
  return <PlanGate feature="progress_reports">
    <div className="space-y-6 print:space-y-3">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Progress Reports</h1><p className="text-sm text-muted-foreground">Real assignment progress calculated from ONYX records.</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>window.print()}><Printer className="mr-2 size-4"/>Print</Button><Button variant="outline" onClick={exportReport} disabled={!report.data}><Download className="mr-2 size-4"/>CSV</Button></div></header>
    <div className="flex flex-wrap gap-3">
      <Select value={classId} onValueChange={v=>{setClassId(v);setStudentId("");}}><SelectTrigger className="w-60"><SelectValue placeholder="Select class"/></SelectTrigger><SelectContent>{(classes.data??[]).map((c:any)=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
      {isTeacher&&<Select value={studentId||roster.data?.[0]?.student_id||""} onValueChange={setStudentId}><SelectTrigger className="w-60"><SelectValue placeholder="Select student"/></SelectTrigger><SelectContent>{(roster.data??[]).map((s:any)=><SelectItem key={s.student_id} value={s.student_id}>{s.full_name||"Student"}</SelectItem>)}</SelectContent></Select>}
    </div>
    {!target?<div className="panel p-8 text-center text-sm text-muted-foreground">Select a class to generate a report.</div>:
    report.isLoading?<div className="panel p-8">Generating report…</div>:
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(report.data??{}).map(([k,v])=><div className="panel p-5" key={k}><p className="text-xs uppercase tracking-wide text-muted-foreground">{k.replaceAll("_"," ")}</p><p className="mt-2 text-2xl font-semibold">{String(v)}</p></div>)}</div>}
  </div>;</PlanGate>
}
