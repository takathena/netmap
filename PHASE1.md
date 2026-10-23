# Fase 1 — netmap

## Tujuan
Menampilkan peta (Leaflet + StadiaMaps) beserta fitur bawaan plugin
(leaflet-geoman-free dan leaflet.markercluster) dengan stack ringan.

## Scope (hanya ini)
- Peta Leaflet + tile StadiaMaps (2 style: alidade_satellite, alidade_bright).
- Hanya tile Indonesia yang dirender (tile bounds = bbox Indonesia); peta
  bebas scroll/zoom/geser (tanpa maxBounds/minZoom lock, noWrap).
- Geoman: toolbar gambar/edit (titik, garis, poligon, persegi, lingkaran, edit,
  drag, cut, hapus). Marker hasil gambar masuk marker cluster group.
- MarkerCluster: clustering marker (chunked loading).
- Restore otomatis: layers (GeoJSON) + view (center/zoom) dari localStorage
  saat refresh; jika ada layers, fitBounds ke layers tersebut.
- UI minimal ala tldraw: peta full-screen, tanpa header/panel berat.

## TIDAK dikerjakan di Fase 1
Form aset, kabel, template perangkat, foto, IndexedDB, import/export,
undo/redo, panel properti/asset, floating bar custom, fitur lain.

## Teknologi
Vite 8 + React + TypeScript, CSS native, Leaflet, @geoman-io/leaflet-geoman-free,
leaflet.markercluster, StadiaMaps.

## Konfigurasi
- Kunci Stadia di .env (VITE_STADIA_API_KEY), tidak di-commit.
- Lihat .env.example.

## Status
Fase 1 selesai dibangun; menunggu review pengguna sebelum push.