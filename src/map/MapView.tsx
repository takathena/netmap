<<<<<<< HEAD
import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
=======
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

<<<<<<< HEAD
// Fix default marker icon in prod builds (Q-4)
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })
import {
  BACKUP_ERROR_KEY,
  BACKUP_LEGACY_KEY,
  BACKUP_SKIPPED_KEY,
  backupRaw,
  getStore,
  loadClusterPref,
  loadLayers,
  loadView,
  loadStyle,
  newId,
  saveClusterPref,
  saveLayers,
  saveView,
  saveStyle,
  type StoredFeature,
} from './storage'
import {
  createLabelIcon,
  fromFeature,
  kindOfLayer,
  layerBounds,
  toFeature,
  type LayerMeta,
} from './layers'

const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY as string | undefined

// Validate Stadia key at load time
if (!STADIA_KEY || STADIA_KEY === 'your_stadia_api_key_here') {
  console.warn('[netmap] VITE_STADIA_API_KEY tidak ada atau belum diatur di .env. Tile mungkin terbatas.')
}

=======
const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY as string | undefined

>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
// Hanya Indonesia (+sedikit sekitar): tile di luar ini tidak pernah diunduh.
// Tapi peta TIDAK dikunci — bebas scroll/zoom/geser (tanpa maxBounds/minZoom lock).
const INDONESIA_BOUNDS = L.latLngBounds([-12, 92], [8, 142])

// Min zoom dinamis: zoom terendah di mana seluruh Indonesia muat di layar
// (dengan padding) — supaya Indonesia terlihat penuh, tidak terpotong,
// dan zoom out tidak sampai menampilkan seluruh dunia.
// (Panning tetap bebas: tidak ada maxBounds lock.)
function computeMinZoom(width: number, height: number): number {
  const d = Math.PI / 180
  const northY = Math.log(Math.tan(Math.PI / 4 + (INDONESIA_BOUNDS.getNorth() * d) / 2))
  const southY = Math.log(Math.tan(Math.PI / 4 + (INDONESIA_BOUNDS.getSouth() * d) / 2))
  const widthFraction = (INDONESIA_BOUNDS.getEast() - INDONESIA_BOUNDS.getWest()) / 360
  const heightFraction = (northY - southY) / (2 * Math.PI)
  const pad = 20
  const availW = Math.max(1, width - pad * 2)
  const availH = Math.max(1, height - pad * 2)
  let best = 1
  for (let zoom = 1; zoom <= 19; zoom++) {
    const worldPx = 256 * Math.pow(2, zoom)
    if (widthFraction * worldPx <= availW && heightFraction * worldPx <= availH) {
      best = zoom
    } else {
      break
    }
  }
  return Math.max(1, best)
}

// Hanya 2 style Stadia sesuai permintaan.
const STYLES = {
  satellite: {
    label: 'Satelit',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.png',
  },
  bright: {
    label: 'Bright',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_bright/{z}/{x}/{y}.png',
  },
} as const

type StyleKey = keyof typeof STYLES

const ATTRIBUTION =
  '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap contributors'

<<<<<<< HEAD
// ---------------------------------------------------------------- tipe

// Batas tipe ke plugin: hanya antarmuka kecil yang kita pakai.
interface ClusterGroup extends L.FeatureGroup {
  addLayers(layers: L.Layer[]): this
}
interface PmMap {
  addControls(options: Record<string, unknown>): void
  disableDraw(): void
}
// Payload event Geoman (dibaca lewat cast; sengaja tidak extends LeafletEvent
// agar tidak bentrok dengan properti `layer` bawaan tipe Leaflet).
interface PmEvent {
  layer?: L.Layer
  originalLayer?: L.Layer
}
interface MapApi {
  setCluster(on: boolean): void
  addLabel(latlng: [number, number], text: string): void
  updateLabel(id: string, text: string): void
  cancelDraw(): void
}
interface LabelEditor {
  id?: string
  latlng: [number, number]
  text: string
}

// Event layer Geoman/Leaflet yang menandakan data layer berubah.
// (pm:edit dkk. adalah event LAYER — tidak andal bila didengarkan dari map.)
const LAYER_CHANGE_EVENTS =
  'pm:edit pm:update pm:dragend pm:markerdragend pm:vertexadded pm:vertexremoved pm:rotateend dragend'

const SAVE_DEBOUNCE_MS = 400

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const swapRef = useRef<((key: StyleKey) => void) | null>(null)
  const apiRef = useRef<MapApi | null>(null)
  const placingRef = useRef(false)

  const [activeStyle, setActiveStyle] = useState<StyleKey>('satellite')
  const [clusterEnabled, setClusterEnabled] = useState<boolean>(() =>
    loadClusterPref(getStore(), true),
  )
  const clusterEnabledRef = useRef(clusterEnabled)
  const [placing, setPlacing] = useState(false)
  const [editor, setEditor] = useState<LabelEditor | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeRef = useRef<string | null>(null)

  const setPlacingMode = useCallback((on: boolean) => {
    placingRef.current = on
    setPlacing(on)
    containerRef.current?.classList.toggle('netmap-placing', on)
    if (on) apiRef.current?.cancelDraw()
  }, [])
=======
function debounce(fn: (...args: any[]) => void, ms: number) {
  let t: number | undefined
  return (...args: any[]) => {
    if (t) window.clearTimeout(t)
    t = window.setTimeout(() => fn(...args), ms)
  }
}

const LAYERS_KEY = 'netmap-p1-layers'
const VIEW_KEY = 'netmap-p1-view'

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const swapRef = useRef<((key: StyleKey) => void) | null>(null)
  const clusterRef = useRef<any>(null)
  const [activeStyle, setActiveStyle] = useState<StyleKey>('satellite')
  const initialCluster = (() => {
    try {
      const v = localStorage.getItem('netmap-p1-cluster')
      if (v === '0') return false
      if (v === '1') return true
    } catch {}
    return true
  })()
  const [clusterEnabled, setClusterEnabled] = useState(initialCluster)
  const plainRef = useRef<L.LayerGroup | null>(null)
  const toggleRef = useRef<(() => void) | null>(null)
  const clusterEnabledRef = useRef(initialCluster)
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

<<<<<<< HEAD
    const store = getStore()

=======
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const minZoom = computeMinZoom(w, h)

    // Bebas scroll/zoom: tidak ada maxBounds lock. Hanya tile Indonesia yang
    // dirender (tile bounds). minZoom dinamis supaya Indonesia terlihat penuh
    // dan zoom out tidak sampai menampilkan seluruh dunia.
    const map = L.map(container, {
      center: [1.5, 110],
      zoom: minZoom,
      minZoom,
      maxZoom: 19,
      zoomControl: true,
      preferCanvas: true,
      attributionControl: true,
      worldCopyJump: false,
    })
<<<<<<< HEAD
=======
    mapRef.current = map
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4

    // Tampilan awal: fit Indonesia (sekali, bukan lock)
    map.fitBounds(INDONESIA_BOUNDS, { padding: [20, 20], maxZoom: 6 })

<<<<<<< HEAD
    let tileLayer: L.TileLayer | null = null
    function swap(key: StyleKey) {
      if (tileLayer) {
        tileLayer.off('tileerror')
        map.removeLayer(tileLayer)
      }
      const s = STYLES[key]
      const url = STADIA_KEY ? `${s.url}?api_key=${STADIA_KEY}` : s.url
      tileLayer = L.tileLayer(url, {
=======
    function swap(key: StyleKey) {
      const m = mapRef.current
      if (!m) return
      if (tileRef.current) m.removeLayer(tileRef.current)
      const s = STYLES[key]
      const url = STADIA_KEY ? `${s.url}?api_key=${STADIA_KEY}` : s.url
      const layer = L.tileLayer(url, {
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
        maxZoom: 19,
        noWrap: true,
        bounds: INDONESIA_BOUNDS,
        attribution: ATTRIBUTION,
      })
<<<<<<< HEAD
      tileLayer.on('tileerror', (e: L.TileErrorEvent) => {
        console.error('[netmap] tile load error:', e)
        const status = e.error && typeof e.error === 'object' && 'status' in e.error ? (e.error as { status?: number }).status : undefined
        noticeRef.current = `Gagal memuat tile peta (${status ?? 'unknown'}). Cek koneksi atau API key.`
        setNotice(noticeRef.current)
      })
      tileLayer.addTo(map)
      setActiveStyle(key)
      saveStyle(store, key)
    }
    swapRef.current = swap
    const savedStyle = loadStyle(store, 'satellite') as StyleKey
    swap(savedStyle)

    // Cluster group (ringan, chunked loading) + group biasa saat cluster OFF.
    const cluster = (
      L as unknown as { markerClusterGroup(options: object): ClusterGroup }
    ).markerClusterGroup({
=======
      layer.addTo(m)
      tileRef.current = layer
      setActiveStyle(key)
    }
    swapRef.current = swap
    swap('satellite')

    // Cluster group (ringan, chunked loading)
    const cluster = (L as any).markerClusterGroup({
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
      chunkedLoading: true,
      maxClusterRadius: 40,
    })
    map.addLayer(cluster)
<<<<<<< HEAD
    const plain = L.layerGroup().addTo(map)

    // Geoman: toolbar bawaan plugin. Sesuai PHASE1.md hanya titik, garis,
    // poligon, persegi, lingkaran, edit, drag, cut, hapus. Teks diganti tombol
    // "Label" buatan sendiri (satu representasi teks, lihat layers.ts);
    // circle marker & rotate tidak ada di scope Fase 1.
    const pm = (map as unknown as { pm: PmMap }).pm
=======
    clusterRef.current = cluster

    // Layer biasa untuk marker saat cluster dimatikan
    const plain = L.layerGroup().addTo(map)
    plainRef.current = plain

    // Geoman: toolbar mengambang bawaan plugin
    const pm = (map as any).pm
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
    pm.addControls({
      position: 'topleft',
      drawMarker: true,
      drawPolyline: true,
      drawPolygon: true,
      drawRectangle: true,
      drawCircle: true,
<<<<<<< HEAD
      drawCircleMarker: false,
      drawText: false,
=======
      drawText: true,
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
      editMode: true,
      dragMode: true,
      cutPolygon: true,
      removalMode: true,
<<<<<<< HEAD
      rotateMode: false,
    })

    // ------------------------------------------------------------------
    // REGISTRY — satu-satunya sumber data yang disimpan.
    // Hanya layer milik pengguna yang terdaftar di sini. Ikon cluster, titik
    // pegangan edit Geoman, garis bantu, dll TIDAK pernah ikut tersimpan
    // karena kita tidak lagi memindai map.eachLayer().
    // ------------------------------------------------------------------
    const entries = new Map<L.Layer, LayerMeta>()
    const byId = new Map<string, L.Layer>()

    let dirty = false
    let timer: number | undefined

    function persist() {
      const features: StoredFeature[] = []
      entries.forEach((meta, layer) => {
        const f = toFeature(layer, meta)
        if (f) features.push(f)
      })
      const res = saveLayers(store, features)
      if (res.ok) {
        dirty = false
      } else {
        setNotice(
          `Perubahan peta GAGAL disimpan: ${res.message}. Jangan refresh dulu — penyimpanan browser mungkin penuh.`,
        )
      }
    }

    function markDirty() {
      dirty = true
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = undefined
        persist()
      }, SAVE_DEBOUNCE_MS)
    }

    // Tulis segera bila ada perubahan tertunda (tab ditutup/refresh/unmount).
    function flush() {
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
      if (dirty) persist()
    }

    // Marker masuk ke cluster (bulk -> chunkedLoading benar-benar bekerja) atau plain.
    function attachMarkers(markers: L.Marker[]) {
      if (markers.length === 0) return
      if (clusterEnabledRef.current) cluster.addLayers(markers)
      else markers.forEach((m) => plain.addLayer(m))
    }

    // markercluster mengindeks marker berdasarkan posisi saat ditambahkan.
    // Setelah marker digeser, indeks itu basi -> keluarkan & masukkan ulang.
    // Ditunda 1 tick agar tidak mengubah marker di tengah handler dragend.
    function reindexMarker(m: L.Marker) {
      if (!clusterEnabledRef.current) return
      window.setTimeout(() => {
        if (!entries.has(m)) return
        cluster.removeLayer(m)
        cluster.addLayer(m)
      }, 0)
    }

    function onLayerChanged(e: L.LeafletEvent) {
      const layer = e.target as L.Layer
      const meta = entries.get(layer)
      if (!meta) return
      if (layer instanceof L.Marker) {
        const ll = layer.getLatLng()
        if (!meta.pos || meta.pos[0] !== ll.lat || meta.pos[1] !== ll.lng) {
          meta.pos = [ll.lat, ll.lng]
          reindexMarker(layer)
        }
      }
      markDirty()
    }

    function onLayerRemoved(e: L.LeafletEvent) {
      forget(e.target as L.Layer)
    }

    function onLabelDblClick(e: L.LeafletEvent) {
      const layer = e.target as L.Layer
      const meta = entries.get(layer)
      if (!meta || !(layer instanceof L.Marker)) return
      const ll = layer.getLatLng()
      placingRef.current = false
      setPlacing(false)
      container?.classList.remove('netmap-placing')
      setEditor({ id: meta.id, latlng: [ll.lat, ll.lng], text: meta.text ?? '' })
    }

    function register(layer: L.Layer, meta: LayerMeta) {
      if (entries.has(layer)) return
      if (layer instanceof L.Marker) {
        const ll = layer.getLatLng()
        meta.pos = [ll.lat, ll.lng]
      }
      entries.set(layer, meta)
      byId.set(meta.id, layer)
      layer.on(LAYER_CHANGE_EVENTS, onLayerChanged)
      layer.on('pm:remove', onLayerRemoved)
      if (meta.kind === 'label') layer.on('dblclick', onLabelDblClick)
    }

    // Hapus dari registry. Untuk marker, WAJIB juga dikeluarkan dari cluster/plain:
    // Geoman hanya melepas marker dari peta, sedangkan cluster/plain masih
    // menyimpannya (akibatnya marker "hidup kembali" & tetap tersimpan).
    function forget(layer: L.Layer) {
      const meta = entries.get(layer)
      if (!meta) return
      entries.delete(layer)
      byId.delete(meta.id)
      layer.off(LAYER_CHANGE_EVENTS, onLayerChanged)
      layer.off('pm:remove', onLayerRemoved)
      layer.off('dblclick', onLabelDblClick)
      if (layer instanceof L.Marker) {
        cluster.removeLayer(layer)
        plain.removeLayer(layer)
      }
      markDirty()
    }

    function forgetDeep(layer: L.Layer) {
      if (layer instanceof L.LayerGroup) layer.eachLayer(forgetDeep)
      else forget(layer)
    }

    function registerVectorDeep(layer: L.Layer, reuseId?: string) {
      if (layer instanceof L.LayerGroup) {
        layer.eachLayer((l: L.Layer) => registerVectorDeep(l))
        return
      }
      const kind = kindOfLayer(layer)
      if (!kind || kind === 'marker') return
      register(layer, { id: reuseId ?? newId(), kind })
    }

    // ------------------------------------------------------------ Geoman
    map.on('pm:create', (e: L.LeafletEvent) => {
      const layer = (e as unknown as PmEvent).layer
      if (!layer) return
      const kind = kindOfLayer(layer)
      if (!kind) return
      register(layer, { id: newId(), kind })
      if (layer instanceof L.Marker) {
        // Marker hasil gambar: pindahkan dari peta ke cluster/plain sesuai toggle.
        map.removeLayer(layer)
        attachMarkers([layer])
      }
      markDirty()
    })

    map.on('pm:remove', (e: L.LeafletEvent) => {
      const layer = (e as unknown as PmEvent).layer
      if (layer) forgetDeep(layer)
    })

    map.on('pm:cut', (e: L.LeafletEvent) => {
      const ev = e as unknown as PmEvent
      // Hasil cut bisa objek baru atau layer asal yang diubah: pertahankan ID bila sama.
      const keepId = ev.originalLayer ? entries.get(ev.originalLayer)?.id : undefined
      if (ev.originalLayer) forgetDeep(ev.originalLayer)
      if (ev.layer) registerVectorDeep(ev.layer, ev.layer === ev.originalLayer ? keepId : undefined)
      markDirty()
    })

    // ------------------------------------------------------------- Label
    function addLabel(latlng: [number, number], text: string) {
      const marker = L.marker(L.latLng(latlng[0], latlng[1]), { icon: createLabelIcon(text) })
      register(marker, { id: newId(), kind: 'label', text })
      attachMarkers([marker])
      markDirty()
    }

    function updateLabel(id: string, text: string) {
      const layer = byId.get(id)
      const meta = layer ? entries.get(layer) : undefined
      if (!layer || !meta || !(layer instanceof L.Marker)) return
      meta.text = text
      layer.setIcon(createLabelIcon(text))
      markDirty()
    }

    // Klik peta saat mode "Label" aktif -> buka editor teks.
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!placingRef.current) return
      placingRef.current = false
      setPlacing(false)
      container.classList.remove('netmap-placing')
      setEditor({ latlng: [e.latlng.lat, e.latlng.lng], text: '' })
    })

    // ----------------------------------------------------- Toggle cluster
    // Dibangun dari registry (bukan dari isi group), jadi marker yang sudah
    // dihapus tidak ikut "dihidupkan lagi". Bulk clear + addLayers.
    function setCluster(next: boolean) {
      clusterEnabledRef.current = next
      setClusterEnabled(next)
      saveClusterPref(store, next)
      const markers: L.Marker[] = []
      entries.forEach((_meta, layer) => {
        if (layer instanceof L.Marker) markers.push(layer)
      })
      cluster.clearLayers()
      plain.clearLayers()
      attachMarkers(markers)
    }

    apiRef.current = {
      setCluster,
      addLabel,
      updateLabel,
      cancelDraw: () => pm.disableDraw(),
    }

    // ------------------------------------------------------------ Restore
    let restoredBounds: L.LatLngBounds | null = null
    const loaded = loadLayers(store)

    if (loaded.status === 'error') {
      const saved = loaded.raw ? backupRaw(store, BACKUP_ERROR_KEY, loaded.raw) : false
      noticeRef.current = `Data peta tersimpan gagal dibaca (${loaded.message}).` +
        (saved ? ` Salinan aman di localStorage "${BACKUP_ERROR_KEY}".` : ' Salinan tidak bisa dibuat.')
    } else if (loaded.status === 'ok' || loaded.status === 'legacy') {
      if (loaded.status === 'legacy') backupRaw(store, BACKUP_LEGACY_KEY, loaded.raw)

      let skipped = loaded.dropped
      const markers: L.Marker[] = []
      for (const f of loaded.features) {
        try {
          const made = fromFeature(f)
          if (!made) {
            skipped++
            continue
          }
          register(made.layer, made.meta)
          if (made.layer instanceof L.Marker) markers.push(made.layer)
          else map.addLayer(made.layer)
          const b = layerBounds(made.layer)
          if (b) {
            restoredBounds = restoredBounds
              ? restoredBounds.extend(b)
              : L.latLngBounds(b.getSouthWest(), b.getNorthEast())
          }
        } catch (err) {
          console.error('[netmap] gagal memulihkan satu objek:', err, f)
          skipped++
        }
      }
      attachMarkers(markers)

      if (skipped > 0) {
        backupRaw(store, BACKUP_SKIPPED_KEY, loaded.raw)
        noticeRef.current = `${skipped} objek tidak bisa dipulihkan dan dilewati. Data asli disalin ke localStorage "${BACKUP_SKIPPED_KEY}".`
      }
    }

    const view = loadView(store)
    if (restoredBounds) {
      map.fitBounds(restoredBounds, { padding: [40, 40], maxZoom: 16 })
    } else if (view) {
      map.setView([view.lat, view.lng], view.zoom)
    }

    // Geser/zoom hanya mengubah VIEW (ringan) — tidak lagi menserialisasi data.
    const saveCurrentView = () => {
      const c = map.getCenter()
      saveView(store, { lat: c.lat, lng: c.lng, zoom: map.getZoom() })
    }
    map.on('moveend', saveCurrentView)
    map.on('zoomend', saveCurrentView)

    // Resize -> hitung ulang minZoom (fit Indonesia)
    map.on('resize', () => {
      const minZ = computeMinZoom(container.clientWidth || w, container.clientHeight || h)
=======
    })

    // Wiring minimal: marker hasil gambar geoman masuk cluster/plain sesuai toggle
    map.on('pm:create', (e: any) => {
      const layer = e.layer
      if (layer instanceof L.Marker) {
        map.removeLayer(layer)
        if (clusterEnabledRef.current) cluster.addLayer(layer)
        else plain.addLayer(layer)
      }
      saveState()
    })

    // Toggle cluster on/off
    toggleRef.current = () => {
      const next = !clusterEnabledRef.current
      clusterEnabledRef.current = next
      setClusterEnabled(next)
      try { localStorage.setItem('netmap-p1-cluster', next ? '1' : '0') } catch {}
      const from = next ? plain : cluster
      const to = next ? cluster : plain
      from.getLayers().forEach((l: any) => {
        from.removeLayer(l)
        to.addLayer(l)
      })
    }

    // Simpan state (layers + view) ke localStorage
    function collectLayers() {
      const set = new Set<any>()
      try {
        ;(map as any).pm.getGeomanLayers().forEach((l: any) => set.add(l))
      } catch {}
      try {
        cluster.getLayers().forEach((l: any) => set.add(l))
      } catch {}
      map.eachLayer((l: any) => {
        if (
          l instanceof L.Marker ||
          l instanceof L.Polyline ||
          l instanceof L.Polygon ||
          l instanceof L.Circle ||
          l instanceof L.Rectangle
        ) {
          set.add(l)
        }
      })
      return [...set]
    }

    const saveState = debounce(() => {
      try {
        const features = collectLayers()
          .map((l: any) => {
            if (typeof l.toGeoJSON !== 'function') return null
            const f = l.toGeoJSON()
            // Preserve text for both geoman text markers and DivIcon string labels
            f.properties = f.properties || {}
            if (l instanceof L.Marker) {
              if ((l.options as any).textMarker) {
                // Geoman text marker: preserve original properties
                f.properties.textMarker = true
                if ((l.options as any).text != null) f.properties.text = (l.options as any).text
                if ((l.options as any).textMarkerCentered) f.properties.textMarkerCentered = true
                if ((l.options as any).textOptions) f.properties.textOptions = (l.options as any).textOptions
              } else if ((l.options as any).netmapText) {
                // DivIcon string label (Option B): store text in properties
                f.properties.text = (l.options as any).netmapText
              } else if (l.options && l.options.text != null) {
                // Generic text option (fallback)
                f.properties.text = l.options.text
              }
            }
            return f
          })
          .filter(Boolean)
        localStorage.setItem(LAYERS_KEY, JSON.stringify(features))
      } catch {}
      try {
        const c = map.getCenter()
        localStorage.setItem(
          VIEW_KEY,
          JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }),
        )
      } catch {}
    }, 400)

    map.on('moveend', saveState)
    map.on('zoomend', saveState)
    map.on('pm:remove', saveState)
    map.on('pm:edit', saveState)
    map.on('pm:drag', saveState)
    map.on('pm:cut', saveState)

    // Restore layers + view dari localStorage
    let restoredBounds: L.LatLngBounds | null = null
    try {
      const raw = localStorage.getItem(LAYERS_KEY)
      if (raw) {
        const features = JSON.parse(raw)
        if (Array.isArray(features) && features.length) {
          features.forEach((f: any) => {
            try {
              const g = L.geoJSON(f, {
                pointToLayer: (feature: any, latlng: any) => {
                  const p = (feature && feature.properties) || {}
                  const text = p.text || p.label
                  if (text) {
                    const icon = L.divIcon({
                      className: 'netmap-text-marker',
                      html: `<span class="netmap-text-label">${String(text).replace(/</g, '&lt;')}</span>`,
                      iconSize: [0, 0],
                      iconAnchor: [0, 0],
                    })
                    return L.marker(latlng, { icon, netmapText: text } as any)
                  }
                  if (p.textMarker) {
                    return L.marker(latlng, {
                      textMarker: true,
                      text: p.text || '',
                      textMarkerCentered: !!p.textMarkerCentered,
                      textOptions: p.textOptions,
                    } as any)
                  }
                  return L.marker(latlng)
                },
                onEachFeature: (_feat, layer) => {
                  try { (layer as any).pm?.enable?.() } catch {}
                },
              })
              const ls = g.getLayers()
              ls.forEach((layer: any) => {
                try {
                  const isText = !!(layer && layer.options && ((layer as any).options.netmapText || layer.options.textMarker))
                  if (layer instanceof L.Marker) {
                    if (isText) {
                      // Text/label → DivIcon string: tampil & bisa di-cluster.
                      // reInitLayer (pm) dipanggil agar layer bisa di-remove
                      // (removalMode). Icon DivIcon string tidak diubah.
                      try { (L as any).PM.reInitLayer(layer) } catch {}
                      if (clusterEnabledRef.current) cluster.addLayer(layer)
                      else plain.addLayer(layer)
                    } else {
                      if (clusterEnabledRef.current) cluster.addLayer(layer)
                      else plain.addLayer(layer)
                    }
                  } else {
                    map.addLayer(layer)
                  }
                  try {
                    const b = (layer.getBounds ? layer.getBounds() : null)
                    if (b && b.isValid()) {
                      if (!restoredBounds) restoredBounds = b
                      else restoredBounds.extend(b)
                    }
                  } catch {}
                } catch {}
              })            } catch {}
          })
        }
      }
    } catch {}

    // Stray marker cleanup: marker yang menempel langsung di map (data lama)
    // dipindahkan ke group aktif agar ikut toggle.
    try {
      const stray: L.Marker[] = []
      map.eachLayer((l: any) => {
        if (l instanceof L.Marker) stray.push(l)
      })
      stray.forEach((m) => {
        try {
          map.removeLayer(m)
          if (clusterEnabledRef.current) cluster.addLayer(m)
          else plain.addLayer(m)
          if ((m as any).options && ((m as any).options.textMarker || (m as any).options.netmapText)) {
            try { (L as any).PM.reInitLayer(m) } catch {}
          }
        } catch {}
      })
    } catch {}

    try {
      const rawView = localStorage.getItem(VIEW_KEY)
      if (rawView) {
        const v = JSON.parse(rawView)
        if (restoredBounds) {
          map.fitBounds(restoredBounds, { padding: [40, 40], maxZoom: 16 })
        } else if (Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom)) {
          map.setView([v.lat, v.lng], v.zoom)
        }
      } else if (restoredBounds) {
        map.fitBounds(restoredBounds, { padding: [40, 40], maxZoom: 16 })
      }
    } catch {}

    // Resize -> hitung ulang minZoom (fit Indonesia)
    map.on('resize', () => {
      const minZ = computeMinZoom(
        container.clientWidth || w,
        container.clientHeight || h,
      )
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
      map.setMinZoom(minZ)
      if (map.getZoom() < minZ) map.setZoom(minZ)
    })

<<<<<<< HEAD
    // ---------------------------------------------------- Flush & keyboard
    const onPageHide = () => flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      placingRef.current = false
      setPlacing(false)
      container.classList.remove('netmap-placing')
      setEditor(null)
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
      flush()
      map.remove()
      swapRef.current = null
      apiRef.current = null
    }
  }, [])

  useEffect(() => {
    if (noticeRef.current) setNotice(noticeRef.current)
  }, [])

  const submitEditor = () => {
    if (!editor) return
    const text = editor.text.trim()
    if (!text) return
    if (editor.id) apiRef.current?.updateLabel(editor.id, text)
    else apiRef.current?.addLabel(editor.latlng, text)
    setEditor(null)
  }

  // UI dirender SEBAGAI SAUDARA container peta (bukan anak), supaya klik/drag/
  // scroll di tombol tidak tembus ke peta (mis. menambah titik polygon).
  return (
    <div className="map-root">
      <div ref={containerRef} className="map-canvas" />

=======
    return () => {
      map.remove()
      mapRef.current = null
      tileRef.current = null
      swapRef.current = null
      clusterRef.current = null
      plainRef.current = null
      toggleRef.current = null
    }
  }, [])

  return (
    <div ref={containerRef} className="map-container">
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
      <div className="style-switcher">
        <button
          type="button"
          className={`style-btn ${activeStyle === 'satellite' ? 'active' : ''}`}
          onClick={() => swapRef.current?.('satellite')}
        >
          Satelit
        </button>
        <button
          type="button"
          className={`style-btn ${activeStyle === 'bright' ? 'active' : ''}`}
          onClick={() => swapRef.current?.('bright')}
        >
          Bright
        </button>
      </div>

<<<<<<< HEAD
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Tutup
          </button>
        </div>
      )}

      {editor && (
        <div className="label-editor">
          <input
            className="label-input"
            autoFocus
            placeholder="Teks label"
            maxLength={120}
            value={editor.text}
            onChange={(e) => setEditor({ ...editor, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitEditor()
              else if (e.key === 'Escape') setEditor(null)
            }}
          />
          <button
            type="button"
            className="floating-btn active"
            disabled={!editor.text.trim()}
            onClick={submitEditor}
          >
            Simpan
          </button>
          <button type="button" className="floating-btn" onClick={() => setEditor(null)}>
            Batal
          </button>
        </div>
      )}

=======
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
      <div className="floating-bar">
        <button
          type="button"
          className={`floating-btn ${clusterEnabled ? 'active' : ''}`}
<<<<<<< HEAD
          onClick={() => apiRef.current?.setCluster(!clusterEnabled)}
=======
          onClick={() => toggleRef.current?.()}
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
          title="Aktifkan/nonaktifkan clustering marker"
        >
          Cluster: {clusterEnabled ? 'ON' : 'OFF'}
        </button>
<<<<<<< HEAD
        <button
          type="button"
          className={`floating-btn ${placing ? 'active' : ''}`}
          onClick={() => {
            setEditor(null)
            setPlacingMode(!placing)
          }}
          title="Tambah label teks: klik tombol ini lalu klik peta. Klik ganda label untuk mengubah teksnya."
        >
          Label
        </button>
        {placing && <span className="floating-hint">Klik peta untuk menaruh label (Esc batal)</span>}
      </div>
    </div>
  )
}
=======
      </div>
    </div>
  )
}
>>>>>>> ce9b9ff4ff9f2c43fadf6e13194517be5afddfb4
