<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { usePluginsStore } from '@/features/plugins/store'
import { getPluginComponent } from '@/plugins'

const route   = useRoute()
const plugins = usePluginsStore()

const pluginId = computed(() => route.params.id as string)
const plugin   = computed(() => plugins.plugins.find(p => p.id === pluginId.value))

const pluginComponent = computed(() => getPluginComponent(pluginId.value) ?? null)

// Legacy HTML screen mode
const container = ref<HTMLElement | null>(null)
const htmlLoaded = ref(false)

onMounted(async () => {
  if (pluginComponent.value) return
  if (!plugin.value) return

  try {
    const res = await fetch(`/api/plugins/${pluginId.value}/screen.html`)
    if (res.ok && container.value) {
      container.value.innerHTML = await res.text()
      htmlLoaded.value = true
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

    <component :is="pluginComponent" v-else-if="pluginComponent" class="plugin-screen-container" />
    <div v-else ref="container" class="plugin-screen-container" />
  </div>
</template>
