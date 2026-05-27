<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Lock } from 'lucide-vue-next'
import { useAuthStore } from '@/features/auth/store'
import { useSettingsStore } from '@/features/settings/store'
import { listProfiles } from '@/features/profiles/api'
import type { SafeProfile } from '@/types'
import PinDialog from '@/features/profiles/components/PinDialog.vue'

const router     = useRouter()
const auth       = useAuthStore()
const settings   = useSettingsStore()
const profiles   = ref<SafeProfile[]>([])
const pendingProfile = ref<SafeProfile | null>(null)
const coverIds   = ref<string[]>([])
const coversReady = ref(false)

// 5 rows, each scrolling at a slightly different speed and alternating direction.
const NUM_ROWS     = 5
const ROW_DURATION = [82, 68, 96, 74, 88] // seconds per full loop
const ROW_DIR      = ['left', 'right', 'left', 'right', 'left'] as const

// Each row: full cover list shifted by a per-row offset, then doubled.
// Translating by exactly -50% moves one full repetition → seamless infinite loop.
const rows = computed<string[][]>(() => {
  const ids = coverIds.value
  if (!ids.length) return []
  return Array.from({ length: NUM_ROWS }, (_, ri) => {
    const offset  = (ri * 9) % ids.length
    const shifted = [...ids.slice(offset), ...ids.slice(0, offset)]
    return [...shifted, ...shifted]
  })
})

onMounted(() => {
  // profiles and covers load independently so neither blocks the other
  listProfiles()
    .then(p => { profiles.value = p })
    .catch(e => console.error('Failed to load profiles', e))

  fetch('/api/covers?count=40')
    .then(r => r.json())
    .then((d: any) => { coverIds.value = d.trackIds ?? [] })
    .catch(() => {})
    .finally(() => { coversReady.value = true })
})

function handleSelect(profile: SafeProfile) {
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
  <div class="fixed inset-0 flex flex-col items-center justify-center bg-dark-900 px-4">

    <!-- ── Scrolling cover art background ──────────────────────────────── -->
    <Transition name="bg-fade">
      <div v-if="coversReady && rows.length" class="covers-bg" aria-hidden="true">

        <div class="covers-rows">
          <div
            v-for="(row, ri) in rows"
            :key="ri"
            class="covers-row"
            :class="`scroll-${ROW_DIR[ri]}`"
            :style="{ animationDuration: `${ROW_DURATION[ri]}s` }"
          >
            <img
              v-for="(id, ci) in row"
              :key="`${ri}-${ci}`"
              :src="`/api/tracks/${id}/cover`"
              class="cover-tile"
              draggable="false"
              @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
            />
          </div>
        </div>

        <!-- darkening tint -->
        <div class="covers-overlay" />
        <!-- soft gradient edges so rows don't hard-clip -->
        <div class="covers-fade-top" />
        <div class="covers-fade-bottom" />

      </div>
    </Transition>

    <!-- ── Profile content ─────────────────────────────────────────────── -->
    <div class="relative z-10 flex flex-col items-center">

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
          class="profile-btn"
          @click="handleSelect(profile)"
        >
          <div class="relative">
            <div class="avatar-ring" :style="{ background: profileColor(profile.id) }">
              <div class="avatar" :style="{ background: profileColor(profile.id) }">
                {{ profile.name.charAt(0).toUpperCase() }}
              </div>
            </div>
            <div v-if="profile.locked" class="lock-badge">
              <Lock :size="12" class="text-gray-300" />
            </div>
          </div>
          <span class="profile-name">{{ profile.name }}</span>
        </button>
      </div>

    </div>

    <PinDialog
      v-if="pendingProfile"
      :profile="pendingProfile"
      :on-success="onPinSuccess"
      :on-cancel="() => pendingProfile = null"
    />

    <span v-if="settings.version" class="fixed bottom-3 right-4 t-mono opacity-35 text-gray-400 z-10">
      {{ settings.version }}
    </span>
  </div>
</template>

<style scoped>
/* ── Cover art background ───────────────────────────────────────── */
.covers-bg {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* Extend 12% beyond viewport top/bottom so scrolling rows never expose
   the solid bg-dark-900 base while the rows are animating. */
.covers-rows {
  position: absolute;
  top: -12%;
  bottom: -12%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.covers-row {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
  will-change: transform;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.cover-tile {
  width: 160px;
  height: 160px;
  object-fit: cover;
  flex-shrink: 0;
  border-radius: 6px;
  display: block;
  filter: brightness(0.72) saturate(1.1);
}

.covers-overlay {
  position: absolute;
  inset: 0;
  background: rgba(8, 8, 18, 0.60);
}

.covers-fade-top {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 220px;
  background: linear-gradient(to bottom, #08080e, transparent);
}

.covers-fade-bottom {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 220px;
  background: linear-gradient(to top, #08080e, transparent);
}

@keyframes scrollLeft {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@keyframes scrollRight {
  from { transform: translateX(-50%); }
  to   { transform: translateX(0); }
}
.scroll-left  { animation-name: scrollLeft; }
.scroll-right { animation-name: scrollRight; }

/* Fade the whole background in once covers have loaded */
.bg-fade-enter-active { transition: opacity 1.4s ease; }
.bg-fade-enter-from   { opacity: 0; }

/* ── Profile cards ──────────────────────────────────────────────── */
.profile-btn {
  width: 8rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 1.125rem;
  border: 2px solid transparent;
  background: transparent;
  transition: border-color 0.2s ease, transform 0.2s ease,
              background 0.2s ease, box-shadow 0.2s ease;
}
.profile-btn:hover {
  border-color: theme('colors.accent.DEFAULT', '#4080e0');
  transform: scale(1.07) translateY(-3px);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 8px 32px rgba(64, 128, 224, 0.20),
              0 0 0 4px rgba(64, 128, 224, 0.06);
}

.avatar-ring {
  border-radius: 9999px;
  padding: 2px;
}
.avatar {
  width: 72px;
  height: 72px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  user-select: none;
}
.lock-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: theme('colors.dark.800');
  border: 1px solid theme('colors.dark.500');
  border-radius: 9999px;
  padding: 4px;
}
.profile-name {
  color: #fff;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: center;
  line-height: 1.25;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

/* ── Logo ───────────────────────────────────────────────────────── */
.logo-link { text-decoration: none; }
.logo-wrap {
  position: relative;
  display: inline-block;
  font-weight: 700;
  font-size: 2.5rem;
  letter-spacing: -0.03em;
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
.logo-base { background-image: linear-gradient(to right, #4080e0, #93c5fd); }
.logo-svg {
  position: absolute; inset: 0;
  background-image: url('@/assets/slopsmith_gituar.svg');
  background-size: 100% auto;
  background-position: 35% 45%;
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}
.logo-wrap:hover .logo-svg { clip-path: inset(0 0% 0 0); }
</style>
