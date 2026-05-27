<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
}>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()

function onKeydown(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') emit('cancel')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

const CONFIRM_CLASS: Record<string, string> = {
  danger:  '!text-red-400 !border-red-500/30 !bg-red-500/10 hover:!bg-red-500/20',
  warning: '!text-orange-400 !border-orange-500/30 !bg-orange-500/10 hover:!bg-orange-500/20',
  default: 'primary',
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
        @click.self="emit('cancel')"
      >
        <div class="bg-dark-700 border border-white/[.08] rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
          <div v-if="$slots.icon" class="flex justify-center mb-3">
            <slot name="icon" />
          </div>

          <p class="text-gray-200 font-medium" :class="description ? 'mb-1' : 'mb-4'">{{ title }}</p>
          <p v-if="description" class="text-gray-500 text-sm mb-5">{{ description }}</p>

          <div class="flex justify-center gap-3">
            <button class="settings-btn" @click="emit('cancel')">
              {{ cancelLabel ?? 'Cancel' }}
            </button>
            <button
              class="settings-btn"
              :class="CONFIRM_CLASS[variant ?? 'default']"
              @click="emit('confirm')"
            >
              {{ confirmLabel ?? 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
