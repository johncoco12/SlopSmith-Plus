// Modernway — Ambient dome particles (upper hemisphere point cloud).
// 680 points on a hemisphere with per-particle sinusoidal drift, slow rotation,
// and audio-reactive size/opacity.

import * as THREE from 'three';
import { K, AHEAD, lowerBoundT } from '../constants';
import type { RenderBundle } from '@/features/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const POINT_COUNT = 680;
const DOME_RADIUS = 420 * K;
const BASE_COLOUR = 0xaaccff;
const BASE_SIZE = K * 2.8;
const MAX_SIZE = K * 4.8;
const BASE_OPACITY = 0.40;
const MAX_OPACITY = 0.72;
const ROTATION_SPEED = 0.00035;
const DRIFT_AMP_MIN = 5 * K;
const DRIFT_AMP_MAX = 14 * K;
const DRIFT_SPEED_MIN = 0.04;
const DRIFT_SPEED_MAX = 0.18;

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
  const basePos   = new Float32Array(POINT_COUNT * 3); // fixed home positions
  // Per-particle drift: phase[i*3..+2] and speed[i*3..+2] for x/y/z independently
  const driftPhase = new Float32Array(POINT_COUNT * 3);
  const driftSpeed = new Float32Array(POINT_COUNT * 3);
  const driftAmp   = new Float32Array(POINT_COUNT);

  for (let i = 0; i < POINT_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // 0..PI/2 for upper hemisphere
    const r = DOME_RADIUS * (0.85 + Math.random() * 0.15);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);

    basePos[i * 3]     = positions[i * 3]     = x;
    basePos[i * 3 + 1] = positions[i * 3 + 1] = y;
    basePos[i * 3 + 2] = positions[i * 3 + 2] = z;

    driftPhase[i * 3]     = Math.random() * Math.PI * 2;
    driftPhase[i * 3 + 1] = Math.random() * Math.PI * 2;
    driftPhase[i * 3 + 2] = Math.random() * Math.PI * 2;

    driftSpeed[i * 3]     = DRIFT_SPEED_MIN + Math.random() * (DRIFT_SPEED_MAX - DRIFT_SPEED_MIN);
    driftSpeed[i * 3 + 1] = DRIFT_SPEED_MIN + Math.random() * (DRIFT_SPEED_MAX - DRIFT_SPEED_MIN);
    driftSpeed[i * 3 + 2] = DRIFT_SPEED_MIN + Math.random() * (DRIFT_SPEED_MAX - DRIFT_SPEED_MIN);

    driftAmp[i] = DRIFT_AMP_MIN + Math.random() * (DRIFT_AMP_MAX - DRIFT_AMP_MIN);
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

    // Per-particle sinusoidal drift — boost amplitude on note energy
    const energyMul = 1 + noteEnergy * 0.5;
    for (let i = 0; i < POINT_COUNT; i++) {
      const amp = driftAmp[i] * energyMul;
      positions[i * 3]     = basePos[i * 3]     + Math.sin(elapsed * driftSpeed[i * 3]     + driftPhase[i * 3])     * amp;
      positions[i * 3 + 1] = basePos[i * 3 + 1] + Math.sin(elapsed * driftSpeed[i * 3 + 1] + driftPhase[i * 3 + 1]) * amp * 0.45;
      positions[i * 3 + 2] = basePos[i * 3 + 2] + Math.sin(elapsed * driftSpeed[i * 3 + 2] + driftPhase[i * 3 + 2]) * amp;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    spriteTex.dispose();
  }

  return { group, update, dispose };
}
