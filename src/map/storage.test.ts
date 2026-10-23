import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  LAYERS_KEY,
  VIEW_KEY,
  BACKUP_LEGACY_KEY,
  BACKUP_ERROR_KEY,
  SCHEMA_VERSION,
  loadLayers,
  saveLayers,
  backupRaw,
  normalizeFeature,
  normalizeAll,
  loadView,
  saveView,
  loadClusterPref,
  saveClusterPref,
  newId,
  type Store,
  type StoredFeature,
} from './storage'

function mockStore(): Store {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  }
}

describe('storage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('newId', () => {
    it('generates unique IDs', () => {
      const id1 = newId()
      const id2 = newId()
      expect(id1).toBeTruthy()
      expect(id2).toBeTruthy()
      expect(id1).not.toBe(id2)
    })

    it('works without crypto.randomUUID', () => {
      const orig = globalThis.crypto
      delete (globalThis as { crypto?: unknown }).crypto
      const id = newId()
      expect(id).toMatch(/^n-/)
      ;(globalThis as { crypto?: unknown }).crypto = orig
    })
  })

  describe('normalizeFeature', () => {
    it('adds kind and id to v1 marker', () => {
      const f: StoredFeature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const n = normalizeFeature(f)
      expect(n).toBeTruthy()
      expect(n?.properties?.kind).toBe('marker')
      expect(n?.properties?.id).toBeTruthy()
    })

    it('converts Point with text to label', () => {
      const f: StoredFeature = {
        type: 'Feature',
        properties: { text: 'Server 1' },
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const n = normalizeFeature(f)
      expect(n?.properties?.kind).toBe('label')
      expect(n?.properties?.text).toBe('Server 1')
    })

    it('drops empty text marker (Geoman legacy)', () => {
      const f: StoredFeature = {
        type: 'Feature',
        properties: { textMarker: true },
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const n = normalizeFeature(f)
      expect(n).toBeNull()
    })

    it('normalizes LineString to line', () => {
      const f: StoredFeature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [[110, 0], [111, 1]] },
      }
      const n = normalizeFeature(f)
      expect(n?.properties?.kind).toBe('line')
    })

    it('normalizes Polygon to polygon', () => {
      const f: StoredFeature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[110, 0], [111, 0], [111, 1], [110, 1], [110, 0]]] },
      }
      const n = normalizeFeature(f)
      expect(n?.properties?.kind).toBe('polygon')
    })

    it('drops label without text', () => {
      const f: StoredFeature = {
        type: 'Feature',
        properties: { kind: 'label' },
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const n = normalizeFeature(f)
      expect(n).toBeNull()
    })
  })

  describe('normalizeAll', () => {
    it('resolves duplicate IDs', () => {
      const f1: StoredFeature = {
        type: 'Feature',
        properties: { id: 'dup', kind: 'marker' },
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const f2: StoredFeature = {
        type: 'Feature',
        properties: { id: 'dup', kind: 'marker' },
        geometry: { type: 'Point', coordinates: [111, 1] },
      }
      const { features, dropped } = normalizeAll([f1, f2])
      expect(features).toHaveLength(2)
      expect(dropped).toBe(0)
      const ids = features.map(f => f.properties?.id)
      expect(new Set(ids).size).toBe(2)
    })

    it('counts dropped invalid features', () => {
      const valid: StoredFeature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const invalid: StoredFeature = {
        type: 'Feature',
        properties: { textMarker: true },
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const { features, dropped } = normalizeAll([valid, invalid])
      expect(features).toHaveLength(1)
      expect(dropped).toBe(1)
    })
  })

  describe('loadLayers', () => {
    it('returns empty when store is null', () => {
      const r = loadLayers(null)
      expect(r.status).toBe('empty')
    })

    it('returns empty when key not found', () => {
      const store = mockStore()!
      const r = loadLayers(store)
      expect(r.status).toBe('empty')
    })

    it('loads v2 data', () => {
      const store = mockStore()!
      const data = {
        v: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        features: [{
          type: 'Feature' as const,
          properties: { id: 'test', kind: 'marker' },
          geometry: { type: 'Point', coordinates: [110, 0] },
        }],
      }
      store.setItem(LAYERS_KEY, JSON.stringify(data))
      const r = loadLayers(store)
      expect(r.status).toBe('ok')
      if (r.status === 'ok') {
        expect(r.features).toHaveLength(1)
        expect(r.dropped).toBe(0)
      }
    })

    it('migrates v1 array', () => {
      const store = mockStore()!
      const v1 = [{
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point', coordinates: [110, 0] },
      }]
      store.setItem(LAYERS_KEY, JSON.stringify(v1))
      const r = loadLayers(store)
      expect(r.status).toBe('legacy')
      if (r.status === 'legacy') {
        expect(r.features).toHaveLength(1)
        expect(r.features[0].properties?.kind).toBe('marker')
      }
    })

    it('rejects newer schema version', () => {
      const store = mockStore()!
      const future = { v: SCHEMA_VERSION + 1, features: [] }
      store.setItem(LAYERS_KEY, JSON.stringify(future))
      const r = loadLayers(store)
      expect(r.status).toBe('error')
      if (r.status === 'error') {
        expect(r.message).toContain('lebih baru')
      }
    })

    it('handles corrupt JSON', () => {
      const store = mockStore()!
      store.setItem(LAYERS_KEY, '{rusak')
      const r = loadLayers(store)
      expect(r.status).toBe('error')
      if (r.status === 'error') {
        expect(r.message).toContain('JSON rusak')
      }
    })

    it('handles unrecognized format', () => {
      const store = mockStore()!
      store.setItem(LAYERS_KEY, '"string"')
      const r = loadLayers(store)
      expect(r.status).toBe('error')
      if (r.status === 'error') {
        expect(r.message).toContain('tidak dikenali')
      }
    })
  })

  describe('saveLayers', () => {
    it('saves v2 format', () => {
      const store = mockStore()!
      const f: StoredFeature = {
        type: 'Feature',
        properties: { id: 'test', kind: 'marker' },
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const r = saveLayers(store, [f])
      expect(r.ok).toBe(true)
      const raw = store.getItem(LAYERS_KEY)
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw!)
      expect(parsed.v).toBe(SCHEMA_VERSION)
      expect(parsed.features).toHaveLength(1)
    })

    it('fails when store is null', () => {
      const f: StoredFeature = {
        type: 'Feature',
        properties: { id: 'test', kind: 'marker' },
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const r = saveLayers(null, [f])
      expect(r.ok).toBe(false)
    })

    it('handles quota exceeded', () => {
      const store: Store = {
        getItem: () => null,
        setItem: () => { throw new Error('QuotaExceededError') },
      }
      const f: StoredFeature = {
        type: 'Feature',
        properties: { id: 'test', kind: 'marker' },
        geometry: { type: 'Point', coordinates: [110, 0] },
      }
      const r = saveLayers(store, [f])
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.message).toContain('QuotaExceededError')
      }
    })
  })

  describe('backupRaw', () => {
    it('saves backup to custom key', () => {
      const store = mockStore()!
      const ok = backupRaw(store, BACKUP_LEGACY_KEY, '{"test":1}')
      expect(ok).toBe(true)
      expect(store.getItem(BACKUP_LEGACY_KEY)).toBe('{"test":1}')
    })

    it('returns false when store is null', () => {
      const ok = backupRaw(null, BACKUP_ERROR_KEY, '{}')
      expect(ok).toBe(false)
    })
  })

  describe('round-trip', () => {
    it('preserves all feature types', () => {
      const store = mockStore()!
      const features: StoredFeature[] = [
        {
          type: 'Feature',
          properties: { id: 'm1', kind: 'marker' },
          geometry: { type: 'Point', coordinates: [110, 0] },
        },
        {
          type: 'Feature',
          properties: { id: 'l1', kind: 'label', text: 'Label' },
          geometry: { type: 'Point', coordinates: [111, 1] },
        },
        {
          type: 'Feature',
          properties: { id: 'ln1', kind: 'line' },
          geometry: { type: 'LineString', coordinates: [[110, 0], [111, 1]] },
        },
        {
          type: 'Feature',
          properties: { id: 'p1', kind: 'polygon' },
          geometry: { type: 'Polygon', coordinates: [[[110, 0], [111, 0], [111, 1], [110, 0]]] },
        },
        {
          type: 'Feature',
          properties: { id: 'r1', kind: 'rectangle' },
          geometry: { type: 'Polygon', coordinates: [[[110, 0], [111, 0], [111, 1], [110, 1], [110, 0]]] },
        },
        {
          type: 'Feature',
          properties: { id: 'c1', kind: 'circle', radius: 1000 },
          geometry: { type: 'Point', coordinates: [110, 0] },
        },
      ]
      const save = saveLayers(store, features)
      expect(save.ok).toBe(true)
      const load = loadLayers(store)
      expect(load.status).toBe('ok')
      if (load.status === 'ok') {
        expect(load.features).toHaveLength(6)
        const kinds = load.features.map(f => f.properties?.kind)
        expect(kinds).toContain('marker')
        expect(kinds).toContain('label')
        expect(kinds).toContain('line')
        expect(kinds).toContain('polygon')
        expect(kinds).toContain('rectangle')
        expect(kinds).toContain('circle')
        const circle = load.features.find(f => f.properties?.kind === 'circle')
        expect(circle?.properties?.radius).toBe(1000)
      }
    })
  })

  describe('view', () => {
    it('saves and loads view state', () => {
      const store = mockStore()!
      saveView(store, { lat: -2.5, lng: 118, zoom: 5 })
      const v = loadView(store)
      expect(v).toEqual({ lat: -2.5, lng: 118, zoom: 5 })
    })

    it('returns null when view not set', () => {
      const store = mockStore()!
      const v = loadView(store)
      expect(v).toBeNull()
    })

    it('ignores invalid view', () => {
      const store = mockStore()!
      store.setItem(VIEW_KEY, '{"lat":"invalid"}')
      const v = loadView(store)
      expect(v).toBeNull()
    })
  })

  describe('clusterPref', () => {
    it('saves and loads cluster preference', () => {
      const store = mockStore()!
      saveClusterPref(store, false)
      expect(loadClusterPref(store, true)).toBe(false)
      saveClusterPref(store, true)
      expect(loadClusterPref(store, false)).toBe(true)
    })

    it('returns fallback when not set', () => {
      const store = mockStore()!
      expect(loadClusterPref(store, true)).toBe(true)
      expect(loadClusterPref(store, false)).toBe(false)
    })
  })
})
