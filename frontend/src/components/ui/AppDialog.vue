<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  open: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  bodyClass?: string
  noPad?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const SIZE_CLASS: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
}

function onKeydown(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        @click="emit('close')"
      />
    </Transition>

    <!-- Dialog -->
    <Transition
      enter-active-class="transition-[transform,opacity] duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-[transform,opacity] duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          class="bg-dark-700 border border-white/[.08] rounded-2xl w-full flex flex-col max-h-[88vh]
                 pointer-events-auto
                 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_32px_80px_rgba(0,0,0,0.75)]"
          :class="SIZE_CLASS[size ?? 'md']"
          role="dialog"
          :aria-modal="true"
          :aria-label="title"
          @click.stop
        >
          <!-- Header — always shown (close button always accessible) -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-white/[.06] shrink-0">
            <slot name="header">
              <h2 class="text-sm font-semibold text-gray-100 tracking-tight">{{ title ?? '' }}</h2>
            </slot>
            <button
              class="ml-3 p-1.5 -mr-1 rounded-lg hover:bg-white/[.07] text-gray-500 hover:text-gray-200
                     transition-colors shrink-0"
              aria-label="Close"
              @click="emit('close')"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div
            class="flex-1 min-h-0 overflow-y-auto"
            :class="[noPad ? '' : 'px-6 py-5', bodyClass]"
          >
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="px-6 pb-5 pt-4 border-t border-white/[.06] shrink-0">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
