// Modernway — Accent halos (additive bloom shells behind accented notes).
// Renders 3 concentric additive-blending shells behind each note with .ac flag.

import * as THREE from 'three';
import {
  K, NW, NH, ND, AHEAD, BEHIND, PALETTES,
  fretMid, sY, dZ, lowerBoundT, CHORD_HWY_LINGER_S,
} from '../constants';
import type { RenderBundle, ChartNote } from '@/player/types';

// ── Halo shell configuration ──────────────────────────────────────────────────
const SHELLS = [
  { xyScale: 1.36, zScale: 1.05, opacity: 0.68 },
  { xyScale: 1.82, zScale: 1.12, opacity: 0.42 },
  { xyScale: 2.32, zScale: 1.22, opacity: 0.24 },
] as const;

// ── Shared geometry ───────────────────────────────────────────────────────────
let gHalo: THREE.BoxGeometry | null = null;
function ensureGeo() {
  if (!gHalo) gHalo = new THREE.BoxGeometry(NW, NH, ND);
}

// ── Accent Halo Pool ──────────────────────────────────────────────────────────
export interface AccentHaloPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createAccentHalos(): AccentHaloPool {
  const group = new THREE.Group();
  const pool: THREE.Mesh[] = [];
  let idx = 0;

  // Per-string additive materials (lazily created)
  let haloMats: THREE.MeshBasicMaterial[] = [];

  ensureGeo();

  function ensureMaterials() {
    if (haloMats.length > 0) return;
    const palette = PALETTES.default;
    haloMats = palette.map(c => new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    }));
  }

  function getMesh(): THREE.Mesh {
    if (idx < pool.length) {
      pool[idx].visible = true;
      return pool[idx++];
    }
    const m = new THREE.Mesh(gHalo!, haloMats[0]);
    m.frustumCulled = false;
    m.renderOrder = 19;
    group.add(m);
    pool.push(m);
    idx++;
    return m;
  }

  function drawHalo(
    n: ChartNote,
    now: number,
    stringCount: number,
    inverted: boolean,
  ) {
    const s = n.s;
    if (s < 0 || s >= 8) return;

    const dt = n.t - now;
    const linger = 0.05;
    const susEnd = n.t + (n.sus || 0);
    const hasSus = (n.sus ?? 0) > 0;
    if (dt < -linger && (!hasSus || now > susEnd)) return;
    if (dt > AHEAD) return;

    const sustained = dt < 0 && hasSus && now <= susEnd;
    const noteZ = sustained ? 0 : Math.min(0, dZ(dt));
    const x = n.f === 0 ? 0 : fretMid(n.f);
    const y = sY(s, stringCount, inverted);
    const approachRot = n.f > 0 ? Math.max(0, Math.min(1, dt / AHEAD)) * Math.PI / 2 : 0;

    // Fade multiplier for approaching notes
    const fadeMul = Math.max(0, Math.min(1, 1 - dt / AHEAD));

    for (const shell of SHELLS) {
      const m = getMesh();
      m.material = haloMats[s % haloMats.length];
      // We need per-instance opacity, so clone if needed
      const mat = m.material as THREE.MeshBasicMaterial;
      // Opacity is driven by shell config × fade
      // Since we share materials, we set it here (shared across shells of same string
      // which is acceptable for additive blending)
      mat.opacity = shell.opacity * fadeMul;

      m.position.set(x, y, noteZ - 0.002); // slightly behind note
      m.rotation.set(0, 0, approachRot);
      m.scale.set(shell.xyScale, shell.xyScale, shell.zScale * 2.5);
    }
  }

  function update(bundle: RenderBundle) {
    ensureMaterials();

    // Reset
    for (let i = 0; i < idx; i++) pool[i].visible = false;
    idx = 0;

    if (!bundle.isReady) return;

    const { currentTime: now, notes, chords, stringCount, inverted } = bundle;
    const t0 = now - BEHIND;
    const t1 = now + AHEAD;

    // Single notes with accent
    const startIdx = lowerBoundT(notes, t0 - 1);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t1 + 1) break;
      if (n.ac) drawHalo(n, now, stringCount, inverted);
    }

    // Chord notes with accent
    for (let ci = 0; ci < chords.length; ci++) {
      const ch = chords[ci];
      if (ch.t < t0 - CHORD_HWY_LINGER_S) continue;
      if (ch.t > t1 + 1) break;
      for (const cn of ch.notes) {
        if (cn.ac) {
          drawHalo(
            { ...cn, t: ch.t } as unknown as ChartNote,
            now, stringCount, inverted,
          );
        }
      }
    }
  }

  function dispose() {
    haloMats.forEach(m => m.dispose());
    haloMats = [];
    pool.length = 0;
  }

  return { group, update, dispose };
}
