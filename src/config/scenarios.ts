export type ScenarioKey = 'baseline' | 'sk1' | 'sk2';
export type OneWayDirection = 1 | -1; // 1 = Pagi (Girang -> Hilir), -1 = Sore (Hilir -> Girang)
export type CameraPresetKey = 'isometric' | 'girang' | 'pasar' | 'hilir' | 'topdown';
export type VolumePresetKey = 'realPeak' | 'simpyCrn' | 'lkm2';

export interface ScenarioConfig {
  key: ScenarioKey;
  code: string;
  shortName: string;
  title: string;
  subtitle: string;
  defaultParams: {
    lam: number;     // kendaraan fisik/jam
    pStop: number;   // persen (0-40)
    stopDur: number; // detik rata-rata
  };
  twoWay: boolean;
  hasSidewalk: boolean;
  hasOffstreet: boolean;
  hasNoStopSign: boolean;
  /** Perkiraan kapasitas efektif ruas 3,8 m menurut MKJI/PKJI (smp/jam) */
  effectiveCapacitySmp: number;
  simpyBenchmark: {
    wait: number;
    maxq: number;
    thr: number;
  };
  insight: string;
}

export interface VehicleProfile {
  kind: 'Mobil' | 'Angkot' | 'Motor' | 'Boks Muat';
  lengthM: number;
  widthM: number;
  heightM: number;
  maxSpeedMs: number;
  /** Ekivalen Mobil Penumpang (emp) sesuai PKJI/MKJI untuk ruas perkotaan sempit 2/2 TT */
  emp: number;
  /** Proporsi armada berdasarkan ERI Korlantas/BPS Kota Bandung 2024 & koridor UPI-Pasar */
  weight: number;
  palette: number[];
}

export interface CameraPreset {
  key: CameraPresetKey;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export interface VolumePreset {
  key: VolumePresetKey;
  label: string;
  lam: number;
  description: string;
}

/**
 * Preset volume berbasis data publik, kalibrasi SimPy CRN multi-kelas, & LKM-2 Kelompok 9:
 * - Riil Puncak (850 kend./jam ≈ 474 smp/jam): mengacu limpahan arus jam sibuk pagi dari
 *   Simpang Gegerkalong Girang (5.746 smp/jam; gerbang motor UPI 2.117 smp/jam, Firdaus UPI 2018)
 *   yang masuk ke ruas lokal sempit Jl. Gegerkalong Tengah (3,8 m) dengan komposisi 75% motor
 *   (BPS Prov. Jabar 2024: 71,24% motor + survei kampus JPR ITS 2024).
 * - SimPy CRN (540 kend./jam ≈ 301 smp/jam pada 3D / ≈ 245 skr/jam pada SimPy): kalibrasi multi-kelas
 *   (75% motor, 25% roda 4) dengan Common Random Numbers (10 replikasi × 2 jam, warm-up 10 menit).
 * - Preset LKM-2 (350 kend./jam ≈ 195 smp/jam): asumsi laju kedatangan awal pemodelan SimPy LKM-2.
 */
export const VOLUME_PRESETS: Record<VolumePresetKey, VolumePreset> = {
  realPeak: {
    key: 'realPeak',
    label: 'Puncak (850/j)',
    lam: 850,
    description: 'Jam sibuk pagi riil Jl. Gegerkalong Tengah (~474 smp/jam; Firdaus UPI 2018 & BPS Jabar 2024)'
  },
  simpyCrn: {
    key: 'simpyCrn',
    label: 'SimPy CRN (540/j)',
    lam: 540,
    description: 'Kalibrasi SimPy CRN multi-kelas (540 kend./jam; 75% motor, 25% roda 4; 10 replikasi × 2 jam)'
  },
  lkm2: {
    key: 'lkm2',
    label: 'LKM-2 (350/j)',
    lam: 350,
    description: 'Asumsi skenario awal pemodelan SimPy pada LKM-2 Kelompok 9 (350 kend./jam)'
  }
};

/**
 * Skala dunia 3D: 1 unit = 1 meter, berbasis koordinat penuh OpenStreetMap API v0.6 (Way 125178979).
 * Koridor utuh 636,4 m dari Simpang Jl. Gegerkalong Girang (0 m, 901 m dpl, y = +26 m)
 * melewati Pasar Gegerkalong di tengah (347-375 m, 889 m dpl, y = +14 m; batas segmen utara 355 m LKM-2)
 * hingga Simpang Jalan Raya Gegerkalong Hilir (636,4 m, 875 m dpl, y = 0 m).
 * Sumbu koordinat: +X = Selatan (Girang -> Hilir), +Z = Barat, -Z = Timur, +Y = Atas.
 * Lalu lintas mengikuti standar Indonesia: LAJUR KIRI (Selatan di sisi Timur -Z, Utara di sisi Barat +Z).
 */
export const CORRIDOR = {
  lengthM: 636.4,
  northSegmentM: 355, // Batas segmen utara (Simpang Girang -> Pasar Gegerkalong) sesuai benchmark SimPy CRN
  roadWidthM: 3.8, // Lebar aspal riil 3,8 m (sesuai LKM-2: 3-4 m & OSM Way 125178979)
  laneOffsetZ: 0.82,
  sidewalkWidthM: 1.25,
  // Diverifikasi bebas tabrakan terhadap bangunan & gang OSM pada citra satelit:
  // East (-Z) setback 186..214 m memiliki ruang terbuka 5,1-11,9 m (samping Kampus IV UNPAS)
  dropoffBay: {
    startM: 186,
    endM: 214,
    bayZ: -3.35
  },
  // West (+Z) setback 262..296 m memiliki ruang terbuka 7,1-10,7 m (tepat utara akses KPAD 308 m & Pasar)
  parkingLot: {
    startM: 262,
    endM: 296,
    bayZ: 3.65
  },
  // Lokasi nyata Pasar Gegerkalong (Jl. Gegerkalong Tengah No. 35A) di tengah koridor:
  // Kios muka 318..343 m, lorong kanopi biru 347 m (OSM Way 566513488), los utama 352..375 m (OSM Way 522195464)
  pasar: {
    frontStartM: 318,
    frontEndM: 343,
    canopyLaneM: 347,
    hallStartM: 352,
    hallEndM: 375
  }
} as const;

export const SCENARIOS: Record<ScenarioKey, ScenarioConfig> = {
  baseline: {
    key: 'baseline',
    code: '0',
    shortName: 'Baseline',
    title: 'Kondisi Eksisting (Dua Arah + Parkir Badan Jalan)',
    subtitle: 'Ruas utuh 636 m (lebar 3,8 m) tanpa trotoar, hambatan samping 11% (20–40 dtk) & konflik papasan 2 arah',
    defaultParams: { lam: VOLUME_PRESETS.realPeak.lam, pStop: 11, stopDur: 30 },
    twoWay: true,
    hasSidewalk: false,
    hasOffstreet: false,
    hasNoStopSign: false,
    effectiveCapacitySmp: 440,
    simpyBenchmark: { wait: 534, maxq: 156, thr: 468 },
    insight:
      'Parkir dan bongkar muat di badan jalan sekitar Pasar Gegerkalong (PKJI kelas Sangat Tinggi) menyempitkan lebar efektif ruas 3,8 m. Arus dua arah lajur kiri saling tertahan konflik papasan (9–17 dtk) hingga antrean meluber ke Simpang Girang.'
  },
  sk1: {
    key: 'sk1',
    code: '1',
    shortName: 'Drop-Off & Parkir',
    title: 'Skenario 1 (Parkir Off-Street KPAD/Pasar & Jadwal Muat Luar Sibuk)',
    subtitle: 'Ruas 3,8 m (tanpa trotoar), parkir off-street KPAD/Pasar (262-296 m), teluk drop-off (186-214 m), jadwal muat luar sibuk',
    defaultParams: { lam: VOLUME_PRESETS.realPeak.lam, pStop: 3, stopDur: 14 },
    twoWay: true,
    hasSidewalk: false,
    hasOffstreet: true,
    hasNoStopSign: true,
    effectiveCapacitySmp: 820,
    simpyBenchmark: { wait: 52, maxq: 27, thr: 537 },
    insight:
      'Karena bangunan kiri-kanan menempel langsung ke tepi jalan (tanpa ruang pelebaran maupun trotoar), kendaraan singgah dialihkan ke kantong parkir off-street KPAD/Pasar (262-296 m) dan teluk drop-off Timur (186-214 m), disertai jadwal bongkar muat di luar jam sibuk sehingga hambatan samping turun drastis.'
  },
  sk2: {
    key: 'sk2',
    code: '2',
    shortName: 'Satu Arah Bergantian',
    title: 'Skenario 2 (Rekayasa Satu Arah Bergantian Jam Sibuk + Petugas)',
    subtitle: 'Kombinasi Skenario 1 + satu arah Pagi biru (Girang → Hilir) / Sore oranye (Hilir → Girang) + pengawasan petugas',
    defaultParams: { lam: VOLUME_PRESETS.realPeak.lam, pStop: 2, stopDur: 12 },
    twoWay: false,
    hasSidewalk: false,
    hasOffstreet: true,
    hasNoStopSign: true,
    effectiveCapacitySmp: 1120,
    simpyBenchmark: { wait: 1, maxq: 4, thr: 538 },
    insight:
      'Seluruh lebar efektif 3,8 m yang diapit langsung bangunan kiri-kanan difokuskan untuk satu arah arus dominan jam sibuk tanpa parkir badan jalan. Konflik berpapasan hilang sepenuhnya sehingga waktu tunggu SimPy CRN turun 99,8% (534 → 1 dtk) tanpa pelebaran jalan.'
  }
};

/**
 * Komposisi armada mengacu pada data BPS Prov. Jabar (2024: 71,24% motor di Kota Bandung)
 * & survei moda kampus JPR ITS (2024): 75% sepeda motor, 16% mobil penumpang, 5% angkot, 4% boks muat.
 * Kecepatan bebas ruas lokal sempit 3,8 m terkalibrasi pada 5,8-8,2 m/s (21-30 km/jam),
 * selaras dengan rata-rata lalu lintas Kota Bandung 18,5 km/jam (FPIPS UPI / TomTom Traffic Index).
 */
export const VEHICLE_PROFILES: VehicleProfile[] = [
  {
    kind: 'Motor',
    lengthM: 2.0,
    widthM: 0.72,
    heightM: 1.25,
    maxSpeedMs: 8.2,
    emp: 0.4,
    weight: 0.75,
    palette: [0x1f2937, 0x991b1b, 0x1d4ed8, 0x0f766e, 0xf8fafc]
  },
  {
    kind: 'Mobil',
    lengthM: 4.3,
    widthM: 1.78,
    heightM: 1.48,
    maxSpeedMs: 7.0,
    emp: 1.0,
    weight: 0.16,
    palette: [0xf1f5f9, 0x334155, 0x1e3a5f, 0x64748b, 0x7f1d1d]
  },
  {
    kind: 'Angkot',
    lengthM: 4.1,
    widthM: 1.68,
    heightM: 1.85,
    maxSpeedMs: 6.4,
    emp: 1.0,
    weight: 0.05,
    palette: [0x0284c7, 0x0d9488]
  },
  {
    kind: 'Boks Muat',
    lengthM: 5.4,
    widthM: 2.02,
    heightM: 2.45,
    maxSpeedMs: 5.8,
    emp: 1.2,
    weight: 0.04,
    palette: [0xd97706, 0xeab308]
  }
];

/** Rata-rata tertimbang emp per kendaraan fisik (0,558 smp/kend.) */
export const AVERAGE_EMP = VEHICLE_PROFILES.reduce((sum, p) => sum + p.weight * p.emp, 0);

/**
 * Hasil benchmark SimPy CRN multi-kelas (scripts/sim_gagerkalong_v2.py):
 * 10 replikasi × 2 jam (warm-up 10 menit), λ = 540 kend./jam (75% motor, 25% roda 4).
 */
export const SIMPY_BENCHMARK_SERIES = {
  labels: ['Baseline', 'Skenario 1', 'Skenario 2'],
  wait: { label: 'Waktu Tunggu (detik)', values: [534, 52, 1], unit: 'dtk' },
  maxq: { label: 'Antrean Maks (kendaraan)', values: [156, 27, 4], unit: 'kend.' },
  thr: { label: 'Kendaraan Keluar (/jam)', values: [468, 537, 538], unit: 'kend./jam' }
} as const;

/**
 * Preset kamera terkalibrasi pada koordinat penuh 636,4 m (berpusat di x = 0 dekat Pasar):
 * - Simpang Girang (Utara, 0 m): x ≈ -315, y = 26 m
 * - Pasar Gegerkalong (Tengah, 347-375 m): x ≈ +35, y = 14 m
 * - Simpang Hilir (Selatan, 636 m): x ≈ +315, y = 0 m
 */
export const CAMERA_PRESETS: Record<CameraPresetKey, CameraPreset> = {
  isometric: {
    key: 'isometric',
    label: 'Isometrik',
    position: [-54, 96, 146],
    target: [24, 14, 2]
  },
  girang: {
    key: 'girang',
    label: 'Simpang Girang',
    position: [-372, 74, 78],
    target: [-275, 25, -8]
  },
  pasar: {
    key: 'pasar',
    label: 'Pasar & Parkir',
    position: [-26, 68, 128],
    target: [34, 14, 18]
  },
  hilir: {
    key: 'hilir',
    label: 'Simpang Hilir',
    position: [262, 62, 102],
    target: [315, 1, 6]
  },
  topdown: {
    key: 'topdown',
    label: 'Denah Peta OSM',
    position: [0, 880, 44],
    target: [0, 12, 0]
  }
};
