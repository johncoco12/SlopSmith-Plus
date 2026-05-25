<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/store'

const { t } = useI18n()
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
    <label class="settings-label">{{ $t('settings.dlc.label') }}</label>
    <div class="flex gap-2">
      <input
        v-model="settings.dlcPath"
        type="text"
        :placeholder="$t('settings.dlc.placeholder')"
        class="settings-input flex-1"
        @keydown.enter="save"
      />
      <button
        v-if="window?.slopsmithDesktop?.pickDirectory"
        class="settings-btn"
        :title="$t('settings.dlc.browse')"
        @click="pickFolder"
      >{{ $t('settings.dlc.browse') }}</button>
      <button
        class="settings-btn primary"
        :disabled="saving"
        @click="save"
      >{{ saved ? $t('settings.dlc.saved') : saving ? $t('common.saving') : $t('common.save') }}</button>
    </div>
  </div>
</template>
