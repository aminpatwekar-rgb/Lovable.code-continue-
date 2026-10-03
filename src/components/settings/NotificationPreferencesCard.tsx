import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Bell, Mail, Clock, FileCheck, Megaphone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const db=supabase as any;

export function NotificationPreferencesCard() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const [ready,setReady]=useState(false);
  const [prefs,setPrefs]=useState({new_assignments:true,deadline_reminders:true,submissions:true,grading:true,announcements:true,email_enabled:true});

  useEffect(()=>{if(!user)return; (async()=>{const q=await db.from("notification_preferences").select("*").eq("user_id",user.id).maybeSingle();if(q.error) {toast.error(q.error.message);return;}if(q.data)setPrefs(p=>({...p,...q.data}));else await db.from("notification_preferences").insert({user_id:user.id});setReady(true);})();},[user]);

  async function toggle(key:keyof typeof prefs,value:boolean){
    setPrefs(p=>({...p,[key]:value}));
    const q=await db.from("notification_preferences").upsert({user_id:user!.id,[key]:value},{onConflict:"user_id"});
    if(q.error){setPrefs(p=>({...p,[key]:!value}));toast.error(q.error.message);return;}
    toast.success("Notification preference saved");
  }

  const items = isTeacher
    ? [["submissions","Student Submission Alerts","Notify when students submit or update work.",FileCheck]]
    : [["new_assignments","New Assignment Alerts","Notify when teachers post assignments.",Mail],["deadline_reminders","Deadline Reminders","Notify before upcoming assignment deadlines.",Clock]];
  return <Card className="lift"><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="size-5 text-primary"/>Notification Preferences</CardTitle><CardDescription>Your preferences are saved to your ONYX account.</CardDescription></CardHeader><CardContent className="space-y-4">{!ready?<p className="text-sm text-muted-foreground">Loading preferences…</p>:<><AnimatePresence initial={false}>{items.map(([key,label,description,Icon]:any)=><motion.div key={key} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3.5"><div className="min-w-0"><div className="flex items-center gap-2"><Icon className="size-4 text-muted-foreground"/><Label className="text-sm font-medium">{label}</Label></div><p className="mt-1 text-xs text-muted-foreground pl-6">{description}</p></div><Switch checked={prefs[key]} onCheckedChange={v=>toggle(key,v)}/></motion.div>)}</AnimatePresence><motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3.5"><div><div className="flex items-center gap-2"><Megaphone className="size-4 text-muted-foreground"/><Label className="text-sm font-medium">Class Announcements</Label></div><p className="mt-1 text-xs text-muted-foreground pl-6">Receive class bulletin notifications.</p></div><Switch checked={prefs.announcements} onCheckedChange={v=>toggle("announcements",v)}/></motion.div><div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3.5"><div><div className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground"/><Label className="text-sm font-medium">Email notifications</Label></div><p className="mt-1 text-xs text-muted-foreground pl-6">Controls whether ONYX may send supported email notifications once an email provider is configured.</p></div><Switch checked={prefs.email_enabled} onCheckedChange={v=>toggle("email_enabled",v)}/></div></> }</CardContent></Card>;
}
