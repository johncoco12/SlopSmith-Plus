<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { usePluginsStore } from '@/stores/plugins'

const player  = usePlayerStore()
const plugins = usePluginsStore()

const options = computed(() => [
  { value: 'auto',    label: 'Auto' },
  { value: 'default', label: 'Default' },
  ...plugins.vizPlugins.map(p => ({ value: p.id, label: p.name })),
])
</script>

<template>
  <select
    :value="player.vizSelection"
    class="ctrl-select"
    title="Visualization"
    @change="player.setViz($event.target.value)"
  >
    <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
  </select>
</template>
