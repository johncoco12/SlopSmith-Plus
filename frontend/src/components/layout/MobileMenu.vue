<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

interface NavLink {
  name: string
  label: string
  params?: { id: string }
  icon?: unknown
}

const props = defineProps<{
  open: boolean
  links: NavLink[]
}>()
const emit = defineEmits<{
  close: []
  upload: []
}>()

function isActive(link: NavLink): boolean {
  if (link.params) return route.params.id === link.params.id
  return route.name === link.name
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200"
    enter-from-class="-translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition-all duration-150"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="-translate-y-2 opacity-0"
  >
    <div
      v-if="open"
      class="md:hidden fixed top-14 inset-x-0 z-20 bg-dark-700 border-b border-white/[.06] shadow-xl px-4 py-3 space-y-1"
    >
      <router-link
        v-for="link in links"
        :key="link.name + (link.params?.id ?? '')"
        :to="link.params ? { name: link.name, params: link.params } : { name: link.name }"
        class="block px-3 py-2 rounded-lg text-sm transition"
        :class="isActive(link)
          ? 'bg-accent/20 text-accent'
          : 'text-gray-300 hover:bg-dark-600'"
        @click="emit('close')"
      >{{ link.label }}</router-link>

      <button
        class="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-dark-600 transition"
        @click="emit('upload'); emit('close')"
      >Upload songs</button>
    </div>
  </Transition>
</template>
