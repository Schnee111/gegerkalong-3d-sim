export type ScenarioKey = 'baseline' | 'sk1' | 'sk2';
export type OneWayDirection = 1 | -1; // 1 = Pagi (Girang -> Hilir), -1 = Sore (Hilir -> Girang)
export type CameraPresetKey = 'isometric' | 'girang' | 'pasar' | 'topdown';

export interface ScenarioConfig {
  key: ScenarioKey;
  code: string;
  shortName: string;
  title: string;
  subtitle: string;
  defaultParams: {
    lam: number;     // kendaraan/jam
    pStop: number;   // persen (0-40)
    stopDur: number; // detik rata-rata
  };
  twoWay: boolean;
  hasSidewalk: boolean;
  hasOffstreet: boolean;
  hasNoStopSign: boolean;
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
  weight: number;
  palette: number[];
}

export interface CameraPreset {
  key: CameraPresetKey;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

/**
 * Skala dunia 3D: 1 unit = 1 meter, berbasis koordinat nyata OpenStreetMap (Way 125178979).
 * Koridor sepanjang 355 m mengikuti kurva S dan elevasi asli Bandung Utara (turun 12 m dari Utara ke Selatan).
 * Simpang Gegerkalong Girang berada di distM = 0 m (x ≈ -174, y ≈ 12 m).
 * Zona Pasar Gegerkalong berada di distM = 282-345 m (x ≈ +110..+165, y ≈ 1-3 m).
 */
export const CORRIDOR = {
  lengthM: 355,
  halfLengthM: 177.5,
  roadWidthM: 3.8, // lebar aspal riil 3,8 m (sesuai LKM-2 & OSM Way 125178979)
  laneOffsetZ: 0.82,
  sidewalkWidthM: 1.25,
  dropoffBay: {
    startM: 120,
    endM: 162,
    centerX: -177.5 + 141,
    bayZ: -3.6
  },
  parkingLot: {
    startM: 248,
    endM: 286,
    centerX: -177.5 + 267,
    bayZ: 3.8
  },
  pasar: {
    startM: 286,
    endM: 344,
    centerX: -177.5 + 315
  }
} as const;

export const SCENARIOS: Record<ScenarioKey, ScenarioConfig> = {
  baseline: {
    key: 'baseline',
    code: '0',
    shortName: 'Baseline',
    title: 'Kondisi Eksisting (Dua Arah + Parkir Badan Jalan)',
    subtitle: 'Ruas sempit 3-4 m tanpa trotoar, hambatan samping 20% (30-50 dtk)',
    defaultParams: { lam: 350, pStop: 20, stopDur: 40 },
    twoWay: true,
    hasSidewalk: false,
    hasOffstreet: false,
    hasNoStopSign: false,
    simpyBenchmark: { wait: 404, maxq: 85, thr: 322 },
    insight:
      'Kendaraan parkir dan bongkar muat di badan jalan menyempitkan lebar efektif ruas 3-4 m. Arus dua arah saling tertahan pada koridor berkelok yang menurun menuju Pasar Gegerkalong, memicu antrean hingga Simpang Girang.'
  },
  sk1: {
    key: 'sk1',
    code: '1',
    shortName: 'Drop-Off & Parkir',
    title: 'Skenario 1 (Zona Drop-Off & Parkir Luar Badan Jalan)',
    subtitle: 'Trotoar aktif, zona drop-off & parkir khusus, rambu larangan berhenti',
    defaultParams: { lam: 350, pStop: 8, stopDur: 25 },
    twoWay: true,
    hasSidewalk: true,
    hasOffstreet: true,
    hasNoStopSign: true,
    simpyBenchmark: { wait: 8, maxq: 9, thr: 358 },
    insight:
      'Kendaraan yang singgah diarahkan ke teluk drop-off dan kantong parkir khusus sebelum zona Pasar Gegerkalong. Badan jalan bebas hambatan samping, trotoar melindungi pejalan kaki, dan waktu tunggu turun drastis.'
  },
  sk2: {
    key: 'sk2',
    code: '2',
    shortName: 'Satu Arah Bergantian',
    title: 'Skenario 2 (Rekayasa Satu Arah Bergantian Jam Sibuk)',
    subtitle: 'Kombinasi Skenario 1 + arus satu arah pagi (Girang ke Hilir) / sore (sebaliknya)',
    defaultParams: { lam: 350, pStop: 4, stopDur: 20 },
    twoWay: false,
    hasSidewalk: true,
    hasOffstreet: true,
    hasNoStopSign: true,
    simpyBenchmark: { wait: 3, maxq: 6, thr: 361 },
    insight:
      'Seluruh lebar koridor difokuskan untuk satu arah arus dominan pada jam sibuk. Konflik berpapasan pada tikungan sempit Gegerkalong Tengah hilang sepenuhnya sehingga kapasitas keluar meningkat optimal.'
  }
};

export const VEHICLE_PROFILES: VehicleProfile[] = [
  {
    kind: 'Motor',
    lengthM: 2.0,
    widthM: 0.72,
    heightM: 1.25,
    maxSpeedMs: 11.2,
    weight: 0.71, // BPS Kota Bandung 2024: sepeda motor (71,24%)
    palette: [0x1f2937, 0x991b1b, 0x1d4ed8, 0x0f766e, 0xf8fafc]
  },
  {
    kind: 'Mobil',
    lengthM: 4.3,
    widthM: 1.78,
    heightM: 1.48,
    maxSpeedMs: 9.8,
    weight: 0.18, // BPS Kota Bandung 2024: mobil pribadi
    palette: [0xf1f5f9, 0x334155, 0x1e3a5f, 0x64748b, 0x7f1d1d]
  },
  {
    kind: 'Angkot',
    lengthM: 4.1,
    widthM: 1.68,
    heightM: 1.85,
    maxSpeedMs: 8.6,
    weight: 0.06, // BPS Kota Bandung 2024: angkutan umum kecil
    palette: [0x0284c7, 0x0d9488]
  },
  {
    kind: 'Boks Muat',
    lengthM: 5.6,
    widthM: 2.05,
    heightM: 2.45,
    maxSpeedMs: 7.4,
    weight: 0.05, // BPS Kota Bandung 2024: truk/boks barang (4,16%)
    palette: [0xd97706, 0xeab308]
  }
];

export const SIMPY_BENCHMARK_SERIES = {
  labels: ['Baseline', 'Skenario 1', 'Skenario 2'],
  wait: { label: 'Waktu Tunggu (detik)', values: [404, 8, 3], unit: 'dtk' },
  maxq: { label: 'Antrean Maks (kendaraan)', values: [85, 9, 6], unit: 'kend.' },
  thr: { label: 'Kendaraan Keluar (/jam)', values: [322, 358, 361], unit: 'kend./jam' }
} as const;

export const CAMERA_PRESETS: Record<CameraPresetKey, CameraPreset> = {
  isometric: {
    key: 'isometric',
    label: 'Isometrik',
    position: [-66, 68, 74],
    target: [10, 5, -2]
  },
  girang: {
    key: 'girang',
    label: 'Simpang Girang',
    position: [-215, 52, 56],
    target: [-138, 12, 2]
  },
  pasar: {
    key: 'pasar',
    label: 'Pasar & Parkir',
    position: [98, 42, 62],
    target: [138, 2, 0]
  },
  topdown: {
    key: 'topdown',
    label: 'Denah Peta OSM',
    position: [0, 270, 18],
    target: [0, 5, -2]
  }
};
