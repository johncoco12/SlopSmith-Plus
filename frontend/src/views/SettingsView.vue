<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { usePluginsStore } from '@/stores/plugins'
import AppToggle from '@/components/common/AppToggle.vue'
import DlcPath from '@/components/settings/DlcPath.vue'
import ScanSection from '@/components/settings/ScanSection.vue'
import BackupSection from '@/components/settings/BackupSection.vue'
import DiagnosticsSection from '@/components/settings/DiagnosticsSection.vue'
import PluginSettings from '@/components/settings/PluginSettings.vue'
const router   = useRouter()
const settings = useSettingsStore()
const plugins  = usePluginsStore()
</script>

<template>
  <div class="min-h-screen bg-dark-800 px-4 pb-12">
    <!-- Header -->
    <div class="flex items-center gap-3 py-4 border-b border-white/[.06] mb-6">
      <button
        class="p-1.5 rounded-lg hover:bg-dark-600 transition text-gray-400 hover:text-gray-200"
        aria-label="Back"
        @click="router.back()"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-base font-semibold text-gray-100">Settings</h1>
    </div>

    <div class="max-w-2xl mx-auto space-y-6">

      <!-- DLC Folder -->
      <section class="settings-section">
        <h2 class="text-sm font-semibold text-gray-200 mb-3">Library</h2>
        <DlcPath />
      </section>

      <!-- Playback -->
      <section class="settings-section">
        <h2 class="text-sm font-semibold text-gray-200 mb-3">Playback</h2>

        <AppToggle
          v-model="settings.lefty"
          @change="settings.save()"
        >Left-handed mode</AppToggle>

        <div>
          <label class="settings-label">Default arrangement</label>
          <select
            v-model="settings.defaultArrangement"
            class="settings-input"
            @change="settings.save()"
          >
            <option value="auto">Auto</option>
            <option value="lead">Lead</option>
            <option value="rhythm">Rhythm</option>
            <option value="bass">Bass</option>
          </select>
        </div>

        <div>
          <label class="settings-label">PSARC platform filter</label>
          <select
            v-model="settings.psarcPlatform"
            class="settings-input"
            @change="settings.save()"
          >
            <option value="all">All</option>
            <option value="pc">PC only (_p.psarc)</option>
            <option value="mac">Mac only (_m.psarc)</option>
          </select>
        </div>

        <div>
          <label class="settings-label">Demucs server URL <span class="text-gray-500">(optional)</span></label>
          <div class="flex gap-2">
            <input v-model="settings.demucsUrl" type="url" placeholder="http://..." class="settings-input flex-1" />
            <button class="settings-btn" @click="settings.save()">Save</button>
          </div>
        </div>
      </section>

      <!-- Library actions -->
      <ScanSection />

      <!-- Backup -->
      <BackupSection />

      <!-- Diagnostics -->
      <DiagnosticsSection />

      <!-- Plugin settings -->
      <PluginSettings v-for="p in plugins.settingsPlugins" :key="p.id" :plugin="p" />

      <!-- About -->
      <section class="settings-section">
        <h2 class="text-sm font-semibold text-gray-200 mb-3">About</h2>
        <div class="text-sm text-gray-400 space-y-1">
          <div>Version: <span class="text-gray-200 font-mono">{{ settings.version || '—' }}</span></div>
          <div class="flex gap-4 mt-2">
            <a
              v-if="settings.licenseUrl"
              :href="settings.licenseUrl"
              target="_blank"
              rel="noopener"
              class="text-accent hover:underline"
            >AGPL v3.0 License</a>
            <a
              v-if="settings.sourceUrl"
              :href="settings.sourceUrl"
              target="_blank"
              rel="noopener"
              class="text-accent hover:underline"
            >Source Code</a>

          </div>
          <div class="flex gap-4 mt-2">
            <p>
              Slopsmith is free software. You can redistribute it and modify it under the terms of the AGPL. If you run a modified version that interacts with users over a network, you must make the modified source available to those users.
            </p>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>
