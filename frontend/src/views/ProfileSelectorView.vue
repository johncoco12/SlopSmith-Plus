<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Lock } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { listProfiles } from '@/api/profiles'
import type { SafeProfile } from '@/types'
import PinDialog from '@/components/profile/PinDialog.vue'

const router = useRouter()
const auth = useAuthStore()
const settings = useSettingsStore()
const profiles = ref<SafeProfile[]>([])
const pendingProfile = ref<SafeProfile | null>(null)

onMounted(async () => {
  try {
    profiles.value = await listProfiles()
  } catch (e) {
    console.error('Failed to load profiles', e)
  }
})

async function handleSelect(profile: SafeProfile) {
  pendingProfile.value = profile
}

function onPinSuccess() {
  pendingProfile.value = null
  router.push('/')
}

const PROFILE_COLORS = [
  '#4080e0', '#e8c040', '#ef4444', '#22c55e', '#a855f7',
  '#f97316', '#06b6d4', '#ec4899', '#84cc16', '#6366f1',
]

function profileColor(id: number) {
  return PROFILE_COLORS[id % PROFILE_COLORS.length]
}
</script>

<template>
  <div class="fixed inset-0 flex flex-col items-center justify-center bg-dark-800 px-4">

    <div class="mb-10 text-center flex flex-col items-center gap-3">
      <router-link :to="{ name: 'library' }" class="logo-link shrink-0 block">
        <span class="logo-wrap">
          <span class="logo-base">Slopsmith+</span>
          <span class="logo-svg" aria-hidden="true">Slopsmith+</span>
        </span>
      </router-link>
      <div>
        <h1 class="text-lg font-semibold text-white mb-1">{{ $t('profiles.selectTitle') }}</h1>
        <p class="text-gray-400 text-sm">{{ $t('profiles.selectSubtitle') }}</p>
      </div>
    </div>

    <div class="flex flex-wrap gap-6 justify-center max-w-2xl">
      <button
        v-for="profile in profiles"
        :key="profile.id"
        class="w-32 flex flex-col items-center gap-3 p-3 rounded-2xl border-2 transition-all
               border-transparent hover:border-accent hover:scale-105"
        @click="handleSelect(profile)"
      >
        <div class="relative">
          <div
            class="rounded-full p-0.5 overflow-hidden"
            :style="{ background: profileColor(profile.id) }"
          >
            <div
              class="w-[72px] h-[72px] rounded-full flex items-center justify-center text-2xl font-bold text-white select-none"
              :style="{ background: profileColor(profile.id) }"
            >
              {{ profile.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          <div v-if="profile.locked" class="absolute -bottom-1 -right-1 bg-dark-800 border border-dark-500 rounded-full p-1">
            <Lock :size="12" class="text-gray-300" />
          </div>
        </div>
        <span class="text-white text-sm font-medium text-center leading-tight max-w-full truncate w-full">
          {{ profile.name }}
        </span>
      </button>
    </div>

    <PinDialog
      v-if="pendingProfile"
      :profile="pendingProfile"
      :on-success="onPinSuccess"
      :on-cancel="() => pendingProfile = null"
    />

    <span v-if="settings.version" class="fixed bottom-3 right-4 t-mono opacity-35 text-gray-400">{{ settings.version }}</span>
  </div>
</template>

<style scoped>
.logo-link { text-decoration: none; }
.logo-wrap { position: relative; display: inline-block; font-weight: 700; font-size: 2.5rem; letter-spacing: -0.03em; line-height: 1; }
.logo-base, .logo-svg { display: block; white-space: nowrap; -webkit-background-clip: text; background-clip: text; color: transparent; }
.logo-base { background-image: linear-gradient(to right, #4080e0, #93c5fd); }
.logo-svg {
  position: absolute; inset: 0;
  background-image: url('@/assets/slopsmith_gituar.svg');
  background-size: 100% auto; background-position: 35% 45%;
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}
.logo-wrap:hover .logo-svg { clip-path: inset(0 0% 0 0); }
</style>