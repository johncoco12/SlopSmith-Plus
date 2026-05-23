// Modernway — Lane dividers (edge wires marking anchor fret boundaries).
// Thin vertical markers at outer edges of the anchor span, scrolling with the highway.

import * as THREE from 'three';
import {
  K, TS, AHEAD, BEHIND, S_BASE, S_GAP, NH, NFRETS,
  fretX, sY, dZ, getAnchorAt,
} from '../constants';
import type { RenderBundle } from '@/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const DIVIDER_WIDTH = 0.6 * K;
const DIVIDER_OPACITY = 0.15;
const ARPEGGIO_COLOUR = 0x7050dd;
const ARPEGGIO_OPACITY = 0.45;
const ARPEGGIO_WIDTH = 1.2 * K;

// ── Lane Divider Pool ─────────────────────────────────────────────────────────
export interface LaneDividerPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createLaneDividers(): LaneDividerPool {
  const group = new THREE.Group();
  const pool: THREE.Mesh[] = [];
  let idx = 0;

  const geo = new THREE.PlaneGeometry(1, 1);
  const matNormal = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: DIVIDER_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const matArpeggio = new THREE.MeshBasicMaterial({
    color: ARPEGGIO_COLOUR,
    transparent: true,
    opacity: ARPEGGIO_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  function getMesh(): THREE.Mesh {
    if (idx < pool.length) {
      pool[idx].visible = true;
      return pool[idx++];
    }
    const m = new THREE.Mesh(geo, matNormal);
    m.frustumCulled = false;
    m.renderOrder = 5;
    group.add(m);
    pool.push(m);
    idx++;
    return m;
  }

  function update(bundle: RenderBundle) {
    for (let i = 0; i < idx; i++) pool[i].visible = false;
    idx = 0;

    if (!bundle.isReady || !bundle.anchors.length) return;

    const { currentTime: now, anchors, stringCount, inverted, handShapes } = bundle;

    const slices = 24;
    const sliceDt = (AHEAD + BEHIND) / slices;
    const boardY = S_BASE - NH / 2 - 1.6 * K; // on the highway surface

    // Check if we're in an arpeggio hand shape at a given time
    function isArpeggio(chartTime: number): boolean {
      for (const hs of handShapes) {
        if (hs.start_time <= chartTime && chartTime <= hs.end_time) return true;
        if (hs.start_time > chartTime + 1) break;
      }
      return false;
    }

    for (let i = 0; i < slices; i++) {
      const dt = -BEHIND + (i + 0.5) * sliceDt;
      const chartTime = now + dt;
      const anc = getAnchorAt(anchors, chartTime);
      if (!anc) continue;

      const fStart = Math.max(1, Math.round(anc.fret));
      const w = Math.max(1, Math.round(anc.width));
      const fLast = Math.min(NFRETS, fStart + w - 1);

      const z = dZ(dt);
      const zLen = TS * sliceDt;
      const arp = isArpeggio(chartTime);
      const mat = arp ? matArpeggio : matNormal;
      const divW = arp ? ARPEGGIO_WIDTH : DIVIDER_WIDTH;

      // Left edge — flat strip on the board surface running along Z
      const xL = fretX(fStart - 1);
      const mL = getMesh();
      mL.material = mat;
      mL.rotation.x = -Math.PI / 2;
      mL.position.set(xL, boardY, z);
      mL.scale.set(divW, zLen, 1);

      // Right edge
      const xR = fretX(fLast);
      const mR = getMesh();
      mR.material = mat;
      mR.rotation.x = -Math.PI / 2;
      mR.position.set(xR, boardY, z);
      mR.scale.set(divW, zLen, 1);
    }
  }

  function dispose() {
    geo.dispose();
    matNormal.dispose();
    matArpeggio.dispose();
  }

  return { group, update, dispose };
}
