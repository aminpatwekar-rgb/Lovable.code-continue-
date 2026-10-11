import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import onyxMark from "@/assets/onyx-mark.png.asset.json";

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
          <div className="oi-logo" aria-hidden="true">
            <span className="oi-logo-halo">
              <span className="oi-logo-ring" />
            </span>
            <span className="oi-logo-face">
              {/* Instant placeholder (tiny, same mark) under the full-size brand image */}
              <img src="/favicon.png" alt="" width={64} height={64} className="oi-logo-ph" />
              <img
                src={onyxMark.url}
                alt=""
                width={112}
                height={112}
                decoding="async"
                fetchPriority="high"
                className="oi-logo-img"
              />
              <span className="oi-logo-sheen" />
            </span>
            <svg className="oi-logo-spark" viewBox="0 0 24 24">
              <path
                className="oi-spark"
                d="M12 1 L13.8 8.2 L21 10 L13.8 11.8 L12 19 L10.2 11.8 L3 10 L10.2 8.2 Z"
              />
            </svg>
          </div>

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
