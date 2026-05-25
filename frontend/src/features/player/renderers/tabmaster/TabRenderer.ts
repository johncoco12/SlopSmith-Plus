// Classic tab viewer — page-style guitar tablature.
// Notes displayed as fret numbers on string lines, laid out in evenly-spaced
// columns grouped into measures. Rows wrap like text. Playback cursor tracks
// position. Hit notes glow.

import type { CanvasRenderer, RenderBundle, ChartNote, ChartChord, NoteState, Beat } from '@/features/player/types'

// ── Theme ────────────────────────────────────────────────────────────────────

const BG = '#0e0e16'
const STAFF_LINE = 'rgba(255,255,255,0.15)'
const BAR_LINE = 'rgba(255,255,255,0.4)'
const FRET_COLOR = '#e2e8f0'
const FRET_PAST = 'rgba(255,255,255,0.25)'
const LABEL_COLOR = 'rgba(255,255,255,0.5)'
const CURSOR_COLOR = 'rgba(99,102,241,0.85)'
const CURSOR_BG = 'rgba(99,102,241,0.08)'
const HIT_COLOR = '#4ade80'
const MISS_COLOR = '#f87171'
const ACTIVE_COLOR = '#fbbf24'
const SECTION_COLOR = '#a5b4fc'
const TECHNIQUE_COLOR = 'rgba(147,197,253,0.8)'

const STRING_LABELS: Record<number, string[]> = {
  4: ['G', 'D', 'A', 'E'],
  5: ['G', 'D', 'A', 'E', 'B'],
  6: ['e', 'B', 'G', 'D', 'A', 'E'],
  7: ['e', 'B', 'G', 'D', 'A', 'E', 'B'],
  8: ['e', 'B', 'G', 'D', 'A', 'E', 'B', 'F♯'],
}

// ── Internal types ───────────────────────────────────────────────────────────

interface SlotNote {
  t: number
  s: number
  f: number
  sus?: number
  ho?: boolean
  po?: boolean
  sl?: number
  bn?: number
  hm?: boolean
  pm?: boolean
  tp?: boolean
  original: ChartNote
}

interface Slot {
  time: number
  notes: SlotNote[]  // notes at this time position (one per string max)
  isMeasureStart: boolean
  sectionName?: string
}

interface Row {
  slots: Slot[]
  x: number
  y: number
}

export class TabRenderer implements CanvasRenderer {
  readonly contextType = '2d' as const

  private ctx: CanvasRenderingContext2D | null = null
  private W = 0
  private H = 0

  // Cached layout
  private slots: Slot[] = []
  private lastBuildKey = ''
  private hitGlows = new Map<string, number>()

  init(canvas: HTMLCanvasElement): void {
    this.ctx = canvas.getContext('2d')
  }

  resize(w: number, h: number): void {
    this.W = w
    this.H = h
  }

  destroy(): void {
    this.ctx = null
    this.slots = []
    this.hitGlows.clear()
  }

  draw(bundle: RenderBundle): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const W = (ctx.canvas as HTMLCanvasElement).width
    const H = (ctx.canvas as HTMLCanvasElement).height
    this.W = W
    this.H = H

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    if (!bundle.isReady) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '14px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Loading…', W / 2, H / 2)
      return
    }

    const { currentTime, notes, chords, stringCount, beats, sections } = bundle
    const numStrings = stringCount || 6

    // ── Build slots (cached) ──────────────────────────────────────────────
    const buildKey = `${notes.length}_${chords.length}_${beats.length}`
    if (buildKey !== this.lastBuildKey) {
      this.slots = this.buildSlots(notes, chords, beats, sections)
      this.lastBuildKey = buildKey
    }
    const slots = this.slots
    if (slots.length === 0) return

    // ── Layout constants ──────────────────────────────────────────────────
    const fontSize = Math.max(18, Math.min(28, W / 40))
    const lineH = Math.round(fontSize * 2.0)         // vertical space between strings
    const slotW = Math.max(36, Math.min(56, W / 20)) // horizontal space per note column
    const staffH = lineH * (numStrings - 1)
    const rowGap = 56                                // gap between tab rows
    const rowFullH = staffH + rowGap
    const labelW = 44                                // left margin for string labels
    const padRight = 16
    const padTop = 20
    const usableW = W - labelW - padRight

    // How many slots fit per row
    const slotsPerRow = Math.max(4, Math.floor(usableW / slotW))

    // ── Build rows ────────────────────────────────────────────────────────
    const rows: Row[] = []
    for (let i = 0; i < slots.length; i += slotsPerRow) {
      const chunk = slots.slice(i, i + slotsPerRow)
      rows.push({
        slots: chunk,
        x: labelW,
        y: padTop + rows.length * rowFullH,
      })
    }

    // ── Find current slot index ───────────────────────────────────────────
    let curSlotIdx = 0
    for (let i = 0; i < slots.length; i++) {
      if (currentTime >= slots[i].time) curSlotIdx = i
    }
    const curRowIdx = Math.floor(curSlotIdx / slotsPerRow)

    // ── Scroll: keep current row visible ──────────────────────────────────
    const visibleRows = Math.max(1, Math.floor((H - padTop) / rowFullH))
    let scrollRow = Math.max(0, curRowIdx - Math.floor(visibleRows * 0.4))
    if (scrollRow + visibleRows > rows.length) {
      scrollRow = Math.max(0, rows.length - visibleRows)
    }
    const scrollY = scrollRow * rowFullH

    // ── Draw visible rows ─────────────────────────────────────────────────
    ctx.save()
    ctx.translate(0, -scrollY)

    const strLabels = STRING_LABELS[numStrings] ?? STRING_LABELS[6]!

    for (let ri = scrollRow; ri < Math.min(rows.length, scrollRow + visibleRows + 1); ri++) {
      const row = rows[ri]
      const baseY = row.y

      // Don't draw if off-screen
      if (baseY - scrollY > H + rowFullH) break
      if (baseY - scrollY + rowFullH < -rowFullH) continue

      // ── String labels ─────────────────────────────────────────────────
      ctx.font = `bold ${fontSize * 0.8}px monospace`
      ctx.fillStyle = LABEL_COLOR
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let s = 0; s < numStrings; s++) {
        ctx.fillText(strLabels[s] ?? `${s + 1}`, labelW - 20, baseY + s * lineH)
      }

      // ── Staff lines ───────────────────────────────────────────────────
      ctx.strokeStyle = STAFF_LINE
      ctx.lineWidth = 1.5
      for (let s = 0; s < numStrings; s++) {
        const y = baseY + s * lineH
        ctx.beginPath()
        ctx.moveTo(labelW - 6, y)
        ctx.lineTo(labelW + row.slots.length * slotW + 6, y)
        ctx.stroke()
      }

      // ── Bar lines + section names + notes ─────────────────────────────
      ctx.font = `bold ${fontSize}px 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (let si = 0; si < row.slots.length; si++) {
        const slot = row.slots[si]
        const sx = labelW + si * slotW + slotW / 2

        // Bar line
        if (slot.isMeasureStart) {
          ctx.strokeStyle = BAR_LINE
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(sx - slotW / 2, baseY - 6)
          ctx.lineTo(sx - slotW / 2, baseY + staffH + 6)
          ctx.stroke()
        }

        // Section name
        if (slot.sectionName) {
          ctx.font = `bold ${fontSize * 0.6}px system-ui, sans-serif`
          ctx.fillStyle = SECTION_COLOR
          ctx.textAlign = 'left'
          ctx.fillText(slot.sectionName, sx - slotW / 2 + 2, baseY - 20)
          ctx.textAlign = 'center'
          ctx.font = `bold ${fontSize}px 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace`
        }

        // ── Cursor highlight on current slot ────────────────────────────
        const globalIdx = ri * slotsPerRow + si
        if (globalIdx === curSlotIdx) {
          ctx.fillStyle = CURSOR_BG
          ctx.fillRect(sx - slotW / 2, baseY - 10, slotW, staffH + 20)
          ctx.strokeStyle = CURSOR_COLOR
          ctx.lineWidth = 2.5
          ctx.strokeRect(sx - slotW / 2, baseY - 10, slotW, staffH + 20)
        }

        // ── Draw notes in this slot ─────────────────────────────────────
        for (const note of slot.notes) {
          const ny = baseY + note.s * lineH
          const fretStr = String(note.f)
          const noteState = bundle.getNoteState(note.original, currentTime)
          const noteKey = `${note.t.toFixed(3)}_${note.s}`

          // Track hit glow
          if (noteState?.state === 'hit' && !this.hitGlows.has(noteKey)) {
            this.hitGlows.set(noteKey, currentTime)
          }

          // Glow effect for recently hit notes
          const hitT = this.hitGlows.get(noteKey)
          if (hitT != null) {
            const age = currentTime - hitT
            if (age < 0.5) {
              const alpha = (1 - age / 0.5) * 0.4
              ctx.shadowColor = HIT_COLOR
              ctx.shadowBlur = 10 * (1 - age / 0.5)
              ctx.fillStyle = `rgba(74,222,128,${alpha})`
              ctx.beginPath()
              ctx.arc(sx, ny, lineH * 0.55, 0, Math.PI * 2)
              ctx.fill()
              ctx.shadowBlur = 0
            }
          }

          // Background to mask staff line
          const tw = ctx.measureText(fretStr).width + 8
          ctx.fillStyle = BG
          ctx.fillRect(sx - tw / 2, ny - lineH * 0.42, tw, lineH * 0.84)

          // Note color
          if (noteState?.state === 'hit') {
            ctx.fillStyle = HIT_COLOR
          } else if (noteState?.state === 'miss') {
            ctx.fillStyle = MISS_COLOR
          } else if (noteState?.state === 'active') {
            ctx.fillStyle = ACTIVE_COLOR
          } else if (note.t < currentTime) {
            ctx.fillStyle = FRET_PAST
          } else {
            ctx.fillStyle = FRET_COLOR
          }

          ctx.fillText(fretStr, sx, ny)

          // Technique annotation
          const tech = this.getTechnique(note)
          if (tech) {
            ctx.font = `${fontSize * 0.55}px monospace`
            ctx.fillStyle = TECHNIQUE_COLOR
            ctx.fillText(tech, sx, ny - lineH * 0.52)
            ctx.font = `bold ${fontSize}px 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace`
          }
        }

        // ── Draw dashes for strings with no note in this slot ────────────
        // Only if slot has at least one note (so it's a "played" column)
        if (slot.notes.length > 0 && slot.notes.length < numStrings) {
          // Draw dashes on empty strings to indicate they're not played
          const occupiedStrings = new Set(slot.notes.map(n => n.s))
          ctx.fillStyle = 'rgba(255,255,255,0.06)'
          ctx.font = `${fontSize * 0.9}px monospace`
          for (let s = 0; s < numStrings; s++) {
            if (!occupiedStrings.has(s)) {
              ctx.fillText('–', sx, baseY + s * lineH)
            }
          }
          ctx.font = `bold ${fontSize}px 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace`
        }
      }

      // ── Closing bar line ──────────────────────────────────────────────
      const endX = labelW + row.slots.length * slotW
      ctx.strokeStyle = BAR_LINE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(endX, baseY - 6)
      ctx.lineTo(endX, baseY + staffH + 6)
      ctx.stroke()
    }

    ctx.restore()

    // ── Footer info ───────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, H - 32, W, 32)
    ctx.font = '13px monospace'
    ctx.fillStyle = LABEL_COLOR
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.fmtTime(currentTime), 12, H - 16)
    ctx.textAlign = 'right'
    const meas = this.getMeasureNumber(curSlotIdx, slots)
    ctx.fillText(meas, W - 12, H - 16)
  }

  // ── Build note slots ──────────────────────────────────────────────────────

  private buildSlots(
    notes: ChartNote[],
    chords: ChartChord[],
    beats: Beat[],
    sections: { time: number; name: string }[],
  ): Slot[] {
    // Flatten all notes
    const allNotes: SlotNote[] = []
    for (const n of notes) {
      allNotes.push({ t: n.t, s: n.s, f: n.f, sus: n.sus, ho: n.ho, po: n.po, sl: n.sl, bn: n.bn, hm: n.hm, pm: n.pm, tp: n.tp, original: n })
    }
    for (const chord of chords) {
      for (const cn of chord.notes) {
        allNotes.push({ t: chord.t, s: cn.s, f: cn.f, sus: cn.sus, ho: cn.ho, po: cn.po, sl: cn.sl, bn: cn.bn, hm: cn.hm, pm: cn.pm, tp: cn.tp, original: cn as unknown as ChartNote })
      }
    }
    allNotes.sort((a, b) => a.t - b.t || a.s - b.s)

    if (allNotes.length === 0) return []

    // Gather measure start times
    const measureStarts = new Set<number>()
    for (const b of beats) {
      if (b.measure >= 0) measureStarts.add(b.time)
    }

    // Section map
    const sectionAt = new Map<number, string>()
    for (const s of sections) sectionAt.set(s.time, s.name)

    // Group notes by unique time (quantized to ~10ms to avoid duplicates)
    const QUANT = 0.015
    const slots: Slot[] = []
    let i = 0
    while (i < allNotes.length) {
      const t = allNotes[i].t
      const slotNotes: SlotNote[] = []

      // Collect all notes at approximately the same time
      while (i < allNotes.length && Math.abs(allNotes[i].t - t) < QUANT) {
        slotNotes.push(allNotes[i])
        i++
      }

      // Check if this is at a measure boundary
      let isMeasureStart = false
      for (const ms of measureStarts) {
        if (Math.abs(ms - t) < QUANT * 2) {
          isMeasureStart = true
          break
        }
      }

      // Also insert a measure-start slot if there's a measure boundary between
      // the last slot's time and this one
      if (slots.length > 0) {
        const prevT = slots[slots.length - 1].time
        for (const ms of measureStarts) {
          if (ms > prevT + QUANT && ms < t - QUANT) {
            // Insert an empty bar-line slot
            const secName = this.findSection(ms, sections)
            slots.push({ time: ms, notes: [], isMeasureStart: true, sectionName: secName })
          }
        }
      }

      const secName = this.findSection(t, sections)
      slots.push({
        time: t,
        notes: slotNotes,
        isMeasureStart: isMeasureStart || slots.length === 0,
        sectionName: secName,
      })
    }

    return slots
  }

  private findSection(time: number, sections: { time: number; name: string }[]): string | undefined {
    for (const s of sections) {
      if (Math.abs(s.time - time) < 0.05) return s.name
    }
    return undefined
  }

  private getTechnique(note: SlotNote): string | null {
    if (note.ho) return 'h'
    if (note.po) return 'p'
    if (note.sl && note.sl > 0) return '/'
    if (note.bn) return 'b'
    if (note.hm) return '◇'
    if (note.pm) return 'PM'
    if (note.tp) return 'T'
    return null
  }

  private getMeasureNumber(slotIdx: number, slots: Slot[]): string {
    let m = 0
    for (let i = 0; i <= slotIdx && i < slots.length; i++) {
      if (slots[i].isMeasureStart) m++
    }
    const total = slots.filter(s => s.isMeasureStart).length
    return `bar ${m}/${total}`
  }

  private fmtTime(t: number): string {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }
}
