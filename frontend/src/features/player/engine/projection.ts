// 3D perspective projection and fret-to-screen mapping.
//
// The highway recedes into a vanishing point at the top of the canvas.
// `project(tOffset)` maps a time offset (seconds ahead of now) to a
// {y, scale} pair. `fretX(fret, scale, W)` maps a fret number to an
// x-pixel using the smoothly-animated displayMaxFret.

import type { Anchor } from '../types.js';

export const VISIBLE_SECONDS = 3.0;
const Z_CAM = 2.2;
const Z_MAX = 10.0;
const SMOOTH_RATE = 0.4;   // half-life ~1.7s at 60fps

export interface Projected {
  y: number;     // fractional canvas height (0..1)
  scale: number; // perspective scale (1 at now-line, smaller in distance)
}

export class ProjectionHelper {
  displayMaxFret = 12;

  project(tOffset: number): Projected | null {
    if (tOffset > VISIBLE_SECONDS || tOffset < -0.05) return null;
    if (tOffset < 0) return { y: 0.82 + Math.abs(tOffset) * 0.3, scale: 1.0 };

    const z = tOffset * (Z_MAX / VISIBLE_SECONDS);
    const denom = z + Z_CAM;
    if (denom < 0.01) return null;
    const scale = Z_CAM / denom;
    const y = 0.82 + (0.08 - 0.82) * (1.0 - scale);
    return { y, scale };
  }

  fretX(fret: number, scale: number, W: number): number {
    const hw = W * 0.52 * scale;
    const margin = hw * 0.06;
    const usable = hw * 2 - 2 * margin;
    const t = fret / Math.max(1, this.displayMaxFret);
    return W / 2 - hw + margin + t * usable;
  }

  updateSmoothing(anchors: readonly Anchor[], currentTime: number, dt: number): void {
    const rate = Math.min(SMOOTH_RATE * dt, SMOOTH_RATE);
    const lookAheadMax = this._maxFretInWindow(anchors, currentTime);
    const cur = this._anchorAt(anchors, currentTime);
    const currentMax = cur.fret + cur.width;
    const needed = Math.max(currentMax, lookAheadMax);
    const target = Math.max(needed + 3, 8);
    this.displayMaxFret += (target - this.displayMaxFret) * rate;
  }

  anchorAt(anchors: readonly Anchor[], t: number): Anchor {
    return this._anchorAt(anchors, t);
  }

  private _anchorAt(anchors: readonly Anchor[], t: number): Anchor {
    let a: Anchor = anchors[0] ?? { time: 0, fret: 1, width: 4 };
    for (const anc of anchors) {
      if (anc.time > t) break;
      a = anc;
    }
    return a;
  }

  private _maxFretInWindow(anchors: readonly Anchor[], t: number): number {
    let max = 0;
    for (const anc of anchors) {
      if (anc.time > t + VISIBLE_SECONDS + 2) break;
      if (anc.time + 2 < t) continue;
      const top = anc.fret + anc.width;
      if (top > max) max = top;
    }
    return max;
  }

  /** Seed displayMaxFret from the first anchor so the highway doesn't start zoomed in. */
  seedFromAnchors(anchors: readonly Anchor[]): void {
    if (anchors.length) {
      this.displayMaxFret = Math.max(anchors[0].fret + anchors[0].width + 3, 8);
    }
  }

  reset(): void {
    this.displayMaxFret = 12;
  }
}
