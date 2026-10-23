import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY as string | undefined

// Bbox: Indonesia + tetangga terdekat. Tile di luar ini tidak pernah diunduh.
const BBOX = L.latLngBounds([-12, 89], [9, 151])

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

function computeMinZoom(width: number, height: number): number {
  const d = Math.PI / 180
  const northY = Math.log(Math.tan(Math.PI / 4 + (BBOX.getNorth() * d) / 2))
  const southY = Math.log(Math.tan(Math.PI / 4 + (BBOX.getSouth() * d) / 2))
  const widthFraction = (BBOX.getEast() - BBOX.getWest()) / 360
  const heightFraction = (northY - southY) / (2 * Math.PI)
  for (let zoom = 4; zoom <= 19; zoom += 1) {
    const worldPx = 256 * Math.pow(2, zoom)
    if (widthFraction * worldPx >= width && heightFraction * worldPx >= height) {
      return zoom
    }
  }
  return 19
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const swapRef = useRef<((key: StyleKey) => void) | null>(null)
  const [activeStyle, setActiveStyle] = useState<StyleKey>('satellite')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const minZoom = computeMinZoom(w, h)

    const map = L.map(container, {
      center: [1.5, 110],
      zoom: Math.max(minZoom, 6),
      maxBounds: BBOX,
      maxBoundsViscosity: 1.0,
      minZoom,
      maxZoom: 19,
      zoomControl: true,
      preferCanvas: true,
      attributionControl: true,
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
        bounds: BBOX,
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

    // Geoman: toolbar mengambang bawaan plugin (fitur gambar titik/garis/dll)
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
    })

    // Resize -> hitung ulang minZoom
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