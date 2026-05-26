// Modernway — Highway lane rendering
// Fret-column tiles scrolling toward the hit line at the same rate as notes.
//
// Tiles are aligned to a fixed SLICE_DT grid in chart time so that each tile's
// centre is a constant chart-time point.  dZ(sliceMid - now) then moves at
// exactly the same velocity as notes (no clamped-boundary half-speed artefact).

import * as THREE from 'three';
import {
  K, TS, AHEAD, BEHIND, S_BASE, NH,
  fretX, dZ,
  HWY_LANE_STRIPE_ODD_HEX, HWY_LANE_STRIPE_EVEN_HEX,
  HWY_LANE_STRIPE_OP_BASE, HWY_LANE_STRIPE_OP_INT,
  NFRETS,
} from '../constants';
import type { RenderBundle } from '@/features/player/types';

const SLICE_DT    = 0.10;  // chart-seconds per tile
// AHEAD=2s, BEHIND=0.5s, NFRETS=24 frets → worst case ~250 tiles
const MAX_TILES   = 256;

// Scratch — reused every frame (no per-tile allocation)
const _pos  = new THREE.Vector3()
const _quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
const _scl  = new THREE.Vector3()
const _mat4 = new THREE.Matrix4()

export interface LaneState {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createLane(): LaneState {
  const group = new THREE.Group();

  const laneGeo = new THREE.PlaneGeometry(1, 1);
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

  const imOdd  = new THREE.InstancedMesh(laneGeo, matOdd,  MAX_TILES)
  const imEven = new THREE.InstancedMesh(laneGeo, matEven, MAX_TILES)
  imOdd.frustumCulled  = false
  imEven.frustumCulled = false
  imOdd.count  = 0
  imEven.count = 0
  group.add(imOdd, imEven)

  function update(bundle: RenderBundle) {
    imOdd.count  = 0
    imEven.count = 0

    if (!bundle.isReady || !bundle.anchors.length) return;

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

    // Snap to nearest SLICE_DT boundary — tile positions are stable between frames
    const firstSliceT = Math.ceil(tStart / SLICE_DT) * SLICE_DT;

    // Binary search: anchor active at firstSliceT
    let ancIdx = 0;
    {
      let lo = 0, hi = anchors.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (anchors[mid].time <= firstSliceT) lo = mid + 1;
        else hi = mid;
      }
      ancIdx = Math.max(0, lo - 1);
    }

    const zLen = TS * SLICE_DT;

    for (let sliceT = firstSliceT; sliceT < tEnd; sliceT += SLICE_DT) {
      const sliceMid = sliceT + SLICE_DT / 2;

      while (ancIdx + 1 < anchors.length && anchors[ancIdx + 1].time <= sliceMid) {
        ancIdx++;
      }

      const anc = anchors[ancIdx];
      if (!anc || anc.time > sliceMid) continue;

      const z      = dZ(sliceMid - now);
      const fStart = Math.max(1, Math.round(anc.fret));
      const w      = Math.max(1, Math.round(anc.width));
      const fLast  = Math.min(NFRETS, fStart + w - 1);

      for (let f = fStart; f <= fLast; f++) {
        const xL  = fretX(f - 1);
        const xR  = fretX(f);
        const im  = (f % 2 === 0) ? imEven : imOdd

        if (im.count >= MAX_TILES) continue;

        _pos.set((xL + xR) / 2, boardY, z)
        _scl.set(xR - xL, zLen, 1)
        _mat4.compose(_pos, _quat, _scl)
        im.setMatrixAt(im.count++, _mat4)
      }
    }

    imOdd.instanceMatrix.needsUpdate  = true
    imEven.instanceMatrix.needsUpdate = true
  }

  function dispose() {
    laneGeo.dispose();
    matOdd.dispose();
    matEven.dispose();
  }

  return { group, update, dispose };
}
