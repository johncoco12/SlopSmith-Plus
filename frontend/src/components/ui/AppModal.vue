<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  title?: string
  open: boolean
}>()
const emit = defineEmits<{
  close: []
}>()

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        @click.self="emit('close')"
      >
        <div
          class="bg-dark-700 border border-white/[.08] rounded-2xl shadow-2xl w-full max-w-lg"
          role="dialog"
          :aria-label="title"
        >
          <!-- Header -->
          <div v-if="title" class="flex items-center justify-between px-5 py-4 border-b border-white/[.06]">
            <h2 class="text-sm font-semibold text-gray-100">{{ title }}</h2>
            <button
              class="p-1.5 rounded-lg hover:bg-dark-500 text-gray-400 hover:text-gray-200 transition"
              aria-label="Close"
              @click="emit('close')"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body slot -->
          <div class="px-5 py-4">
            <slot />
          </div>

          <!-- Footer slot -->
          <div v-if="$slots.footer" class="px-5 pb-4">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
