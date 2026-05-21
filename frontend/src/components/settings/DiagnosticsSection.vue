<script setup lang="ts">
import { ref } from 'vue'
import { exportDiagnostics } from '@/api/settings'
import AppCheckbox from '@/components/common/AppCheckbox.vue'

const include   = ref<string[]>(['system', 'console', 'plugins'])
const redact    = ref<boolean>(false)
const exporting = ref<boolean>(false)
const status    = ref<string>('')

const OPTIONS = [
  { value: 'system',  label: 'System info'  },
  { value: 'console', label: 'Console logs' },
  { value: 'plugins', label: 'Plugin data'  },
]

async function doExport(): Promise<void> {
  exporting.value = true
  status.value = ''
  try {
    await exportDiagnostics({ include: include.value, redact: redact.value })
    status.value = 'Diagnostics exported'
  } catch (e) {
    status.value = `Export failed: ${(e as Error).message}`
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <section class="settings-section">
    <h2 class="text-sm font-semibold text-gray-200 mb-4">Diagnostics</h2>

    <div class="space-y-3 mb-4">
      <AppCheckbox
        v-for="opt in OPTIONS"
        :key="opt.value"
        v-model="include"
        :value="opt.value"
      >{{ opt.label }}</AppCheckbox>

      <div class="h-px bg-white/[.06]" />

      <AppCheckbox v-model="redact">Redact paths &amp; hostnames</AppCheckbox>
    </div>

    <button class="settings-btn" :disabled="exporting" @click="doExport">
      {{ exporting ? 'Exporting…' : 'Export diagnostics' }}
    </button>

    <p
      v-if="status"
      class="text-xs mt-2"
      :class="status.startsWith('Export failed') ? 'text-red-400' : 'text-green-400'"
    >{{ status }}</p>
  </section>
</template>
