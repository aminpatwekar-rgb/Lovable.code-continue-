import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

const db=supabase as any;

function CoTeacherRequestActions({requestId}:{requestId:string}){
  const qc=useQueryClient();
  const req=useQuery({queryKey:["co-teacher-request",requestId],queryFn:async()=>{const r=await db.from("class_co_teacher_requests").select("id,status,class_id").eq("id",requestId).maybeSingle();if(r.error)throw r.error;return r.data as {id:string;status:string;class_id:string}|null;}});
  const respond=useMutation({mutationFn:async(approve:boolean)=>{const r=await db.rpc("respond_co_teacher_request",{_request_id:requestId,_approve:approve});if(r.error)throw r.error;return approve;},onSuccess:(approved)=>{toast.success(approved?"Co-teacher approved":"Request declined");void qc.invalidateQueries({queryKey:["co-teacher-request",requestId]});void qc.invalidateQueries({queryKey:["notifications"]});void qc.invalidateQueries({queryKey:["co-teacher-requests"]});void qc.invalidateQueries({queryKey:["roster"]});void qc.invalidateQueries({queryKey:["classes"]});},onError:(e:Error)=>toast.error(e.message)});
  if(req.isLoading||!req.data)return null;
  if(req.data.status==="approved")return <p className="mt-2 text-xs font-medium text-success">Approved</p>;
  if(req.data.status==="declined")return <p className="mt-2 text-xs font-medium text-muted-foreground">Declined</p>;
  return <div className="mt-2 flex gap-2"><Button size="sm" className="h-7 px-3 text-xs" disabled={respond.isPending} onClick={()=>respond.mutate(true)}>Accept</Button><Button size="sm" variant="outline" className="h-7 px-3 text-xs" disabled={respond.isPending} onClick={()=>respond.mutate(false)}>Decline</Button></div>;
}

export function NotificationCenter(){
  const {user}=useAuth(); const qc=useQueryClient();
  const q=useQuery({queryKey:["notifications",user?.id],enabled:Boolean(user),refetchInterval:30_000,queryFn:async()=>{const r=await db.from("notifications").select("id,title,body,link,kind,ref_id,read_at,created_at").eq("user_id",user!.id).order("created_at",{ascending:false}).limit(30);if(r.error)throw r.error;return r.data??[];}});
  const markRead=useMutation({mutationFn:async(id:string)=>{const r=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;},onSuccess:()=>qc.invalidateQueries({queryKey:["notifications",user?.id]})});
  const allRead=useMutation({mutationFn:async()=>{const r=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user!.id).is("read_at",null);if(r.error)throw r.error;},onSuccess:()=>qc.invalidateQueries({queryKey:["notifications",user?.id]})});
  const unread=(q.data??[]).filter((n:any)=>!n.read_at).length;
  return <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label="Notifications"><Bell className="size-4"/>{unread>0&&<span className="absolute right-1 top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{unread>9?"9+":unread}</span>}</Button></PopoverTrigger><PopoverContent align="end" className="w-[360px] p-0"><div className="flex items-center justify-between border-b border-border p-3"><div><p className="font-medium">Notifications</p><p className="text-xs text-muted-foreground">{unread} unread</p></div><Button variant="ghost" size="sm" onClick={()=>allRead.mutate()} disabled={!unread}>Mark all read</Button></div><div className="max-h-[420px] overflow-y-auto">{!(q.data??[]).length?<p className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</p>:(q.data??[]).map((n:any)=><div key={n.id} className={`border-b border-border/60 p-3 ${!n.read_at?"bg-muted/30":""}`}><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{n.title}</p>{n.body&&<p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}{n.kind==="co_teacher_request"&&n.ref_id&&<CoTeacherRequestActions requestId={n.ref_id}/>}<p className="mt-1 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p></div>{!n.read_at&&<button className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={()=>markRead.mutate(n.id)} aria-label="Mark read"><Check className="size-4"/></button>}</div>{n.link&&<Link to={n.link as any} onClick={()=>!n.read_at&&markRead.mutate(n.id)} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open</Link> }</div>)}</div></PopoverContent></Popover>;
}
