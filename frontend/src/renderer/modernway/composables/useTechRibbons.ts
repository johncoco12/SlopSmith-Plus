// Modernway — Sustain technique ribbons (slide, bend, vibrato, tremolo).
// Uses a custom BufferGeometry with 96 longitudinal samples per trail,
// allowing per-vertex deformation for pitch/position changes over time.

import * as THREE from 'three';
import {
  K, NW, NH, S_GAP, TS, AHEAD, BEHIND, PALETTES,
  fretMid, fretX, sY, dZ, lowerBoundT, CHORD_HWY_LINGER_S,
} from '../constants';
import type { RenderBundle, ChartNote, ChartChord } from '@/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const RIBBON_SAMPLES = 48; // longitudinal quads (reduced from 96 for perf)
const BEND_HALFSTEP_Y = S_GAP * 0.8;
const VIBRATO_PERIOD = 0.16; // seconds (≈6.25 Hz)
const VIBRATO_AMP = S_GAP * 0.15;
const TREMOLO_BUMP_S = 0.06;
const TREMOLO_AMP = NH * 0.5;

// ── Ribbon mesh factory ───────────────────────────────────────────────────────
function createRibbonGeometry(): THREE.BufferGeometry {
  // 2 vertices per sample (left/right edge), so (RIBBON_SAMPLES+1)*2 vertices
  const vertCount = (RIBBON_SAMPLES + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  // Build index buffer: 2 triangles per quad
  for (let i = 0; i < RIBBON_SAMPLES; i++) {
    const bl = i * 2;
    const br = i * 2 + 1;
    const tl = (i + 1) * 2;
    const tr = (i + 1) * 2 + 1;
    indices.push(bl, br, tl, br, tr, tl);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

// ── Deformation helpers ───────────────────────────────────────────────────────

function slideOffsetX(n: ChartNote, chartTime: number): number {
  if (!n.sl || n.sl <= 0 || !n.sus || n.sus <= 0) return 0;
  const p = Math.max(0, Math.min(1, (chartTime - n.t) / n.sus));
  const startX = fretMid(n.f);
  const endX = fretMid(n.sl);
  // Cubic ease-in via sin³
  const w = Math.pow(Math.sin(p * Math.PI / 2), 3);
  return (endX - startX) * w;
}

function bendOffsetY(n: ChartNote, chartTime: number): number {
  if (!n.bn || n.bn <= 0 || !n.sus || n.sus <= 0) return 0;
  const p = Math.max(0, Math.min(1, (chartTime - n.t) / n.sus));
  // Envelope: rise 0..0.35, plateau 0.35..0.65, release 0.65..1.0
  let envelope: number;
  if (p < 0.35) {
    envelope = p / 0.35;
  } else if (p < 0.65) {
    envelope = 1.0;
  } else {
    envelope = 1 - (p - 0.65) / 0.35;
  }
  return n.bn * BEND_HALFSTEP_Y * envelope;
}

function vibratoOffsetY(n: ChartNote, chartTime: number): number {
  if (!n.vb) return 0;
  const t = chartTime - n.t;
  return Math.sin(2 * Math.PI * t / VIBRATO_PERIOD) * VIBRATO_AMP;
}

function tremoloOffsetY(n: ChartNote, chartTime: number): number {
  if (!n.tr) return 0;
  const t = chartTime - n.t;
  // Sawtooth-like bumps
  const phase = (t % TREMOLO_BUMP_S) / TREMOLO_BUMP_S;
  return Math.abs(Math.sin(phase * Math.PI)) * TREMOLO_AMP;
}

// ── Technique Ribbon Pool ─────────────────────────────────────────────────────
export interface TechRibbonPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createTechRibbons(): TechRibbonPool {
  const group = new THREE.Group();

  // Core ribbon pool
  const corePool: THREE.Mesh[] = [];
  let coreIdx = 0;
  // Outline ribbon pool
  const olPool: THREE.Mesh[] = [];
  let olIdx = 0;

  // Materials per string
  let coreMats: THREE.MeshBasicMaterial[] = [];
  let olMat: THREE.MeshBasicMaterial | null = null;

  function ensureMaterials() {
    if (coreMats.length > 0) return;
    const palette = PALETTES.default;
    coreMats = palette.map(c => new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    olMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  function getCore(): THREE.Mesh {
    if (coreIdx < corePool.length) {
      corePool[coreIdx].visible = true;
      return corePool[coreIdx++];
    }
    const geo = createRibbonGeometry();
    const m = new THREE.Mesh(geo, coreMats[0]);
    m.frustumCulled = false;
    m.renderOrder = 19;
    group.add(m);
    corePool.push(m);
    coreIdx++;
    return m;
  }

  function getOutline(): THREE.Mesh {
    if (olIdx < olPool.length) {
      olPool[olIdx].visible = true;
      return olPool[olIdx++];
    }
    const geo = createRibbonGeometry();
    const m = new THREE.Mesh(geo, olMat!);
    m.frustumCulled = false;
    m.renderOrder = 18;
    group.add(m);
    olPool.push(m);
    olIdx++;
    return m;
  }

  function updateRibbonVerts(
    mesh: THREE.Mesh,
    n: ChartNote,
    now: number,
    stringCount: number,
    inverted: boolean,
    halfWidth: number,
  ) {
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;

    const susEnd = n.t + (n.sus ?? 0);
    const visStart = Math.max(n.t, now);
    const visEnd = Math.min(susEnd, now + AHEAD);
    const baseY = sY(n.s, stringCount, inverted);
    const baseX = fretMid(n.f);

    for (let i = 0; i <= RIBBON_SAMPLES; i++) {
      const t = i / RIBBON_SAMPLES;
      const chartTime = visStart + t * (visEnd - visStart);
      const dt = chartTime - now;
      const z = dZ(dt);

      // Compute deformation offsets
      const slideX = slideOffsetX(n, chartTime);
      const bendY = bendOffsetY(n, chartTime);
      const vibY = vibratoOffsetY(n, chartTime);
      const tremY = tremoloOffsetY(n, chartTime);

      const x = baseX + slideX;
      const y = baseY + bendY + vibY + tremY;

      // Left edge vertex
      const li = i * 2 * 3;
      positions[li] = x - halfWidth;
      positions[li + 1] = y;
      positions[li + 2] = z;

      // Right edge vertex
      const ri = (i * 2 + 1) * 3;
      positions[ri] = x + halfWidth;
      positions[ri + 1] = y;
      positions[ri + 2] = z;
    }

    posAttr.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  function drawRibbon(
    n: ChartNote,
    now: number,
    stringCount: number,
    inverted: boolean,
  ) {
    const s = n.s;
    if (s < 0 || s >= 8) return;
    if (!n.sus || n.sus <= 0) return;

    const susEnd = n.t + n.sus;
    if (now > susEnd) return;
    if (n.t > now + AHEAD) return;

    const halfW = NW * 0.42;
    const olHalfW = halfW + 0.3 * K;

    // Core ribbon
    const core = getCore();
    core.material = coreMats[s % coreMats.length];
    updateRibbonVerts(core, n, now, stringCount, inverted, halfW);

    // Outline ribbon
    const ol = getOutline();
    updateRibbonVerts(ol, n, now, stringCount, inverted, olHalfW);
  }

  function hasTechnique(n: ChartNote): boolean {
    return !!(n.sl && n.sl > 0) || !!(n.bn && n.bn > 0) || !!n.vb || !!n.tr;
  }

  function update(bundle: RenderBundle) {
    ensureMaterials();

    // Reset
    for (let i = 0; i < coreIdx; i++) corePool[i].visible = false;
    for (let i = 0; i < olIdx; i++) olPool[i].visible = false;
    coreIdx = 0;
    olIdx = 0;

    if (!bundle.isReady) return;

    const { currentTime: now, notes, chords, stringCount, inverted } = bundle;
    const t0 = now - 0.1; // slight behind for active sustains
    const t1 = now + AHEAD;

    // Single notes with technique + sustain
    const startIdx = lowerBoundT(notes, t0 - 5); // look back for long sustains
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t1) break;
      if (hasTechnique(n) && n.sus && n.sus > 0) {
        const susEnd = n.t + n.sus;
        if (now <= susEnd) {
          drawRibbon(n, now, stringCount, inverted);
        }
      }
    }

    // Chord notes with technique + sustain
    for (let ci = 0; ci < chords.length; ci++) {
      const ch = chords[ci];
      if (ch.t > t1) break;
      for (const cn of ch.notes) {
        const note = { ...cn, t: ch.t } as unknown as ChartNote;
        if (hasTechnique(note) && note.sus && note.sus > 0) {
          const susEnd = note.t + note.sus;
          if (now <= susEnd) {
            drawRibbon(note, now, stringCount, inverted);
          }
        }
      }
    }
  }

  function dispose() {
    for (const m of corePool) {
      m.geometry.dispose();
    }
    for (const m of olPool) {
      m.geometry.dispose();
    }
    coreMats.forEach(m => m.dispose());
    olMat?.dispose();
    corePool.length = 0;
    olPool.length = 0;
    coreMats = [];
    olMat = null;
  }

  return { group, update, dispose };
}
