<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { usePluginsStore } from '@/stores/plugins'

const route   = useRoute()
const plugins = usePluginsStore()

const pluginId = computed(() => route.params.id)
const plugin   = computed(() => plugins.plugins.find(p => p.id === pluginId.value))
const container = ref(null)

onMounted(async () => {
  if (!plugin.value?.screen) return
  // Load the plugin's server-rendered screen HTML into the container
  try {
    const res = await fetch(`/api/plugins/${pluginId.value}/screen.html`)
    if (res.ok && container.value) {
      container.value.innerHTML = await res.text()
    }
  } catch (e) {
    console.warn(`[Plugin] ${pluginId.value} screen HTML not available`, e)
  }
})
</script>

<template>
  <div class="min-h-screen bg-dark-800">
    <div v-if="!plugin" class="flex items-center justify-center h-64 text-gray-400 text-sm">
      Plugin not found
    </div>
    <div v-else ref="container" class="plugin-screen-container" />
  </div>
</template>
