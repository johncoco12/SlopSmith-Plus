<script setup lang="ts">
defineOptions({ name: 'GearView' })
</script>

<template>
  <div class="min-h-screen bg-dark-800 px-4 pb-12">
    <div class="flex items-center gap-3 py-4 border-b border-white/[.06] mb-6">
      <h1 class="text-base font-semibold text-gray-100">{{ $t('gear.title') }}</h1>
    </div>

    <div class="max-w-2xl mx-auto">
      <div class="bg-dark-700 border border-white/[.06] rounded-xl p-8 text-center">
        <p class="text-gray-500">{{ $t('gear.placeholder') }}</p>
      </div>
    </div>
  </div>
</template>
