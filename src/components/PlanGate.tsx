import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Sparkles } from "lucide-react";

const db=supabase as any;

export function PlanGate({feature,children}:{feature:string;children:ReactNode}){
  const {user}=useAuth();
  const q=useQuery({queryKey:["plan-feature",user?.id,feature],enabled:Boolean(user),queryFn:async()=>{const r=await db.rpc("user_has_feature",{_feature:feature});if(r.error)throw r.error;return Boolean(r.data);}});
  if(q.isLoading)return <div className="panel p-8 text-sm text-muted-foreground">Checking your plan…</div>;
  if(q.isError)return <div className="panel p-8 text-sm text-destructive">Could not verify feature access.</div>;
  if(!q.data)return <div className="panel mx-auto max-w-xl p-10 text-center"><Sparkles className="mx-auto size-6 text-primary"/><h1 className="mt-3 text-xl font-semibold">Upgrade to unlock this feature</h1><p className="mt-1 text-sm text-muted-foreground">This ONYX feature is not included in your current plan.</p></div>;
  return <>{children}</>;
}
