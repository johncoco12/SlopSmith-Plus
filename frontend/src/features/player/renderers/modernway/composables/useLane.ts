// Modernway — Highway lane rendering
// The coloured lane that shows the active fret region scrolling toward the player.

import * as THREE from 'three';
import {
  K, TS, AHEAD, BEHIND, S_BASE, S_GAP, NH,
  fretX, sY, dZ, getAnchorAt,
  HWY_LANE_STRIPE_ODD_HEX, HWY_LANE_STRIPE_EVEN_HEX,
  HWY_LANE_STRIPE_OP_BASE, HWY_LANE_STRIPE_OP_INT,
  NFRETS,
} from '../constants';
import type { RenderBundle, Anchor } from '@/features/player/types';

export interface LaneState {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createLane(): LaneState {
  const group = new THREE.Group();
  const pool: THREE.Mesh[] = [];
  let poolIdx = 0;

  const laneGeo = new THREE.PlaneGeometry(1, 1);
  const laneMats: THREE.MeshBasicMaterial[] = [];

  // Pre-create materials for odd/even fret stripes
  const matOdd = new THREE.MeshBasicMaterial({
    color: HWY_LANE_STRIPE_ODD_HEX,
    transparent: true,
    opacity: HWY_LANE_STRIPE_OP_BASE + HWY_LANE_STRIPE_OP_INT * 0.5,
    side: THREE.DoubleSide,
  });
  const matEven = new THREE.MeshBasicMaterial({
    color: HWY_LANE_STRIPE_EVEN_HEX,
    transparent: true,
    opacity: HWY_LANE_STRIPE_OP_BASE + HWY_LANE_STRIPE_OP_INT * 0.5,
    side: THREE.DoubleSide,
  });
  laneMats.push(matOdd, matEven);

  function getMesh(): THREE.Mesh {
    if (poolIdx < pool.length) {
      const m = pool[poolIdx];
      m.visible = true;
      poolIdx++;
      return m;
    }
    const m = new THREE.Mesh(laneGeo, matOdd);
    m.frustumCulled = false;
    group.add(m);
    pool.push(m);
    poolIdx++;
    return m;
  }

  function update(bundle: RenderBundle) {
    poolIdx = 0;
    if (!bundle.isReady || !bundle.anchors.length) {
      for (const m of pool) m.visible = false;
      return;
    }

    const now     = bundle.currentTime;
    const anchors = bundle.anchors;
    const tStart  = now - BEHIND;
    const tEnd    = now + AHEAD;
    const boardY  = S_BASE - NH / 2 - 1.8 * K;

    // Intensity from nearest upcoming note
    let intensity = 0;
    const notes = bundle.notes;
    for (let i = 0; i < notes.length; i++) {
      const dt = notes[i].t - now;
      if (dt > AHEAD) break;
      if (dt >= 0) { intensity = Math.max(intensity, 1 - dt / AHEAD); break; }
    }
    const alpha = HWY_LANE_STRIPE_OP_BASE + HWY_LANE_STRIPE_OP_INT * intensity;
    matOdd.opacity  = alpha;
    matEven.opacity = alpha;

    // Find the anchor active at tStart via binary search
    let ancIdx = 0;
    {
      let lo = 0, hi = anchors.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (anchors[mid].time <= tStart) lo = mid + 1;
        else hi = mid;
      }
      ancIdx = Math.max(0, lo - 1);
    }

    // Walk anchor segments through the visible window.
    // Each segment is anchored to chart time so it scrolls with the notes.
    while (ancIdx < anchors.length) {
      const anc     = anchors[ancIdx];
      const nextAnc = anchors[ancIdx + 1] as Anchor | undefined;

      const segStart = Math.max(anc.time, tStart);
      const segEnd   = nextAnc ? Math.min(nextAnc.time, tEnd) : tEnd;

      if (segStart >= tEnd) break;

      // Mid-point of the visible slice — moves with now, exactly like notes
      const segMidDt = (segStart + segEnd) / 2 - now;
      const z    = dZ(segMidDt);
      const zLen = TS * (segEnd - segStart);

      const fStart = Math.max(1, Math.round(anc.fret));
      const w      = Math.max(1, Math.round(anc.width));
      const fLast  = Math.min(NFRETS, fStart + w - 1);

      for (let f = fStart; f <= fLast; f++) {
        const xL  = fretX(f - 1);
        const xR  = fretX(f);
        const colW = xR - xL;
        const cx   = (xL + xR) / 2;

        const mesh = getMesh();
        mesh.material    = (f % 2 === 0) ? matEven : matOdd;
        mesh.rotation.x  = -Math.PI / 2;
        mesh.position.set(cx, boardY, z);
        mesh.scale.set(colW, zLen, 1);
      }

      ancIdx++;
    }

    for (let i = poolIdx; i < pool.length; i++) pool[i].visible = false;
  }

  function dispose() {
    laneGeo.dispose();
    for (const m of laneMats) m.dispose();
  }

  return { group, update, dispose };
}
