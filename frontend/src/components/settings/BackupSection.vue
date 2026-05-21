<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const importing = ref<boolean>(false)
const status    = ref<string>('')

async function doExport(): Promise<void> {
  await settings.export()
}

async function doImport(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importing.value = true
  status.value = ''
  try {
    await settings.import(file)
    status.value = 'Import complete — reload to apply'
  } catch (err) {
    status.value = `Import failed: ${(err as Error).message}`
  } finally {
    importing.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
</script>

<template>
  <section class="settings-section">
    <h2 class="text-sm font-semibold text-gray-200 mb-3">Backup</h2>

    <div class="flex gap-2 flex-wrap">
      <button class="settings-btn" @click="doExport">Export settings</button>
      <label class="settings-btn cursor-pointer">
        {{ importing ? 'Importing…' : 'Import settings' }}
        <input type="file" accept=".json" class="hidden" @change="doImport" />
      </label>
    </div>

    <p v-if="status" class="text-xs mt-2" :class="status.startsWith('Import failed') ? 'text-red-400' : 'text-green-400'">
      {{ status }}
    </p>
  </section>
</template>
