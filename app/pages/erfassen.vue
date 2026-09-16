<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Inserat übernehmen</h1>
      <p class="text-sm text-base-content/70 mt-1">
        Aus deinem Browser gelesen. Prüfe die Werte und übernimm sie.
      </p>
    </div>

    <div v-if="fehler" class="alert alert-warning">
      <Icon name="lucide:alert-triangle" class="w-5 h-5 shrink-0" />
      <div class="space-y-1">
        <span class="font-semibold block">Keine Daten empfangen</span>
        <span class="text-sm">{{ fehler }}</span>
      </div>
    </div>

    <template v-else-if="daten">
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5 space-y-4">
          <div class="flex items-center gap-3 border-b border-base-200 pb-3">
            <Icon name="lucide:bookmark-check" class="w-5 h-5 text-primary" />
            <h2 class="font-bold text-base">{{ daten.title || 'Inserat' }}</h2>
          </div>

          <dl class="space-y-2 text-sm">
            <div v-for="feld in felder" :key="feld.label" class="flex justify-between gap-4 py-1 border-b border-base-200 last:border-0">
              <dt class="text-base-content/60 shrink-0">{{ feld.label }}</dt>
              <dd class="text-right" :class="feld.mono ? 'font-mono' : ''">
                {{ feld.wert ?? '–' }}
              </dd>
            </div>
          </dl>

          <div v-if="ergebnis" class="alert alert-success text-sm py-2.5">
            <Icon name="lucide:check-circle-2" class="w-4 h-4 shrink-0" />
            <span>{{ ergebnis.message }}</span>
          </div>

          <div v-else class="flex flex-wrap justify-end gap-2 pt-1">
            <button class="btn btn-sm btn-ghost" @click="window.close()">Verwerfen</button>
            <button class="btn btn-sm btn-primary gap-1.5" :disabled="speichern" @click="uebernehmen">
              <span v-if="speichern" class="loading loading-spinner loading-xs"></span>
              <Icon v-else name="lucide:check" class="w-4 h-4" />
              Übernehmen
            </button>
          </div>

          <div v-if="ergebnis" class="flex justify-end gap-2">
            <NuxtLink :to="`/properties/${ergebnis.propertyId}`" class="btn btn-sm btn-primary gap-1.5">
              <Icon name="lucide:arrow-right" class="w-4 h-4" />
              Zum Grundstück
            </NuxtLink>
          </div>
        </div>
      </div>

      <p class="text-xs text-base-content/50">
        Ist das Inserat bereits erfasst, wird daraus eine Preisprüfung mit Historieneintrag.
        Ein geänderter Preis wird vorgeschlagen, nicht automatisch übernommen.
      </p>
    </template>

    <div v-else class="flex items-center gap-2 text-sm text-base-content/60">
      <span class="loading loading-spinner loading-sm"></span>
      Daten werden gelesen...
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const toast = useToast()

const daten = ref<any>(null)
const fehler = ref('')
const speichern = ref(false)
const ergebnis = ref<any>(null)

onMounted(() => {
  // Die Nutzdaten stehen im Fragment - das erreicht den Server nie und landet
  // damit in keinem Zugriffsprotokoll.
  const roh = window.location.hash.replace(/^#/, '')
  if (!roh) {
    fehler.value = 'Diese Seite wird vom Lesezeichen aufgerufen. Richte es in den Einstellungen unter "Dienste & API" ein.'
    return
  }
  try {
    daten.value = JSON.parse(decodeURIComponent(escape(atob(roh))))
  } catch (err: any) {
    fehler.value = 'Die übergebenen Daten ließen sich nicht lesen: ' + err.message
  }
})

const felder = computed(() => {
  const d = daten.value || {}
  return [
    { label: 'Adresse', wert: d.address },
    { label: 'Kaufpreis', wert: d.price ? d.price.toLocaleString('de-DE') + ' €' : null, mono: true },
    { label: 'Fläche', wert: d.areaSqm ? d.areaSqm.toLocaleString('de-DE') + ' m²' : null, mono: true },
    { label: 'Preis pro m²', wert: d.price && d.areaSqm ? Math.round((d.price / d.areaSqm) * 100) / 100 + ' €/m²' : null, mono: true },
    { label: 'Erschließung', wert: d.developmentStatus },
    { label: 'Bebaubarkeit', wert: d.buildingLaw },
    { label: 'Makler', wert: [d.broker?.name, d.broker?.company].filter(Boolean).join(', ') || null },
    { label: 'Quelle', wert: d.url ? new URL(d.url).host : null }
  ]
})

async function uebernehmen() {
  speichern.value = true
  try {
    // Gleiche Herkunft - kein CORS, kein Token nötig.
    ergebnis.value = await $fetch('/api/capture', { method: 'POST', body: daten.value })
    toast.success(ergebnis.value.message)
  } catch (err: any) {
    toast.error('Fehler: ' + (err.data?.message || err.data?.statusMessage || err.message))
  } finally {
    speichern.value = false
  }
}
</script>
