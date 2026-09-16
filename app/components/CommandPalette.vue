<template>
  <dialog class="modal items-start pt-[10vh]" :class="{ 'modal-open': open }" @click.self="close">
    <div class="modal-box max-w-2xl p-0 overflow-hidden">
      <!-- Eingabe -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300">
        <Icon name="lucide:search" class="w-5 h-5 text-base-content/40 shrink-0" />
        <input
          ref="inputEl"
          v-model="query"
          type="text"
          placeholder="Grundstücke, Dokumente, E-Mails, Analysen durchsuchen..."
          class="flex-1 bg-transparent outline-none text-sm"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="openActive"
          @keydown.esc="close"
        />
        <span v-if="loading" class="loading loading-spinner loading-xs text-primary"></span>
        <kbd class="kbd kbd-sm">esc</kbd>
      </div>

      <!-- Dienst nicht erreichbar -->
      <div v-if="serviceError" class="p-5">
        <div class="alert alert-warning text-xs py-2.5">
          <Icon name="lucide:plug-zap" class="w-4 h-4 shrink-0" />
          <div class="space-y-1">
            <span class="font-semibold block">Suche nicht verfügbar</span>
            <span>{{ serviceError }}</span>
          </div>
        </div>
      </div>

      <!-- Ergebnisse -->
      <div v-else class="max-h-[60vh] overflow-y-auto">
        <div v-if="!query.trim()" class="px-4 py-8 text-center text-xs text-base-content/50 space-y-2">
          <Icon name="lucide:search" class="w-7 h-7 mx-auto text-base-content/20" />
          <p>Durchsucht Exposé-Inhalte, den kompletten Mailverlauf, KI-Analysen und Stammdaten.</p>
          <p class="text-[11px]">Treffer in Dokumenten zeigen die Seitenzahl.</p>
        </div>

        <div v-else-if="!loading && flatHits.length === 0" class="px-4 py-8 text-center text-xs text-base-content/50">
          Keine Treffer für &bdquo;{{ query }}&ldquo;.
        </div>

        <div v-for="group in groups" :key="group.type" class="py-1">
          <div class="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/50 bg-base-200/40">
            {{ group.label }}
            <span class="font-mono font-normal">({{ group.hits.length }})</span>
          </div>

          <button
            v-for="hit in group.hits"
            :key="hit.id"
            type="button"
            class="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors cursor-pointer"
            :class="hit.id === activeId ? 'bg-primary/10' : 'hover:bg-base-200/60'"
            @click="go(hit)"
            @mouseenter="activeId = hit.id"
          >
            <Icon :name="iconFor(hit.type)" class="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <div class="min-w-0 flex-1 space-y-0.5">
              <div class="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                <span class="truncate" v-html="clean(hit.title)"></span>
                <span v-if="hit.pageNumber" class="badge badge-xs badge-ghost font-mono shrink-0">
                  Seite {{ hit.pageNumber }}
                </span>
              </div>
              <div v-if="hit.snippet" class="text-[11px] text-base-content/70 line-clamp-2" v-html="clean(hit.snippet)"></div>
              <div class="text-[11px] text-base-content/45 flex items-center gap-1.5">
                <Icon name="lucide:map-pin" class="w-3 h-3" />
                <span class="truncate">{{ hit.propertyTitle }}</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Fußzeile -->
      <div class="px-4 py-2 border-t border-base-300 flex items-center justify-between text-[11px] text-base-content/50 bg-base-200/30">
        <div class="flex items-center gap-3">
          <span><kbd class="kbd kbd-xs">↑</kbd><kbd class="kbd kbd-xs">↓</kbd> navigieren</span>
          <span><kbd class="kbd kbd-xs">↵</kbd> öffnen</span>
        </div>
        <span v-if="total > 0" class="font-mono">{{ total }} Treffer · {{ took }} ms</span>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const open = ref(false)
const query = ref('')
const loading = ref(false)
const groups = ref<any[]>([])
const total = ref(0)
const took = ref(0)
const serviceError = ref('')
const activeId = ref<string | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

const flatHits = computed(() => groups.value.flatMap(g => g.hits))

let debounce: ReturnType<typeof setTimeout> | null = null
let requestId = 0

watch(query, () => {
  if (debounce) clearTimeout(debounce)
  if (!query.value.trim()) {
    groups.value = []
    total.value = 0
    serviceError.value = ''
    return
  }
  debounce = setTimeout(runSearch, 180)
})

async function runSearch() {
  const current = ++requestId
  loading.value = true
  try {
    const res = await $fetch<any>('/api/search', { params: { q: query.value } })
    // Antworten können überholen - nur die neueste anzeigen.
    if (current !== requestId) return
    groups.value = res.groups || []
    total.value = res.total || 0
    took.value = res.took || 0
    serviceError.value = ''
    activeId.value = flatHits.value[0]?.id || null
  } catch (err: any) {
    if (current !== requestId) return
    groups.value = []
    total.value = 0
    // Entscheidend: ein Dienstausfall darf nicht wie "nichts gefunden" aussehen.
    serviceError.value = err.data?.message || err.data?.statusMessage || err.message
  } finally {
    if (current === requestId) loading.value = false
  }
}

function move(delta: number) {
  const hits = flatHits.value
  if (hits.length === 0) return
  const index = hits.findIndex(h => h.id === activeId.value)
  const next = Math.max(0, Math.min(hits.length - 1, (index === -1 ? 0 : index) + delta))
  activeId.value = hits[next].id
  document.querySelector(`[data-hit="${hits[next].id}"]`)?.scrollIntoView({ block: 'nearest' })
}

function openActive() {
  const hit = flatHits.value.find(h => h.id === activeId.value)
  if (hit) go(hit)
}

/** Baut das Sprungziel so, dass die Detailseite direkt die richtige Fundstelle aufschlägt. */
function go(hit: any) {
  const params = new URLSearchParams()
  if (hit.type === 'document_page') {
    params.set('tab', 'docs')
    if (hit.docId) params.set('doc', hit.docId)
    if (hit.pageNumber) params.set('page', String(hit.pageNumber))
  } else if (hit.type === 'email') {
    params.set('tab', 'broker')
    if (hit.threadId) params.set('thread', hit.threadId)
  } else if (hit.type === 'analysis') {
    params.set('tab', 'analysis')
  }
  const suffix = params.toString()
  close()
  navigateTo(`/properties/${hit.propertyId}${suffix ? '?' + suffix : ''}`)
}

function iconFor(type: string) {
  return {
    property: 'lucide:map-pin',
    document_page: 'lucide:file-text',
    email: 'lucide:mail',
    analysis: 'lucide:brain-circuit'
  }[type] || 'lucide:file'
}

/**
 * Die Highlight-Marker aus Meilisearch kommen als « », damit im JSON kein HTML steckt.
 * Erst hier - nach dem Escapen des restlichen Textes - werden sie zu <mark>.
 */
function clean(text: string) {
  const escaped = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/«/g, '<mark class="bg-warning/40 text-inherit rounded px-0.5">').replace(/»/g, '</mark>')
}

function toggle() {
  open.value = !open.value
  if (open.value) nextTick(() => inputEl.value?.focus())
}

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    toggle()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ toggle, open })
</script>
