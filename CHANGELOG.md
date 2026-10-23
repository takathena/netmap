# Changelog — netmap

## Tahap 1.3 — Test Infrastructure (2026-10-23)

### Ditambahkan
- **Vitest**: test runner minimal (no jsdom/happy-dom).
- **src/map/storage.test.ts**: 44 unit tests covering all 11 scenarios from TAHAP-1.1.md:
  - v1 → v2 migration
  - Round-trip save/load
  - Duplicate ID deduplication
  - Corrupt JSON error handling
  - Newer schema version rejection
  - Storage quota graceful failure
  - Backup functions (bak-v1, bak-error, bak-skipped)
  - View state load/save
  - Cluster preference persistence
  - newId fallback (no crypto.randomUUID)
  - normalizeFeature edge cases (null geometry, type guessing, text trimming, etc.)
  - Empty/null geometry handling
- Test script: `npm test` → `vitest`
- All 44 tests pass.

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
## Tahap 1.1 — Stabilisasi data (2026-10-23)

Lihat `TAHAP-1.1.md` untuk detail, daftar tes manual, dan batasan verifikasi.

### Diperbaiki
- **K-1** Data hantu: penyimpanan tidak lagi memindai `map.eachLayer()`; hanya objek
  milik pengguna yang terdaftar di registry yang disimpan (ikon cluster, titik edit
  Geoman, garis bantu tidak ikut tersimpan lagi).
- **K-2** Hapus/geser marker di dalam cluster kini disinkronkan ke cluster/plain
  (tidak "hidup kembali"); toggle Cluster dibangun dari registry.
- **K-3** Event simpan dipasang per-layer (`pm:edit`, `pm:dragend`, `dragend`, ...),
  bukan di map.
- **K-4** Jenis shape tersimpan (`kind`, `radius`): lingkaran/persegi/label tidak
  berubah jenis setelah refresh.
- **K-5** Simpan di-flush saat tab disembunyikan/ditutup (`pagehide`, `visibilitychange`)
  dan saat unmount; timer dibatalkan di cleanup.
- **K-6** Skema berversi (`v: 2`); data v1 dimigrasi dan disalin ke
  `netmap-p1-layers.bak-v1`; data rusak disalin ke `.bak-error`; objek yang dilewati
  ke `.bak-skipped`; kegagalan simpan/baca ditampilkan ke pengguna.
- **B-1/B-2** Label teks: satu representasi (DivIcon + CSS `.netmap-label`) sebelum
  dan sesudah refresh; teks di-escape penuh; bisa diedit (klik ganda).
- Dihapus: blok "stray marker cleanup" dan `pm.enable()` di `onEachFeature`.
- `catch {}` kosong di jalur data diganti penanganan + log.

### Ditarik maju dari rencana 1.2 (diperlukan oleh perbaikan di atas)
- Simpan *view* dipisah dari simpan *data* (geser/zoom tidak lagi menserialisasi data).
- Restore & toggle Cluster memakai `addLayers`/`clearLayers` (bulk).
- Floating bar & style switcher dirender sebagai saudara container peta (klik tidak
  lagi tembus ke peta).

### Perubahan perilaku
- Toolbar Geoman: tombol Teks bawaan, Circle Marker, dan Rotate dimatikan (sesuai scope
  `PHASE1.md`); teks kini lewat tombol **Label** di floating bar.
- Marker teks Geoman kosong dari data lama dibuang saat migrasi.

## Tahap 1.1 — Stabilisasi data (2026-10-23)

Lihat `TAHAP-1.1.md` untuk detail, daftar tes manual, dan batasan verifikasi.

### Diperbaiki
- **K-1** Data hantu: penyimpanan tidak lagi memindai `map.eachLayer()`; hanya objek
  milik pengguna yang terdaftar di registry yang disimpan (ikon cluster, titik edit
  Geoman, garis bantu tidak ikut tersimpan lagi).
- **K-2** Hapus/geser marker di dalam cluster kini disinkronkan ke cluster/plain
  (tidak "hidup kembali"); toggle Cluster dibangun dari registry.
- **K-3** Event simpan dipasang per-layer (`pm:edit`, `pm:dragend`, `dragend`, ...),
  bukan di map.
- **K-4** Jenis shape tersimpan (`kind`, `radius`): lingkaran/persegi/label tidak
  berubah jenis setelah refresh.
- **K-5** Simpan di-flush saat tab disembunyikan/ditutup (`pagehide`, `visibilitychange`)
  dan saat unmount; timer dibatalkan di cleanup.
- **K-6** Skema berversi (`v: 2`); data v1 dimigrasi dan disalin ke
  `netmap-p1-layers.bak-v1`; data rusak disalin ke `.bak-error`; objek yang dilewati
  ke `.bak-skipped`; kegagalan simpan/baca ditampilkan ke pengguna.
- **B-1/B-2** Label teks: satu representasi (DivIcon + CSS `.netmap-label`) sebelum
  dan sesudah refresh; teks di-escape penuh; bisa diedit (klik ganda).
- Dihapus: blok "stray marker cleanup" dan `pm.enable()` di `onEachFeature`.
- `catch {}` kosong di jalur data diganti penanganan + log.

### Ditarik maju dari rencana 1.2 (diperlukan oleh perbaikan di atas)
- Simpan *view* dipisah dari simpan *data* (geser/zoom tidak lagi menserialisasi data).
- Restore & toggle Cluster memakai `addLayers`/`clearLayers` (bulk).
- Floating bar & style switcher dirender sebagai saudara container peta (klik tidak
  lagi tembus ke peta).

### Perubahan perilaku
- Toolbar Geoman: tombol Teks bawaan, Circle Marker, dan Rotate dimatikan (sesuai scope
  `PHASE1.md`); teks kini lewat tombol **Label** di floating bar.
- Marker teks Geoman kosong dari data lama dibuang saat migrasi.
