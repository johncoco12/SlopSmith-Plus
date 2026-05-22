import { createRouter, createWebHashHistory } from 'vue-router'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'library',
      component: () => import('@/views/LibraryView.vue'),
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: () => import('@/views/FavoritesView.vue'),
    },
    {
      path: '/player/:filename',
      name: 'player',
      component: () => import('@/views/PlayerView.vue'),
    },
    {
      path: '/gear',
      name: 'gear',
      component: () => import('@/views/GearView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/plugin/:id',
      name: 'plugin',
      component: () => import('@/views/PluginView.vue'),
    },
  ],
})
