import type { Section, ChartNote, ChartChord } from '../types.js'

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface SectionResult {
  name: string
  startTime: number
  endTime: number
  totalNotes: number
  hitNotes: number
  score: number        // 0–100, live-updated
  grade: Grade | null  // null = not yet finalized
  isActive: boolean
}

// Must match HIT_AFTER in hitDetection.ts
const HIT_AFTER = 0.30

interface SectionEvent {
  t: number
  keys: string[]  // all hit keys that count as hitting this event (chord = multiple)
}

function gradeFor(score: number, totalNotes: number): Grade {
  if (totalNotes === 0) return 'S'
  if (score >= 95) return 'S'
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

export class SectionScorer {
  private _sections: SectionResult[] = []
  private _hitKeys: Set<string>[] = []
  private _events: SectionEvent[][] = []
  private _nextUnprocessed: number[] = []

  private _combo = 0
  private _maxCombo = 0
  private _prevTime = -1
  private _dirty = false

  get combo(): number { return this._combo }
  get maxCombo(): number { return this._maxCombo }

  init(
    sections: Section[],
    notes: ChartNote[],
    chords: ChartChord[],
    duration: number,
  ): void {
    this._sections = []
    this._hitKeys = []
    this._events = []
    this._nextUnprocessed = []
    this._combo = 0
    this._maxCombo = 0
    this._prevTime = -1
    this._dirty = false
    if (!sections.length) return

    const sorted = [...sections].sort((a, b) => a.time - b.time)

    for (let i = 0; i < sorted.length; i++) {
      const start = sorted[i].time
      const end = i + 1 < sorted.length ? sorted[i + 1].time : (duration > 0 ? duration : Infinity)

      const sNotes  = notes.filter(n => n.t >= start && n.t < end)
      const sChords = chords.filter(c => c.t >= start && c.t < end)

      // Build event list for miss detection
      const events: SectionEvent[] = []
      for (const n of sNotes) {
        events.push({ t: n.t, keys: [`${n.t}_${n.s}_${n.f}`] })
      }
      for (const c of sChords) {
        const keys = ((c as any).notes ?? []).map((cn: any) => `${c.t}_${cn.s}_${cn.f}`)
        if (keys.length) events.push({ t: c.t, keys })
      }
      events.sort((a, b) => a.t - b.t)

      this._sections.push({
        name: sorted[i].name,
        startTime: start,
        endTime: end,
        totalNotes: sNotes.length + sChords.length,
        hitNotes: 0,
        score: 0,
        grade: null,
        isActive: false,
      })
      this._hitKeys.push(new Set())
      this._events.push(events)
      this._nextUnprocessed.push(0)
    }
  }

  /** Called by HitDetector on each unique new hit. */
  recordHit(noteKey: string, noteTime: number): void {
    const idx = this._indexOf(noteTime)
    if (idx < 0) return
    const keys = this._hitKeys[idx]
    if (keys.has(noteKey)) return
    keys.add(noteKey)
    const s = this._sections[idx]
    s.hitNotes++
    s.score = s.totalNotes > 0 ? Math.round((s.hitNotes / s.totalNotes) * 100) : 100
    this._dirty = true
    this._combo++
    if (this._combo > this._maxCombo) this._maxCombo = this._combo
  }

  /** Called every frame. Returns true if the combo just broke (for UI feedback). */
  tick(time: number): boolean {
    const firstTick = this._prevTime < 0
    let comboBroke = false

    // Miss detection — advance per-section cursor through expired event windows.
    // O(new_expirations) amortised instead of O(total_events) per frame.
    for (let si = 0; si < this._sections.length; si++) {
      const events = this._events[si]
      let ei = this._nextUnprocessed[si]

      if (firstTick) {
        // On first tick after init/seek: fast-forward past already-expired events
        // without penalising them (player may have started mid-song).
        while (ei < events.length && events[ei].t + HIT_AFTER < time) ei++
        this._nextUnprocessed[si] = ei
        continue
      }

      while (ei < events.length) {
        const windowEnd = events[ei].t + HIT_AFTER
        if (windowEnd >= time) break
        const hit = events[ei].keys.some(k => this._hitKeys[si].has(k))
        if (!hit && this._combo > 0) {
          this._combo = 0
          comboBroke = true
          this._dirty = true
        }
        ei++
      }
      this._nextUnprocessed[si] = ei
    }

    this._prevTime = time

    // Section transitions — mark dirty on any state change
    const idx = this._indexOf(time)
    for (let i = 0; i < this._sections.length; i++) {
      const s = this._sections[i]
      const shouldBeActive = i === idx
      if (s.isActive && !shouldBeActive && s.grade === null) {
        s.grade = gradeFor(s.score, s.totalNotes)
        this._dirty = true
      }
      if (s.isActive !== shouldBeActive) {
        s.isActive = shouldBeActive
        this._dirty = true
      }
    }

    return comboBroke
  }

  /** Returns true if any section data changed since the last call. */
  consumeDirty(): boolean {
    const d = this._dirty
    this._dirty = false
    return d
  }

  onSeek(toTime: number): void {
    const clearFrom = Math.max(0, this._indexOf(toTime))
    for (let i = clearFrom; i < this._sections.length; i++) {
      const s = this._sections[i]
      s.hitNotes = 0
      s.score = 0
      s.grade = null
      s.isActive = false
      this._hitKeys[i].clear()
      // Advance cursor past events that expired before the seek point
      let ei = 0
      const events = this._events[i]
      while (ei < events.length && events[ei].t + HIT_AFTER < toTime) ei++
      this._nextUnprocessed[i] = ei
    }
    this._combo = 0
    this._prevTime = -1
    this._dirty = true
  }

  getResults(): readonly SectionResult[] { return this._sections }
  getCurrentIndex(time: number): number { return this._indexOf(time) }
  hasSections(): boolean { return this._sections.length > 0 }

  reset(): void {
    this._sections = []
    this._hitKeys = []
    this._events = []
    this._nextUnprocessed = []
    this._combo = 0
    this._maxCombo = 0
    this._prevTime = -1
    this._dirty = false
  }

  private _indexOf(time: number): number {
    for (let i = this._sections.length - 1; i >= 0; i--) {
      if (time >= this._sections[i].startTime) return i
    }
    return -1
  }
}
