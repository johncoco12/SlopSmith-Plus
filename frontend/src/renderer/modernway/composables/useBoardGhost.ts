// Modernway — Board ghost projection + ghost fret digits.
// Shows a ring outline on the fretboard (at Z=0 / hit line) for the next
// approaching note on each string, plus a flat fret number digit on the board.
// Matches the old plugin's projMeshArr + pGhostFretLbl pools.

import * as THREE from 'three';
import { K, NW, NH, S_GAP, AHEAD, PALETTES, fretMid, sY, lowerBoundT } from '../constants';
import type { RenderBundle, ChartNote } from '@/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const PROJ_WIN = 0.6;       // seconds: projection appears when note < 0.6s away
const GHOST_HOLD = 0.15;    // seconds: keep showing after note passes
const GHOST_FADE_S = 0.12;  // fade-out after hit

// ── Ring geometry (torus for the projection) ──────────────────────────────────
let gRing: THREE.TorusGeometry | null = null;
function ensureRingGeo() {
  if (!gRing) {
    gRing = new THREE.TorusGeometry(NW * 0.8, NW * 0.15, 8, 24);
  }
}

// ── Ghost digit texture cache ─────────────────────────────────────────────────
const CANVAS_SIZE = 64;
const _digitTexCache = new Map<number, THREE.CanvasTexture>();

function getDigitTex(fret: number): THREE.CanvasTexture {
  const cached = _digitTexCache.get(fret);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(fret), CANVAS_SIZE / 2, CANVAS_SIZE / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  _digitTexCache.set(fret, tex);
  return tex;
}

// ── Board Ghost Pool ──────────────────────────────────────────────────────────
export interface BoardGhostPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createBoardGhost(): BoardGhostPool {
  const group = new THREE.Group();

  // Ring pool (projection outlines at Z=0)
  const ringPool: THREE.Mesh[] = [];
  let ringIdx = 0;

  // Digit pool (flat fret numbers on the board)
  const digitPool: THREE.Mesh[] = [];
  let digitIdx = 0;

  // Materials per string (ring outlines)
  let ringMats: THREE.MeshBasicMaterial[] = [];
  // Shared digit material (we clone per instance for opacity)
  let digitGeo: THREE.PlaneGeometry | null = null;

  ensureRingGeo();

  function ensureMaterials() {
    if (ringMats.length > 0) return;
    const palette = PALETTES.default;
    ringMats = palette.map(c => new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }));
    if (!digitGeo) {
      digitGeo = new THREE.PlaneGeometry(1, 1);
    }
  }

  function getRing(): THREE.Mesh {
    if (ringIdx < ringPool.length) {
      const m = ringPool[ringIdx];
      m.visible = true;
      ringIdx++;
      return m;
    }
    const m = new THREE.Mesh(gRing!, ringMats[0].clone());
    m.frustumCulled = false;
    m.renderOrder = 15;
    group.add(m);
    ringPool.push(m);
    ringIdx++;
    return m;
  }

  function getDigit(): THREE.Mesh {
    if (digitIdx < digitPool.length) {
      const m = digitPool[digitIdx];
      m.visible = true;
      digitIdx++;
      return m;
    }
    const mat = new THREE.MeshBasicMaterial({
      map: getDigitTex(1),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(digitGeo!, mat);
    m.frustumCulled = false;
    m.renderOrder = 16;
    group.add(m);
    digitPool.push(m);
    digitIdx++;
    return m;
  }

  function update(bundle: RenderBundle) {
    ensureMaterials();

    // Reset pools
    for (let i = 0; i < ringIdx; i++) ringPool[i].visible = false;
    for (let i = 0; i < digitIdx; i++) digitPool[i].visible = false;
    ringIdx = 0;
    digitIdx = 0;

    const { currentTime: now, notes, stringCount, inverted } = bundle;

    // For each string, find the next approaching note (dt > -GHOST_HOLD && dt < PROJ_WIN)
    // We want the closest note per string that hasn't fully passed yet
    const nextOnString: (ChartNote | null)[] = new Array(stringCount).fill(null);

    const startIdx = lowerBoundT(notes, now - GHOST_HOLD);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      const dt = n.t - now;
      if (dt > PROJ_WIN) break;
      if (dt < -GHOST_HOLD) continue;
      if (n.f <= 0) continue; // skip open strings
      if (n.s < 0 || n.s >= stringCount) continue;

      // Take the earliest valid note per string
      if (!nextOnString[n.s]) {
        nextOnString[n.s] = n;
      }
    }

    // Also check chords for ghost projections
    if (bundle.chords) {
      for (const chord of bundle.chords) {
        const cdt = chord.t - now;
        if (cdt > PROJ_WIN) break;
        if (cdt < -GHOST_HOLD) continue;
        for (const cn of chord.notes) {
          if (cn.f <= 0) continue;
          if (cn.s < 0 || cn.s >= stringCount) continue;
          if (!nextOnString[cn.s]) {
            nextOnString[cn.s] = cn;
          }
        }
      }
    }

    // Render projections
    for (let s = 0; s < stringCount; s++) {
      const n = nextOnString[s];
      if (!n) continue;

      const dt = n.t - now;
      // projFactor: 0 when far, 1 when at hit line
      const projFactor = Math.max(0, Math.min(1, 1 - Math.max(dt, 0) / PROJ_WIN));
      if (projFactor < 0.01) continue;

      // Post-hit fade
      let fadeMul = 1.0;
      if (dt < 0) {
        fadeMul = Math.max(0, 1 - Math.abs(dt) / GHOST_FADE_S);
      }
      if (fadeMul < 0.01) continue;

      const x = fretMid(n.f);
      const y = sY(n.s, stringCount, inverted);

      // ── Ring outline ────────────────────────────────────────────────────
      const ring = getRing();
      const ringMat = ring.material as THREE.MeshBasicMaterial;

      // Set string colour
      const palette = PALETTES.default;
      ringMat.color.setHex(palette[n.s % palette.length]);
      ringMat.opacity = projFactor * fadeMul * 0.55;
      ringMat.emissive = undefined as any; // basic material has no emissive

      ring.position.set(x, y, 0.02 * K); // just above board at hit line
      ring.rotation.set(Math.PI / 2, 0, 0); // lie flat on XZ plane

      // Scale up as note approaches
      const ringScale = 0.6 + projFactor * 0.4;
      ring.scale.set(ringScale, ringScale, ringScale);

      // ── Ghost fret digit ────────────────────────────────────────────────
      const digit = getDigit();
      const digitMat = digit.material as THREE.MeshBasicMaterial;

      // Set correct texture
      const tex = getDigitTex(n.f);
      if (digitMat.map !== tex) {
        digitMat.map = tex;
        digitMat.needsUpdate = true;
      }
      digitMat.opacity = projFactor * fadeMul * 0.7;

      // Position slightly in front of the ring (toward camera)
      digit.position.set(x, y, 0.04 * K);
      digit.rotation.set(Math.PI / 2, 0, 0); // lie flat facing up

      const digitScale = NH * 2.0;
      digit.scale.set(digitScale, digitScale, 1);
    }
  }

  function dispose() {
    for (const m of ringPool) {
      (m.material as THREE.Material).dispose();
    }
    for (const m of digitPool) {
      (m.material as THREE.Material).dispose();
    }
    ringPool.length = 0;
    digitPool.length = 0;
    ringMats.forEach(m => m.dispose());
    ringMats = [];
  }

  return { group, update, dispose };
}
