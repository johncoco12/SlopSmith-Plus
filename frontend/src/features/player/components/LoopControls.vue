<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/features/player/store'
import { formatTime } from '@/utils/format'
import { BookmarkPlus, X, Trash2 } from 'lucide-vue-next'

const player = usePlayerStore()
const { t } = useI18n()

const loopLabel = computed(() => {
  if (player.loopA !== null && player.loopB !== null)
    return `${formatTime(player.loopA)} – ${formatTime(player.loopB)}`
  if (player.loopA !== null) return `A: ${formatTime(player.loopA)}`
  return ''
})

const hasLoop = computed(() => player.loopA !== null || player.loopB !== null)

const selectedLoop = defineModel<number | string>('selectedLoop', { default: '' })

async function loadLoop(loopId: number | string): Promise<void> {
  const loop = player.savedLoops.find(l => l.id === Number(loopId))
  if (loop) player.loadLoop(loop)
}

async function deleteLoop(): Promise<void> {
  if (!selectedLoop.value) return
  await player.deleteLoop(Number(selectedLoop.value))
  selectedLoop.value = ''
}
</script>

<template>
  <div class="flex items-center gap-1 flex-wrap">
    <!-- A marker -->
    <button
      class="player-btn font-bold text-[11px] tracking-wide"
      :class="{ active: player.loopA !== null }"
      :title="$t('player.loop.setStartTitle')"
      @click="player.setLoopA()"
    >A</button>

    <!-- B marker -->
    <button
      class="player-btn font-bold text-[11px] tracking-wide"
      :class="{ active: player.loopB !== null }"
      :title="$t('player.loop.setEndTitle')"
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
      :title="$t('player.loop.saveTitle')"
      @click="player.saveLoop()"
    >
      <BookmarkPlus :size="13" />
    </button>

    <!-- Clear loop -->
    <button
      v-if="hasLoop"
      class="player-btn"
      :title="$t('player.loop.clearTitle')"
      @click="player.clearLoop()"
    >
      <X :size="13" />
    </button>

    <!-- Saved loops dropdown -->
    <div v-if="player.savedLoops.length" class="flex items-center gap-1">
      <select
        v-model="selectedLoop"
        class="ctrl-select"
        @change="loadLoop(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ $t('player.loop.saved') }}</option>
        <option v-for="l in player.savedLoops" :key="l.id" :value="l.id">{{ l.name }}</option>
      </select>
      <button
        v-if="selectedLoop"
        class="player-btn text-red-400 hover:!text-red-300"
        :title="$t('player.loop.deleteTitle')"
        @click="deleteLoop"
      >
        <Trash2 :size="13" />
      </button>
    </div>
  </div>
</template>
