// Modernway — Beat line rendering
// Thin vertical lines at each beat mark scrolling down the highway.

import * as THREE from 'three';
import {
  K, TS, AHEAD, BEHIND, S_BASE, S_GAP, fretX, NFRETS, sY, dZ,
} from '../constants';
import type { RenderBundle, Beat } from '@/features/player/types';

const MAX_BEATS = 64;

// Scratch objects — allocated once, reused every frame
const _pos  = new THREE.Vector3()
const _quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
const _scl  = new THREE.Vector3()
const _mat4 = new THREE.Matrix4()

export interface BeatState {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createBeatLines(): BeatState {
  const group = new THREE.Group();

  const beatGeo = new THREE.PlaneGeometry(1, 1);
  const beatMatMeasure = new THREE.MeshBasicMaterial({
    color: 0x4488aa, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  });
  const beatMatBeat = new THREE.MeshBasicMaterial({
    color: 0x334466, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
  });

  const imMeasure = new THREE.InstancedMesh(beatGeo, beatMatMeasure, MAX_BEATS)
  const imBeat    = new THREE.InstancedMesh(beatGeo, beatMatBeat,    MAX_BEATS)
  imMeasure.frustumCulled = false
  imBeat.frustumCulled    = false
  imMeasure.count = 0
  imBeat.count    = 0
  group.add(imMeasure, imBeat)

  function update(bundle: RenderBundle) {
    imMeasure.count = 0
    imBeat.count    = 0

    if (!bundle.isReady) return;

    const now = bundle.currentTime;
    const beats = bundle.beats;
    const stringCount = bundle.stringCount;
    const inverted = bundle.inverted;
    const boardWidth = fretX(NFRETS) + 2 * K;
    const midY = (sY(0, stringCount, inverted) + sY(stringCount - 1, stringCount, inverted)) / 2;

    _scl.set(boardWidth, 0.3 * K, 1)

    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const dt = b.time - now;
      if (dt < -BEHIND) continue;
      if (dt > AHEAD) break;

      _pos.set(boardWidth / 2, midY, dZ(dt))
      _mat4.compose(_pos, _quat, _scl)

      const im = b.measure >= 0 ? imMeasure : imBeat
      if (im.count < MAX_BEATS) {
        im.setMatrixAt(im.count++, _mat4)
      }
    }

    imMeasure.instanceMatrix.needsUpdate = true
    imBeat.instanceMatrix.needsUpdate    = true
  }

  function dispose() {
    beatGeo.dispose();
    beatMatMeasure.dispose();
    beatMatBeat.dispose();
  }

  return { group, update, dispose };
}
