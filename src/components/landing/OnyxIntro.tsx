import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Volume2, VolumeX } from "lucide-react";
import { createIntroSound, type IntroSound } from "@/lib/introSound";
import { REVEAL } from "./onyxMarkGeometry";
import { Strokes } from "./OnyxMark";

/**
 * ONYX opening animation — plays every time the site is opened (each full page load of the homepage,
 * including refreshes). It does not replay when someone navigates back to the homepage from another
 * page inside the app, which would feel repetitive.
 *
 * - The whole visual timeline is CSS (see "ONYX intro" in styles.css), so it paints with the server
 *   HTML before any JavaScript has loaded. React only decides *when it ends* and removes it after.
 * - The end of the timeline is read from a CSS "clock" animation, so JS hydrating late can never
 *   drift out of sync with what is on screen. Sound is scheduled from the same clock.
 * - Sound is synthesised (src/lib/introSound.ts). Browsers block audio until the visitor interacts
 *   with the page, so if it can't start, a "Tap for sound" button unlocks it.
 * - Skipped only for prefers-reduced-motion.
 * - `html[data-intro]` is the shared switch: "playing" → "revealed" (or "seen" when skipped for
 *   reduced motion). The landing page uses it to hold its entrance animations until the intro opens.
 */

const SOUND_KEY = "onyx-intro-sound";
const HOLD_MS = 3800; // keep in sync with `oi-clock` in styles.css
const EXIT_MS = 1000; // keep in sync with `oi-iris` in styles.css

type Phase = "playing" | "exiting" | "done";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const LETTERS = ["O", "N", "Y", "X"];

/** True once the intro has finished (or been skipped) during this page load; cleared by a reload. */
let playedThisLoad = false;

/** Runs in <head> on every full page load, before first paint, so the page's entrance animations wait for the intro. */
export const ONYX_INTRO_HEAD_SCRIPT = `document.documentElement.setAttribute("data-intro","playing")`;

function Monogram() {
  return (
    <svg className="oi-mono" viewBox="200 160 1000 480" aria-hidden="true">
      <defs>
        <linearGradient
          id="oi-face"
          gradientUnits="userSpaceOnUse"
          x1="250"
          y1="200"
          x2="1160"
          y2="580"
        >
          <stop offset="0" stopColor="#f7f8fb" />
          <stop offset="0.5" stopColor="#b4b7bf" />
          <stop offset="1" stopColor="#6f727b" />
        </linearGradient>
        <linearGradient
          id="oi-gloss"
          gradientUnits="userSpaceOnUse"
          x1="250"
          y1="190"
          x2="520"
          y2="560"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="oi-shn" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="oi-cut">
          <rect x="150" y="200" width="1060" height="380" />
        </clipPath>
        <mask id="oi-reveal" maskUnits="userSpaceOnUse" x="150" y="120" width="1060" height="540">
          <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
            {REVEAL.map((r) => (
              <path
                key={r.id}
                className={`oi-rv oi-rv--${r.id}`}
                d={r.d}
                pathLength={1}
                strokeWidth={r.w + 22}
              />
            ))}
          </g>
        </mask>
        <mask id="oi-shape" maskUnits="userSpaceOnUse" x="150" y="120" width="1060" height="540">
          <g fill="none" stroke="#fff" strokeLinejoin="round">
            <Strokes />
          </g>
        </mask>
        <filter id="oi-blur" x="-10%" y="-10%" width="120%" height="130%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <g mask="url(#oi-reveal)">
        <g className="oi-mono-shd" filter="url(#oi-blur)">
          <g fill="none" stroke="#7f93ff" strokeOpacity="0.22" strokeLinejoin="round">
            <Strokes />
          </g>
        </g>
        <g clipPath="url(#oi-cut)">
          <g className="oi-mono-lift">
            <g fill="none" stroke="#2a2c32" strokeLinejoin="round">
              <Strokes />
            </g>
          </g>
          <g fill="none" stroke="#43454c" strokeLinejoin="round">
            <Strokes />
          </g>
          <g fill="none" stroke="url(#oi-face)" strokeLinejoin="round">
            <Strokes extra={-9} />
          </g>
          <g mask="url(#oi-shape)">
            <rect x="150" y="120" width="1060" height="540" fill="url(#oi-gloss)" />
            <g className="oi-mono-sheen">
              <rect
                x="0"
                y="120"
                width="220"
                height="540"
                fill="url(#oi-shn)"
                transform="skewX(-22)"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

function readSoundPref(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/** True only when the visitor explicitly saved the preference as enabled. */
function readSavedSoundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

/** Save the visitor's sound preference independently of whether autoplay is allowed. */
function writeSoundPref(enabled: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Sound still works for this visit when persistent storage is unavailable.
  }
}

export function OnyxIntro() {
  const [phase, setPhase] = useState<Phase>("playing");
  const [mounted, setMounted] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [savedSoundOn, setSavedSoundOn] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const clockRef = useRef<HTMLSpanElement>(null);
  const exitedRef = useRef(false);
  const soundRef = useRef<IntroSound | null>(null);
  const elapsedRef = useRef<() => number>(() => 0);

  useIsoLayoutEffect(() => {
    const root = document.documentElement;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Plays on the first view of the homepage in each page load. A full load of "/" always gets here
    // with playedThisLoad === false, so refreshing or re-opening the link always replays it.
    const shouldPlay =
      !reduceMotion && !playedThisLoad && root.getAttribute("data-intro") !== "seen";

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
      playedThisLoad = true;
      root.setAttribute("data-intro", "revealed");
      soundRef.current?.stop(700);
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

    // Sound: scheduled from the same clock the visuals use, so the two can't drift apart.
    elapsedRef.current = () => Number(clock?.currentTime ?? performance.now());
    const on = readSoundPref();
    setSoundOn(on);
    setSavedSoundOn(readSavedSoundOn());
    setMounted(true);
    const snd = createIntroSound();
    soundRef.current = snd;
    if (!on) snd.setMuted(true);
    void snd
      .start(() => elapsedRef.current())
      .then((ok) => {
        if (!ok && !cancelled) setNeedsTap(true); // browser blocked autoplay: offer a button
      });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") startExit();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      window.removeEventListener("keydown", onKey);
      snd.stop(150);
      soundRef.current = null;
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
    playedThisLoad = true;
    document.documentElement.setAttribute("data-intro", "revealed");
    soundRef.current?.stop(400);
    setPhase("exiting");
  };

  /** Saves "sound on" and starts whatever is still to come. Needs a user gesture to succeed. */
  const unlockSound = async () => {
    const snd = soundRef.current;
    if (!snd) return;
    // Persist the choice immediately; the browser may still block audio on this visit.
    writeSoundPref(true);
    setSoundOn(true);
    setSavedSoundOn(true);
    snd.setMuted(false);
    try {
      const ok = await snd.start(() => elapsedRef.current());
      setNeedsTap(!ok);
    } catch {
      // Keep the preference enabled so the next intro remembers the visitor's choice.
      setNeedsTap(true);
    }
  };

  /**
   * Tapping the intro normally skips it. But if the visitor has saved "sound on" and the browser is
   * still holding audio back, that tap is the gesture the browser needs, so it turns sound on
   * instead. The Skip button (and Escape/Enter) always skip.
   */
  const onStageClick = () => {
    if (needsTap && savedSoundOn) void unlockSound();
    else skip();
  };

  const onSoundClick = async (e: MouseEvent) => {
    e.stopPropagation(); // don't let this tap count as "skip"
    const snd = soundRef.current;
    if (!snd) return;

    if (needsTap) {
      await unlockSound();
      return;
    }

    const next = !soundOn;
    writeSoundPref(next);
    setSoundOn(next);
    setSavedSoundOn(next);
    snd.setMuted(!next);
  };

  return (
    <div className="onyx-intro" role="status" aria-label="Loading ONYX">
      <div
        className="oi-stage"
        data-phase={phase}
        onClick={onStageClick}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && e.animationName === "oi-iris") setPhase("done");
        }}
      >
        {/* Colour field: soft cool-silver blobs drifting on the compositor */}
        <div className="oi-aurora" aria-hidden="true">
          <span className="oi-blob oi-blob--1" />
          <span className="oi-blob oi-blob--2" />
          <span className="oi-blob oi-blob--3" />
          <span className="oi-blob oi-blob--4" />
        </div>
        <div className="oi-vignette" aria-hidden="true" />

        <div className="oi-center">
          <Monogram />

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

        {mounted && (
          <button
            type="button"
            className="oi-sound"
            data-hint={needsTap}
            aria-pressed={soundOn && !needsTap}
            aria-label={
              needsTap
                ? savedSoundOn && soundOn
                  ? "Sound is saved as on; tap anywhere to start it"
                  : "Turn on sound"
                : soundOn
                  ? "Mute sound"
                  : "Unmute sound"
            }
            onClick={onSoundClick}
          >
            {soundOn && !needsTap ? (
              <Volume2 className="size-3.5" aria-hidden="true" />
            ) : (
              <VolumeX className="size-3.5" aria-hidden="true" />
            )}
            {needsTap
              ? savedSoundOn && soundOn
                ? "Saved on · tap anywhere"
                : "Tap for sound"
              : soundOn
                ? "Sound on"
                : "Sound off"}
          </button>
        )}

        <button
          type="button"
          className="oi-skip"
          onClick={(e) => {
            e.stopPropagation();
            skip();
          }}
        >
          Skip
        </button>

        <span ref={clockRef} className="oi-clock" aria-hidden="true" />
      </div>

      {phase === "exiting" && <div className="oi-rim" aria-hidden="true" />}
    </div>
  );
}
