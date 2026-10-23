# Tahap 1.1 — Stabilisasi Data

Tujuan: persistensi tidak boleh merusak/menghilangkan data. Tidak ada fitur baru selain
yang dibutuhkan untuk menutup temuan K-1…K-6 dan B-1/B-2 pada `ANALISA-NETMAP-FASE1.md`.

## Arsitektur singkat

```
src/map/storage.ts   murni (tanpa Leaflet/React): skema v2, migrasi v1, backup, load/save
src/map/layers.ts    Leaflet <-> fitur tersimpan: kind, label, toFeature, fromFeature
src/map/MapView.tsx  orkestrasi: peta, registry, Geoman, cluster, UI
```

Alur data: `Geoman/Label -> register() -> registry (Map layer->meta) -> markDirty()
-> debounce 400 ms (atau flush saat tab hidden) -> toFeature() -> localStorage`.
Sumber kebenaran = registry, **bukan** isi peta.

Format simpan (`netmap-p1-layers`):
`{ "v": 2, "savedAt": "...", "features": [ Feature{ properties:{ id, kind, text?, radius? } } ] }`
`kind` ∈ marker | label | line | polygon | rectangle | circle | circlemarker.

## Peta temuan -> perbaikan

| ID | Perbaikan |
|---|---|
| K-1 | Serialisasi dari registry; tidak ada `eachLayer` |
| K-2 | `forget()` mengeluarkan marker dari cluster/plain saat `pm:remove`; `reindexMarker()` setelah geser; toggle dari registry |
| K-3 | Listener per-layer (`LAYER_CHANGE_EVENTS`) saat `register()` |
| K-4 | `kind`+`radius` disimpan dan direkonstruksi (`fromFeature`) |
| K-5 | `flush()` pada `pagehide`/`visibilitychange`/cleanup |
| K-6 | `schemaVersion`, backup `.bak-v1/.bak-error/.bak-skipped`, notifikasi error |
| B-1/B-2 | Label DivIcon + CSS, satu representasi, edit via klik ganda |

## Status verifikasi (jujur)

| Dicek | Hasil |
|---|---|
| `storage.ts` strict typecheck (flag sama dgn `tsconfig.app.json`) | ✅ lolos |
| `storage.ts` unit test (11 skenario: migrasi v1, round-trip, ID ganda, JSON rusak, skema baru, storage penuh, backup, view/pref, fallback `newId` tanpa `crypto.randomUUID`) | ✅ 11/11 |
| `layers.ts` + `MapView.tsx`: sintaks, nama tak terdefinisi, impor/variabel tak terpakai | ✅ (dengan stub tipe longgar) |
| `layers.ts` + `MapView.tsx`: typecheck penuh terhadap tipe Leaflet/Geoman asli | ⚠️ **belum** — paket tak bisa diunduh di sandbox |
| `npm run build` | ⚠️ **belum** |
| Dijalankan di browser (perilaku Geoman × markercluster) | ⚠️ **belum** |

**Jalankan lebih dulu di mesin Anda:**
```
npm install
npx tsc -b          # harus bersih
npm run lint
npm run dev
```
Jika `tsc` melaporkan kesalahan tipe, itu murni masalah tipe (bukan logika) dan mudah diperbaiki —
kirimkan keluarannya.

## Tes manual (urutan = prioritas)

Buka DevTools → Application → Local Storage → `netmap-p1-layers`.

1. **Data hantu (K-1)** — Buat 6–8 marker berdekatan → zoom out sampai jadi cluster → geser peta →
   cek `features.length` di `localStorage`. *Harus sama persis dengan jumlah marker yang dibuat*,
   dan tetap sama setelah refresh berulang.
2. **Hapus di cluster (K-2)** — Hapus satu marker (mode Hapus) → zoom in/out → toggle Cluster OFF/ON
   → refresh. *Marker tidak boleh muncul lagi; `features` berkurang 1.*
3. **Geser di cluster (K-2)** — Geser satu marker (mode Geser) lalu zoom in/out. *Tetap di posisi baru.*
4. **Simpan tanpa geser peta (K-3/K-5)** — Edit titik polygon / geser marker lalu **langsung**
   refresh tanpa menyentuh peta. *Perubahan harus ada.*
5. **Tipe shape (K-4)** — Gambar lingkaran (dengan radius jelas) + persegi → refresh.
   *Tetap lingkaran dengan radius sama; persegi tetap persegi.*
6. **Label (B-1/B-2)** — Klik **Label**, klik peta, ketik "Server Rumah 1", Enter → refresh.
   *Latar putih, teks terbaca, satu baris, bisa di-cluster, bisa dihapus/digeser; klik ganda untuk edit.*
7. **Cut polygon (K-3)** — Cut sebuah polygon lalu refresh. *Hasil cut tetap ada.*
   (Handler `pm:cut` bergantung pada payload event Geoman — tes ini paling mungkin
   membutuhkan penyesuaian kecil.)
8. **Klik tembus (U-1)** — Mulai gambar polygon lalu klik tombol Cluster. *Tidak menambah titik.*
9. **Migrasi data lama** — Pada browser yang masih punya data v1: buka aplikasi. *Muncul objek
   lama; `netmap-p1-layers.bak-v1` berisi salinan v1.* Catatan: "marker hantu" yang sudah
   terlanjur tersimpan v1 tidak bisa dibedakan dari data asli — hapus manual atau mulai dari bersih.
10. **Gagal baca/simpan** — Ubah isi `netmap-p1-layers` menjadi `{rusak` lalu refresh. *Muncul
    banner merah; salinan ada di `.bak-error`; aplikasi tetap berjalan.*

## Batasan yang disadari (dibiarkan untuk 1.2/1.3)

- Marker default masih berisiko rusak di build produksi (Q-4); ikon eksplisit di 1.2.
- Style peta belum diingat saat refresh; `tileerror` belum ditangani; kunci Stadia/URL `.jpg` perlu dicek (1.2).
- `any` masih dipakai di batas plugin (kini terisolasi lewat antarmuka kecil); lint ketat di 1.2.
- Belum ada test runner di repo (modul `storage.ts` sudah siap diuji); 1.3.
- Debounce 400 ms masih menyisakan jendela kecil bila browser mati mendadak (crash/kill proses),
  bukan saat refresh/tutup tab biasa.
- `localStorage` ±5 MB tetap batas data; kegagalan simpan kini terlihat, tapi solusinya IndexedDB (Fase 2).
- `README.md`, `PHASE1.md`, dan bagian lama `CHANGELOG.md` yang tidak cocok dengan kode belum dirapikan (1.2).
