// Modernway — Ambient dome particles (upper hemisphere point cloud).
// 320 points on a hemisphere with slow rotation and audio-reactive size/opacity.
// Since we don't have FFT analyser bands here, we simulate gentle idle motion
// and pulse slightly on note activity.

import * as THREE from 'three';
import { K, AHEAD, lowerBoundT } from '../constants';
import type { RenderBundle } from '@/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const POINT_COUNT = 320;
const DOME_RADIUS = 420 * K;
const BASE_COLOUR = 0xaaccff;
const BASE_SIZE = K * 2.8;
const MAX_SIZE = K * 4.8;
const BASE_OPACITY = 0.40;
const MAX_OPACITY = 0.72;
const ROTATION_SPEED = 0.00035;

// ── Dome Particles ────────────────────────────────────────────────────────────
export interface DomeParticlePool {
  group: THREE.Group;
  update: (bundle: RenderBundle) => void;
  dispose: () => void;
}

export function createDomeParticles(): DomeParticlePool {
  const group = new THREE.Group();

  // Generate hemisphere points (uniform distribution via rejection)
  const positions = new Float32Array(POINT_COUNT * 3);
  for (let i = 0; i < POINT_COUNT; i++) {
    // Uniform hemisphere: spherical coordinates
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // 0..PI/2 for upper hemisphere
    const r = DOME_RADIUS * (0.85 + Math.random() * 0.15);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi); // Y is up
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Radial gradient sprite texture
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(200,220,255,0.6)');
  grad.addColorStop(1, 'rgba(100,150,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const spriteTex = new THREE.CanvasTexture(canvas);

  const mat = new THREE.PointsMaterial({
    color: BASE_COLOUR,
    size: BASE_SIZE,
    map: spriteTex,
    transparent: true,
    opacity: BASE_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 1;
  group.add(points);

  // Position dome centred above the board
  group.position.set(0, 20 * K, -100 * K);

  let elapsed = 0;
  let lastTime = 0;
  let _cam: THREE.Camera | null = null;

  function findCamera(): THREE.Camera | null {
    if (_cam) return _cam;
    const scene = group.parent;
    if (!scene) return null;
    scene.traverse((child) => {
      if ((child as any).isPerspectiveCamera) _cam = child as THREE.Camera;
    });
    return _cam;
  }

  function update(bundle: RenderBundle) {
    if (!bundle.isReady) return;

    // Follow camera so dome stays overhead as camera pans
    const cam = findCamera();
    if (cam) {
      group.position.x = cam.position.x;
      group.position.z = cam.position.z - 100 * K;
    }

    const now = bundle.currentTime;
    const dt = lastTime > 0 ? Math.min(now - lastTime, 0.1) : 0.016;
    lastTime = now;
    elapsed += dt;

    // Simulate note activity as a proxy for audio energy
    const notes = bundle.notes;
    const hitWindow = 0.2;
    const startIdx = lowerBoundT(notes, now - hitWindow);
    let noteEnergy = 0;
    for (let i = startIdx; i < notes.length; i++) {
      if (notes[i].t > now + hitWindow) break;
      noteEnergy += 0.15;
      if (noteEnergy >= 1) { noteEnergy = 1; break; }
    }

    // Slow Y-axis rotation
    group.rotation.y = elapsed * ROTATION_SPEED + noteEnergy * 0.002;

    // Audio-reactive size and opacity (simulated from note density)
    mat.size = BASE_SIZE + noteEnergy * (MAX_SIZE - BASE_SIZE);
    mat.opacity = BASE_OPACITY + noteEnergy * (MAX_OPACITY - BASE_OPACITY) * 0.5;
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    spriteTex.dispose();
  }

  return { group, update, dispose };
}
