<script setup lang="ts">
/**
 * ModernwayScene — TresJS scene content for the 3D highway.
 *
 * Uses declarative TresJS components for camera and lights,
 * and imperative Three.js Groups (via <TresPrimitive>) for
 * the high-performance object pools (notes, beats, lane).
 *
 * useLoop().onBeforeRender drives per-frame mesh pool updates.
 */
import { inject, ref, watch, type ShallowRef } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import * as THREE from 'three'
import type { RenderBundle } from '@/features/player/types'
import { renderBundleKey } from '@/features/player/renderers/keys'
import {
  K, FOG_START, FOG_END, CAM_H_BASE, CAM_DIST_BASE, REF_ASPECT,
  FOCUS_D, CAM_LERP_BASE, AHEAD, fretMid, sY, computeBPM,
} from './constants'
import { createNoteMeshPool } from './composables/useNotes'
import { createFretboard } from './composables/useFretboard'
import { createBeatLines } from './composables/useBeats'
import { createLane } from './composables/useLane'
import { createFretLabelPool } from './composables/useFretLabels'
import { createTuningLabels } from './composables/useTuningLabels'
import { createFretRowLabels } from './composables/useFretRowLabels'
import { createBoardGhost } from './composables/useBoardGhost'
import { createChordFrames } from './composables/useChordFrames'
import { createTechniqueOverlays } from './composables/useTechOverlays'
import { createAccentHalos } from './composables/useAccentHalos'
import { createTechRibbons } from './composables/useTechRibbons'
import { createLaneDividers } from './composables/useLaneDividers'
import { createFretColumnMarkers } from './composables/useFretColumnMarkers'
import { createFretInlays } from './composables/useFretInlays'
import { createStringGlow } from './composables/useStringGlow'
import { createSectionLabels } from './composables/useSectionLabels'
import { createNutHeadstock } from './composables/useNutHeadstock'
import { createDomeParticles } from './composables/useDomeParticles'
import { createNoteDetectFeedback } from './composables/useNoteDetect'
import { createHitImpact } from './composables/useHitImpact'

// ── Inject reactive bundle from player layer ──────────────────────────────────
const bundle = inject<ShallowRef<RenderBundle | null>>(renderBundleKey as any)!

// ── Scene fog (applied imperatively since TresJS doesn't have a fog component)
const { scene } = useTresContext()
scene.value.fog = new THREE.Fog(0x101820, FOG_START * 0.8, FOG_END * 1.2)

// ── Camera ref (we use a ref to control it imperatively each frame) ───────────
const cameraRef = ref<THREE.PerspectiveCamera | null>(null)

// ── Imperative subsystem groups ───────────────────────────────────────────────
const notePool = createNoteMeshPool()
const fretboard = createFretboard()
const beatLines = createBeatLines()
const lane = createLane()
const fretLabels = createFretLabelPool()
const tuningLabels = createTuningLabels()
const fretRowLabels = createFretRowLabels()
const boardGhost = createBoardGhost()
const chordFrames = createChordFrames()
const techOverlays = createTechniqueOverlays()
const accentHalos = createAccentHalos()
const techRibbons = createTechRibbons()
const laneDividers = createLaneDividers()
const fretColumnMarkers = createFretColumnMarkers()
const fretInlays = createFretInlays()
const stringGlow = createStringGlow()
const sectionLabels = createSectionLabels()
const nutHeadstock = createNutHeadstock()
const domeParticles = createDomeParticles()
const noteDetect = createNoteDetectFeedback()
const hitImpact = createHitImpact()

// Expose Three.js Groups for <TresPrimitive> binding
const noteGroup = notePool.group
const fretboardGroup = fretboard.group
const beatGroup = beatLines.group
const laneGroup = lane.group
const fretLabelGroup = fretLabels.group
const tuningLabelGroup = tuningLabels.group
const fretRowLabelGroup = fretRowLabels.group
const boardGhostGroup = boardGhost.group
const chordFrameGroup = chordFrames.group
const techOverlayGroup = techOverlays.group
const accentHaloGroup = accentHalos.group
const techRibbonGroup = techRibbons.group
const laneDividerGroup = laneDividers.group
const fretColumnMarkerGroup = fretColumnMarkers.group
const fretInlayGroup = fretInlays.group
const stringGlowGroup = stringGlow.group
const sectionLabelGroup = sectionLabels.group
const nutHeadstockGroup = nutHeadstock.group
const domeParticleGroup = domeParticles.group
const noteDetectGroup = noteDetect.group
const hitImpactGroup = hitImpact.group

// ── Camera state ──────────────────────────────────────────────────────────────
let curX = 0
let tgtX = 0
let curDist = CAM_DIST_BASE
let tgtDist = CAM_DIST_BASE
let curLookY = 0
let tgtLookY = 0
let aspectScale = 1
let lastStringCount = -1
let lastInverted: boolean | null = null

// ── Handle resize for aspect scaling ──────────────────────────────────────────
const { sizes } = useTresContext()
watch(
  () => [sizes.width.value, sizes.height.value] as const,
  ([w, h]) => {
    if (w > 0 && h > 0) {
      aspectScale = Math.max(1, REF_ASPECT / Math.max(w / h, 0.5))
    }
  },
  { immediate: true },
)

// ── Render loop ───────────────────────────────────────────────────────────────
const { onBeforeRender } = useLoop()

onBeforeRender(() => {
  const b = bundle?.value
  if (!b || !b.isReady) return

  const cam = cameraRef.value
  if (!cam) return

  // Rebuild fretboard on string count / inversion change
  if (b.stringCount !== lastStringCount || b.inverted !== lastInverted) {
    fretboard.rebuild(b.stringCount, b.inverted)
    lastStringCount = b.stringCount
    lastInverted = b.inverted
  }

  // ── Update camera ─────────────────────────────────────────────────────────
  const now = b.currentTime
  const notes = b.notes
  const stringCount = b.stringCount
  const inverted = b.inverted

  // Target X from upcoming notes (recency-weighted centroid)
  const t0 = now - 0.2
  const t1 = now + AHEAD * 0.5
  let sumX = 0, count = 0
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]
    if (n.t < t0) continue
    if (n.t > t1) break
    if (n.f <= 0) continue
    const x = fretMid(n.f)
    const decay = Math.exp(-(n.t - now) * 1.5)
    sumX += x * decay
    count += decay
  }
  if (count > 0.01) {
    tgtX = sumX / count
  }

  // Target distance from fret span
  let minF = 24, maxF = 0
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]
    if (n.t < now - 0.2 || n.t > now + 2.0) continue
    if (n.f > 0) {
      if (n.f < minF) minF = n.f
      if (n.f > maxF) maxF = n.f
    }
  }
  const span = maxF > minF ? maxF - minF : 4
  tgtDist = (65 + Math.max(span, 4) * 3 + Math.max(0, 5 - minF) * 4) * K

  // BPM-scaled lerp
  const bpm = computeBPM(b.beats, now)
  const lerp = CAM_LERP_BASE * Math.max(bpm, 60) / 120

  curX += (tgtX - curX) * lerp
  curDist += (tgtDist - curDist) * lerp

  const dist = curDist * aspectScale
  const h = CAM_H_BASE * (dist / CAM_DIST_BASE)
  const shoulderOffset = 20 * K

  cam.position.set(curX + shoulderOffset, h * 0.95, dist * 0.75)

  const fretMidY = (sY(0, stringCount, inverted) + sY(stringCount - 1, stringCount, inverted)) / 2
  tgtLookY = fretMidY * 0.3
  curLookY += (tgtLookY - curLookY) * lerp
  cam.lookAt(curX, curLookY, -FOCUS_D * 0.35)

  // ── Update object pools ───────────────────────────────────────────────────
  notePool.update(b)
  beatLines.update(b)
  lane.update(b)
  fretLabels.update(b)
  tuningLabels.update(b)
  fretRowLabels.update(b)
  boardGhost.update(b)
  chordFrames.update(b)
  techOverlays.update(b)
  accentHalos.update(b)
  techRibbons.update(b)
  laneDividers.update(b)
  fretColumnMarkers.update(b)
  fretInlays.update(b)
  stringGlow.update(b)
  sectionLabels.update(b)
  nutHeadstock.update(b)
  domeParticles.update(b)
  noteDetect.update(b)
  hitImpact.update(b)
})
</script>

<template>
  <!-- Camera -->
  <TresPerspectiveCamera
    ref="cameraRef"
    :fov="70"
    :near="0.01"
    :far="FOG_END * 3"
    :position="[0, CAM_H_BASE, CAM_DIST_BASE]"
  />

  <!-- Lighting -->
  <TresAmbientLight :intensity="0.85" />
  <TresDirectionalLight
    :intensity="0.8"
    :position="[40 * K, 120 * K, 80 * K]"
  />

  <!-- Imperative groups injected via primitive -->
  <primitive :object="fretboardGroup" />
  <primitive :object="noteGroup" />
  <primitive :object="fretLabelGroup" />
  <primitive :object="tuningLabelGroup" />
  <primitive :object="fretRowLabelGroup" />
  <primitive :object="boardGhostGroup" />
  <primitive :object="chordFrameGroup" />
  <primitive :object="techOverlayGroup" />
  <primitive :object="accentHaloGroup" />
  <primitive :object="techRibbonGroup" />
  <primitive :object="laneDividerGroup" />
  <primitive :object="fretColumnMarkerGroup" />
  <primitive :object="fretInlayGroup" />
  <primitive :object="stringGlowGroup" />
  <primitive :object="sectionLabelGroup" />
  <primitive :object="nutHeadstockGroup" />
  <primitive :object="domeParticleGroup" />
  <primitive :object="noteDetectGroup" />
  <primitive :object="hitImpactGroup" />
  <primitive :object="beatGroup" />
  <primitive :object="laneGroup" />
</template>
