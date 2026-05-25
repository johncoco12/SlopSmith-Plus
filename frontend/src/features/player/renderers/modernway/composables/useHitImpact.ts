// Modernway — Note hit impact effect (expanding ring + flash burst).
// Detects the first frame a note enters 'hit' state and spawns a timed burst
// at the note's position on the hit line (Z=0).

import * as THREE from 'three';
import {
  K, NW, BEHIND, PALETTES, NFRETS,
  fretMid, fretX, sY, lowerBoundT, getAnchorAt,
} from '../constants';
import type { RenderBundle, ChartNote } from '@/features/player/types';

const BURST_DURATION = 0.38;  // seconds the ring expands
const RING_SCALE_END = 5.5;   // how many × NW the ring reaches at peak
const FLASH_DURATION = 0.10;  // fast bright flash lifetime

interface Burst {
  wallStart: number; // performance.now()/1000 at spawn
  x: number;
  y: number;
  s: number;        // string index → colour
}

export interface HitImpactPool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createHitImpact(): HitImpactPool {
  const group = new THREE.Group();

  const bursts: Burst[] = [];
  const hitNoteKeys = new Set<string>();
  let lastChartTime = -1;

  // ── Shared geometry ────────────────────────────────────────────────────────
  const ringGeo = new THREE.TorusGeometry(NW, NW * 0.18, 6, 32);
  const flashGeo = new THREE.PlaneGeometry(1, 1);

  // ── Ring pool ──────────────────────────────────────────────────────────────
  interface Slot { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }
  const ringPool: Slot[] = [];
  const flashPool: Slot[] = [];

  function acquireSlot(pool: Slot[], geo: THREE.BufferGeometry, s: number, order: number): Slot {
    const colour = PALETTES.default[s % PALETTES.default.length];
    for (const slot of pool) {
      if (!slot.mesh.visible) {
        slot.mat.color.setHex(colour);
        slot.mesh.visible = true;
        return slot;
      }
    }
    const mat = new THREE.MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    group.add(mesh);
    const slot = { mesh, mat };
    pool.push(slot);
    return slot;
  }

  // ── Note processing ────────────────────────────────────────────────────────
  function trySpawn(n: ChartNote, chartTime: number, bundle: RenderBundle, key: string) {
    if (hitNoteKeys.has(key)) return;
    const state = bundle.getNoteState(n, chartTime);
    if (!state || state.state !== 'hit') return;

    hitNoteKeys.add(key);
    let x: number;
    if (n.f === 0) {
      const anc = getAnchorAt(bundle.anchors, chartTime);
      if (anc) {
        const fStart = Math.max(1, Math.round(anc.fret));
        const fLast  = Math.min(NFRETS, fStart + Math.max(1, Math.round(anc.width)) - 1);
        x = (fretX(fStart - 1) + fretX(fLast)) / 2;
      } else {
        x = 0;
      }
    } else {
      x = fretMid(n.f);
    }
    const y = sY(n.s, bundle.stringCount, bundle.inverted);
    bursts.push({ wallStart: performance.now() / 1000, x, y, s: n.s });
  }

  // ── Public update ──────────────────────────────────────────────────────────
  function update(bundle: RenderBundle) {
    for (const { mesh } of ringPool) mesh.visible = false;
    for (const { mesh } of flashPool) mesh.visible = false;

    if (!bundle.isReady) {
      bursts.length = 0;
      hitNoteKeys.clear();
      lastChartTime = -1;
      return;
    }

    const { currentTime: now, notes, chords } = bundle;

    // Seek detection — clear stale keys when time jumps
    if (lastChartTime >= 0 && Math.abs(now - lastChartTime) > 0.5) {
      hitNoteKeys.clear();
      bursts.length = 0;
    }
    lastChartTime = now;

    // Scan notes near the hit line for new hits
    const hitWin = 0.45;
    const startIdx = lowerBoundT(notes, now - BEHIND);
    for (let i = startIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > now + hitWin) break;
      trySpawn(n, n.t, bundle, `${n.t}_${n.s}_${n.f}`);
    }

    for (const ch of chords) {
      if (ch.t < now - BEHIND) continue;
      if (ch.t > now + hitWin) break;
      for (const cn of ch.notes) {
        const fake = { ...cn, t: ch.t } as unknown as ChartNote;
        trySpawn(fake, ch.t, bundle, `${ch.t}_${cn.s}_${cn.f}`);
      }
    }

    // Prune oversized key set (safety valve for long sessions)
    if (hitNoteKeys.size > 2000) hitNoteKeys.clear();

    // Advance and render active bursts
    const wallNow = performance.now() / 1000;

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      const age = wallNow - b.wallStart;

      if (age >= BURST_DURATION) {
        bursts.splice(i, 1);
        continue;
      }

      const t = age / BURST_DURATION;
      const eased = 1 - (1 - t) * (1 - t); // ease-out quad

      // Expanding ring — string-coloured, fades as it grows
      const ring = acquireSlot(ringPool, ringGeo, b.s, 300);
      const rs = NW * (1 + eased * (RING_SCALE_END - 1));
      ring.mesh.position.set(b.x, b.y, 0.01 * K);
      ring.mesh.scale.set(rs, rs, rs);
      ring.mat.opacity = 0.9 * (1 - eased);

      // Bright flash quad — fades fast
      if (age < FLASH_DURATION) {
        const ft = age / FLASH_DURATION;
        const flash = acquireSlot(flashPool, flashGeo, b.s, 301);
        const fs = NW * 3.0 * (1 + ft * 0.4);
        flash.mesh.position.set(b.x, b.y, 0.02 * K);
        flash.mesh.scale.set(fs, fs, 1);
        flash.mat.opacity = 0.65 * (1 - ft);
      }
    }
  }

  function dispose() {
    for (const { mesh, mat } of ringPool) { mat.dispose(); group.remove(mesh); }
    for (const { mesh, mat } of flashPool) { mat.dispose(); group.remove(mesh); }
    ringGeo.dispose();
    flashGeo.dispose();
    ringPool.length = 0;
    flashPool.length = 0;
    bursts.length = 0;
    hitNoteKeys.clear();
  }

  return { group, update, dispose };
}
