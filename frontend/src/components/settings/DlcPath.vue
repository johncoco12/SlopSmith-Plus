<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const saving    = ref<boolean>(false)
const saved     = ref<boolean>(false)

async function save(): Promise<void> {
  saving.value = true
  try {
    await settings.save()
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } finally {
    saving.value = false
  }
}

async function pickFolder(): Promise<void> {
  if (window.slopsmithDesktop?.pickDirectory) {
    const path = await window.slopsmithDesktop.pickDirectory()
    if (path) { settings.dlcPath = path; await save() }
  }
}
</script>

<template>
  <div>
    <label class="settings-label">DLC folder path</label>
    <div class="flex gap-2">
      <input
        v-model="settings.dlcPath"
        type="text"
        placeholder="/path/to/dlc"
        class="settings-input flex-1"
        @keydown.enter="save"
      />
      <button
        v-if="window?.slopsmithDesktop?.pickDirectory"
        class="settings-btn"
        title="Browse"
        @click="pickFolder"
      >Browse</button>
      <button
        class="settings-btn primary"
        :disabled="saving"
        @click="save"
      >{{ saved ? '✓ Saved' : saving ? 'Saving…' : 'Save' }}</button>
    </div>
  </div>
</template>
