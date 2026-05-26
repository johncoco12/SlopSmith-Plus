// Modernway — Note/Chord mesh management
// Creates and updates Three.js objects for notes, chords, and sustain trails.
//
// Uses InstancedMesh to collapse per-note draw calls:
//   imOutline          — all note + sustain outlines (white, 1 draw call)
//   imCore[s]  × 7    — normal-state note cores per string
//   imGlow[s]  × 7    — hit/glow-state note cores per string
//   imSus[s]   × 7    — sustain trail normals per string
// Total: 22 draw calls regardless of note count (was up to 160+).

import * as THREE from 'three';
import {
  K, NW, NH, ND, TS, AHEAD, BEHIND, PALETTES, NFRETS,
  fretMid, fretX, dZ, sY, lowerBoundT, MAX_RENDER_STRINGS,
  CHORD_HWY_LINGER_S, getAnchorAt,
} from '../constants';
import type { RenderBundle, ChartNote, ChartChord, ChordTemplate } from '@/features/player/types';

// ── Pool size caps ────────────────────────────────────────────────────────────
// AHEAD=2s, typical ~40 notes/s, 2 meshes per note → 160 max outlines
const MAX_OUTLINE = 256
const MAX_CORE    = 64    // per string
const MAX_GLOW    = 32    // per string (only hit notes)
const MAX_SUS     = 64    // per string

// ── Shared geometry (module-level singletons) ─────────────────────────────────
let gNote: THREE.BoxGeometry | null = null;
let gSus:  THREE.BoxGeometry | null = null;

function ensureGeometries() {
  if (!gNote) gNote = new THREE.BoxGeometry(NW, NH, ND);
  if (!gSus)  gSus  = new THREE.BoxGeometry(1, 1, 1);
}

// ── Scratch objects — one set per module, never re-allocated ─────────────────
const _pos   = new THREE.Vector3()
const _quat  = new THREE.Quaternion()
const _scl   = new THREE.Vector3()
const _euler = new THREE.Euler()
const _mat4  = new THREE.Matrix4()
const _identQuat = new THREE.Quaternion() // identity — used when no rotation

// ── Materials ─────────────────────────────────────────────────────────────────
let mOutline: THREE.MeshLambertMaterial | null = null;
let mStr:  THREE.MeshStandardMaterial[] = [];
let mGlow: THREE.MeshLambertMaterial[]  = [];
let mSus:  THREE.MeshLambertMaterial[]  = [];

function ensureMaterials(palette: readonly number[]) {
  if (mStr.length > 0) return;
  mOutline = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8,
    transparent: true, opacity: 1.0, depthWrite: false,
  });
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
}

// ── Helper: push a matrix into an InstancedMesh ───────────────────────────────
function pushMatrix(
  im: THREE.InstancedMesh,
  max: number,
  x: number, y: number, z: number,
  rotZ: number,
  sx: number, sy: number, sz: number,
): boolean {
  if (im.count >= max) return false;
  _pos.set(x, y, z);
  if (rotZ !== 0) {
    _euler.set(0, 0, rotZ);
    _quat.setFromEuler(_euler);
    _mat4.compose(_pos, _quat, _scl.set(sx, sy, sz));
  } else {
    _mat4.compose(_pos, _identQuat, _scl.set(sx, sy, sz));
  }
  im.setMatrixAt(im.count++, _mat4);
  return true;
}

export interface NoteMeshPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createNoteMeshPool(): NoteMeshPool {
  const group = new THREE.Group();
  const palette = PALETTES.default;

  ensureGeometries();
  ensureMaterials(palette);

  // ── InstancedMesh pools ──────────────────────────────────────────────────────
  const imOutline = new THREE.InstancedMesh(gNote!, mOutline!, MAX_OUTLINE)
  imOutline.frustumCulled = false
  imOutline.count = 0
  group.add(imOutline)

  const imCore = palette.slice(0, MAX_RENDER_STRINGS).map((_, s) => {
    const im = new THREE.InstancedMesh(gNote!, mStr[s], MAX_CORE)
    im.frustumCulled = false
    im.count = 0
    group.add(im)
    return im
  })

  const imGlow = palette.slice(0, MAX_RENDER_STRINGS).map((_, s) => {
    const im = new THREE.InstancedMesh(gNote!, mGlow[s], MAX_GLOW)
    im.frustumCulled = false
    im.count = 0
    group.add(im)
    return im
  })

  // Sustain trails use gSus (1×1×1 unit box) — scaled to arbitrary trail length.
  // Hit and normal sustains need separate pools because they use different materials.
  const imSusOutline = new THREE.InstancedMesh(gSus!, mOutline!, MAX_OUTLINE)
  imSusOutline.frustumCulled = false
  imSusOutline.count = 0
  group.add(imSusOutline)

  const imSus = palette.slice(0, MAX_RENDER_STRINGS).map((_, s) => {
    const im = new THREE.InstancedMesh(gSus!, mSus[s], MAX_SUS)
    im.frustumCulled = false
    im.count = 0
    group.add(im)
    return im
  })

  // Hit sustain trails (glowing) — same gSus geometry but mGlow material
  const imSusGlow = palette.slice(0, MAX_RENDER_STRINGS).map((_, s) => {
    const im = new THREE.InstancedMesh(gSus!, mGlow[s], MAX_GLOW)
    im.frustumCulled = false
    im.count = 0
    group.add(im)
    return im
  })

  // ── Per-frame note drawing ───────────────────────────────────────────────────

  function drawNote(
    n: ChartNote,
    now: number,
    stringCount: number,
    inverted: boolean,
    openX: number,
  ) {
    const s = n.s;
    if (s < 0 || s >= MAX_RENDER_STRINGS) return;

    const dt     = n.t - now;
    const linger = 0.05;
    const susEnd = n.t + (n.sus || 0);
    const hasSus = (n.sus ?? 0) > 0;

    if (dt < -linger && (!hasSus || now > susEnd)) return;

    const sustained = dt < 0 && hasSus && now <= susEnd;
    const hit       = Math.abs(dt) < 0.15 || sustained;
    const y         = sY(s, stringCount, inverted);
    const noteZ     = sustained ? 0 : Math.min(0, dZ(dt));
    const x         = n.f === 0 ? openX : fretMid(n.f);
    const approachRot = n.f > 0 ? Math.max(0, Math.min(1, dt / AHEAD)) * Math.PI / 2 : 0;

    // Outline
    if (n.f === 0) {
      pushMatrix(imOutline, MAX_OUTLINE, x, y, noteZ, approachRot,
        (35 * K / NW) * 1.1, 0.1 * 1.1 * 1.5, 0.6 * 1.1)
    } else {
      pushMatrix(imOutline, MAX_OUTLINE, x, y, noteZ, approachRot, 1.1, 1.1, 2.8)
    }

    // Core (into glow pool if hit, otherwise normal string pool)
    const coreX = x, coreY = y, coreZ = noteZ + 0.001;
    const csi = Math.min(s, imCore.length - 1);
    if (hit) {
      if (n.f === 0) {
        pushMatrix(imGlow[csi], MAX_GLOW, coreX, coreY, coreZ, approachRot,
          (40 * K / NW), 0.1 * 1.5, 0.6)
      } else {
        pushMatrix(imGlow[csi], MAX_GLOW, coreX, coreY, coreZ, approachRot, 1, 1, 2.5)
      }
    } else {
      if (n.f === 0) {
        pushMatrix(imCore[csi], MAX_CORE, coreX, coreY, coreZ, approachRot,
          (40 * K / NW), 0.1 * 1.5, 0.6)
      } else {
        pushMatrix(imCore[csi], MAX_CORE, coreX, coreY, coreZ, approachRot, 1, 1, 2.5)
      }
    }

    // Sustain trail
    if (hasSus && dt < AHEAD) {
      const susStart = Math.min(0, dZ(Math.max(dt, 0)));
      const susEndZ  = dZ(Math.min(susEnd - now, AHEAD));
      const length   = Math.abs(susEndZ - susStart);
      if (length > 0.001) {
        const trailZ = (susStart + susEndZ) / 2;
        const si = Math.min(s, imSus.length - 1);
        // Outline trail (gSus geometry = 1×1×1, scale gives exact size)
        pushMatrix(imSusOutline, MAX_OUTLINE, x, y, trailZ, 0,
          NW * 0.85 + 0.4 * K, NH * 0.12 + 0.4 * K, length)
        // Core trail — hit uses imSusGlow (gSus + mGlow), normal uses imSus (gSus + mSus)
        const trailPool = hit ? imSusGlow[si] : imSus[si];
        const trailMax  = hit ? MAX_GLOW       : MAX_SUS;
        pushMatrix(trailPool, trailMax, x, y, trailZ + 0.001, 0,
          NW * 0.85, NH * 0.12, length)
      }
    }
  }

  function update(bundle: RenderBundle) {
    // Reset all instance counts (hides everything with zero overhead)
    imOutline.count    = 0
    imSusOutline.count = 0
    for (let s = 0; s < imCore.length; s++) {
      imCore[s].count    = 0
      imGlow[s].count    = 0
      imSus[s].count     = 0
      imSusGlow[s].count = 0
    }

    if (!bundle.isReady) return;

    const now         = bundle.currentTime;
    const t0          = now - BEHIND;
    const t1          = now + AHEAD;
    const stringCount = bundle.stringCount;
    const inverted    = bundle.inverted;
    const notes       = bundle.notes;
    const chords      = bundle.chords;

    // Stable X for open-string notes
    let openX = 0;
    {
      const anc = getAnchorAt(bundle.anchors, now);
      if (anc) {
        const fStart = Math.max(1, Math.round(anc.fret));
        const fLast  = Math.min(NFRETS, fStart + Math.max(1, Math.round(anc.width)) - 1);
        openX = (fretX(fStart - 1) + fretX(fLast)) / 2;
      }
    }

    // Single notes
    const startIdx = lowerBoundT(notes, t0 - 1);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t1 + 1) break;
      drawNote(n, now, stringCount, inverted, openX);
    }

    // Chord notes
    for (let ci = 0; ci < chords.length; ci++) {
      const ch = chords[ci];
      if (ch.t < t0 - CHORD_HWY_LINGER_S) continue;
      if (ch.t > t1 + 1) break;
      if (!ch.notes) continue;
      for (let ni = 0; ni < ch.notes.length; ni++) {
        const cn = ch.notes[ni];
        drawNote(
          { ...cn, t: ch.t } as unknown as ChartNote,
          now, stringCount, inverted, openX,
        );
      }
    }

    // Flush — mark only pools that received instances this frame
    imOutline.instanceMatrix.needsUpdate    = true
    imSusOutline.instanceMatrix.needsUpdate = true
    for (let s = 0; s < imCore.length; s++) {
      if (imCore[s].count    > 0) imCore[s].instanceMatrix.needsUpdate    = true
      if (imGlow[s].count    > 0) imGlow[s].instanceMatrix.needsUpdate    = true
      if (imSus[s].count     > 0) imSus[s].instanceMatrix.needsUpdate     = true
      if (imSusGlow[s].count > 0) imSusGlow[s].instanceMatrix.needsUpdate = true
    }
  }

  function dispose() {
    mStr.forEach(m => m.dispose());
    mGlow.forEach(m => m.dispose());
    mSus.forEach(m => m.dispose());
    mOutline?.dispose();
    mStr = []; mGlow = []; mSus = []; mOutline = null;
    gNote?.dispose(); gSus?.dispose();
    gNote = null; gSus = null;
  }

  return { group, update, dispose };
}
