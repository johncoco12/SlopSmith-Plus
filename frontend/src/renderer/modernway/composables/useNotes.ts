// Modernway — Note/Chord mesh management
// Creates and updates Three.js objects for notes, chords, and sustain trails.

import * as THREE from 'three';
import {
  K, NW, NH, ND, TS, AHEAD, BEHIND, PALETTES,
  fretMid, dZ, sY, lowerBoundT, MAX_RENDER_STRINGS,
  CHORD_HWY_LINGER_S,
} from '../constants';
import type { RenderBundle, ChartNote, ChartChord, ChordTemplate } from '@/player/types';

// Shared geometry (module-level singletons)
let gNote: THREE.BoxGeometry | null = null;
let gSus: THREE.BoxGeometry | null = null;

function ensureGeometries() {
  if (!gNote) gNote = new THREE.BoxGeometry(NW, NH, ND);
  if (!gSus) gSus = new THREE.BoxGeometry(1, 1, 1);
}

// Material arrays
let mStr: THREE.MeshStandardMaterial[] = [];
let mGlow: THREE.MeshLambertMaterial[] = [];
let mSus: THREE.MeshLambertMaterial[] = [];
let mOutline: THREE.MeshLambertMaterial | null = null;

function ensureMaterials(palette: readonly number[]) {
  if (mStr.length > 0) return;
  mStr = palette.map(c => new THREE.MeshStandardMaterial({
    color: c, emissive: c, emissiveIntensity: 0.3,
    transparent: true, opacity: 0.92, roughness: 0.6,
  }));
  mGlow = palette.map(c => new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: c, emissiveIntensity: 1.8,
    transparent: true, opacity: 1.0, depthWrite: false,
  }));
  mSus = palette.map(c => new THREE.MeshLambertMaterial({
    color: c, emissive: c, emissiveIntensity: 0.15,
    transparent: true, opacity: 0.5,
  }));
  mOutline = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8,
    transparent: true, opacity: 1.0, depthWrite: false,
  });
}

export interface NoteMeshPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createNoteMeshPool(): NoteMeshPool {
  const group = new THREE.Group();
  const notePool: THREE.Mesh[] = [];
  const susPool: THREE.Mesh[] = [];
  let noteIdx = 0;
  let susIdx = 0;

  const palette = PALETTES.default;

  ensureGeometries();
  ensureMaterials(palette);

  function getNoteMesh(): THREE.Mesh {
    if (noteIdx < notePool.length) {
      const m = notePool[noteIdx];
      m.visible = true;
      noteIdx++;
      return m;
    }
    const m = new THREE.Mesh(gNote!, mStr[0]);
    m.frustumCulled = false;
    group.add(m);
    notePool.push(m);
    noteIdx++;
    return m;
  }

  function getSusMesh(): THREE.Mesh {
    if (susIdx < susPool.length) {
      const m = susPool[susIdx];
      m.visible = true;
      susIdx++;
      return m;
    }
    const m = new THREE.Mesh(gSus!, mSus[0]);
    m.frustumCulled = false;
    group.add(m);
    susPool.push(m);
    susIdx++;
    return m;
  }

  function drawNote(
    n: ChartNote,
    now: number,
    stringCount: number,
    inverted: boolean,
    curX: number,
  ) {
    const s = n.s;
    if (s < 0 || s >= MAX_RENDER_STRINGS) return;

    const dt = n.t - now;
    const linger = 0.05;
    const susEnd = n.t + (n.sus || 0);
    const hasSus = (n.sus ?? 0) > 0;

    if (dt < -linger && (!hasSus || now > susEnd)) return;

    const sustained = dt < 0 && hasSus && now <= susEnd;
    const hit = Math.abs(dt) < 0.15 || sustained;
    const y = sY(s, stringCount, inverted);
    const noteZ = sustained ? 0 : Math.min(0, dZ(dt));
    const x = n.f === 0 ? curX : fretMid(n.f);

    // Approach rotation: vertical→horizontal as it nears hit line
    const approachRot = n.f > 0 ? Math.max(0, Math.min(1, dt / AHEAD)) * Math.PI / 2 : 0;

    // Outline mesh
    const outline = getNoteMesh();
    outline.material = mOutline!;
    outline.position.set(x, y, noteZ);
    outline.rotation.set(0, 0, approachRot);
    if (n.f === 0) {
      outline.scale.set((35 * K / NW) * 1.1, 0.1 * 1.1 * 1.5, 0.6 * 1.1);
    } else {
      outline.scale.set(1.1, 1.1, 2.8);
    }

    // Core mesh
    const core = getNoteMesh();
    core.material = hit ? mGlow[s] : mStr[s];
    core.position.set(x, y, noteZ + 0.001);
    core.rotation.set(0, 0, approachRot);
    if (n.f === 0) {
      core.scale.set((40 * K / NW), 0.1 * 1.5, 0.6);
    } else {
      core.scale.set(1, 1, 2.5);
    }

    // Sustain trail
    if (hasSus && dt < AHEAD) {
      const susStart = Math.min(0, dZ(Math.max(dt, 0)));
      const susEndZ = dZ(Math.min(susEnd - now, AHEAD));
      const length = Math.abs(susEndZ - susStart);
      if (length > 0.001) {
        const trailZ = (susStart + susEndZ) / 2;

        // Outline trail (slightly larger, bright)
        const trailOutline = getSusMesh();
        trailOutline.material = mOutline!;
        trailOutline.position.set(x, y, trailZ);
        trailOutline.scale.set(NW * 0.85 + 0.4 * K, NH * 0.12 + 0.4 * K, length);

        // Core trail (string-coloured)
        const trail = getSusMesh();
        trail.material = hit ? mGlow[s] : mSus[s];
        trail.position.set(x, y, trailZ + 0.001);
        trail.scale.set(NW * 0.85, NH * 0.12, length);
      }
    }
  }

  function update(bundle: RenderBundle) {
    // Hide all previous frame meshes
    noteIdx = 0;
    susIdx = 0;

    if (!bundle.isReady) {
      for (const m of notePool) m.visible = false;
      for (const m of susPool) m.visible = false;
      return;
    }

    const now = bundle.currentTime;
    const t0 = now - BEHIND;
    const t1 = now + AHEAD;
    const stringCount = bundle.stringCount;
    const inverted = bundle.inverted;
    const notes = bundle.notes;
    const chords = bundle.chords;

    // Camera X approximation for open strings
    let curX = 0;
    {
      let sumX = 0, count = 0;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.t < t0 || n.t > t1) continue;
        if (n.f > 0) { sumX += fretMid(n.f); count++; }
      }
      if (count > 0) curX = sumX / count;
    }

    // Draw single notes
    const startIdx = lowerBoundT(notes, t0 - 1);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t1 + 1) break;
      drawNote(n, now, stringCount, inverted, curX);
    }

    // Draw chord notes
    for (let ci = 0; ci < chords.length; ci++) {
      const ch = chords[ci];
      if (ch.t < t0 - CHORD_HWY_LINGER_S) continue;
      if (ch.t > t1 + 1) break;
      if (!ch.notes) continue;
      for (let ni = 0; ni < ch.notes.length; ni++) {
        const cn = ch.notes[ni];
        drawNote(
          { ...cn, t: ch.t } as unknown as ChartNote,
          now, stringCount, inverted, curX,
        );
      }
    }

    // Hide unused pool meshes
    for (let i = noteIdx; i < notePool.length; i++) notePool[i].visible = false;
    for (let i = susIdx; i < susPool.length; i++) susPool[i].visible = false;
  }

  function dispose() {
    for (const m of notePool) {
      m.geometry?.dispose();
    }
    for (const m of susPool) {
      m.geometry?.dispose();
    }
    // Dispose shared materials
    mStr.forEach(m => m.dispose());
    mGlow.forEach(m => m.dispose());
    mSus.forEach(m => m.dispose());
    mOutline?.dispose();
    mStr = [];
    mGlow = [];
    mSus = [];
    mOutline = null;
    gNote?.dispose();
    gSus?.dispose();
    gNote = null;
    gSus = null;
  }

  return { group, update, dispose };
}
