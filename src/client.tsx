import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

// A page can outlive a deployment and try to import a hashed JS chunk that no
// longer exists. Reload once so the browser receives the current document and
// asset manifest, but avoid an infinite reload loop if the deployment is still
// serving inconsistent assets.
const PRELOAD_RECOVERY_KEY = "onyx:vite-preload-recovery";
const PRELOAD_RECOVERY_WINDOW_MS = 30_000;

if (typeof window !== "undefined") {
  try {
    const previousAttempt = Number(window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) ?? "0");
    if (previousAttempt > 0) {
      // If this document survives long enough to hydrate, forget the old attempt.
      window.setTimeout(() => {
        try {
          window.sessionStorage.removeItem(PRELOAD_RECOVERY_KEY);
        } catch {
          // Storage can be disabled by browser privacy settings.
        }
      }, PRELOAD_RECOVERY_WINDOW_MS);
    }
  } catch {
    // Storage can be disabled by browser privacy settings; default error handling remains.
  }

  window.addEventListener("vite:preloadError", (event) => {
    const now = Date.now();
    let previousAttempt = 0;

    try {
      previousAttempt = Number(window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) ?? "0");
      if (previousAttempt > 0 && now - previousAttempt < PRELOAD_RECOVERY_WINDOW_MS) {
        // Let the router's error UI handle repeat failures rather than looping reloads.
        try {
          window.sessionStorage.removeItem(PRELOAD_RECOVERY_KEY);
        } catch {
          // Storage can be disabled by browser privacy settings.
        }
        return;
      }
      window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, String(now));
    } catch {
      // If we cannot record the attempt, don't risk an unbounded reload loop.
      return;
    }

    event.preventDefault();
    window.location.reload();
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
