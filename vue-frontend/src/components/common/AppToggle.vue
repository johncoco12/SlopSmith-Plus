<script setup>
defineProps({
  modelValue: { type: Boolean, required: true },
})
const emit = defineEmits(['update:modelValue', 'change'])

function toggle(val) {
  emit('update:modelValue', val)
  emit('change', val)
}
</script>

<template>
  <label class="flex items-center justify-between gap-4 cursor-pointer select-none group">
    <span class="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">
      <slot />
    </span>

    <!-- Track -->
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      class="relative w-10 h-[22px] rounded-full shrink-0
             transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-dark-700"
      :class="modelValue
        ? 'bg-accent shadow-sm shadow-accent/40'
        : 'bg-dark-500 border border-white/[.12]'"
      @click="toggle(!modelValue)"
    >
      <!-- Thumb -->
      <span
        class="absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white
               shadow-sm transition-transform duration-200 ease-in-out"
        :class="modelValue ? 'translate-x-[18px]' : 'translate-x-0'"
      />
    </button>
  </label>
</template>
