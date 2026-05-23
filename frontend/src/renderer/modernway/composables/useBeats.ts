// Modernway — Beat line rendering
// Thin vertical lines at each beat mark scrolling down the highway.

import * as THREE from 'three';
import {
  K, TS, AHEAD, BEHIND, S_BASE, S_GAP, fretX, NFRETS, sY, dZ,
} from '../constants';
import type { RenderBundle, Beat } from '@/player/types';

export interface BeatState {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createBeatLines(): BeatState {
  const group = new THREE.Group();
  const pool: THREE.Mesh[] = [];
  let poolIdx = 0;

  const beatGeo = new THREE.PlaneGeometry(1, 1);
  const beatMatMeasure = new THREE.MeshBasicMaterial({
    color: 0x4488aa, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  });
  const beatMatBeat = new THREE.MeshBasicMaterial({
    color: 0x334466, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
  });

  function getMesh(): THREE.Mesh {
    if (poolIdx < pool.length) {
      const m = pool[poolIdx];
      m.visible = true;
      poolIdx++;
      return m;
    }
    const m = new THREE.Mesh(beatGeo, beatMatBeat);
    m.frustumCulled = false;
    group.add(m);
    pool.push(m);
    poolIdx++;
    return m;
  }

  function update(bundle: RenderBundle) {
    poolIdx = 0;
    if (!bundle.isReady) {
      for (const m of pool) m.visible = false;
      return;
    }

    const now = bundle.currentTime;
    const beats = bundle.beats;
    const stringCount = bundle.stringCount;
    const inverted = bundle.inverted;
    const boardWidth = fretX(NFRETS) + 2 * K;

    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const dt = b.time - now;
      if (dt < -BEHIND) continue;
      if (dt > AHEAD) break;

      const z = dZ(dt);
      const isMeasure = b.measure >= 0;
      const lineHeight = (sY(stringCount - 1, stringCount, inverted) - sY(0, stringCount, inverted)) + S_GAP;

      const mesh = getMesh();
      mesh.material = isMeasure ? beatMatMeasure : beatMatBeat;
      mesh.rotation.x = -Math.PI / 2;
      const midY = (sY(0, stringCount, inverted) + sY(stringCount - 1, stringCount, inverted)) / 2;
      mesh.position.set(boardWidth / 2, midY, z);
      mesh.scale.set(boardWidth, 0.3 * K, 1);
    }

    for (let i = poolIdx; i < pool.length; i++) pool[i].visible = false;
  }

  function dispose() {
    beatGeo.dispose();
    beatMatMeasure.dispose();
    beatMatBeat.dispose();
  }

  return { group, update, dispose };
}
