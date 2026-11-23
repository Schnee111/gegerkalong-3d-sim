import type { OneWayDirection, ScenarioKey, VolumePresetKey } from '../config/scenarios';

export type StopType = 'none' | 'onstreet' | 'dropoff' | 'parking';
export type StopPhase = 'none' | 'approaching' | 'stopped' | 'done';

export interface SimulationParams {
  lam: number;      // kendaraan fisik/jam
  motorPct: number; // persen sepeda motor (0-100)
  pStop: number;    // persen (0-40)
  stopDur: number;  // detik rata-rata
}

export interface VehicleAgent {
  id: number;
  kind: 'Mobil' | 'Angkot' | 'Motor' | 'Boks Muat';
  colorHex: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  maxSpeedMs: number;
  emp: number;
  speedMs: number;
  dir: 1 | -1;  // 1 = Selatan (Girang -> Pasar), -1 = Utara (Pasar -> Girang)
  lane: 1 | -1; // Indonesia Lajur Kiri: -1 = Timur (-Z, kiri saat ke Selatan), +1 = Barat (+Z, kiri saat ke Utara)
  xM: number;   // 0..355 (relatif terhadap Simpang Girang)
  zOffsetM: number;
  stopType: StopType;
  stopTargetM: number;
  stopPhase: StopPhase;
  stopTimerSec: number;
  stopDurationSec: number;
  waitSec: number;
  inQueue: boolean;
}

export interface PedestrianAgent {
  id: number;
  xM: number;
  dir: 1 | -1;
  /** Sisi jalan: -1 = Timur (-Z), +1 = Barat (+Z) */
  side: -1 | 1;
  speedMs: number;
  lateralJitterM: number;
  shirtHex: number;
}

export interface HistoryPoint {
  clockLabel: string;
  queue: number;
  avgWait: number;
}

export interface SimulationMetrics {
  simTimeSec: number;
  clockLabel: string;
  avgWaitSec: number;
  currentQueue: number;
  maxQueue: number;
  spillbackQueue: number;
  spillbackOriginLabel: string;
  throughputPerHour: number;
  throughputSmpPerHour: number;
  demandSmpPerHour: number;
  degreeOfSaturation: number;
  servedCount: number;
  activeVehicles: number;
  losGrade: 'A-B' | 'C-D' | 'E-F';
  statusLabel: string;
}

export interface SnapshotRecord {
  id: number;
  scenarioKey: ScenarioKey;
  scenarioLabel: string;
  directionLabel: string;
  params: SimulationParams;
  avgWaitSec: number;
  maxQueue: number;
  throughputPerHour: number;
}

export interface EngineStateView {
  scenario: ScenarioKey;
  volumePreset: VolumePresetKey;
  oneWayDir: OneWayDirection;
  params: SimulationParams;
  vehicles: readonly VehicleAgent[];
  pedestrians: readonly PedestrianAgent[];
  metrics: SimulationMetrics;
  history: readonly HistoryPoint[];
  historyVersion: number;
}
