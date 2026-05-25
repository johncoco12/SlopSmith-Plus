<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Upload, Menu, X, Library, Heart, Settings2, LayoutGrid, Settings } from 'lucide-vue-next'
import { useSettingsStore } from '@/features/settings/store'
import { usePluginsStore } from '@/features/plugins/store'
import { useAuthStore } from '@/features/auth/store'
import MobileMenu from './MobileMenu.vue'
import ProfileSwitcher from './ProfileSwitcher.vue'

const { t } = useI18n()

const route    = useRoute()
const settings = useSettingsStore()
const plugins  = usePluginsStore()
const auth     = useAuthStore()

const mobileOpen     = ref<boolean>(false)
const fileInput      = ref<HTMLInputElement | null>(null)
const uploadStatus   = ref<string>('')
const uploading      = ref(false)
const uploadProgress = ref(0)

const navLinks = computed(() => [
  { name: 'library',   label: t('nav.library'),   icon: Library   },
  { name: 'favorites', label: t('nav.favorites'), icon: Heart     },
  ...plugins.navPlugins.map(p => ({
    name:   'plugin',
    params: { id: p.id },
    label:  p.nav.label,
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