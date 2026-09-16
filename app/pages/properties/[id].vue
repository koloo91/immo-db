<template>
  <div v-if="pending" class="flex justify-center items-center py-24">
    <span class="loading loading-spinner loading-lg text-primary"></span>
  </div>

  <div v-else-if="!property" class="text-center py-20 space-y-4">
    <h2 class="text-xl font-bold">Grundstück nicht gefunden</h2>
    <NuxtLink to="/" class="btn btn-primary btn-sm">Zurück zur Übersicht</NuxtLink>
  </div>

  <div v-else class="space-y-6">
    <!-- Top Nav & Breadcrumbs -->
    <div class="flex items-center justify-between text-xs text-base-content/60">
      <NuxtLink to="/" class="btn btn-ghost btn-sm gap-1">
        <Icon name="lucide:arrow-left" class="w-3.5 h-3.5" />
        <span>Zurück zum Portfolio</span>
      </NuxtLink>
      <div class="font-mono">ID: {{ property.id }}</div>
    </div>

    <!-- Image Gallery Banner -->
    <div v-if="parsedImages.length > 0" class="bg-base-100 border border-base-300 rounded-2xl overflow-hidden shadow-sm">
      <!-- Main Featured Image -->
      <div class="relative w-full h-64 sm:h-80 md:h-[400px] bg-base-300 group cursor-pointer" @click="openLightbox = true">
        <img 
          :src="currentImage || property.primaryImageUrl" 
          :alt="property.title"
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.01]" 
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-4 text-white">
          <span class="text-xs font-medium bg-black/60 backdrop-blur-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
            <Icon name="lucide:maximize-2" class="w-3.5 h-3.5" />
            <span>Vollbild anzeigen</span>
          </span>
          <span class="text-xs font-mono bg-black/60 backdrop-blur-xs px-2.5 py-1.5 rounded-lg shadow-sm">
            {{ activeImageIndex + 1 }} / {{ parsedImages.length }}
          </span>
        </div>

        <!-- Quick Nav Arrows -->
        <button 
          v-if="parsedImages.length > 1"
          type="button"
          class="absolute left-3 top-1/2 -translate-y-1/2 btn btn-circle btn-sm btn-neutral bg-black/50 border-none text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          @click.stop="prevImage"
          title="Vorheriges Bild"
        >
          <Icon name="lucide:chevron-left" class="w-4 h-4" />
        </button>
        <button 
          v-if="parsedImages.length > 1"
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 btn btn-circle btn-sm btn-neutral bg-black/50 border-none text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          @click.stop="nextImage"
          title="Nächstes Bild"
        >
          <Icon name="lucide:chevron-right" class="w-4 h-4" />
        </button>
      </div>

      <!-- Thumbnail Strip -->
      <div v-if="parsedImages.length > 1" class="flex items-center gap-2 p-3 bg-base-200/40 overflow-x-auto border-t border-base-200">
        <button
          v-for="(img, idx) in parsedImages"
          :key="idx"
          type="button"
          class="shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer relative"
          :class="activeImageIndex === idx ? 'border-primary ring-2 ring-primary/40 scale-95' : 'border-transparent opacity-70 hover:opacity-100'"
          @click="selectImage(idx)"
        >
          <img :src="img" class="w-full h-full object-cover" />
        </button>
      </div>
    </div>

    <!-- Header Section -->
    <div class="bg-base-100 border border-base-300 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <!-- Title & Location -->
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-base-content">
              {{ property.title }}
            </h1>
            <span class="badge badge-md" :class="getStatusBadgeClass(property.status)">
              {{ getStatusLabel(property.status) }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-xs sm:text-sm text-base-content/70">
            <Icon name="lucide:map-pin" class="w-4 h-4 text-primary shrink-0" />
            <span>{{ property.address || 'Keine Adresse angegeben' }}</span>
            <div v-if="property.adUrl" class="flex items-center gap-1.5 ml-2">
              <a 
                :href="property.adUrl" 
                target="_blank" 
                rel="noopener" 
                class="badge badge-xs badge-outline gap-1 text-primary hover:bg-primary hover:text-primary-content transition-colors"
              >
                <span>Inserat</span>
                <Icon name="lucide:external-link" class="w-3 h-3" />
              </a>
              <button 
                class="badge badge-xs badge-neutral gap-1 cursor-pointer hover:badge-primary transition-colors"
                :disabled="syncingUrl"
                title="Daten aus dem Web-Inserat via FlareSolverr & KI erneut abrufen"
                @click="syncFromUrl"
              >
                <span v-if="syncingUrl" class="loading loading-spinner loading-[9px]"></span>
                <Icon v-else name="lucide:refresh-cw" class="w-2.5 h-2.5" />
                <span>Neu laden</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Status & Actions -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Status Dropdown -->
          <div class="dropdown dropdown-end">
            <label tabindex="0" class="btn btn-sm btn-outline gap-1">
              <span>Status ändern</span>
              <Icon name="lucide:chevron-down" class="w-3.5 h-3.5" />
            </label>
            <ul tabindex="0" class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-52 text-xs border border-base-300 z-30">
              <li v-for="s in statuses" :key="s.id">
                <a :class="property.status === s.id ? 'active' : ''" @click="updateStatus(s.id)">
                  {{ s.label }}
                </a>
              </li>
            </ul>
          </div>

          <!-- Geobasis Sync Button -->
          <button 
            class="btn btn-sm btn-primary gap-1.5"
            :disabled="syncingGeo"
            title="Aktualisiert Flurstücksdaten, amtliche Fläche und BORIS-Bodenrichtwert aus geobasis-cli"
            @click="syncWithGeobasis"
          >
            <span v-if="syncingGeo" class="loading loading-spinner loading-xs"></span>
            <Icon v-else name="lucide:refresh-cw" class="w-4 h-4" />
            <span>Geobasis Sync</span>
          </button>

          <!-- Edit Modal Button -->
          <button class="btn btn-sm btn-ghost btn-square" title="Bearbeiten" @click="startEdit">
            <Icon name="lucide:edit-2" class="w-4 h-4" />
          </button>

          <!-- Delete Button -->
          <button class="btn btn-sm btn-ghost btn-square text-error" title="Löschen" @click="deleteProperty">
            <Icon name="lucide:trash-2" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Quick Metrics Ribbon -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-base-200">
        <div>
          <span class="text-xs text-base-content/60 block">Kaufpreis</span>
          <span class="text-base sm:text-lg font-bold font-mono text-base-content">
            {{ property.askingPrice ? property.askingPrice.toLocaleString('de-DE') + ' €' : 'Auf Anfrage' }}
          </span>
        </div>
        <div>
          <span class="text-xs text-base-content/60 block">Fläche</span>
          <span class="text-base sm:text-lg font-bold font-mono text-base-content">
            {{ property.areaSqm ? property.areaSqm + ' m²' : 'k.A.' }}
          </span>
        </div>
        <div>
          <span class="text-xs text-base-content/60 block">Angebotspreis / m²</span>
          <span class="text-base sm:text-lg font-bold font-mono text-base-content">
            {{ property.pricePerSqm ? Math.round(property.pricePerSqm) + ' €/m²' : '-' }}
          </span>
        </div>
        <div>
          <span class="text-xs text-base-content/60 block">BORIS Bodenrichtwert</span>
          <div class="flex items-center gap-1.5">
            <span class="text-base sm:text-lg font-bold font-mono text-success">
              {{ property.parcel?.borisBodenrichtwert ? property.parcel.borisBodenrichtwert + ' €/m²' : 'Nicht erfasst' }}
            </span>
            <span 
              v-if="property.parcel?.borisBodenrichtwert && property.pricePerSqm"
              class="badge badge-xs font-mono"
              :class="getBorisDiffClass(property.pricePerSqm, property.parcel.borisBodenrichtwert)"
            >
              {{ formatBorisDiff(property.pricePerSqm, property.parcel.borisBodenrichtwert) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Meldungen aus der Inseratsprüfung -->
    <div v-if="showPriceAlert" class="alert alert-warning py-3">
      <Icon name="lucide:tag" class="w-5 h-5 shrink-0" />
      <div class="flex-1 min-w-0 space-y-0.5">
        <div class="font-semibold text-sm">Preis im Inserat hat sich geändert</div>
        <div class="text-xs">
          Das Inserat nennt jetzt
          <strong class="font-mono">{{ Number(listing.pendingPrice).toLocaleString('de-DE') }} €</strong>
          &ndash; hinterlegt ist
          <span class="font-mono">{{ property.askingPrice ? property.askingPrice.toLocaleString('de-DE') + ' €' : 'kein Preis' }}</span>.
        </div>
      </div>
      <div class="flex gap-2 shrink-0">
        <button class="btn btn-sm btn-ghost" :disabled="resolvingAlert" @click="resolveAlert('dismiss')">
          Ignorieren
        </button>
        <button class="btn btn-sm btn-primary" :disabled="resolvingAlert" @click="resolveAlert('accept')">
          <span v-if="resolvingAlert" class="loading loading-spinner loading-xs"></span>
          Übernehmen
        </button>
      </div>
    </div>

    <div v-else-if="showGoneAlert" class="alert alert-error py-3">
      <Icon name="lucide:circle-x" class="w-5 h-5 shrink-0" />
      <div class="flex-1 min-w-0 space-y-0.5">
        <div class="font-semibold text-sm">Inserat ist nicht mehr auffindbar</div>
        <div class="text-xs">
          Zuletzt erfolgreich geprüft am {{ listing.lastOkAt ? formatDate(listing.lastOkAt) : 'unbekannt' }}.
          <template v-if="listing.lastMessage"> {{ listing.lastMessage }}</template>
        </div>
      </div>
      <button class="btn btn-sm btn-ghost shrink-0" :disabled="resolvingAlert" @click="resolveAlert('dismiss')">
        Zur Kenntnis genommen
      </button>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center gap-1 sm:gap-2 border-b border-base-300 pb-px overflow-x-auto">
      <button 
        type="button"
        class="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer"
        :class="activeTab === 'geo' ? 'border-primary text-primary' : 'border-transparent text-base-content/60 hover:text-base-content hover:border-base-300'"
        @click="activeTab = 'geo'"
      >
        <Icon name="lucide:map" class="w-4 h-4" />
        <span>Lage, Kataster & BORIS</span>
      </button>

      <button 
        type="button"
        class="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer"
        :class="activeTab === 'broker' ? 'border-primary text-primary' : 'border-transparent text-base-content/60 hover:text-base-content hover:border-base-300'"
        @click="activeTab = 'broker'"
      >
        <Icon name="lucide:user-check" class="w-4 h-4" />
        <span>Makler & Kommunikation</span>
        <span v-if="missingChecklistCount > 0" class="badge badge-xs badge-warning ml-1">
          {{ missingChecklistCount }}
        </span>
      </button>

      <button 
        type="button"
        class="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer"
        :class="activeTab === 'docs' ? 'border-primary text-primary' : 'border-transparent text-base-content/60 hover:text-base-content hover:border-base-300'"
        @click="activeTab = 'docs'"
      >
        <Icon name="lucide:file-text" class="w-4 h-4" />
        <span>Dokumente</span>
        <span v-if="property.documents?.length" class="badge badge-xs badge-neutral ml-1">
          {{ property.documents.length }}
        </span>
      </button>

      <button 
        type="button"
        class="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 cursor-pointer"
        :class="activeTab === 'analysis' ? 'border-primary text-primary' : 'border-transparent text-base-content/60 hover:text-base-content hover:border-base-300'"
        @click="activeTab = 'analysis'"
      >
        <Icon name="lucide:brain-circuit" class="w-4 h-4" />
        <span>KI-Gesamtanalyse</span>
        <span
          v-if="latestAnalysis?.scoreOverall !== null && latestAnalysis?.scoreOverall !== undefined"
          class="badge badge-xs ml-1 font-mono"
          :class="latestAnalysis.scoreOverall >= 70 ? 'badge-success' : latestAnalysis.scoreOverall >= 45 ? 'badge-warning' : 'badge-error'"
        >
          {{ latestAnalysis.scoreOverall }}
        </span>
      </button>
    </div>

    <!-- TAB 1: Lage, Kataster & BORIS -->
    <div v-if="activeTab === 'geo'" class="space-y-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Map Column (2/3 width on large screens) -->
        <div class="lg:col-span-2 space-y-4">
          <div class="card bg-base-100 border border-base-300 shadow-sm p-4 space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-sm flex items-center gap-2">
                <Icon name="lucide:compass" class="w-4 h-4 text-primary" />
                Flurstücksumriss & Karte (LGB Geodaten)
              </h3>
              <span v-if="property.parcel?.geojsonGeometry" class="badge badge-xs badge-success gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                ALKIS-Geometrie geladen
              </span>
            </div>
            
            <div class="h-[420px] w-full">
              <PropertyMap 
                :single-property="property" 
                :geo-json="property.parcel?.geojsonGeometry" 
                :zoom="16" 
              />
            </div>
          </div>

          <!-- BORIS Price History Chart -->
          <PriceHistoryChart 
            :history-json="property.parcel?.priceHistoryJson" 
            :current-value="property.parcel?.borisBodenrichtwert" 
          />

          <PriceTimeline
            :property-id="property.id"
            :status="listing"
            :observations="property.priceObservations || []"
            :area-sqm="property.areaSqm"
            @refresh="refresh"
          />
        </div>

        <!-- Details Column (1/3 width) -->
        <div class="space-y-4">
          <!-- Official Kataster Data Card -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-4 space-y-3">
              <div class="flex items-center justify-between border-b border-base-200 pb-2">
                <h3 class="font-bold text-sm flex items-center gap-2">
                  <Icon name="lucide:landmark" class="w-4 h-4 text-primary" />
                  Amtliche Katasterdaten (ALKIS)
                </h3>
                <button 
                  type="button" 
                  class="btn btn-sm btn-outline btn-primary gap-1"
                  @click="startEditParcel"
                  title="Katasterdaten und Flurstück bearbeiten oder neu verknüpfen"
                >
                  <Icon name="lucide:edit-3" class="w-3 h-3" />
                  <span>Ändern</span>
                </button>
              </div>

              <div class="space-y-2 text-xs">
                <div class="flex justify-between py-1 border-b border-base-200">
                  <span class="text-base-content/60">Flurstückskennzeichen:</span>
                  <span class="font-mono font-semibold">{{ property.parcel?.flstkennz || 'Nicht verknüpft' }}</span>
                </div>
                <div class="flex justify-between py-1 border-b border-base-200">
                  <span class="text-base-content/60">Gemarkung:</span>
                  <span class="font-medium">{{ property.parcel?.gemarkungName || '-' }}</span>
                </div>
                <div class="flex justify-between py-1 border-b border-base-200">
                  <span class="text-base-content/60">Flur / Zähler / Nenner:</span>
                  <span class="font-mono">
                    Flur {{ property.parcel?.flur || '-' }} / {{ property.parcel?.zaehler || '-' }}
                    <span v-if="property.parcel?.nenner">/ {{ property.parcel?.nenner }}</span>
                  </span>
                </div>
                <div class="flex justify-between py-1 border-b border-base-200">
                  <span class="text-base-content/60">Amtliche Fläche:</span>
                  <span class="font-mono font-semibold">{{ property.parcel?.officialArea ? `${property.parcel.officialArea} m²` : '-' }}</span>
                </div>
                <div class="flex justify-between py-1 border-b border-base-200">
                  <span class="text-base-content/60">BORIS Entwicklungszustand:</span>
                  <span>{{ property.parcel?.borisEntwicklungszustand || 'Baureifes Land' }}</span>
                </div>
                <div class="flex justify-between py-1">
                  <span class="text-base-content/60">BORIS Nutzung:</span>
                  <span>{{ property.parcel?.borisNutzung || 'Wohnbaufläche' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Building Law & Planning Parameters -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-4 space-y-3">
              <div class="flex items-center justify-between border-b border-base-200 pb-2">
                <h3 class="font-bold text-sm flex items-center gap-2">
                  <Icon name="lucide:hammer" class="w-4 h-4 text-primary" />
                  Baurecht & Bebaubarkeit
                </h3>
                <button
                  class="btn btn-ghost btn-sm text-primary gap-1"
                  :disabled="savingBuildingLaw"
                  @click="toggleBuildingLawEdit"
                >
                  <span v-if="savingBuildingLaw" class="loading loading-spinner loading-xs"></span>
                  <Icon v-else :name="editingBuildingLaw ? 'lucide:check' : 'lucide:edit-2'" class="w-3.5 h-3.5" />
                  <span>{{ editingBuildingLaw ? 'Speichern' : 'Ändern' }}</span>
                </button>
              </div>

              <!-- Ansicht -->
              <div v-if="!editingBuildingLaw" class="space-y-2 text-xs">
                <div class="flex justify-between py-1 border-b border-base-200">
                  <span class="text-base-content/60">Grundlage:</span>
                  <span class="font-medium">{{ property.buildingLaw || 'Nicht angegeben' }}</span>
                </div>
                <div class="flex justify-between py-1 border-b border-base-200">
                  <span class="text-base-content/60">GRZ (Grundflächenzahl):</span>
                  <span class="font-mono">{{ property.grz ?? 'k.A.' }}</span>
                </div>
                <div class="flex justify-between py-1 border-b border-base-200">
                  <span class="text-base-content/60">GFZ (Geschossflächenzahl):</span>
                  <span class="font-mono">{{ property.gfz ?? 'k.A.' }}</span>
                </div>
                <div class="flex justify-between py-1">
                  <span class="text-base-content/60">Erschließung:</span>
                  <span class="badge badge-sm badge-ghost">{{ property.developmentStatus || 'unbekannt' }}</span>
                </div>
              </div>

              <!-- Bearbeiten -->
              <div v-else class="space-y-3">
                <div>
                  <label class="label label-text text-xs py-1">Grundlage</label>
                  <input
                    v-model="buildingLawForm.buildingLaw"
                    type="text"
                    class="input input-sm input-bordered w-full"
                    placeholder="z. B. B-Plan Nr. 12 oder §34 BauGB"
                    @keyup.enter="saveBuildingLaw"
                  />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="label label-text text-xs py-1">GRZ</label>
                    <input
                      v-model.number="buildingLawForm.grz"
                      type="number"
                      step="0.01"
                      min="0"
                      class="input input-sm input-bordered w-full font-mono"
                      placeholder="0.25"
                      @keyup.enter="saveBuildingLaw"
                    />
                  </div>
                  <div>
                    <label class="label label-text text-xs py-1">GFZ</label>
                    <input
                      v-model.number="buildingLawForm.gfz"
                      type="number"
                      step="0.01"
                      min="0"
                      class="input input-sm input-bordered w-full font-mono"
                      placeholder="0.5"
                      @keyup.enter="saveBuildingLaw"
                    />
                  </div>
                </div>
                <div>
                  <label class="label label-text text-xs py-1">Erschließung</label>
                  <select v-model="buildingLawForm.developmentStatus" class="select select-sm select-bordered w-full">
                    <option value="">unbekannt</option>
                    <option value="voll erschlossen">voll erschlossen</option>
                    <option value="teilerschlossen">teilerschlossen</option>
                    <option value="unerschlossen">unerschlossen</option>
                  </select>
                </div>
                <div class="flex justify-end gap-2">
                  <button class="btn btn-sm btn-ghost" :disabled="savingBuildingLaw" @click="editingBuildingLaw = false">
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Ancillary Cost Calculator -->
          <CostCalculator 
            :asking-price="property.askingPrice" 
            :property-id="property.id" 
            :initial-costs-json="property.ancillaryCostsJson" 
          />
        </div>
      </div>
    </div>

    <!-- TAB 2: Makler & Kommunikation -->
    <div v-if="activeTab === 'broker'" class="space-y-6">
      <EmailThreadView
        :property-id="property.id"
        :threads="property.emailThreads || []"
        :communications="property.communications || []"
        :broker-email="property.broker?.email"
        :highlight-thread-id="highlightThreadId"
        @refresh="refresh"
      />

      <BrokerTimeline 
        :property-id="property.id"
        :broker="property.broker"
        :checklist="property.checklistItems || []"
        :communications="property.communications || []"
        @refresh="refresh"
      />
    </div>

    <!-- TAB 3: Dokumente & KI-Analyse -->
    <div v-if="activeTab === 'docs'" class="space-y-6">
      <!-- Upload Card -->
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-4 sm:p-5 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
            <div>
              <h3 class="font-bold text-sm flex items-center gap-2">
                <Icon name="lucide:upload-cloud" class="w-4 h-4 text-primary" />
                Dokumente hochladen
              </h3>
              <p class="text-xs text-base-content/60 mt-0.5">
                Mehrere PDFs auf einmal ablegen. Der Upload ist sofort fertig, die KI-Analyse
                läuft danach im Hintergrund weiter.
              </p>
            </div>

            <div class="w-full sm:w-52 shrink-0">
              <label class="label label-text text-xs py-0.5">Kategorie</label>
              <select v-model="selectedDocType" class="select select-sm select-bordered w-full">
                <option :value="null">Automatisch erkennen</option>
                <option value="expose">Exposé</option>
                <option value="bplan">Bebauungsplan</option>
                <option value="kataster">Katasterauszug</option>
                <option value="grundbuch">Grundbuchauszug</option>
                <option value="altlasten">Altlasten / Bodengutachten</option>
                <option value="sonstiges">Sonstiges Dokument</option>
              </select>
            </div>
          </div>

          <!-- Drag & Drop Zone -->
          <label
            class="border-2 border-dashed rounded-xl p-6 text-center block cursor-pointer transition-colors"
            :class="[
              docDragOver ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/50',
              uploading ? 'opacity-60 pointer-events-none' : ''
            ]"
            @dragover.prevent="docDragOver = true"
            @dragleave.prevent="docDragOver = false"
            @drop.prevent="onDropDocuments"
          >
            <span v-if="uploading" class="loading loading-spinner loading-md text-primary"></span>
            <Icon v-else name="lucide:file-plus-2" class="w-8 h-8 mx-auto text-base-content/40" />
            <p class="text-xs text-base-content/70 mt-2 font-medium">
              {{ uploading ? 'Dateien werden abgelegt...' : 'PDFs hier ablegen oder klicken zum Auswählen' }}
            </p>
            <p class="text-xs text-base-content/50 mt-0.5">
              Mehrfachauswahl möglich &bull; Duplikate werden automatisch erkannt
            </p>
            <input
              type="file"
              accept="application/pdf"
              multiple
              class="hidden"
              :disabled="uploading"
              @change="onPickDocuments"
            />
          </label>
        </div>
      </div>

      <!-- Uploaded Documents List & AI Reports -->
      <div v-if="!property.documents || property.documents.length === 0" class="card bg-base-100 border border-base-300 p-8 text-center text-xs text-base-content/50">
        Bisher keine Dokumente hochgeladen. Lade oben ein Exposé oder einen B-Plan hoch, um die KI-Analyse zu starten.
      </div>

      <div v-else class="space-y-4">
        <div 
          v-for="doc in property.documents" 
          :key="doc.id"
          :data-doc="doc.id"
          class="card bg-base-100 shadow-sm transition-colors"
          :class="doc.id === highlightDocId ? 'border-2 border-primary' : 'border border-base-300'"
        >
          <div class="card-body p-4 sm:p-5 space-y-3">
            <!-- Doc Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-2">
              <div class="flex items-center gap-2 min-w-0">
                <Icon name="lucide:file-text" class="w-5 h-5 text-primary shrink-0" />
                <div class="min-w-0">
                  <h4 class="font-bold text-sm truncate">{{ doc.fileName }}</h4>
                  <div class="text-xs text-base-content/60 flex items-center gap-2 flex-wrap">
                    <select
                      :value="doc.docType"
                      class="select select-sm select-bordered h-6 min-h-6 text-xs"
                      :disabled="changingTypeId === doc.id"
                      @change="changeDocType(doc.id, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="expose">Exposé</option>
                      <option value="bplan">Bebauungsplan</option>
                      <option value="kataster">Katasterauszug</option>
                      <option value="grundbuch">Grundbuchauszug</option>
                      <option value="altlasten">Altlasten / Boden</option>
                      <option value="sonstiges">Sonstiges</option>
                    </select>
                    <span>{{ (doc.fileSize / 1024).toFixed(1) }} KB</span>
                    <span>&bull;</span>
                    <span>{{ formatDate(doc.createdAt) }}</span>

                    <!-- Volltext-Status: entscheidet über die Auffindbarkeit -->
                    <span
                      v-if="doc.textStatus === 'none'"
                      class="badge badge-xs badge-warning gap-1"
                      title="Dieses PDF enthält keine Textebene (Scan). Es ist nur über die KI-Zusammenfassung auffindbar, nicht im Volltext."
                    >
                      <Icon name="lucide:scan-line" class="w-3 h-3" />
                      Scan &ndash; nicht volltextdurchsuchbar
                    </span>
                    <span
                      v-else-if="doc.textStatus === 'done' && doc.pageCount"
                      class="badge badge-xs badge-ghost gap-1"
                      :title="`${doc.pageCount} Seite(n) im Volltext durchsuchbar`"
                    >
                      <Icon name="lucide:file-search" class="w-3 h-3" />
                      {{ doc.pageCount }} Seite{{ doc.pageCount === 1 ? '' : 'n' }} indexiert
                    </span>

                    <!-- Analyse-Status -->
                    <span class="badge badge-xs gap-1" :class="analysisBadgeClass(doc.analysisStatus)">
                      <span v-if="doc.analysisStatus === 'running' || doc.analysisStatus === 'pending'" class="loading loading-spinner loading-xs"></span>
                      <Icon v-else :name="analysisBadgeIcon(doc.analysisStatus)" class="w-3 h-3" />
                      {{ analysisStatusLabel(doc.analysisStatus) }}
                    </span>

                    <!-- Herkunft aus einer Mail -->
                    <span v-if="doc.communication" class="badge badge-xs badge-ghost gap-1">
                      <Icon name="lucide:mail" class="w-3 h-3" />
                      aus E-Mail {{ doc.communication.fromAddress ? 'von ' + doc.communication.fromAddress : '' }}
                      vom {{ formatShortDate(doc.communication.occurredAt || doc.communication.createdAt) }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 self-end sm:self-center">
                <!-- View/Open PDF in new tab -->
                <a 
                  :href="`/api/properties/${property.id}/documents/${doc.id}/file`" 
                  target="_blank" 
                  rel="noopener" 
                  class="btn btn-sm btn-outline gap-1"
                >
                  <Icon name="lucide:external-link" class="w-3.5 h-3.5" />
                  PDF ansehen
                </a>

                <!-- Apply Extracted Data Button -->
                <button 
                  v-if="doc.aiExtractedDataJson"
                  class="btn btn-sm btn-success gap-1 text-success-content"
                  title="Werte aus dem PDF (Kaufpreis, Fläche, Baurecht, Makler) direkt in dieses Grundstück übernehmen"
                  @click="applyDocData(doc.id)"
                >
                  <Icon name="lucide:check" class="w-3.5 h-3.5" />
                  Daten übernehmen
                </button>

                <!-- Re-analyze button -->
                <button 
                  class="btn btn-sm gap-1"
                  :class="doc.analysisStatus === 'error' ? 'btn-warning' : 'btn-ghost'"
                  :disabled="reanalyzingId === doc.id || doc.analysisStatus === 'running' || doc.analysisStatus === 'skipped'"
                  @click="reanalyzeDoc(doc.id)"
                >
                  <span v-if="reanalyzingId === doc.id" class="loading loading-spinner loading-xs"></span>
                  <Icon v-else name="lucide:refresh-cw" class="w-3.5 h-3.5" />
                  {{ doc.analysisStatus === 'error' ? 'Erneut versuchen' : 'Re-Analyse' }}
                </button>

                <!-- Delete Document -->
                <button 
                  class="btn btn-sm btn-ghost btn-circle text-error"
                  title="Dokument löschen"
                  @click="deleteDoc(doc.id)"
                >
                  <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Gemini AI Analysis Card Body -->
            <div class="space-y-3 pt-1">
              <!-- Aus der Suche angesprungen -->
              <div
                v-if="doc.id === highlightDocId && highlightPage"
                class="alert alert-info text-xs py-2"
              >
                <Icon name="lucide:search" class="w-4 h-4 shrink-0" />
                <span>Der Suchtreffer liegt auf <strong>Seite {{ highlightPage }}</strong> dieses Dokuments.</span>
              </div>

              <!-- Fehler bei der Analyse -->
              <div v-if="doc.analysisStatus === 'error'" class="alert alert-error text-xs py-2">
                <Icon name="lucide:alert-triangle" class="w-4 h-4 shrink-0" />
                <span class="break-all">{{ doc.analysisError || 'Die Analyse ist fehlgeschlagen.' }}</span>
              </div>

              <!-- Analyse läuft noch -->
              <div
                v-else-if="doc.analysisStatus === 'pending' || doc.analysisStatus === 'running'"
                class="bg-base-200/50 p-3 rounded-xl text-xs flex items-center gap-2 text-base-content/70"
              >
                <span class="loading loading-spinner loading-xs"></span>
                <span>Gemini wertet das Dokument gerade aus &ndash; das Ergebnis erscheint automatisch.</span>
              </div>

              <div v-else-if="doc.analysisStatus === 'skipped'" class="text-xs text-base-content/50">
                Keine PDF-Datei &ndash; wurde abgelegt, aber nicht analysiert.
              </div>

              <!-- Summary -->
              <div v-if="doc.aiSummary" class="bg-base-200/50 p-3 rounded-xl text-xs leading-relaxed">
                <strong class="font-semibold text-primary block mb-1 flex items-center gap-1">
                  <Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
                  KI-Zusammenfassung (Gemini):
                </strong>
                <span>{{ doc.aiSummary }}</span>
              </div>

              <!-- Extracted Data & Risks Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <!-- Extracted Data -->
                <div v-if="getParsedJson(doc.aiExtractedDataJson)" class="p-3 bg-base-100 rounded-lg border border-base-200 space-y-1.5">
                  <strong class="font-semibold text-xs flex items-center gap-1 text-base-content/80">
                    <Icon name="lucide:database" class="w-3.5 h-3.5 text-base-content/50" />
                    Erkannte Grundstücksdaten:
                  </strong>
                  <ul class="space-y-1 text-base-content/70">
                    <li v-if="getParsedJson(doc.aiExtractedDataJson).askingPrice">
                      Preis: <strong>{{ getParsedJson(doc.aiExtractedDataJson).askingPrice.toLocaleString('de-DE') }} €</strong>
                    </li>
                    <li v-if="getParsedJson(doc.aiExtractedDataJson).areaSqm">
                      Fläche: <strong>{{ getParsedJson(doc.aiExtractedDataJson).areaSqm }} m²</strong>
                    </li>
                    <li v-if="getParsedJson(doc.aiExtractedDataJson).buildingLaw">
                      Baurecht: <strong>{{ getParsedJson(doc.aiExtractedDataJson).buildingLaw }}</strong>
                    </li>
                    <li v-if="getParsedJson(doc.aiExtractedDataJson).grz">
                      GRZ: <strong>{{ getParsedJson(doc.aiExtractedDataJson).grz }}</strong>
                    </li>
                    <li v-if="getParsedJson(doc.aiExtractedDataJson).developmentStatus">
                      Erschließung: <strong>{{ getParsedJson(doc.aiExtractedDataJson).developmentStatus }}</strong>
                    </li>
                    <li v-if="getParsedJson(doc.aiExtractedDataJson).flurstueck?.kennzeichen">
                      Flurstück: <code>{{ getParsedJson(doc.aiExtractedDataJson).flurstueck.kennzeichen }}</code>
                    </li>
                  </ul>
                </div>

                <!-- Risk Assessment -->
                <div v-if="getParsedJson(doc.aiRiskAssessmentJson)" class="p-3 bg-base-100 rounded-lg border border-base-200 space-y-1.5">
                  <strong class="font-semibold text-xs flex items-center gap-1 text-warning">
                    <Icon name="lucide:alert-triangle" class="w-3.5 h-3.5 text-warning" />
                    Risikoprüfung & Prüfpunkte:
                  </strong>
                  <ul class="space-y-1 text-base-content/80 list-disc list-inside">
                    <li v-for="(risk, idx) in (getParsedJson(doc.aiRiskAssessmentJson).risks || [])" :key="idx">
                      {{ risk }}
                    </li>
                  </ul>

                  <div v-if="getParsedJson(doc.aiRiskAssessmentJson).openQuestionsForBroker?.length" class="pt-1.5 border-t border-base-200">
                    <span class="text-xs font-semibold text-base-content/70 block">Empfohlene Maklerfragen:</span>
                    <ul class="space-y-0.5 text-xs text-base-content/70 list-disc list-inside mt-0.5">
                      <li v-for="(q, idx) in getParsedJson(doc.aiRiskAssessmentJson).openQuestionsForBroker" :key="idx">
                        {{ q }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Q&A Chat with Documents -->
      <DocumentChat :property-id="property.id" :initial-chats="property.documentChats || []" />
    </div>

    <!-- TAB 4: KI-Gesamtanalyse -->
    <div v-if="activeTab === 'analysis'">
      <PropertyAnalysis
        :property-id="property.id"
        :analyses="property.analyses || []"
        @refresh="refresh"
      />
    </div>

    <!-- Edit Property Modal -->
    <div v-if="openEditModal" class="modal modal-open z-[1000]">
      <div class="modal-box max-w-xl bg-base-100 p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-base-200 pb-2">
          <h3 class="font-bold text-base">Grundstück bearbeiten</h3>
          <button class="btn btn-ghost btn-sm btn-circle" @click="openEditModal = false">
            <Icon name="lucide:x" class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="saveEdit" class="space-y-3 text-xs">
          <div>
            <label class="label label-text text-xs py-0.5">Titel</label>
            <input v-model="editForm.title" type="text" class="input input-sm input-bordered w-full" required />
          </div>

          <div>
            <label class="label label-text text-xs py-0.5">Adresse</label>
            <input v-model="editForm.address" type="text" class="input input-sm input-bordered w-full" />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label label-text text-xs py-0.5">Kaufpreis (€)</label>
              <input v-model.number="editForm.askingPrice" type="number" class="input input-sm input-bordered w-full font-mono" />
            </div>
            <div>
              <label class="label label-text text-xs py-0.5">Fläche (m²)</label>
              <input v-model.number="editForm.areaSqm" type="number" class="input input-sm input-bordered w-full font-mono" />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="label label-text text-xs py-0.5">Baurecht</label>
              <input v-model="editForm.buildingLaw" type="text" class="input input-sm input-bordered w-full" placeholder="z. B. B-Plan" />
            </div>
            <div>
              <label class="label label-text text-xs py-0.5">GRZ</label>
              <input v-model.number="editForm.grz" type="number" step="0.01" class="input input-sm input-bordered w-full" />
            </div>
            <div>
              <label class="label label-text text-xs py-0.5">GFZ</label>
              <input v-model.number="editForm.gfz" type="number" step="0.01" class="input input-sm input-bordered w-full" />
            </div>
          </div>

          <div>
            <label class="label label-text text-xs py-0.5">Erschließungsstatus</label>
            <input v-model="editForm.developmentStatus" type="text" class="input input-sm input-bordered w-full" placeholder="voll erschlossen" />
          </div>

          <div>
            <label class="label label-text text-xs py-0.5">Notizen</label>
            <textarea v-model="editForm.notes" rows="3" class="textarea textarea-sm textarea-bordered w-full"></textarea>
          </div>

          <div>
            <label class="label label-text text-xs py-0.5">Titelbild-URL (optional)</label>
            <input v-model="editForm.primaryImageUrl" type="url" class="input input-sm input-bordered w-full" placeholder="https://..." />
          </div>

          <div class="modal-action border-t border-base-200 pt-3">
            <button type="button" class="btn btn-sm btn-ghost" @click="openEditModal = false">Abbrechen</button>
            <button type="submit" class="btn btn-sm btn-primary" :disabled="savingEdit">Speichern</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit Parcel & Cadastre Modal -->
    <div v-if="openParcelModal" class="modal modal-open z-[1000]">
      <div class="modal-box max-w-xl bg-base-100 p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-base-200 pb-2">
          <div class="flex items-center gap-2">
            <Icon name="lucide:landmark" class="w-5 h-5 text-primary" />
            <h3 class="font-bold text-base">Katasterdaten & Flurstück bearbeiten</h3>
          </div>
          <button class="btn btn-ghost btn-sm btn-circle" @click="openParcelModal = false">
            <Icon name="lucide:x" class="w-4 h-4" />
          </button>
        </div>

        <!-- Mode Selector: Schnellsuche oder Manuell -->
        <div class="grid grid-cols-2 gap-1 p-1 bg-base-200 rounded-xl text-xs font-semibold">
          <button 
            type="button" 
            class="py-1.5 rounded-lg transition-all cursor-pointer" 
            :class="parcelMode === 'search' ? 'bg-base-100 text-primary shadow-xs' : 'text-base-content/60 hover:text-base-content'"
            @click="parcelMode = 'search'"
          >
            LGB Kataster-Suche
          </button>
          <button 
            type="button" 
            class="py-1.5 rounded-lg transition-all cursor-pointer" 
            :class="parcelMode === 'manual' ? 'bg-base-100 text-primary shadow-xs' : 'text-base-content/60 hover:text-base-content'"
            @click="parcelMode = 'manual'"
          >
            Manuelle Eingabe & Korrektur
          </button>
        </div>

        <!-- 1. Search Mode -->
        <div v-if="parcelMode === 'search'" class="space-y-3">
          <p class="text-xs text-base-content/70">
            Suche nach einer Adresse, Gemarkung oder Flurstücksnummer im amtlichen Liegenschaftskataster Brandenburg (ALKIS).
          </p>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <Icon name="lucide:search" class="w-4 h-4 absolute left-3 top-2.5 text-base-content/40" />
              <input 
                v-model="parcelSearchQuery" 
                type="text" 
                placeholder="z. B. Altenau 733 oder Schauener Straße 5, Storkow" 
                class="input input-bordered pl-9 w-full input-sm text-xs"
                @keyup.enter="searchParcels"
              />
            </div>
            <button 
              type="button"
              class="btn btn-sm btn-primary shrink-0 gap-1" 
              :disabled="loadingParcelSearch || !parcelSearchQuery.trim()" 
              @click="searchParcels"
            >
              <span v-if="loadingParcelSearch" class="loading loading-spinner loading-xs"></span>
              <Icon v-else name="lucide:search" class="w-3.5 h-3.5" />
              <span>Suchen</span>
            </button>
          </div>

          <div v-if="parcelSearchResults.length > 0" class="max-h-52 overflow-y-auto space-y-2 border border-base-200 rounded-lg p-2 bg-base-200/30">
            <div 
              v-for="res in parcelSearchResults" 
              :key="res.id || res.properties?.idflurst || Math.random()"
              class="p-2.5 bg-base-100 rounded-lg border border-base-300 hover:border-primary cursor-pointer transition-all flex items-center justify-between group"
              @click="selectParcelSearchResult(res)"
            >
              <div class="text-xs space-y-0.5 min-w-0 pr-2">
                <div class="font-semibold text-primary truncate">
                  {{ res.title || res.text || res.name || res.properties?.lagebeztxt || 'Flurstück' }}
                </div>
                <div class="text-base-content/60 font-mono text-xs truncate">
                  {{ res.subtitle || res.properties?.flstkennz || res.category || '' }}
                  <span v-if="res.properties?.flaeche">({{ res.properties.flaeche }} m²)</span>
                </div>
              </div>
              <button type="button" class="btn btn-sm btn-primary shrink-0">Übernehmen</button>
            </div>
          </div>

          <div v-else-if="parcelSearchSearched" class="text-center py-4 text-xs text-base-content/50 border border-dashed border-base-300 rounded-lg">
            Keine Treffer im Liegenschaftskataster Brandenburg gefunden. Wechsle auf "Manuelle Eingabe", um Kennzeichen und Flur direkt einzutragen.
          </div>
        </div>

        <!-- 2. Manual Form Mode -->
        <form @submit.prevent="saveParcel" class="space-y-3 text-xs">
          <div class="bg-base-200/40 p-3.5 rounded-xl border border-base-200 space-y-3">
            <div>
              <label class="label label-text text-xs py-0.5 font-semibold">Flurstückskennzeichen (ALKIS 20-stellig)</label>
              <input 
                v-model="parcelForm.flstkennz" 
                type="text" 
                class="input input-sm input-bordered w-full font-mono" 
                placeholder="z. B. 12050100600546______" 
              />
              <span class="text-[10px] text-base-content/50 block mt-0.5">
                Das amtliche 20-stellige Kennzeichen (ermöglicht Abruf von Flurstücksumriss & BORIS).
              </span>
            </div>

            <div>
              <label class="label label-text text-xs py-0.5 font-semibold">Gemarkung</label>
              <input 
                v-model="parcelForm.gemarkungName" 
                type="text" 
                class="input input-sm input-bordered w-full" 
                placeholder="z. B. Kummersdorf oder Storkow" 
              />
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="label label-text text-xs py-0.5 font-semibold">Flur</label>
                <input 
                  v-model.number="parcelForm.flur" 
                  type="number" 
                  class="input input-sm input-bordered w-full font-mono" 
                  placeholder="1" 
                />
              </div>
              <div>
                <label class="label label-text text-xs py-0.5 font-semibold">Zähler</label>
                <input 
                  v-model.number="parcelForm.zaehler" 
                  type="number" 
                  class="input input-sm input-bordered w-full font-mono" 
                  placeholder="5" 
                />
              </div>
              <div>
                <label class="label label-text text-xs py-0.5 font-semibold">Nenner</label>
                <input 
                  v-model.number="parcelForm.nenner" 
                  type="number" 
                  class="input input-sm input-bordered w-full font-mono" 
                  placeholder="optional" 
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="label label-text text-xs py-0.5 font-semibold">Amtliche Fläche (m²)</label>
                <input 
                  v-model.number="parcelForm.officialArea" 
                  type="number" 
                  class="input input-sm input-bordered w-full font-mono" 
                  placeholder="z. B. 700" 
                />
              </div>
              <div>
                <label class="label label-text text-xs py-0.5 font-semibold">BORIS Bodenrichtwert (€/m²)</label>
                <input 
                  v-model.number="parcelForm.borisBodenrichtwert" 
                  type="number" 
                  class="input input-sm input-bordered w-full font-mono text-success font-bold" 
                  placeholder="z. B. 180" 
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="label label-text text-xs py-0.5 font-semibold">BORIS Entwicklungszustand</label>
                <input 
                  v-model="parcelForm.borisEntwicklungszustand" 
                  type="text" 
                  class="input input-sm input-bordered w-full" 
                  placeholder="Baureifes Land" 
                />
              </div>
              <div>
                <label class="label label-text text-xs py-0.5 font-semibold">BORIS Nutzung</label>
                <input 
                  v-model="parcelForm.borisNutzung" 
                  type="text" 
                  class="input input-sm input-bordered w-full" 
                  placeholder="Wohnbaufläche" 
                />
              </div>
            </div>
          </div>

          <div class="modal-action border-t border-base-200 pt-3 flex items-center justify-between">
            <button 
              v-if="property.parcel" 
              type="button" 
              class="btn btn-sm btn-ghost text-error" 
              :disabled="savingParcel"
              @click="removeParcelLink"
            >
              Verknüpfung lösen
            </button>
            <div v-else></div>

            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-sm btn-ghost" @click="openParcelModal = false">Abbrechen</button>
              <button type="submit" class="btn btn-sm btn-primary" :disabled="savingParcel">
                <span v-if="savingParcel" class="loading loading-spinner loading-xs"></span>
                <span>Katasterdaten speichern</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Lightbox Modal -->
    <div v-if="openLightbox" class="modal modal-open z-[1000] bg-black/90 backdrop-blur-xs" @click="openLightbox = false">
      <div class="relative max-w-5xl w-full mx-4 flex flex-col items-center" @click.stop>
        <button 
          type="button"
          class="btn btn-sm btn-circle btn-ghost absolute -top-12 right-0 text-white hover:bg-white/20"
          @click="openLightbox = false"
        >
          <Icon name="lucide:x" class="w-6 h-6" />
        </button>
        
        <div class="relative w-full flex items-center justify-center min-h-[300px]">
          <img 
            :src="parsedImages[activeImageIndex]" 
            :alt="property.title"
            class="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl select-none" 
          />
          <button 
            v-if="parsedImages.length > 1"
            type="button"
            class="btn btn-circle btn-neutral absolute left-2 bg-black/60 border-none text-white hover:bg-black/90"
            @click="prevImage"
          >
            <Icon name="lucide:chevron-left" class="w-5 h-5" />
          </button>
          <button 
            v-if="parsedImages.length > 1"
            type="button"
            class="btn btn-circle btn-neutral absolute right-2 bg-black/60 border-none text-white hover:bg-black/90"
            @click="nextImage"
          >
            <Icon name="lucide:chevron-right" class="w-5 h-5" />
          </button>
        </div>

        <div class="mt-4 flex items-center justify-between w-full text-white/80 text-xs px-2">
          <span class="font-medium truncate max-w-md">{{ property.title }}</span>
          <span class="font-mono">{{ activeImageIndex + 1 }} von {{ parsedImages.length }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted, onMounted, nextTick } from 'vue'
import { useToast } from '~/composables/useToast'

const toast = useToast()
const route = useRoute()
const propertyId = route.params.id as string

const { data: property, pending, refresh } = await useFetch<any>(`/api/properties/${propertyId}`)

// Sprungziele aus der ⌘K-Suche: /properties/x?tab=docs&doc=…&page=3
const VALID_TABS = ['geo', 'broker', 'docs', 'analysis'] as const
type TabId = typeof VALID_TABS[number]

const queryTab = route.query.tab as string | undefined
const activeTab = ref<TabId>(
  VALID_TABS.includes(queryTab as TabId) ? (queryTab as TabId) : 'geo'
)

// Aus der Suche angesprungenes Dokument bzw. Thread - wird hervorgehoben.
const highlightDocId = ref<string | null>((route.query.doc as string) || null)
const highlightPage = ref<number | null>(route.query.page ? Number(route.query.page) : null)
const highlightThreadId = ref<string | null>((route.query.thread as string) || null)

onMounted(() => {
  if (!highlightDocId.value && !highlightThreadId.value) return
  // Nach dem Rendern zum Ziel scrollen.
  nextTick(() => {
    const selector = highlightDocId.value ? `[data-doc="${highlightDocId.value}"]` : `[data-thread="${highlightThreadId.value}"]`
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
})
const syncingGeo = ref(false)
const syncingUrl = ref(false)
const openEditModal = ref(false)
const savingEdit = ref(false)

const openParcelModal = ref(false)
const parcelMode = ref<'search' | 'manual'>('manual')
const parcelSearchQuery = ref('')
const loadingParcelSearch = ref(false)
const parcelSearchSearched = ref(false)
const parcelSearchResults = ref<any[]>([])
const savingParcel = ref(false)

const parcelForm = reactive({
  flstkennz: '',
  gemarkungName: '',
  gemarkungSchluessel: '',
  flur: null as number | null,
  zaehler: null as number | null,
  nenner: null as number | null,
  officialArea: null as number | null,
  borisBodenrichtwert: null as number | null,
  borisStichtag: '',
  borisEntwicklungszustand: 'Baureifes Land',
  borisNutzung: 'Wohnbaufläche',
  geojsonGeometry: null as any,
  priceHistoryJson: null as any
})

const activeImageIndex = ref(0)
const openLightbox = ref(false)

const parsedImages = computed<string[]>(() => {
  if (!property.value) return []
  let list: string[] = []
  if (property.value.imagesJson) {
    try {
      const parsed = typeof property.value.imagesJson === 'string' 
        ? JSON.parse(property.value.imagesJson) 
        : property.value.imagesJson
      if (Array.isArray(parsed)) list = parsed
    } catch {}
  }
  if (list.length === 0 && property.value.primaryImageUrl) {
    list = [property.value.primaryImageUrl]
  }
  return list.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
})

const currentImage = computed(() => {
  return parsedImages.value[activeImageIndex.value] || property.value?.primaryImageUrl || null
})

function nextImage() {
  if (parsedImages.value.length === 0) return
  activeImageIndex.value = (activeImageIndex.value + 1) % parsedImages.value.length
}

function prevImage() {
  if (parsedImages.value.length === 0) return
  activeImageIndex.value = (activeImageIndex.value - 1 + parsedImages.value.length) % parsedImages.value.length
}

function selectImage(idx: number) {
  activeImageIndex.value = idx
}

async function syncFromUrl() {
  syncingUrl.value = true
  try {
    const res = await $fetch<any>(`/api/properties/${propertyId}/sync-url`, { method: 'POST' })
    await refresh()
    activeImageIndex.value = 0
    const via = res.method === 'flaresolverr' ? 'FlareSolverr' : 'Direktabruf'
    if (res.warning) {
      toast.warning(`Abruf via ${via}, aber unvollständig: ${res.warning}`)
    } else {
      toast.success(`Inserat-Daten & Bilder aktualisiert (via ${via})!`)
    }
  } catch (err: any) {
    toast.error('Fehler beim Aktualisieren: ' + (err.data?.message || err.data?.statusMessage || err.message))
  } finally {
    syncingUrl.value = false
  }
}

const selectedDocType = ref<string | null>(null)
const uploading = ref(false)
const reanalyzingId = ref<string | null>(null)
const changingTypeId = ref<string | null>(null)
const docDragOver = ref(false)

const latestAnalysis = computed(() => property.value?.analyses?.[0] || null)

// Zustand der Inseratsprüfung
// Baurecht direkt in der Karte bearbeiten - wie bei der Makler-Karte.
// Vorher waren die Werte nur über das Stift-Symbol ganz oben erreichbar,
// obwohl die Nachbarkarte (ALKIS) einen eigenen "Ändern"-Knopf hat.
const editingBuildingLaw = ref(false)
const savingBuildingLaw = ref(false)
const buildingLawForm = reactive({
  buildingLaw: '',
  grz: null as number | null,
  gfz: null as number | null,
  developmentStatus: ''
})

function toggleBuildingLawEdit() {
  if (editingBuildingLaw.value) {
    saveBuildingLaw()
    return
  }
  buildingLawForm.buildingLaw = property.value?.buildingLaw || ''
  buildingLawForm.grz = property.value?.grz ?? null
  buildingLawForm.gfz = property.value?.gfz ?? null
  buildingLawForm.developmentStatus = property.value?.developmentStatus || ''
  editingBuildingLaw.value = true
}

async function saveBuildingLaw() {
  savingBuildingLaw.value = true
  try {
    await $fetch(`/api/properties/${propertyId}`, {
      method: 'PUT',
      body: {
        buildingLaw: buildingLawForm.buildingLaw.trim() || null,
        grz: buildingLawForm.grz,
        gfz: buildingLawForm.gfz,
        developmentStatus: buildingLawForm.developmentStatus || null
      }
    })
    editingBuildingLaw.value = false
    await refresh()
    toast.success('Baurecht gespeichert.')
  } catch (err: any) {
    toast.error('Fehler beim Speichern: ' + (err.data?.statusMessage || err.message))
  } finally {
    savingBuildingLaw.value = false
  }
}

const listing = computed<any>(() => property.value?.listingStatus || null)
const resolvingAlert = ref(false)

// Eine Meldung erscheint nur, solange sie nicht bestätigt wurde.
const showPriceAlert = computed(() => {
  const l = listing.value
  if (!l?.pendingPrice) return false
  return !l.alertAckAt || (l.pendingPriceSeenAt && l.pendingPriceSeenAt > l.alertAckAt)
})

const showGoneAlert = computed(() => {
  const l = listing.value
  if (l?.state !== 'offline') return false
  return !l.alertAckAt
})

async function resolveAlert(action: 'accept' | 'dismiss') {
  resolvingAlert.value = true
  try {
    const res = await $fetch<any>(`/api/properties/${propertyId}/price-alert`, {
      method: 'POST',
      body: { action }
    })
    await refresh()
    toast.success(action === 'accept'
      ? `Preis auf ${res.askingPrice?.toLocaleString('de-DE')} € aktualisiert.`
      : 'Meldung zur Kenntnis genommen.')
  } catch (err: any) {
    toast.error('Fehler: ' + (err.data?.statusMessage || err.message))
  } finally {
    resolvingAlert.value = false
  }
}

// Solange Dokumente noch analysiert werden, in Ruhe nachladen, damit der Status
// von selbst auf "fertig" springt, ohne dass der Nutzer neu laden muss.
const pendingAnalysisCount = computed(() =>
  (property.value?.documents || []).filter(
    (doc: any) => doc.analysisStatus === 'pending' || doc.analysisStatus === 'running'
  ).length
)

let analysisPoller: ReturnType<typeof setInterval> | null = null

function stopAnalysisPolling() {
  if (analysisPoller) {
    clearInterval(analysisPoller)
    analysisPoller = null
  }
}

watch(pendingAnalysisCount, (count) => {
  if (count > 0 && !analysisPoller) {
    analysisPoller = setInterval(() => refresh(), 4000)
  } else if (count === 0) {
    stopAnalysisPolling()
  }
}, { immediate: true })

onUnmounted(stopAnalysisPolling)

const statuses = [
  { id: 'new', label: 'Neu entdeckt' },
  { id: 'contacted', label: 'Makler kontaktiert' },
  { id: 'docs_requested', label: 'Unterlagen angefordert' },
  { id: 'in_review', label: 'In Prüfung (B-Plan)' },
  { id: 'visiting', label: 'Besichtigung' },
  { id: 'offer_made', label: 'Angebot abgegeben' },
  { id: 'purchased', label: 'Gekauft / Notar' },
  { id: 'rejected', label: 'Archiviert' }
]

const missingChecklistCount = computed(() => {
  return (property.value?.checklistItems || []).filter((i: any) => i.status === 'missing' || i.status === 'requested').length
})

const editForm = reactive({
  title: property.value?.title || '',
  address: property.value?.address || '',
  askingPrice: property.value?.askingPrice || null,
  areaSqm: property.value?.areaSqm || null,
  buildingLaw: property.value?.buildingLaw || '',
  grz: property.value?.grz || null,
  gfz: property.value?.gfz || null,
  developmentStatus: property.value?.developmentStatus || '',
  notes: property.value?.notes || '',
  primaryImageUrl: property.value?.primaryImageUrl || ''
})

function startEdit() {
  if (property.value) {
    editForm.title = property.value.title || ''
    editForm.address = property.value.address || ''
    editForm.askingPrice = property.value.askingPrice || null
    editForm.areaSqm = property.value.areaSqm || null
    editForm.buildingLaw = property.value.buildingLaw || ''
    editForm.grz = property.value.grz || null
    editForm.gfz = property.value.gfz || null
    editForm.developmentStatus = property.value.developmentStatus || ''
    editForm.notes = property.value.notes || ''
    editForm.primaryImageUrl = property.value.primaryImageUrl || ''
  }
  openEditModal.value = true
}

function startEditParcel() {
  const p = property.value?.parcel
  parcelForm.flstkennz = p?.flstkennz || ''
  parcelForm.gemarkungName = p?.gemarkungName || ''
  parcelForm.gemarkungSchluessel = p?.gemarkungSchluessel || ''
  parcelForm.flur = p?.flur ?? null
  parcelForm.zaehler = p?.zaehler ?? null
  parcelForm.nenner = p?.nenner ?? null
  parcelForm.officialArea = p?.officialArea ?? null
  parcelForm.borisBodenrichtwert = p?.borisBodenrichtwert ?? null
  parcelForm.borisStichtag = p?.borisStichtag || ''
  parcelForm.borisEntwicklungszustand = p?.borisEntwicklungszustand || 'Baureifes Land'
  parcelForm.borisNutzung = p?.borisNutzung || 'Wohnbaufläche'
  parcelForm.geojsonGeometry = p?.geojsonGeometry || null
  parcelForm.priceHistoryJson = p?.priceHistoryJson || null

  parcelSearchQuery.value = property.value?.address || property.value?.title || ''
  parcelSearchResults.value = []
  parcelSearchSearched.value = false
  parcelMode.value = p?.flstkennz ? 'manual' : 'search'
  openParcelModal.value = true
}

async function searchParcels() {
  const q = parcelSearchQuery.value.trim()
  if (!q) return
  loadingParcelSearch.value = true
  parcelSearchSearched.value = true
  parcelSearchResults.value = []

  try {
    const res = await $fetch<any>('/api/geobasis/search', {
      query: { query: q, limit: 8 }
    })
    parcelSearchResults.value = res?.features || res?.results || res || []
  } catch (err: any) {
    console.warn('Geobasis search failed:', err)
  } finally {
    loadingParcelSearch.value = false
  }
}

async function selectParcelSearchResult(res: any) {
  const p = res.properties || res
  const kennz = p.flstkennz || res.id || ''
  if (kennz) {
    parcelForm.flstkennz = kennz
  }
  if (p.flaeche) {
    parcelForm.officialArea = Number(p.flaeche)
  }
  if (p.gemarkung || p.gemarkung_name) {
    parcelForm.gemarkungName = p.gemarkung || p.gemarkung_name
  }
  if (p.flur) {
    parcelForm.flur = Number(p.flur)
  }
  if (p.flstnrzae || p.zaehler) {
    parcelForm.zaehler = Number(p.flstnrzae || p.zaehler)
  }
  if (p.flstnrnen || p.nenner) {
    parcelForm.nenner = Number(p.flstnrnen || p.nenner)
  }

  // Fetch price / BORIS info & geometry if available
  if (kennz) {
    try {
      const priceRes = await $fetch<any>(`/api/geobasis/flurstueck/${encodeURIComponent(kennz)}/preise`)
      if (priceRes?.currentPrice?.bodenrichtwert) {
        parcelForm.borisBodenrichtwert = priceRes.currentPrice.bodenrichtwert
      }
      if (priceRes?.history) {
        parcelForm.priceHistoryJson = priceRes.history
      }
    } catch {}
    try {
      const details = await $fetch<any>(`/api/geobasis/flurstueck/${encodeURIComponent(kennz)}`)
      if (details?.geometry) {
        parcelForm.geojsonGeometry = details.geometry
      }
    } catch {}
  }

  parcelMode.value = 'manual'
}

async function saveParcel() {
  savingParcel.value = true
  try {
    await $fetch(`/api/properties/${propertyId}`, {
      method: 'PUT',
      body: {
        parcel: parcelForm
      }
    })
    openParcelModal.value = false
    await refresh()
    toast.success('Katasterdaten erfolgreich aktualisiert!')
  } catch (err: any) {
    toast.error('Fehler beim Speichern: ' + (err.data?.statusMessage || err.message))
  } finally {
    savingParcel.value = false
  }
}

async function removeParcelLink() {
  if (!confirm('Möchtest du die Verknüpfung zu diesem Flurstück wirklich entfernen?')) return
  savingParcel.value = true
  try {
    await $fetch(`/api/properties/${propertyId}`, {
      method: 'PUT',
      body: { parcel: null }
    })
    openParcelModal.value = false
    await refresh()
    toast.info('Flurstücksverknüpfung wurde entfernt.')
  } catch (err: any) {
    toast.error('Fehler: ' + err.message)
  } finally {
    savingParcel.value = false
  }
}

async function updateStatus(newStatus: string) {
  try {
    await $fetch(`/api/properties/${propertyId}`, {
      method: 'PUT',
      body: { status: newStatus }
    })
    await refresh()
    toast.success(`Status auf "${getStatusLabel(newStatus)}" geändert`)
  } catch (err: any) {
    toast.error('Fehler beim Statuswechsel: ' + err.message)
  }
}

async function syncWithGeobasis() {
  syncingGeo.value = true
  try {
    const res = await $fetch<any>(`/api/properties/${propertyId}/sync-geobasis`, {
      method: 'POST'
    })
    await refresh()
    toast.success(`Geobasis Sync erfolgreich! Flurstück: ${res.flstkennz || 'OK'}, BORIS: ${res.borisBodenrichtwert || '-'} €/m²`)
  } catch (err: any) {
    toast.error('Geobasis Sync fehlgeschlagen: ' + (err.data?.statusMessage || err.message))
  } finally {
    syncingGeo.value = false
  }
}

async function saveEdit() {
  savingEdit.value = true
  try {
    await $fetch(`/api/properties/${propertyId}`, {
      method: 'PUT',
      body: editForm
    })
    openEditModal.value = false
    await refresh()
    toast.success('Grundstück erfolgreich gespeichert!')
  } catch (err: any) {
    toast.error('Fehler beim Speichern: ' + err.message)
  } finally {
    savingEdit.value = false
  }
}

async function deleteProperty() {
  if (!confirm(`Möchtest du das Grundstück "${property.value?.title}" wirklich unwiderruflich löschen?`)) return
  try {
    await $fetch(`/api/properties/${propertyId}`, { method: 'DELETE' })
    toast.info('Grundstück wurde gelöscht')
    navigateTo('/')
  } catch (err: any) {
    toast.error('Fehler beim Löschen: ' + err.message)
  }
}

function onPickDocuments(event: Event) {
  const input = event.target as HTMLInputElement
  uploadDocuments(Array.from(input.files || []))
  input.value = ''
}

function onDropDocuments(event: DragEvent) {
  docDragOver.value = false
  uploadDocuments(Array.from(event.dataTransfer?.files || []))
}

async function uploadDocuments(files: File[]) {
  const pdfs = files.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
  if (pdfs.length === 0) {
    toast.warning('Bitte lege eine oder mehrere PDF-Dateien ab.')
    return
  }
  if (pdfs.length < files.length) {
    toast.warning(`${files.length - pdfs.length} Datei(en) übersprungen - nur PDFs werden analysiert.`)
  }

  uploading.value = true
  const formData = new FormData()
  for (const file of pdfs) formData.append('file', file)
  if (selectedDocType.value) formData.append('docType', selectedDocType.value)

  try {
    const result = await $fetch<any>(`/api/properties/${propertyId}/documents/upload`, {
      method: 'POST',
      body: formData
    })
    await refresh()

    if (result.duplicates?.length) {
      toast.warning(`Bereits vorhanden und nicht erneut abgelegt: ${result.duplicates.join(', ')}`)
    }
    if (result.uploaded > 0) {
      toast.success(`${result.uploaded} Dokument(e) abgelegt - die Analyse läuft im Hintergrund.`)
    }
  } catch (err: any) {
    toast.error('Fehler beim Upload: ' + (err.data?.statusMessage || err.message))
  } finally {
    uploading.value = false
  }
}

async function changeDocType(docId: string, docType: string) {
  changingTypeId.value = docId
  try {
    const result = await $fetch<any>(`/api/properties/${propertyId}/documents/${docId}`, {
      method: 'PUT',
      body: { docType }
    })
    await refresh()
    toast.success(result.reanalyzed
      ? 'Kategorie geändert - Analyse läuft mit dem passenden Prompt neu.'
      : 'Kategorie geändert.')
  } catch (err: any) {
    toast.error('Fehler: ' + (err.data?.statusMessage || err.message))
  } finally {
    changingTypeId.value = null
  }
}

function analysisStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: 'Analyse wartet',
    running: 'Analyse läuft',
    done: 'Analysiert',
    error: 'Analyse fehlgeschlagen',
    skipped: 'Nicht analysiert'
  }
  return map[status] || status
}

function analysisBadgeClass(status: string) {
  if (status === 'done') return 'badge-success'
  if (status === 'error') return 'badge-error'
  if (status === 'skipped') return 'badge-ghost'
  return 'badge-ghost'
}

function analysisBadgeIcon(status: string) {
  if (status === 'done') return 'lucide:check-circle-2'
  if (status === 'error') return 'lucide:alert-triangle'
  return 'lucide:minus-circle'
}

function formatShortDate(ms: number) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

async function reanalyzeDoc(docId: string) {
  reanalyzingId.value = docId
  try {
    await $fetch(`/api/properties/${propertyId}/documents/${docId}/analyze`, { method: 'POST' })
    await refresh()
    toast.success('KI-Analyse erfolgreich abgeschlossen!')
  } catch (err: any) {
    toast.error('Fehler bei der Analyse: ' + err.message)
  } finally {
    reanalyzingId.value = null
  }
}

async function applyDocData(docId: string) {
  try {
    await $fetch(`/api/properties/${propertyId}/documents/${docId}/apply`, { method: 'POST' })
    await refresh()
    toast.success('Erkannte Daten wurden in das Grundstück übernommen!')
  } catch (err: any) {
    toast.error('Fehler: ' + err.message)
  }
}

async function deleteDoc(docId: string) {
  if (!confirm('Dokument wirklich löschen?')) return
  try {
    await $fetch(`/api/properties/${propertyId}/documents/${docId}`, { method: 'DELETE' })
    await refresh()
    toast.info('Dokument wurde gelöscht.')
  } catch (err: any) {
    toast.error('Fehler beim Löschen: ' + err.message)
  }
}

function getParsedJson(jsonStr: string | null) {
  if (!jsonStr) return null
  try {
    return typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
  } catch {
    return null
  }
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    new: 'Neu',
    contacted: 'Makler kontaktiert',
    docs_requested: 'Unterlagen angefordert',
    in_review: 'In Prüfung',
    visiting: 'Besichtigung',
    offer_made: 'Angebot abgegeben',
    purchased: 'Gekauft',
    rejected: 'Archiviert'
  }
  return map[status] || status
}

function getStatusBadgeClass(status: string) {
  const map: Record<string, string> = {
    new: 'badge-ghost',
    contacted: 'badge-ghost',
    docs_requested: 'badge-ghost',
    in_review: 'badge-primary badge-outline',
    visiting: 'badge-primary',
    offer_made: 'badge-warning',
    purchased: 'badge-success',
    rejected: 'badge-ghost opacity-60'
  }
  return map[status] || 'badge-ghost'
}

function formatBorisDiff(pricePerSqm: number, boris: number) {
  if (!boris) return ''
  const diff = Math.round(((pricePerSqm - boris) / boris) * 100)
  return diff > 0 ? `+${diff}% vs BORIS` : `${diff}% vs BORIS`
}

function getBorisDiffClass(pricePerSqm: number, boris: number) {
  if (!boris) return 'badge-ghost'
  const diff = ((pricePerSqm - boris) / boris) * 100
  if (diff <= 0) return 'badge-success text-success-content'
  if (diff <= 25) return 'badge-warning text-warning-content'
  return 'badge-error text-error-content'
}

function formatDate(ms: number) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}
</script>
