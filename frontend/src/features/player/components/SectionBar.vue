<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { usePlayerStore } from '@/features/player/store'
import type { SectionResult, Grade } from '@/features/player/engine/sectionScorer'

const player = usePlayerStore()

const sections = computed(() => player.sectionResults as SectionResult[])

// ── Section geometry ──────────────────────────────────────────────────────

function sectionWidthPct(s: SectionResult): number {
  const dur = player.duration
  if (!dur) return 0
  const end = isFinite(s.endTime) ? Math.min(s.endTime, dur) : dur
  return Math.max(0, ((end - s.startTime) / dur) * 100)
}

function progressPct(s: SectionResult): number {
  const t = player.currentTime
  if (t <= s.startTime) return 0
  const end = isFinite(s.endTime) ? s.endTime : player.duration
  if (t >= end) return 100
  return ((t - s.startTime) / (end - s.startTime)) * 100
}

const GRADE_LABEL: Record<Grade, string> = { S: '★S', A: 'A', B: 'B', C: 'C', D: 'D' }

// ── Section-change flash & grade-reveal flash ─────────────────────────────

const activatingPill = ref(-1)
const gradedPill     = ref(-1)

// Section-completion particles — separate from combo particles, anchored to pill center
interface SectionParticle extends Particle { leftPct: number }
const sectionParticles = ref<SectionParticle[]>([])

const GRADE_COLORS: Record<Grade, string[]> = {
  S: ['#fbbf24','#fde68a','#f59e0b','#fef3c7'],
  A: ['#4ade80','#86efac','#22c55e'],
  B: ['#60a5fa','#93c5fd','#3b82f6'],
  C: ['#fb923c','#fed7aa','#f97316'],
  D: ['#f87171','#fca5a5','#ef4444'],
}

function pillCenterPct(s: SectionResult): number {
  const dur = player.duration
  if (!dur) return 50
  const end = isFinite(s.endTime) ? Math.min(s.endTime, dur) : dur
  return ((s.startTime + end) / 2 / dur) * 100
}

function triggerSectionBurst(leftPct: number, grade: Grade) {
  const colors = GRADE_COLORS[grade]
  const count  = grade === 'S' ? 16 : grade === 'A' ? 12 : 8
  const shapes: Particle['shape'][] = ['circle', 'rect', 'star']
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
    const dist  = grade === 'S' ? 30 + Math.random() * 50 : 18 + Math.random() * 32
    sectionParticles.value.push({
      id:    _pid++,
      tx:    Math.cos(angle) * dist,
      ty:    Math.sin(angle) * dist,
      color: colors[i % colors.length],
      size:  grade === 'S' ? 3 + Math.random() * 6 : 2 + Math.random() * 4,
      dur:   380 + Math.random() * 320,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      leftPct,
    })
  }
}

function removeSectionParticle(id: number) {
  const idx = sectionParticles.value.findIndex(p => p.id === id)
  if (idx !== -1) sectionParticles.value.splice(idx, 1)
}

watch(() => player.currentSectionIndex, (newIdx, oldIdx) => {
  if (newIdx >= 0 && newIdx !== oldIdx) {
    activatingPill.value = newIdx
    setTimeout(() => { if (activatingPill.value === newIdx) activatingPill.value = -1 }, 650)
  }
  if (oldIdx >= 0 && oldIdx !== newIdx) {
    gradedPill.value = oldIdx
    setTimeout(() => { if (gradedPill.value === oldIdx) gradedPill.value = -1 }, 900)
    // Burst particles from the completed pill's center
    const completed = sections.value[oldIdx]
    if (completed?.grade) triggerSectionBurst(pillCenterPct(completed), completed.grade)
  }
})

// ── Combo display ─────────────────────────────────────────────────────────

const combo = computed(() => player.combo)

// Per-hit bump on the combo number
const comboNumBumping = ref(false)
function bumpComboNum() {
  comboNumBumping.value = false
  nextTick(() => { comboNumBumping.value = true })
}

// Per-hit flash on the active section pill
const activePillHitting = ref(false)
function flashActivePill() {
  activePillHitting.value = false
  nextTick(() => { activePillHitting.value = true })
}

// Combo break flash
const comboBroken = ref(false)

type Milestone = { min: number; label: string; color: string; particles: string[] }
const MILESTONES: Milestone[] = [
  { min: 100, label: 'LEGENDARY',  color: '#fbbf24', particles: ['#fbbf24','#f472b6','#a78bfa','#34d399','#60a5fa'] },
  { min:  50, label: 'INSANE!!',   color: '#f59e0b', particles: ['#fbbf24','#fb923c','#fde68a'] },
  { min:  30, label: 'ON FIRE!',   color: '#fb923c', particles: ['#fb923c','#f97316','#fbbf24'] },
  { min:  20, label: 'GREAT!',     color: '#a78bfa', particles: ['#a78bfa','#c4b5fd','#7c3aed'] },
  { min:  10, label: 'NICE',       color: '#38bdf8', particles: ['#38bdf8','#7dd3fc','#0ea5e9'] },
  { min:   5, label: 'COMBO',      color: '#e2e8f0', particles: ['#e2e8f0','#94a3b8'] },
]

const activeMilestone = computed(() => MILESTONES.find(m => combo.value >= m.min) ?? null)
const comboVisible    = computed(() => combo.value >= 5)

// ── Particles ─────────────────────────────────────────────────────────────

interface Particle {
  id: number; tx: number; ty: number
  color: string; size: number; dur: number; shape: 'circle' | 'rect' | 'star'
}

let _pid = 0
const particles = ref<Particle[]>([])

function triggerBurst(milestone: Milestone) {
  const count  = 10 + (milestone.min >= 50 ? 8 : milestone.min >= 20 ? 4 : 0)
  const shapes: Particle['shape'][] = ['circle', 'rect', 'star']
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
    const dist  = 28 + Math.random() * 45
    particles.value.push({
      id: _pid++,
      tx: Math.cos(angle) * dist,   ty: Math.sin(angle) * dist,
      color: milestone.particles[i % milestone.particles.length],
      size: 3 + Math.random() * 5,  dur: 480 + Math.random() * 380,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    })
  }
}

function removeParticle(id: number) {
  const idx = particles.value.findIndex(p => p.id === id)
  if (idx !== -1) particles.value.splice(idx, 1)
}

function triggerHitSpark() {
  const colors = activeMilestone.value?.particles ?? ['#e2e8f0', '#94a3b8']
  for (let i = 0; i < 3; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist  = 10 + Math.random() * 16
    particles.value.push({
      id:    _pid++,
      tx:    Math.cos(angle) * dist,
      ty:    Math.sin(angle) * dist,
      color: colors[Math.floor(Math.random() * colors.length)],
      size:  1.5 + Math.random() * 2,
      dur:   200 + Math.random() * 120,
      shape: 'circle',
    })
  }
}

function triggerBreakBurst() {
  const colors = ['#f87171', '#fca5a5', '#ef4444']
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const dist  = 14 + Math.random() * 22
    particles.value.push({
      id:    _pid++,
      tx:    Math.cos(angle) * dist,
      ty:    Math.sin(angle) * dist,
      color: colors[i % colors.length],
      size:  2 + Math.random() * 3,
      dur:   280 + Math.random() * 180,
      shape: 'circle',
    })
  }
}

let _lastMilestoneMin = 0
watch(combo, (next, prev) => {
  if (next === 0) {
    _lastMilestoneMin = 0
    if (prev >= 5) {
      comboBroken.value = true
      setTimeout(() => { comboBroken.value = false }, 600)
      triggerBreakBurst()
    }
    return
  }
  if (next > prev) {
    if (next >= 5) {
      bumpComboNum()
      flashActivePill()
      triggerHitSpark()
    }
    for (const m of MILESTONES) {
      if (next >= m.min && prev < m.min && m.min > _lastMilestoneMin) {
        _lastMilestoneMin = m.min
        triggerBurst(m)
        break
      }
    }
    if (next >= 100 && next % 50 === 0 && prev < next) {
      _lastMilestoneMin = next
      triggerBurst(MILESTONES[0])
    }
  }
})
</script>

<template>
  <Transition name="bar" appear>
    <div
      v-if="sections.length > 0"
      class="section-bar absolute z-20 pointer-events-none select-none left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
    >
      <!-- ── Section pills ── -->
      <div class="pills-row relative flex gap-[3px] w-full">

        <!-- Section-completion particle bursts, anchored to each pill's center -->
        <div
          v-for="p in sectionParticles"
          :key="p.id"
          class="sect-particle absolute pointer-events-none"
          :class="`particle--${p.shape}`"
          :style="{
            '--tx': p.tx + 'px',
            '--ty': p.ty + 'px',
            left: p.leftPct + '%',
            top: '50%',
            background: p.color,
            width:  p.size + 'px',
            height: p.size + 'px',
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            animationDuration: p.dur + 'ms',
          }"
          @animationend="removeSectionParticle(p.id)"
        />
        <div
          v-for="(s, i) in sections"
          :key="i"
          class="section-pill relative overflow-hidden rounded min-w-0 flex-shrink-0"
          :class="{
            'pill--active':      s.isActive,
            'pill--activating':  activatingPill === i,
            'pill--graded-flash':gradedPill     === i,
            'pill--s': s.grade === 'S',
            'pill--a': s.grade === 'A',
            'pill--b': s.grade === 'B',
            'pill--c': s.grade === 'C',
            'pill--d': s.grade === 'D',
          }"
          :style="{
            width: sectionWidthPct(s) + '%',
            '--enter-delay': (i * 55) + 'ms',
            '--combo-color': s.isActive && activeMilestone ? activeMilestone.color : 'rgb(99,102,241)',
          }"
        >
          <!-- S-grade shimmer -->
          <div v-if="s.grade === 'S'" class="shimmer-overlay absolute inset-0 pointer-events-none" />

          <!-- Active scan-line sweep -->
          <div v-if="s.isActive" class="scan-line absolute inset-0 pointer-events-none" />

          <!-- Per-hit combo flash -->
          <div
            v-if="s.isActive && activePillHitting"
            class="combo-hit-flash absolute inset-0 pointer-events-none"
            @animationend="activePillHitting = false"
          />

          <!-- Progress fill -->
          <div
            v-if="s.isActive"
            class="progress-fill absolute inset-y-0 left-0"
            :style="{ width: progressPct(s) + '%' }"
          />

          <!-- Playhead glow edge -->
          <div
            v-if="s.isActive && progressPct(s) > 1 && progressPct(s) < 99"
            class="glow-edge absolute inset-y-0 w-[2px]"
            :style="{ left: progressPct(s) + '%' }"
          />

          <!-- Content -->
          <div class="relative z-10 flex flex-col justify-between h-full px-2 py-1.5">
            <span
              class="section-name truncate leading-none"
              :class="s.isActive ? 'text-white/95' : s.grade ? 'text-white/55' : 'text-white/30'"
            >{{ s.name }}</span>

            <div class="flex items-end justify-between gap-1">
              <Transition name="grade-pop">
                <span
                  v-if="s.grade"
                  class="grade-badge font-black leading-none"
                  :class="`badge--${s.grade.toLowerCase()}`"
                >{{ GRADE_LABEL[s.grade] }}</span>
              </Transition>
              <span
                v-if="s.isActive && s.totalNotes > 0"
                class="live-score ml-auto leading-none tabular-nums"
              >{{ s.score }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Combo counter ── -->
      <div class="combo-area relative flex justify-center" style="height: 36px; width: 100%;">
        <div class="particle-host absolute" style="top: 50%; left: 50%; width: 0; height: 0;">
          <div
            v-for="p in particles"
            :key="p.id"
            class="particle absolute"
            :class="`particle--${p.shape}`"
            :style="{
              '--tx': p.tx + 'px',
              '--ty': p.ty + 'px',
              background: p.color,
              width:  p.size + 'px',
              height: p.size + 'px',
              boxShadow: `0 0 ${p.size * 1.5}px ${p.color}`,
              animationDuration: p.dur + 'ms',
            }"
            @animationend="removeParticle(p.id)"
          />
        </div>

        <!-- Combo break indicator -->
        <Transition name="break-pop">
          <div v-if="comboBroken" class="combo-break absolute flex items-center px-3 py-1 rounded-full">
            <span class="combo-break-text">COMBO BREAK</span>
          </div>
        </Transition>

        <Transition name="combo-slide">
          <div
            v-if="comboVisible && activeMilestone"
            class="combo-badge relative flex items-baseline gap-1.5 px-3 py-1 rounded-full"
            :class="`milestone--${activeMilestone.min}`"
            :style="{ '--accent': activeMilestone.color }"
          >
            <span
              class="combo-num tabular-nums"
              :class="{ 'combo-num--bump': comboNumBumping }"
              :style="{ color: activeMilestone.color }"
              @animationend="comboNumBumping = false"
            >{{ combo }}</span>
            <span class="combo-label" :style="{ color: activeMilestone.color }">{{ activeMilestone.label }}</span>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Bar entrance ── */
.section-bar {
  top: 46px;
  width: min(800px, 90vw);
}

.bar-enter-active { animation: bar-slide-down 0.55s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
.bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bar-leave-to     { opacity: 0; transform: translateY(-8px) translateX(-50%); }

@keyframes bar-slide-down {
  0%   { opacity: 0; transform: translateY(-14px) translateX(-50%) scaleY(0.85); }
  100% { opacity: 1; transform: translateY(0)     translateX(-50%) scaleY(1); }
}

/* ── Pills row ── */
.pills-row {
  height: 52px;
}

/* ── Pill base — staggered entrance ── */
.section-pill {
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  transition: border-color 0.35s ease, background 0.35s ease, box-shadow 0.35s ease;
  animation: pill-enter 0.5s var(--enter-delay, 0ms) cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}

@keyframes pill-enter {
  0%   { opacity: 0; transform: translateY(10px) scaleY(0.8); }
  100% { opacity: 1; transform: translateY(0)    scaleY(1); }
}

/* ── Active pill — breathes in the current combo milestone color ── */
.pill--active {
  border-color: color-mix(in srgb, var(--combo-color) 60%, transparent);
  background:   color-mix(in srgb, var(--combo-color) 10%, transparent);
  transition: border-color 0.6s ease, background 0.6s ease;
  animation: pill-enter 0.5s var(--enter-delay,0ms) cubic-bezier(0.175,.885,.32,1.275) both,
             active-breathe 2s ease-in-out infinite;
}

@keyframes active-breathe {
  0%, 100% {
    box-shadow: 0 0 12px color-mix(in srgb, var(--combo-color) 30%, transparent),
                inset 0 0 10px color-mix(in srgb, var(--combo-color) 6%, transparent);
  }
  50% {
    box-shadow: 0 0 24px color-mix(in srgb, var(--combo-color) 65%, transparent),
                inset 0 0 18px color-mix(in srgb, var(--combo-color) 14%, transparent);
    border-color: color-mix(in srgb, var(--combo-color) 90%, transparent);
  }
}

/* ── Section-change flash (when pill becomes active) ── */
.pill--activating {
  animation: pill-enter 0.5s var(--enter-delay, 0ms) cubic-bezier(0.175, 0.885, 0.32, 1.275) both,
             activation-flash 0.6s ease both;
}

@keyframes activation-flash {
  0%   { box-shadow: 0 0 0   rgba(255,255,255,0);   border-color: rgba(255,255,255,.7); }
  20%  { box-shadow: 0 0 20px rgba(255,255,255,.45); }
  100% { box-shadow: 0 0 12px color-mix(in srgb, var(--combo-color) 30%, transparent);
         border-color: color-mix(in srgb, var(--combo-color) 60%, transparent); }
}

/* ── Grade-reveal flash (pill that just received a grade) ── */
.pill--graded-flash {
  animation: pill-enter 0.5s var(--enter-delay, 0ms) cubic-bezier(0.175, 0.885, 0.32, 1.275) both,
             grade-flash 0.85s ease both;
}

@keyframes grade-flash {
  0%   { filter: brightness(1); }
  15%  { filter: brightness(2.8); }
  40%  { filter: brightness(1.4); }
  100% { filter: brightness(1); }
}

/* ── Scan-line sweep on active pill ── */
.scan-line {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(139, 92, 246, 0.35) 50%,
    transparent 100%
  );
  width: 55%;
  animation: scan-sweep 2s ease-in-out infinite;
}

@keyframes scan-sweep {
  0%   { transform: translateX(-120%); opacity: 0.8; }
  40%  { opacity: 1; }
  100% { transform: translateX(260%);  opacity: 0; }
}

/* ── Progress fill & glow edge ── */
.progress-fill {
  background: linear-gradient(90deg, rgba(99,102,241,.32), rgba(139,92,246,.22));
  transition: width 0.08s linear;
}

.glow-edge {
  background: rgba(139, 92, 246, 0.95);
  box-shadow: 0 0 8px 3px rgba(139, 92, 246, 0.65);
  transform: translateX(-50%);
}

/* ── Grade pill styles ── */
.pill--s {
  border-color: rgba(251,191,36,.55);
  background: rgba(251,191,36,.09);
  animation: pill-enter 0.5s var(--enter-delay,0ms) cubic-bezier(0.175,.885,.32,1.275) both,
             s-pulse 3s ease-in-out infinite;
}
.pill--a { border-color: rgba(74,222,128,.5);  background: rgba(74,222,128,.07);
           animation: pill-enter 0.5s var(--enter-delay,0ms) cubic-bezier(0.175,.885,.32,1.275) both,
                      grade-reveal .6s .1s ease both, grade-a-pulse 3.5s 0.7s ease-in-out infinite; }
.pill--b { border-color: rgba(96,165,250,.45); background: rgba(96,165,250,.07);
           animation: pill-enter 0.5s var(--enter-delay,0ms) cubic-bezier(0.175,.885,.32,1.275) both,
                      grade-reveal .6s .1s ease both, grade-b-pulse 4s 0.7s ease-in-out infinite; }
.pill--c { border-color: rgba(251,146,60,.45); background: rgba(251,146,60,.07);
           animation: pill-enter 0.5s var(--enter-delay,0ms) cubic-bezier(0.175,.885,.32,1.275) both,
                      grade-reveal .6s .1s ease both, grade-c-pulse 4.5s 0.7s ease-in-out infinite; }
.pill--d { border-color: rgba(248,113,113,.45);background: rgba(248,113,113,.07);
           animation: pill-enter 0.5s var(--enter-delay,0ms) cubic-bezier(0.175,.885,.32,1.275) both,
                      grade-reveal .6s .1s ease both, grade-d-pulse 5s 0.7s ease-in-out infinite; }

@keyframes grade-a-pulse { 0%,100%{box-shadow:0 0 4px rgba(74,222,128,.15)} 50%{box-shadow:0 0 14px rgba(74,222,128,.45)} }
@keyframes grade-b-pulse { 0%,100%{box-shadow:0 0 4px rgba(96,165,250,.15)} 50%{box-shadow:0 0 12px rgba(96,165,250,.40)} }
@keyframes grade-c-pulse { 0%,100%{box-shadow:0 0 3px rgba(251,146,60,.15)} 50%{box-shadow:0 0 10px rgba(251,146,60,.35)} }
@keyframes grade-d-pulse { 0%,100%{box-shadow:0 0 2px rgba(248,113,113,.10)} 50%{box-shadow:0 0  8px rgba(248,113,113,.28)} }

@keyframes grade-reveal {
  0%   { filter: brightness(1) saturate(0.5); transform: scaleY(1); }
  25%  { filter: brightness(2) saturate(2);   transform: scaleY(1.04); }
  60%  { filter: brightness(1.3) saturate(1.5); }
  100% { filter: brightness(1) saturate(1); transform: scaleY(1); }
}

/* ── S shimmer & pulse ── */
.shimmer-overlay {
  background: linear-gradient(105deg, transparent 30%, rgba(251,191,36,.22) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: shimmer 2.2s linear infinite;
}

@keyframes s-pulse {
  0%, 100% { box-shadow: 0 0 8px  rgba(251,191,36,.25); }
  50%       { box-shadow: 0 0 20px rgba(251,191,36,.55); }
}

/* ── Text ── */
.section-name {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.grade-badge {
  font-size: 13px;
  letter-spacing: 0.04em;
}
.badge--s { color: #fbbf24; text-shadow: 0 0 8px rgba(251,191,36,.8); }
.badge--a { color: #4ade80; text-shadow: 0 0 6px rgba(74,222,128,.5); }
.badge--b { color: #60a5fa; }
.badge--c { color: #fb923c; }
.badge--d { color: #f87171; }

.live-score {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: rgba(255,255,255,.45);
}

/* ── Grade badge pop-in ── */
.grade-pop-enter-active { animation: badge-bounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.4) both; }
.grade-pop-leave-active { transition: opacity 0.15s ease; }
.grade-pop-leave-to     { opacity: 0; }

/* ── Combo badge ── */
.combo-badge {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, rgba(0,0,0,.6));
  backdrop-filter: blur(8px);
  animation: combo-breathe 1.4s ease-in-out infinite;
}
.combo-num   { font-size: 22px; font-weight: 900; line-height: 1; text-shadow: 0 0 12px var(--accent); }
.combo-label { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85; }

.milestone--50  { box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 45%, transparent); }
.milestone--100 { box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 60%, transparent); animation: rainbow-pulse 1s linear infinite; }

/* ── Per-hit combo number bump ── */
.combo-num--bump {
  animation: combo-num-tick 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.4) both;
}
@keyframes combo-num-tick {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.32) translateY(-2px); }
  100% { transform: scale(1)   translateY(0); }
}

/* ── Combo break badge ── */
.combo-break {
  border: 1px solid rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.12);
  backdrop-filter: blur(8px);
}
.combo-break-text {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #f87171;
  text-shadow: 0 0 8px rgba(239, 68, 68, 0.7);
}
.break-pop-enter-active { animation: break-badge-in 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.4) both; }
.break-pop-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.break-pop-leave-to     { opacity: 0; transform: scale(0.8) translateY(4px); }
@keyframes break-badge-in {
  0%   { opacity: 0; transform: scale(1.25) translateY(-4px); }
  60%  { transform: scale(0.96) translateY(1px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

/* ── Combo transition ── */
.combo-slide-enter-active { animation: combo-pop-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.4) both; }
.combo-slide-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.combo-slide-leave-to     { opacity: 0; transform: scale(0.8); }

/* ── Per-hit flash overlay on the active pill ── */
.combo-hit-flash {
  background: color-mix(in srgb, var(--combo-color) 22%, transparent);
  animation: combo-hit-flash 0.28s ease-out both;
  border-radius: inherit;
}
@keyframes combo-hit-flash {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

/* ── Particles (combo area + section pill bursts) ── */
.sect-particle {
  position: absolute;
  z-index: 30;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  animation: particle-fly var(--dur, 600ms) ease-out forwards;
  pointer-events: none;
}

.particle {
  position: absolute;
  top: 0; left: 0;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  animation: particle-fly var(--dur, 700ms) ease-out forwards;
  pointer-events: none;
}
.particle--rect { border-radius: 2px; }
.particle--star { clip-path: polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%); }

/* ── All keyframes ── */
@keyframes particle-fly {
  0%   { transform: translate(-50%,-50%) scale(1); opacity: 1; }
  70%  { opacity: .7; }
  100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.2); opacity: 0; }
}
@keyframes badge-bounce {
  0%   { opacity: 0; transform: scale(0) translateY(4px); }
  60%  { transform: scale(1.3) translateY(-1px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes combo-pop-in {
  0%   { opacity: 0; transform: scale(0.5) translateY(6px); }
  60%  { transform: scale(1.12) translateY(-2px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes combo-breathe {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.03); }
}
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}
@keyframes rainbow-pulse {
  0%   { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
</style>
