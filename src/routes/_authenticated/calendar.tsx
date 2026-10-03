import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";

const db=supabase as any;
type EventRow={id:string;title:string;starts_at:string;event_type:string;link:string;className?:string};

export const Route=createFileRoute("/_authenticated/calendar")({
  head:()=>({meta:[{title:"Calendar — ONYX"}]}),
  component:Page,
});

function Page(){
  const {user,role}=useAuth();
  const [cursor,setCursor]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);});
  const monthKey=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-01`;
  const isTeacher=role==="teacher"||role==="admin";

  const q=useQuery({
    queryKey:["onyx-calendar",user?.id,monthKey,isTeacher],
    enabled:Boolean(user),
    queryFn:async()=>{
      const from=new Date(cursor.getFullYear(),cursor.getMonth(),1).toISOString();
      const to=new Date(cursor.getFullYear(),cursor.getMonth()+1,1).toISOString();
      const events:EventRow[]=[];
      if(isTeacher){
        const [a,z,m]=await Promise.all([
          db.from("assignments").select("id,title,due_date,class_id,classes(name)").eq("teacher_id",user!.id).gte("due_date",from).lt("due_date",to).eq("archived",false),
          db.from("quizzes").select("id,title,start_at,end_at,class_id,classes(name)").eq("teacher_id",user!.id).or(`start_at.gte.${from},end_at.gte.${from}`).or(`start_at.lt.${to},end_at.lt.${to}`),
          db.from("calendar_events").select("id,title,starts_at,event_type,class_id,classes(name)").eq("owner_id",user!.id).gte("starts_at",from).lt("starts_at",to)
        ]);
        if(a.error) throw a.error;if(z.error) throw z.error;if(m.error) throw m.error;
        for(const x of a.data??[]) if(x.due_date) events.push({id:`a-${x.id}`,title:x.title,starts_at:x.due_date,event_type:"assignment",link:`/assignments/${x.id}`,className:x.classes?.name});
        for(const x of z.data??[]) if(x.start_at) events.push({id:`q-${x.id}`,title:x.title,starts_at:x.start_at,event_type:"quiz",link:`/quizzes/${x.id}`,className:x.classes?.name});
        for(const x of m.data??[]) events.push({id:`e-${x.id}`,title:x.title,starts_at:x.starts_at,event_type:x.event_type,link:"/calendar",className:x.classes?.name});
      }else{
        const mem=await db.from("class_members").select("class_id").eq("student_id",user!.id);
        if(mem.error) throw mem.error;
        const ids=(mem.data??[]).map((m:any)=>m.class_id);
        if(ids.length){
          const [a,z,e]=await Promise.all([
            db.from("assignments").select("id,title,due_date,class_id,classes(name)").in("class_id",ids).eq("published",true).eq("archived",false).gte("due_date",from).lt("due_date",to),
            db.from("quizzes").select("id,title,start_at,end_at,class_id,classes(name)").in("class_id",ids).eq("published",true),
            db.from("calendar_events").select("id,title,starts_at,event_type,class_id,classes(name)").in("class_id",ids).gte("starts_at",from).lt("starts_at",to)
          ]);
          if(a.error) throw a.error;if(z.error) throw z.error;if(e.error) throw e.error;
          for(const x of a.data??[]) if(x.due_date) events.push({id:`a-${x.id}`,title:x.title,starts_at:x.due_date,event_type:"assignment",link:`/assignments/${x.id}`,className:x.classes?.name});
          for(const x of z.data??[]) if(x.start_at&&x.start_at>=from&&x.start_at<to) events.push({id:`q-${x.id}`,title:x.title,starts_at:x.start_at,event_type:"quiz",link:`/quizzes/${x.id}`,className:x.classes?.name});
          for(const x of e.data??[]) events.push({id:`e-${x.id}`,title:x.title,starts_at:x.starts_at,event_type:x.event_type,link:"/calendar",className:x.classes?.name});
        }
      }
      return events.sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
    }
  });

  const days=useMemo(()=>{
    const y=cursor.getFullYear(),m=cursor.getMonth();
    const start=new Date(y,m,1).getDay(), count=new Date(y,m+1,0).getDate();
    const cells:Array<number|null>=Array(start).fill(null); for(let i=1;i<=count;i++) cells.push(i); while(cells.length%7) cells.push(null); return cells;
  },[cursor]);

  const byDay=useMemo(()=>{const map=new Map<number,EventRow[]>();for(const e of q.data??[]){const d=new Date(e.starts_at).getDate();map.set(d,[...(map.get(d)??[]),e]);}return map;},[q.data]);

  return <PlanGate feature="calendar">
    <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Calendar</h1><p className="text-sm text-muted-foreground">Assignments, quizzes and scheduled ONYX events.</p></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}><ChevronLeft/></Button><p className="min-w-32 text-center font-medium">{cursor.toLocaleString(undefined,{month:"long",year:"numeric"})}</p><Button variant="outline" size="icon" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}><ChevronRight/></Button></div></header>
    <div className="panel overflow-hidden"><div className="grid grid-cols-7 border-b border-border text-xs font-medium text-muted-foreground">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="p-2 text-center">{d}</div>)}</div><div className="grid grid-cols-7">{days.map((day,i)=><div key={i} className="min-h-28 border-b border-r border-border p-2"><p className="text-xs font-medium">{day ?? ""}</p><div className="mt-1 space-y-1">{day ? (byDay.get(day)??[]).slice(0,4).map(e=><Link key={e.id} to={e.link} className="block truncate rounded bg-muted px-1.5 py-1 text-[11px] hover:bg-primary/10">{e.title}</Link>) : null}</div></div>)}</div></div>
  </div>
  </PlanGate>;
}
