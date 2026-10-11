import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/**
 * ONYX opening animation — plays once per browser session on the landing page.
 *
 * - The whole timeline is CSS (see "ONYX intro" in styles.css), so it paints with the server HTML
 *   before any JavaScript has loaded. React only decides *when it ends* and removes it afterwards.
 * - The end of the timeline is read from a CSS "clock" animation, so JS hydrating late can never
 *   drift out of sync with what is on screen.
 * - Skipped for prefers-reduced-motion and for repeat visits in the same session.
 *   Add `?intro` to the URL to replay it any time.
 * - `html[data-intro]` is the shared switch: "playing" → "revealed" (or "seen"). The landing page
 *   uses it to hold its entrance animations until the intro opens.
 */

const SEEN_KEY = "onyx-intro-seen";
const HOLD_MS = 2800; // keep in sync with `oi-clock` in styles.css
const EXIT_MS = 1000; // keep in sync with `oi-iris` in styles.css

type Phase = "playing" | "exiting" | "done";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const LETTERS = ["O", "N", "Y", "X"];

/** Runs in <head> on a full page load so repeat visits never flash the intro. */
export const ONYX_INTRO_HEAD_SCRIPT = `try{var d=document.documentElement,s=window.sessionStorage,q=/[?&]intro(=|&|$)/.test(location.search);if(q)s.removeItem("${SEEN_KEY}");d.setAttribute("data-intro",s.getItem("${SEEN_KEY}")?"seen":"playing")}catch(e){document.documentElement.setAttribute("data-intro","seen")}`;

export function OnyxIntro() {
  const [phase, setPhase] = useState<Phase>("playing");
  const clockRef = useRef<HTMLSpanElement>(null);
  const exitedRef = useRef(false);

  useIsoLayoutEffect(() => {
    const root = document.documentElement;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let alreadySeen = false;
    try {
      alreadySeen = window.sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      alreadySeen = true; // storage blocked: don't risk replaying on every visit
    }
    const attr = root.getAttribute("data-intro"); // set by the head script on a full page load
    const shouldPlay = !reduceMotion && (attr === "playing" || (attr !== "seen" && !alreadySeen));

    if (!shouldPlay) {
      root.setAttribute("data-intro", "seen");
      setPhase("done");
      return;
    }

    root.setAttribute("data-intro", "playing");
    root.classList.add("oi-lock");

    let cancelled = false;
    const startExit = () => {
      if (cancelled || exitedRef.current) return;
      exitedRef.current = true;
      try {
        window.sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
      root.setAttribute("data-intro", "revealed");
      setPhase("exiting");
    };

    // End when the CSS timeline ends (works even if hydration happened mid-animation).
    const clock = clockRef.current
      ?.getAnimations?.()
      .find((a) => (a as CSSAnimation).animationName === "oi-clock");
    if (clock) {
      if (clock.playState === "finished") startExit();
      else clock.finished.then(startExit).catch(() => {});
    }
    const fallback = window.setTimeout(startExit, clock ? HOLD_MS + 2000 : HOLD_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") startExit();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      window.removeEventListener("keydown", onKey);
      root.classList.remove("oi-lock");
      if (root.getAttribute("data-intro") === "playing")
        root.setAttribute("data-intro", "revealed");
    };
  }, []);

  // Safety net in case the exit animation event never fires.
  useEffect(() => {
    if (phase !== "exiting") return;
    const t = window.setTimeout(() => setPhase("done"), EXIT_MS + 400);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "done") document.documentElement.classList.remove("oi-lock");
  }, [phase]);

  if (phase === "done") return null;

  const skip = () => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-intro", "revealed");
    setPhase("exiting");
  };

  return (
    <div className="onyx-intro" role="status" aria-label="Loading ONYX">
      <div
        className="oi-stage"
        data-phase={phase}
        onClick={skip}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && e.animationName === "oi-iris") setPhase("done");
        }}
      >
        {/* Colour field: soft radial blobs drifting on the compositor, hue sliding as a whole */}
        <div className="oi-aurora" aria-hidden="true">
          <span className="oi-blob oi-blob--1" />
          <span className="oi-blob oi-blob--2" />
          <span className="oi-blob oi-blob--3" />
          <span className="oi-blob oi-blob--4" />
        </div>
        <div className="oi-vignette" aria-hidden="true" />

        <div className="oi-center">
          <svg className="oi-gem" viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient
                id="oi-gem-grad"
                gradientUnits="userSpaceOnUse"
                x1="8"
                y1="4"
                x2="56"
                y2="60"
              >
                <stop offset="0" style={{ stopColor: "oklch(0.93 0.05 250)" }} />
                <stop offset="0.45" style={{ stopColor: "oklch(0.76 0.17 262)" }} />
                <stop offset="0.75" style={{ stopColor: "oklch(0.72 0.21 305)" }} />
                <stop offset="1" style={{ stopColor: "oklch(0.83 0.15 345)" }} />
              </linearGradient>
            </defs>
            {[
              { p: "8,22 32,4 20,22", o: 0.35, d: 900 },
              { p: "20,22 32,4 44,22", o: 0.55, d: 1000 },
              { p: "44,22 32,4 56,22", o: 0.28, d: 1100 },
              { p: "8,22 20,22 32,60", o: 0.22, d: 1000 },
              { p: "20,22 44,22 32,60", o: 0.4, d: 1100 },
              { p: "44,22 56,22 32,60", o: 0.18, d: 1200 },
            ].map((f) => (
              <polygon
                key={f.p}
                points={f.p}
                className="oi-facet"
                style={{ "--o": f.o, "--d": `${f.d}ms` } as CSSProperties}
              />
            ))}
            {[
              { d: "M32 4 L56 22 L32 60 L8 22 Z", t: 0 },
              { d: "M8 22 H56", t: 350 },
              { d: "M32 4 L20 22 L32 60", t: 500 },
              { d: "M32 4 L44 22 L32 60", t: 650 },
            ].map((l) => (
              <path
                key={l.d}
                d={l.d}
                pathLength={1}
                className="oi-gem-line"
                style={{ "--d": `${l.t + 150}ms` } as CSSProperties}
              />
            ))}
            <path
              className="oi-spark"
              d="M52 3 L53.3 7.7 L58 9 L53.3 10.3 L52 15 L50.7 10.3 L46 9 L50.7 7.7 Z"
            />
          </svg>

          <div className="oi-word" aria-hidden="true">
            {LETTERS.map((ch, i) => (
              <span key={ch} className="oi-letter" style={{ "--i": i } as CSSProperties}>
                {ch}
              </span>
            ))}
          </div>
          <span className="sr-only">ONYX</span>

          <div className="oi-rule" aria-hidden="true" />
          <p className="oi-tagline">Handwriting-first assignments</p>
        </div>

        <button type="button" className="oi-skip" onClick={skip}>
          Skip
        </button>

        <span ref={clockRef} className="oi-clock" aria-hidden="true" />
      </div>

      {phase === "exiting" && <div className="oi-rim" aria-hidden="true" />}
    </div>
  );
}
