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
  Settings,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearSessionConfirmation } from "@/lib/session-confirm";

import { GlobalSearch } from "@/components/GlobalSearch";
import { Wordmark } from "@/components/Wordmark";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  { to: "/settings", label: "Settings", icon: Settings },
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
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
              active
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute left-0 h-5 w-0.5 rounded-full bg-primary"
              />
            )}
            <Icon className={cn("size-4", active ? "text-primary" : "text-current")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 z-30 hidden h-screen flex-col justify-between border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl lg:flex">
        <div>
          <Link
            to="/dashboard"
            className="flex h-[68px] items-center border-b border-border px-4"
          >
            <Wordmark size="sm" />
          </Link>
          <div className="space-y-5 p-4">
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-2 py-1 text-xs font-semibold capitalize text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              {role}
            </div>
            <GlobalSearch />
            {nav}
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2 transition-colors duration-200">
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

      <header className="glass sticky top-0 z-40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 lg:hidden">
        <Link to="/dashboard" className="min-w-0">
          <Wordmark size="sm" />
        </Link>

        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-[min(20rem,85vw)] flex-col gap-4 overflow-y-auto bg-sidebar p-4"
            >
              <SheetHeader className="text-left">
                <SheetTitle asChild>
                  <span>
                    <Wordmark size="sm" />
                  </span>
                </SheetTitle>
              </SheetHeader>
              <div className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-secondary px-2 py-1 text-xs font-semibold capitalize text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                {role}
              </div>
              <GlobalSearch />
              {nav}
              <Button variant="outline" size="sm" className="mt-auto w-full" onClick={signOut}>
                <LogOut className="mr-2 size-4" /> Sign out
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </header>

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
