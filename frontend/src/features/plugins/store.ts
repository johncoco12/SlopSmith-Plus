import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchPlugins, updatePlugin as apiUpdate } from '@/features/plugins/api'
import type { Plugin } from '@/types'
import { pluginEventBus, slotManager, loadPlugin } from '@/plugins'

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<Plugin[]>([])
  const loaded  = ref<boolean>(false)

  const active          = computed(() => plugins.value.filter(p => p.state !== 'disabled'))
  const navPlugins      = computed(() => active.value.filter(p => p.nav))
  const settingsPlugins = computed(() => active.value.filter(p => p.has_settings))
  const vizPlugins      = computed(() => active.value.filter(p => p.type === 'visualization'))

  async function load(): Promise<void> {
    if (loaded.value) return
    try {
      const data = await fetchPlugins() as { plugins: Plugin[] }
      plugins.value = data.plugins ?? []

      // Load all plugins — each may register slots, subscribe to events, etc.
      await Promise.allSettled(
        plugins.value.map(p => loadPlugin(p, pluginEventBus, slotManager))
      )

      loaded.value = true
      pluginEventBus.emit('plugins:ready', {})
    } catch (e) {
      console.error('[Plugins] load failed', e)
    }
  }

  async function refreshList(): Promise<void> {
    try {
      const data = await fetchPlugins() as { plugins: Plugin[] }
      plugins.value = data.plugins ?? []
    } catch (e) {
      console.error('[Plugins] refresh failed', e)
    }
  }

  async function update(pluginId: string): Promise<void> {
    await apiUpdate(pluginId)
  }

  return { plugins, loaded, navPlugins, settingsPlugins, vizPlugins, load, refreshList, update }
})
