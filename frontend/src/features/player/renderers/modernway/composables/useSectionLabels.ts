// Modernway — Section labels (scrolling section name sprites on the highway).
// Renders section names (e.g. "Chorus", "Verse 1") above the strings,
// scrolling toward the player.

import * as THREE from 'three';
import { K, AHEAD, BEHIND, fretX, sY, dZ, NFRETS } from '../constants';
import type { RenderBundle } from '@/features/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W = 256;
const CANVAS_H = 64;
const LABEL_COLOUR = '#00cccc';
const LABEL_SCALE_X = 20 * K;
const LABEL_SCALE_Y = 5 * K;

// ── Texture cache ─────────────────────────────────────────────────────────────
const _texCache = new Map<string, THREE.CanvasTexture>();

function getSectionTex(name: string): THREE.CanvasTexture {
  const cached = _texCache.get(name);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Drop shadow
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = LABEL_COLOUR;
  ctx.fillText(name, CANVAS_W / 2, CANVAS_H / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  _texCache.set(name, tex);
  return tex;
}

// ── Section Labels Pool ───────────────────────────────────────────────────────
export interface SectionLabelPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createSectionLabels(): SectionLabelPool {
  const group = new THREE.Group();
  const pool: THREE.Sprite[] = [];
  let idx = 0;

  // Lazily created materials
  const matCache = new Map<string, THREE.SpriteMaterial>();

  function getMat(name: string): THREE.SpriteMaterial {
    let m = matCache.get(name);
    if (m) return m;
    m = new THREE.SpriteMaterial({
      map: getSectionTex(name),
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    matCache.set(name, m);
    return m;
  }

  function getSprite(): THREE.Sprite {
    if (idx < pool.length) {
      pool[idx].visible = true;
      return pool[idx++];
    }
    const s = new THREE.Sprite(getMat(''));
    s.frustumCulled = false;
    s.renderOrder = 900;
    group.add(s);
    pool.push(s);
    idx++;
    return s;
  }

  function update(bundle: RenderBundle) {
    for (let i = 0; i < idx; i++) pool[i].visible = false;
    idx = 0;

    if (!bundle.isReady) return;

    const { currentTime: now, sections, stringCount, inverted } = bundle;
    if (!sections.length) return;

    const maxY = Math.max(sY(0, stringCount, inverted), sY(stringCount - 1, stringCount, inverted));
    const labelY = maxY + 8 * K;
    const labelX = fretX(12); // mid-board

    for (const sec of sections) {
      const dt = sec.time - now;
      if (dt < -BEHIND) continue;
      if (dt > AHEAD) break;

      const spr = getSprite();
      spr.material = getMat(sec.name);
      spr.position.set(labelX, labelY, dZ(dt));
      spr.scale.set(LABEL_SCALE_X, LABEL_SCALE_Y, 1);
    }
  }

  function dispose() {
    matCache.forEach(m => m.dispose());
    _texCache.forEach(t => t.dispose());
    _texCache.clear();
    matCache.clear();
  }

  return { group, update, dispose };
}
