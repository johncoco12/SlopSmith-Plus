// Modernway — Lyrics overlay (2D canvas karaoke-style lyrics on top of 3D scene).
// Shows current lyric line with progressive word highlighting,
// plus faded previous and dimmed next lines.

import type { ShallowRef } from 'vue';
import type { RenderBundle, Lyric } from '@/player/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const LINE_HEIGHT = 28;
const FONT_ACTIVE = 'bold 20px sans-serif';
const FONT_INACTIVE = '18px sans-serif';
const COLOUR_ACTIVE = '#ffffff';
const COLOUR_HIGHLIGHT = '#00eeff';
const COLOUR_PREV = '#888888';
const COLOUR_NEXT = '#aaaaaa';
const BOTTOM_MARGIN = 60;

interface LyricLine {
  words: Lyric[];
  startTime: number;
  endTime: number;
  text: string;
}

function buildLines(lyrics: Lyric[]): LyricLine[] {
  const lines: LyricLine[] = [];
  let currentWords: Lyric[] = [];

  for (const l of lyrics) {
    currentWords.push(l);
    // Line break: word ends with "+" or doesn't end with "-"
    const isLineBreak = l.w.endsWith('+');
    const isContinuation = l.w.endsWith('-');

    if (isLineBreak || (!isContinuation && currentWords.length > 0)) {
      // Check if next word would be a new line
      // Simple heuristic: break on "+" or after significant pause
      if (isLineBreak) {
        const text = currentWords.map(w => w.w.replace(/[-+]$/, '')).join('');
        lines.push({
          words: [...currentWords],
          startTime: currentWords[0].t,
          endTime: currentWords[currentWords.length - 1].t + currentWords[currentWords.length - 1].d,
          text,
        });
        currentWords = [];
      }
    }
  }

  // Flush remaining
  if (currentWords.length > 0) {
    const text = currentWords.map(w => w.w.replace(/[-+]$/, '')).join(' ');
    lines.push({
      words: [...currentWords],
      startTime: currentWords[0].t,
      endTime: currentWords[currentWords.length - 1].t + currentWords[currentWords.length - 1].d,
      text,
    });
  }

  return lines;
}

export function useLyricsOverlay(
  canvas: ShallowRef<HTMLCanvasElement | null>,
  bundle: ShallowRef<RenderBundle | null>,
) {
  let ctx: CanvasRenderingContext2D | null = null;
  let animFrame = 0;
  let cachedLines: LyricLine[] = [];
  let lastLyricCount = -1;

  function resize() {
    const c = canvas.value;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * window.devicePixelRatio;
    c.height = rect.height * window.devicePixelRatio;
    ctx = c.getContext('2d');
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function findCurrentLineIdx(now: number): number {
    for (let i = 0; i < cachedLines.length; i++) {
      if (now >= cachedLines[i].startTime && now <= cachedLines[i].endTime + 0.5) {
        return i;
      }
      if (cachedLines[i].startTime > now) {
        // Upcoming — show the previous line if close
        return Math.max(0, i - 1);
      }
    }
    return cachedLines.length - 1;
  }

  function drawLine(
    line: LyricLine,
    y: number,
    now: number,
    style: 'active' | 'prev' | 'next',
    canvasW: number,
  ) {
    if (!ctx) return;

    ctx.textAlign = 'center';

    if (style === 'active') {
      ctx.font = FONT_ACTIVE;
      // Karaoke highlighting: progress through words
      const fullText = line.text;
      const totalDur = line.endTime - line.startTime;
      const progress = totalDur > 0 ? Math.max(0, Math.min(1, (now - line.startTime) / totalDur)) : 0;

      // Draw background text
      ctx.fillStyle = COLOUR_ACTIVE;
      ctx.globalAlpha = 0.4;
      ctx.fillText(fullText, canvasW / 2, y);

      // Draw highlighted portion (progressive fill from left)
      ctx.globalAlpha = 1;
      ctx.save();
      const textW = ctx.measureText(fullText).width;
      const startX = canvasW / 2 - textW / 2;
      ctx.beginPath();
      ctx.rect(startX, y - 24, textW * progress, 30);
      ctx.clip();
      ctx.fillStyle = COLOUR_HIGHLIGHT;
      ctx.fillText(fullText, canvasW / 2, y);
      ctx.restore();
    } else {
      ctx.font = FONT_INACTIVE;
      ctx.fillStyle = style === 'prev' ? COLOUR_PREV : COLOUR_NEXT;
      ctx.globalAlpha = style === 'prev' ? 0.5 : 0.65;
      ctx.fillText(line.text, canvasW / 2, y);
    }

    ctx.globalAlpha = 1;
  }

  function render() {
    const c = canvas.value;
    const b = bundle.value;
    if (!c || !ctx || !b || !b.isReady) {
      animFrame = requestAnimationFrame(render);
      return;
    }

    // Only render if lyrics visible and present
    if (!b.lyricsVisible || !b.lyrics.length) {
      animFrame = requestAnimationFrame(render);
      return;
    }

    // Rebuild line cache if lyrics changed
    if (b.lyrics.length !== lastLyricCount) {
      cachedLines = buildLines(b.lyrics);
      lastLyricCount = b.lyrics.length;
    }

    if (!cachedLines.length) {
      animFrame = requestAnimationFrame(render);
      return;
    }

    const rect = c.getBoundingClientRect();
    // Only clear the bottom portion (lyrics area)
    const lyricsAreaTop = rect.height - BOTTOM_MARGIN - LINE_HEIGHT * 3;
    ctx.clearRect(0, lyricsAreaTop, rect.width, rect.height - lyricsAreaTop);

    const now = b.currentTime;
    const lineIdx = findCurrentLineIdx(now);
    const baseY = rect.height - BOTTOM_MARGIN;

    // Previous line
    if (lineIdx > 0) {
      drawLine(cachedLines[lineIdx - 1], baseY - LINE_HEIGHT * 2, now, 'prev', rect.width);
    }

    // Current line
    if (lineIdx >= 0 && lineIdx < cachedLines.length) {
      drawLine(cachedLines[lineIdx], baseY - LINE_HEIGHT, now, 'active', rect.width);
    }

    // Next line
    if (lineIdx + 1 < cachedLines.length) {
      drawLine(cachedLines[lineIdx + 1], baseY, now, 'next', rect.width);
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
