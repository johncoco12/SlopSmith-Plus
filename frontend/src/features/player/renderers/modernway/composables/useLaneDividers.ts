// Modernway — Lane dividers (edge wires marking anchor fret boundaries).
// Thin vertical markers at outer edges of the anchor span, scrolling with the highway.

import * as THREE from 'three';
import {
  K, TS, AHEAD, BEHIND, S_BASE, S_GAP, NH, NFRETS,
  fretX, sY, dZ, getAnchorAt,
} from '../constants';
import type { RenderBundle } from '@/features/player/types';

const DIVIDER_WIDTH   = 0.6 * K;
const DIVIDER_OPACITY = 0.15;
const ARPEGGIO_COLOUR  = 0x7050dd;
const ARPEGGIO_OPACITY = 0.45;
const ARPEGGIO_WIDTH   = 1.2 * K;
const MAX_DIVIDERS     = 64; // 2 edges × 24 slices = 48 max

// Scratch — reused every frame
const _pos  = new THREE.Vector3()
const _quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
const _scl  = new THREE.Vector3()
const _mat4 = new THREE.Matrix4()

export interface LaneDividerPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createLaneDividers(): LaneDividerPool {
  const group = new THREE.Group();

  const geo = new THREE.PlaneGeometry(1, 1);
  const matNormal = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: DIVIDER_OPACITY,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const matArpeggio = new THREE.MeshBasicMaterial({
    color: ARPEGGIO_COLOUR, transparent: true, opacity: ARPEGGIO_OPACITY,
    side: THREE.DoubleSide, depthWrite: false,
  });

  const imNormal   = new THREE.InstancedMesh(geo, matNormal,   MAX_DIVIDERS)
  const imArpeggio = new THREE.InstancedMesh(geo, matArpeggio, MAX_DIVIDERS)
  imNormal.frustumCulled   = false
  imArpeggio.frustumCulled = false
  imNormal.renderOrder     = 5
  imArpeggio.renderOrder   = 5
  imNormal.count   = 0
  imArpeggio.count = 0
  group.add(imNormal, imArpeggio)

  function update(bundle: RenderBundle) {
    imNormal.count   = 0
    imArpeggio.count = 0

    if (!bundle.isReady || !bundle.anchors.length) return;

    const { currentTime: now, anchors, handShapes } = bundle;

    const slices  = 24;
    const sliceDt = (AHEAD + BEHIND) / slices;
    const boardY  = S_BASE - NH / 2 - 1.6 * K;

    function isArpeggio(chartTime: number): boolean {
      for (const hs of handShapes) {
        if (hs.start_time <= chartTime && chartTime <= hs.end_time) return true;
        if (hs.start_time > chartTime + 1) break;
      }
      return false;
    }

    for (let i = 0; i < slices; i++) {
      const dt        = -BEHIND + (i + 0.5) * sliceDt;
      const chartTime = now + dt;
      const anc       = getAnchorAt(anchors, chartTime);
      if (!anc) continue;

      const fStart = Math.max(1, Math.round(anc.fret));
      const fLast  = Math.min(NFRETS, fStart + Math.max(1, Math.round(anc.width)) - 1);
      const z      = dZ(dt);
      const zLen   = TS * sliceDt;
      const arp    = isArpeggio(chartTime);
      const im     = arp ? imArpeggio : imNormal
      const divW   = arp ? ARPEGGIO_WIDTH : DIVIDER_WIDTH;

      if (im.count + 1 >= MAX_DIVIDERS) continue;

      _scl.set(divW, zLen, 1)

      // Left edge
      _pos.set(fretX(fStart - 1), boardY, z)
      _mat4.compose(_pos, _quat, _scl)
      im.setMatrixAt(im.count++, _mat4)

      // Right edge
      _pos.set(fretX(fLast), boardY, z)
      _mat4.compose(_pos, _quat, _scl)
      im.setMatrixAt(im.count++, _mat4)
    }

    imNormal.instanceMatrix.needsUpdate   = true
    imArpeggio.instanceMatrix.needsUpdate = true
  }

  function dispose() {
    geo.dispose();
    matNormal.dispose();
    matArpeggio.dispose();
  }

  return { group, update, dispose };
}
