<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Upload, CheckCircle2, XCircle, Clock, Loader2, FileMusic } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import { useImportJobs } from '@/features/library/composables/useImportJobs'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { jobs, uploading, upload, startPolling, stopPolling } = useImportJobs()

const fileInput  = ref<HTMLInputElement | null>(null)
const dragOver   = ref(false)

onMounted(startPolling)
onUnmounted(stopPolling)

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (files?.length) await upload(files)
}

async function onFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) await upload(files)
  ;(e.target as HTMLInputElement).value = ''
}

function statusLabel(status: string) {
  if (status === 'queued')     return 'Queued'
  if (status === 'processing') return 'Processing'
  if (status === 'completed')  return 'Done'
  if (status === 'failed')     return 'Failed'
  return status
}

function displayName(filename: string) {
  return filename.replace(/\.[^.]+$/, '')
}
</script>

<template>
  <AppDialog :open="open" size="md" @close="emit('close')">

    <template #header>
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-8 h-8 rounded-lg bg-white/[.05] border border-white/[.07] flex items-center justify-center shrink-0">
          <Upload :size="15" class="text-gray-300" />
        </div>
        <div class="flex items-center gap-2.5 min-w-0">
          <h2 class="text-sm font-semibold text-gray-100">Upload Tracks</h2>
          <span
            v-if="jobs.length > 0"
            class="text-[11px] font-mono text-gray-500 bg-white/[.04] px-2 py-0.5 rounded"
          >{{ jobs.length }} job{{ jobs.length !== 1 ? 's' : '' }}</span>
        </div>
      </div>
    </template>

    <div class="space-y-4">

      <!-- Drop zone -->
      <div
        class="relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
               px-6 py-10 text-center cursor-pointer transition-all duration-150 select-none"
        :class="dragOver
          ? 'border-accent/60 bg-accent/[.06]'
          : 'border-white/[.10] bg-white/[.02] hover:border-white/[.18] hover:bg-white/[.04]'"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @click="fileInput?.click()"
      >
        <div
          class="w-12 h-12 rounded-2xl flex items-center justify-center transition-colors"
          :class="dragOver ? 'bg-accent/15 border border-accent/25' : 'bg-white/[.05] border border-white/[.08]'"
        >
          <Upload :size="22" :class="dragOver ? 'text-accent' : 'text-gray-400'" />
        </div>

        <div>
          <p class="text-sm font-medium text-gray-200">
            {{ dragOver ? 'Drop files here' : 'Drop files or click to browse' }}
          </p>
          <p class="text-xs text-gray-500 mt-1">Accepts .psarc and .sloppak</p>
        </div>

        <div v-if="uploading" class="flex items-center gap-2 text-xs text-accent">
          <Loader2 :size="13" class="animate-spin" />
          Uploading…
        </div>

        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".psarc,.sloppak"
          class="hidden"
          @change="onFileChange"
        />
      </div>

      <!-- Job list -->
      <div v-if="jobs.length > 0" class="space-y-1.5">
        <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest px-0.5">Queue</p>

        <div
          v-for="job in [...jobs].reverse()"
          :key="job.id"
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[.06] bg-white/[.02]"
        >
          <!-- Status icon -->
          <div class="shrink-0">
            <Loader2
              v-if="job.status === 'processing'"
              :size="15"
              class="animate-spin text-accent"
            />
            <Clock
              v-else-if="job.status === 'queued'"
              :size="15"
              class="text-gray-500"
            />
            <CheckCircle2
              v-else-if="job.status === 'completed'"
              :size="15"
              class="text-green-400"
            />
            <XCircle
              v-else-if="job.status === 'failed'"
              :size="15"
              class="text-red-400"
            />
          </div>

          <!-- Filename + progress -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-gray-200 truncate">{{ displayName(job.filename) }}</p>
              <span
                class="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                :class="{
                  'text-accent bg-accent/10':          job.status === 'processing',
                  'text-gray-500 bg-white/[.05]':      job.status === 'queued',
                  'text-green-400 bg-green-400/10':    job.status === 'completed',
                  'text-red-400 bg-red-400/10':        job.status === 'failed',
                }"
              >{{ statusLabel(job.status) }}</span>
            </div>

            <!-- Progress bar for processing -->
            <div
              v-if="job.status === 'processing'"
              class="mt-1.5 h-1 bg-dark-600 rounded-full overflow-hidden"
            >
              <div
                class="h-full bg-accent rounded-full transition-all duration-300"
                :style="{ width: job.progress + '%' }"
              />
            </div>

            <!-- Error message -->
            <p v-if="job.status === 'failed' && job.error" class="mt-0.5 text-[10px] text-red-400/80 truncate">
              {{ job.error }}
            </p>

            <!-- Format badge -->
            <p v-else-if="job.status === 'queued' || job.status === 'completed'" class="mt-0.5 text-[10px] text-gray-600 uppercase tracking-wide">
              {{ job.format }}
            </p>
          </div>
        </div>
      </div>

      <!-- Empty queue hint -->
      <div v-else class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[.02] border border-white/[.05]">
        <FileMusic :size="14" class="text-gray-600 shrink-0" />
        <p class="text-xs text-gray-600">No uploads yet. Drop files above to get started.</p>
      </div>

    </div>

  </AppDialog>
</template>
