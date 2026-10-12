/**
 * Geometry of the ONYX monogram: one glossy ribbon, rebuilt as vector strokes from the brand logo.
 * Coordinates are in the 1408x768 space of the original logo image. Shared by the intro animation
 * (OnyxIntro) and the static header mark (OnyxMark) so the two can never drift apart.
 */
export const RING = { cx: 437, cy: 390, r: 147, w: 72 };

export const STROKES = [
  {
    id: "sw",
    w: 72,
    d: "M440 243 C525 238 584 270 625 320 C672 372 705 440 742 492 C770 530 800 540 835 538 C868 536 890 515 912 481 L1110 205",
  },
  {
    id: "st",
    w: 62,
    d: "M783 508 L783 270 C783 243 805 231 832 231 C858 231 875 247 892 272 L985 385",
  },
  { id: "leg", w: 70, d: "M1014 408 L1116 574" },
];

/** Same shapes, but the ring is a path that starts at the top so it can be drawn on. */
export const REVEAL = [
  { id: "ring", w: RING.w, d: "M437 243 A147 147 0 0 0 437 537 A147 147 0 0 0 437 243" },
  ...STROKES,
];
