import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Moon,
  Sun,
  LogOut,
  Menu,
  Shield,
  ClipboardList,
  Trophy,
  Award,
  X,

} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/classes", label: "Classes", icon: GraduationCap },
  { to: "/assignments", label: "Assignments", icon: BookOpen },
  { to: "/quizzes", label: "Quizzes", icon: ClipboardList },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/achievements", label: "Achievements", icon: Award },
] as const;

const ADMIN_NAV = [{ to: "/admin", label: "Admin", icon: Shield }] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRouterState({ select: (s) => s.location });
  const { theme, toggle } = useTheme();
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearSessionConfirmation();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }


  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const items = role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon }) => {

        const active = pathname === to || pathname.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute left-0 h-5 w-0.5 rounded-full bg-primary"
              />
            )}
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 z-30 hidden h-screen flex-col justify-between border-r border-sidebar-border bg-sidebar/80 p-4 backdrop-blur-xl lg:flex">
        <div className="space-y-6">
          <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1">
            <span className="brand-gradient flex size-8 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground">
              O
            </span>
            <span className="text-sm font-semibold tracking-tight">ONYX</span>
          </Link>
          {nav}
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name || "Account"}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{role}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={signOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <header className="glass sticky top-0 z-40 flex items-center justify-between px-4 py-3 lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="brand-gradient flex size-7 items-center justify-center rounded-md text-xs font-bold text-primary-foreground">
            O
          </span>
          <span className="text-sm font-semibold">ONYX</span>
        </Link>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </header>

      {open && (
        <div className="border-b border-border bg-sidebar p-4 lg:hidden">
          {nav}
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={signOut}>
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-6xl"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
