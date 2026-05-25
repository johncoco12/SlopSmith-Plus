<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/features/player/store'

const { t } = useI18n()
const player = usePlayerStore()
</script>

<template>
  <select
    v-if="player.availableRenderers.length > 1"
    :value="player.rendererSelection"
    class="ctrl-select"
    :title="$t('player.renderer.title')"
    @change="player.rendererSelection = ($event.target as HTMLSelectElement).value"
  >
    <option v-for="r in player.availableRenderers" :key="r.id" :value="r.id">{{ r.name }}</option>
  </select>
</template>
