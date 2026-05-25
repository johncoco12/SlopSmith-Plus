// Modernway — Fret inlay labels (static dot-position fret numbers above the board).
// Shows fret numbers at standard dot positions [3,5,7,9,12,15,17,19,22,24]
// positioned above the highest string, behind the hit line.

import * as THREE from 'three';
import { K, S_GAP, DOTS, fretMid, sY } from '../constants';
import type { RenderBundle } from '@/features/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_SIZE = 64;
const INLAY_COLOUR = '#7abfcc';
const INLAY_OPACITY = 0.55;
const INLAY_SCALE = 5.5 * K;

// ── Texture cache ─────────────────────────────────────────────────────────────
const _texCache = new Map<number, THREE.CanvasTexture>();

function getInlayTex(fret: number): THREE.CanvasTexture {
  const cached = _texCache.get(fret);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INLAY_COLOUR;
  ctx.fillText(String(fret), CANVAS_SIZE / 2, CANVAS_SIZE / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  _texCache.set(fret, tex);
  return tex;
}

// ── Fret Inlay Labels Pool ────────────────────────────────────────────────────
export interface FretInlayPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createFretInlays(): FretInlayPool {
  const group = new THREE.Group();
  const sprites: THREE.Sprite[] = [];
  const mats: THREE.SpriteMaterial[] = [];
  let built = false;
  let lastStringCount = -1;
  let lastInverted: boolean | null = null;

  function build(stringCount: number, inverted: boolean) {
    // Clear previous
    for (const s of sprites) group.remove(s);
    sprites.length = 0;
    mats.length = 0;

    const maxY = Math.max(sY(0, stringCount, inverted), sY(stringCount - 1, stringCount, inverted));
    const labelY = maxY + S_GAP * 0.4;

    for (const f of DOTS) {
      const mat = new THREE.SpriteMaterial({
        map: getInlayTex(f),
        transparent: true,
        opacity: INLAY_OPACITY,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: true,
      });
      mats.push(mat);

      const sprite = new THREE.Sprite(mat);
      sprite.frustumCulled = false;
      sprite.renderOrder = 500;
      sprite.position.set(fretMid(f), labelY, -K);
      sprite.scale.set(INLAY_SCALE, INLAY_SCALE, 1);

      group.add(sprite);
      sprites.push(sprite);
    }

    built = true;
    lastStringCount = stringCount;
    lastInverted = inverted;
  }

  function update(bundle: RenderBundle) {
    const { stringCount, inverted } = bundle;

    if (!built || stringCount !== lastStringCount || inverted !== lastInverted) {
      build(stringCount, inverted);
    }
    // Static labels — no per-frame update needed beyond rebuild on layout change
  }

  function dispose() {
    mats.forEach(m => m.dispose());
    _texCache.forEach(t => t.dispose());
    _texCache.clear();
  }

  return { group, update, dispose };
}
