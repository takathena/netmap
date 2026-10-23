// Lapisan penyimpanan netmap (Tahap 1.1).
//
// Modul ini sengaja TIDAK bergantung pada Leaflet/React supaya logikanya
// (skema, migrasi, backup, validasi) bisa diuji sendiri.
//
// Aturan yang dijaga di sini:
//  - Skema berversi (`v: 2`). Format lama (array GeoJSON polos) = v1 dimigrasi.
//  - Data lama TIDAK pernah ditimpa tanpa salinan: v1 dan data rusak disalin
//    ke kunci cadangan dulu.
//  - Tidak ada error yang ditelan diam-diam: semua kegagalan dikembalikan ke
//    pemanggil (untuk ditampilkan ke pengguna) dan dicatat ke console.

export const LAYERS_KEY = 'netmap-p1-layers'
export const VIEW_KEY = 'netmap-p1-view'
export const CLUSTER_KEY = 'netmap-p1-cluster'
export const STYLE_KEY = 'netmap-p1-style'

export const BACKUP_LEGACY_KEY = `${LAYERS_KEY}.bak-v1`
export const BACKUP_ERROR_KEY = `${LAYERS_KEY}.bak-error`
export const BACKUP_SKIPPED_KEY = `${LAYERS_KEY}.bak-skipped`

export const SCHEMA_VERSION = 2

export const KINDS = [
  'marker',
  'label',
  'line',
  'polygon',
  'rectangle',
  'circle',
  'circlemarker',
] as const

export type Kind = (typeof KINDS)[number]

export interface StoredFeature {
  type: 'Feature'
  properties: Record<string, unknown> | null
  geometry: { type: string; coordinates?: unknown } | null
}

export interface StoredData {
  v: typeof SCHEMA_VERSION
  savedAt: string
  features: StoredFeature[]
}

export type Store = Pick<Storage, 'getItem' | 'setItem'> | null

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; features: StoredFeature[]; dropped: number; raw: string }
  | { status: 'legacy'; features: StoredFeature[]; dropped: number; raw: string }
  | { status: 'error'; message: string; raw: string | null }

export type SaveResult = { ok: true } | { ok: false; message: string }

export interface ViewState {
  lat: number
  lng: number
  zoom: number
}

// ---------------------------------------------------------------- util

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isKind(v: unknown): v is Kind {
  return typeof v === 'string' && (KINDS as readonly string[]).includes(v)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** ID unik. `crypto.randomUUID` hanya ada di HTTPS/localhost; akses via IP
 *  http:// (dev --host 0.0.0.0) tidak punya, jadi ada fallback. */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getStore(): Store {
  try {
    return window.localStorage
  } catch (err) {
    console.warn('[netmap] localStorage tidak tersedia:', err)
    return null
  }
}

// ------------------------------------------------------------- validasi

function isFeature(v: unknown): v is StoredFeature {
  if (!isRecord(v) || v.type !== 'Feature') return false
  const g = v.geometry
  return isRecord(g) && typeof g.type === 'string'
}

/**
 * Pastikan setiap fitur punya `kind` + `id`. Data v1 (tanpa kind/id) ditebak
 * dari geometri. Mengembalikan null untuk fitur yang tidak bisa dipakai.
 */
export function normalizeFeature(f: StoredFeature): StoredFeature | null {
  const g = f.geometry
  if (!g) return null
  const p: Record<string, unknown> = { ...(f.properties ?? {}) }

  const rawText = p.text ?? p.label
  const text =
    typeof rawText === 'string' ? rawText.trim() : typeof rawText === 'number' ? String(rawText) : ''

  const rawKind = p.kind
  let kind: Kind | null = isKind(rawKind) ? rawKind : null
  if (!kind) {
    switch (g.type) {
      case 'Point':
        if (text) kind = 'label'
        else if (p.textMarker) return null // text marker Geoman kosong: tidak ada isi untuk dipulihkan
        else kind = 'marker'
        break
      case 'LineString':
      case 'MultiLineString':
        kind = 'line'
        break
      case 'Polygon':
      case 'MultiPolygon':
        kind = 'polygon'
        break
      default:
        return null
    }
  }

  if (kind === 'label') {
    if (!text) return null
    p.text = text
  }

  p.kind = kind
  p.id = typeof p.id === 'string' && p.id ? p.id : newId()
  return { type: 'Feature', properties: p, geometry: g }
}

/** Normalisasi semua fitur; ID ganda diberi ID baru. */
export function normalizeAll(features: StoredFeature[]): {
  features: StoredFeature[]
  dropped: number
} {
  const out: StoredFeature[] = []
  const seen = new Set<string>()
  let dropped = 0
  for (const f of features) {
    const n = normalizeFeature(f)
    if (!n) {
      dropped++
      continue
    }
    const props = n.properties as Record<string, unknown>
    let id = props.id as string
    if (seen.has(id)) {
      id = newId()
      props.id = id
    }
    seen.add(id)
    out.push(n)
  }
  return { features: out, dropped }
}

// ----------------------------------------------------------- layers I/O

export function loadLayers(store: Store): LoadResult {
  if (!store) return { status: 'empty' }

  let raw: string | null
  try {
    raw = store.getItem(LAYERS_KEY)
  } catch (err) {
    console.error('[netmap] gagal membaca penyimpanan:', err)
    return { status: 'error', message: errMsg(err), raw: null }
  }
  if (raw == null) return { status: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error('[netmap] data peta bukan JSON valid:', err)
    return { status: 'error', message: `JSON rusak (${errMsg(err)})`, raw }
  }

  // v1: array GeoJSON polos
  if (Array.isArray(parsed)) {
    const valid = parsed.filter(isFeature)
    const n = normalizeAll(valid)
    return {
      status: 'legacy',
      features: n.features,
      dropped: n.dropped + (parsed.length - valid.length),
      raw,
    }
  }

  if (isRecord(parsed) && typeof parsed.v === 'number') {
    if (parsed.v > SCHEMA_VERSION) {
      return {
        status: 'error',
        message: `data dibuat oleh versi aplikasi yang lebih baru (skema v${parsed.v})`,
        raw,
      }
    }
    if (parsed.v === SCHEMA_VERSION && Array.isArray(parsed.features)) {
      const valid = parsed.features.filter(isFeature)
      const n = normalizeAll(valid)
      return {
        status: 'ok',
        features: n.features,
        dropped: n.dropped + (parsed.features.length - valid.length),
        raw,
      }
    }
  }

  return { status: 'error', message: 'format data tidak dikenali', raw }
}

export function saveLayers(store: Store, features: StoredFeature[]): SaveResult {
  if (!store) return { ok: false, message: 'localStorage tidak tersedia' }
  const payload: StoredData = {
    v: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    features,
  }
  try {
    store.setItem(LAYERS_KEY, JSON.stringify(payload))
    return { ok: true }
  } catch (err) {
    // Biasanya QuotaExceededError (batas ±5 MB localStorage).
    console.error('[netmap] gagal menyimpan data peta:', err)
    return { ok: false, message: errMsg(err) }
  }
}

/** Salin `raw` ke kunci cadangan. Mengembalikan false bila gagal. */
export function backupRaw(store: Store, key: string, raw: string): boolean {
  if (!store) return false
  try {
    store.setItem(key, raw)
    return true
  } catch (err) {
    console.error(`[netmap] gagal membuat cadangan "${key}":`, err)
    return false
  }
}

// ------------------------------------------------------------ view/pref

export function loadView(store: Store): ViewState | null {
  if (!store) return null
  try {
    const raw = store.getItem(VIEW_KEY)
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (
      isRecord(v) &&
      Number.isFinite(v.lat) &&
      Number.isFinite(v.lng) &&
      Number.isFinite(v.zoom)
    ) {
      return { lat: v.lat as number, lng: v.lng as number, zoom: v.zoom as number }
    }
  } catch (err) {
    console.warn('[netmap] view tersimpan tidak valid, diabaikan:', err)
  }
  return null
}

export function saveView(store: Store, view: ViewState): void {
  if (!store) return
  try {
    store.setItem(VIEW_KEY, JSON.stringify(view))
  } catch (err) {
    console.warn('[netmap] gagal menyimpan view:', err)
  }
}

export function loadClusterPref(store: Store, fallback: boolean): boolean {
  if (!store) return fallback
  try {
    const v = store.getItem(CLUSTER_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch (err) {
    console.warn('[netmap] gagal membaca preferensi cluster:', err)
  }
  return fallback
}

export function saveClusterPref(store: Store, on: boolean): void {
  if (!store) return
  try {
    store.setItem(CLUSTER_KEY, on ? '1' : '0')
  } catch (err) {
    console.warn('[netmap] gagal menyimpan preferensi cluster:', err)
  }
}

export function loadStyle(store: Store, fallback: string): string {
  if (!store) return fallback
  try {
    return store.getItem(STYLE_KEY) ?? fallback
  } catch (err) {
    console.warn('[netmap] gagal membaca style tersimpan:', err)
    return fallback
  }
}

export function saveStyle(store: Store, style: string): void {
  if (!store) return
  try {
    store.setItem(STYLE_KEY, style)
  } catch (err) {
    console.warn('[netmap] gagal menyimpan style:', err)
  }
}
