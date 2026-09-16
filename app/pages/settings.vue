<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Dienste, Suche &amp; KI</h1>
      <p class="text-xs sm:text-sm text-base-content/70 mt-1">
        Überprüfe Suchindex, Verarbeitungs-Queue, den lokalen Geobasis-Dienst, FlareSolverr und Google Gemini.
      </p>
    </div>


    <!-- Suche & Job-Queue -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
          <div class="flex items-center gap-3">
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center"
              :class="searchReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'"
            >
              <Icon name="lucide:search" class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-bold text-base">Suche, Verarbeitung &amp; Inseratsprüfung</h3>
              <p class="text-xs text-base-content/60">
                Volltextsuche (<kbd class="kbd kbd-xs">⌘K</kbd>), Dokumentverarbeitung und der tägliche Inserats-Check um 7 Uhr
              </p>
            </div>
          </div>

          <button
            class="btn btn-sm btn-outline gap-1.5 self-end sm:self-center"
            :disabled="reindexing || !settings?.meilisearch?.online"
            @click="rebuildIndex"
          >
            <span v-if="reindexing" class="loading loading-spinner loading-xs"></span>
            <Icon v-else name="lucide:refresh-cw" class="w-4 h-4" />
            Index neu aufbauen
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <!-- Meilisearch -->
          <div class="p-3 rounded-xl border" :class="settings?.meilisearch?.online ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-semibold text-xs">Meilisearch (Suchindex)</span>
              <span class="badge badge-xs font-mono" :class="settings?.meilisearch?.online ? 'badge-success' : 'badge-warning'">
                {{ settings?.meilisearch?.online ? 'Online' : 'Offline' }}
              </span>
            </div>
            <p class="text-[11px] text-base-content/60 font-mono break-all">{{ settings?.meilisearch?.url }}</p>
            <p v-if="settings?.meilisearch?.version" class="text-[11px] text-base-content/60 mt-1">
              Version {{ settings.meilisearch.version }}
            </p>
            <p v-else class="text-[11px] text-warning mt-1">{{ settings?.meilisearch?.message }}</p>
          </div>

          <!-- Redis / Queue -->
          <div class="p-3 rounded-xl border" :class="settings?.redis?.online ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-semibold text-xs">Redis (Verarbeitungs-Queue)</span>
              <span class="badge badge-xs font-mono" :class="settings?.redis?.online ? 'badge-success' : 'badge-warning'">
                {{ settings?.redis?.online ? 'Online' : 'Offline' }}
              </span>
            </div>
            <p class="text-[11px] text-base-content/60 font-mono break-all">{{ settings?.redis?.url }}</p>
            <div v-if="settings?.redis?.counts" class="space-y-1.5 mt-1.5">
              <div>
                <span class="text-[11px] text-base-content/50 block mb-0.5">Dokumente</span>
                <div class="flex flex-wrap gap-1">
                  <span v-for="(n, key) in settings.redis.counts" :key="key" class="badge badge-xs badge-ghost font-mono">
                    {{ key }}: {{ n }}
                  </span>
                </div>
              </div>
              <div v-if="settings?.redis?.listingCounts">
                <span class="text-[11px] text-base-content/50 block mb-0.5">Inseratsprüfung</span>
                <div class="flex flex-wrap gap-1">
                  <span v-for="(n, key) in settings.redis.listingCounts" :key="key" class="badge badge-xs badge-ghost font-mono">
                    {{ key }}: {{ n }}
                  </span>
                </div>
              </div>
            </div>
            <p v-else class="text-[11px] text-warning mt-1">{{ settings?.redis?.message }}</p>
          </div>
        </div>

        <div v-if="!searchReady" class="alert alert-warning text-xs py-2.5">
          <Icon name="lucide:alert-triangle" class="w-4 h-4 shrink-0" />
          <div class="space-y-1.5">
            <span class="block">
              Ohne diese Dienste bleibt die ⌘K-Suche leer und hochgeladene Dokumente werden erst
              beim nächsten Serverstart verarbeitet. Starte sie mit:
            </span>
            <code class="block bg-base-300/50 rounded px-2 py-1 font-mono text-[11px]">docker compose up -d</code>
          </div>
        </div>

        <div v-if="reindexResult" class="alert alert-success text-xs py-2">
          <Icon name="lucide:check-circle-2" class="w-4 h-4 shrink-0" />
          <span>
            Index neu aufgebaut: {{ reindexResult.indexed }} Einträge
            <template v-if="reindexResult.byType">
              ({{ Object.entries(reindexResult.byType).map(([t, n]) => `${n} ${t}`).join(', ') }})
            </template>
          </span>
        </div>
      </div>
    </div>

    <!-- FlareSolverr Service Card (Cloudflare Bypass) -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center" :class="settings?.flaresolverr?.online ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'">
              <Icon name="lucide:shield-check" class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-bold text-base flex items-center gap-2">
                <span>FlareSolverr (Cloudflare Bypass)</span>
                <span class="badge badge-sm font-mono" :class="settings?.flaresolverr?.online ? 'badge-success' : 'badge-warning'">
                  {{ settings?.flaresolverr?.online ? 'Online' : 'Offline / Nicht erreichbar' }}
                </span>
              </h3>
              <p class="text-xs text-base-content/60 font-mono">
                {{ settings?.flaresolverr?.url || 'http://127.0.0.1:8191/v1' }}
              </p>
            </div>
          </div>

          <button class="btn btn-sm btn-outline gap-1.5" :disabled="refreshing" @click="checkStatus">
            <span v-if="refreshing" class="loading loading-spinner loading-xs"></span>
            <Icon v-else name="lucide:refresh-cw" class="w-3.5 h-3.5" />
            <span>Neu prüfen</span>
          </button>
        </div>

        <div v-if="settings?.flaresolverr?.online" class="alert alert-success text-xs py-2.5">
          <Icon name="lucide:check-circle-2" class="w-4 h-4 shrink-0" />
          <span>FlareSolverr ist aktiv (Version: {{ settings.flaresolverr.version || 'v3' }}). Inserate von ImmoScout24, Immowelt und Kleinanzeigen können automatisiert ohne Cloudflare-Blockaden abgerufen werden.</span>
        </div>

        <div v-else class="space-y-3">
          <div class="alert alert-warning text-xs py-2.5">
            <Icon name="lucide:alert-triangle" class="w-4 h-4 shrink-0" />
            <span>FlareSolverr läuft aktuell nicht. Wenn Immobilienportale durch Cloudflare geschützt sind, schlägt der Direktabruf fehl.</span>
          </div>

          <div class="space-y-1.5">
            <div class="text-xs font-semibold text-base-content/80">
              Starte FlareSolverr einfach via Docker:
            </div>
            <div class="bg-base-300 p-3 rounded-xl font-mono text-xs text-base-content flex items-center justify-between overflow-x-auto gap-2">
              <code class="whitespace-nowrap">docker run -d --name=flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest</code>
              <button class="btn btn-xs btn-ghost shrink-0" @click="copyCommand('docker run -d --name=flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest')">
                <Icon name="lucide:copy" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Geobasis CLI Daemon Card -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-200 pb-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center" :class="settings?.geobasis?.online ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'">
              <Icon name="lucide:server" class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-bold text-base flex items-center gap-2">
                <span>geobasis-cli Daemon (LGB & BORIS)</span>
                <span class="badge badge-sm font-mono" :class="settings?.geobasis?.online ? 'badge-success' : 'badge-warning'">
                  {{ settings?.geobasis?.online ? 'Verbunden' : 'Nicht erreichbar' }}
                </span>
              </h3>
              <p class="text-xs text-base-content/60 font-mono">
                {{ settings?.geobasis?.url || 'http://127.0.0.1:8080' }}
              </p>
            </div>
          </div>

          <button class="btn btn-sm btn-outline gap-1.5" :disabled="refreshing" @click="checkStatus">
            <span v-if="refreshing" class="loading loading-spinner loading-xs"></span>
            <Icon v-else name="lucide:refresh-cw" class="w-3.5 h-3.5" />
            <span>Neu prüfen</span>
          </button>
        </div>

        <div v-if="settings?.geobasis?.online" class="alert alert-success text-xs py-2.5">
          <Icon name="lucide:check-circle-2" class="w-4 h-4 shrink-0" />
          <span>Der Geobasis REST-Server antwortet. Volltextsuche, Katasterdaten und BORIS-Preisentwicklung für Brandenburg sind voll einsatzbereit.</span>
        </div>

        <div v-else class="space-y-3">
          <div class="alert alert-warning text-xs py-2.5">
            <Icon name="lucide:alert-triangle" class="w-4 h-4 shrink-0" />
            <span>Der Geobasis-Server ist aktuell nicht auf Port 8080 erreichbar. Starte ihn im Terminal:</span>
          </div>

          <div class="bg-base-300 p-3 rounded-xl font-mono text-xs text-base-content flex items-center justify-between">
            <code>/Users/patrick/dev/projects/geobasis-cli/geobasis serve</code>
            <button class="btn btn-xs btn-ghost" @click="copyCommand('/Users/patrick/dev/projects/geobasis-cli/geobasis serve')">
              <Icon name="lucide:copy" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Gemini KI Card -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-5 space-y-4">
        <div class="flex items-center gap-3 border-b border-base-200 pb-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center" :class="settings?.gemini?.hasKey ? 'bg-primary/10 text-primary' : 'bg-neutral/10 text-base-content/60'">
            <Icon name="lucide:sparkles" class="w-5 h-5" />
          </div>
          <div>
            <h3 class="font-bold text-base flex items-center gap-2">
              <span>Google Gemini 2.5 (Multimodal)</span>
              <span class="badge badge-sm font-mono" :class="settings?.gemini?.hasKey ? 'badge-primary' : 'badge-neutral'">
                {{ settings?.gemini?.hasKey ? 'Aktiviert' : 'Demo / Simuliert' }}
              </span>
            </h3>
            <p class="text-xs text-base-content/60">
              Modell: <strong class="font-mono">{{ settings?.gemini?.model || 'gemini-2.5-flash' }}</strong>
            </p>
          </div>
        </div>

        <div v-if="settings?.gemini?.hasKey" class="text-xs space-y-1">
          <div class="flex items-center justify-between py-1 text-base-content/80">
            <span>Konfigurierter API Key:</span>
            <code class="bg-base-200 px-2 py-0.5 rounded font-mono">{{ settings.gemini.keyMasked }}</code>
          </div>
          <p class="text-success text-[11px] pt-1 flex items-center gap-1">
            <Icon name="lucide:check" class="w-3.5 h-3.5" />
            PDF-Extraktion, URL-Analyse und Dokumenten-Chat laufen live über die Gemini API.
          </p>
        </div>

        <div v-else class="space-y-3 text-xs">
          <p class="text-base-content/70">
            Aktuell ist noch kein <code>GEMINI_API_KEY</code> hinterlegt. Die URL- und Dokumenten-Analyse verwendet Heuristiken. Um die volle KI-Genauigkeit zu aktivieren:
          </p>
          <div class="bg-base-300 p-3 rounded-xl font-mono text-xs">
            <code>GEMINI_API_KEY=dein_api_key_hier</code>
          </div>
          <p class="text-base-content/60 text-[11px]">
            Trage deinen Key in die <code>.env</code> Datei ein und starte den Server neu.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const reindexing = ref(false)
const reindexResult = ref<any>(null)

const searchReady = computed(() =>
  !!(settings.value?.meilisearch?.online && settings.value?.redis?.online)
)

async function rebuildIndex() {
  reindexing.value = true
  reindexResult.value = null
  try {
    reindexResult.value = await $fetch('/api/search/reindex', { method: 'POST' })
  } catch (err: any) {
    alert(err.data?.message || err.data?.statusMessage || err.message)
  } finally {
    reindexing.value = false
  }
}

import { ref, computed } from 'vue'

const { data: settings, refresh } = await useFetch<any>('/api/settings')
const refreshing = ref(false)

async function checkStatus() {
  refreshing.value = true
  await refresh()
  refreshing.value = false
}

const toast = useToast()

function copyCommand(cmd: string) {
  navigator.clipboard.writeText(cmd)
  toast.success('Befehl in die Zwischenablage kopiert!')
}
</script>
