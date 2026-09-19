import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
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
  Eye,
  Check,
  ChevronDown,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearSessionConfirmation } from "@/lib/session-confirm";
import { SPRING_PRESS, getPressProps } from "@/lib/motionPresets";

import { GlobalSearch } from "@/components/GlobalSearch";
import { Wordmark } from "@/components/Wordmark";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
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

const MotionLink = motion.create(Link);

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRouterState({ select: (s) => s.location });
  const { theme, toggle } = useTheme();
  const { profile, role } = useAuth();
  const { effectiveRole, setViewRole, isOverridden } = useViewRole();
  const shouldReduceMotion = useReducedMotion();
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

  // Navigation items follow effectiveRole for previewing
  const items = effectiveRole === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;
  const canSwitchRole = role === "admin" || role === "teacher";

  const renderRoleSwitcher = (compact = false) => {
    const roleDotClass =
      effectiveRole === "admin"
        ? "bg-primary"
        : effectiveRole === "teacher"
          ? "bg-info"
          : "bg-muted-foreground";

    if (!canSwitchRole) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/80 px-2.5 py-0.5 text-[11px] font-medium capitalize tracking-wide text-muted-foreground shadow-2xs">
          <span className={cn("size-1.5 shrink-0 rounded-full", roleDotClass)} />
          {effectiveRole}
        </div>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            type="button"
            {...getPressProps(shouldReduceMotion, { hoverScale: 1.02, tapScale: 0.96 })}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/80 px-2.5 py-0.5 text-[11px] font-medium capitalize tracking-wide text-muted-foreground shadow-2xs transition-colors duration-150 hover:border-border hover:bg-secondary hover:text-foreground cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring",
              compact && "px-2 py-0.5 text-[10px]",
            )}
            title={`View as: ${effectiveRole} (Click to change)`}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", roleDotClass)} />
            <span>{effectiveRole}</span>
            <ChevronDown className="size-3 text-muted-foreground transition-transform duration-200 group-hover:text-foreground group-hover:translate-y-px group-data-[state=open]:rotate-180" />
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Eye className="size-3.5 text-primary" /> View as (Preview)
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {role === "admin" && (
            <DropdownMenuItem
              onClick={() => setViewRole("admin")}
              className="flex items-center justify-between text-xs cursor-pointer"
            >
              <span>Admin view (Your Role)</span>
              {effectiveRole === "admin" && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setViewRole("teacher")}
            className="flex items-center justify-between text-xs cursor-pointer"
          >
            <span>Teacher view {role === "teacher" && "(Your Role)"}</span>
            {effectiveRole === "teacher" && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setViewRole("student")}
            className="flex items-center justify-between text-xs cursor-pointer"
          >
            <span>Student view</span>
            {effectiveRole === "student" && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
          {isOverridden && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setViewRole(null)}
                className="text-xs text-muted-foreground justify-center font-medium cursor-pointer hover:text-foreground"
              >
                Reset to default ({role})
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const nav = (
    <nav className="flex flex-col gap-1.5" aria-label="Main Navigation">
      {items.map(({ to, label, icon: Icon }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        return (
          <MotionLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            {...getPressProps(shouldReduceMotion, { xHover: 2, tapScale: 0.98 })}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 ease-out",
              active
                ? "bg-primary/10 text-primary shadow-xs font-semibold"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span className="truncate">{label}</span>
          </MotionLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_1fr] bg-background">
      <aside className="sticky top-0 z-30 hidden h-screen flex-col justify-between border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl lg:flex">
        <div className="flex flex-col">
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
            <Link to="/dashboard" className="transition-opacity hover:opacity-90">
              <Wordmark size="sm" />
            </Link>
            {renderRoleSwitcher()}
          </div>

          <div className="space-y-4 p-4">
            <GlobalSearch />
            <div className="pt-1">{nav}</div>
          </div>
        </div>

        <div className="space-y-3 border-t border-sidebar-border p-4 bg-sidebar/40">
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 p-2.5 shadow-2xs transition-colors hover:border-border">
            <Avatar className="size-9 border border-border/50">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {profile?.full_name || "Account"}
              </p>
              <p className="truncate text-[11px] capitalize text-muted-foreground">
                {isOverridden ? `${effectiveRole} (preview)` : role}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 border-border/80 text-muted-foreground hover:text-foreground shadow-2xs"
              onClick={toggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className="ml-1.5 text-xs">{theme === "dark" ? "Light" : "Dark"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 border-border/80 text-muted-foreground hover:text-destructive hover:border-destructive/40 shadow-2xs"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <header className="glass sticky top-0 z-40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-4 py-3 lg:hidden">
        <div className="min-w-0 flex items-center gap-2">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Wordmark size="sm" />
          </Link>
          {canSwitchRole && renderRoleSwitcher(true)}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
            className="size-9 text-muted-foreground hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Open menu"
                className="size-9 border-border/80"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-[min(20rem,85vw)] flex-col gap-4 overflow-y-auto bg-sidebar p-5 border-l border-sidebar-border"
            >
              <SheetHeader className="text-left pb-2 border-b border-sidebar-border">
                <SheetTitle asChild>
                  <div className="flex items-center justify-between">
                    <Wordmark size="sm" />
                    {renderRoleSwitcher()}
                  </div>
                </SheetTitle>
              </SheetHeader>
              <GlobalSearch />
              {nav}
              <div className="mt-auto pt-4 border-t border-sidebar-border space-y-3">
                <div className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {profile?.full_name || "Account"}
                    </p>
                    <p className="truncate text-[11px] capitalize text-muted-foreground">
                      {isOverridden ? `${effectiveRole} (preview)` : role}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 justify-center gap-2 border-border/80 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                  onClick={signOut}
                >
                  <LogOut className="size-4" /> Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-6xl"
        >
          {isOverridden && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-foreground shadow-2xs">
              <div className="flex items-center gap-2 font-medium">
                <Eye className="size-4 shrink-0 text-warning" />
                <span>
                  Previewing as{" "}
                  <strong className="capitalize font-semibold text-foreground">
                    {effectiveRole}
                  </strong>{" "}
                  — your account's actual role is{" "}
                  <strong className="capitalize font-semibold text-foreground">{role}</strong>. Real
                  permissions remain protected by Supabase RLS.
                </span>
              </div>
              <motion.button
                type="button"
                {...getPressProps(shouldReduceMotion, { hoverScale: 1.02, tapScale: 0.96 })}
                onClick={() => setViewRole(null)}
                className="self-start sm:self-auto font-semibold text-primary underline underline-offset-2 hover:opacity-80 cursor-pointer"
              >
                Reset to {role}
              </motion.button>
            </div>
          )}
          {children}
        </motion.div>
      </main>
    </div>
  );
}
