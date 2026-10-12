import { RING, STROKES } from "./onyxMarkGeometry";

/** The ring + ribbon strokes, optionally thinner/thicker (used to build the bevel layers). */
export function Strokes({ extra = 0 }: { extra?: number }) {
  return (
    <>
      <circle cx={RING.cx} cy={RING.cy} r={RING.r} strokeWidth={RING.w + extra} />
      {STROKES.map((s) => (
        <path key={s.id} d={s.d} strokeWidth={s.w + extra} />
      ))}
    </>
  );
}

/**
 * Static ONYX monogram for the page header.
 * Graphite black on the light theme (like the brand logo plate), polished silver on the dark theme.
 * Colours come from CSS variables (.om / .dark .om in styles.css), so it follows the theme instantly.
 */
export function OnyxMark({ className }: { className?: string }) {
  return (
    <svg className={`om ${className ?? ""}`} viewBox="240 190 935 405" role="img" aria-label="ONYX">
      <defs>
        <linearGradient
          id="om-face"
          gradientUnits="userSpaceOnUse"
          x1="250"
          y1="200"
          x2="1160"
          y2="580"
        >
          <stop offset="0" style={{ stopColor: "var(--om-f0)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--om-f1)" }} />
          <stop offset="1" style={{ stopColor: "var(--om-f2)" }} />
        </linearGradient>
        <linearGradient
          id="om-gloss"
          gradientUnits="userSpaceOnUse"
          x1="250"
          y1="190"
          x2="520"
          y2="560"
        >
          <stop offset="0" stopColor="#fff" style={{ stopOpacity: "var(--om-gloss)" }} />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="om-shn" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" style={{ stopOpacity: "var(--om-sheen)" }} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="om-cut">
          <rect x="150" y="200" width="1060" height="388" />
        </clipPath>
        <mask id="om-shape" maskUnits="userSpaceOnUse" x="150" y="120" width="1060" height="540">
          <g fill="none" stroke="#fff" strokeLinejoin="round">
            <Strokes />
          </g>
        </mask>
      </defs>
      <g clipPath="url(#om-cut)">
        <g transform="translate(5 8)">
          <g fill="none" strokeLinejoin="round" style={{ stroke: "var(--om-side)" }}>
            <Strokes />
          </g>
        </g>
        <g fill="none" strokeLinejoin="round" style={{ stroke: "var(--om-rim)" }}>
          <Strokes />
        </g>
        <g fill="none" stroke="url(#om-face)" strokeLinejoin="round">
          <Strokes extra={-9} />
        </g>
        <g mask="url(#om-shape)">
          <rect x="150" y="120" width="1060" height="540" fill="url(#om-gloss)" />
          <g className="om-sheen">
            <rect
              x="0"
              y="120"
              width="220"
              height="540"
              fill="url(#om-shn)"
              transform="skewX(-22)"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
