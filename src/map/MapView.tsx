import { useEffect, useRef } from 'react'
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

    // Tile layer factory (Stadia, 2 style)
    function makeTile(style: StyleKey) {
      const s = STYLES[style]
      const url = STADIA_KEY ? `${s.url}?api_key=${STADIA_KEY}` : s.url
      return L.tileLayer(url, {
        maxZoom: 19,
        bounds: BBOX,
        attribution: ATTRIBUTION,
      })
    }

    let current: L.TileLayer = makeTile('satellite').addTo(map)
    let currentKey: StyleKey = 'satellite'

    // Switcher sederhana (2 tombol) — fixed di pojok kanan atas
    const switcher = L.control({ position: 'topright' })
    switcher.onAdd = () => {
      const div = L.DomUtil.create('div', 'stadia-switcher')
      div.style.cssText =
        'background:#0b1220cc;color:#e2e8f0;padding:4px 6px;border-radius:8px;font-size:12px;display:flex;gap:4px;backdrop-filter:blur(4px);'

      const btnSat = L.DomUtil.create('button', '', div)
      btnSat.textContent = STYLES.satellite.label
      const btnBright = L.DomUtil.create('button', '', div)
      btnBright.textContent = STYLES.bright.label
      const baseBtn = 'padding:4px 8px;border-radius:6px;border:0;cursor:pointer;'

      function setActive(k: StyleKey) {
        map.removeLayer(current)
        current = makeTile(k).addTo(map)
        currentKey = k
        btnSat.style.cssText = `${baseBtn}background:${k === 'satellite' ? '#34d399' : '#1e293b'};color:${k === 'satellite' ? '#0b1220' : '#e2e8f0'};`
        btnBright.style.cssText = `${baseBtn}background:${k === 'bright' ? '#34d399' : '#1e293b'};color:${k === 'bright' ? '#0b1220' : '#e2e8f0'};`
      }

      L.DomEvent.on(btnSat, 'click', (e) => {
        L.DomEvent.stopPropagation(e)
        setActive('satellite')
      })
      L.DomEvent.on(btnBright, 'click', (e) => {
        L.DomEvent.stopPropagation(e)
        setActive('bright')
      })
      L.DomEvent.disableClickPropagation(div)
      setActive(currentKey)
      return div
    }
    switcher.addTo(map)

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
    }
  }, [])

  return <div ref={containerRef} className="map-container" />
}