<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from '@/components/layout/AppNav.vue'
import { useSettingsStore } from '@/stores/settings'
import { usePluginsStore } from '@/stores/plugins'

const route = useRoute()
const settings = useSettingsStore()
const plugins = usePluginsStore()

const isPlayer = computed(() => route.name === 'player')

onMounted(async () => {
  await settings.load()
  await plugins.load()
})
</script>

<template>
  <div class="min-h-screen bg-dark-800 text-gray-200 font-sans">
    <AppNav v-if="!isPlayer" />
    <main :class="isPlayer ? '' : 'pt-14'">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['LibraryView', 'FavoritesView']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>
