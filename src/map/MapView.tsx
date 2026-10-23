import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY as string | undefined

// 1 dunia penuh (Web Mercator): tidak ada duplikat, tidak bisa scroll keluar.
const WORLD_BOUNDS = L.latLngBounds([-85.05112878, -180], [85.05112878, 180])

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

// Min zoom dinamis: zoom terendah di mana 1 dunia mengisi layar
// (menghindari tepi abu-abu, tanpa duplikat).
function computeMinZoom(width: number, height: number): number {
  const widthFraction = 1.0
  const heightFraction = 1.0
  for (let zoom = 1; zoom <= 19; zoom += 1) {
    const worldPx = 256 * Math.pow(2, zoom)
    if (widthFraction * worldPx >= width && heightFraction * worldPx >= height) {
      return zoom
    }
  }
  return 19
}

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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const minZoom = computeMinZoom(w, h)

    const map = L.map(container, {
      center: [1.5, 110],
      zoom: Math.max(minZoom, 2),
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0,
      minZoom,
      maxZoom: 19,
      zoomControl: true,
      preferCanvas: true,
      attributionControl: true,
      worldCopyJump: false,
    })
    mapRef.current = map

    function swap(key: StyleKey) {
      const m = mapRef.current
      if (!m) return
      if (tileRef.current) m.removeLayer(tileRef.current)
      const s = STYLES[key]
      const url = STADIA_KEY ? `${s.url}?api_key=${STADIA_KEY}` : s.url
      const layer = L.tileLayer(url, {
        maxZoom: 19,
        noWrap: true,
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

    // Wiring minimal: marker hasil gambar geoman masuk cluster group
    map.on('pm:create', (e: any) => {
      const layer = e.layer
      if (layer instanceof L.Marker) {
        map.removeLayer(layer)
        cluster.addLayer(layer)
      }
      saveState()
    })

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
          .map((l: any) => (typeof l.toGeoJSON === 'function' ? l.toGeoJSON() : null))
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
          const geo = L.geoJSON(features, {
            onEachFeature: (_f, layer) => {
              try {
                ;(layer as any).pm?.enable?.()
              } catch {}
            },
          })
          geo.addTo(map)
          try {
            const b = geo.getBounds()
            if (b.isValid()) restoredBounds = b
          } catch {}
        }
      }
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

    // Resize -> hitung ulang minZoom (1 dunia)
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
    </div>
  )
}