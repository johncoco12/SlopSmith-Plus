// Modernway — 3D Highway constants
// Ported from plugins/highway_3d/screen.js, adapted for TresJS/Vue.

export const SCALE = 2.25;
export const K = SCALE / 300;

export const NFRETS = 24;
export const NSTR = 6;
export const MAX_RENDER_STRINGS = 8;

// String palettes (matching Rocksmith convention: 0 = low E thickest)
export const PALETTES = {
  default: [
    0xff2828, 0xffd400, 0x2080ff, 0xff8020,
    0x30d040, 0xa040ff, 0xff6bd5, 0x6bffe6,
  ],
  neon: [
    0xff0030, 0xffe800, 0x0080ff, 0xff8030,
    0x40ff50, 0xb050ff, 0xff40d0, 0x40ffd0,
  ],
  pastel: [
    0xe89aa0, 0xefdf90, 0x9adfee, 0xefb898,
    0xa6e0a8, 0xc4a6e0, 0xe0a6c8, 0xa6e0d8,
  ],
} as const;

// Geometry
export const STR_THICK = 0.25 * K;
export const S_BASE = 3 * K;
export const S_GAP = 4 * K;
export const NW = 5 * K;   // note width
export const NH = 3 * K;   // note height
export const ND = 0.5 * K; // note depth

// Timing
export const AHEAD = 4.0;   // seconds visible ahead of hit line
export const BEHIND = 0.5;  // seconds visible behind hit line
export const TS = 130 * K;  // note travel speed (world units/sec)

// Camera
export const CAM_H_BASE = 150 * K;
export const CAM_DIST_BASE = 240 * K;
export const REF_ASPECT = 16 / 9;
export const FOCUS_D = 600 * K;
export const CAM_LERP_BASE = 0.02;

// Fog
export const FOG_START = 200 * K;
export const FOG_END = 670 * K;

// Fret dots/inlays
export const DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
export const DDOTS = new Set([12, 24]);

// Lane
export const HWY_LANE_STRIPE_ODD_HEX = 0x3d739e;
export const HWY_LANE_STRIPE_EVEN_HEX = 0x62a5d8;
export const HWY_LANE_STRIPE_OP_BASE = 0.12;
export const HWY_LANE_STRIPE_OP_INT = 0.24;

// Note hit detection
export const CHORD_HWY_LINGER_S = 0.48;

// Fret spacing — uniform (equal width per fret)
const _fretXLog = (f: number): number => {
  if (f <= 0) return 0;
  return SCALE - SCALE / Math.pow(2, f / 12);
};

const _fretXUniStep = _fretXLog(NFRETS) / NFRETS;

export function fretX(f: number): number {
  return f <= 0 ? 0 : f * _fretXUniStep;
}

export function fretMid(f: number): number {
  return f <= 0 ? -2 * K : (fretX(f - 1) + fretX(f)) / 2;
}

/** World-space Z for a given dt (time offset from now). */
export function dZ(dt: number): number {
  return -dt * TS;
}

/** String Y position (0-indexed from low string). */
export function sY(s: number, stringCount: number, inverted: boolean): number {
  const base = S_BASE + s * S_GAP;
  return inverted ? S_BASE + (stringCount - 1) * S_GAP - base + S_BASE : base;
}

/** Resolve string count from bundle data. */
export function resolveStringCount(songInfo: { stringCount?: number; arrangement?: string }): number {
  const sc = songInfo?.stringCount;
  if (typeof sc === 'number' && sc >= 1) {
    return Math.min(Math.trunc(sc), MAX_RENDER_STRINGS);
  }
  return /bass/i.test(songInfo?.arrangement ?? '') ? 4 : NSTR;
}

/** Binary lower-bound: first i where arr[i].t >= t. */
export function lowerBoundT<T extends { t: number }>(arr: T[], t: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Get anchor at or before chart time t. */
export function getAnchorAt(
  anchors: Array<{ time: number; fret: number; width: number }>,
  t: number,
): { time: number; fret: number; width: number } | null {
  if (!anchors?.length) return null;
  let lo = 0, hi = anchors.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (anchors[mid].time <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? anchors[0] : anchors[lo - 1];
}

/** Compute BPM from beat array at time t. */
export function computeBPM(beats: Array<{ time: number }>, t: number): number {
  if (!beats || beats.length < 2) return 120;
  let lo = 0, hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  let closest = lo;
  if (lo === beats.length) closest = beats.length - 1;
  else if (lo > 0 && Math.abs(beats[lo - 1].time - t) < Math.abs(beats[lo].time - t)) closest = lo - 1;
  const start = Math.max(0, closest - 2);
  const end = Math.min(beats.length - 1, closest + 2);
  let sum = 0, count = 0;
  for (let i = start; i < end; i++) {
    const dt = beats[i + 1].time - beats[i].time;
    if (dt > 0) { sum += dt; count++; }
  }
  return count > 0 && sum > 0 ? 60 / (sum / count) : 120;
}
