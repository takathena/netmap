import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

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
  loadDeviceTemplates,
  saveDeviceTemplates,
  type StoredFeature,
  type DeviceTemplate,
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
  const [deviceTemplates, setDeviceTemplates] = useState<DeviceTemplate[]>([])
  const [showDeviceList, setShowDeviceList] = useState(false)
  const [showDeviceForm, setShowDeviceForm] = useState(false)
  const [addingDevice, setAddingDevice] = useState(false)
  const [pendingDevicePoint, setPendingDevicePoint] = useState<L.LatLng | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<DeviceTemplate | null>(null)
  const [showDeviceOwnerForm, setShowDeviceOwnerForm] = useState(false)
  const [selectedMarkerData, setSelectedMarkerData] = useState<any>(null)
  const [showDeviceSidebar, setShowDeviceSidebar] = useState(false)
  const addingDeviceRef = useRef(false)

  const setPlacingMode = useCallback((on: boolean) => {
    placingRef.current = on
    setPlacing(on)
    containerRef.current?.classList.toggle('netmap-placing', on)
    if (on) apiRef.current?.cancelDraw()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const store = getStore()
    setDeviceTemplates(loadDeviceTemplates(store))

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

    // Tampilan awal: fit Indonesia (sekali, bukan lock)
    map.fitBounds(INDONESIA_BOUNDS, { padding: [20, 20], maxZoom: 6 })

    let tileLayer: L.TileLayer | null = null
    function swap(key: StyleKey) {
      if (tileLayer) {
        tileLayer.off('tileerror')
        map.removeLayer(tileLayer)
      }
      const s = STYLES[key]
      const url = STADIA_KEY ? `${s.url}?api_key=${STADIA_KEY}` : s.url
      tileLayer = L.tileLayer(url, {
        maxZoom: 19,
        noWrap: true,
        bounds: INDONESIA_BOUNDS,
        attribution: ATTRIBUTION,
      })
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
      chunkedLoading: true,
      maxClusterRadius: 40,
    })
    map.addLayer(cluster)
    const plain = L.layerGroup().addTo(map)

    // Geoman: toolbar bawaan plugin. Sesuai PHASE1.md hanya titik, garis,
    // poligon, persegi, lingkaran, edit, drag, cut, hapus. Teks diganti tombol
    // "Label" buatan sendiri (satu representasi teks, lihat layers.ts);
    // circle marker & rotate tidak ada di scope Fase 1.
    const pm = (map as unknown as { pm: PmMap }).pm
    pm.addControls({
      position: 'topleft',
      drawMarker: true,
      drawPolyline: true,
      drawPolygon: true,
      drawRectangle: true,
      drawCircle: true,
      drawCircleMarker: false,
      drawText: false,
      editMode: true,
      dragMode: true,
      cutPolygon: true,
      removalMode: true,
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

    // Klik peta saat mode "Label" atau "Perangkat" aktif.
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (placingRef.current) {
        placingRef.current = false
        setPlacing(false)
        container.classList.remove('netmap-placing')
        setEditor({ latlng: [e.latlng.lat, e.latlng.lng], text: '' })
      } else if (addingDeviceRef.current) {
        addingDeviceRef.current = false
        setAddingDevice(false)
        setPendingDevicePoint(e.latlng)
      }
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
      map.setMinZoom(minZ)
      if (map.getZoom() < minZ) map.setZoom(minZ)
    })

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
    const onOpenDeviceSidebar = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setSelectedMarkerData(detail.feature.properties)
      setShowDeviceSidebar(true)
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    window.addEventListener('netmap:openDeviceSidebar', onOpenDeviceSidebar)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('netmap:openDeviceSidebar', onOpenDeviceSidebar)
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

      <div className="floating-bar">
        <button
          type="button"
          className={`floating-btn ${clusterEnabled ? 'active' : ''}`}
          onClick={() => apiRef.current?.setCluster(!clusterEnabled)}
          title="Aktifkan/nonaktifkan clustering marker"
        >
          Cluster: {clusterEnabled ? 'ON' : 'OFF'}
        </button>
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
        <button
          type="button"
          className="floating-btn"
          onClick={() => setShowDeviceList(!showDeviceList)}
          title="Tampilkan template perangkat"
        >
          Perangkat
        </button>
        <button
          type="button"
          className="floating-btn device-add-btn"
          onClick={() => {
            addingDeviceRef.current = true
            setAddingDevice(true)
          }}
          title="Klik tombol ini, lalu klik peta untuk menaruh perangkat baru"
        >
          +
        </button>
        {placing && <span className="floating-hint">Klik peta untuk menaruh label (Esc batal)</span>}
        {addingDevice && <span className="floating-hint">Klik peta untuk menaruh perangkat (Esc batal)</span>}
      </div>

      {showDeviceList && (
        <div className="device-list-popup">
          <div className="device-list-header">
            <h3>Template Perangkat</h3>
            <button type="button" onClick={() => setShowDeviceList(false)}>✕</button>
          </div>
          <div className="device-list-content">
            {deviceTemplates.length === 0 ? (
              <p>Belum ada template. Klik "Buat Template" untuk menambah.</p>
            ) : (
              deviceTemplates.map((t) => (
                <div key={t.id} className="device-item">
                  <strong>{t.name}</strong> <span className="device-tag">{t.tag}</span>
                  <br />
                  <small>{t.brand}</small>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            className="device-add-btn"
            onClick={() => {
              setShowDeviceForm(true)
              setShowDeviceList(false)
            }}
          >
            + Buat Template
          </button>
        </div>
      )}

      {showDeviceForm && (
        <div className="device-form-popup">
          <div className="device-form-header">
            <h3>Buat Template Perangkat</h3>
            <button type="button" onClick={() => setShowDeviceForm(false)}>✕</button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.target as HTMLFormElement
              const data = new FormData(form)
              const template: DeviceTemplate = {
                id: newId(),
                name: data.get('name') as string,
                tag: data.get('tag') as string,
                brand: data.get('brand') as string,
                specs: {},
              }
              const ports = data.get('ports') as string
              const pon = data.get('pon') as string
              const uplink = data.get('uplink') as string
              const series = data.get('series') as string
              if (ports) template.specs.ports = ports
              if (pon) template.specs.pon = pon
              if (uplink) template.specs.uplink = uplink
              if (series) template.specs.series = series

              const newTemplates = [...deviceTemplates, template]
              setDeviceTemplates(newTemplates)
              saveDeviceTemplates(getStore(), newTemplates)
              setShowDeviceForm(false)
              setShowDeviceList(true)
            }}
          >
            <label>
              Nama Perangkat:
              <input
                type="text"
                name="name"
                required
                placeholder="Misal: Huawei ONT"
              />
            </label>
            <label>
              Tag:
              <input
                type="text"
                name="tag"
                required
                placeholder="ONT / OLT / Router / Switch"
              />
            </label>
            <label>
              Brand:
              <input
                type="text"
                name="brand"
                required
                placeholder="Huawei / Mikrotik / ZTE"
              />
            </label>
            <label>
              Ports (opsional):
              <input
                type="text"
                name="ports"
                placeholder="4 / 8 / 16"
              />
            </label>
            <label>
              PON (opsional):
              <input type="text" name="pon" placeholder="4PON / 8PON" />
            </label>
            <label>
              Uplink (opsional):
              <input type="text" name="uplink" placeholder="4 / 2" />
            </label>
            <label>
              Series (opsional):
              <input type="text" name="series" placeholder="HG8245H / RB750" />
            </label>
            <div className="device-form-actions">
              <button type="submit" className="device-form-save">
                Simpan
              </button>
              <button type="button" onClick={() => setShowDeviceForm(false)}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingDevicePoint && (
        <div className="device-selector-popup">
          <div className="device-selector-header">
            <h3>Pilih Template Perangkat</h3>
            <button type="button" onClick={() => setPendingDevicePoint(null)}>✕</button>
          </div>
          <div className="device-selector-list">
            {deviceTemplates.length === 0 ? (
              <p>Belum ada template. Buat di menu "Perangkat" dulu.</p>
            ) : (
              deviceTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="device-selector-item"
                  onClick={() => {
                    setSelectedTemplate(t)
                    setShowDeviceOwnerForm(true)
                  }}
                >
                  <strong>{t.name}</strong>
                  <span className="device-selector-tag">{t.tag}</span>
                  <br />
                  <small>{t.brand}</small>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {showDeviceOwnerForm && selectedTemplate && pendingDevicePoint && (
        <div className="device-form-popup">
          <div className="device-form-header">
            <h3>Tambah Perangkat: {selectedTemplate.name}</h3>
            <button type="button" onClick={() => { setShowDeviceOwnerForm(false); setSelectedTemplate(null); }}>✕</button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.target as HTMLFormElement
              const data = new FormData(form)
              const owner = data.get('owner') as string
              const location = data.get('location') as string

              const store = getStore()
              const markerId = newId()
              const feature: StoredFeature = {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [pendingDevicePoint.lng, pendingDevicePoint.lat],
                },
                properties: {
                  id: markerId,
                  kind: 'marker',
                  templateId: selectedTemplate.id,
                  name: selectedTemplate.name,
                  tag: selectedTemplate.tag,
                  brand: selectedTemplate.brand,
                  specs: selectedTemplate.specs,
                  owner: owner,
                  location: location,
                  lat: pendingDevicePoint.lat,
                  lng: pendingDevicePoint.lng,
                },
              }
              const result = loadLayers(store)
              const features = result.status === 'ok' || result.status === 'legacy' ? result.features : []
              features.push(feature)
              saveLayers(store, features)

              setShowDeviceOwnerForm(false)
              setSelectedTemplate(null)
              setPendingDevicePoint(null)
              window.location.reload()
            }}
          >
            <label>
              Pemilik Perangkat:
              <input
                type="text"
                name="owner"
                required
                placeholder="Nama pemilik/instansi"
              />
            </label>
            <label>
              Lokasi:
              <input
                type="text"
                name="location"
                required
                placeholder="Contoh: Rumah Budi, Jl. Merdeka No. 123"
              />
            </label>
            <div className="device-form-actions">
              <button type="submit">Simpan</button>
              <button type="button" onClick={() => { setShowDeviceOwnerForm(false); setSelectedTemplate(null); }}>Batal</button>
            </div>
          </form>
        </div>
      )}

      {showDeviceSidebar && selectedMarkerData && (
        <div className="device-sidebar">
          <div className="device-sidebar-header">
            <h3>{selectedMarkerData.name || 'Perangkat'}</h3>
            <button type="button" onClick={() => { setShowDeviceSidebar(false); setSelectedMarkerData(null); }}>✕</button>
          </div>
          <div className="device-sidebar-content">
            <div className="device-info-group">
              <label>Pemilik:</label>
              <p>{selectedMarkerData.owner || '—'}</p>
            </div>
            <div className="device-info-group">
              <label>Lokasi:</label>
              <p>{selectedMarkerData.location || '—'}</p>
            </div>
            <div className="device-info-group">
              <label>Koordinat:</label>
              <p>{selectedMarkerData.lat?.toFixed(6) || '—'}, {selectedMarkerData.lng?.toFixed(6) || '—'}</p>
            </div>
            <div className="device-info-group">
              <label>Perangkat:</label>
              <p>{selectedMarkerData.name || '—'}</p>
            </div>
            <div className="device-info-group">
              <label>Tag:</label>
              <p>{selectedMarkerData.tag || '—'}</p>
            </div>
            <div className="device-info-group">
              <label>Brand:</label>
              <p>{selectedMarkerData.brand || '—'}</p>
            </div>
            {selectedMarkerData.specs && Object.keys(selectedMarkerData.specs).length > 0 && (
              <div className="device-info-group">
                <label>Spesifikasi:</label>
                {Object.entries(selectedMarkerData.specs).map(([k, v]) => (
                  <p key={k}><small>{k}: {String(v)}</small></p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
