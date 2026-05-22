<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const nextNote = ref<string>('---')
const hitTiming = ref<string>('---')
const detectedHz = ref<string>('---')
const hitMapCount = ref<string>('')
const debugHitMap = ref(false)

function toggleDebugHitMap(): void {
  debugHitMap.value = !debugHitMap.value
  localStorage.setItem('pitch_yin.debugHitMap', debugHitMap.value ? 'true' : 'false')
}

onMounted(() => {
  debugHitMap.value = localStorage.getItem('pitch_yin.debugHitMap') === 'true'
  _timer = setInterval(_update, 100)
})

let _timer: ReturnType<typeof setInterval> | null = null

function _update(): void {
  const hw = (window as any).highway
  if (!hw) {
    nextNote.value = 'no highway'
    return
  }
  const now = hw.getTime?.() ?? 0
  const notes: any[] = hw.getNotes?.() ?? []
  const chords: any[] = hw.getChords?.() ?? []

  let bestT = Infinity
  let bestStr = -1
  let bestFret = -1

  for (const n of notes) {
    if (n.t > now && n.t < bestT) {
      bestT = n.t; bestStr = n.s; bestFret = n.f
    }
  }
  for (const ch of chords) {
    if (ch.t > now && ch.t < bestT) {
      bestT = ch.t
      if (ch.notes?.length) {
        bestStr = ch.notes[0].s; bestFret = ch.notes[0].f
      }
    }
  }

  if (bestT === Infinity) {
    nextNote.value = 'end'
  } else {
    const dt = bestT - now
    nextNote.value = `s${bestStr + 1} f${bestFret} in ${dt >= 1 ? dt.toFixed(2) : (dt * 1000).toFixed(0) + 'ms'}`
  }

  const hd = (window as any).highway?.hitDetector
  const acc = hd?.getLastHitAccuracy?.()
  if (acc) {
    const label = acc.ms >= 0 ? `+${acc.ms}ms late` : `${acc.ms}ms early`
    hitTiming.value = label
  } else {
    hitTiming.value = '---'
  }

  const det = (window as any).pitchYin?.getLastDetected?.()
  if (det && det.hz > 0) {
    detectedHz.value = `${det.hz.toFixed(1)} Hz (${(det.clarity * 100).toFixed(0)}%)`
  } else {
    detectedHz.value = '---'
  }

  const hm = hd?.getHitMapEntries?.()
  if (hm && hm.length > 0) {
    const matchHz = hd?.getLastMatchHz?.() ?? 0
    hitMapCount.value = `♯${hm.length} ${matchHz > 0 ? matchHz.toFixed(1) + 'Hz' : ''}`
  } else {
    hitMapCount.value = ''
  }
}

onUnmounted(() => { if (_timer) clearInterval(_timer) })
</script>

<template>
  <div class="fixed bottom-16 left-2 z-[999] font-mono text-[10px] leading-tight text-green-400/80 bg-black/60 rounded px-1.5 py-1 select-none pointer-events-none">
    <div>Next: {{ nextNote }}</div>
    <div>Hit: {{ hitTiming }}</div>
    <div>YIN: {{ detectedHz }}</div>
    <div v-if="hitMapCount">HM: {{ hitMapCount }}</div>
    <div class="mt-0.5 flex gap-1">
      <button
        class="px-1 rounded pointer-events-auto text-[9px]"
        :class="debugHitMap ? 'bg-yellow-700/80 text-yellow-200' : 'bg-white/10 text-white/50'"
        @click="toggleDebugHitMap"
      >HM{{ debugHitMap ? ' ON' : ' OFF' }}</button>
      <button
        class="px-1 rounded pointer-events-auto bg-white/10 text-white/70 hover:bg-white/20 text-[9px]"
        @click="(window as any).highway?.hitDetector?.dumpHitDebug?.()"
      >Dump</button>
    </div>
  </div>
</template>
