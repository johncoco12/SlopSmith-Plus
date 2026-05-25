<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/features/auth/store'

const auth = useAuthStore()
const router = useRouter()

const name = ref('')
const pinCode = ref('')
const pinConfirm = ref('')
const recoveryPhrase = ref('')
const error = ref('')
const loading = ref(false)

const pinInputRef = ref<HTMLInputElement | null>(null)
const pinConfirmRef = ref<HTMLInputElement | null>(null)

const PIN_MIN = 4
const PIN_MAX = 8

const pinStrength = computed(() => {
  const len = pinCode.value.length
  if (len < PIN_MIN) return null
  if (len <= 5) return 'weak'
  if (len <= 6) return 'fair'
  return 'strong'
})

const strengthColor = computed(() => ({
  weak: 'bg-red-500',
  fair: 'bg-yellow-400',
  strong: 'bg-green-500',
}[pinStrength.value ?? ''] ?? ''))

const strengthLabel = computed(() => ({
  weak: 'Weak',
  fair: 'Fair',
  strong: 'Strong',
}[pinStrength.value ?? ''] ?? ''))

const pinMatchError = computed(() =>
  pinConfirm.value.length >= PIN_MIN && pinCode.value !== pinConfirm.value
    ? 'PINs do not match'
    : ''
)

function onPinInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, PIN_MAX)
  pinCode.value = raw
  ;(e.target as HTMLInputElement).value = raw
  if (raw.length === PIN_MAX) pinConfirmRef.value?.focus()
}

function onConfirmInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, PIN_MAX)
  pinConfirm.value = raw
  ;(e.target as HTMLInputElement).value = raw
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) { error.value = 'Name is required'; return }
  if (pinCode.value.length < PIN_MIN) { error.value = `PIN must be at least ${PIN_MIN} digits`; return }
  if (pinCode.value !== pinConfirm.value) { error.value = 'PINs do not match'; return }
  if (!recoveryPhrase.value.trim()) { error.value = 'Recovery phrase is required'; return }
  if (recoveryPhrase.value.trim().split(/\s+/).length < 2) {
    error.value = 'Use a phrase with at least two words'; return
  }

  loading.value = true
  try {
    await auth.setup({
      name: name.value.trim(),
      pinCode: pinCode.value,
      recoveryPhrase: recoveryPhrase.value.trim(),
    })
    await auth.login(name.value.trim(), pinCode.value)
    router.push('/')
  } catch (e: unknown) {
    error.value = (e as Error).message || 'Setup failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-dark-800 flex items-center justify-center p-4">
    <div class="w-full max-w-sm">

      <!-- Logo -->
      <div class="text-center mb-10">
        <router-link :to="{ name: 'profiles' }" class="logo-link inline-block">
          <span class="logo-wrap">
            <span class="logo-base">Slopsmith+</span>
            <span class="logo-svg" aria-hidden="true">Slopsmith+</span>
          </span>
        </router-link>
        <h1 class="text-2xl font-bold text-white mt-5">Create your profile</h1>
        <p class="text-gray-400 text-sm mt-1">You only do this once.</p>
      </div>

      <form @submit.prevent="submit" class="space-y-6">

        <!-- Name -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider">
            Display name
          </label>
          <input
            v-model="name"
            type="text"
            autocomplete="username"
            placeholder="e.g. Alex"
            class="input-field"
          />
        </div>

        <!-- PIN -->
        <div class="space-y-1.5">
          <div class="flex items-baseline justify-between">
            <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider">
              PIN
            </label>
            <span class="text-xs text-gray-500">{{ PIN_MIN }}–{{ PIN_MAX }} digits</span>
          </div>

          <!-- Dot display -->
          <div
            class="flex items-center gap-2 cursor-text"
            @click="pinInputRef?.focus()"
          >
            <span
              v-for="i in PIN_MAX"
              :key="i"
              class="dot"
              :class="i <= pinCode.length ? 'dot-filled' : 'dot-empty'"
            />
          </div>

          <!-- Hidden numeric input -->
          <input
            ref="pinInputRef"
            type="password"
            inputmode="numeric"
            autocomplete="new-password"
            :value="pinCode"
            class="sr-only"
            @input="onPinInput"
          />

          <!-- Strength bar -->
          <div v-if="pinCode.length >= PIN_MIN" class="flex items-center gap-2 mt-1">
            <div class="flex-1 h-1 rounded-full bg-dark-600 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="strengthColor"
                :style="{ width: `${(pinCode.length / PIN_MAX) * 100}%` }"
              />
            </div>
            <span class="text-xs" :class="{
              'text-red-400': pinStrength === 'weak',
              'text-yellow-400': pinStrength === 'fair',
              'text-green-400': pinStrength === 'strong',
            }">{{ strengthLabel }}</span>
          </div>
        </div>

        <!-- PIN confirm -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider">
            Confirm PIN
          </label>

          <div
            class="flex items-center gap-2 cursor-text"
            @click="pinConfirmRef?.focus()"
          >
            <span
              v-for="i in PIN_MAX"
              :key="i"
              class="dot"
              :class="[
                i <= pinConfirm.length
                  ? (pinMatchError ? 'dot-error' : 'dot-filled')
                  : 'dot-empty'
              ]"
            />
          </div>

          <input
            ref="pinConfirmRef"
            type="password"
            inputmode="numeric"
            autocomplete="new-password"
            :value="pinConfirm"
            class="sr-only"
            @input="onConfirmInput"
          />

          <p v-if="pinMatchError" class="text-xs text-red-400">{{ pinMatchError }}</p>
        </div>

        <!-- Recovery phrase -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider">
            Recovery phrase
          </label>
          <p class="text-xs text-gray-500 leading-relaxed">
            Used to reset your PIN if you forget it. Pick something memorable, not a password.
          </p>
          <input
            v-model="recoveryPhrase"
            type="text"
            autocomplete="off"
            placeholder="e.g. my first guitar was red"
            class="input-field"
          />
        </div>

        <!-- Error -->
        <p v-if="error" class="text-sm text-red-400 text-center">{{ error }}</p>

        <!-- Submit -->
        <button
          type="submit"
          :disabled="loading || pinCode.length < PIN_MIN || !!pinMatchError || !recoveryPhrase.trim()"
          class="w-full bg-accent hover:bg-accent/80 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {{ loading ? 'Creating…' : 'Create profile' }}
        </button>

      </form>
    </div>
  </div>
</template>

<style scoped>
.logo-link { text-decoration: none; }
.logo-wrap { position: relative; display: inline-block; font-weight: 700; font-size: 1.125rem; letter-spacing: -0.025em; line-height: 1; }
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

.input-field {
  width: 100%;
  background: theme('colors.dark.700');
  border: 1px solid theme('colors.dark.500');
  border-radius: 0.75rem;
  padding: 0.625rem 0.875rem;
  color: white;
  font-size: 0.875rem;
  transition: border-color 0.15s;
  outline: none;
}
.input-field:focus { border-color: theme('colors.accent.DEFAULT', '#4080e0'); }
.input-field::placeholder { color: theme('colors.dark.400', '#6b7280'); }

.dot {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  transition: all 0.15s ease;
}
.dot-empty { background: theme('colors.dark.600'); }
.dot-filled { background: theme('colors.accent.DEFAULT', '#4080e0'); transform: scale(1.1); }
.dot-error  { background: theme('colors.red.500'); transform: scale(1.1); }
</style>
