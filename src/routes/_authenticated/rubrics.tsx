import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";

const db=supabase as any;

export const Route=createFileRoute("/_authenticated/rubrics")({
  head:()=>({meta:[{title:"Rubrics — ONYX"}]}),
  component:Page,
});

type Criterion={title:string;description:string;max_points:number;levels:{label:string;description:string;points:number}[]};

function Page(){
  const {effectiveRole}=useViewRole(); const allowed=effectiveRole==="teacher"||effectiveRole==="admin";
  const qc=useQueryClient(); const [open,setOpen]=useState(false);
  const [title,setTitle]=useState(""); const [description,setDescription]=useState(""); const [criteria,setCriteria]=useState("Technical accuracy | 4 | Excellent:4 | Good:3 | Needs improvement:2 | Poor:1\nPresentation | 4 | Excellent:4 | Good:3 | Needs improvement:2 | Poor:1");
  const q=useQuery({queryKey:["rubrics"],enabled:allowed,queryFn:async()=>{const r=await db.from("rubrics").select("id,title,description,created_at").order("updated_at",{ascending:false});if(r.error)throw r.error;return r.data??[];}});
  const save=useMutation({mutationFn:async()=>{if(!title.trim())throw new Error("Rubric title is required.");const rows:Criterion[]=criteria.split("\n").map(line=>line.trim()).filter(Boolean).map(line=>{const [head,...parts]=line.split("|").map(x=>x.trim());const [name,max]=head!.split("::").map(x=>x.trim());const levels=parts.map(p=>{const [label,points,...desc]=p.split(":");return{label:label?.trim()||"Level",points:Number(points)||0,description:desc.join(":").trim()};});return{title:name||"Criterion",description:"",max_points:Number(max)||Math.max(...levels.map(x=>x.points),1),levels};});const r=await db.from("rubrics").insert({owner_id:(await db.auth.getUser()).data.user.id,title:title.trim(),description:description.trim()||null}).select("id").single();if(r.error)throw r.error;for(let i=0;i<rows.length;i++){const c=rows[i]!;const cr=await db.from("rubric_criteria").insert({rubric_id:r.data.id,position:i,title:c.title,description:c.description,max_points:c.max_points}).select("id").single();if(cr.error)throw cr.error;const levels=c.levels.length?c.levels:[{label:"Achieved",description:"",points:c.max_points}];const lr=await db.from("rubric_levels").insert(levels.map((l,j)=>({criterion_id:cr.data.id,position:j,label:l.label,description:l.description,points:l.points})));if(lr.error)throw lr.error;}},onSuccess:async()=>{setOpen(false);setTitle("");setDescription("");await qc.invalidateQueries({queryKey:["rubrics"]})}});
  const remove=useMutation({mutationFn:async(id:string)=>{const r=await db.from("rubrics").delete().eq("id",id);if(r.error)throw r.error;},onSuccess:()=>qc.invalidateQueries({queryKey:["rubrics"]})});
  if(!allowed)return <div className="panel p-10 text-center text-sm text-muted-foreground">Rubrics are available on eligible teacher plans.</div>;
  return <div className="space-y-6"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Rubrics</h1><p className="text-sm text-muted-foreground">Reusable grading criteria with performance levels.</p></div><Button onClick={()=>setOpen(true)}><Plus className="mr-2 size-4"/>New rubric</Button></header><div className="grid gap-3">{(q.data??[]).map((r:any)=><div className="panel flex items-start justify-between gap-4 p-5" key={r.id}><div><p className="font-semibold">{r.title}</p>{r.description&&<p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}<p className="mt-2 text-xs text-muted-foreground">Created {new Date(r.created_at).toLocaleDateString()}</p></div><Button size="icon" variant="ghost" onClick={()=>remove.mutate(r.id)}><Trash2 className="size-4"/></Button></div>)}{!(q.data??[]).length&&<div className="panel p-10 text-center text-sm text-muted-foreground">No rubrics yet. Create one for your next assignment.</div>}</div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>New rubric</DialogTitle></DialogHeader><div className="space-y-4"><div><label className="text-sm font-medium">Title</label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Research assignment rubric"/></div><div><label className="text-sm font-medium">Description</label><Textarea value={description} onChange={e=>setDescription(e.target.value)}/></div><div><label className="text-sm font-medium">Criteria</label><p className="mb-2 text-xs text-muted-foreground">One criterion per line. Format: Criterion :: max points | Level:points | Level:points</p><Textarea className="min-h-40 font-mono text-xs" value={criteria} onChange={e=>setCriteria(e.target.value)}/></div></div><DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={()=>save.mutate()} disabled={save.isPending}>{save.isPending?"Saving…":"Create rubric"}</Button></DialogFooter></DialogContent></Dialog></div>;
}
