// Modernway — Nut & Headstock model (decorative geometry at the nut position).
// Bone nut bar with string grooves + simplified headstock body behind the nut.

import * as THREE from 'three';
import {
  K, NFRETS, S_BASE, S_GAP, STR_THICK, NH,
  fretX, sY, MAX_RENDER_STRINGS,
} from '../constants';
import type { RenderBundle } from '@/features/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const NUT_COLOUR = 0xf5efe0; // bone white
const NUT_H = 3.5 * K;
const NUT_D = 1.5 * K;
const HEADSTOCK_COLOUR = 0x2a1a0a; // dark wood
const HEADSTOCK_H = 12 * K;
const HEADSTOCK_D = 2 * K;
const HEADSTOCK_Z_OFFSET = 6 * K; // behind the nut

// ── Nut & Headstock Pool ──────────────────────────────────────────────────────
export interface NutHeadstockPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createNutHeadstock(): NutHeadstockPool {
  const group = new THREE.Group();
  let built = false;
  let lastStringCount = -1;
  let lastInverted: boolean | null = null;
  const disposables: THREE.BufferGeometry[] = [];
  const matDisposables: THREE.Material[] = [];

  function build(stringCount: number, inverted: boolean) {
    // Clear existing
    while (group.children.length) {
      group.remove(group.children[0]);
    }
    disposables.length = 0;
    matDisposables.length = 0;

    const nStr = Math.min(stringCount, MAX_RENDER_STRINGS);
    const boardWidth = fretX(NFRETS) + 4 * K;
    const nutX = 0; // nut is at fret 0 position (x=0)
    const yTop = Math.max(sY(0, nStr, inverted), sY(nStr - 1, nStr, inverted));
    const yBot = Math.min(sY(0, nStr, inverted), sY(nStr - 1, nStr, inverted));
    const nutLen = (yTop - yBot) + S_GAP;
    const nutCenterY = (yTop + yBot) / 2;

    // ── Nut bar ─────────────────────────────────────────────────────────────
    const nutGeo = new THREE.BoxGeometry(NUT_D, nutLen, NUT_H);
    const nutMat = new THREE.MeshStandardMaterial({
      color: NUT_COLOUR,
      roughness: 0.6,
      metalness: 0.05,
      transparent: true,
      opacity: 0.9,
    });
    const nutMesh = new THREE.Mesh(nutGeo, nutMat);
    nutMesh.position.set(nutX - NUT_D / 2, nutCenterY, 0);
    nutMesh.renderOrder = 50;
    group.add(nutMesh);
    disposables.push(nutGeo);
    matDisposables.push(nutMat);

    // ── String grooves (thin dark slots in the nut) ─────────────────────────
    const grooveGeo = new THREE.BoxGeometry(NUT_D * 1.1, STR_THICK * 2, NUT_H * 0.6);
    const grooveMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.7,
    });
    disposables.push(grooveGeo);
    matDisposables.push(grooveMat);

    for (let s = 0; s < nStr; s++) {
      const y = sY(s, nStr, inverted);
      const groove = new THREE.Mesh(grooveGeo, grooveMat);
      groove.position.set(nutX - NUT_D / 2, y, 0);
      groove.renderOrder = 51;
      group.add(groove);
    }
  }

  function update(bundle: RenderBundle) {
    if (!bundle.isReady) return;
    const { stringCount, inverted } = bundle;
    if (!built || stringCount !== lastStringCount || inverted !== lastInverted) {
      build(stringCount, inverted);
    }
  }

  function dispose() {
    disposables.forEach(g => g.dispose());
    matDisposables.forEach(m => m.dispose());
  }

  return { group, update, dispose };
}
