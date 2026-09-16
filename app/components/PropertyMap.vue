<template>
  <div class="relative w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-base-300 bg-base-300 isolate z-0">
    <div ref="mapContainer" class="w-full h-full min-h-[300px] z-0"></div>

    <!-- Map layer switcher badge -->
    <div class="absolute top-2 right-2 z-10 flex gap-1 bg-base-100/90 backdrop-blur p-1 rounded-lg shadow-sm border border-base-300 text-xs">
      <button 
        type="button"
        class="px-2 py-1 rounded transition-colors"
        :class="activeLayer === 'osm' ? 'bg-primary text-primary-content font-medium' : 'hover:bg-base-200'"
        @click="switchLayer('osm')"
      >
        Karte (OSM)
      </button>
      <button 
        type="button"
        class="px-2 py-1 rounded transition-colors"
        :class="activeLayer === 'satellite' ? 'bg-primary text-primary-content font-medium' : 'hover:bg-base-200'"
        @click="switchLayer('satellite')"
      >
        Luftbild (Satellit)
      </button>
    </div>

    <!-- Missing coordinates warning badge -->
    <div 
      v-if="singleProperty && !singleProperty.latitude && !singleProperty.longitude && !geoJson && !singleProperty.parcel?.geojsonGeometry" 
      class="absolute bottom-3 left-3 z-10 bg-warning/90 backdrop-blur-xs text-warning-content text-xs px-3 py-2 rounded-xl shadow-lg flex items-center gap-2 font-medium border border-warning/30"
    >
      <Icon name="lucide:alert-triangle" class="w-4 h-4 shrink-0" />
      <span>Keine GPS-Koordinaten für diese Adresse gefunden (Übersichtsansicht)</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  properties?: any[]
  singleProperty?: any
  geoJson?: any
  zoom?: number
}>()

const emit = defineEmits<{
  (e: 'select', propertyId: string): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
let mapInstance: any = null
let tileLayerInstance: any = null
let geoJsonLayer: any = null
let markersGroup: any = null

const activeLayer = ref<'osm' | 'satellite'>('osm')

const tileLayers = {
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
}

const tileAttributions = {
  osm: '&copy; OpenStreetMap contributors',
  satellite: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
}

/**
 * Nimmt GeoJSON als Objekt ODER als JSON-String entgegen (die Geometrie kommt aus der
 * Datenbank als Text) und gibt nur zurück, was Leaflet auch verarbeiten kann.
 * Alles andere ergibt null, damit die Karte auf den Marker zurückfällt, statt zu werfen.
 */
function toGeoJson(value: any): any | null {
  if (!value) return null

  let parsed = value
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim()
    if (!trimmed) return null
    try {
      parsed = JSON.parse(trimmed)
    } catch (e) {
      console.warn('GeoJSON konnte nicht geparst werden:', e)
      return null
    }
  }

  if (typeof parsed !== 'object') return null

  // Leaflet akzeptiert Geometry, Feature, FeatureCollection und GeometryCollection.
  if (Array.isArray(parsed)) {
    const features = parsed.map(toGeoJson).filter(Boolean)
    return features.length ? { type: 'FeatureCollection', features } : null
  }

  if (typeof parsed.type !== 'string') {
    console.warn('GeoJSON ohne "type"-Feld wird übersprungen.')
    return null
  }

  return parsed
}

async function initMap() {
  if (!mapContainer.value || typeof window === 'undefined') return

  const L = (await import('leaflet')).default

  // Fix leaflet default marker icons in Vite/bundler
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })

  // Default center: Brandenburg / Potsdam
  let centerLat = 52.3903
  let centerLng = 13.0634
  let initialZoom = props.zoom || 13

  if (props.singleProperty?.latitude && props.singleProperty?.longitude) {
    centerLat = props.singleProperty.latitude
    centerLng = props.singleProperty.longitude
    initialZoom = 16
  }

  mapInstance = L.map(mapContainer.value).setView([centerLat, centerLng], initialZoom)

  tileLayerInstance = L.tileLayer(tileLayers[activeLayer.value], {
    attribution: tileAttributions[activeLayer.value],
    maxZoom: 19
  }).addTo(mapInstance)

  markersGroup = L.featureGroup().addTo(mapInstance)

  renderData(L)
}

function switchLayer(layer: 'osm' | 'satellite') {
  if (!mapInstance || activeLayer.value === layer) return
  activeLayer.value = layer
  if (tileLayerInstance) {
    mapInstance.removeLayer(tileLayerInstance)
  }
  import('leaflet').then(({ default: L }) => {
    tileLayerInstance = L.tileLayer(tileLayers[layer], {
      attribution: tileAttributions[layer],
      maxZoom: 19
    }).addTo(mapInstance)
  })
}

function renderData(L: any) {
  if (!mapInstance) return

  markersGroup.clearLayers()
  if (geoJsonLayer) {
    mapInstance.removeLayer(geoJsonLayer)
    geoJsonLayer = null
  }

  // 1. Single Property & GeoJSON Polygon
  if (props.singleProperty) {
    const p = props.singleProperty
    let hasGeometry = false

    // Die Geometrie kommt je nach Aufrufer als Objekt oder als JSON-String aus der DB.
    const parsedGeo = toGeoJson(props.geoJson) || toGeoJson(p.parcel?.geojsonGeometry)

    if (parsedGeo) {
      geoJsonLayer = L.geoJSON(parsedGeo, {
        style: {
          color: '#2563eb',
          weight: 3,
          fillColor: '#3b82f6',
          fillOpacity: 0.35
        },
        onEachFeature: (feature: any, layer: any) => {
          layer.bindPopup(`
            <div class="font-sans text-sm p-1">
              <strong class="font-semibold block text-primary">${p.title}</strong>
              <div class="text-xs text-base-content/80 mt-1">
                ${p.parcel?.flstkennz ? `Flurstück: <code>${p.parcel.flstkennz}</code><br/>` : ''}
                ${p.parcel?.officialArea ? `Amtliche Fläche: <strong>${p.parcel.officialArea} m²</strong><br/>` : ''}
                ${p.parcel?.borisBodenrichtwert ? `Bodenrichtwert: <strong>${p.parcel.borisBodenrichtwert} €/m²</strong>` : ''}
              </div>
            </div>
          `)
        }
      })

      // Ein Polygon ohne verwertbare Koordinaten darf die Karte nicht sprengen -
      // dann bleibt es beim Marker.
      const bounds = geoJsonLayer.getBounds()
      if (bounds.isValid()) {
        geoJsonLayer.addTo(mapInstance)
        hasGeometry = true
        mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
      } else {
        console.warn('GeoJSON enthält keine darstellbaren Koordinaten.')
        geoJsonLayer = null
      }
    }

    // Add marker if lat/lng available
    if (p.latitude && p.longitude) {
      const marker = L.marker([p.latitude, p.longitude])
        .bindPopup(`
          <div class="font-sans text-sm p-1">
            <strong>${p.title}</strong>
            <p class="text-xs mt-1 text-base-content/80">${p.address || ''}</p>
            ${p.askingPrice ? `<div class="mt-1 font-bold text-success">${p.askingPrice.toLocaleString('de-DE')} €</div>` : ''}
          </div>
        `)
      markersGroup.addLayer(marker)

      if (!hasGeometry) {
        mapInstance.setView([p.latitude, p.longitude], props.zoom || 16)
      }
    }
  }

  // 2. Multi Property Overview Mode
  if (props.properties && props.properties.length > 0) {
    const validProps = props.properties.filter(p => p.latitude && p.longitude)
    validProps.forEach(p => {
      const marker = L.marker([p.latitude, p.longitude])
        .bindPopup(`
          <div class="font-sans text-sm p-1">
            <strong class="block font-bold text-base text-primary">${p.title}</strong>
            <div class="text-xs text-base-content/80 mt-0.5">${p.address || 'Keine Adresse'}</div>
            <div class="mt-2 flex items-center justify-between gap-4">
              <span class="font-bold text-success">${p.askingPrice ? p.askingPrice.toLocaleString('de-DE') + ' €' : 'Preis auf Anfrage'}</span>
              <span class="badge badge-sm">${p.areaSqm ? p.areaSqm + ' m²' : '-'}</span>
            </div>
            <div class="mt-3">
              <a href="/properties/${p.id}" class="btn btn-xs btn-primary w-full">Dossier öffnen</a>
            </div>
          </div>
        `)
      markersGroup.addLayer(marker)
    })

    if (validProps.length > 0) {
      mapInstance.fitBounds(markersGroup.getBounds(), { padding: [40, 40], maxZoom: 15 })
    }
  }

  setTimeout(() => {
    mapInstance?.invalidateSize()
  }, 100)
}

watch(() => [props.properties, props.singleProperty, props.geoJson], () => {
  if (mapInstance) {
    import('leaflet').then(({ default: L }) => renderData(L))
  }
}, { deep: true })

onMounted(() => {
  initMap()
})

onUnmounted(() => {
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
})
</script>
