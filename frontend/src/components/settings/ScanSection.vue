<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import { useLibraryStore } from '@/stores/library'

const { t } = useI18n()

const settings = useSettingsStore()
const library  = useLibraryStore()

async function rescan(full: boolean): Promise<void> {
  await settings.rescan(full)
  library.loadPage()
}
</script>

<template>
  <section class="settings-section">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-3">
      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
      Library
    </h2>

    <div class="flex gap-2 flex-wrap">
      <button
        class="settings-btn"
        :disabled="settings.scanning"
        @click="rescan(false)"
      >{{ settings.scanning ? $t('settings.scan.scanning') : $t('settings.scan.rescan') }}</button>
      <button
        class="settings-btn"
        :disabled="settings.scanning"
        @click="rescan(true)"
      >{{ $t('settings.scan.fullRescan') }}</button>
    </div>

    <p v-if="settings.scanStatus" class="text-xs text-gray-400 mt-2">
      {{ settings.scanStatus }}
    </p>
  </section>
</template>
