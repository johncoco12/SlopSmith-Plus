<script setup lang="ts">
import { useRouter } from 'vue-router'
import AudioSettings from '@/features/settings/components/AudioSettings.vue'

const router = useRouter()
</script>

<template>
  <div class="min-h-screen bg-dark-800 px-4 pb-12">
    <div class="flex items-center gap-3 py-4 border-b border-white/[.06] mb-6">
      <button
        class="p-1.5 rounded-lg hover:bg-dark-600 transition text-gray-400 hover:text-gray-200"
        aria-label="Back"
        @click="router.back()"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-base font-semibold text-gray-100">Audio Settings</h1>
    </div>

    <div class="max-w-2xl mx-auto">
      <AudioSettings />
    </div>
  </div>
</template>
