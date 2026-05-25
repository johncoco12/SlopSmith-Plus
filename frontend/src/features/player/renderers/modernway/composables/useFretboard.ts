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

    // Dark fretboard plane — expanded so edge fade doesn't clip the playfield
    const planeW = boardWidth  * 1.35;
    const planeL = boardLength * 1.30;
    const planeGeo = new THREE.PlaneGeometry(planeW, planeL);

    // Alpha map: opaque centre, smooth fade to transparent on all four edges
    const AMS = 128;
    const amCanvas = document.createElement('canvas');
    amCanvas.width  = AMS;
    amCanvas.height = AMS;
    const amCtx = amCanvas.getContext('2d')!;
    const fadeZone = 0.18; // fraction of each side used for the fade
    const amData = amCtx.createImageData(AMS, AMS);
    for (let py = 0; py < AMS; py++) {
      for (let px = 0; px < AMS; px++) {
        const fx = Math.min(px, AMS - 1 - px) / (AMS * fadeZone);
        const fy = Math.min(py, AMS - 1 - py) / (AMS * fadeZone);
        const t  = Math.min(fx, 1) * Math.min(fy, 1);
        // smoothstep
        const a  = t * t * (3 - 2 * t);
        const i  = (py * AMS + px) * 4;
        const v = Math.round(a * 255);
        amData.data[i] = amData.data[i + 1] = amData.data[i + 2] = v;
        amData.data[i + 3] = 255;
      }
    }
    amCtx.putImageData(amData, 0, 0);
    const alphaMap = new THREE.CanvasTexture(amCanvas);

    const planeMat = new THREE.MeshLambertMaterial({
      color: 0x263f56, transparent: true, opacity: 0.65, alphaMap,
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

    // Fret lines on the board plane (floor grid)
    const planeZ = -boardLength / 2 + TS * BEHIND;
    const boardSurfaceY = S_BASE - NH / 2 - 1.6 * K;
    const lineThick = 0.22 * K;
    const fretLineGeo = new THREE.BoxGeometry(lineThick, lineThick * 0.4, boardLength);
    const fretLineMat = new THREE.MeshBasicMaterial({
      color: 0x32587a, transparent: true, opacity: 0.35,
    });
    const fretLineMajMat = new THREE.MeshBasicMaterial({
      color: 0x3d6e96, transparent: true, opacity: 0.50,
    });
    for (let f = 0; f <= NFRETS; f++) {
      const x = fretX(f);
      const isMajor = f === 0 || f === 12 || f === 24;
      const line = new THREE.Mesh(fretLineGeo, isMajor ? fretLineMajMat : fretLineMat);
      line.position.set(x, boardSurfaceY, planeZ);
      group.add(line);
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

    // Fret dots — cream inlay markers at the hit line, centred between strings
    const midY = (sY(0, nStr, inverted) + sY(nStr - 1, nStr, inverted)) / 2;
    const dotRadius = 1.6 * K;
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xfff4d6, transparent: true, opacity: 0.22,
    });
    const dotGeo = new THREE.CircleGeometry(dotRadius, 16);

    for (const f of DOTS) {
      if (f > NFRETS) continue;
      const x = fretMid(f);

      if (DDOTS.has(f)) {
        const spread = S_GAP * 0.85;
        for (const dz of [-spread, spread]) {
          const dot = new THREE.Mesh(dotGeo, dotMat);
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(x, midY, dz);
          group.add(dot);
        }
      } else {
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(x, midY, 0);
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
