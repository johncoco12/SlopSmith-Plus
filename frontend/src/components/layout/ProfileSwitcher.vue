<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ChevronDown, Settings, AudioWaveform, Users, LogOut, Shield } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { listProfiles } from '@/api/profiles'
import type { SafeProfile } from '@/types'
import PinDialog from '@/components/profile/PinDialog.vue'

const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n()
const menuOpen = ref(false)
const profiles = ref<SafeProfile[]>([])
const pendingProfile = ref<SafeProfile | null>(null)
const containerRef = ref<HTMLElement | null>(null)

const PROFILE_COLORS = [
  '#4080e0', '#e8c040', '#ef4444', '#22c55e', '#a855f7',
  '#f97316', '#06b6d4', '#ec4899', '#84cc16', '#6366f1',
]

function profileColor(id: number) {
  return PROFILE_COLORS[id % PROFILE_COLORS.length]
}

const otherProfiles = computed(() =>
  profiles.value.filter(p => p.id !== auth.profile?.id)
)

async function requestSwitch(profile: SafeProfile) {
  if (profile.locked) {
    pendingProfile.value = profile
    menuOpen.value = false
    return
  }
  try {
    await auth.login(profile.name, '')
    menuOpen.value = false
  } catch {
    pendingProfile.value = profile
    menuOpen.value = false
  }
}

function onPinSuccess() {
  pendingProfile.value = null
  menuOpen.value = false
}

async function loadProfiles() {
  try {
    profiles.value = await listProfiles()
  } catch { /* ignore */ }
}

function onClickOutside(e: PointerEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}

onMounted(() => {
  loadProfiles()
  document.addEventListener('pointerdown', onClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onClickOutside)
})

function logout() {
  auth.logout()
  menuOpen.value = false
}
</script>

<template>
  <div ref="containerRef" class="relative" v-if="auth.isLoggedIn">
    <button
      @click="menuOpen = !menuOpen"
      class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-300
             hover:text-white hover:bg-dark-600 transition-colors"
    >
      <div
        class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden"
        :style="{ background: profileColor(auth.profile!.id), boxShadow: `0 0 0 2px ${profileColor(auth.profile!.id)}` }"
      >
        {{ auth.profile?.name?.charAt(0)?.toUpperCase() ?? '?' }}
      </div>
      <span class="hidden sm:inline max-w-[80px] truncate">{{ auth.profile?.name }}</span>
      <ChevronDown :size="14" class="shrink-0 text-gray-500 transition-transform duration-200" :class="menuOpen && 'rotate-180'" />
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1 scale-97"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-1 scale-97"
    >
      <div v-if="menuOpen" class="absolute right-0 top-full mt-2 w-56 bg-dark-700 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">

        <div class="flex items-center gap-2.5 px-3 py-3 border-b border-white/[.06]">
          <div
            class="rounded-full overflow-hidden shrink-0"
            :style="{ width: '36px', height: '36px', boxShadow: `0 0 0 2px ${profileColor(auth.profile!.id)}` }"
          >
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
              :style="{ background: profileColor(auth.profile!.id) }"
            >
              {{ auth.profile?.name?.charAt(0)?.toUpperCase() }}
            </div>
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-white truncate">{{ auth.profile?.name }}</p>
            <p class="text-xs text-gray-400">{{ $t('profileSwitcher.activeProfile') }}</p>
          </div>
        </div>

        <div v-if="otherProfiles.length > 0" class="px-2 py-2 border-b border-white/[.06]">
          <p class="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">{{ $t('profileSwitcher.switchTo') }}</p>
          <button
            v-for="p in otherProfiles"
            :key="p.id"
            @click="requestSwitch(p)"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left text-sm text-gray-300 hover:text-white hover:bg-dark-600 transition-colors"
          >
            <div
              class="rounded-full overflow-hidden shrink-0"
              :style="{ width: '28px', height: '28px', boxShadow: `0 0 0 1.5px ${profileColor(p.id)}` }"
            >
              <div
                class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                :style="{ background: profileColor(p.id) }"
              >
                {{ p.name.charAt(0).toUpperCase() }}
              </div>
            </div>
            <span class="flex-1 truncate">{{ p.name }}</span>
            <Lock v-if="p.locked" :size="12" class="text-gray-500 shrink-0" />
          </button>
        </div>

        <div class="px-2 py-2">
          <button
            @click="router.push({ name: 'settings' }); menuOpen = false"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-dark-600 transition-colors"
          >
            <Settings :size="15" class="shrink-0" />
            <span>{{ $t('profileSwitcher.settings') }}</span>
          </button>
          <button
            v-if="auth.isAdmin"
            @click="router.push({ name: 'admin' }); menuOpen = false"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-dark-600 transition-colors"
          >
            <Shield :size="15" class="shrink-0" />
            <span>{{ $t('profileSwitcher.admin') }}</span>
          </button>
          <button
            @click="router.push({ name: 'audio-settings' }); menuOpen = false"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-dark-600 transition-colors"
          >
            <AudioWaveform :size="15" class="shrink-0" />
            <span>{{ $t('profileSwitcher.audio') }}</span>
          </button>
          <button
            @click="router.push({ name: 'profiles' }); menuOpen = false"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-dark-600 transition-colors"
          >
            <Users :size="15" class="shrink-0" />
            <span>{{ $t('profileSwitcher.manageProfiles') }}</span>
          </button>
          <button
            @click="logout()"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-dark-600 transition-colors"
          >
            <LogOut :size="15" class="shrink-0" />
            <span>{{ $t('profileSwitcher.signOut') }}</span>
          </button>
        </div>
      </div>
    </Transition>

    <PinDialog
      v-if="pendingProfile"
      :profile="pendingProfile"
      :on-success="onPinSuccess"
      :on-cancel="() => pendingProfile = null"
    />
  </div>
</template>