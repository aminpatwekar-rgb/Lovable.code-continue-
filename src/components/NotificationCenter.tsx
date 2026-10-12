import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";

const db=supabase as any;

export function NotificationCenter(){
  const {user}=useAuth(); const qc=useQueryClient();
  const q=useQuery({queryKey:["notifications",user?.id],enabled:Boolean(user),refetchInterval:30_000,queryFn:async()=>{const r=await db.from("notifications").select("id,title,body,link,kind,read_at,created_at").eq("user_id",user!.id).order("created_at",{ascending:false}).limit(30);if(r.error)throw r.error;return r.data??[];}});
  const markRead=useMutation({mutationFn:async(id:string)=>{const r=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;},onSuccess:()=>qc.invalidateQueries({queryKey:["notifications",user?.id]})});
  const allRead=useMutation({mutationFn:async()=>{const r=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user!.id).is("read_at",null);if(r.error)throw r.error;},onSuccess:()=>qc.invalidateQueries({queryKey:["notifications",user?.id]})});
  const unread=(q.data??[]).filter((n:any)=>!n.read_at).length;
  return <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label="Notifications"><Bell className="size-4"/>{unread>0&&<span className="absolute right-1 top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{unread>9?"9+":unread}</span>}</Button></PopoverTrigger><PopoverContent align="end" className="w-[360px] p-0"><div className="flex items-center justify-between border-b border-border p-3"><div><p className="font-medium">Notifications</p><p className="text-xs text-muted-foreground">{unread} unread</p></div><Button variant="ghost" size="sm" onClick={()=>allRead.mutate()} disabled={!unread}>Mark all read</Button></div><div className="max-h-[420px] overflow-y-auto">{!(q.data??[]).length?<p className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</p>:(q.data??[]).map((n:any)=><div key={n.id} className={`border-b border-border/60 p-3 ${!n.read_at?"bg-muted/30":""}`}><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{n.title}</p>{n.body&&<p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}<p className="mt-1 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p></div>{!n.read_at&&<button className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={()=>markRead.mutate(n.id)} aria-label="Mark read"><Check className="size-4"/></button>}</div>{n.link&&<Link to={n.link as any} onClick={()=>!n.read_at&&markRead.mutate(n.id)} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open</Link> }</div>)}</div></PopoverContent></Popover>;
}
