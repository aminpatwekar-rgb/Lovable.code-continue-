import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "teacher" | "admin";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  institution: string | null;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  role: null,
  loading: true,
  refresh: async () => {},
});

// The one-time admin bootstrap is attempted at most once per browser session;
// the database function itself is the real guard and permanently disables
// itself after the first administrator exists.
let bootstrapAttempted = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  async function readRoles(userId: string): Promise<AppRole | null> {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (data ?? []).map((x) => x.role as AppRole);
    return roles.includes("admin")
      ? "admin"
      : roles.includes("teacher")
        ? "teacher"
        : roles.includes("student")
          ? "student"
          : null;
  }

  async function loadMeta(userId: string) {
    const [{ data: p }, resolved] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, institution")
        .eq("id", userId)
        .maybeSingle(),
      readRoles(userId),
    ]);
    setProfile((p as Profile) ?? null);
    let next = resolved;

    if (next === "teacher" && !bootstrapAttempted) {
      bootstrapAttempted = true;
      const { data: promoted } = await supabase.rpc("bootstrap_first_admin");
      if (promoted) next = await readRoles(userId);
    }

    setRole(next);
  }


  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      setSession(s);
      if (s?.user) {
        void loadMeta(s.user.id);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadMeta(data.session.user.id);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refresh = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadMeta(data.user.id);
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, role, loading, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
