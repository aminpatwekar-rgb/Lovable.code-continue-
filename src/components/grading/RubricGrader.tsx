import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const db=supabase as any;

export function RubricGrader({submissionId,rubricId,onTotalChange}:{submissionId:string;rubricId:string;onTotalChange?:(value:number)=>void}){
  const [selection,setSelection]=useState<Record<string,{levelId:string;points:number;feedback:string}>>({});
  const q=useQuery({queryKey:["rubric-grade",submissionId,rubricId],queryFn:async()=>{
    const [r,c,g]=await Promise.all([
      db.from("rubrics").select("id,title,description").eq("id",rubricId).maybeSingle(),
      db.from("rubric_criteria").select("id,position,title,description,max_points,rubric_levels(id,position,label,description,points)").eq("rubric_id",rubricId).order("position"),
      db.from("rubric_grades").select("criterion_id,level_id,awarded_points,feedback").eq("submission_id",submissionId)
    ]);
    if(r.error)throw r.error;if(c.error)throw c.error;if(g.error)throw g.error;
    return {rubric:r.data,criteria:c.data??[],grades:g.data??[]};
  }});
  useEffect(()=>{if(q.data) setSelection(Object.fromEntries((q.data.grades??[]).map((g:any)=>[g.criterion_id,{levelId:g.level_id??"",points:Number(g.awarded_points)||0,feedback:g.feedback??""}])));},[q.data]);
  const total=useMemo(()=>Object.values(selection).reduce((n,v)=>n+v.points,0),[selection]);
  useEffect(()=>onTotalChange?.(total),[total,onTotalChange]);
  if(q.isLoading)return <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Loading rubric…</div>;
  if(q.isError||!q.data?.rubric)return null;
  async function save(){
    for(const c of q.data!.criteria as any[]){
      const s=selection[c.id]; if(!s) continue;
      const r=await db.from("rubric_grades").upsert({submission_id:submissionId,criterion_id:c.id,level_id:s.levelId||null,awarded_points:s.points,feedback:s.feedback.trim()||null,graded_by:(await db.auth.getUser()).data.user.id},{onConflict:"submission_id,criterion_id"});
      if(r.error)throw r.error;
    }
  }
  return <section className="rounded-lg border border-border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{q.data.rubric.title}</h3>{q.data.rubric.description&&<p className="mt-1 text-xs text-muted-foreground">{q.data.rubric.description}</p>}</div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{total} pts</span></div><div className="mt-4 space-y-4">{(q.data.criteria as any[]).map(c=>{const s=selection[c.id]??{levelId:"",points:0,feedback:""};const levels=(c.rubric_levels??[]) as any[];return <div className="space-y-2 rounded-lg border border-border/70 p-3" key={c.id}><div><Label>{c.title} · max {c.max_points}</Label>{c.description&&<p className="text-xs text-muted-foreground">{c.description}</p>}</div><Select value={s.levelId||"none"} onValueChange={v=>{const level=levels.find(x=>x.id===v);setSelection(m=>({...m,[c.id]:{...m[c.id],levelId:v==="none"?"":v,points:Number(level?.points)||0,feedback:m[c.id]?.feedback??""}}));}}><SelectTrigger><SelectValue placeholder="Select performance level"/></SelectTrigger><SelectContent><SelectItem value="none">Not graded</SelectItem>{levels.map(l=><SelectItem value={l.id} key={l.id}>{l.label} · {l.points} pts</SelectItem>)}</SelectContent></Select><Textarea value={s.feedback} onChange={e=>setSelection(m=>({...m,[c.id]:{...s,feedback:e.target.value}}))} placeholder="Criterion feedback (optional)" className="min-h-16"/></div>})}</div><Button className="mt-4" variant="outline" onClick={save}>Save rubric grades</Button></section>;
}
