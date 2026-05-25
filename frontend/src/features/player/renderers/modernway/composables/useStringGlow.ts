// Modernway — String glow (per-frame emissive highlights on string activity).
// Renders additive-blending highlight strips over each string that pulse on note hits.

import * as THREE from 'three';
import {
  K, NFRETS, S_BASE, S_GAP, STR_THICK, AHEAD,
  fretX, sY, lowerBoundT, PALETTES, MAX_RENDER_STRINGS,
} from '../constants';
import type { RenderBundle } from '@/features/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const GLOW_HEIGHT = STR_THICK * 3.5;
const HEAT_DECAY = 4.0; // per second
const IDLE_OPACITY = 0.05;
const MAX_OPACITY = 0.45;

// ── String Glow Pool ──────────────────────────────────────────────────────────
export interface StringGlowPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createStringGlow(): StringGlowPool {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const mats: THREE.MeshBasicMaterial[] = [];
  const stringHeat = new Float32Array(MAX_RENDER_STRINGS);
  let lastTime = 0;
  let builtCount = -1;
  let builtInverted: boolean | null = null;

  const geo = new THREE.PlaneGeometry(1, 1);

  function build(stringCount: number, inverted: boolean) {
    // Clear
    for (const m of meshes) {
      group.remove(m);
    }
    meshes.length = 0;
    mats.length = 0;
    stringHeat.fill(0);

    const palette = PALETTES.default;
    const boardWidth = fretX(NFRETS) + 4 * K;
    const centerX = fretX(NFRETS) / 2;

    for (let s = 0; s < stringCount; s++) {
      const y = sY(s, stringCount, inverted);
      const mat = new THREE.MeshBasicMaterial({
        color: palette[s % palette.length],
        transparent: true,
        opacity: IDLE_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mats.push(mat);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.position.set(centerX, y, 0);
      mesh.scale.set(boardWidth, GLOW_HEIGHT, 1);
      group.add(mesh);
      meshes.push(mesh);
    }

    builtCount = stringCount;
    builtInverted = inverted;
  }

  function update(bundle: RenderBundle) {
    if (!bundle.isReady) return;

    const { currentTime: now, notes, stringCount, inverted } = bundle;

    if (stringCount !== builtCount || inverted !== builtInverted) {
      build(stringCount, inverted);
    }

    // Decay heat
    const dt = lastTime > 0 ? Math.min(now - lastTime, 0.1) : 0.016;
    lastTime = now;

    for (let s = 0; s < stringCount; s++) {
      stringHeat[s] = Math.max(0, stringHeat[s] - HEAT_DECAY * dt);
    }

    // Accumulate heat from notes at the hit line
    const hitWindow = 0.1;
    const startIdx = lowerBoundT(notes, now - hitWindow);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > now + hitWindow) break;
      if (n.s >= 0 && n.s < stringCount) {
        stringHeat[n.s] = 1.0;
      }
      // Sustained notes also glow
      if (n.s >= 0 && n.s < stringCount && (n.sus ?? 0) > 0) {
        if (n.t <= now && now <= n.t + n.sus!) {
          stringHeat[n.s] = Math.max(stringHeat[n.s], 0.7);
        }
      }
    }

    // Update material opacity
    for (let s = 0; s < stringCount; s++) {
      const heat = stringHeat[s];
      mats[s].opacity = IDLE_OPACITY + heat * (MAX_OPACITY - IDLE_OPACITY);
    }
  }

  function dispose() {
    geo.dispose();
    mats.forEach(m => m.dispose());
  }

  return { group, update, dispose };
}
