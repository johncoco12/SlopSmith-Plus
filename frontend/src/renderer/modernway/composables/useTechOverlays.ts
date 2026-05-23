// Modernway — Technique overlays (bend chevrons, HO/PO triangles,
// PM/FH mute X marks, harmonic diamonds, tap chevrons).
// All rendered as PlaneGeometry meshes that rotate with the note approach.

import * as THREE from 'three';
import {
  K, NW, NH, AHEAD, BEHIND, PALETTES,
  fretMid, sY, dZ, lowerBoundT, CHORD_HWY_LINGER_S,
} from '../constants';
import type { RenderBundle, ChartNote, ChartChord } from '@/player/types';

// ── Canvas texture cache ──────────────────────────────────────────────────────
const _texCache = new Map<string, THREE.CanvasTexture>();
const CANVAS = 64;

function getOrCreateTex(key: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cached = _texCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, CANVAS, CANVAS);
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  _texCache.set(key, tex);
  return tex;
}

// ── Texture generators ────────────────────────────────────────────────────────

function bendChevronTex(steps: number, colour: string): THREE.CanvasTexture {
  return getOrCreateTex(`bend_${steps}_${colour}`, (ctx) => {
    const cx = CANVAS / 2;
    const spacing = 12;
    const startY = CANVAS / 2 + ((steps - 1) * spacing) / 2;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < steps; i++) {
      const y = startY - i * spacing;
      ctx.beginPath();
      ctx.moveTo(cx - 16, y + 8);
      ctx.lineTo(cx, y - 6);
      ctx.lineTo(cx + 16, y + 8);
      ctx.stroke();
    }
  });
}

function hoTriangleTex(): THREE.CanvasTexture {
  return getOrCreateTex('ho', (ctx) => {
    const cx = CANVAS / 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(cx, 12);
    ctx.lineTo(cx + 18, CANVAS - 16);
    ctx.lineTo(cx - 18, CANVAS - 16);
    ctx.closePath();
    ctx.fill();
  });
}

function poTriangleTex(): THREE.CanvasTexture {
  return getOrCreateTex('po', (ctx) => {
    const cx = CANVAS / 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(cx, CANVAS - 12);
    ctx.lineTo(cx + 18, 16);
    ctx.lineTo(cx - 18, 16);
    ctx.closePath();
    ctx.fill();
  });
}

function palmMuteTex(): THREE.CanvasTexture {
  return getOrCreateTex('pm', (ctx) => {
    const cx = CANVAS / 2;
    const arm = CANVAS * 0.35;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = CANVAS * 0.18;
    ctx.lineCap = 'round';
    // X shape
    ctx.beginPath();
    ctx.moveTo(cx - arm, cx - arm);
    ctx.lineTo(cx + arm, cx + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + arm, cx - arm);
    ctx.lineTo(cx - arm, cx + arm);
    ctx.stroke();
    // Dark inner
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = CANVAS * 0.10;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cx - arm);
    ctx.lineTo(cx + arm, cx + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + arm, cx - arm);
    ctx.lineTo(cx - arm, cx + arm);
    ctx.stroke();
  });
}

function frethandMuteTex(): THREE.CanvasTexture {
  return getOrCreateTex('fhm', (ctx) => {
    const cx = CANVAS / 2;
    const arm = CANVAS * 0.35;
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = CANVAS * 0.18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - arm, cx - arm);
    ctx.lineTo(cx + arm, cx + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + arm, cx - arm);
    ctx.lineTo(cx - arm, cx + arm);
    ctx.stroke();
    // White inner
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = CANVAS * 0.10;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cx - arm);
    ctx.lineTo(cx + arm, cx + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + arm, cx - arm);
    ctx.lineTo(cx - arm, cx + arm);
    ctx.stroke();
  });
}

function harmonicDiamondTex(colour: string): THREE.CanvasTexture {
  return getOrCreateTex(`hm_${colour}`, (ctx) => {
    const cx = CANVAS / 2;
    const r = CANVAS * 0.38;
    ctx.fillStyle = colour;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cx - r);     // top
    ctx.lineTo(cx + r, cx);     // right
    ctx.lineTo(cx, cx + r);     // bottom
    ctx.lineTo(cx - r, cx);     // left
    ctx.closePath();
    ctx.fill();
    // White border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function tapChevronTex(): THREE.CanvasTexture {
  return getOrCreateTex('tap', (ctx) => {
    const cx = CANVAS / 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', cx, cx);
  });
}

// ── Shared geometry ───────────────────────────────────────────────────────────
let gPlane: THREE.PlaneGeometry | null = null;
function ensureGeo() {
  if (!gPlane) gPlane = new THREE.PlaneGeometry(1, 1);
}

// ── Technique Overlay Pool ────────────────────────────────────────────────────
export interface TechniqueOverlayPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createTechniqueOverlays(): TechniqueOverlayPool {
  const group = new THREE.Group();
  const pool: THREE.Mesh[] = [];
  let idx = 0;

  ensureGeo();

  function getMesh(): THREE.Mesh {
    if (idx < pool.length) {
      pool[idx].visible = true;
      return pool[idx++];
    }
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(gPlane!, mat);
    m.frustumCulled = false;
    m.renderOrder = 1000;
    group.add(m);
    pool.push(m);
    idx++;
    return m;
  }

  function drawOverlay(
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

    // Distance compensation for perspective
    const distFactor = 1 + Math.max(0, Math.min(1, dt / AHEAD)) * 1.5;
    const palette = PALETTES.default;
    const sColHex = '#' + palette[s % palette.length].toString(16).padStart(6, '0');

    // ── Bend chevrons ─────────────────────────────────────────────────────
    if (n.bn && n.bn > 0) {
      const steps = Math.min(4, Math.max(1, Math.round(n.bn * 2)));
      const tex = bendChevronTex(steps, sColHex);
      const m = getMesh();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = 0.9;
      const scale = NH * 2.4 * distFactor;
      m.scale.set(scale, scale, 1);
      m.position.set(x, y + NH * 1.1, noteZ + 0.1 * K);
      m.rotation.set(0, 0, approachRot);
    }

    // ── Hammer-on ─────────────────────────────────────────────────────────
    if (n.ho) {
      const tex = hoTriangleTex();
      const m = getMesh();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = 0.85;
      m.scale.set(NH * 1.8 * distFactor, NH * 1.6 * distFactor, 1);
      m.position.set(x, y, noteZ + 0.1 * K);
      m.rotation.set(0, 0, approachRot);
    }

    // ── Pull-off ──────────────────────────────────────────────────────────
    if (n.po) {
      const tex = poTriangleTex();
      const m = getMesh();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = 0.85;
      m.scale.set(NH * 1.8 * distFactor, NH * 1.6 * distFactor, 1);
      m.position.set(x, y, noteZ + 0.1 * K);
      m.rotation.set(0, 0, approachRot);
    }

    // ── Palm mute ─────────────────────────────────────────────────────────
    if (n.pm) {
      const tex = palmMuteTex();
      const m = getMesh();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = 0.9;
      m.scale.set(NW * 1.6 * distFactor, NH * 1.6 * distFactor, 1);
      m.position.set(x, y, noteZ + 0.1 * K);
      m.rotation.set(0, 0, approachRot);
    }

    // ── Frethand mute ─────────────────────────────────────────────────────
    if (n.mt) {
      const tex = frethandMuteTex();
      const m = getMesh();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = 0.9;
      m.scale.set(NW * 1.6 * distFactor, NH * 1.6 * distFactor, 1);
      m.position.set(x, y, noteZ + 0.1 * K);
      m.rotation.set(0, 0, approachRot);
    }

    // ── Natural harmonic ──────────────────────────────────────────────────
    if (n.hm) {
      const tex = harmonicDiamondTex('#ffffffcc');
      const m = getMesh();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = 0.85;
      m.scale.set(NW * 1.9 * distFactor, NH * 2.0 * distFactor, 1);
      m.position.set(x, y, noteZ + 0.15 * K);
      m.rotation.set(0, 0, approachRot);
    }

    // ── Pinch harmonic ────────────────────────────────────────────────────
    if (n.hp) {
      const tex = harmonicDiamondTex(sColHex);
      const m = getMesh();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = 0.85;
      m.scale.set(NW * 1.9 * distFactor, NH * 2.0 * distFactor, 1);
      m.position.set(x, y, noteZ + 0.15 * K);
      m.rotation.set(0, 0, approachRot);
    }

    // ── Tap ───────────────────────────────────────────────────────────────
    if (n.tp) {
      const tex = tapChevronTex();
      const m = getMesh();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = 0.9;
      const scale = NH * 0.8 * distFactor;
      m.scale.set(scale, scale, 1);
      m.position.set(x, y, noteZ + 0.12 * K);
      m.rotation.set(0, 0, approachRot);
    }
  }

  function update(bundle: RenderBundle) {
    // Reset pool
    for (let i = 0; i < idx; i++) pool[i].visible = false;
    idx = 0;

    if (!bundle.isReady) return;

    const { currentTime: now, notes, chords, stringCount, inverted } = bundle;
    const t0 = now - BEHIND;
    const t1 = now + AHEAD;

    // Single notes
    const startIdx = lowerBoundT(notes, t0 - 1);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t1 + 1) break;
      // Only draw if note has any technique flag
      if (n.bn || n.ho || n.po || n.pm || n.mt || n.hm || n.hp || n.tp) {
        drawOverlay(n, now, stringCount, inverted);
      }
    }

    // Chord notes
    for (let ci = 0; ci < chords.length; ci++) {
      const ch = chords[ci];
      if (ch.t < t0 - CHORD_HWY_LINGER_S) continue;
      if (ch.t > t1 + 1) break;
      for (const cn of ch.notes) {
        if (cn.bn || cn.ho || cn.po || cn.pm || cn.mt || cn.hm || cn.hp || cn.tp) {
          drawOverlay(
            { ...cn, t: ch.t } as unknown as ChartNote,
            now, stringCount, inverted,
          );
        }
      }
    }
  }

  function dispose() {
    for (const m of pool) {
      (m.material as THREE.Material).dispose();
    }
    pool.length = 0;
  }

  return { group, update, dispose };
}
