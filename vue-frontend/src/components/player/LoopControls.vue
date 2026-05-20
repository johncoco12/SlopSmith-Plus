<script setup>
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { formatTime } from '@/utils/format'
import { BookmarkPlus, X, Trash2 } from 'lucide-vue-next'

const player = usePlayerStore()

const loopLabel = computed(() => {
  if (player.loopA !== null && player.loopB !== null)
    return `${formatTime(player.loopA)} – ${formatTime(player.loopB)}`
  if (player.loopA !== null) return `A: ${formatTime(player.loopA)}`
  return ''
})

const hasLoop = computed(() => player.loopA !== null || player.loopB !== null)

const selectedLoop = defineModel('selectedLoop', { default: '' })

async function loadLoop(loopId) {
  const loop = player.savedLoops.find(l => l.id === loopId)
  if (loop) player.loadLoop(loop)
}

async function deleteLoop() {
  if (!selectedLoop.value) return
  await player.deleteLoop(selectedLoop.value)
  selectedLoop.value = ''
}
</script>

<template>
  <div class="flex items-center gap-1 flex-wrap">
    <!-- A marker -->
    <button
      class="player-btn font-bold text-[11px] tracking-wide"
      :class="{ active: player.loopA !== null }"
      title="Set loop start (A)"
      @click="player.setLoopA()"
    >A</button>

    <!-- B marker -->
    <button
      class="player-btn font-bold text-[11px] tracking-wide"
      :class="{ active: player.loopB !== null }"
      title="Set loop end (B)"
      @click="player.setLoopB()"
    >B</button>

    <!-- Loop range label -->
    <span
      v-if="loopLabel"
      class="text-[10px] text-gray-400 font-mono tabular-nums px-0.5"
    >{{ loopLabel }}</span>

    <!-- Save loop -->
    <button
      v-if="player.loopA !== null && player.loopB !== null"
      class="player-btn"
      title="Save loop"
      @click="player.saveLoop()"
    >
      <BookmarkPlus :size="13" />
    </button>

    <!-- Clear loop -->
    <button
      v-if="hasLoop"
      class="player-btn"
      title="Clear loop"
      @click="player.clearLoop()"
    >
      <X :size="13" />
    </button>

    <!-- Saved loops dropdown -->
    <div v-if="player.savedLoops.length" class="flex items-center gap-1">
      <select
        v-model="selectedLoop"
        class="ctrl-select"
        @change="loadLoop($event.target.value)"
      >
        <option value="">Saved</option>
        <option v-for="l in player.savedLoops" :key="l.id" :value="l.id">{{ l.name }}</option>
      </select>
      <button
        v-if="selectedLoop"
        class="player-btn text-red-400 hover:!text-red-300"
        title="Delete loop"
        @click="deleteLoop"
      >
        <Trash2 :size="13" />
      </button>
    </div>
  </div>
</template>
