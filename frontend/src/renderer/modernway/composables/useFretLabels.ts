// Modernway — Fret label sprites rendered via canvas textures.
// Produces numbered sprites that float above each note, connected by thin lines.
// Matches the old plugin's pNoteFretLabel + pConnectorLine rendering pattern.

import * as THREE from 'three';
import { K, NH, S_GAP, NW, AHEAD, TS, fretMid, sY, dZ, lowerBoundT } from '../constants';
import type { RenderBundle, ChartNote } from '@/player/types';

// ── Fret texture atlas (canvas-rendered, cached per fret number) ──────────────
const FRET_LABEL_GOLD = '#ffd700';
const FRET_LABEL_FONT = 'bold 48px sans-serif';
const CANVAS_SIZE = 64;

const _texCache = new Map<number, THREE.SpriteMaterial>();

function getFretMaterial(fret: number): THREE.SpriteMaterial {
  let mat = _texCache.get(fret);
  if (mat) return mat;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  // Draw fret number centered
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.font = FRET_LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Shadow for readability
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  ctx.fillStyle = FRET_LABEL_GOLD;
  ctx.fillText(String(fret), CANVAS_SIZE / 2, CANVAS_SIZE / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 1.0,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  });
  _texCache.set(fret, mat);
  return mat;
}

// ── Connector line material ───────────────────────────────────────────────────
let mConnector: THREE.MeshBasicMaterial | null = null;
let gConnector: THREE.CylinderGeometry | null = null;

function ensureConnectorGeo() {
  if (!mConnector) {
    mConnector = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
  }
  if (!gConnector) {
    // Thin cylinder along Y axis (height=1, scaled per-instance)
    gConnector = new THREE.CylinderGeometry(0.2 * K, 0.2 * K, 1, 4);
  }
}

// ── Fret Label Pool ───────────────────────────────────────────────────────────
export interface FretLabelPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createFretLabelPool(): FretLabelPool {
  const group = new THREE.Group();
  const spritePool: THREE.Sprite[] = [];
  const linePool: THREE.Mesh[] = [];
  let spriteIdx = 0;
  let lineIdx = 0;

  ensureConnectorGeo();

  function getSprite(): THREE.Sprite {
    if (spriteIdx < spritePool.length) {
      const s = spritePool[spriteIdx];
      s.visible = true;
      spriteIdx++;
      return s;
    }
    // Each sprite gets its own material clone so opacity can be set per-instance
    const s = new THREE.Sprite(getFretMaterial(0).clone());
    s.frustumCulled = false;
    group.add(s);
    spritePool.push(s);
    spriteIdx++;
    return s;
  }

  function getLine(): THREE.Mesh {
    if (lineIdx < linePool.length) {
      const m = linePool[lineIdx];
      m.visible = true;
      lineIdx++;
      return m;
    }
    const m = new THREE.Mesh(gConnector!, mConnector!.clone());
    m.frustumCulled = false;
    group.add(m);
    linePool.push(m);
    lineIdx++;
    return m;
  }

  function drawLabel(
    n: ChartNote,
    now: number,
    stringCount: number,
    inverted: boolean,
    curX: number,
  ) {
    if (n.f <= 0) return; // no label for open strings
    const s = n.s;
    if (s < 0 || s >= 8) return;

    const dt = n.t - now;
    const linger = 0.05;
    const susEnd = n.t + (n.sus || 0);
    const hasSus = (n.sus ?? 0) > 0;
    if (dt < -linger && (!hasSus || now > susEnd)) return;

    const sustained = dt < 0 && hasSus && now <= susEnd;
    const noteZ = sustained ? 0 : Math.min(0, dZ(dt));
    const x = fretMid(n.f);
    const y = sY(s, stringCount, inverted);

    // Label position: above the lowest string position (lane top)
    const minY = Math.min(sY(0, stringCount, inverted), sY(stringCount - 1, stringCount, inverted));
    const labelY = minY - S_GAP * 0.9;

    // Alpha: fade in from distance, fade out near the hit line
    const alpha = Math.max(0, Math.min(1, dt / 0.4)) * Math.min(1, (AHEAD - dt) / (AHEAD * 0.35));
    if (alpha < 0.01) return;

    // Fret number sprite
    const sprite = getSprite();
    const cachedMat = getFretMaterial(n.f);
    const spriteMat = sprite.material as THREE.SpriteMaterial;
    if (spriteMat.map !== cachedMat.map) {
      spriteMat.map = cachedMat.map;
      spriteMat.needsUpdate = true;
    }
    spriteMat.opacity = alpha;
    const labelScale = NH * 2.4;
    sprite.scale.set(labelScale, labelScale, 1);
    sprite.position.set(x, labelY, noteZ);

    // Connector line from label to note Y
    const lineLen = Math.abs(y - labelY);
    if (lineLen > 0.001) {
      const line = getLine();
      line.position.set(x, (y + labelY) / 2, noteZ);
      line.scale.set(1, lineLen, 1);
      (line.material as THREE.MeshBasicMaterial).opacity = alpha * 0.6;
    }
  }

  function update(bundle: RenderBundle) {
    spriteIdx = 0;
    lineIdx = 0;

    if (!bundle.isReady) {
      for (const s of spritePool) s.visible = false;
      for (const m of linePool) m.visible = false;
      return;
    }

    const now = bundle.currentTime;
    const t0 = now - 0.05;
    const t1 = now + AHEAD;
    const stringCount = bundle.stringCount;
    const inverted = bundle.inverted;
    const notes = bundle.notes;
    const chords = bundle.chords;

    // Open string X approximation
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

    // Draw labels for single notes
    const startIdx = lowerBoundT(notes, t0 - 0.5);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t1 + 0.5) break;
      drawLabel(n, now, stringCount, inverted, curX);
    }

    // Draw labels for chord notes
    for (let ci = 0; ci < chords.length; ci++) {
      const ch = chords[ci];
      if (ch.t < t0 - 0.5) continue;
      if (ch.t > t1 + 0.5) break;
      if (!ch.notes) continue;
      for (let ni = 0; ni < ch.notes.length; ni++) {
        const cn = ch.notes[ni];
        drawLabel(
          { ...cn, t: ch.t } as unknown as ChartNote,
          now, stringCount, inverted, curX,
        );
      }
    }

    // Hide unused
    for (let i = spriteIdx; i < spritePool.length; i++) spritePool[i].visible = false;
    for (let i = lineIdx; i < linePool.length; i++) linePool[i].visible = false;
  }

  function dispose() {
    for (const s of spritePool) {
      (s.material as THREE.SpriteMaterial).map?.dispose();
      s.material.dispose();
    }
    spritePool.length = 0;
    linePool.length = 0;
    _texCache.clear();
    mConnector?.dispose();
    gConnector?.dispose();
    mConnector = null;
    gConnector = null;
  }

  return { group, update, dispose };
}
