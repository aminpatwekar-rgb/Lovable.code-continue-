/**
 * Sound for the ONYX intro, synthesised with Web Audio (no audio files to download).
 *
 * Timeline (seconds from the start of the intro), matching the logo animation in styles.css:
 *   0.20  ring is drawn        -> soft whoosh, panned left
 *   0.70  swoosh + diagonal    -> longer, brighter whoosh, left to right
 *   1.45  stem and arch        -> shorter whoosh
 *   1.95  leg                  -> short whoosh, right
 *   2.40  logo lifts off       -> low thump + tiny click
 *   2.90  glossy highlight     -> glassy three-note chime + high shimmer
 *
 * Browsers block audio until the visitor interacts with the page, so `start()` reports whether it
 * actually began; the intro then offers a sound button that unlocks it.
 */

const NOISE_SECONDS = 2;
/** Band-passing noise removes most of its energy, so whooshes need make-up gain to sit with the chime. */
const WHOOSH_MAKEUP = 8;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

function pan(ctx: BaseAudioContext, from: number, to: number, at: number, dur: number) {
  if (typeof ctx.createStereoPanner !== "function") return null;
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(from, at);
  p.pan.linearRampToValueAtTime(to, at + dur);
  return p;
}

/** Filtered-noise sweep: the sound of a stroke being drawn. */
function whoosh(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  dur: number,
  f0: number,
  f1: number,
  peak: number,
  panFrom: number,
  panTo: number,
) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(f0, at);
  bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak * WHOOSH_MAKEUP, at + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g);
  const p = pan(ctx, panFrom, panTo, at, dur);
  if (p) g.connect(p).connect(out);
  else g.connect(out);
  src.start(at);
  src.stop(at + dur + 0.05);
}

/** Low thump with a tiny high click: the logo settling onto the surface. */
function thump(ctx: BaseAudioContext, out: AudioNode, at: number) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(130, at);
  osc.frequency.exponentialRampToValueAtTime(48, at + 0.35);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + 0.55);

  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.16, at);
  cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
  click.connect(hp).connect(cg).connect(out);
  click.start(at);
  click.stop(at + 0.05);
}

/** Glassy chime: each note is a sine plus a quiet inharmonic partial, with a long decay. */
function chime(ctx: BaseAudioContext, out: AudioNode, at: number, freqs: number[], step: number) {
  freqs.forEach((f, i) => {
    const t = at + i * step;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const p = pan(ctx, -0.3 + i * 0.3, -0.3 + i * 0.3, t, 1);
    if (p) g.connect(p).connect(out);
    else g.connect(out);
    for (const [mult, amp] of [
      [1, 1],
      [2.76, 0.22],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      osc.connect(og).connect(g);
      osc.start(t);
      osc.stop(t + 1.65);
    }
  });
}

/** Brief high-frequency sweep that rides along with the glint. */
function shimmer(ctx: BaseAudioContext, out: AudioNode, at: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(4500, at);
  bp.frequency.exponentialRampToValueAtTime(10000, at + 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.03, at + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
  src.connect(bp).connect(g).connect(out);
  src.start(at);
  src.stop(at + 0.95);
}

/**
 * Schedules every sound that has not already passed.
 * @param base      context time that corresponds to intro time 0
 * @param fromSec   intro time already elapsed (sounds before this are skipped)
 */
export function scheduleIntroSound(
  ctx: BaseAudioContext,
  out: AudioNode,
  base: number,
  fromSec = 0,
) {
  const upcoming = (t: number) => t >= fromSec - 0.02;
  if (upcoming(0.2)) whoosh(ctx, out, base + 0.2, 0.9, 260, 1500, 0.2, -0.5, -0.1);
  if (upcoming(0.7)) whoosh(ctx, out, base + 0.7, 1.1, 340, 2300, 0.24, -0.1, 0.3);
  if (upcoming(1.45)) whoosh(ctx, out, base + 1.45, 0.7, 520, 1900, 0.17, 0, 0.35);
  if (upcoming(1.95)) whoosh(ctx, out, base + 1.95, 0.45, 650, 1600, 0.13, 0.3, 0.5);
  if (upcoming(2.4)) thump(ctx, out, base + 2.4);
  if (upcoming(2.9)) {
    chime(ctx, out, base + 2.9, [1046.5, 1568, 2093], 0.09);
    shimmer(ctx, out, base + 2.9);
  }
}

export type IntroSound = {
  /** Tries to begin playback. Resolves false if the browser blocks audio until a user gesture. */
  start: (getElapsedMs: () => number) => Promise<boolean>;
  setMuted: (muted: boolean) => void;
  /** Fades out and releases the audio context. */
  stop: (fadeMs?: number) => void;
};

export function createIntroSound(): IntroSound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let scheduled = false;
  let stopped = false;
  let muted = false;

  const ensure = () => {
    if (ctx) return ctx;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    return ctx;
  };

  return {
    async start(getElapsedMs) {
      if (stopped) return false;
      const c = ensure();
      if (!c || !master) return false;
      if (c.state !== "running") {
        // resume() stays pending until the browser allows audio, so don't wait on it for long.
        try {
          await Promise.race([c.resume(), new Promise((r) => window.setTimeout(r, 80))]);
        } catch {
          /* blocked */
        }
      }
      if (c.state !== "running" || stopped) return false;
      if (scheduled) return true;
      scheduled = true;
      const elapsed = Math.max(0, getElapsedMs()) / 1000;
      scheduleIntroSound(c, master, c.currentTime - elapsed, elapsed);
      return true;
    },
    setMuted(m) {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03);
    },
    stop(fadeMs = 600) {
      if (stopped) return;
      stopped = true;
      const c = ctx;
      if (!c || !master) return;
      master.gain.setTargetAtTime(0, c.currentTime, fadeMs / 3000);
      window.setTimeout(() => void c.close().catch(() => {}), fadeMs + 250);
    },
  };
}
