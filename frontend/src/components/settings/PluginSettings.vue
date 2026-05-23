<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { checkPluginUpdates, updatePlugin } from '@/api/plugins'

import type { Plugin } from '@/types'

const { t } = useI18n()

const props = defineProps<{
  plugin: Plugin
}>()

const open        = ref<boolean>(false)
const updating    = ref<boolean>(false)
const updateAvail = ref<{ version?: string } | null>(null)
const container   = ref<HTMLElement | null>(null)
const htmlLoaded  = ref<boolean>(false)

async function checkUpdate(): Promise<void> {
  try {
    const info = await checkPluginUpdates(props.plugin.id)
    updateAvail.value = info as { version?: string } | null
  } catch {}
}

async function doUpdate(): Promise<void> {
  updating.value = true
  try {
    await updatePlugin(props.plugin.id)
    updateAvail.value = null
  } finally {
    updating.value = false
  }
}

// Fetch and inject settings HTML the first time the section opens.
// nextTick lets v-if="open" render the container div before we fill it.
watch(open, async (isOpen) => {
  if (!isOpen || htmlLoaded.value || !props.plugin.has_settings) return
  await nextTick()
  if (!container.value) return
  try {
    const resp = await fetch(`/api/plugins/${props.plugin.id}/settings.html`)
    if (!resp.ok) return
    container.value.innerHTML = await resp.text()
    // innerHTML leaves <script> tags inert per HTML5 spec — re-create them
    // so inline event wiring and localStorage hydration actually runs
    container.value.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script')
      for (const a of old.attributes) s.setAttribute(a.name, a.value)
      s.textContent = old.textContent
      old.parentNode.replaceChild(s, old)
    })
    htmlLoaded.value = true
  } catch (e: unknown) {
    console.warn(`[PluginSettings] ${props.plugin.id} settings.html failed`, e)
  }
})
</script>

<template>
  <section class="settings-section">
    <button
      class="flex items-center justify-between w-full text-sm font-semibold text-gray-200"
      @click="open = !open"
    >
      <span>{{ plugin.name }}</span>
      <div class="flex items-center gap-2">
        <span v-if="plugin.bundled" class="text-[10px] font-mono text-gray-600">{{ $t('settings.plugins.bundled') }}</span>
        <span v-if="plugin.version" class="text-[10px] font-mono text-gray-500">v{{ plugin.version }}</span>
        <svg
          class="w-4 h-4 text-gray-500 transition-transform"
          :class="open ? 'rotate-180' : ''"
          fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <div v-if="open" class="mt-3 space-y-3">
      <!-- Plugin settings HTML (fetched from /api/plugins/{id}/settings.html) -->
      <div
        v-if="plugin.has_settings"
        :id="`plugin-settings-${plugin.id}`"
        ref="container"
        class="text-sm text-gray-300"
      />

      <!-- Update controls -->
      <div class="flex items-center gap-2">
        <button class="settings-btn text-xs" @click="checkUpdate">{{ $t('settings.plugins.checkUpdates') }}</button>
        <button
          v-if="updateAvail"
          class="settings-btn primary text-xs"
          :disabled="updating"
          @click="doUpdate"
        >{{ updating ? $t('settings.plugins.updating') : $t('settings.plugins.updateTo', { version: updateAvail.version ?? 'latest' }) }}</button>
      </div>
    </div>
  </section>
</template>
