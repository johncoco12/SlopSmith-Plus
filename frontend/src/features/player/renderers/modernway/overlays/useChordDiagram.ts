// Modernway — Chord diagram overlay (2D canvas drawn on top of the 3D scene).
// Shows a chord box diagram for the currently active chord with dots, barre,
// muted/open strings, chord name, and position indicators.

import { ref, watch, onMounted, onBeforeUnmount, type ShallowRef } from 'vue';
import type { RenderBundle, ChordTemplate } from '@/features/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const DIAG_ENTRANCE_S = 0.20;
const DIAG_CROSSFADE_S = 0.15;
const DIAG_LINGER_S = 0.55;

const GRID_FRETS = 5;
const DOT_RADIUS = 6;
const MARGIN = 16;
const STRING_SPACING = 18;
const FRET_SPACING = 22;
const FONT_NAME = '12px sans-serif';
const FONT_TITLE = 'bold 14px sans-serif';

interface DiagramState {
  template: ChordTemplate | null;
  startTime: number;
  endTime: number;
}

export function useChordDiagram(
  canvas: ShallowRef<HTMLCanvasElement | null>,
  bundle: ShallowRef<RenderBundle | null>,
) {
  let ctx: CanvasRenderingContext2D | null = null;
  let animFrame = 0;
  let current: DiagramState = { template: null, startTime: -999, endTime: -999 };
  let prev: DiagramState = { template: null, startTime: -999, endTime: -999 };

  function resize() {
    const c = canvas.value;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * window.devicePixelRatio;
    c.height = rect.height * window.devicePixelRatio;
    ctx = c.getContext('2d');
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function resolveActiveChord(b: RenderBundle): ChordTemplate | null {
    const now = b.currentTime;
    // Find the active chord at current time
    for (let i = b.chords.length - 1; i >= 0; i--) {
      const ch = b.chords[i];
      if (ch.t <= now && ch.t + DIAG_LINGER_S >= now) {
        const tpl = b.chordTemplates[ch.id];
        if (tpl && tpl.name) return tpl;
      }
      if (ch.t < now - DIAG_LINGER_S - 1) break;
    }
    return null;
  }

  function drawDiagram(
    tpl: ChordTemplate,
    x: number, y: number,
    alpha: number,
    stringCount: number,
  ) {
    if (!ctx || alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    const nStr = Math.min(stringCount, 8);
    const gridW = (nStr - 1) * STRING_SPACING;
    const gridH = GRID_FRETS * FRET_SPACING;

    // Find lowest fret (for position indicator)
    let minFret = 99;
    let maxFret = 0;
    for (const f of tpl.frets) {
      if (f > 0) {
        if (f < minFret) minFret = f;
        if (f > maxFret) maxFret = f;
      }
    }
    const baseFret = minFret <= GRID_FRETS ? 1 : minFret;
    const isFirstPos = baseFret === 1;

    // Chord name
    ctx.font = FONT_TITLE;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(tpl.name, x + gridW / 2, y - 8);

    // Grid
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    for (let s = 0; s < nStr; s++) {
      const sx = x + s * STRING_SPACING;
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx, y + gridH);
      ctx.stroke();
    }
    for (let f = 0; f <= GRID_FRETS; f++) {
      const fy = y + f * FRET_SPACING;
      ctx.beginPath();
      ctx.moveTo(x, fy);
      ctx.lineTo(x + gridW, fy);
      ctx.stroke();
    }

    // Thick nut line if first position
    if (isFirstPos) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 1, y);
      ctx.lineTo(x + gridW + 1, y);
      ctx.stroke();
    } else {
      // Position label
      ctx.font = FONT_NAME;
      ctx.fillStyle = '#aaaaaa';
      ctx.textAlign = 'right';
      ctx.fillText(`${baseFret}fr`, x - 6, y + FRET_SPACING * 0.7);
    }

    // Dots, X, O
    ctx.font = FONT_NAME;
    for (let s = 0; s < nStr && s < tpl.frets.length; s++) {
      const f = tpl.frets[s];
      const sx = x + s * STRING_SPACING;

      if (f === -1) {
        // Muted
        ctx.fillStyle = '#ff5555';
        ctx.textAlign = 'center';
        ctx.fillText('X', sx, y - 2);
      } else if (f === 0) {
        // Open
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, y - 6, 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Fretted dot
        const relFret = f - baseFret + 1;
        if (relFret >= 1 && relFret <= GRID_FRETS) {
          const dy = y + (relFret - 0.5) * FRET_SPACING;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(sx, dy, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Barre detection (consecutive same-fret notes)
    const frets = tpl.frets.slice(0, nStr);
    for (let f = 1; f <= maxFret; f++) {
      let first = -1, last = -1;
      for (let s = 0; s < frets.length; s++) {
        if (frets[s] === f) {
          if (first === -1) first = s;
          last = s;
        }
      }
      if (first >= 0 && last > first) {
        const relFret = f - baseFret + 1;
        if (relFret >= 1 && relFret <= GRID_FRETS) {
          const by = y + (relFret - 0.5) * FRET_SPACING;
          const bx1 = x + first * STRING_SPACING;
          const bx2 = x + last * STRING_SPACING;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = DOT_RADIUS * 1.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(bx1, by);
          ctx.lineTo(bx2, by);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  function render() {
    const c = canvas.value;
    const b = bundle.value;
    if (!c || !ctx || !b || !b.isReady) {
      animFrame = requestAnimationFrame(render);
      return;
    }

    const rect = c.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Resolve current chord
    const tpl = resolveActiveChord(b);
    const now = b.currentTime;

    if (tpl && tpl !== current.template) {
      prev = { ...current };
      current = { template: tpl, startTime: now, endTime: now + DIAG_LINGER_S };
    }

    // Draw current with entrance animation
    if (current.template) {
      const age = now - current.startTime;
      let alpha = Math.min(1, age / DIAG_ENTRANCE_S);
      // Fade out after linger
      if (now > current.endTime) {
        alpha = Math.max(0, 1 - (now - current.endTime) / DIAG_CROSSFADE_S);
      }
      if (alpha > 0) {
        drawDiagram(
          current.template,
          rect.width - 180, MARGIN + 20,
          alpha, b.stringCount,
        );
      }
    }

    animFrame = requestAnimationFrame(render);
  }

  function start() {
    resize();
    window.addEventListener('resize', resize);
    animFrame = requestAnimationFrame(render);
  }

  function stop() {
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animFrame);
  }

  return { start, stop, resize };
}
