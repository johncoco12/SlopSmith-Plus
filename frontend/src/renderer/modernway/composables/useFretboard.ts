// Modernway — Fretboard geometry builder
// Creates the static board plane, fret wires, strings, and dot markers.

import * as THREE from 'three';
import {
  K, SCALE, NFRETS, STR_THICK, S_BASE, S_GAP, TS, AHEAD, BEHIND,
  fretX, fretMid, sY, DOTS, DDOTS, NW, NH, PALETTES, MAX_RENDER_STRINGS,
} from '../constants';

export interface FretboardState {
  group: THREE.Group;
  rebuild: (stringCount: number, inverted: boolean) => void;
  dispose: () => void;
}

export function createFretboard(): FretboardState {
  const group = new THREE.Group();
  const palette = PALETTES.default;

  function rebuild(stringCount: number, inverted: boolean) {
    // Clear existing
    while (group.children.length) {
      const child = group.children[0];
      child.traverse((o: any) => {
        o.geometry?.dispose?.();
        const mat = o.material;
        if (mat) {
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const m of mats) m?.dispose?.();
        }
      });
      group.remove(child);
    }

    const nStr = Math.min(stringCount, MAX_RENDER_STRINGS);
    const boardWidth = fretX(NFRETS) + 4 * K;
    const boardLength = TS * (AHEAD + BEHIND);

    // Board center X
    const centerX = fretX(NFRETS) / 2;

    // Dark fretboard plane
    const planeGeo = new THREE.PlaneGeometry(boardWidth, boardLength);
    const planeMat = new THREE.MeshLambertMaterial({
      color: 0x08080e, transparent: true, opacity: 0.6,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(centerX, S_BASE - NH / 2 - 2 * K, -boardLength / 2 + TS * BEHIND);
    group.add(plane);

    // Strings
    for (let s = 0; s < nStr; s++) {
      const y = sY(s, nStr, inverted);
      const strGeo = new THREE.BoxGeometry(boardWidth, STR_THICK, STR_THICK);
      const strMat = new THREE.MeshStandardMaterial({
        color: palette[s], emissive: palette[s],
        emissiveIntensity: 0.002,
        transparent: true, opacity: 0.5, roughness: 1,
      });
      const strMesh = new THREE.Mesh(strGeo, strMat);
      strMesh.position.set(centerX, y, 0);
      group.add(strMesh);
    }

    // Fret wires
    const fretHeight = S_BASE + (nStr - 1) * S_GAP + S_GAP * 0.5;
    const fretBaseY = S_BASE - S_GAP * 0.25;
    for (let f = 0; f <= NFRETS; f++) {
      const x = fretX(f);
      const isMajor = f === 0 || f === 12 || f === 24;
      const color = isMajor ? 0xbbbbff : 0x666688;
      const opacity = isMajor ? 0.8 : 0.4;
      const thickness = isMajor ? 0.4 * K : 0.2 * K;

      const wireGeo = new THREE.BoxGeometry(thickness, fretHeight, thickness);
      const wireMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
      });
      const wire = new THREE.Mesh(wireGeo, wireMat);
      wire.position.set(x, fretBaseY + fretHeight / 2, 0);
      group.add(wire);
    }

    // Fret dots
    const dotY = S_BASE - NH / 2 - 1.5 * K;
    for (const f of DOTS) {
      if (f > NFRETS) continue;
      const x = fretMid(f);
      const isDouble = DDOTS.has(f);
      const dotRadius = 1.2 * K;

      if (isDouble) {
        // Double dot
        const midY = (sY(0, nStr, inverted) + sY(nStr - 1, nStr, inverted)) / 2;
        const offset = S_GAP * 1.2;
        for (const dy of [-offset, offset]) {
          const dotGeo = new THREE.CircleGeometry(dotRadius, 12);
          const dotMat = new THREE.MeshBasicMaterial({
            color: 0x445566, transparent: true, opacity: 0.6,
          });
          const dot = new THREE.Mesh(dotGeo, dotMat);
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(x, dotY, dy * 0.01); // slight Z offset for visibility
          group.add(dot);
        }
      } else {
        const dotGeo = new THREE.CircleGeometry(dotRadius, 12);
        const dotMat = new THREE.MeshBasicMaterial({
          color: 0x445566, transparent: true, opacity: 0.6,
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(x, dotY, 0);
        group.add(dot);
      }
    }
  }

  function dispose() {
    while (group.children.length) {
      const child = group.children[0];
      child.traverse((o: any) => {
        o.geometry?.dispose?.();
        const mat = o.material;
        if (mat) {
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const m of mats) m?.dispose?.();
        }
      });
      group.remove(child);
    }
  }

  return { group, rebuild, dispose };
}
