<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSacStore, type SacPluginEntry, type SacPluginParameter } from '@/features/player/composables/useSac'
import { Power, Plus, Trash2, GripVertical, ChevronDown, ChevronRight, PlugZap } from 'lucide-vue-next'

const sac = useSacStore()
const { t } = useI18n()

// ── Plugin picker ─────────────────────────────────────────────────────────

const showPicker   = ref(false)
const pickerSearch = ref('')

const filteredPlugins = computed(() => {
  const q = pickerSearch.value.toLowerCase()
  return sac.pluginList.filter(p =>
    p.name.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q)
  )
})

function addPlugin(pluginId: string): void {
  sac.addPlugin(pluginId)
  showPicker.value = false
  pickerSearch.value = ''
}

// ── Collapsed state ───────────────────────────────────────────────────────

const collapsed = ref<Set<number>>(new Set())

function toggleCollapsed(index: number): void {
  if (collapsed.value.has(index)) collapsed.value.delete(index)
  else collapsed.value.add(index)
}

// ── Drag to reorder ───────────────────────────────────────────────────────

const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function onDragStart(index: number): void { dragFrom.value = index }

function onDragOver(e: DragEvent, index: number): void {
  e.preventDefault()
  dragOver.value = index
}

function onDrop(toIndex: number): void {
  if (dragFrom.value !== null && dragFrom.value !== toIndex) {
    sac.movePlugin(dragFrom.value, toIndex)
  }
  dragFrom.value = null
  dragOver.value = null
}

function onDragEnd(): void {
  dragFrom.value = null
  dragOver.value = null
}

// ── Parameter helpers ─────────────────────────────────────────────────────

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function onParamInput(plugin: SacPluginEntry, param: SacPluginParameter, rawValue: string): void {
  const value = Number(rawValue)
  const key   = `${plugin.index}:${param.index}`
  const timer = debounceTimers.get(key)
  if (timer) clearTimeout(timer)
  debounceTimers.set(key, setTimeout(() => {
    sac.setParameter(plugin.index, param.index, value)
    debounceTimers.delete(key)
  }, 40))
}

function paramDisplayValue(param: SacPluginParameter): string {
  if (param.steps === 2) return param.value >= 0.5 ? 'On' : 'Off'
  return (param.value * 100).toFixed(0) + (param.label ? ' ' + param.label : '%')
}
</script>

<template>
  <div class="flex flex-col w-full select-none min-h-0 flex-1">

    <!-- ── Not connected ── -->
    <div
      v-if="sac.status === 'idle'"
      class="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-16 text-center"
    >
      <div class="w-12 h-12 rounded-2xl bg-white/[.04] border border-white/[.06] flex items-center justify-center">
        <PlugZap :size="22" class="text-gray-600" />
      </div>
      <div class="space-y-1">
        <p class="text-sm font-medium text-gray-400">Not connected</p>
        <p class="text-xs text-gray-600 leading-relaxed max-w-[200px] mx-auto">
          {{ t('player.plugins.notConnected') }}
        </p>
      </div>
    </div>

    <!-- ── Empty chain ── -->
    <div
      v-else-if="sac.chainState.length === 0"
      class="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-16 text-center"
    >
      <div class="w-12 h-12 rounded-2xl bg-white/[.04] border border-white/[.06] flex items-center justify-center">
        <Plus :size="22" class="text-gray-600" />
      </div>
      <div class="space-y-1">
        <p class="text-sm font-medium text-gray-400">No plugins</p>
        <p class="text-xs text-gray-600 leading-relaxed max-w-[200px] mx-auto">
          {{ t('player.plugins.emptyChain') }}
        </p>
      </div>
    </div>

    <!-- ── Plugin chain ── -->
    <div v-else class="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2">
      <div
        v-for="plugin in sac.chainState"
        :key="plugin.pluginId + plugin.index"
        draggable="true"
        class="rounded-xl border transition-all duration-150"
        :class="[
          dragOver === plugin.index
            ? 'border-accent/40 bg-accent/[.04]'
            : 'border-white/[.07] bg-dark-600/40',
          plugin.bypassed ? 'opacity-40' : '',
        ]"
        @dragstart="onDragStart(plugin.index)"
        @dragover="onDragOver($event, plugin.index)"
        @drop="onDrop(plugin.index)"
        @dragend="onDragEnd"
      >
        <!-- Plugin header row -->
        <div class="flex items-center gap-2.5 px-3 py-3">
          <GripVertical
            :size="14"
            class="text-gray-700 shrink-0 cursor-grab active:cursor-grabbing"
          />

          <button
            class="text-gray-600 hover:text-gray-300 transition-colors shrink-0 p-0.5"
            @click="toggleCollapsed(plugin.index)"
          >
            <ChevronDown v-if="!collapsed.has(plugin.index)" :size="13" />
            <ChevronRight v-else :size="13" />
          </button>

          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-200 truncate leading-snug">{{ plugin.name }}</p>
            <p class="text-[11px] text-gray-600 truncate">{{ plugin.vendor }}</p>
          </div>

          <!-- Bypass -->
          <button
            class="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all duration-150"
            :class="plugin.bypassed
              ? 'border-white/[.07] text-gray-600 hover:border-yellow-500/30 hover:text-yellow-400'
              : 'border-green-500/25 bg-green-500/[.07] text-green-400 hover:border-yellow-500/30 hover:text-yellow-400 hover:bg-yellow-500/[.06]'"
            :title="plugin.bypassed ? t('player.plugins.enable') : t('player.plugins.bypass')"
            @click="sac.setBypass(plugin.index, !plugin.bypassed)"
          >
            <Power :size="12" />
          </button>

          <!-- Remove -->
          <button
            class="shrink-0 p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            :title="t('player.plugins.remove')"
            @click="sac.removePlugin(plugin.index)"
          >
            <Trash2 :size="13" />
          </button>
        </div>

        <!-- Parameters (collapsible) -->
        <div
          v-if="!collapsed.has(plugin.index) && plugin.parameters.length > 0"
          class="px-4 pb-3 pt-2 space-y-2.5 border-t border-white/[.05]"
        >
          <div
            v-for="param in plugin.parameters"
            :key="param.index"
            class="flex items-center gap-3"
          >
            <span class="text-xs text-gray-500 w-28 truncate shrink-0 leading-none">{{ param.name }}</span>

            <!-- Boolean toggle -->
            <template v-if="param.steps === 2">
              <button
                class="flex-1 text-xs rounded-lg px-3 py-1 border transition-colors"
                :class="param.value >= 0.5
                  ? 'border-green-500/40 bg-green-500/10 text-green-400'
                  : 'border-white/[.07] text-gray-600 hover:text-gray-400'"
                @click="sac.setParameter(plugin.index, param.index, param.value >= 0.5 ? 0 : 1)"
              >
                {{ paramDisplayValue(param) }}
              </button>
            </template>

            <!-- Stepped slider -->
            <template v-else-if="param.steps > 2">
              <input
                type="range"
                :value="param.value"
                :min="0" :max="1"
                :step="1 / (param.steps - 1)"
                class="flex-1 accent-accent h-1"
                @input="onParamInput(plugin, param, ($event.target as HTMLInputElement).value)"
              />
              <span class="text-xs font-mono text-gray-500 w-10 text-right tabular-nums shrink-0">
                {{ Math.round(param.value * (param.steps - 1)) }}
              </span>
            </template>

            <!-- Continuous slider -->
            <template v-else>
              <input
                type="range"
                :value="param.value"
                min="0" max="1" step="0.001"
                class="flex-1 accent-accent h-1"
                @input="onParamInput(plugin, param, ($event.target as HTMLInputElement).value)"
              />
              <span class="text-xs font-mono text-gray-500 w-14 text-right tabular-nums shrink-0">
                {{ paramDisplayValue(param) }}
              </span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Footer: add plugin ── -->
    <div v-if="sac.status !== 'idle'" class="shrink-0 border-t border-white/[.06] p-3">

      <!-- Picker -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out origin-bottom"
        enter-from-class="opacity-0 scale-y-95 -translate-y-1"
        enter-to-class="opacity-100 scale-y-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in origin-bottom"
        leave-from-class="opacity-100 scale-y-100 translate-y-0"
        leave-to-class="opacity-0 scale-y-95 -translate-y-1"
      >
        <div
          v-if="showPicker"
          class="mb-2.5 bg-dark-600 border border-white/[.08] rounded-xl overflow-hidden"
        >
          <input
            v-model="pickerSearch"
            type="text"
            :placeholder="t('player.plugins.searchPlugins')"
            class="w-full bg-transparent px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600
                   outline-none border-b border-white/[.06]"
            autofocus
          />
          <div class="max-h-48 overflow-y-auto">
            <div
              v-if="filteredPlugins.length === 0"
              class="px-4 py-6 text-xs text-gray-600 text-center"
            >
              {{ t('player.plugins.noPluginsFound') }}
            </div>
            <button
              v-for="p in filteredPlugins"
              :key="p.pluginId"
              type="button"
              class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[.05] transition-colors text-left"
              @click="addPlugin(p.pluginId)"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium text-gray-200 truncate leading-snug">{{ p.name }}</p>
                <p class="text-xs text-gray-500 truncate">{{ p.vendor }}</p>
              </div>
            </button>
          </div>
        </div>
      </Transition>

      <button
        class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium
               border transition-all duration-150"
        :class="showPicker
          ? 'border-accent/40 text-accent bg-accent/[.06]'
          : 'border-white/[.07] text-gray-400 hover:border-accent/35 hover:text-accent hover:bg-accent/[.04]'"
        @click="showPicker = !showPicker"
      >
        <Plus :size="14" />
        {{ t('player.plugins.addPlugin') }}
      </button>
    </div>

  </div>
</template>
