<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/store'
import { usePluginsStore } from '@/features/plugins/store'
import { setLocale, getLocale, type SupportedLocale } from '@/plugins/i18n'
import AppToggle from '@/components/ui/AppToggle.vue'
import ScanSection from '@/features/settings/components/ScanSection.vue'
import DiagnosticsSection from '@/features/settings/components/DiagnosticsSection.vue'
import PluginSettings from '@/features/settings/components/PluginSettings.vue'
const { t } = useI18n()
const router   = useRouter()
const settings = useSettingsStore()
const plugins  = usePluginsStore()

const languages = [
  { code: 'en-EN', label: 'English' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'nl-NL', label: 'Nederlands' },
  { code: 'pl-PL', label: 'Polski' },
]
const selectedLanguage = ref(getLocale())

function onLanguageChange(): void {
  setLocale(selectedLanguage.value as SupportedLocale)
}
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
      <h1 class="text-base font-semibold text-gray-100">{{ $t('settings.title') }}</h1>
    </div>

    <div class="max-w-2xl mx-auto space-y-6">

      <!-- Language -->
      <section class="settings-section">
        <h2 class="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-3">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>
          {{ $t('settings.language.title') }}
        </h2>
        <div>
          <label class="settings-label">{{ $t('settings.language.label') }}</label>
          <select v-model="selectedLanguage" class="settings-input" @change="onLanguageChange">
            <option v-for="lang in languages" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
          </select>
        </div>
      </section>

      <!-- Playback -->
      <section class="settings-section">
        <h2 class="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-3">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" /></svg>
          {{ $t('settings.playback.title') }}
        </h2>

        <AppToggle
          v-model="settings.lefty"
          @change="settings.save()"
        >{{ $t('settings.playback.lefty') }}</AppToggle>

        <div>
          <label class="settings-label">{{ $t('settings.playback.defaultArrangement') }}</label>
          <select
            v-model="settings.defaultArrangement"
            class="settings-input"
            @change="settings.save()"
          >
            <option value="auto">{{ $t('settings.playback.arrangementAuto') }}</option>
            <option value="lead">{{ $t('settings.playback.arrangementLead') }}</option>
            <option value="rhythm">{{ $t('settings.playback.arrangementRhythm') }}</option>
            <option value="bass">{{ $t('settings.playback.arrangementBass') }}</option>
          </select>
        </div>

        <div>
          <label class="settings-label">{{ $t('settings.playback.psarcPlatform') }}</label>
          <select
            v-model="settings.psarcPlatform"
            class="settings-input"
            @change="settings.save()"
          >
            <option value="all">{{ $t('settings.playback.platformAll') }}</option>
            <option value="pc">{{ $t('settings.playback.platformPc') }}</option>
            <option value="mac">{{ $t('settings.playback.platformMac') }}</option>
          </select>
        </div>

        <div>
          <label class="settings-label">{{ $t('settings.playback.demucsUrl') }} <span class="text-gray-500">{{ $t('common.optional') }}</span></label>
          <div class="flex gap-2">
            <input v-model="settings.demucsUrl" type="url" :placeholder="$t('settings.playback.demucsPlaceholder')" class="settings-input flex-1" />
            <button class="settings-btn" @click="settings.save()">{{ $t('common.save') }}</button>
          </div>
        </div>
      </section>

      <!-- Library actions -->
      <ScanSection />

      <!-- Diagnostics -->
      <DiagnosticsSection />

      <!-- Plugin settings -->
      <PluginSettings v-for="p in plugins.settingsPlugins" :key="p.id" :plugin="p" />

      <!-- About -->
      <section class="settings-section">
        <h2 class="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-3">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
          {{ $t('settings.about.title') }}
        </h2>
        <div class="text-sm text-gray-400 space-y-1">
          <div>{{ $t('settings.about.version') }} <span class="text-gray-200 font-mono">{{ settings.version || '—' }}</span></div>
          <div class="flex gap-4 mt-2">
            <a
              v-if="settings.licenseUrl"
              :href="settings.licenseUrl"
              target="_blank"
              rel="noopener"
              class="text-accent hover:underline"
            >{{ $t('settings.about.license') }}</a>
            <a
              v-if="settings.sourceUrl"
              :href="settings.sourceUrl"
              target="_blank"
              rel="noopener"
              class="text-accent hover:underline"
            >{{ $t('settings.about.sourceCode') }}</a>

          </div>
          <div class="flex gap-4 mt-2">
            <p>
              {{ $t('settings.about.licenseNotice') }}
            </p>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>
