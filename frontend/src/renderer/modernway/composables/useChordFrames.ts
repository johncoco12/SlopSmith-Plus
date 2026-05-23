// Modernway — Chord frame boxes, chord name labels, barre lines, and arpeggio frames.
// Renders rectangular rim bars around chords, interior gradient fill,
// chord name sprites, barre indicators, and arpeggio sustain rails.

import * as THREE from 'three';
import {
  K, NW, NH, S_GAP, TS, AHEAD, BEHIND,
  CHORD_HWY_LINGER_S, fretX, fretMid, sY, dZ, lowerBoundT,
} from '../constants';
import type {
  RenderBundle, ChartChord, ChordTemplate, HandShape,
} from '@/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const CHORD_FRAME_RIM_MIN = 0.6; // K units
const CHORD_BOX_EDGE_ALPHA = 0.75;
const CHORD_HWY_FADE_S = 0.35;
const CHORD_TEAL = 0x00d2d5;
const ARPEGGIO_BLUE = 0x454BB6;
const REPEAT_DIM = 0.78;

// Chord name label
const CHORD_NAME_COLOUR = '#e8d080';
const CHORD_NAME_CANVAS_W = 256;
const CHORD_NAME_CANVAS_H = 64;

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Post-hit tail fade multiplier */
function chordTailFade(dt: number, lingerS: number, fadeS: number): number {
  if (dt >= 0) return 1.0; // not yet hit
  const elapsed = -dt;
  if (elapsed < lingerS) return 1.0;
  return Math.max(0, 1 - (elapsed - lingerS) / fadeS);
}

/** Approach fade: fades in from distance */
function approachFade(dt: number): number {
  return Math.max(0, Math.min(1, 1 - dt / AHEAD));
}

// ── Chord name texture cache ──────────────────────────────────────────────────
const _nameTexCache = new Map<string, THREE.CanvasTexture>();

function getChordNameTex(name: string): THREE.CanvasTexture {
  const cached = _nameTexCache.get(name);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = CHORD_NAME_CANVAS_W;
  canvas.height = CHORD_NAME_CANVAS_H;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, CHORD_NAME_CANVAS_W, CHORD_NAME_CANVAS_H);
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = CHORD_NAME_COLOUR;
  ctx.fillText(name, CHORD_NAME_CANVAS_W / 2, CHORD_NAME_CANVAS_H / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  _nameTexCache.set(name, tex);
  return tex;
}

// ── Gradient fill texture (horizontal: opaque centre → transparent edges) ─────
let _gradientTex: THREE.CanvasTexture | null = null;
function getGradientTex(): THREE.CanvasTexture {
  if (_gradientTex) return _gradientTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(0,210,213,0)');
  grad.addColorStop(0.3, 'rgba(0,210,213,0.25)');
  grad.addColorStop(0.5, 'rgba(0,210,213,0.35)');
  grad.addColorStop(0.7, 'rgba(0,210,213,0.25)');
  grad.addColorStop(1, 'rgba(0,210,213,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 4);
  _gradientTex = new THREE.CanvasTexture(canvas);
  _gradientTex.needsUpdate = true;
  return _gradientTex;
}

// ── Shared geometries ─────────────────────────────────────────────────────────
let gBar: THREE.BoxGeometry | null = null;
let gFill: THREE.PlaneGeometry | null = null;
let gRail: THREE.PlaneGeometry | null = null;

function ensureGeometries() {
  if (!gBar) gBar = new THREE.BoxGeometry(1, 1, 1);
  if (!gFill) gFill = new THREE.PlaneGeometry(1, 1);
  if (!gRail) gRail = new THREE.PlaneGeometry(1, 1);
}

// ── Barre detection ───────────────────────────────────────────────────────────
interface BarreInfo { fret: number; minS: number; maxS: number; }

function detectBarre(template: ChordTemplate, stringCount: number): BarreInfo | null {
  const frets = template.frets;
  if (!frets || frets.length < 2) return null;

  // Find minimum fret > 0
  let minFret = 99;
  for (let s = 0; s < Math.min(frets.length, stringCount); s++) {
    if (frets[s] > 0 && frets[s] < minFret) minFret = frets[s];
  }
  if (minFret === 99) return null;

  // PATH A: 2+ adjacent strings at minimum fret
  const atMin: number[] = [];
  for (let s = 0; s < Math.min(frets.length, stringCount); s++) {
    if (frets[s] === minFret) atMin.push(s);
  }
  if (atMin.length >= 2) {
    // Check adjacency
    let adjacent = false;
    for (let i = 1; i < atMin.length; i++) {
      if (atMin[i] === atMin[i - 1] + 1) { adjacent = true; break; }
    }
    if (adjacent) {
      return { fret: minFret, minS: atMin[0], maxS: atMin[atMin.length - 1] };
    }
  }

  // PATH B: both outer strings at min fret, all inner fretted
  const outerStrings = [0, Math.min(frets.length, stringCount) - 1];
  if (frets[outerStrings[0]] === minFret && frets[outerStrings[1]] === minFret) {
    let allFretted = true;
    for (let s = outerStrings[0] + 1; s < outerStrings[1]; s++) {
      if (frets[s] <= 0) { allFretted = false; break; }
    }
    if (allFretted) {
      return { fret: minFret, minS: outerStrings[0], maxS: outerStrings[1] };
    }
  }

  return null;
}

// ── Arpeggio detection (simple heuristic) ─────────────────────────────────────
function isArpeggio(chord: ChartChord, notes: ChartChord['notes']): boolean {
  // A chord is arpeggio-like if its notes are staggered in time
  // (but in our data model chord notes share one t, so we rely on handShape overlap)
  // For now: chords with 4+ notes with sustains > 0.5s
  if (notes.length < 3) return false;
  let hasSustain = 0;
  for (const n of notes) {
    if ((n.sus ?? 0) > 0.5) hasSustain++;
  }
  return hasSustain >= notes.length * 0.7;
}

// ── Chord Frames Pool ─────────────────────────────────────────────────────────
export interface ChordFramePool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createChordFrames(): ChordFramePool {
  const group = new THREE.Group();

  // Sub-pools
  const barPool: THREE.Mesh[] = [];
  let barIdx = 0;
  const fillPool: THREE.Mesh[] = [];
  let fillIdx = 0;
  const namePool: THREE.Sprite[] = [];
  let nameIdx = 0;
  const barrePool: THREE.Mesh[] = [];
  let barreIdx = 0;
  const railPool: THREE.Mesh[] = [];
  let railIdx = 0;

  ensureGeometries();

  // ── Pool accessors ────────────────────────────────────────────────────────
  function getBar(): THREE.Mesh {
    if (barIdx < barPool.length) {
      barPool[barIdx].visible = true;
      return barPool[barIdx++];
    }
    const mat = new THREE.MeshBasicMaterial({
      color: CHORD_TEAL,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const m = new THREE.Mesh(gBar!, mat);
    m.frustumCulled = false;
    m.renderOrder = 17;
    group.add(m);
    barPool.push(m);
    barIdx++;
    return m;
  }

  function getFill(): THREE.Mesh {
    if (fillIdx < fillPool.length) {
      fillPool[fillIdx].visible = true;
      return fillPool[fillIdx++];
    }
    const mat = new THREE.MeshBasicMaterial({
      map: getGradientTex(),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(gFill!, mat);
    m.frustumCulled = false;
    m.renderOrder = 10;
    group.add(m);
    fillPool.push(m);
    fillIdx++;
    return m;
  }

  function getName(): THREE.Sprite {
    if (nameIdx < namePool.length) {
      namePool[nameIdx].visible = true;
      return namePool[nameIdx++];
    }
    const mat = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const s = new THREE.Sprite(mat);
    s.frustumCulled = false;
    s.renderOrder = 25;
    group.add(s);
    namePool.push(s);
    nameIdx++;
    return s;
  }

  function getBarre(): THREE.Mesh {
    if (barreIdx < barrePool.length) {
      barrePool[barreIdx].visible = true;
      return barrePool[barreIdx++];
    }
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const m = new THREE.Mesh(gBar!, mat);
    m.frustumCulled = false;
    m.renderOrder = 18;
    group.add(m);
    barrePool.push(m);
    barreIdx++;
    return m;
  }

  function getRail(): THREE.Mesh {
    if (railIdx < railPool.length) {
      railPool[railIdx].visible = true;
      return railPool[railIdx++];
    }
    const mat = new THREE.MeshBasicMaterial({
      color: ARPEGGIO_BLUE,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(gRail!, mat);
    m.frustumCulled = false;
    m.renderOrder = 16;
    group.add(m);
    railPool.push(m);
    railIdx++;
    return m;
  }

  // ── Reset all pools ─────────────────────────────────────────────────────
  function resetPools() {
    for (let i = 0; i < barIdx; i++) barPool[i].visible = false;
    for (let i = 0; i < fillIdx; i++) fillPool[i].visible = false;
    for (let i = 0; i < nameIdx; i++) namePool[i].visible = false;
    for (let i = 0; i < barreIdx; i++) barrePool[i].visible = false;
    for (let i = 0; i < railIdx; i++) railPool[i].visible = false;
    barIdx = 0;
    fillIdx = 0;
    nameIdx = 0;
    barreIdx = 0;
    railIdx = 0;
  }

  // ── Draw a chord frame ──────────────────────────────────────────────────
  function drawFrame(
    chord: ChartChord,
    template: ChordTemplate | undefined,
    now: number,
    stringCount: number,
    inverted: boolean,
    isRepeat: boolean,
    isArp: boolean,
    nextChordDt: number,
  ) {
    const dt = chord.t - now;
    const tailMul = chordTailFade(dt, CHORD_HWY_LINGER_S, CHORD_HWY_FADE_S);
    if (tailMul < 0.01) return;
    const fade = approachFade(dt);
    if (fade < 0.01 && dt > 0) return;

    const notes = chord.notes;
    if (!notes || notes.length === 0) return;

    // Compute bounding frets and strings
    let minF = 99, maxF = 0, minS = stringCount, maxS = 0;
    for (const n of notes) {
      if (n.f > 0) {
        if (n.f < minF) minF = n.f;
        if (n.f > maxF) maxF = n.f;
      }
      if (n.s < minS) minS = n.s;
      if (n.s > maxS) maxS = n.s;
    }
    // If all open, use fret 1..3 as visual bounds
    if (minF > maxF) { minF = 1; maxF = 3; }

    // Frame world dimensions
    const xLeft = fretX(minF - 1) + 0.5 * K;
    const xRight = fretX(maxF) - 0.5 * K;
    const frameW = Math.max(xRight - xLeft, 4 * K);
    const xCenter = (xLeft + xRight) / 2;

    const yMin = sY(minS, stringCount, inverted);
    const yMax = sY(maxS, stringCount, inverted);
    const yLow = Math.min(yMin, yMax) - S_GAP * 0.4;
    const yHigh = Math.max(yMin, yMax) + S_GAP * 0.4;
    let frameH = yHigh - yLow;

    // Repeat chords: half height, anchored at bottom
    const repDim = isRepeat ? REPEAT_DIM : 1.0;
    if (isRepeat) frameH *= 0.5;

    const yCenter = isRepeat ? yLow + frameH / 2 : (yLow + yHigh) / 2;
    const z = dZ(Math.max(dt, 0));

    // Rim thickness
    const ft = Math.max(CHORD_FRAME_RIM_MIN * K, frameH * 0.028);
    const ftSide = isArp ? ft * 1.55 : ft;
    const barDepth = Math.max(0.048 * K, ft * 0.68);

    const colour = isArp ? ARPEGGIO_BLUE : CHORD_TEAL;
    const alpha = fade * repDim * CHORD_BOX_EDGE_ALPHA * tailMul;

    // ── 4 rim bars ────────────────────────────────────────────────────────
    // Top
    const top = getBar();
    (top.material as THREE.MeshBasicMaterial).color.setHex(colour);
    (top.material as THREE.MeshBasicMaterial).opacity = alpha;
    top.position.set(xCenter, yCenter + frameH / 2 - ft / 2, z);
    top.scale.set(frameW, ft, barDepth);

    // Bottom
    const bot = getBar();
    (bot.material as THREE.MeshBasicMaterial).color.setHex(colour);
    (bot.material as THREE.MeshBasicMaterial).opacity = alpha;
    bot.position.set(xCenter, yCenter - frameH / 2 + ft / 2, z);
    bot.scale.set(frameW, ft, barDepth);

    // Left
    const left = getBar();
    (left.material as THREE.MeshBasicMaterial).color.setHex(colour);
    (left.material as THREE.MeshBasicMaterial).opacity = alpha;
    left.position.set(xCenter - frameW / 2 + ftSide / 2, yCenter, z);
    left.scale.set(ftSide, frameH, barDepth);

    // Right
    const right = getBar();
    (right.material as THREE.MeshBasicMaterial).color.setHex(colour);
    (right.material as THREE.MeshBasicMaterial).opacity = alpha;
    right.position.set(xCenter + frameW / 2 - ftSide / 2, yCenter, z);
    right.scale.set(ftSide, frameH, barDepth);

    // ── Interior gradient fill ────────────────────────────────────────────
    const fill = getFill();
    (fill.material as THREE.MeshBasicMaterial).opacity = fade * repDim * 0.2 * tailMul;
    fill.position.set(xCenter, yCenter, z - 0.01 * K);
    fill.scale.set(frameW - ft * 2, frameH - ft * 2, 1);

    // ── Chord name label ──────────────────────────────────────────────────
    if (!isRepeat && template?.name) {
      const nameSprite = getName();
      const nameMat = nameSprite.material as THREE.SpriteMaterial;
      const tex = getChordNameTex(template.name);
      if (nameMat.map !== tex) {
        nameMat.map = tex;
        nameMat.needsUpdate = true;
      }
      nameMat.opacity = Math.min(1, 0.3 + fade * 0.7) * tailMul;

      const lblW = 28 * K;
      const lblH = 9 * K;
      nameSprite.scale.set(lblW, lblH, 1);
      nameSprite.position.set(
        xLeft + NW * 0.94,
        yCenter + frameH / 2 + lblH / 2 + 0.5 * K,
        z,
      );
    }

    // ── Barre line ────────────────────────────────────────────────────────
    if (dt <= 0 && template) {
      const barre = detectBarre(template, stringCount);
      if (barre) {
        const barreY1 = sY(barre.minS, stringCount, inverted);
        const barreY2 = sY(barre.maxS, stringCount, inverted);
        const barreYMin = Math.min(barreY1, barreY2);
        const barreYMax = Math.max(barreY1, barreY2);
        const lineH = barreYMax - barreYMin;

        if (lineH > 0.001) {
          const bLine = getBarre();
          (bLine.material as THREE.MeshBasicMaterial).opacity = 0.8 * tailMul;
          bLine.position.set(
            fretMid(barre.fret),
            (barreYMin + barreYMax) / 2,
            0.05 * K,
          );
          bLine.scale.set(0.5 * K, lineH, 0.5 * K);
        }
      }
    }

    // ── Arpeggio sustain rails ────────────────────────────────────────────
    if (isArp) {
      // Find max sustain end
      let maxSusEnd = chord.t;
      for (const n of notes) {
        const end = chord.t + (n.sus ?? 0);
        if (end > maxSusEnd) maxSusEnd = end;
      }
      const railEnd = Math.min(maxSusEnd - now, AHEAD);
      const railStart = Math.max(dt, 0);
      const railLen = Math.abs(dZ(railEnd) - dZ(railStart));

      if (railLen > 0.01 * K) {
        const railZ = (dZ(railStart) + dZ(railEnd)) / 2;
        const railW = 2.5 * K;
        const railAlpha = Math.min(0.9, fade * 0.7) * tailMul;

        // Left rail
        const lRail = getRail();
        (lRail.material as THREE.MeshBasicMaterial).opacity = railAlpha;
        lRail.position.set(xLeft, yCenter, railZ);
        lRail.scale.set(railW, frameH, railLen);
        lRail.rotation.set(Math.PI / 2, 0, 0);

        // Right rail
        const rRail = getRail();
        (rRail.material as THREE.MeshBasicMaterial).opacity = railAlpha;
        rRail.position.set(xRight, yCenter, railZ);
        rRail.scale.set(railW, frameH, railLen);
        rRail.rotation.set(Math.PI / 2, 0, 0);
      }
    }
  }

  // ── Main update ─────────────────────────────────────────────────────────
  function update(bundle: RenderBundle) {
    resetPools();

    const { currentTime: now, chords, chordTemplates, stringCount, inverted } = bundle;
    if (!chords || chords.length === 0) return;

    // Visible time window
    const tMin = now - CHORD_HWY_LINGER_S - CHORD_HWY_FADE_S;
    const tMax = now + AHEAD;

    // Track previous chord ID for repeat detection
    let prevChordId = -1;

    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      if (c.t < tMin) { prevChordId = c.id; continue; }
      if (c.t > tMax) break;

      const template = c.id >= 0 && c.id < chordTemplates.length
        ? chordTemplates[c.id]
        : undefined;

      const isRepeat = c.id === prevChordId;
      const isArp = isArpeggio(c, c.notes);

      // Next chord dt for tail fade (look 1 chord ahead)
      const nextDt = (i + 1 < chords.length) ? chords[i + 1].t - now : AHEAD * 2;

      drawFrame(c, template, now, stringCount, inverted, isRepeat, isArp, nextDt);
      prevChordId = c.id;
    }
  }

  function dispose() {
    for (const m of barPool) (m.material as THREE.Material).dispose();
    for (const m of fillPool) (m.material as THREE.Material).dispose();
    for (const s of namePool) (s.material as THREE.Material).dispose();
    for (const m of barrePool) (m.material as THREE.Material).dispose();
    for (const m of railPool) (m.material as THREE.Material).dispose();
    barPool.length = 0;
    fillPool.length = 0;
    namePool.length = 0;
    barrePool.length = 0;
    railPool.length = 0;
  }

  return { group, update, dispose };
}
