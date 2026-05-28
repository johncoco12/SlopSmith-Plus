<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Upload, Menu, X, Library, Heart, Settings2, LayoutGrid, Settings, Cable, PlugZap } from 'lucide-vue-next'
import { useSettingsStore } from '@/features/settings/store'
import { usePluginsStore } from '@/features/plugins/store'
import { useAuthStore } from '@/features/auth/store'
import { useSacStore } from '@/features/player/composables/useSac'
import SacPopover from '@/features/player/components/SacPopover.vue'
import PluginChainPanel from '@/features/player/components/PluginChainPanel.vue'
import MobileMenu from './MobileMenu.vue'
import ProfileSwitcher from './ProfileSwitcher.vue'

const { t } = useI18n()

const route    = useRoute()
const settings = useSettingsStore()
const plugins  = usePluginsStore()
const auth     = useAuthStore()

const sac              = useSacStore()
const sacNavOpen       = ref<boolean>(false)
const pluginsNavOpen   = ref<boolean>(false)
const mobileOpen     = ref<boolean>(false)
const fileInput      = ref<HTMLInputElement | null>(null)
const uploadStatus   = ref<string>('')
const uploading      = ref(false)
const uploadProgress = ref(0)

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
  { name: 'settings',  label: t('nav.settings'),  icon: Settings2 },
])

function isActive(link: { name: string; params?: { id: string } }): boolean {
  if (link.params) return route.params.id === link.params.id
  return route.name === link.name
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`
  return headers
}

async function pollJob(jobId: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 500))
    try {
      const res = await fetch(`/api/import/status/${jobId}`, { headers: authHeaders() })
      if (!res.ok) break
      const job = await res.json()
      uploadProgress.value = job.progress ?? 0
      uploadStatus.value = `Processing… ${job.progress ?? 0}%`
      if (job.status === 'completed') {
        uploadStatus.value = 'Done'
        return
      }
      if (job.status === 'failed') {
        uploadStatus.value = `Failed: ${job.error || 'Unknown error'}`
        return
      }
    } catch {
      break
    }
  }
}

async function handleUpload(e: Event): Promise<void> {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  uploading.value = true
  uploadProgress.value = 0
  uploadStatus.value = t('nav.uploading')
  const form = new FormData()
  for (const f of files) form.append('files', f)
  try {
    const res = await fetch('/api/import/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      uploadStatus.value = `Failed: ${body.error || res.statusText}`
      return
    }
    const data = await res.json()
    const jobs: { jobId: string }[] = data.jobs ?? (data.jobId ? [{ jobId: data.jobId }] : [])
    if (jobs.length === 0) {
      uploadStatus.value = t('nav.uploadInvalid')
      return
    }
    uploadStatus.value = t('nav.processing')
    const polls = jobs.map(j => pollJob(j.jobId))
    await Promise.all(polls)
    if (uploadStatus.value.startsWith(t('nav.processing')) || uploadStatus.value === t('nav.uploadDone')) {
      uploadStatus.value = t('nav.uploadDone')
    }
  } catch {
    uploadStatus.value = t('nav.uploadError')
  } finally {
    uploading.value = false
    setTimeout(() => { uploadStatus.value = ''; uploadProgress.value = 0 }, 3000)
    ;(e.target as HTMLInputElement).value = ''
  }
}
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
      <div v-if="uploadStatus" class="flex items-center gap-2 t-caption">
        <span>{{ uploadStatus }}</span>
        <div v-if="uploading && uploadProgress > 0 && uploadProgress < 100"
          class="w-20 h-1.5 bg-dark-600 rounded-full overflow-hidden">
          <div class="h-full bg-accent rounded-full transition-all duration-300"
            :style="{ width: uploadProgress + '%' }" />
        </div>
      </div>

      <!-- SAC Connect + Audio Plugins -->
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

      <button
        class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
               text-gray-400 bg-dark-600 border border-white/[.06]
               hover:bg-dark-500 hover:text-gray-200 transition"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        <Upload :size="13" />
        {{ $t('nav.upload') }}
      </button>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept=".psarc,.sloppak"
        class="hidden"
        :disabled="uploading"
        @change="handleUpload"
      />

      <!-- Mobile hamburger -->
      <button
        class="md:hidden p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-dark-600 transition"
        :aria-expanded="mobileOpen"
        aria-label="Menu"
        @click="mobileOpen = !mobileOpen"
      >
        <component :is="mobileOpen ? X : Menu" :size="20" />
      </button>

      <ProfileSwitcher />
    </div>
  </nav>

  <MobileMenu
    :open="mobileOpen"
    :links="navLinks"
    @close="mobileOpen = false"
    @upload="fileInput?.click()"
  />

  <!-- Plugin chain side panel (accessible from any view) -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-transform duration-200"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-150"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <div
        v-if="pluginsNavOpen"
        class="fixed left-0 top-14 bottom-0 z-40 flex flex-col shadow-2xl"
        style="width: 320px;"
      >
        <PluginChainPanel @close="pluginsNavOpen = false" />
      </div>
    </Transition>
  </Teleport>
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