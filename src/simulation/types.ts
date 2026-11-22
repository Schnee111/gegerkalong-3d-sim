import type { OneWayDirection, ScenarioKey } from '../config/scenarios';

export type StopType = 'none' | 'onstreet' | 'dropoff' | 'parking';
export type StopPhase = 'none' | 'approaching' | 'stopped' | 'done';

export interface SimulationParams {
  lam: number;     // kendaraan/jam
  pStop: number;   // persen (0-40)
  stopDur: number; // detik
}

export interface VehicleAgent {
  id: number;
  kind: 'Mobil' | 'Angkot' | 'Motor' | 'Boks Muat';
  colorHex: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  maxSpeedMs: number;
  speedMs: number;
  dir: 1 | -1;
  lane: 1 | -1;
  xM: number;      // 0..355 (relative to Simpang Girang)
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
  throughputPerHour: number;
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
  oneWayDir: OneWayDirection;
  params: SimulationParams;
  vehicles: readonly VehicleAgent[];
  pedestrians: readonly PedestrianAgent[];
  metrics: SimulationMetrics;
  history: readonly HistoryPoint[];
}
