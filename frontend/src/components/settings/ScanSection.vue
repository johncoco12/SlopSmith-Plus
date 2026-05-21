<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { useLibraryStore } from '@/stores/library'

const settings = useSettingsStore()
const library  = useLibraryStore()

async function rescan(full: boolean): Promise<void> {
  await settings.rescan(full)
  library.loadPage()
}
</script>

<template>
  <section class="settings-section">
    <h2 class="text-sm font-semibold text-gray-200 mb-3">Library</h2>

    <div class="flex gap-2 flex-wrap">
      <button
        class="settings-btn"
        :disabled="settings.scanning"
        @click="rescan(false)"
      >{{ settings.scanning ? 'Scanning…' : 'Rescan' }}</button>
      <button
        class="settings-btn"
        :disabled="settings.scanning"
        @click="rescan(true)"
      >Full Rescan</button>
    </div>

    <p v-if="settings.scanStatus" class="text-xs text-gray-400 mt-2">
      {{ settings.scanStatus }}
    </p>
  </section>
</template>
