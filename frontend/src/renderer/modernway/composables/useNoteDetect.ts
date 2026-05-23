// Modernway — Note-detect feedback (hit/miss visual effects on notes).
// Tints note outlines green (hit) or red (miss) based on provider state,
// and adds a string-coloured glow on active notes.

import * as THREE from 'three';
import {
  K, NW, NH, ND, AHEAD, BEHIND,
  fretMid, sY, dZ, lowerBoundT, PALETTES, CHORD_HWY_LINGER_S,
} from '../constants';
import type { RenderBundle, ChartNote } from '@/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const HIT_COLOUR = 0x40ff60;
const MISS_COLOUR = 0xff3030;
const GLOW_SCALE = 1.45;
const HIT_OPACITY = 0.55;
const MISS_OPACITY = 0.45;
const GLOW_OPACITY = 0.6;

// ── Note-Detect Feedback Pool ─────────────────────────────────────────────────
export interface NoteDetectPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createNoteDetectFeedback(): NoteDetectPool {
  const group = new THREE.Group();
  const pool: THREE.Mesh[] = [];
  let idx = 0;

  const geo = new THREE.BoxGeometry(NW, NH, ND);

  const matHit = new THREE.MeshBasicMaterial({
    color: HIT_COLOUR,
    transparent: true,
    opacity: HIT_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const matMiss = new THREE.MeshBasicMaterial({
    color: MISS_COLOUR,
    transparent: true,
    opacity: MISS_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // Per-string glow materials
  const glowMats: THREE.MeshBasicMaterial[] = PALETTES.default.map(c =>
    new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: GLOW_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  function getMesh(): THREE.Mesh {
    if (idx < pool.length) {
      pool[idx].visible = true;
      return pool[idx++];
    }
    const m = new THREE.Mesh(geo, matHit);
    m.frustumCulled = false;
    m.renderOrder = 200;
    group.add(m);
    pool.push(m);
    idx++;
    return m;
  }

  function processNote(
    n: ChartNote,
    chartTime: number,
    now: number,
    bundle: RenderBundle,
  ) {
    const state = bundle.getNoteState(n, chartTime);
    if (!state) return;

    const { stringCount, inverted } = bundle;
    const dt = chartTime - now;
    const x = n.f === 0 ? 0 : fretMid(n.f);
    const y = sY(n.s, stringCount, inverted);
    const z = dZ(dt);

    if (state.state === 'hit' || state.state === 'miss') {
      const m = getMesh();
      m.material = state.state === 'hit' ? matHit : matMiss;
      m.position.set(x, y, z);
      m.scale.set(1.2, 1.2, 1.2);
    }

    if (state.state === 'active' || state.state === 'hit') {
      // String-coloured glow
      const gm = getMesh();
      gm.material = glowMats[n.s % glowMats.length];
      gm.position.set(x, y, z);
      gm.scale.set(GLOW_SCALE, GLOW_SCALE, GLOW_SCALE);
    }
  }

  function update(bundle: RenderBundle) {
    for (let i = 0; i < idx; i++) pool[i].visible = false;
    idx = 0;

    if (!bundle.isReady) return;

    const { currentTime: now, notes, chords } = bundle;
    const t0 = now - BEHIND;
    const t1 = now + 0.5; // only near the hit line

    // Single notes
    const startIdx = lowerBoundT(notes, t0 - 1);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t1) break;
      if (n.t < t0 - 0.2) continue;
      processNote(n, n.t, now, bundle);
    }

    // Chord notes
    for (const ch of chords) {
      if (ch.t < t0 - CHORD_HWY_LINGER_S) continue;
      if (ch.t > t1) break;
      for (const cn of ch.notes) {
        const note = { ...cn, t: ch.t } as unknown as ChartNote;
        processNote(note, ch.t, now, bundle);
      }
    }
  }

  function dispose() {
    geo.dispose();
    matHit.dispose();
    matMiss.dispose();
    glowMats.forEach(m => m.dispose());
  }

  return { group, update, dispose };
}
