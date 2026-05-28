<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSacStore, type SacPluginEntry, type SacPluginParameter } from '@/features/player/composables/useSac'
import { X, Power, Plus, Trash2, RefreshCw, GripVertical, ChevronDown, ChevronRight } from 'lucide-vue-next'

const emit = defineEmits<{ close: [] }>()

const sac = useSacStore()
const { t } = useI18n()

// ── Add plugin picker ─────────────────────────────────────────────────────

const showPicker    = ref(false)
const pickerSearch  = ref('')

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

// ── Collapsed state per plugin ────────────────────────────────────────────

const collapsed = ref<Set<number>>(new Set())

function toggleCollapsed(index: number): void {
  if (collapsed.value.has(index)) collapsed.value.delete(index)
  else collapsed.value.add(index)
}

// ── Drag to reorder ───────────────────────────────────────────────────────

const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function onDragStart(index: number): void {
  dragFrom.value = index
}

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

// ── Parameter debounce ────────────────────────────────────────────────────

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function onParamInput(plugin: SacPluginEntry, param: SacPluginParameter, rawValue: string): void {
  const value = Number(rawValue)
  const key = `${plugin.index}:${param.index}`
  const existing = debounceTimers.get(key)
  if (existing) clearTimeout(existing)
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
  <div class="flex flex-col h-full bg-dark-800 border-l border-white/[.06] w-80 select-none">

    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-white/[.06] shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-gray-300 tracking-wide uppercase">
          {{ t('player.plugins.title') }}
        </span>
        <span v-if="sac.profileName" class="text-[10px] text-blue-400/80 font-medium">
          {{ sac.profileName }}
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          class="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded"
          :title="t('player.plugins.refresh')"
          @click="sac.requestChainState()"
        >
          <RefreshCw :size="12" />
        </button>
        <button
          class="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded"
          :title="t('common.cancel')"
          @click="emit('close')"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- Empty state (not connected) -->
    <div
      v-if="sac.status === 'idle'"
      class="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6"
    >
      <p class="text-xs text-gray-500 leading-relaxed">{{ t('player.plugins.notConnected') }}</p>
    </div>

    <!-- Loading state (linked but no chain yet) -->
    <div
      v-else-if="sac.chainState.length === 0"
      class="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6"
    >
      <p class="text-xs text-gray-500">{{ t('player.plugins.emptyChain') }}</p>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400
               border border-white/[.06] hover:border-accent/40 hover:text-accent transition-colors"
        @click="sac.requestChainState()"
      >
        <RefreshCw :size="11" />
        {{ t('player.plugins.refresh') }}
      </button>
    </div>

    <!-- Plugin chain list -->
    <div v-else class="flex-1 overflow-y-auto min-h-0 py-1.5">
      <div
        v-for="plugin in sac.chainState"
        :key="plugin.pluginId + plugin.index"
        draggable="true"
        class="mx-2 mb-1.5 rounded-lg border transition-colors"
        :class="[
          dragOver === plugin.index ? 'border-accent/50 bg-accent/5' : 'border-white/[.06] bg-dark-700/40',
          plugin.bypassed ? 'opacity-50' : '',
        ]"
        @dragstart="onDragStart(plugin.index)"
        @dragover="onDragOver($event, plugin.index)"
        @drop="onDrop(plugin.index)"
        @dragend="onDragEnd"
      >
        <!-- Plugin row header -->
        <div class="flex items-center gap-1.5 px-2 py-1.5">
          <!-- Drag handle -->
          <GripVertical :size="12" class="text-gray-700 shrink-0 cursor-grab active:cursor-grabbing" />

          <!-- Collapse toggle -->
          <button
            class="text-gray-600 hover:text-gray-400 transition-colors shrink-0"
            @click="toggleCollapsed(plugin.index)"
          >
            <ChevronDown v-if="!collapsed.has(plugin.index)" :size="12" />
            <ChevronRight v-else :size="12" />
          </button>

          <!-- Plugin name -->
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-medium text-gray-200 truncate leading-none">{{ plugin.name }}</p>
            <p class="text-[9px] text-gray-600 truncate mt-0.5">{{ plugin.vendor }}</p>
          </div>

          <!-- Bypass toggle -->
          <button
            class="shrink-0 p-1 rounded transition-colors"
            :class="plugin.bypassed
              ? 'text-gray-600 hover:text-yellow-400'
              : 'text-green-400 hover:text-yellow-400'"
            :title="plugin.bypassed ? t('player.plugins.enable') : t('player.plugins.bypass')"
            @click="sac.setBypass(plugin.index, !plugin.bypassed)"
          >
            <Power :size="12" />
          </button>

          <!-- Remove -->
          <button
            class="shrink-0 p-1 rounded text-gray-700 hover:text-red-400 transition-colors"
            :title="t('player.plugins.remove')"
            @click="sac.removePlugin(plugin.index)"
          >
            <Trash2 :size="12" />
          </button>
        </div>

        <!-- Parameters (collapsible) -->
        <div v-if="!collapsed.has(plugin.index) && plugin.parameters.length > 0" class="px-2 pb-2 space-y-1.5">
          <div
            v-for="param in plugin.parameters"
            :key="param.index"
            class="flex items-center gap-2"
          >
            <span class="text-[10px] text-gray-500 w-24 truncate shrink-0">{{ param.name }}</span>

            <!-- Toggle (steps == 2) -->
            <template v-if="param.steps === 2">
              <button
                class="flex-1 text-[10px] rounded px-2 py-0.5 border transition-colors"
                :class="param.value >= 0.5
                  ? 'border-green-500/40 bg-green-500/10 text-green-400'
                  : 'border-white/[.06] text-gray-600'"
                @click="sac.setParameter(plugin.index, param.index, param.value >= 0.5 ? 0 : 1)"
              >
                {{ paramDisplayValue(param) }}
              </button>
            </template>

            <!-- Stepped (steps > 2) -->
            <template v-else-if="param.steps > 2">
              <input
                type="range"
                :value="param.value"
                :min="0"
                :max="1"
                :step="1 / (param.steps - 1)"
                class="flex-1 accent-accent h-1"
                @input="onParamInput(plugin, param, ($event.target as HTMLInputElement).value)"
              />
              <span class="text-[10px] font-mono text-gray-500 w-10 text-right tabular-nums shrink-0">
                {{ Math.round(param.value * (param.steps - 1)) }}
              </span>
            </template>

            <!-- Continuous slider (steps == 0) -->
            <template v-else>
              <input
                type="range"
                :value="param.value"
                min="0"
                max="1"
                step="0.001"
                class="flex-1 accent-accent h-1"
                @input="onParamInput(plugin, param, ($event.target as HTMLInputElement).value)"
              />
              <span class="text-[10px] font-mono text-gray-500 w-10 text-right tabular-nums shrink-0">
                {{ (param.value * 100).toFixed(0) }}{{ param.label ? ' ' + param.label : '%' }}
              </span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer: Add plugin button -->
    <div class="shrink-0 border-t border-white/[.06] p-2" v-if="sac.status !== 'idle'">

      <!-- Plugin picker -->
      <Transition
        enter-active-class="transition-all duration-150 origin-bottom"
        enter-from-class="scale-y-95 opacity-0"
        enter-to-class="scale-y-100 opacity-100"
        leave-active-class="transition-all duration-100 origin-bottom"
        leave-from-class="scale-y-100 opacity-100"
        leave-to-class="scale-y-95 opacity-0"
      >
        <div v-if="showPicker" class="mb-2 bg-dark-700 border border-white/[.08] rounded-lg overflow-hidden">
          <input
            v-model="pickerSearch"
            type="text"
            :placeholder="t('player.plugins.searchPlugins')"
            class="w-full bg-transparent px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none border-b border-white/[.06]"
            autofocus
          />
          <div class="max-h-40 overflow-y-auto">
            <div
              v-if="filteredPlugins.length === 0"
              class="px-3 py-4 text-[11px] text-gray-600 text-center"
            >
              {{ t('player.plugins.noPluginsFound') }}
            </div>
            <button
              v-for="p in filteredPlugins"
              :key="p.pluginId"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent/10 transition-colors text-left"
              @click="addPlugin(p.pluginId)"
            >
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-gray-200 truncate">{{ p.name }}</p>
                <p class="text-[9px] text-gray-600 truncate">{{ p.vendor }}</p>
              </div>
            </button>
          </div>
        </div>
      </Transition>

      <button
        class="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs
               text-gray-400 border border-white/[.06]
               hover:border-accent/40 hover:text-accent hover:bg-accent/5 transition-colors"
        @click="showPicker = !showPicker"
      >
        <Plus :size="12" />
        {{ t('player.plugins.addPlugin') }}
      </button>
    </div>
  </div>
</template>
