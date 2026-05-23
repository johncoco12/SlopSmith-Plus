<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const name = ref('')
const pinCode = ref('')
const pinConfirm = ref('')
const recoveryPhrase = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (!name.value.trim()) { error.value = t('setup.errors.nameRequired'); return }
  if (pinCode.value.length < 4) { error.value = t('setup.errors.pinTooShort'); return }
  if (pinCode.value !== pinConfirm.value) { error.value = t('setup.errors.pinMismatch'); return }
  if (recoveryPhrase.value.length < 4) { error.value = t('setup.errors.recoveryTooShort'); return }

  loading.value = true
  try {
    const profile = await auth.setup({
      name: name.value.trim(),
      pinCode: pinCode.value,
      recoveryPhrase: recoveryPhrase.value,
    })
    await auth.login(profile.name, pinCode.value)
    router.push('/')
  } catch (e: any) {
    error.value = e.message || t('setup.errors.failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-dark-800 flex items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <router-link :to="{ name: 'profiles' }" class="logo-link inline-block">
          <span class="logo-wrap">
            <span class="logo-base">Slopsmith+</span>
            <span class="logo-svg" aria-hidden="true">Slopsmith+</span>
          </span>
        </router-link>
        <h1 class="text-2xl font-bold text-white mt-4">{{ $t('setup.title') }}</h1>
        <p class="text-gray-400 text-sm mt-1">{{ $t('setup.subtitle') }}</p>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-1">{{ $t('setup.nameLabel') }}</label>
          <input v-model="name" type="text" autocomplete="username"
            class="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-accent transition-colors" />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">{{ $t('setup.pinLabel') }}</label>
          <input v-model="pinCode" type="password" autocomplete="new-password"
            class="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-accent transition-colors" />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">{{ $t('setup.pinConfirmLabel') }}</label>
          <input v-model="pinConfirm" type="password" autocomplete="new-password"
            class="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-accent transition-colors" />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">{{ $t('setup.recoveryLabel') }}</label>
          <input v-model="recoveryPhrase" type="text"
            class="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-accent transition-colors" />
        </div>

        <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

        <button type="submit" :disabled="loading"
          class="w-full bg-accent hover:bg-accent/80 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors">
          {{ loading ? $t('setup.creating') : $t('setup.submit') }}
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
</style>