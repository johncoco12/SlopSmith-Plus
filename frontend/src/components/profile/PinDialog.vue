<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SafeProfile } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { recoverProfile } from '@/api/auth'

const { t } = useI18n()

const props = defineProps<{
  profile: SafeProfile
  onSuccess: () => void
  onCancel: () => void
}>()

const auth = useAuthStore()
const mode = ref<'pin' | 'recovery'>('pin')
const digits = ref(['', '', '', ''])
const shake = ref(false)
const pinError = ref('')
const recoveryInput = ref('')
const recoveryError = ref('')
const recoveryErrorMsg = ref('')
const loading = ref(false)
const refs = ref<HTMLInputElement[]>([])

function setRef(el: any, i: number) {
  if (el) refs.value[i] = el as HTMLInputElement
}

function handleDigit(i: number, e: Event) {
  const val = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1)
  const next = [...digits.value]
  next[i] = val
  digits.value = next
  if (val && i < 3 && refs.value[i + 1]) {
    refs.value[i + 1].focus()
  }
  if (next.every((d) => d !== '')) {
    submitPin(next.join(''))
  }
}

function handleKey(i: number, e: KeyboardEvent) {
  if (e.key === 'Backspace' && !digits.value[i] && i > 0 && refs.value[i - 1]) {
    refs.value[i - 1].focus()
  }
}

function triggerShake() {
  shake.value = true
  setTimeout(() => { shake.value = false }, 450)
}

async function submitPin(pin: string) {
  if (loading.value) return
  loading.value = true
  pinError.value = ''
  try {
    await auth.login(props.profile.name, pin)
    props.onSuccess()
  } catch (e: any) {
    pinError.value = e?.message || t('profile.pin.error')
    triggerShake()
    digits.value = ['', '', '', '']
    setTimeout(() => refs.value[0]?.focus(), 50)
  } finally {
    loading.value = false
  }
}

async function submitRecovery(e: Event) {
  e.preventDefault()
  if (loading.value) return
  loading.value = true
  recoveryError.value = ''
  recoveryErrorMsg.value = ''
  try {
    await recoverProfile(props.profile.name, recoveryInput.value.trim(), '0000')
    await auth.login(props.profile.name, '0000')
    props.onSuccess()
  } catch (e: any) {
    recoveryError.value = 'yes'
    recoveryErrorMsg.value = e?.message || t('profile.recovery.error')
    recoveryInput.value = ''
    setTimeout(() => { recoveryError.value = '' }, 1500)
  } finally {
    loading.value = false
  }
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') props.onCancel()
}

onMounted(() => {
  window.addEventListener('keydown', handleEscape)
  setTimeout(() => refs.value[0]?.focus(), 50)
})
onUnmounted(() => window.removeEventListener('keydown', handleEscape))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" @click.self="onCancel">
    <div class="relative bg-dark-800 border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl" @click.stop>

      <div class="flex flex-col items-center gap-3 mb-8">
        <div class="w-14 h-14 rounded-full bg-accent/30 flex items-center justify-center text-xl font-bold text-white">
          {{ profile.name.charAt(0).toUpperCase() }}
        </div>
        <div class="text-center">
          <p class="text-white font-semibold text-lg">{{ profile.name }}</p>
          <p class="text-gray-400 text-sm">
            {{ mode === 'pin' ? $t('profile.pin.instruction') : $t('profile.recovery.instruction') }}
          </p>
        </div>
      </div>

      <template v-if="mode === 'pin'">
        <div :class="['flex gap-3 justify-center', shake && 'animate-[shake_0.4s_ease-in-out]']">
          <input
            v-for="(_, i) in 4"
            :key="i"
            :ref="(el) => setRef(el, i)"
            type="password"
            inputmode="numeric"
            maxlength="1"
            :value="digits[i]"
            class="w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-dark-700 text-white focus:outline-none focus:border-accent transition-colors"
            :class="digits[i] ? 'border-accent' : 'border-dark-500'"
            @input="handleDigit(i, $event)"
            @keydown="handleKey(i, $event)"
          />
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

      <template v-else>
        <form @submit="submitRecovery" class="space-y-4">
          <div>
            <input
              v-model="recoveryInput"
              ref="recoveryRef"
              type="text"
              :placeholder="$t('profile.recovery.placeholder')"
              :disabled="loading"
              class="w-full bg-dark-700 border rounded-xl px-4 py-3 text-white text-sm
                     focus:outline-none focus:border-accent transition-colors"
              :class="recoveryError ? 'border-red-500' : 'border-dark-500'"
            />
            <p v-if="recoveryError" class="text-red-400 text-xs mt-1.5">{{ recoveryErrorMsg || $t('profile.recovery.error') }}</p>
          </div>
          <button
            type="submit"
            :disabled="!recoveryInput.trim() || loading"
            class="w-full py-2.5 rounded-xl bg-accent hover:bg-accent/80 disabled:opacity-40 text-white font-medium text-sm transition-colors"
          >
            {{ $t('profile.recovery.confirm') }}
          </button>
          <div class="text-center">
            <button type="button" class="text-sm text-gray-400 hover:text-accent transition-colors" @click="mode = 'pin'">
              {{ $t('profile.recovery.backToPin') }}
            </button>
          </div>
        </form>
      </template>

      <div class="mt-6 text-center">
        <button type="button" class="text-xs text-gray-500 hover:text-gray-300 transition-colors" @click="onCancel">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>