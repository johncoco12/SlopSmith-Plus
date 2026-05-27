<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/features/player/store'
import { usePluginsStore } from '@/features/plugins/store'

const { t } = useI18n()
const player  = usePlayerStore()
const plugins = usePluginsStore()

const options = computed(() => [
  { value: 'auto',    label: t('player.viz.auto') },
  { value: 'default', label: t('player.viz.default') },
  ...plugins.vizPlugins.map(p => ({ value: p.id, label: p.name })),
])
</script>

<template>
  <select
    :value="player.vizSelection"
    class="ctrl-select"
    :title="$t('player.viz.title')"
    @change="player.setViz(($event.target as HTMLSelectElement).value)"
  >
    <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
  </select>
</template>
