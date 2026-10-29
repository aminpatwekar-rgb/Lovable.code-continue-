import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ViewRoleProvider } from "@/lib/viewRole";
import { Toaster } from "@/components/ui/sonner";
import { LoadingScreen } from "@/components/LoadingScreen";
import { savePendingJoinCode } from "@/lib/institution-join";
import { cn } from "@/lib/utils";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

// Applies the saved theme before first paint so dark-mode users never see a light flash.
// Mirrors the logic in ThemeProvider (src/lib/theme.tsx): new visitors default to light.
const THEME_HEAD_SCRIPT = `try{var d=document.documentElement,l=localStorage,m=l.getItem("theme");if(m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark");var a=l.getItem("onyx-accent");if(a)d.setAttribute("data-accent",a);var t=l.getItem("onyx-theme-style");if(t)d.setAttribute("data-theme-style",t)}catch(e){}`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Smart Assignment Hub" },
      { property: "og:title", content: "Smart Assignment Hub" },
      {
        name: "description",
        content:
          "Handwriting-first assignment platform for schools and colleges with teacher, student, and admin roles.",
      },
      {
        property: "og:description",
        content:
          "Handwriting-first assignment platform for schools and colleges with teacher, student, and admin roles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#080a10" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "ONYX" },
    ],
    scripts: [{ children: THEME_HEAD_SCRIPT }],
    links: [
      { rel: "stylesheet", href: appCss },
      // Fonts are self-hosted (see @font-face in styles.css) so no third-party request blocks first paint.
      {
        rel: "preload",
        href: "/fonts/inter-tight-latin-wght-normal.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/instrument-serif-latin-400-normal.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/instrument-serif-latin-400-italic.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Keeps the loader mounted briefly after loading ends so it can fade out. */
function BootOverlay({ show }: { show: boolean }) {
  const [mounted, setMounted] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [show]);

  if (!mounted) return null;
  return (
    <LoadingScreen
      className={cn("transition-opacity duration-300", !show && "pointer-events-none opacity-0")}
    />
  );
}

function RootContent() {
  const { loading, session, profile } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // A new account must finish role confirmation before any protected route
  // can be reached, including when OAuth returns to the public landing page.
  useEffect(() => {
    if (
      !loading &&
      session &&
      profile &&
      !profile.role_confirmed_at &&
      pathname !== "/auth" &&
      pathname !== "/reset-password"
    ) {
      // Keep a join link they opened, so the role step can finish joining the institution.
      const joinMatch = /^\/join\/([A-Za-z0-9]+)\/?$/.exec(pathname);
      if (joinMatch?.[1]) savePendingJoinCode(joinMatch[1]);
      void navigate({ to: "/auth", search: { mode: "signup" }, replace: true });
    }
  }, [loading, session, profile, pathname, navigate]);
  // The public landing page does not depend on the session, so it is never hidden behind the loader.
  const showLoader = loading && pathname !== "/";

  return (
    <>
      <Outlet />
      <BootOverlay show={showLoader} />
    </>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Register the tiny service worker (install support + offline page) on the live site only.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!import.meta.env.PROD) return;
    const host = window.location.hostname;
    // Skip Lovable preview/editor hosts so the editor preview never gets a stale worker.
    if (host.includes("lovableproject.com") || host.includes("id-preview")) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ViewRoleProvider>
            {/* Renders full-screen loader during initial auth/session resolution */}
            <RootContent />
            <Toaster richColors position="top-center" />
          </ViewRoleProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
