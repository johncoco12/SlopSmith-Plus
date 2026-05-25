<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: unknown
  value?: unknown
}>()
const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const isChecked = computed(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue.includes(props.value)
  return !!props.modelValue
})

function onChange() {
  if (Array.isArray(props.modelValue)) {
    const arr = [...props.modelValue]
    const idx = arr.indexOf(props.value)
    if (idx === -1) arr.push(props.value)
    else arr.splice(idx, 1)
    emit('update:modelValue', arr)
  } else {
    emit('update:modelValue', !props.modelValue)
  }
}
</script>

<template>
  <label class="flex items-center gap-2.5 cursor-pointer select-none group">
    <!-- Visually hidden native input preserves keyboard + screen-reader support -->
    <input
      type="checkbox"
      :checked="isChecked"
      class="sr-only"
      @change="onChange"
    />

    <!-- Custom box -->
    <span
      class="w-4 h-4 rounded shrink-0 flex items-center justify-center
             border transition-all duration-150 ring-offset-dark-700"
      :class="isChecked
        ? 'bg-accent border-accent shadow-sm shadow-accent/30'
        : 'bg-dark-600 border-white/20 group-hover:border-white/40 group-focus-within:border-accent/60'"
    >
      <Transition
        enter-active-class="transition-all duration-100"
        enter-from-class="scale-0 opacity-0"
        enter-to-class="scale-100 opacity-100"
        leave-active-class="transition-all duration-75"
        leave-from-class="scale-100 opacity-100"
        leave-to-class="scale-0 opacity-0"
      >
        <Check v-if="isChecked" :size="10" class="text-white" stroke-width="3.5" />
      </Transition>
    </span>

    <span class="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">
      <slot />
    </span>
  </label>
</template>
