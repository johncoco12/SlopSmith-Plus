<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Upload, Menu, X, Library, Heart, Settings2, LayoutGrid, Settings, Cable, PlugZap, RefreshCw } from 'lucide-vue-next'
import { useSettingsStore } from '@/features/settings/store'
import { usePluginsStore } from '@/features/plugins/store'
import { useAuthStore } from '@/features/auth/store'
import { useSacStore } from '@/features/player/composables/useSac'
import { useImportJobs } from '@/features/library/composables/useImportJobs'
import SacPopover from '@/features/player/components/SacPopover.vue'
import PluginChainPanel from '@/features/player/components/PluginChainPanel.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import SettingsDialog from '@/features/settings/components/SettingsDialog.vue'
import AudioSettingsDialog from '@/features/settings/components/AudioSettingsDialog.vue'
import AdminDialog from '@/features/admin/components/AdminDialog.vue'
import UploadDialog from '@/features/library/components/UploadDialog.vue'
import MobileMenu from './MobileMenu.vue'
import ProfileSwitcher from './ProfileSwitcher.vue'

const { t } = useI18n()

const route    = useRoute()
const settings = useSettingsStore()
const plugins  = usePluginsStore()
const auth     = useAuthStore()

const sac              = useSacStore()
const { activeCount: uploadActiveCount, startPolling: startUploadPoll, stopPolling: stopUploadPoll } = useImportJobs()
const sacNavOpen          = ref<boolean>(false)
const pluginsNavOpen      = ref<boolean>(false)
const settingsOpen        = ref<boolean>(false)
const audioSettingsOpen   = ref<boolean>(false)
const adminOpen           = ref<boolean>(false)
const uploadOpen          = ref<boolean>(false)
const mobileOpen          = ref<boolean>(false)

type NavLink = { name: string; params?: { id: string }; label: string; icon: unknown }

const navLinks = computed<NavLink[]>(() => [
  { name: 'library',   label: t('nav.library'),   icon: Library   },
  { name: 'favorites', label: t('nav.favorites'), icon: Heart     },
  ...plugins.navPlugins.map(p => ({
    name:   'plugin',
    params: { id: p.id },
    label:  p.nav?.label ?? p.name,
    icon:   LayoutGrid,
  })),
  { name: 'gear',      label: t('nav.gear'),      icon: Settings  },
])

function isActive(link: { name: string; params?: { id: string } }): boolean {
  if (link.params) return route.params.id === link.params.id
  return route.name === link.name
}

onMounted(startUploadPoll)
onUnmounted(stopUploadPoll)
</script>

<template>
  <nav class="fixed top-0 inset-x-0 z-30 h-14 bg-dark-800/95 backdrop-blur-md border-b border-white/[.05] flex items-center px-5 gap-4">

    <!-- Logo — SVG guitar slides in through text mask on hover -->
    <router-link :to="{ name: 'library' }" class="logo-link shrink-0">
      <span class="logo-wrap">
        <span class="logo-base">Slopsmith+</span>
        <span class="logo-svg" aria-hidden="true">Slopsmith+</span>
      </span>
    </router-link>

    <!-- Version badge -->
    <span v-if="settings.version" class="hidden sm:inline t-mono opacity-35">{{ settings.version }}</span>

    <!-- Desktop nav links -->
    <div class="hidden md:flex items-center gap-0.5 flex-1 ml-1">
      <router-link
        v-for="link in navLinks"
        :key="link.name + (link.params?.id ?? '')"
        :to="link.params ? { name: link.name, params: link.params } : { name: link.name }"
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150"
        :class="isActive(link)
          ? 'bg-accent/15 text-accent'
          : 'text-gray-500 hover:text-gray-100 hover:bg-white/[.05]'"
      >
        <component :is="link.icon" :size="15" class="shrink-0" />
        {{ link.label }}
      </router-link>
    </div>

    <!-- Right side -->
    <div class="ml-auto flex items-center gap-2">

      <!-- SAC Connect + Audio Plugins + Settings -->
      <div class="hidden sm:flex items-center gap-1">

        <!-- Audio Plugins button (visible when SAC connected) -->
        <Transition
          enter-active-class="transition-all duration-150 overflow-hidden"
          enter-from-class="max-w-0 opacity-0"
          enter-to-class="max-w-[120px] opacity-100"
          leave-active-class="transition-all duration-100 overflow-hidden"
          leave-from-class="max-w-[120px] opacity-100"
          leave-to-class="max-w-0 opacity-0"
        >
          <button
            v-if="sac.status !== 'idle'"
            class="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[11px] font-medium
                   border transition-colors whitespace-nowrap"
            :class="pluginsNavOpen
              ? 'text-accent border-accent/40 bg-accent/10'
              : 'text-gray-400 bg-dark-600 border-white/[.06] hover:bg-dark-500 hover:text-gray-200'"
            :title="$t('player.plugins.title')"
            @click="pluginsNavOpen = !pluginsNavOpen"
          >
            <PlugZap :size="13" />
            {{ $t('player.plugins.audioPlugins') }}
          </button>
        </Transition>

        <!-- Settings icon button -->
        <button
          class="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors"
          :class="settingsOpen
            ? 'text-accent border-accent/30 bg-accent/10'
            : 'text-gray-400 bg-dark-600 border-white/[.06] hover:bg-dark-500 hover:text-gray-200'"
          :title="t('nav.settings')"
          @click="settingsOpen = !settingsOpen"
        >
          <Settings2 :size="14" />
        </button>

        <!-- Cable / SAC session button -->
        <div class="relative">
          <button
            class="flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium
                   border transition-colors"
            :class="sacNavOpen || sac.status !== 'idle'
              ? sac.status === 'monitoring'
                ? 'text-green-400 border-green-500/30 bg-green-500/10'
                : sac.status === 'linked'
                ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                : 'text-gray-300 border-white/[.08] bg-dark-600'
              : 'text-gray-400 bg-dark-600 border-white/[.06] hover:bg-dark-500 hover:text-gray-200'"
            :title="$t('nav.sacConnect')"
            @click="sacNavOpen = !sacNavOpen"
          >
            <Cable :size="14" />
          </button>
          <!-- Monitoring pulse -->
          <span
            v-if="sac.status === 'monitoring'"
            class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse pointer-events-none"
          />
          <Transition
            enter-active-class="transition-all duration-150 origin-top-right"
            enter-from-class="scale-95 opacity-0"
            enter-to-class="scale-100 opacity-100"
            leave-active-class="transition-all duration-100 origin-top-right"
            leave-from-class="scale-100 opacity-100"
            leave-to-class="scale-95 opacity-0"
          >
            <div v-if="sacNavOpen" class="absolute top-full mt-2 right-0 z-50">
              <SacPopover />
            </div>
          </Transition>
        </div>
      </div>

      <!-- Upload button with active-jobs badge -->
      <button
        class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
               border transition-colors relative"
        :class="uploadOpen
          ? 'text-accent border-accent/30 bg-accent/10'
          : 'text-gray-400 bg-dark-600 border-white/[.06] hover:bg-dark-500 hover:text-gray-200'"
        @click="uploadOpen = true"
      >
        <Upload :size="13" />
        {{ $t('nav.upload') }}
        <span
          v-if="uploadActiveCount > 0"
          class="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold
                 leading-4 text-center bg-accent text-white"
        >{{ uploadActiveCount }}</span>
      </button>

      <!-- Mobile hamburger -->
      <button
        class="md:hidden p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-dark-600 transition"
        :aria-expanded="mobileOpen"
        aria-label="Menu"
        @click="mobileOpen = !mobileOpen"
      >
        <component :is="mobileOpen ? X : Menu" :size="20" />
      </button>

      <ProfileSwitcher @open-settings="settingsOpen = true" @open-audio="audioSettingsOpen = true" @open-admin="adminOpen = true" />
    </div>
  </nav>

  <MobileMenu
    :open="mobileOpen"
    :links="navLinks"
    @close="mobileOpen = false"
    @upload="uploadOpen = true"
  />

  <!-- Plugin chain dialog (accessible from any view) -->
  <AppDialog
    :open="pluginsNavOpen"
    size="sm"
    no-pad
    body-class="flex flex-col min-h-[480px]"
    @close="pluginsNavOpen = false"
  >
    <template #header>
      <div class="flex items-center justify-between flex-1 min-w-0 mr-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="text-sm font-semibold text-gray-100">Audio Plugins</span>
          <span
            v-if="sac.profileName"
            class="text-[11px] font-medium text-blue-400/80 bg-blue-400/10 px-2 py-0.5 rounded-full shrink-0"
          >{{ sac.profileName }}</span>
        </div>
        <button
          class="p-1.5 rounded-lg hover:bg-white/[.07] text-gray-500 hover:text-gray-200 transition-colors shrink-0"
          :title="t('player.plugins.refresh')"
          @click="sac.requestChainState()"
        >
          <RefreshCw :size="14" />
        </button>
      </div>
    </template>

    <PluginChainPanel />
  </AppDialog>

  <!-- Settings dialog -->
  <SettingsDialog :open="settingsOpen" @close="settingsOpen = false" />

  <!-- Audio Settings dialog -->
  <AudioSettingsDialog :open="audioSettingsOpen" @close="audioSettingsOpen = false" />

  <!-- Upload dialog -->
  <UploadDialog :open="uploadOpen" @close="uploadOpen = false" />

  <!-- Admin dialog -->
  <AdminDialog :open="adminOpen" @close="adminOpen = false" />
</template>

<style scoped>
.logo-link {
  text-decoration: none;
}

.logo-wrap {
  position: relative;
  display: inline-block;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: -0.025em;
  line-height: 1;
}

.logo-base,
.logo-svg {
  display: block;
  white-space: nowrap;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.logo-base {
  background-image: linear-gradient(to right, #4080e0, #93c5fd);
}

.logo-svg {
  position: absolute;
  inset: 0;
  background-image: url('@/assets/slopsmith_gituar.svg');
  background-size: 100% auto;
  background-position: 35% 45%;
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}

.logo-wrap:hover .logo-svg {
  clip-path: inset(0 0% 0 0);
}
</style>