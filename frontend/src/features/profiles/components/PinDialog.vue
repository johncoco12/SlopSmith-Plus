<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SafeProfile } from '@/types'
import { useAuthStore } from '@/features/auth/store'
import { recoverProfile } from '@/features/auth/api'

const { t } = useI18n()

const props = defineProps<{
  profile: SafeProfile
  onSuccess: () => void
  onCancel: () => void
}>()

const auth = useAuthStore()
const mode = ref<'pin' | 'recovery'>('pin')

// ── PIN state ──────────────────────────────────────────────────────────────────
const PIN_MIN = 4
const PIN_MAX = 8
const DOT_COUNT = 4
const SUBMIT_DELAY_MS = 600

const pin = ref('')
const shake = ref(false)
const pinError = ref('')
const loading = ref(false)
const pinInputRef = ref<HTMLInputElement | null>(null)

const filledDots = computed(() => Math.min(pin.value.length, DOT_COUNT))
const hasOverflow = computed(() => pin.value.length > DOT_COUNT)

let _debounce: ReturnType<typeof setTimeout> | null = null

function scheduleSubmit() {
  if (_debounce) clearTimeout(_debounce)
  if (pin.value.length < PIN_MIN || loading.value) return
  _debounce = setTimeout(() => attemptSubmit(), SUBMIT_DELAY_MS)
}

function onPinInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, PIN_MAX)
  pin.value = raw
  ;(e.target as HTMLInputElement).value = raw
  scheduleSubmit()
}

function onPinKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && pin.value.length >= PIN_MIN && !loading.value) {
    if (_debounce) clearTimeout(_debounce)
    attemptSubmit()
  }
}

function triggerShake() {
  shake.value = true
  setTimeout(() => { shake.value = false }, 450)
}

function attemptSubmit() {
  if (pin.value.length < PIN_MIN || loading.value) return
  submitPin(pin.value)
}

async function submitPin(value: string) {
  if (loading.value) return
  loading.value = true
  pinError.value = ''
  try {
    await auth.login(props.profile.name, value)
    props.onSuccess()
  } catch (e: unknown) {
    pinError.value = (e as Error)?.message || t('profile.pin.error')
    triggerShake()
    pin.value = ''
    if (pinInputRef.value) pinInputRef.value.value = ''
    setTimeout(() => pinInputRef.value?.focus(), 50)
  } finally {
    loading.value = false
  }
}

// ── Recovery state ─────────────────────────────────────────────────────────────
const recoveryInput = ref('')
const recoveryError = ref(false)
const recoveryErrorMsg = ref('')

async function submitRecovery(e: Event) {
  e.preventDefault()
  if (loading.value || !recoveryInput.value.trim()) return
  loading.value = true
  recoveryError.value = false
  recoveryErrorMsg.value = ''
  try {
    await recoverProfile(props.profile.name, recoveryInput.value.trim(), '0000')
    await auth.login(props.profile.name, '0000')
    props.onSuccess()
  } catch (e: unknown) {
    recoveryError.value = true
    recoveryErrorMsg.value = (e as Error)?.message || t('profile.recovery.error')
    recoveryInput.value = ''
    setTimeout(() => { recoveryError.value = false }, 1500)
  } finally {
    loading.value = false
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') props.onCancel()
}

onMounted(() => {
  window.addEventListener('keydown', handleEscape)
  setTimeout(() => pinInputRef.value?.focus(), 50)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleEscape)
  if (_debounce) clearTimeout(_debounce)
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    @click.self="onCancel"
  >
    <div
      class="relative bg-dark-800 border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl"
      @click.stop
    >
      <!-- Profile avatar + name -->
      <div class="flex flex-col items-center gap-3 mb-8">
        <div class="w-14 h-14 rounded-full bg-accent/30 flex items-center justify-center text-xl font-bold text-white select-none">
          {{ profile.name.charAt(0).toUpperCase() }}
        </div>
        <div class="text-center">
          <p class="text-white font-semibold text-lg">{{ profile.name }}</p>
          <p class="text-gray-400 text-sm">
            {{ mode === 'pin' ? $t('profile.pin.instruction') : $t('profile.recovery.instruction') }}
          </p>
        </div>
      </div>

      <!-- PIN mode -->
      <template v-if="mode === 'pin'">
        <div
          class="flex flex-col items-center gap-5"
          :class="shake && 'animate-[shake_0.4s_ease-in-out]'"
        >
          <!-- Dots — click to refocus the hidden input -->
          <div class="flex gap-3 cursor-text" @click="pinInputRef?.focus()">
            <span
              v-for="i in DOT_COUNT"
              :key="i"
              class="dot"
              :class="i <= filledDots ? 'dot-filled' : 'dot-empty'"
            />
            <span v-if="hasOverflow" class="dot dot-overflow" />
          </div>

          <!-- Hidden input -->
          <input
            ref="pinInputRef"
            type="password"
            inputmode="numeric"
            autocomplete="current-password"
            :value="pin"
            class="sr-only"
            @input="onPinInput"
            @keydown="onPinKeydown"
          />

          <p class="text-xs text-gray-500 h-4">
            <span v-if="loading">Checking…</span>
            <span v-else-if="pin.length >= PIN_MIN">Press Enter or wait…</span>
            <span v-else>Enter your PIN</span>
          </p>
        </div>

        <p v-if="pinError" class="text-red-400 text-sm text-center mt-4">{{ pinError }}</p>

        <div class="mt-6 text-center">
          <button
            type="button"
            class="text-sm text-gray-400 hover:text-accent transition-colors"
            @click="mode = 'recovery'"
          >
            {{ $t('profile.pin.forgotLink') }}
          </button>
        </div>
      </template>

      <!-- Recovery mode -->
      <template v-else>
        <form @submit="submitRecovery" class="space-y-4">
          <div>
            <input
              v-model="recoveryInput"
              type="text"
              :placeholder="$t('profile.recovery.placeholder')"
              :disabled="loading"
              class="w-full bg-dark-700 border rounded-xl px-4 py-3 text-white text-sm
                     focus:outline-none focus:border-accent transition-colors"
              :class="recoveryError ? 'border-red-500' : 'border-dark-500'"
            />
            <p v-if="recoveryError" class="text-red-400 text-xs mt-1.5">
              {{ recoveryErrorMsg || $t('profile.recovery.error') }}
            </p>
          </div>
          <button
            type="submit"
            :disabled="!recoveryInput.trim() || loading"
            class="w-full py-2.5 rounded-xl bg-accent hover:bg-accent/80 disabled:opacity-40 text-white font-medium text-sm transition-colors"
          >
            {{ $t('profile.recovery.confirm') }}
          </button>
          <div class="text-center">
            <button
              type="button"
              class="text-sm text-gray-400 hover:text-accent transition-colors"
              @click="mode = 'pin'"
            >
              {{ $t('profile.recovery.backToPin') }}
            </button>
          </div>
        </form>
      </template>

      <div class="mt-6 text-center">
        <button
          type="button"
          class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          @click="onCancel"
        >
          {{ $t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dot {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  transition: all 0.12s ease;
  flex-shrink: 0;
}
.dot-empty    { background: theme('colors.dark.600'); }
.dot-filled   { background: theme('colors.accent.DEFAULT', '#4080e0'); transform: scale(1.15); }
.dot-overflow {
  background: theme('colors.accent.DEFAULT', '#4080e0');
  transform: scale(1.15);
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-8px); }
  40%       { transform: translateX(8px); }
  60%       { transform: translateX(-5px); }
  80%       { transform: translateX(5px); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
</style>
