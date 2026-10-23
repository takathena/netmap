import { lazy, Suspense } from 'react'

const MapView = lazy(() => import('./map/MapView').then((m) => ({ default: m.MapView })))

export default function App() {
  return (
    <div className="map-container">
      <Suspense fallback={<div className="map-loading">Memuat peta…</div>}>
        <MapView />
      </Suspense>
    </div>
  )
}