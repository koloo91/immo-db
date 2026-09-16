<template>
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body p-4 sm:p-5 space-y-4">
      <!-- Kopf -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
        <div>
          <h3 class="font-bold text-sm flex items-center gap-2">
            <Icon name="lucide:trending-down" class="w-4 h-4 text-primary" />
            Inserat &amp; Preisverlauf
          </h3>
          <p class="text-xs text-base-content/60 mt-0.5">
            <span v-if="daysListed !== null">Seit {{ daysListed }} Tagen beobachtet</span>
            <span v-else>Noch nicht geprüft</span>
            <template v-if="totalChange !== null && totalChange !== 0">
              &middot;
              <span :class="totalChange < 0 ? 'text-success font-semibold' : 'text-warning font-semibold'">
                {{ totalChange > 0 ? '+' : '' }}{{ totalChange }} % seit Erfassung
              </span>
            </template>
          </p>
        </div>

        <button
          class="btn btn-sm btn-outline gap-1.5 self-end sm:self-center"
          :disabled="checking"
          @click="checkNow"
        >
          <span v-if="checking" class="loading loading-spinner loading-xs"></span>
          <Icon v-else name="lucide:refresh-cw" class="w-4 h-4" />
          Jetzt prüfen
        </button>
      </div>

      <!-- Status des Inserats -->
      <div class="flex items-center gap-2.5 p-3 rounded-xl border" :class="stateBox">
        <Icon :name="stateIcon" class="w-5 h-5 shrink-0" />
        <div class="min-w-0 flex-1 space-y-0.5">
          <div class="text-xs font-semibold">{{ stateLabel }}</div>
          <div class="text-xs text-base-content/60">
            <template v-if="status?.lastOkAt">
              Zuletzt erfolgreich geprüft: {{ formatDateTime(status.lastOkAt) }}
            </template>
            <template v-else-if="status?.lastCheckedAt">
              Letzter Versuch: {{ formatDateTime(status.lastCheckedAt) }} &ndash; ohne Erfolg
            </template>
            <template v-else>Bisher keine Prüfung</template>
            <template v-if="status?.portal"> &middot; {{ portalLabel }}</template>
          </div>
          <div v-if="status?.state === 'unverifiable' && status?.lastMessage" class="text-xs text-base-content/50 line-clamp-2">
            {{ status.lastMessage }}
          </div>
        </div>
      </div>

      <!-- Zeitleiste -->
      <div v-if="observations.length === 0" class="text-center py-5 text-xs text-base-content/50">
        Noch keine Preisbeobachtungen. Trage unten einen Wert ein oder lass prüfen.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="obs in observations"
          :key="obs.id"
          class="flex items-start gap-3 text-xs py-2 border-b border-base-200 last:border-0"
        >
          <Icon :name="kindIcon(obs.kind)" class="w-4 h-4 mt-0.5 shrink-0" :class="kindColor(obs.kind)" />
          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="font-semibold flex items-center gap-2 flex-wrap">
              <span class="text-base-content/70">{{ formatDate(obs.observedAt) }}</span>
              <span class="badge badge-xs" :class="kindBadge(obs.kind)">{{ kindLabel(obs.kind) }}</span>
              <template v-if="obs.kind === 'price_change' && obs.previousPrice">
                <span class="font-mono text-base-content/50 line-through">{{ euro(obs.previousPrice) }}</span>
                <span class="font-mono">{{ euro(obs.price) }}</span>
                <span
                  class="badge badge-xs font-mono"
                  :class="delta(obs) < 0 ? 'badge-success' : 'badge-warning'"
                >
                  {{ delta(obs) > 0 ? '+' : '' }}{{ delta(obs) }} %
                </span>
              </template>
              <span v-else-if="obs.price" class="font-mono">{{ euro(obs.price) }}</span>
            </div>
            <div class="text-xs text-base-content/55 flex items-center gap-1.5 flex-wrap">
              <span class="badge badge-xs badge-ghost">{{ sourceLabel(obs.source) }}</span>
              <span v-if="obs.note">{{ obs.note }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Manuelle Erfassung -->
      <div class="bg-base-200/40 border border-base-300 rounded-xl p-3 space-y-2">
        <div class="text-xs font-semibold flex items-center gap-1.5">
          <Icon name="lucide:pencil" class="w-3.5 h-3.5 text-primary" />
          Von Hand erfassen
        </div>
        <p class="text-xs text-base-content/60">
          Für Portale ohne automatische Prüfung &ndash; oder wenn du den Preis aus einer Makler-Mail kennst.
        </p>
        <div class="flex flex-col sm:flex-row gap-2">
          <div class="join flex-1">
            <input
              v-model.number="manualPrice"
              type="number"
              min="1000"
              step="1000"
              placeholder="Aktueller Preis"
              class="input input-sm input-bordered join-item flex-1 font-mono"
              @keyup.enter="saveManualPrice"
            />
            <span class="btn btn-sm join-item no-animation pointer-events-none">€</span>
          </div>
          <button
            class="btn btn-sm btn-primary"
            :disabled="savingManual || !manualPrice || manualPrice < 1000"
            @click="saveManualPrice"
          >
            <span v-if="savingManual" class="loading loading-spinner loading-xs"></span>
            Eintragen
          </button>
          <button class="btn btn-sm btn-ghost text-error" :disabled="savingManual" @click="markGone">
            Inserat ist offline
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const toast = useToast()

const props = defineProps<{
  propertyId: string
  status?: any
  observations: any[]
  areaSqm?: number | null
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()

const checking = ref(false)
const savingManual = ref(false)
const manualPrice = ref<number | null>(null)

const observations = computed(() => props.observations || [])

const PORTALS: Record<string, string> = {
  immowelt: 'immowelt',
  kleinanzeigen: 'Kleinanzeigen',
  immoscout24: 'ImmobilienScout24',
  sonstiges: 'Portal'
}
const portalLabel = computed(() => PORTALS[props.status?.portal] || 'Portal')

const daysListed = computed(() => {
  const from = props.status?.firstSeenAt
  if (!from) return null
  return Math.max(0, Math.floor((Date.now() - from) / 86400000))
})

/** Gesamtveränderung zwischen der ersten und der jüngsten Preisbeobachtung. */
const totalChange = computed(() => {
  const withPrice = observations.value.filter(o => typeof o.price === 'number' && o.price > 0)
  if (withPrice.length < 2) return null
  const newest = withPrice[0].price
  const oldest = withPrice[withPrice.length - 1].price
  if (!oldest) return null
  return Math.round(((newest - oldest) / oldest) * 1000) / 10
})

const STATE_LABELS: Record<string, string> = {
  online: 'Inserat ist online',
  offline: 'Inserat ist nicht mehr auffindbar',
  suspect: 'Inserat liefert keine Daten mehr – wird beobachtet',
  unverifiable: 'Nicht automatisch prüfbar',
  unknown: 'Noch nicht geprüft'
}
const stateLabel = computed(() => STATE_LABELS[props.status?.state] || STATE_LABELS.unknown)

const stateBox = computed(() => ({
  online: 'border-success/30 bg-success/5 text-success',
  offline: 'border-error/30 bg-error/5 text-error',
  suspect: 'border-warning/30 bg-warning/5 text-warning',
  unverifiable: 'border-base-300 bg-base-200/40 text-base-content/70',
  unknown: 'border-base-300 bg-base-200/40 text-base-content/70'
}[props.status?.state as string] || 'border-base-300 bg-base-200/40 text-base-content/70'))

const stateIcon = computed(() => ({
  online: 'lucide:circle-check',
  offline: 'lucide:circle-x',
  suspect: 'lucide:circle-alert',
  unverifiable: 'lucide:circle-help',
  unknown: 'lucide:circle-dashed'
}[props.status?.state as string] || 'lucide:circle-dashed'))

function kindIcon(kind: string) {
  return {
    first_seen: 'lucide:flag',
    price_change: 'lucide:arrow-right-left',
    listing_gone: 'lucide:circle-x',
    listing_back: 'lucide:rotate-ccw'
  }[kind] || 'lucide:dot'
}

function kindColor(kind: string) {
  return {
    first_seen: 'text-base-content/50',
    price_change: 'text-primary',
    listing_gone: 'text-error',
    listing_back: 'text-success'
  }[kind] || 'text-base-content/40'
}

function kindLabel(kind: string) {
  return {
    first_seen: 'Erstmals erfasst',
    price_change: 'Preisänderung',
    listing_gone: 'Inserat offline',
    listing_back: 'Inserat wieder online'
  }[kind] || kind
}

function kindBadge(kind: string) {
  return {
    first_seen: 'badge-ghost',
    price_change: 'badge-primary',
    listing_gone: 'badge-error',
    listing_back: 'badge-success'
  }[kind] || 'badge-ghost'
}

function sourceLabel(source: string) {
  return { auto: 'automatisch', manual: 'von Hand', email: 'aus E-Mail' }[source] || source
}

function delta(obs: any) {
  if (!obs.previousPrice || !obs.price) return 0
  return Math.round(((obs.price - obs.previousPrice) / obs.previousPrice) * 1000) / 10
}

function euro(value: number | null) {
  return value ? value.toLocaleString('de-DE') + ' €' : '–'
}

async function checkNow() {
  checking.value = true
  try {
    const res = await $fetch<any>(`/api/properties/${props.propertyId}/check-listing`, { method: 'POST' })
    emit('refresh')
    if (res.state === 'unverifiable') {
      toast.warning('Inserat konnte nicht geprüft werden – der Status bleibt unverändert.')
    } else if (res.state === 'offline') {
      toast.warning('Das Inserat ist nicht mehr auffindbar.')
    } else if (res.priceChanged) {
      toast.success(`Neuer Preis im Inserat: ${euro(res.price)} – bitte oben bestätigen.`)
    } else {
      toast.success('Inserat geprüft – keine Änderung.')
    }
  } catch (err: any) {
    toast.error('Prüfung fehlgeschlagen: ' + (err.data?.message || err.data?.statusMessage || err.message))
  } finally {
    checking.value = false
  }
}

async function saveManualPrice() {
  if (!manualPrice.value || manualPrice.value < 1000) return
  savingManual.value = true
  try {
    await $fetch(`/api/properties/${props.propertyId}/price`, {
      method: 'POST',
      body: { price: manualPrice.value }
    })
    manualPrice.value = null
    emit('refresh')
    toast.success('Preis erfasst und in den Verlauf aufgenommen.')
  } catch (err: any) {
    toast.error('Fehler: ' + (err.data?.statusMessage || err.message))
  } finally {
    savingManual.value = false
  }
}

async function markGone() {
  if (!confirm('Inserat als offline markieren?')) return
  savingManual.value = true
  try {
    await $fetch(`/api/properties/${props.propertyId}/price`, {
      method: 'POST',
      body: { listingGone: true }
    })
    emit('refresh')
    toast.success('Als offline vermerkt.')
  } catch (err: any) {
    toast.error('Fehler: ' + (err.data?.statusMessage || err.message))
  } finally {
    savingManual.value = false
  }
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(ms: number) {
  return new Date(ms).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}
</script>
