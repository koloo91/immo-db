<template>
  <div class="modal modal-open z-[1000]">
    <div class="modal-box max-w-2xl bg-base-100 p-6 space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-base-200 pb-3">
        <h3 class="font-bold text-lg flex items-center gap-2">
          <Icon name="lucide:plus-circle" class="w-5 h-5 text-primary" />
          Neues Grundstück anlegen
        </h3>
        <button class="btn btn-ghost btn-sm btn-circle" @click="$emit('close')">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <!-- Mode Selector Segmented Control -->
      <div class="grid grid-cols-3 gap-1.5 p-1 bg-base-200/80 rounded-xl border border-base-300 text-xs font-semibold">
        <button 
          type="button"
          class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg transition-all"
          :class="tab === 'url' ? 'bg-primary text-primary-content shadow-xs' : 'text-base-content/70 hover:bg-base-300/60 hover:text-base-content'"
          @click="tab = 'url'"
        >
          <Icon name="lucide:link-2" class="w-4 h-4 shrink-0" />
          <span class="truncate">Inserat-URL</span>
        </button>
        <button 
          type="button"
          class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg transition-all"
          :class="tab === 'geobasis' ? 'bg-primary text-primary-content shadow-xs' : 'text-base-content/70 hover:bg-base-300/60 hover:text-base-content'"
          @click="tab = 'geobasis'"
        >
          <Icon name="lucide:sparkles" class="w-4 h-4 shrink-0" />
          <span class="truncate">Geobasis (BB)</span>
        </button>
        <button 
          type="button"
          class="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg transition-all"
          :class="tab === 'manual' ? 'bg-primary text-primary-content shadow-xs' : 'text-base-content/70 hover:bg-base-300/60 hover:text-base-content'"
          @click="tab = 'manual'"
        >
          <Icon name="lucide:edit-3" class="w-4 h-4 shrink-0" />
          <span class="truncate">Manuell</span>
        </button>
      </div>

      <!-- 1. URL Import Tab -->
      <div v-if="tab === 'url'" class="space-y-3 bg-base-200/40 p-3.5 rounded-xl border border-base-200">
        <div class="flex items-center justify-between">
          <p class="text-xs text-base-content/80 font-medium">
            Füge einen Link von ImmoScout24, Immowelt oder Kleinanzeigen ein:
          </p>
          <span class="badge badge-xs badge-neutral font-mono">FlareSolverr Ready</span>
        </div>

        <div class="flex gap-2">
          <div class="relative flex-1">
            <Icon name="lucide:globe" class="w-4 h-4 absolute left-3 top-3 text-base-content/40" />
            <input 
              v-model="importUrl" 
              type="url" 
              placeholder="https://www.immobilienscout24.de/expose/..." 
              class="input input-bordered pl-9 w-full input-sm font-mono text-xs"
              @keyup.enter="importFromUrl"
            />
          </div>
          <button 
            class="btn btn-sm btn-primary shrink-0 gap-1.5" 
            :disabled="loadingUrl || !importUrl.trim()" 
            @click="importFromUrl"
          >
            <span v-if="loadingUrl" class="loading loading-spinner loading-xs"></span>
            <Icon v-else name="lucide:sparkles" class="w-4 h-4" />
            <span>Abrufen & Analysieren</span>
          </button>
        </div>

        <!-- URL Import Status Feedback -->
        <div v-if="urlError" class="alert alert-warning text-xs py-2.5">
          <Icon name="lucide:alert-circle" class="w-4 h-4 shrink-0" />
          <div class="space-y-1">
            <span class="font-semibold block">Fehler beim URL-Import:</span>
            <span>{{ urlError }}</span>
          </div>
        </div>

        <div v-if="urlWarning" class="alert alert-warning text-xs py-2.5">
          <Icon name="lucide:triangle-alert" class="w-4 h-4 shrink-0" />
          <div class="space-y-1">
            <span class="font-semibold block">Import unvollständig:</span>
            <span>{{ urlWarning }}</span>
          </div>
        </div>

        <div v-if="urlSuccessMessage" class="alert alert-success text-xs py-2">
          <Icon name="lucide:check-circle-2" class="w-4 h-4 shrink-0" />
          <span>{{ urlSuccessMessage }}</span>
        </div>

        <!-- Extracted Images Preview -->
        <div v-if="form.images && form.images.length > 0" class="space-y-1.5 pt-1">
          <div class="flex items-center justify-between text-[11px] text-base-content/70">
            <span class="font-semibold flex items-center gap-1">
              <Icon name="lucide:images" class="w-3.5 h-3.5 text-primary" />
              Erkannte Bilder ({{ form.images.length }}):
            </span>
            <span class="text-[10px] text-base-content/50">Klicke auf ein Bild, um es als Titelbild festzulegen</span>
          </div>
          <div class="flex gap-2 overflow-x-auto pb-1">
            <div 
              v-for="(img, idx) in form.images" 
              :key="idx"
              class="shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 relative cursor-pointer group transition-all"
              :class="form.primaryImageUrl === img ? 'border-primary ring-2 ring-primary/40' : 'border-base-300 opacity-75 hover:opacity-100'"
              @click="form.primaryImageUrl = img"
              :title="form.primaryImageUrl === img ? 'Aktuelles Titelbild' : 'Als Titelbild festlegen'"
            >
              <img :src="img" class="w-full h-full object-cover" />
              <span v-if="form.primaryImageUrl === img" class="absolute top-1 right-1 badge badge-primary badge-xs scale-75">
                ★
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Geobasis Schnellsuche & Import -->
      <div v-if="tab === 'geobasis'" class="space-y-3 bg-base-200/40 p-3.5 rounded-xl border border-base-200">
        <p class="text-xs text-base-content/70">
          Suche nach einer Adresse, Gemarkung oder Flurstücksnummer in Brandenburg. Die amtlichen Daten (Fläche, Kennzeichen, BORIS-Wert) werden automatisch übernommen.
        </p>

        <div class="flex gap-2">
          <div class="relative flex-1">
            <Icon name="lucide:search" class="w-4 h-4 absolute left-3 top-3 text-base-content/40" />
            <input 
              v-model="geoQuery" 
              type="text" 
              placeholder="z. B. Altenau 733 oder Brauhausberg 1, Potsdam" 
              class="input input-bordered pl-9 w-full input-sm"
              @keyup.enter="searchGeobasis"
            />
          </div>
          <button 
            class="btn btn-sm btn-primary shrink-0" 
            :disabled="loadingGeo || !geoQuery.trim()" 
            @click="searchGeobasis"
          >
            <span v-if="loadingGeo" class="loading loading-spinner loading-xs"></span>
            <Icon v-else name="lucide:search" class="w-4 h-4" />
            Suchen
          </button>
        </div>

        <!-- Search Error Alert -->
        <div v-if="geoError" class="alert alert-warning text-xs py-2">
          <Icon name="lucide:alert-circle" class="w-4 h-4 shrink-0" />
          <span>{{ geoError }}</span>
        </div>

        <!-- Search Results List -->
        <div v-if="searchResults.length > 0" class="max-h-52 overflow-y-auto space-y-2 border border-base-200 rounded-lg p-2 bg-base-200/30">
          <div 
            v-for="res in searchResults" 
            :key="res.id || res.properties?.idflurst || Math.random()"
            class="p-2.5 bg-base-100 rounded-lg border border-base-300 hover:border-primary cursor-pointer transition-all flex items-center justify-between"
            @click="selectGeobasisResult(res)"
          >
            <div class="text-xs space-y-0.5">
              <div class="font-semibold text-primary">
                {{ res.title || res.text || res.name || res.properties?.lagebeztxt || 'Flurstück' }}
              </div>
              <div class="text-base-content/60">
                {{ res.subtitle || res.properties?.flstkennz || res.category || '' }}
              </div>
            </div>
            <button class="btn btn-xs btn-primary btn-outline">
              Übernehmen
            </button>
          </div>
        </div>
      </div>

      <!-- Main Form (Pre-filled by URL, Geobasis or manual) -->
      <form @submit.prevent="submitForm" class="space-y-3 pt-1">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <label class="label label-text text-xs font-semibold py-1">Titel / Bezeichnung *</label>
            <input 
              v-model="form.title" 
              type="text" 
              placeholder="z. B. Traumhaftes Baugrundstück in Seenähe" 
              class="input input-sm input-bordered w-full font-medium"
              required 
            />
          </div>

          <div class="sm:col-span-2">
            <label class="label label-text text-xs font-semibold py-1">Adresse (Straße, Ort)</label>
            <input 
              v-model="form.address" 
              type="text" 
              placeholder="z. B. Heinrich-Mann-Allee 103, 14473 Potsdam" 
              class="input input-sm input-bordered w-full" 
            />
          </div>

          <div>
            <label class="label label-text text-xs font-semibold py-1">Angebotspreis (€)</label>
            <input 
              v-model.number="form.askingPrice" 
              type="number" 
              placeholder="z. B. 350000" 
              class="input input-sm input-bordered w-full font-mono" 
            />
          </div>

          <div>
            <label class="label label-text text-xs font-semibold py-1">Fläche (m²)</label>
            <input 
              v-model.number="form.areaSqm" 
              type="number" 
              placeholder="z. B. 720" 
              class="input input-sm input-bordered w-full font-mono" 
            />
          </div>

          <div>
            <label class="label label-text text-xs font-semibold py-1">Baurecht / B-Plan</label>
            <input 
              v-model="form.buildingLaw" 
              type="text" 
              placeholder="z. B. B-Plan Nr. 4 oder §34 BauGB" 
              class="input input-sm input-bordered w-full" 
            />
          </div>

          <div>
            <label class="label label-text text-xs font-semibold py-1">Inserat-Link (URL)</label>
            <input 
              v-model="form.adUrl" 
              type="url" 
              placeholder="https://immobilienscout24.de/..." 
              class="input input-sm input-bordered w-full font-mono text-xs" 
            />
          </div>

          <div>
            <label class="label label-text text-xs font-semibold py-1">Makler / Ansprechpartner</label>
            <input 
              v-model="form.brokerName" 
              type="text" 
              placeholder="Name des Maklers" 
              class="input input-sm input-bordered w-full" 
            />
          </div>

          <div>
            <label class="label label-text text-xs font-semibold py-1">Makler E-Mail</label>
            <input 
              v-model="form.brokerEmail" 
              type="email" 
              placeholder="kontakt@makler.de" 
              class="input input-sm input-bordered w-full" 
            />
          </div>

          <div class="sm:col-span-2">
            <label class="label label-text text-xs font-semibold py-1">Notizen / Highlights aus Inserat</label>
            <textarea 
              v-model="form.notes" 
              rows="2" 
              placeholder="Besonderheiten, Ausrichtung, Erschließungsangaben..." 
              class="textarea textarea-xs textarea-bordered w-full"
            ></textarea>
          </div>
        </div>

        <!-- Pre-filled parcel info badge -->
        <div v-if="form.flstkennz || form.borisBodenrichtwert" class="bg-primary/10 border border-primary/20 rounded-lg p-2 text-xs flex items-center justify-between">
          <div class="space-y-0.5">
            <span class="font-semibold text-primary block">Flurstück verknüpft</span>
            <span class="font-mono text-base-content/80">{{ form.flstkennz || 'Geobasis Daten bereit' }}</span>
          </div>
          <div v-if="form.borisBodenrichtwert" class="badge badge-sm badge-success font-mono font-bold">
            BORIS: {{ form.borisBodenrichtwert }} €/m²
          </div>
        </div>

        <!-- Inserat Images Preview -->
        <div v-if="form.primaryImageUrl" class="bg-base-200/60 border border-base-300 rounded-xl p-2.5 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold flex items-center gap-1.5 text-primary">
              <Icon name="lucide:image" class="w-3.5 h-3.5" />
              <span>Inseratsfotos erkannt ({{ form.images.length }})</span>
            </span>
          </div>
          <div class="flex gap-2 overflow-x-auto pb-1">
            <img 
              v-for="(img, idx) in form.images.slice(0, 6)" 
              :key="idx" 
              :src="img" 
              class="w-20 h-14 object-cover rounded-lg border border-base-300 shrink-0" 
              alt="Inseratsfoto"
            />
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="modal-action border-t border-base-200 pt-3 mt-4">
          <button type="button" class="btn btn-sm btn-ghost" @click="$emit('close')">
            Abbrechen
          </button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="submitting || !form.title.trim()">
            <span v-if="submitting" class="loading loading-spinner loading-xs"></span>
            Grundstück anlegen
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'

const toast = useToast()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', id: string): void
}>()

const tab = ref<'url' | 'geobasis' | 'manual'>('url')

// URL import state
const importUrl = ref('')
const loadingUrl = ref(false)
const urlError = ref('')
const urlSuccessMessage = ref('')
const urlWarning = ref('')

// Geobasis state
const geoQuery = ref('')
const loadingGeo = ref(false)
const geoError = ref('')
const searchResults = ref<any[]>([])

const submitting = ref(false)

const form = reactive({
  title: '',
  address: '',
  askingPrice: null as number | null,
  areaSqm: null as number | null,
  buildingLaw: '',
  adUrl: '',
  notes: '',
  brokerName: '',
  brokerEmail: '',
  flstkennz: '',
  gemarkungName: '',
  flur: null as number | null,
  zaehler: null as number | null,
  borisBodenrichtwert: null as number | null,
  geojsonGeometry: null as any,
  latitude: null as number | null,
  longitude: null as number | null,
  primaryImageUrl: '',
  images: [] as string[]
})

async function importFromUrl() {
  const url = importUrl.value.trim()
  if (!url) return

  loadingUrl.value = true
  urlError.value = ''
  urlSuccessMessage.value = ''
  urlWarning.value = ''

  try {
    const res = await $fetch<any>('/api/properties/import-url', {
      method: 'POST',
      body: { url }
    })

    if (res?.data) {
      const d = res.data
      if (d.title) form.title = d.title
      if (d.address) form.address = d.address
      if (d.askingPrice) form.askingPrice = d.askingPrice
      if (d.areaSqm) form.areaSqm = d.areaSqm
      if (d.buildingLaw) form.buildingLaw = d.buildingLaw
      if (d.notes) form.notes = d.notes
      if (d.latitude) form.latitude = d.latitude
      if (d.longitude) form.longitude = d.longitude
      if (d.primaryImageUrl) form.primaryImageUrl = d.primaryImageUrl
      if (d.images) form.images = d.images
      form.adUrl = url

      if (d.broker?.name) form.brokerName = d.broker.name
      if (d.broker?.email) form.brokerEmail = d.broker.email

      if (d.flurstueck?.gemarkung) form.gemarkungName = d.flurstueck.gemarkung
      if (d.flurstueck?.flur) form.flur = d.flurstueck.flur
      if (d.flurstueck?.zaehler) form.zaehler = d.flurstueck.zaehler

      const methodLabel = res.method === 'flaresolverr' ? 'FlareSolverr' : 'Direktabruf'
      urlWarning.value = res.warning || ''
      urlSuccessMessage.value = res.warning
        ? `Seite via ${methodLabel} abgerufen - bitte die Felder unten prüfen.`
        : `Daten erfolgreich via ${methodLabel} abgerufen und mit KI vorbefüllt!`
    }
  } catch (err: any) {
    urlError.value = err.data?.message || err.data?.statusMessage || err.message || 'Fehler beim Abruf der Inserat-URL.'
  } finally {
    loadingUrl.value = false
  }
}

async function searchGeobasis() {
  if (!geoQuery.value.trim()) return
  loadingGeo.value = true
  geoError.value = ''
  searchResults.value = []

  try {
    const res = await $fetch<any>('/api/geobasis/search', {
      query: { query: geoQuery.value.trim(), limit: 8 }
    })
    searchResults.value = res?.features || res?.results || res || []
    if (searchResults.value.length === 0) {
      geoError.value = 'Keine Treffer im Liegenschaftskataster Brandenburg gefunden.'
    }
  } catch (err: any) {
    geoError.value = err.data?.statusMessage || err.message || 'Geobasis-Suche nicht verfügbar. Bitte prüfe, ob "geobasis serve" läuft.'
  } finally {
    loadingGeo.value = false
  }
}

async function selectGeobasisResult(res: any) {
  const p = res.properties || res
  form.title = res.title || res.text || p.lagebeztxt || `Flurstück ${p.flstkennz || geoQuery.value}`
  form.address = p.lagebeztxt || res.text || res.title || ''
  
  if (p.flaeche) {
    form.areaSqm = Number(p.flaeche)
  }

  const kennz = p.flstkennz || res.id
  if (kennz) {
    form.flstkennz = kennz
    try {
      const priceRes = await $fetch<any>(`/api/geobasis/flurstueck/${encodeURIComponent(kennz)}/preise`)
      if (priceRes?.currentPrice?.bodenrichtwert) {
        form.borisBodenrichtwert = priceRes.currentPrice.bodenrichtwert
      }
    } catch {}
  }
}

async function submitForm() {
  submitting.value = true
  try {
    const payload: any = {
      title: form.title,
      address: form.address,
      askingPrice: form.askingPrice,
      areaSqm: form.areaSqm,
      buildingLaw: form.buildingLaw,
      adUrl: form.adUrl,
      notes: form.notes,
      latitude: form.latitude,
      longitude: form.longitude,
      primaryImageUrl: form.primaryImageUrl || null,
      images: form.images || [],
      status: 'new'
    }

    if (form.brokerName || form.brokerEmail) {
      payload.broker = {
        name: form.brokerName,
        email: form.brokerEmail
      }
    }

    if (form.flstkennz || form.borisBodenrichtwert) {
      payload.parcel = {
        flstkennz: form.flstkennz,
        gemarkungName: form.gemarkungName,
        flur: form.flur,
        zaehler: form.zaehler,
        borisBodenrichtwert: form.borisBodenrichtwert,
        officialArea: form.areaSqm
      }
    }

    const res = await $fetch<any>('/api/properties', {
      method: 'POST',
      body: payload
    })

    if (res?.id) {
      toast.success('Grundstück erfolgreich angelegt!')
      emit('created', res.id)
    }
  } catch (err: any) {
    toast.error('Fehler beim Anlegen: ' + (err.data?.statusMessage || err.message))
  } finally {
    submitting.value = false
  }
}
</script>
