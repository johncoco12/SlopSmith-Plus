import type { HighwayApi } from '../types.js'

const LS_PLAY_ENABLED    = 'pitch_yin.playEnabled'
const LS_PLAY_TOLERANCE  = 'pitch_yin.playTolerance'
const LS_INPUT_LATENCY   = 'pitch_yin.inputLatencyMs'
const LS_DEBUG_HITMAP    = 'pitch_yin.debugHitMap'
const TOLERANCE_DEFAULT  = 50
const HIT_BEFORE         = 0.18
const HIT_AFTER          = 0.30
const HIT_FADE_MS        = 500

const BASE_GUITAR6 = [40, 45, 50, 55, 59, 64]
const BASE_GUITAR7 = [35, 40, 45, 50, 55, 59, 64]
const BASE_BASS4   = [28, 33, 38, 43]
const BASE_BASS5   = [23, 28, 33, 38, 43]

function _baseMidis(stringCount: number, arrangement: string): number[] {
  const isBass = /bass/i.test(arrangement ?? '')
  if (isBass && stringCount === 5) return BASE_BASS5
  if (isBass)                      return BASE_BASS4
  if (stringCount === 7)           return BASE_GUITAR7
  return BASE_GUITAR6.slice(0, Math.min(stringCount, 6))
}

function _noteHz(s: number, f: number, songInfo: Record<string, any>): number {
  const sc = songInfo?.stringCount ?? (songInfo?.tuning?.length ?? 6)
  const bases = _baseMidis(sc, songInfo?.arrangement ?? '')
  if (s < 0 || s >= bases.length) return 0
  const tuning = songInfo?.tuning ?? []
  const capo   = songInfo?.capo ?? 0
  const midi   = bases[s] + (tuning[s] ?? 0) + capo + f
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function _centsDiff(hz: number, refHz: number): number {
  if (refHz <= 0 || hz <= 0) return Infinity
  return Math.abs(1200 * Math.log2(hz / refHz))
}

export class HitDetector {
  private _hitMap = new Map<string, { at: number }>()

  private _lastHitAccuracyMs = 0
  private _lastHitAt = 0
  private _lastMatchHz = 0

  private hw: HighwayApi

  private _boundDraw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void
  private _boundOnPitch: (e: any) => void
  private _boundOnReady: () => void
  private _boundStateProvider: (note: any, chartTime: number) => { state: string; alpha: number } | null

  constructor(hw: HighwayApi) {
    this.hw = hw
    this._boundDraw = this._drawDebug.bind(this)
    this._boundOnPitch = this._onPitch.bind(this)
    this._boundOnReady = this._onSongReady.bind(this)
    this._boundStateProvider = this._noteStateProvider.bind(this)
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  setup(): void {
    this.hw.setNoteStateProvider?.(this._boundStateProvider as any)
    this.hw.addDrawHook?.(this._boundDraw)
    this._listen(true)
    this._dumpSongData()
  }

  teardown(): void {
    this.hw.setNoteStateProvider?.(null)
    this.hw.removeDrawHook?.(this._boundDraw)
    this._listen(false)
    this._hitMap.clear()
  }

  private _listen(on: boolean): void {
    const sw = (window as any).slopsmith
    if (!sw?.on || !sw?.off) return
    if (on) {
      sw.on('pitch:detected', this._boundOnPitch)
      sw.on('song:ready', this._boundOnReady)
    } else {
      sw.off('pitch:detected', this._boundOnPitch)
      sw.off('song:ready', this._boundOnReady)
    }
  }

  // ── Pitch event handler ──────────────────────────────────────────────────

  private _onPitch(e: any): void {
    const hz = e?.hz ?? e?.detail?.hz ?? 0
    if (hz <= 0) return
    if (localStorage.getItem(LS_PLAY_ENABLED) === 'false') return

    const inputLatencyMs = parseFloat(localStorage.getItem(LS_INPUT_LATENCY)!) || 0
    const now      = (this.hw.getTime?.() ?? 0) - inputLatencyMs / 1000
    const songInfo = this.hw.getSongInfo?.() ?? {}
    const tolerance = parseFloat(localStorage.getItem(LS_PLAY_TOLERANCE)!) || TOLERANCE_DEFAULT
    const perf     = performance.now()

    const _try = (n: any, t: number): void => {
      const dt = t - now
      if (dt < -HIT_BEFORE || dt > HIT_AFTER) return
      const refHz = _noteHz(n.s, n.f, songInfo)
      if (refHz <= 0) return
      if (_centsDiff(hz, refHz) <= tolerance) {
        this._hitMap.set(`${t}_${n.s}_${n.f}`, { at: perf })
        this._lastHitAccuracyMs = -Math.round(dt * 1000)
        this._lastHitAt = perf
        this._lastMatchHz = refHz
      }
    }

    for (const n of (this.hw.getNotes?.() ?? [])) _try(n, n.t)
    for (const ch of (this.hw.getChords?.() ?? [])) {
      for (const n of (ch.notes ?? [])) _try(n, ch.t)
    }
  }

  // ── Note state provider ──────────────────────────────────────────────────

  private _noteStateProvider(note: any, chartTime: number): { state: string; alpha: number } | null {
    const key = `${chartTime}_${note.s}_${note.f}`
    const entry = this._hitMap.get(key)
    if (!entry) return null
    const elapsed = performance.now() - entry.at
    if (elapsed >= HIT_FADE_MS) {
      this._hitMap.delete(key)
      return null
    }
    const alpha = 1 - elapsed / HIT_FADE_MS
    return { state: (note.sus ?? 0) > 0.3 ? 'active' : 'hit', alpha }
  }

  // ── Debug draw hook ──────────────────────────────────────────────────────

  private _drawDebug(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (localStorage.getItem(LS_DEBUG_HITMAP) !== 'true') return

    const now = this.hw.getTime?.() ?? 0
    const entries = this.getHitMapEntries()

    if (!entries.length) return

    ctx.save()
    const STRING_COLORS = ['#e04040', '#40e040', '#4040e0', '#e0e040', '#e040e0', '#40e0e0', '#e08040']
    for (const entry of entries) {
      const tOff = entry.time - now
      const p = (this.hw as any).project?.(tOff)
      if (!p) continue

      const x = (this.hw as any).fretX?.(entry.fret, p.scale, W) ?? W / 2
      const y = p.y * H
      const alpha = Math.max(0.15, 1 - entry.age / HIT_FADE_MS)

      ctx.globalAlpha = alpha
      const color = STRING_COLORS[entry.string] ?? '#ffffff'

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      const sz = 6
      ctx.beginPath()
      ctx.moveTo(x - sz, y - sz)
      ctx.lineTo(x + sz, y + sz)
      ctx.moveTo(x + sz, y - sz)
      ctx.lineTo(x - sz, y + sz)
      ctx.stroke()

      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = color
      ctx.font = `${Math.max(8, 10)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`${entry.fret}`, x, y - 12)
    }
    ctx.restore()

    ctx.save()
    ctx.fillStyle = 'rgba(255,200,100,0.7)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`hitMap: ${entries.length}`, 4, H - 4)
    ctx.restore()
  }

  // ── Song data dump ───────────────────────────────────────────────────────

  private _onSongReady(): void {
    this._dumpSongData()
  }

  private _dumpSongData(): void {
    const detectorNotes  = this.hw.getNotes?.()  ?? []
    const detectorChords = this.hw.getChords?.() ?? []

    let renderNotes  = detectorNotes
    let renderChords = detectorChords
    try {
      const flt = (this.hw as any).filter
      if (flt?.getFiltered) {
        const f = flt.getFiltered()
        if (f?.notes)  renderNotes  = f.notes
        if (f?.chords) renderChords = f.chords
      }
    } catch {}

    console.group(`[hit] === Song Load ===`)
    console.log(`detector: ${detectorNotes.length} notes, ${detectorChords.length} chords`)
    console.log(`renderer: ${renderNotes.length} notes, ${renderChords.length} chords`)
    console.log(`match: ${detectorNotes.length === renderNotes.length && detectorChords.length === renderChords.length}`)

    if (detectorNotes.length !== renderNotes.length || detectorChords.length !== renderChords.length) {
      console.warn('⚠ detector vs renderer counts differ — mastery filter active')
    }

    const snip = (arr: any[], n = 5) =>
      arr.slice(0, n).map((x: any) => `t=${x.t} s${(x.s ?? 0) + 1} f${x.f}`).join(', ')

    console.log(`detector notes (first 5): ${snip(detectorNotes)}`)
    console.log(`renderer notes (first 5): ${snip(renderNotes)}`)

    if (detectorNotes.length <= 50) {
      console.log('all detector notes:', detectorNotes.map((n: any) => `(${n.t.toFixed(3)},${n.s},${n.f})`).join(' '))
    }
    if (renderNotes.length <= 50 && renderNotes !== detectorNotes) {
      console.log('all renderer notes:', renderNotes.map((n: any) => `(${n.t.toFixed(3)},${n.s},${n.f})`).join(' '))
    }
    console.groupEnd()
  }

  // ── Public debug API ─────────────────────────────────────────────────────

  getLastHitAccuracy(): { ms: number; age: number } | null {
    const age = performance.now() - this._lastHitAt
    if (age > 2000) return null
    return { ms: this._lastHitAccuracyMs, age }
  }

  getLastMatchHz(): number { return this._lastMatchHz }

  getHitMapEntries(): Array<{ time: number; string: number; fret: number; age: number }> {
    const now = performance.now()
    const entries: Array<{ time: number; string: number; fret: number; age: number }> = []
    for (const [key, val] of this._hitMap) {
      const age = now - val.at
      if (age >= HIT_FADE_MS) {
        this._hitMap.delete(key)
        continue
      }
      const parts = key.split('_')
      if (parts.length === 3) {
        entries.push({
          time: parseFloat(parts[0]),
          string: parseInt(parts[1]),
          fret: parseInt(parts[2]),
          age,
        })
      }
    }
    return entries
  }

  dumpHitDebug(): void {
    const now      = this.hw.getTime?.() ?? 0
    const songInfo = this.hw.getSongInfo?.() ?? {}
    const notes    = this.hw.getNotes?.() ?? []
    const chords   = this.hw.getChords?.() ?? []

    console.group(`[hit] now=${now.toFixed(3)}s  window=[${-HIT_BEFORE * 1000},+${HIT_AFTER * 1000}]ms`)

    const windowed: Array<{ t: number; s: number; f: number; refHz: number; key: string; inHitMap: boolean }> = []

    for (const n of notes) {
      const dt = n.t - now
      if (dt < -HIT_BEFORE || dt > HIT_AFTER) continue
      const refHz = _noteHz(n.s, n.f, songInfo)
      const key = `${n.t}_${n.s}_${n.f}`
      windowed.push({ t: n.t, s: n.s, f: n.f, refHz, key, inHitMap: this._hitMap.has(key) })
    }
    for (const ch of chords) {
      for (const cn of ch.notes ?? []) {
        const dt = ch.t - now
        if (dt < -HIT_BEFORE || dt > HIT_AFTER) continue
        const refHz = _noteHz(cn.s, cn.f, songInfo)
        const key = `${ch.t}_${cn.s}_${cn.f}`
        windowed.push({ t: ch.t, s: cn.s, f: cn.f, refHz, key, inHitMap: this._hitMap.has(key) })
      }
    }
    windowed.sort((a, b) => a.t - b.t)

    console.log(`windowed notes: ${windowed.length}`)
    for (const w of windowed) {
      console.log(`  ${w.inHitMap ? '✓' : '✗'} t=${w.t.toFixed(3)} s${w.s + 1} f${w.f}  ${w.refHz.toFixed(1)}Hz  ${w.key}`)
    }

    const hm = this.getHitMapEntries()
    const extra = hm.filter(e => !windowed.some(w => w.key === `${e.time}_${e.string}_${e.fret}`))
    if (extra.length) {
      console.log(`extra hitMap (no matching note): ${extra.length}`)
      for (const e of extra) {
        console.log(`  ? t=${e.time.toFixed(3)} s${e.string + 1} f${e.fret} age=${e.age.toFixed(0)}ms`)
      }
    }
    console.groupEnd()
  }
}
