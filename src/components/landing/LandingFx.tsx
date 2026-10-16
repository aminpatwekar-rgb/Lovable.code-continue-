import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Slow, colour-shifting aurora behind the hero. Compositor-driven (transform + one filter). */
export function AuroraBackdrop() {
  return (
    <div className="lp-aurora" aria-hidden="true">
      <span className="lp-blob lp-blob--1" />
      <span className="lp-blob lp-blob--2" />
      <span className="lp-blob lp-blob--3" />
      <span className="lp-blob lp-blob--4" />
      <span className="lp-dots" />
    </div>
  );
}

/** Fades + lifts its children in the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Stagger step (each step = 90ms). */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-in={shown}
      style={{ "--rd": delay } as CSSProperties}
      className={cn("lp-reveal", className)}
    >
      {children}
    </div>
  );
}

/** Card with a soft coloured spotlight + glowing edge that follow the pointer. */
export function SpotlightCard({
  hue,
  children,
  className,
}: {
  /** Any CSS colour, used for the glow. */
  hue: string;
  children: ReactNode;
  className?: string;
}) {
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <article
      onPointerMove={onMove}
      style={{ "--lp-hue": hue } as CSSProperties}
      className={cn("panel lift lp-card hover:lift-hover", className)}
    >
      {children}
    </article>
  );
}

const INK_LINES = [
  "M8.0 30.0 C9.1 28.0 12.3 18.3 14.5 18.1 C16.6 17.9 18.7 28.2 20.9 28.8 C23.2 29.4 25.7 21.4 28.1 21.7 C30.4 21.9 33.0 30.5 35.2 30.5 C37.3 30.5 38.9 21.9 40.8 21.6 C42.6 21.3 43.4 27.2 46.4 28.9 C49.4 30.5 55.9 33.3 58.9 31.5 C62.0 29.7 62.8 18.1 64.8 18.2 C66.8 18.4 68.5 32.6 70.7 32.3 C72.9 31.9 75.5 16.7 77.9 16.1 C80.3 15.5 82.6 27.9 85.1 28.7 C87.7 29.5 90.5 21.1 93.2 21.1 C95.9 21.2 98.9 29.0 101.3 29.0 C103.7 28.9 105.6 20.6 107.7 20.9 C109.9 21.2 110.8 29.3 114.1 30.8 C117.5 32.4 124.5 33.5 128.0 30.1 C131.5 26.8 132.7 10.9 135.1 10.8 C137.5 10.6 139.8 27.8 142.3 29.3 C144.7 30.9 147.3 19.9 149.8 20.1 C152.3 20.4 154.9 31.3 157.3 30.8 C159.7 30.4 161.9 17.2 164.2 17.2 C166.5 17.3 168.0 29.0 171.1 31.3 C174.1 33.5 179.4 33.0 182.5 30.7 C185.6 28.4 187.2 17.8 189.6 17.6 C192.0 17.4 194.1 31.0 196.7 29.7 C199.3 28.3 202.3 9.0 205.1 9.3 C207.9 9.6 211.2 29.5 213.6 31.5 C216.0 33.6 217.5 21.8 219.5 21.8 C221.5 21.7 223.2 32.0 225.5 31.2 C227.8 30.3 230.7 17.0 233.3 16.7 C235.9 16.5 237.4 27.4 241.1 29.8 C244.7 32.1 251.7 32.9 255.2 30.8 C258.8 28.7 260.1 16.7 262.5 17.0 C264.9 17.2 267.3 31.5 269.7 32.3 C272.1 33.1 274.3 21.8 276.6 21.6 C278.9 21.5 281.2 32.1 283.6 31.3 C285.9 30.5 288.5 17.3 291.0 17.1 C293.5 16.8 295.1 27.3 298.4 29.6 C301.7 32.0 308.7 30.8 310.7 31.0",
  "M8.0 66.0 C8.9 64.5 11.7 57.2 13.6 57.0 C15.4 56.8 17.3 64.9 19.1 65.0 C21.0 65.0 22.9 57.1 24.8 57.2 C26.7 57.3 28.4 65.4 30.5 65.5 C32.5 65.5 34.9 57.4 37.2 57.5 C39.4 57.7 41.5 67.0 43.8 66.3 C46.1 65.6 48.6 52.8 51.0 53.1 C53.4 53.4 55.0 65.8 58.1 68.0 C61.3 70.1 66.8 68.9 69.8 66.2 C72.8 63.6 74.2 52.4 76.4 52.3 C78.6 52.1 80.9 64.4 83.0 65.1 C85.1 65.8 87.0 56.4 89.0 56.6 C91.0 56.8 92.8 66.2 95.0 66.4 C97.2 66.7 99.9 58.0 102.3 58.0 C104.7 57.9 106.3 64.7 109.5 66.2 C112.8 67.6 118.3 68.6 121.8 66.7 C125.2 64.8 127.3 54.9 130.1 54.9 C132.9 55.0 135.8 68.9 138.5 67.0 C141.1 65.1 143.5 43.3 146.0 43.4 C148.5 43.5 150.9 65.6 153.5 67.6 C156.1 69.7 159.0 55.9 161.7 55.6 C164.4 55.4 167.5 65.8 169.8 66.1 C172.1 66.4 173.7 57.8 175.6 57.6 C177.5 57.4 178.6 63.5 181.4 64.8 C184.3 66.1 189.7 68.4 192.7 65.5 C195.6 62.5 197.0 47.1 199.2 47.0 C201.4 46.9 203.6 63.3 205.7 65.1 C207.8 66.9 209.6 57.4 211.5 57.8 C213.4 58.3 215.1 68.2 217.3 68.0 C219.5 67.8 222.2 56.8 224.7 56.5 C227.1 56.1 229.7 68.0 232.0 65.9 C234.3 63.7 236.4 43.2 238.6 43.6 C240.8 44.0 241.9 64.7 245.2 68.5 C248.4 72.3 255.8 66.8 258.0 66.5",
  "M8.0 102.0 C9.0 98.6 11.8 81.7 13.8 81.6 C15.7 81.6 17.2 99.5 19.5 101.6 C21.8 103.6 24.8 93.4 27.5 93.9 C30.2 94.3 33.0 104.8 35.5 104.3 C38.0 103.8 40.2 91.4 42.6 90.7 C44.9 90.1 47.3 100.9 49.7 100.6 C52.0 100.3 54.4 88.4 56.7 88.8 C59.1 89.3 60.7 101.1 63.8 103.3 C66.9 105.5 72.5 104.2 75.4 102.1 C78.3 100.0 79.4 90.6 81.4 90.8 C83.4 91.1 85.3 103.9 87.4 103.6 C89.5 103.3 91.7 89.0 93.9 89.1 C96.0 89.3 97.9 104.4 100.4 104.4 C102.8 104.4 105.7 89.3 108.4 89.1 C111.1 88.9 113.3 101.2 116.5 103.5 C119.7 105.7 124.9 106.0 127.8 102.6 C130.8 99.1 132.2 83.0 134.4 82.9 C136.6 82.7 138.8 100.7 141.0 101.6 C143.1 102.5 145.2 88.1 147.3 88.3 C149.4 88.4 151.1 102.3 153.5 102.3 C156.0 102.3 159.1 88.3 161.8 88.3 C164.6 88.2 167.7 101.2 170.2 102.0 C172.6 102.7 174.3 92.9 176.3 92.8 C178.4 92.7 180.2 102.0 182.5 101.3 C184.7 100.7 187.4 88.8 189.9 89.0 C192.3 89.1 193.7 100.0 197.2 102.4 C200.8 104.8 208.8 103.2 211.1 103.4",
  "M8.0 138.0 C9.0 135.8 11.8 124.3 13.8 124.5 C15.7 124.8 17.3 138.9 19.5 139.6 C21.8 140.4 24.7 128.9 27.3 128.9 C29.8 128.9 32.6 140.4 35.0 139.7 C37.4 138.9 39.3 124.4 41.5 124.2 C43.7 123.9 44.9 135.5 48.0 138.1 C51.2 140.7 57.1 141.3 60.4 139.8 C63.8 138.4 65.5 129.7 68.1 129.2 C70.6 128.8 73.1 137.1 75.8 137.1 C78.4 137.1 81.2 128.7 84.0 129.1 C86.7 129.6 88.2 138.2 92.2 139.8 C96.2 141.4 105.4 139.1 108.1 139.0",
];

/** Decorative product mock: a page that writes itself, plus floating status chips. Desktop only. */
export function HeroPreview() {
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--tx", String(((e.clientX - r.left) / r.width - 0.5) * 2));
    e.currentTarget.style.setProperty("--ty", String(((e.clientY - r.top) / r.height - 0.5) * 2));
  };
  const onLeave = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty("--tx", "0");
    e.currentTarget.style.setProperty("--ty", "0");
  };

  return (
    <div
      className="lp-stage relative hidden lg:block"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      aria-hidden="true"
    >
      <div className="lp-tilt relative mx-auto w-full max-w-[460px]">
        <div className="lp-rise" style={{ "--rd": 2 } as CSSProperties}>
          <div className="lp-paper">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Physics · Homework 4</span>
              <span>Page 1 of 3</span>
            </div>
            <svg viewBox="0 0 360 150" className="lp-ink mt-4 w-full" fill="none">
              <defs>
                <linearGradient
                  id="lp-ink-grad"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="360"
                  y2="0"
                >
                  <stop offset="0" style={{ stopColor: "var(--lp-g1)" }} />
                  <stop offset="0.5" style={{ stopColor: "var(--lp-g2)" }} />
                  <stop offset="1" style={{ stopColor: "var(--lp-g4)" }} />
                </linearGradient>
              </defs>
              {INK_LINES.map((d, i) => (
                <path
                  key={d}
                  d={d}
                  pathLength={1}
                  className="lp-stroke"
                  style={{ "--sd": `${1000 + i * 800}ms` } as CSSProperties}
                />
              ))}
            </svg>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="lp-dot" />
              Scanned pages stay ordered and private
            </div>
          </div>
        </div>

        <div className="lp-rise absolute -right-4 -top-12" style={{ "--rd": 4 } as CSSProperties}>
          <div className="lp-float glass flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-xs shadow-[var(--shadow-lift)]">
            <span className="grid size-7 place-items-center rounded-lg bg-warning/20 text-warning-foreground">
              <ShieldAlert className="size-4 text-warning" />
            </span>
            <span className="leading-tight">
              <span className="block font-semibold text-foreground">Paste blocked</span>
              <span className="text-muted-foreground">Teacher notified</span>
            </span>
          </div>
        </div>

        <div className="lp-rise absolute -bottom-11 -left-8" style={{ "--rd": 5 } as CSSProperties}>
          <div
            className="lp-float glass flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-xs shadow-[var(--shadow-lift)]"
            style={{ "--fd": "-2s" } as CSSProperties}
          >
            <svg viewBox="0 0 44 44" className="size-10 -rotate-90" fill="none">
              <circle cx="22" cy="22" r="18" strokeWidth="4" className="stroke-muted" />
              <circle
                cx="22"
                cy="22"
                r="18"
                strokeWidth="4"
                strokeLinecap="round"
                pathLength={1}
                className="lp-score"
              />
            </svg>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-foreground">18 / 20</span>
              <span className="text-muted-foreground">Reviewed with feedback</span>
            </span>
          </div>
        </div>

        <div className="lp-rise absolute -right-3 bottom-14" style={{ "--rd": 6 } as CSSProperties}>
          <div
            className="lp-float glass flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium shadow-[var(--shadow-lift)]"
            style={{ "--fd": "-4s" } as CSSProperties}
          >
            <CheckCircle2 className="size-4 text-success" />
            Submitted · 3 pages
          </div>
        </div>
      </div>
    </div>
  );
}
