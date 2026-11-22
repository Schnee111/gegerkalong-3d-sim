# Simulasi Lalu Lintas 3D — Jalan Gegerkalong Tengah (636 m Utuh)

Proyek simulasi lalu lintas mikroskopis 3D berbasis **Vite + TypeScript + Three.js + Chart.js** untuk presentasi **LKM-2 MSTR-Transportasi (Kelompok 9, FPMIPA UPI)**.

## Tim Penyusun (Kelompok 9 — MSTR FPMIPA UPI)

- **2308224** Datuk Daneswara Raditya Samsura
- **2311399** Faisal Nur Qolbi
- **2305771** Muhammad Daffa Maarif
- **2304137** Muhammad Bintang Eighista Dwiputra
- **2308817** Hafidz Tantowi

## Keakuratan Topologi & Kalibrasi Data Riil

- **Geometri & Topologi Jalan Utuh (636,4 m):** Mengacu penuh pada **OpenStreetMap API v0.6** (`Way 125178979` — Jl. Gegerkalong Tengah, lebar aspal riil 3,8 m) dari **Simpang Jl. Gegerkalong Girang (`0 m`)** → melewati **Pasar Gegerkalong (`~347–375 m`, batas segmen utara `355 m` LKM-2)** → hingga **Simpang Jalan Raya Gegerkalong Hilir (`636,4 m`)**, lengkap dengan 64 ruas jalan/gang penghubung (Jl. Gegerkalong Girang, Gang Masjid Al Barkah, Jl. Gegerkalong Tengah 9, akses KPAD/Jl. Kartika II dengan *lift-gate*, Jl. Haji Ridho, lorong kanopi biru Pasar `Way 566513488`, dan arteri 2 lajur Jl. Gegerkalong Hilir).
- **Bangunan & Landmark Nyata (920 struktur OSM):** 86 bangunan baris depan, 823 bangunan permukiman (digabung ke 6 *batched GPU draw calls*), serta 11 landmark ikonik pada tapak GPS sebenarnya — **Pasar Gegerkalong No. 35A** (kanopi lengkung biru + gedung los utama `Way 522195464` 702 m² + pohon rindang pintu masuk), **Masjid Baiturahman**, **Kampus IV UNPAS** (Gedung A Rektorat, Gedung B, Mesjid Ulul Albab), **Kampus UPI** (Gedung Centre of Excellence UPI & SDN Isola 2), serta area **Simpang Hilir** (**Kantor Pos Gegerkalong Hilir**, Indomaret, Alfamart, Widyaloka 1).
- **Profil Elevasi:** Data elevasi nyata **Open-Meteo DEM** Bandung Utara (turun 26 m dari **901 m dpl** di Simpang Girang → **889 m dpl** di Pasar Gegerkalong → **875 m dpl** di Simpang Hilir).
- **Lalu Lintas & Volume:**
  - Menggunakan aturan **lajur kiri Indonesia** (arah Selatan Girang → Pasar di sisi Timur; arah Utara Pasar → Girang di sisi Barat).
  - **Komposisi armada** mengacu data **ERI Korlantas Polri / BPS Kota Bandung (2024)**: 75% sepeda motor (`emp = 0,40`), 16% mobil penumpang (`1,00`), 5% angkot (`1,00`), 4% mobil boks/muat pasar (`1,20`) dengan rata-rata tertimbang `0,558 smp/kend.`.
  - Menyediakan dua preset kalibrasi satu klik: **Riil Puncak (`850 kend./jam ≈ 474 smp/jam`)** berdasarkan limpahan arus Simpang Girang (Firdaus, UPI 2018) & kapasitas MKJI/PKJI ruas 3,8 m, serta **Preset LKM-2 (`350 kend./jam`)** untuk perbandingan langsung terhadap benchmark **SimPy 10 replikasi**.

## Struktur Proyek

```text
gegerkalong-3d-sim/
├── DESIGN.md                      # Arah desain visual Daylight Urban-Planning Studio
├── index.html                     # Shell HTML semantik + HUD studio
├── package.json                   # Skrip dev, typecheck, build modular & single-file
├── tsconfig.json                  # Konfigurasi TypeScript strict
├── vite.config.ts                 # Konfigurasi bundler Vite
└── src/
    ├── main.ts                    # Entrypoint aplikasi & loop simulasi
    ├── config/
    │   ├── osmCorridorData.ts     # Data geospasial OSM + elevasi Open-Meteo & landmark
    │   └── scenarios.ts           # Definisi 3 skenario, preset volume, dimensi koridor, kamera
    ├── simulation/
    │   ├── types.ts               # Kontrak tipe agen, metrik PKJI/MKJI, dan snapshot
    │   └── trafficEngine.ts       # Mesin car-following lajur kiri, FIFO spillback, hambatan samping
    ├── scene/
    │   ├── roadSpline.ts          # Interpolasi centerline OSM, elevasi lereng & ribbon jalan
    │   ├── textures.ts            # Tekstur PBR Poly Haven, fasad Bandung & papan nama
    │   ├── buildingFactory.ts     # Arsitektur detail Ruko, Kos 4 lantai, pohon & tiang PLN
    │   ├── streetProps.ts         # Properti Bandung: gerobak, petugas Dishub, cermin, rambu
    │   ├── corridorBuilder.ts     # Koridor 355 m, Pasar Gegerkalong, UNPAS, Masjid, trotoar, parkir
    │   ├── vehicleFactory.ts      # Model 3D motor, mobil, angkot, boks muat & pejalan kaki + dispose
    │   └── trafficScene.ts        # Renderer WebGL, tilt-shift, kompas Utara, OrbitControls, raycasting
    ├── ui/
    │   ├── chartsController.ts    # Grafik antrean real-time & benchmark SimPy 10 replikasi
    │   └── hudController.ts       # Pengendali HUD, kompas, preset volume, slider & snapshot
    └── styles/
        └── main.css               # Gaya studio arsitektural terang (kontras tinggi untuk proyektor)
```

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

## Validasi & Build Produksi

```bash
npm run typecheck
npm run build
```

Untuk menghasilkan satu file HTML mandiri siap buka tanpa server lokal (cocok untuk presentasi kelas):

```bash
npm run build:singlefile
```

## Lisensi Aset PBR

Seluruh tekstur permukaan PBR (`src/assets/textures/`: aspal, genteng, seng gelombang, paving blok, plester dinding, serta langit equirectangular pagi/sore) bersumber dari [Poly Haven](https://polyhaven.com/) di bawah lisensi **CC0 1.0 Public Domain**. Data peta & bangunan bersumber dari kontributor [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL).
