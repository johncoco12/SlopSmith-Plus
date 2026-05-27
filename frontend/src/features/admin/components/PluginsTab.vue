<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePluginsStore } from '@/features/plugins/store'
import { fetchProviders, setActiveProvider, enablePlugin, disablePlugin } from '@/features/plugins/api'

interface PluginCapabilities {
  hasScreen: boolean
  hasScript: boolean
  hasSettings: boolean
  hasTour: boolean
  hasComponent: boolean
}

interface PluginDetail {
  id: string
  name: string
  version?: string
  bundled?: boolean
  capabilities?: PluginCapabilities
  state?: string
  error?: string
}

interface Provider {
  name: string
  active: boolean
}

interface ProviderGroup {
  type: string
  providers: Provider[]
}

const pluginsStore  = usePluginsStore()
const plugins       = computed(() => pluginsStore.plugins as unknown as PluginDetail[])
const providers     = ref<ProviderGroup[]>([])
const providerError = ref('')
const settingKey    = ref('') // "type:name" that is being activated
const togglingId    = ref('')
const restarting    = ref(false)
const toggleError   = ref('')

async function waitForBackend(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500))
    try {
      const res = await fetch('/api/startup-status')
      if (res.ok) return
    } catch { /* still down */ }
  }
}

async function togglePlugin(p: PluginDetail) {
  if (togglingId.value || restarting.value) return
  togglingId.value = p.id
  toggleError.value = ''
  try {
    if (p.state === 'disabled') {
      await enablePlugin(p.id)
    } else {
      await disablePlugin(p.id)
    }
    // Both enable and disable restart the backend so routes are cleanly registered/removed
    restarting.value = true
    togglingId.value = ''
    await waitForBackend()
    window.location.reload()
  } catch (e: any) {
    toggleError.value = e.message ?? 'Failed to toggle plugin'
    togglingId.value = ''
  }
}

async function loadProviders() {
  try {
    providers.value = (await fetchProviders()) as ProviderGroup[]
  } catch (e: any) {
    providerError.value = e.message ?? 'Failed to load providers'
  }
}

async function activateProvider(type: string, name: string) {
  settingKey.value = `${type}:${name}`
  try {
    await setActiveProvider(type, name)
    providerError.value = ''
    await loadProviders()
  } catch (e: any) {
    providerError.value = e.message ?? 'Failed to set provider'
  } finally {
    settingKey.value = ''
  }
}

onMounted(loadProviders)

type StateKey = 'active' | 'errored' | 'setting_up' | 'loading' | 'tearing_down' | 'disabled' | 'discovered'

const STATE_DOT: Record<string, string> = {
  active:       'bg-emerald-400',
  errored:      'bg-red-500',
  setting_up:   'bg-amber-400',
  loading:      'bg-amber-400',
  tearing_down: 'bg-amber-400',
  disabled:     'bg-gray-600',
  discovered:   'bg-blue-400',
}

const STATE_LABEL: Record<string, string> = {
  active:       'Active',
  errored:      'Error',
  setting_up:   'Starting',
  loading:      'Loading',
  tearing_down: 'Stopping',
  disabled:     'Disabled',
  discovered:   'Pending',
}

const STATE_BADGE: Record<string, string> = {
  active:       'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
  errored:      'bg-red-500/15 border-red-500/30 text-red-400',
  setting_up:   'bg-amber-500/15 border-amber-500/30 text-amber-400',
  loading:      'bg-amber-500/15 border-amber-500/30 text-amber-400',
  tearing_down: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
  disabled:     'bg-gray-700 border-gray-600 text-gray-500',
  discovered:   'bg-blue-500/15 border-blue-500/30 text-blue-400',
}

function stateDot(state?: string)   { return STATE_DOT[state   ?? 'discovered'] ?? STATE_DOT.discovered }
function stateLabel(state?: string) { return STATE_LABEL[state ?? 'discovered'] ?? 'Unknown' }
function stateBadge(state?: string) { return STATE_BADGE[state ?? 'discovered'] ?? STATE_BADGE.discovered }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="restarting"
      class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-dark-800/95 backdrop-blur-sm"
    >
      <svg class="w-8 h-8 text-accent animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5" />
      </svg>
      <p class="text-sm font-medium text-gray-200">Restarting server…</p>
      <p class="text-xs text-gray-500">The page will reload automatically</p>
    </div>
  </Teleport>

  <div class="space-y-6">

    <div>
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm text-gray-400">
          {{ plugins.length }} plugin{{ plugins.length === 1 ? '' : 's' }} discovered
        </p>
        <span class="text-xs text-gray-600">Changes take effect immediately</span>
      </div>

      <div
        v-if="toggleError"
        class="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-400 flex items-center justify-between"
      >
        {{ toggleError }}
        <button class="text-gray-500 hover:text-gray-300 ml-2" @click="toggleError = ''">✕</button>
      </div>

      <div v-if="plugins.length === 0" class="text-center py-12 text-gray-500 text-sm">
        No plugins found
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="p in plugins"
          :key="p.id"
          class="settings-section !space-y-0"
        >
          <div class="flex items-start gap-4">

            <div class="relative shrink-0 mt-0.5">
              <div class="w-10 h-10 rounded-xl bg-dark-600 border border-white/[.06] flex items-center justify-center">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
                </svg>
              </div>
              <span
                class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-dark-700"
                :class="stateDot(p.state)"
              />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-semibold text-gray-100">{{ p.name }}</span>

                <span v-if="p.version" class="text-xs text-gray-500 font-mono">v{{ p.version }}</span>

                <span
                  class="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                  :class="stateBadge(p.state)"
                >{{ stateLabel(p.state) }}</span>

                <span
                  v-if="p.bundled !== undefined"
                  class="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                  :class="p.bundled
                    ? 'bg-gray-700 border-gray-600 text-gray-400'
                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'"
                >{{ p.bundled ? 'Bundled' : 'User' }}</span>
              </div>

              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                <span class="text-[10px] font-mono text-gray-600">{{ p.id }}</span>

                <template v-if="p.capabilities">
                  <span
                    v-if="p.capabilities.hasScreen"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-dark-500 border border-white/[.06] text-gray-400"
                  >screen</span>
                  <span
                    v-if="p.capabilities.hasComponent"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-dark-500 border border-white/[.06] text-gray-400"
                  >component</span>
                  <span
                    v-if="p.capabilities.hasScript"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-dark-500 border border-white/[.06] text-gray-400"
                  >script</span>
                  <span
                    v-if="p.capabilities.hasSettings"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-dark-500 border border-white/[.06] text-gray-400"
                  >settings</span>
                </template>
              </div>

              <div
                v-if="p.error"
                class="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-400 font-mono leading-relaxed"
              >{{ p.error }}</div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <a
                v-if="p.capabilities?.hasSettings && p.state === 'active'"
                :href="`#/plugin/${p.id}`"
                class="settings-btn text-xs"
                title="Open settings"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </a>
              <a
                v-if="(p.capabilities?.hasScreen || p.capabilities?.hasComponent) && p.state === 'active'"
                :href="`#/plugin/${p.id}`"
                class="settings-btn text-xs"
                title="Open plugin page"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>

              <button
                class="settings-btn text-xs flex items-center gap-1.5 transition-all"
                :class="p.state === 'disabled'
                  ? 'settings-btn.primary !bg-accent/15 !border-accent/40 !text-accent'
                  : '!text-gray-400 hover:!text-red-400 hover:!border-red-500/30 hover:!bg-red-500/10'"
                :disabled="togglingId === p.id || ['loading','setting_up','tearing_down'].includes(p.state ?? '')"
                :title="p.state === 'disabled' ? 'Enable plugin' : 'Disable plugin'"
                @click="togglePlugin(p)"
              >
                <svg v-if="togglingId === p.id" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5" />
                </svg>
                <svg v-else-if="p.state === 'disabled'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 12.728M12 3v9l4-4" />
                </svg>
                <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                </svg>
                <span v-if="togglingId === p.id">{{ p.state === 'disabled' ? 'Enabling…' : 'Disabling…' }}</span>
                <span v-else>{{ p.state === 'disabled' ? 'Enable' : 'Disable' }}</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>

    <div v-if="providers.length > 0">
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Providers</h3>

      <div
        v-if="providerError"
        class="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-400"
      >{{ providerError }}</div>

      <div class="space-y-3">
        <div
          v-for="group in providers"
          :key="group.type"
          class="settings-section !space-y-0"
        >
          <p class="text-xs font-semibold text-gray-300 mb-2.5 capitalize">{{ group.type }}</p>

          <div class="space-y-1.5">
            <div
              v-for="prov in group.providers"
              :key="prov.name"
              class="flex items-center justify-between px-3 py-2 rounded-lg border transition"
              :class="prov.active
                ? 'bg-accent/10 border-accent/30'
                : 'bg-dark-600 border-white/[.05]'"
            >
              <div class="flex items-center gap-2">
                <span
                  class="w-2 h-2 rounded-full shrink-0"
                  :class="prov.active ? 'bg-accent' : 'bg-gray-700'"
                />
                <span
                  class="text-xs font-medium"
                  :class="prov.active ? 'text-accent' : 'text-gray-400'"
                >{{ prov.name }}</span>
                <span v-if="prov.active" class="text-[10px] text-gray-500">active</span>
              </div>

              <button
                v-if="!prov.active"
                class="settings-btn text-xs"
                :disabled="!!settingKey"
                @click="activateProvider(group.type, prov.name)"
              >
                {{ settingKey === `${group.type}:${prov.name}` ? 'Activating…' : 'Set active' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
