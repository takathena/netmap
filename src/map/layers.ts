// Konversi antara layer Leaflet <-> fitur tersimpan (Tahap 1.1).
//
// Prinsip: yang disimpan adalah objek MILIK PENGGUNA yang terdaftar di registry
// MapView, bukan hasil memindai peta. Setiap objek punya `id` dan `kind`
// sehingga jenisnya (lingkaran, persegi, label, ...) tidak berubah setelah refresh.

import L from 'leaflet'
import { newId, type Kind, type StoredFeature } from './storage'

export interface LayerMeta {
  id: string
  kind: Kind
  /** Isi teks (hanya untuk kind 'label'). */
  text?: string
  /** Posisi terakhir marker yang diketahui — untuk mendeteksi perubahan. */
  pos?: [number, number]
}

/** Jenis layer hasil gambar Geoman. 'label' dibuat oleh aplikasi, bukan Geoman. */
export function kindOfLayer(layer: L.Layer): Exclude<Kind, 'label'> | null {
  // Urutan penting: Rectangle ⊂ Polygon ⊂ Polyline; Circle ⊂ CircleMarker.
  if (layer instanceof L.Rectangle) return 'rectangle'
  if (layer instanceof L.Polygon) return 'polygon'
  if (layer instanceof L.Polyline) return 'line'
  if (layer instanceof L.Circle) return 'circle'
  if (layer instanceof L.CircleMarker) return 'circlemarker'
  if (layer instanceof L.Marker) return 'marker'
  return null
}

// ---------------------------------------------------------------- label

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Ikon label. Satu-satunya representasi teks di aplikasi (sebelum dan sesudah
 * refresh sama). Gaya ada di index.css (.netmap-label / .netmap-label-icon).
 * Teks di-escape penuh (aman bila nanti datang dari sumber eksternal).
 */
export function createLabelIcon(text: string): L.DivIcon {
  return L.divIcon({
    className: 'netmap-label-icon',
    html: `<span class="netmap-label">${escapeHtml(text)}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

// --------------------------------------------------------------- bounds

export function layerBounds(layer: L.Layer): L.LatLngBounds | null {
  if (layer instanceof L.Circle) {
    // Circle.getBounds() butuh layer sudah ada di peta; hitung dari geometri.
    return layer.getLatLng().toBounds(layer.getRadius() * 2)
  }
  if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
    const ll = layer.getLatLng()
    return L.latLngBounds(ll, ll)
  }
  if (layer instanceof L.Polyline) {
    const b = layer.getBounds()
    return b.isValid() ? b : null
  }
  return null
}

// ------------------------------------------------------------ serialisasi

type WithGeoJSON = { toGeoJSON?: (precision?: number) => unknown }

export function toFeature(layer: L.Layer, meta: LayerMeta): StoredFeature | null {
  const g = layer as unknown as WithGeoJSON
  if (typeof g.toGeoJSON !== 'function') return null

  const raw = g.toGeoJSON() as StoredFeature | null
  if (!raw || raw.type !== 'Feature' || !raw.geometry) return null

  const properties: Record<string, unknown> = {
    ...(raw.properties ?? {}),
    id: meta.id,
    kind: meta.kind,
  }
  if (meta.kind === 'label') properties.text = meta.text ?? ''
  if (layer instanceof L.Circle) properties.radius = layer.getRadius()
  else if (layer instanceof L.CircleMarker) properties.radius = layer.getRadius()

  return { type: 'Feature', properties, geometry: raw.geometry }
}

// ------------------------------------------------------------ rekonstruksi

function coordPair(c: unknown): [number, number] | null {
  if (!Array.isArray(c) || c.length < 2) return null
  const lng = c[0]
  const lat = c[1]
  if (typeof lng !== 'number' || typeof lat !== 'number') return null
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (lat < -90 || lat > 90) return null
  return [lat, lng]
}

function pointLatLng(f: StoredFeature): L.LatLng | null {
  if (f.geometry?.type !== 'Point') return null
  const p = coordPair(f.geometry.coordinates)
  return p ? L.latLng(p[0], p[1]) : null
}

function rectangleBounds(f: StoredFeature): L.LatLngBounds | null {
  if (f.geometry?.type !== 'Polygon') return null
  const rings = f.geometry.coordinates
  if (!Array.isArray(rings) || !Array.isArray(rings[0])) return null
  const pts: L.LatLng[] = []
  for (const c of rings[0] as unknown[]) {
    const p = coordPair(c)
    if (!p) return null
    pts.push(L.latLng(p[0], p[1]))
  }
  if (pts.length < 3) return null
  return L.latLngBounds(pts)
}

/** Bangun kembali layer dari fitur tersimpan. `null` = fitur tidak bisa dipakai. */
export function fromFeature(f: StoredFeature): { layer: L.Layer; meta: LayerMeta } | null {
  const p = f.properties ?? {}
  const kind = p.kind as Kind | undefined
  const id = typeof p.id === 'string' && p.id ? p.id : newId()

  switch (kind) {
    case 'label': {
      const ll = pointLatLng(f)
      const text = typeof p.text === 'string' ? p.text : ''
      if (!ll || !text) return null
      const layer = L.marker(ll, { icon: createLabelIcon(text) })
      return { layer, meta: { id, kind, text } }
    }
    case 'marker': {
      const ll = pointLatLng(f)
      if (!ll) return null
      return { layer: L.marker(ll), meta: { id, kind } }
    }
    case 'circle': {
      const ll = pointLatLng(f)
      const radius = Number(p.radius)
      if (!ll || !Number.isFinite(radius) || radius <= 0) return null
      return { layer: L.circle(ll, { radius }), meta: { id, kind } }
    }
    case 'circlemarker': {
      const ll = pointLatLng(f)
      const r = Number(p.radius)
      if (!ll) return null
      const radius = Number.isFinite(r) && r > 0 ? r : 10
      return { layer: L.circleMarker(ll, { radius }), meta: { id, kind } }
    }
    case 'rectangle': {
      const b = rectangleBounds(f)
      if (!b || !b.isValid()) return null
      return { layer: L.rectangle(b), meta: { id, kind } }
    }
    case 'line':
    case 'polygon': {
      // geoJSON() membuat grup; ambil anak pertamanya lalu lepaskan dari grup.
      const group = L.geoJSON(f as never)
      const child = group.getLayers()[0]
      if (!child) return null
      group.removeLayer(child)
      return { layer: child, meta: { id, kind } }
    }
    default:
      return null
  }
}
