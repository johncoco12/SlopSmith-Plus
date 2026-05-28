<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSacStore } from '@/features/player/composables/useSac'
import { RefreshCw, Unplug } from 'lucide-vue-next'

const sac = useSacStore()
const { t } = useI18n()

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (sac.status === 'idle') sac.fetchSessions()
  pollTimer = setInterval(() => {
    if (sac.status === 'idle') sac.fetchSessions()
  }, 3_000)
})

onUnmounted(() => {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
})

const statusLabel = computed(() => {
  switch (sac.status) {
    case 'linking':    return t('player.sac.statusConnecting')
    case 'linked':     return t('player.sac.statusLinked', { name: sac.profileName })
    case 'monitoring': return t('player.sac.statusMonitoring', { name: sac.profileName })
    default:           return t('player.sac.statusIdle')
  }
})

const statusColor = computed(() => {
  switch (sac.status) {
    case 'linking':    return 'text-yellow-400'
    case 'linked':     return 'text-blue-400'
    case 'monitoring': return 'text-green-400'
    default:           return 'text-gray-500'
  }
})

const confidencePct = computed(() =>
  sac.lastPitch ? Math.round(sac.lastPitch.confidence * 100) : 0
)
</script>

<template>
  <div class="w-64 bg-dark-800 border border-white/[.08] rounded-xl shadow-2xl p-3 text-sm select-none">

    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <span class="text-xs font-semibold text-gray-300 tracking-wide uppercase">{{ t('player.sac.title') }}</span>
      <span :class="['text-[10px] font-medium', statusColor]">{{ statusLabel }}</span>
    </div>

    <!-- ── MONITORING: live pitch display ─────────────────────────────── -->
    <template v-if="sac.status === 'monitoring'">
      <div class="bg-dark-700/60 rounded-lg px-3 py-2.5 mb-3">
        <div class="flex items-end gap-2">
          <span class="text-3xl font-bold font-mono text-green-400 leading-none">
            {{ sac.lastPitch?.noteName ?? '—' }}
          </span>
          <span class="text-xs font-mono text-gray-400 mb-0.5 tabular-nums">
            {{ sac.lastPitch ? sac.lastPitch.frequency.toFixed(1) + ' Hz' : '' }}
          </span>
        </div>

        <!-- Confidence bar -->
        <div class="mt-2 h-1.5 bg-dark-600 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-100"
            :class="confidencePct > 85 ? 'bg-green-500' : confidencePct > 65 ? 'bg-yellow-400' : 'bg-red-500/70'"
            :style="{ width: confidencePct + '%' }"
          />
        </div>
        <div class="flex justify-between text-[9px] text-gray-600 mt-0.5">
          <span>{{ t('player.sac.confidence') }}</span>
          <span>{{ confidencePct }}%</span>
        </div>
      </div>

      <button
        class="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg
               text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10
               border border-white/[.06] hover:border-red-500/30 transition-colors"
        @click="sac.unlink()"
      >
        <Unplug :size="12" />
        {{ t('player.sac.disconnect') }}
      </button>
    </template>

    <!-- ── LINKED: waiting for track ─────────────────────────────────── -->
    <template v-else-if="sac.status === 'linked'">
      <p class="text-xs text-gray-500 mb-3 leading-relaxed">
        {{ t('player.sac.waitingForTrack') }}
      </p>
      <button
        class="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg
               text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10
               border border-white/[.06] hover:border-red-500/30 transition-colors"
        @click="sac.unlink()"
      >
        <Unplug :size="12" />
        {{ t('player.sac.disconnect') }}
      </button>
    </template>

    <!-- ── IDLE / LINKING: session list ──────────────────────────────── -->
    <template v-else>
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] text-gray-500">{{ t('player.sac.availableSessions') }}</span>
        <button
          class="text-gray-600 hover:text-gray-300 transition-colors p-0.5 rounded"
          :class="{ 'animate-spin': sac.loadingSessions }"
          :title="t('player.sac.refresh')"
          @click="sac.fetchSessions()"
        >
          <RefreshCw :size="11" />
        </button>
      </div>

      <div v-if="sac.error" class="text-[11px] text-red-400 mb-2 px-1">{{ sac.error }}</div>

      <div v-if="sac.loadingSessions" class="text-[11px] text-gray-600 py-3 text-center">
        {{ t('player.sac.scanning') }}
      </div>

      <div v-else-if="sac.availableSessions.length === 0"
           class="text-[11px] text-gray-600 py-3 text-center leading-relaxed">
        {{ t('player.sac.noSessions') }}<br>
        {{ t('player.sac.launchHint') }}
      </div>

      <ul v-else class="space-y-1 mb-2">
        <li
          v-for="session in sac.availableSessions"
          :key="session.sessionId"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg
                   border border-white/[.05] hover:border-accent/40 hover:bg-accent/5
                   transition-colors group text-left"
            @click="sac.linkSession(session.sessionId)"
          >
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-200 truncate">{{ session.profileName }}</p>
              <p class="text-[10px] text-gray-600">{{ session.sacIp }}</p>
            </div>
            <span
              v-if="session.linked"
              class="text-[9px] text-yellow-400/80 border border-yellow-400/30 rounded px-1 py-0.5 shrink-0"
            >{{ t('player.sac.inUse') }}</span>
            <span
              v-else
              class="text-[10px] text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >{{ t('player.sac.connect') }}</span>
          </button>
        </li>
      </ul>
    </template>

  </div>
</template>
