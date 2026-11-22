# Simulasi Lalu Lintas 3D — Jalan Gegerkalong Tengah (355 m)

Proyek simulasi lalu lintas mikroskopis 3D berbasis **Vite + TypeScript + Three.js + Chart.js** untuk presentasi **LKM-2 MSTR-Transportasi (Kelompok 9, FPMIPA UPI)**.

## Struktur Proyek

```text
gegerkalong-3d-sim/
├── DESIGN.md                  # Arah desain visual & standar anti-slop
├── index.html                 # Shell HTML semantik
├── package.json               # Skrip dev, typecheck, build modular & single-file
├── tsconfig.json              # Konfigurasi TypeScript strict
├── vite.config.ts             # Konfigurasi bundler Vite
└── src/
    ├── main.ts                # Entrypoint aplikasi
    ├── config/
    │   └── scenarios.ts       # Definisi 3 skenario, dimensi koridor 355 m, preset kamera
    ├── simulation/
    │   ├── types.ts           # Kontrak tipe agen, metrik, dan snapshot
    │   └── trafficEngine.ts   # Mesin car-following, hambatan samping, dan antrean (murni tanpa DOM)
    ├── scene/
    │   ├── textures.ts        # Tekstur prosedural aspal, trotoar, dan papan nama
    │   ├── buildingFactory.ts # Arsitektur detail Ruko, Kos 4 lantai, Pasar Gegerkalong, tiang PLN
    │   ├── streetProps.ts     # Properti Bandung: gerobak, motor parkir, petugas Dishub, pegunungan, awan
    │   ├── corridorBuilder.ts # Geometri 3D koridor 355 m, Pasar Gegerkalong, trotoar, drop-off, parkir
    │   ├── vehicleFactory.ts  # Model 3D mobil, angkot Bandung, motor, mobil boks, dan pejalan kaki
    │   └── trafficScene.ts    # Renderer WebGL, pencahayaan siang, OrbitControls, dan raycasting
    ├── ui/
    │   ├── chartsController.ts # Grafik antrean real-time & benchmark SimPy 10 replikasi
    │   └── hudController.ts    # Pengendali HUD, slider parameter, dan tabel snapshot
    └── styles/
        └── main.css           # Gaya studio arsitektural terang (kontras tinggi untuk proyektor)
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

Untuk menghasilkan satu file HTML mandiri siap buka tanpa server lokal:

```bash
npm run build:singlefile
```

## Lisensi Aset PBR

Seluruh tekstur permukaan PBR (`src/assets/textures/`: aspal, genteng, seng gelombang, paving blok, plester dinding, serta langit equirectangular pagi/sore) bersumber dari [Poly Haven](https://polyhaven.com/) di bawah lisensi **CC0 1.0 Public Domain**.
