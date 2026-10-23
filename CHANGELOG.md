# Changelog — netmap

## Fase 1 (2026-10-23)

### Ditambahkan
- Scaffold aplikasi baru dari nol: Vite 8 + React + TypeScript, CSS native
  (tanpa Tailwind), runtime npm.
- Peta Leaflet + tile StadiaMaps dengan switcher 2 style:
  `alidade_satellite` (Satelit) dan `alidade_bright` (Bright).
- Render 2 dunia (wrap aktif), `worldCopyJump` aktif, tanpa batasan wilayah
  (`maxBounds` dihapus) → negara di ujung tidak terpotong.
- `minZoom` dinamis: zoom terendah dihitung agar ~2 dunia mengisi layar
  (tidak ada tepi abu-abu, ringan untuk perangkat low-end).
- `preferCanvas: true` untuk performa render.
- Plugin **leaflet-geoman-free**: toolbar mengambang bawaan plugin
  (tambah titik, garis, poligon, persegi, lingkaran, edit, drag, cut, hapus).
- Plugin **leaflet.markercluster**: clustering marker (chunked loading);
  marker hasil gambar geoman otomatis masuk cluster group.
- Lazy-load `MapView` (code-split) agar bundle awal ringan
  (~222KB/69KB gz awal, MapView ~465KB/127KB gz dimuat belakangan).
- Persistensi ringan ke `localStorage`: layers (GeoJSON) + view (center/zoom);
  saat refresh peta kembali ke titik/view terakhir (fitBounds jika ada layers).
- Style-switcher 2 tombol (Satelit / Bright) dengan CSS native.
- Atribusi Stadia Maps.
- Dev script bind `0.0.0.0` agar bisa diakses via IP server.
- Dokumen `PHASE1.md` (scope & teknologi Fase 1).

### Tidak ditambahkan (sesuai scope Fase 1)
Form aset, kabel, template perangkat, foto, IndexedDB, import/export,
undo/redo, panel properti/asset, floating bar custom, fitur lain.

### Keamanan
- Kunci Stadia (`VITE_STADIA_API_KEY`) disimpan di `.env` (di-`.gitignore`),
  tidak di-commit. Lihat `.env.example`.
- Tidak ada token GitHub yang disimpan di repo/config.