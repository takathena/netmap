import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY as string | undefined

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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

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
    mapRef.current = map

    // Tampilan awal: fit Indonesia (sekali, bukan lock)
    map.fitBounds(INDONESIA_BOUNDS, { padding: [20, 20], maxZoom: 6 })

    function swap(key: StyleKey) {
      const m = mapRef.current
      if (!m) return
      if (tileRef.current) m.removeLayer(tileRef.current)
      const s = STYLES[key]
      const url = STADIA_KEY ? `${s.url}?api_key=${STADIA_KEY}` : s.url
      const layer = L.tileLayer(url, {
        maxZoom: 19,
        noWrap: true,
        bounds: INDONESIA_BOUNDS,
        attribution: ATTRIBUTION,
      })
      layer.addTo(m)
      tileRef.current = layer
      setActiveStyle(key)
    }
    swapRef.current = swap
    swap('satellite')

    // Cluster group (ringan, chunked loading)
    const cluster = (L as any).markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 40,
    })
    map.addLayer(cluster)
    clusterRef.current = cluster

    // Layer biasa untuk marker saat cluster dimatikan
    const plain = L.layerGroup().addTo(map)
    plainRef.current = plain

    // Geoman: toolbar mengambang bawaan plugin
    const pm = (map as any).pm
    pm.addControls({
      position: 'topleft',
      drawMarker: true,
      drawPolyline: true,
      drawPolygon: true,
      drawRectangle: true,
      drawCircle: true,
      editMode: true,
      dragMode: true,
      cutPolygon: true,
      removalMode: true,
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
            // Preserve geoman text marker options (text content, centered, etc.)
            // so restored text doesn't degrade into a plain marker.
            if (l instanceof L.Marker && l.options && (l.options as any).textMarker) {
              f.properties = f.properties || {}
              f.properties.textMarker = true
              if ((l.options as any).text != null) f.properties.text = (l.options as any).text
              if ((l.options as any).textMarkerCentered) f.properties.textMarkerCentered = true
              if ((l.options as any).textOptions) f.properties.textOptions = (l.options as any).textOptions
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
                  const isText = !!(layer && layer.options && layer.options.textMarker)
                  if (layer instanceof L.Marker) {
                    if (isText) {
                      // Text marker: keep on map (not clustered) and re-init so
                      // the text renders instead of a plain marker.
                      map.addLayer(layer)
                      try { (L as any).PM.reInitLayer(layer) } catch {}
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
        if (l instanceof L.Marker && !(l.options && l.options.textMarker)) stray.push(l)
      })
      stray.forEach((m) => {
        try {
          map.removeLayer(m)
          if (clusterEnabledRef.current) cluster.addLayer(m)
          else plain.addLayer(m)
          if ((m as any).options && (m as any).options.textMarker) {
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
      map.setMinZoom(minZ)
      if (map.getZoom() < minZ) map.setZoom(minZ)
    })

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

      <div className="floating-bar">
        <button
          type="button"
          className={`floating-btn ${clusterEnabled ? 'active' : ''}`}
          onClick={() => toggleRef.current?.()}
          title="Aktifkan/nonaktifkan clustering marker"
        >
          Cluster: {clusterEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  )
}