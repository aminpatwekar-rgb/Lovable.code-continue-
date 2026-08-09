import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearSessionConfirmation, markSessionConfirmed } from "@/lib/session-confirm";


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

  async function loadMeta(userId: string, userEmail?: string | null) {
    const [{ data: p }, resolved] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url, institution")
        .eq("id", userId)
        .maybeSingle(),
      readRoles(userId),
    ]);
    setProfile(p ? ({ ...p, email: userEmail ?? null } as Profile) : null);

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
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!active) return;
      setSession(s);
      // An explicit sign-in (password form or an OAuth callback landing back on
      // the app) counts as the user confirming the account. A merely restored
      // session never does — that path shows the "Continue as …" screen.
      if (event === "SIGNED_IN" && s?.user) {
        const url = new URL(window.location.href);
        const fromExplicitSignIn =
          url.pathname === "/auth" ||
          url.searchParams.has("code") ||
          url.hash.includes("access_token");
        if (fromExplicitSignIn) markSessionConfirmed(s.user.id);
      }
      if (event === "SIGNED_OUT") clearSessionConfirmation();
      if (s?.user) {
        void loadMeta(s.user.id, s.user.email);
      } else {
        setProfile(null);
        setRole(null);
      }
    });


    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadMeta(data.session.user.id, data.session.user.email);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refresh = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadMeta(data.user.id, data.user.email);
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
