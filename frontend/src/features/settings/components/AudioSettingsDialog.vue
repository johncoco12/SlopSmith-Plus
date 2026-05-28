<script setup lang="ts">
import { Mic } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AudioSettings from '@/features/settings/components/AudioSettings.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <AppDialog :open="open" size="lg" @close="emit('close')">

    <template #header>
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-8 h-8 rounded-lg bg-white/[.05] border border-white/[.07] flex items-center justify-center shrink-0">
          <Mic :size="15" class="text-gray-300" />
        </div>
        <h2 class="text-sm font-semibold text-gray-100">Audio Settings</h2>
      </div>
    </template>

    <AudioSettings />

  </AppDialog>
</template>
