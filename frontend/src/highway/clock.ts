// Monotonic interpolated chart clock.
//
// audio.currentTime updates ~every 23ms in Chrome/Firefox — much coarser than
// a 60fps frame. Between updates we interpolate forward using performance.now()
// so plugins and the renderer see a smooth sub-frame clock. When audio is
// paused (setTime keeps receiving the same value), we return raw chartTime
// instead of drifting forward.

const MAX_INTERP_MS = 100;

export class ChartClock {
  private chartTime = 0;
  private currentTime = 0;      // chartTime + avOffsetSec
  private avOffsetSec = 0;
  private songOffset = 0;

  private anchorAudioT = NaN;
  private anchorPerfNow = NaN;
  private lastAdvanceAt = 0;
  private observedRate = 1;

  /** Apply the per-song chart offset (loose-folder format). */
  setSongOffset(offset: number): void {
    this.songOffset = Number.isFinite(offset) ? offset : 0;
  }

  /** Called every audio tick (audio.currentTime). */
  setTime(audioT: number): void {
    this.chartTime = audioT + this.songOffset;
    this.currentTime = this.chartTime + this.avOffsetSec;

    if (audioT !== this.anchorAudioT) {
      const now = performance.now();
      const hadPrior = !Number.isNaN(this.anchorPerfNow);
      const dPerf = hadPrior ? (now - this.anchorPerfNow) / 1000 : 0;

      if (hadPrior && dPerf > 0.001 && dPerf < 0.5) {
        const observed = (audioT - this.anchorAudioT) / dPerf;
        this.observedRate = (observed > 0.05 && observed < 5) ? observed : 1;
      } else if (hadPrior && dPerf >= 0.5) {
        this.observedRate = 1;
      }

      this.anchorAudioT = audioT;
      this.anchorPerfNow = now;
      this.lastAdvanceAt = now;
    }
  }

  setAvOffset(ms: number): void {
    this.avOffsetSec = (Number(ms) || 0) / 1000;
    this.currentTime = this.chartTime + this.avOffsetSec;
  }

  getAvOffset(): number {
    return this.avOffsetSec * 1000;
  }

  /** Smooth interpolated chart time (chart-aligned, includes songOffset). */
  getTime(): number {
    if (Number.isNaN(this.anchorPerfNow)) return this.chartTime;
    const nowP = performance.now();
    if (nowP - this.lastAdvanceAt > MAX_INTERP_MS) return this.chartTime;
    const elapsedMs = nowP - this.anchorPerfNow;
    if (elapsedMs > MAX_INTERP_MS) return this.chartTime;
    return this.anchorAudioT + (this.observedRate * elapsedMs) / 1000 + this.songOffset;
  }

  /** Render-aligned time (chartTime + avOffset). Used by draw code. */
  getCurrentTime(): number {
    return this.currentTime;
  }

  reset(): void {
    this.chartTime = 0;
    this.currentTime = 0;
    this.anchorAudioT = NaN;
    this.anchorPerfNow = NaN;
    this.lastAdvanceAt = 0;
    this.observedRate = 1;
    this.songOffset = 0;
  }
}
