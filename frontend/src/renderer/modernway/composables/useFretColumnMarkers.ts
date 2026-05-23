// Modernway — Fret column markers (scrolling beat-aligned fret indicators).
// Spawned on downbeats when notes exist in the upcoming 2s window.
// Shows anchor-relative dots subset at the beat Z position.

import * as THREE from 'three';
import {
  K, NH, S_GAP, NFRETS, AHEAD, BEHIND, DOTS, TS,
  fretMid, fretX, sY, dZ, getAnchorAt, lowerBoundT,
} from '../constants';
import type { RenderBundle } from '@/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_SIZE = 64;
const LIT_COLOUR = '#bbbbbb';
const UNLIT_COLOUR = '#666666';
const MARKER_OPACITY = 0.85;

// ── Texture cache ─────────────────────────────────────────────────────────────
const _texCache = new Map<string, THREE.CanvasTexture>();

function getMarkerTex(fret: number, colour: string): THREE.CanvasTexture {
  const key = `fcm_${fret}_${colour}`;
  const cached = _texCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  // Filled circle
  ctx.beginPath();
  ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  _texCache.set(key, tex);
  return tex;
}

// ── Fret Column Marker Pool ───────────────────────────────────────────────────
export interface FretColumnMarkerPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createFretColumnMarkers(): FretColumnMarkerPool {
  const group = new THREE.Group();
  const pool: THREE.Sprite[] = [];
  let idx = 0;

  // Materials per dot fret (lazily expanded)
  const matLit = new Map<number, THREE.SpriteMaterial>();
  const matUnlit = new Map<number, THREE.SpriteMaterial>();

  function getMatLit(f: number): THREE.SpriteMaterial {
    let m = matLit.get(f);
    if (m) return m;
    m = new THREE.SpriteMaterial({
      map: getMarkerTex(f, LIT_COLOUR),
      transparent: true,
      opacity: MARKER_OPACITY,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    matLit.set(f, m);
    return m;
  }

  function getMatUnlit(f: number): THREE.SpriteMaterial {
    let m = matUnlit.get(f);
    if (m) return m;
    m = new THREE.SpriteMaterial({
      map: getMarkerTex(f, UNLIT_COLOUR),
      transparent: true,
      opacity: MARKER_OPACITY,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    matUnlit.set(f, m);
    return m;
  }

  function getSprite(): THREE.Sprite {
    if (idx < pool.length) {
      pool[idx].visible = true;
      return pool[idx++];
    }
    const s = new THREE.Sprite(getMatUnlit(3));
    s.frustumCulled = false;
    s.renderOrder = 500;
    group.add(s);
    pool.push(s);
    idx++;
    return s;
  }

  function update(bundle: RenderBundle) {
    for (let i = 0; i < idx; i++) pool[i].visible = false;
    idx = 0;

    if (!bundle.isReady) return;

    const { currentTime: now, beats, notes, anchors, stringCount, inverted } = bundle;
    if (!beats.length || !anchors.length) return;

    const minY = Math.min(sY(0, stringCount, inverted), sY(stringCount - 1, stringCount, inverted));
    const markerY = minY - S_GAP * 0.8;
    const scale = NH * 2.2;

    // Iterate measure-line beats in the visible window
    for (const beat of beats) {
      if (beat.measure < 0) continue; // skip quarter beats
      const dt = beat.time - now;
      if (dt < -BEHIND) continue;
      if (dt > AHEAD) break;

      // Only show markers if notes exist in upcoming 2s from this beat
      const bStart = lowerBoundT(notes, beat.time);
      let hasNotes = false;
      for (let ni = bStart; ni < notes.length && notes[ni].t <= beat.time + 2.0; ni++) {
        hasNotes = true;
        break;
      }
      if (!hasNotes) continue;

      const anc = getAnchorAt(anchors, beat.time);
      if (!anc) continue;

      const fStart = Math.max(1, Math.round(anc.fret));
      const w = Math.max(1, Math.round(anc.width));
      const fLast = Math.min(NFRETS, fStart + w - 1);

      const z = dZ(dt);

      // Show DOTS subset within anchor range
      for (const df of DOTS) {
        if (df < fStart || df > fLast) continue;
        const lit = df >= fStart && df <= fLast;

        const spr = getSprite();
        spr.material = lit ? getMatLit(df) : getMatUnlit(df);
        spr.position.set(fretMid(df), markerY, z);
        spr.scale.set(scale, scale, 1);
      }
    }
  }

  function dispose() {
    matLit.forEach(m => m.dispose());
    matUnlit.forEach(m => m.dispose());
    _texCache.forEach(t => t.dispose());
    _texCache.clear();
  }

  return { group, update, dispose };
}
