<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Settings2 } from 'lucide-vue-next'
import { setLocale, getLocale, type SupportedLocale } from '@/plugins/i18n'
import { useSettingsStore } from '@/features/settings/store'
import { usePluginsStore } from '@/features/plugins/store'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import DiagnosticsSection from '@/features/settings/components/DiagnosticsSection.vue'
import PluginSettings from '@/features/settings/components/PluginSettings.vue'
import PluginSlot from '@/components/plugins/PluginSlot.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const settings = useSettingsStore()
const plugins  = usePluginsStore()

// ── Language ──────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en-EN', label: 'English'    },
  { code: 'de-DE', label: 'Deutsch'    },
  { code: 'es-ES', label: 'Español'    },
  { code: 'fr-FR', label: 'Français'   },
  { code: 'ja-JP', label: '日本語'      },
  { code: 'nl-NL', label: 'Nederlands' },
  { code: 'pl-PL', label: 'Polski'     },
]

const selectedLanguage = ref(getLocale())

function onLanguageChange(): void {
  setLocale(selectedLanguage.value as SupportedLocale)
}
</script>

<template>
  <AppDialog :open="open" size="lg" @close="emit('close')">

    <template #header>
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-8 h-8 rounded-lg bg-white/[.05] border border-white/[.07] flex items-center justify-center shrink-0">
          <Settings2 :size="15" class="text-gray-300" />
        </div>
        <div class="flex items-center gap-2.5 min-w-0">
          <h2 class="text-sm font-semibold text-gray-100">{{ t('settings.title') }}</h2>
          <span
            v-if="settings.version"
            class="text-[11px] font-mono text-gray-600 bg-white/[.04] px-2 py-0.5 rounded"
          >v{{ settings.version }}</span>
        </div>
      </div>
    </template>

    <div class="space-y-6">

      <!-- ── Language ── -->
      <section>
        <p class="dialog-section-label">{{ t('settings.language.title') }}</p>
        <div class="space-y-3 mt-3">
          <div>
            <label class="settings-label">{{ t('settings.language.label') }}</label>
            <select v-model="selectedLanguage" class="settings-input" @change="onLanguageChange">
              <option v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code">
                {{ lang.label }}
              </option>
            </select>
          </div>
        </div>
      </section>

      <div class="h-px bg-white/[.05]" />

      <!-- ── Playback ── -->
      <section>
        <p class="dialog-section-label">{{ t('settings.playback.title') }}</p>
        <div class="space-y-4 mt-3">

          <AppToggle v-model="settings.lefty" @change="settings.save()">
            {{ t('settings.playback.lefty') }}
          </AppToggle>

          <div>
            <label class="settings-label">{{ t('settings.playback.defaultArrangement') }}</label>
            <select v-model="settings.defaultArrangement" class="settings-input" @change="settings.save()">
              <option value="auto">{{ t('settings.playback.arrangementAuto') }}</option>
              <option value="lead">{{ t('settings.playback.arrangementLead') }}</option>
              <option value="rhythm">{{ t('settings.playback.arrangementRhythm') }}</option>
              <option value="bass">{{ t('settings.playback.arrangementBass') }}</option>
            </select>
          </div>

          <div>
            <label class="settings-label">{{ t('settings.playback.psarcPlatform') }}</label>
            <select v-model="settings.psarcPlatform" class="settings-input" @change="settings.save()">
              <option value="all">{{ t('settings.playback.platformAll') }}</option>
              <option value="pc">{{ t('settings.playback.platformPc') }}</option>
              <option value="mac">{{ t('settings.playback.platformMac') }}</option>
            </select>
          </div>

          <div>
            <label class="settings-label">
              {{ t('settings.playback.demucsUrl') }}
              <span class="text-gray-600 font-normal ml-1">{{ t('common.optional') }}</span>
            </label>
            <div class="flex gap-2">
              <input
                v-model="settings.demucsUrl"
                type="url"
                :placeholder="t('settings.playback.demucsPlaceholder')"
                class="settings-input flex-1"
              />
              <button class="settings-btn" @click="settings.save()">{{ t('common.save') }}</button>
            </div>
          </div>
        </div>
      </section>

      <div class="h-px bg-white/[.05]" />

      <!-- ── Diagnostics ── -->
      <DiagnosticsSection />

      <!-- ── Plugin settings ── -->
      <PluginSettings v-for="p in plugins.settingsPlugins" :key="p.id" :plugin="p" />
      <PluginSlot name="settings-panel" />

      <div class="h-px bg-white/[.05]" />

      <!-- ── About ── -->
      <section>
        <p class="dialog-section-label">{{ t('settings.about.title') }}</p>
        <div class="mt-3 space-y-2 text-sm text-gray-400">
          <p>
            {{ t('settings.about.version') }}
            <span class="text-gray-200 font-mono ml-1">{{ settings.version || '—' }}</span>
          </p>
          <div class="flex gap-4">
            <a
              v-if="settings.licenseUrl"
              :href="settings.licenseUrl"
              target="_blank"
              rel="noopener"
              class="text-accent hover:underline"
            >{{ t('settings.about.license') }}</a>
            <a
              v-if="settings.sourceUrl"
              :href="settings.sourceUrl"
              target="_blank"
              rel="noopener"
              class="text-accent hover:underline"
            >{{ t('settings.about.sourceCode') }}</a>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">{{ t('settings.about.licenseNotice') }}</p>
        </div>
      </section>

    </div>

  </AppDialog>
</template>

<style scoped>
.dialog-section-label {
  @apply text-[11px] font-semibold text-gray-500 uppercase tracking-widest;
}
</style>
