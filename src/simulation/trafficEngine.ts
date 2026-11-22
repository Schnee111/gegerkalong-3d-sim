import {
  CORRIDOR,
  SCENARIOS,
  VEHICLE_PROFILES,
  type OneWayDirection,
  type ScenarioKey,
  type VehicleProfile
} from '../config/scenarios';
import type {
  EngineStateView,
  HistoryPoint,
  PedestrianAgent,
  SimulationMetrics,
  SimulationParams,
  StopType,
  VehicleAgent
} from './types';

const PED_SHIRTS = [0x1d4ed8, 0xb91c1c, 0x047857, 0xd97706, 0x4338ca, 0x0f766e, 0x334155];

export class TrafficEngine {
  private scenario: ScenarioKey = 'baseline';
  private oneWayDir: OneWayDirection = 1;
  private params: SimulationParams = { ...SCENARIOS.baseline.defaultParams };

  private simTimeSec = 0;
  private vehicles: VehicleAgent[] = [];
  private pedestrians: PedestrianAgent[] = [];
  private nextVehId = 1;

  private waitSamples: number[] = [];
  private servedCount = 0;
  private currentQueue = 0;
  private maxQueue = 0;
  private spillbackQueue = 0;

  private lastHistorySampleSec = -10;
  private history: HistoryPoint[] = [];

  constructor() {
    this.reset();
  }

  public setScenario(key: ScenarioKey): void {
    this.scenario = key;
    this.params = { ...SCENARIOS[key].defaultParams };
    this.reset();
  }

  public setOneWayDirection(dir: OneWayDirection): void {
    this.oneWayDir = dir;
    if (this.scenario === 'sk2') {
      this.reset();
    }
  }

  public updateParams(partial: Partial<SimulationParams>): void {
    this.params = { ...this.params, ...partial };
  }

  public reset(): void {
    this.simTimeSec = 0;
    this.vehicles = [];
    this.nextVehId = 1;
    this.waitSamples = [];
    this.servedCount = 0;
    this.currentQueue = 0;
    this.maxQueue = 0;
    this.spillbackQueue = 0;
    this.lastHistorySampleSec = -10;
    this.history = [];
    this.initPedestrians();

    // Seed dense Bandung Utara rush-hour traffic (71% motorcycles, equivalent to ~350 smp/hr = ~790 units/hr)
    const cfg = SCENARIOS[this.scenario];
    const mainDir = cfg.twoWay ? 1 : this.oneWayDir;

    if (this.scenario === 'baseline') {
      // Active on-street unloading right at Pasar Gegerkalong (312 m) & ruko zone (168 m)
      this.spawnActiveOnStreetBlocker(1, 312, true);
      this.spawnActiveOnStreetBlocker(-1, 168, false);

      // Visible bumper-to-bumper rush-hour queue already stacking behind Pasar bottleneck (224..304 m)
      for (let i = 0; i < 14; i++) {
        this.spawnVehicle(1, 303 - i * 5.6);
      }
      // Dense upstream platoon approaching from Simpang Girang (12..210 m)
      for (let i = 0; i < 14; i++) {
        this.spawnVehicle(1, 14 + i * 14.2);
      }
      // Opposing South -> North rush-hour stream squeezing against the bottleneck
      for (let i = 0; i < 12; i++) {
        this.spawnVehicle(-1, 32 + i * 28);
      }
    } else {
      // Same dense rush-hour volume flowing smoothly in Skenario 1 & Skenario 2!
      for (let i = 0; i < 22; i++) {
        this.spawnVehicle(mainDir, 10 + i * 15.8);
      }
      if (cfg.twoWay) {
        for (let i = 0; i < 10; i++) {
          this.spawnVehicle(-1, 22 + i * 33);
        }
      }
    }
    this.sampleHistory();
  }

  public step(dt: number): void {
    const cfg = SCENARIOS[this.scenario];
    this.simTimeSec += dt;

    // 1. Poisson arrivals (MKJI/PKJI conversion: 350 smp/hr with 71% motorcycles ≈ 790 physical units/hr)
    const lamPerSec = (this.params.lam * 2.25) / 3600;
    const mainDir: 1 | -1 = cfg.twoWay ? 1 : this.oneWayDir;
    const mainRate = cfg.twoWay ? lamPerSec * 0.68 : lamPerSec;
    const oppRate = cfg.twoWay ? lamPerSec * 0.32 : 0;

    if (Math.random() < mainRate * dt) {
      this.spillbackQueue += 1;
    }

    // Release from spillback into corridor entry if space is clear
    if (this.spillbackQueue > 0) {
      const entryM = mainDir === 1 ? 0 : CORRIDOR.lengthM;
      const canEnter = !cfg.twoWay
        ? ([-1, 1] as const).some(ln => this.isEntryClear(entryM, ln))
        : this.isEntryClear(entryM, mainDir === 1 ? 1 : -1);

      if (canEnter) {
        this.spawnVehicle(mainDir);
        this.spillbackQueue -= 1;
      }
    }

    if (oppRate > 0 && Math.random() < oppRate * dt) {
      const entryM = CORRIDOR.lengthM;
      if (this.isEntryClear(entryM, -1)) {
        this.spawnVehicle(-1);
      }
    }

    // 2. Microscopic car-following + side-friction dynamics
    let activeQueue = this.spillbackQueue;
    const onStreetBlockers = this.vehicles.filter(
      v => v.stopType === 'onstreet' && v.stopPhase === 'stopped'
    );

    for (const v of this.vehicles) {
      if (v.stopPhase === 'approaching' && Math.abs(v.xM - v.stopTargetM) < 2.2) {
        v.stopPhase = 'stopped';
        v.speedMs = 0;
        v.stopTimerSec = v.stopDurationSec;
      }

      if (v.stopPhase === 'stopped') {
        v.speedMs = 0;
        v.stopTimerSec -= dt;
        // Lateral animation into off-street bay or curb shoulder
        const targetZ =
          v.stopType === 'dropoff'
            ? CORRIDOR.dropoffBay.bayZ - v.lane * CORRIDOR.laneOffsetZ
            : v.stopType === 'parking'
            ? CORRIDOR.parkingLot.bayZ - v.lane * CORRIDOR.laneOffsetZ
            : v.lane === 1
            ? 0.55
            : -0.55;
        v.zOffsetM += (targetZ - v.zOffsetM) * Math.min(1, dt * 4.5);

        if (v.stopTimerSec <= 0) {
          v.stopPhase = 'done';
        }
        v.inQueue = false;
        continue;
      }

      // Compute desired speed & realistic 3.8 m narrow-street passing/squeezing behavior
      let desiredSpeed = v.maxSpeedMs * (cfg.twoWay ? 0.88 : 1.12);
      let minGap = 999;
      let leaderSpeed = desiredSpeed;
      let headOnSqueeze = false;

      for (const other of this.vehicles) {
        if (other === v) continue;
        if (
          other.stopPhase === 'stopped' &&
          (other.stopType === 'dropoff' || other.stopType === 'parking')
        ) {
          continue;
        }

        const sameLane = other.lane === v.lane;
        const opposing = cfg.twoWay && other.dir !== v.dir;
        const narrowRoadFriction =
          cfg.twoWay &&
          !cfg.hasOffstreet &&
          other.stopType === 'onstreet' &&
          other.stopPhase === 'stopped';

        const gap = (other.xM - v.xM) * v.dir - (other.lengthM * 0.5 + v.lengthM * 0.5);

        // On real 3.8 m Jalan Gegerkalong Tengah, two opposing 4-wheelers must crawl & squeeze onto shoulder!
        if (opposing && gap > -3 && gap < 13 && v.kind !== 'Motor' && other.kind !== 'Motor') {
          headOnSqueeze = true;
          desiredSpeed = Math.min(desiredSpeed, 1.85);
        }

        if (!sameLane && !narrowRoadFriction) continue;

        if (gap > 0 && gap < minGap) {
          if (sameLane) {
            minGap = gap;
            leaderSpeed = other.speedMs;
          } else if (narrowRoadFriction && gap < 16) {
            desiredSpeed = Math.min(desiredSpeed, 0.75);
          }
        }
      }

      // Smooth lateral positioning:
      // - In One-Way (Skenario 2): 4-wheelers cruise down the center of the 3.8 m road!
      // - In Two-Way: opposing cars squeeze slightly outward (+0.38 m onto gutter) so they never clip!
      const cruiseZ = !cfg.twoWay
        ? v.kind === 'Motor'
          ? 0
          : -v.lane * CORRIDOR.laneOffsetZ * 0.82
        : headOnSqueeze
        ? (v.lane > 0 ? 0.38 : -0.38)
        : 0;
      v.zOffsetM += (cruiseZ - v.zOffsetM) * Math.min(1, dt * 4.5);

      // Pedestrian crowd friction when no sidewalk exists (Baseline): vehicles must crawl past shoppers on the asphalt edge!
      if (!cfg.hasSidewalk) {
        const inPasarZone = v.xM >= 285 && v.xM <= 342;
        for (const ped of this.pedestrians) {
          const pedGap = (ped.xM - v.xM) * v.dir;
          if (pedGap > -1.5 && pedGap < 7.5) {
            desiredSpeed = Math.min(desiredSpeed, inPasarZone ? 2.1 : 3.2);
            break;
          }
        }
      }

      // Bottleneck spillback friction near Simpang Girang when road is obstructed in Baseline
      if (this.scenario === 'baseline' && v.dir === 1 && onStreetBlockers.length > 0 && v.xM < 65) {
        desiredSpeed = Math.min(desiredSpeed, 4.4);
      }

      const minBumper = v.kind === 'Motor' ? 1.15 : 1.85;
      const safeGap = minBumper + 0.65 + v.speedMs * 0.72;
      if (minGap < minBumper) {
        desiredSpeed = 0;
      } else if (minGap < safeGap + 9) {
        const ratio = Math.max(0, (minGap - minBumper) / (safeGap + 6));
        desiredSpeed = Math.min(desiredSpeed, leaderSpeed + (desiredSpeed - leaderSpeed) * ratio * 0.72);
      }

      const accel = desiredSpeed > v.speedMs ? 3.1 : 6.6;
      if (v.speedMs < desiredSpeed) {
        v.speedMs = Math.min(desiredSpeed, v.speedMs + accel * dt);
      } else {
        v.speedMs = Math.max(desiredSpeed, v.speedMs - accel * dt);
      }

      v.xM += v.dir * v.speedMs * dt;

      if (v.speedMs < 1.5) {
        v.inQueue = true;
        v.waitSec += dt;
        activeQueue += 1;
      } else {
        v.inQueue = false;
      }
    }

    // 3. Remove exited vehicles and record samples
    const stillActive: VehicleAgent[] = [];
    for (const v of this.vehicles) {
      const exited = (v.dir === 1 && v.xM > CORRIDOR.lengthM + 8) || (v.dir === -1 && v.xM < -8);
      if (exited) {
        this.servedCount += 1;
        this.waitSamples.push(v.waitSec);
        if (this.waitSamples.length > 240) this.waitSamples.shift();
      } else {
        stillActive.push(v);
      }
    }
    this.vehicles = stillActive;

    this.currentQueue = activeQueue;
    if (activeQueue > this.maxQueue) {
      this.maxQueue = activeQueue;
    }

    // 4. Move pedestrians
    for (const p of this.pedestrians) {
      p.xM += p.dir * p.speedMs * dt;
      if (p.xM > CORRIDOR.lengthM - 6) p.dir = -1;
      if (p.xM < 6) p.dir = 1;
    }

    // 5. History sampling every 5 simulated seconds
    if (this.simTimeSec - this.lastHistorySampleSec >= 5) {
      this.sampleHistory();
    }
  }

  public getStateView(): EngineStateView {
    return {
      scenario: this.scenario,
      oneWayDir: this.oneWayDir,
      params: { ...this.params },
      vehicles: this.vehicles,
      pedestrians: this.pedestrians,
      metrics: this.computeMetrics(),
      history: this.history
    };
  }

  public getVehicleById(id: number): VehicleAgent | undefined {
    return this.vehicles.find(v => v.id === id);
  }

  private initPedestrians(): void {
    this.pedestrians = [];
    for (let i = 0; i < 24; i++) {
      // Cluster 10 shoppers right along Pasar Gegerkalong frontage (286-342 m), 14 along ruko & kos corridor
      const isPasarCrowd = i < 10;
      const xM = isPasarCrowd
        ? 286 + Math.random() * 54
        : 12 + Math.random() * 270;
      this.pedestrians.push({
        id: i + 1,
        xM,
        dir: Math.random() < 0.5 ? 1 : -1,
        speedMs: isPasarCrowd ? 0.8 + Math.random() * 0.35 : 1.05 + Math.random() * 0.45,
        lateralJitterM: (Math.random() - 0.5) * 0.7,
        shirtHex: PED_SHIRTS[i % PED_SHIRTS.length]
      });
    }
  }


  private spawnActiveOnStreetBlocker(dir: 1 | -1, xM: number, isBoxTruck: boolean): void {
    const profile = VEHICLE_PROFILES.find(p => p.kind === (isBoxTruck ? 'Boks Muat' : 'Mobil')) ?? VEHICLE_PROFILES[0];
    const lane: 1 | -1 = dir === 1 ? 1 : -1;
    this.vehicles.push({
      id: this.nextVehId++,
      kind: profile.kind,
      colorHex: profile.palette[0],
      lengthM: profile.lengthM,
      widthM: profile.widthM,
      heightM: profile.heightM,
      maxSpeedMs: profile.maxSpeedMs,
      speedMs: 0,
      dir,
      lane,
      xM,
      zOffsetM: lane === 1 ? 0.55 : -0.55,
      stopType: 'onstreet',
      stopTargetM: xM,
      stopPhase: 'stopped',
      stopTimerSec: this.params.stopDur,
      stopDurationSec: this.params.stopDur,
      waitSec: 0,
      inQueue: false
    });
  }

  private isEntryClear(entryM: number, lane: 1 | -1): boolean {
    return !this.vehicles.some(
      v => v.lane === lane && v.stopPhase !== 'stopped' && Math.abs(v.xM - entryM) < 5.8
    );
  }

  private pickProfile(preferBox: boolean): VehicleProfile {
    if (preferBox) return VEHICLE_PROFILES.find(p => p.kind === 'Boks Muat') ?? VEHICLE_PROFILES[0];
    const r = Math.random();
    let acc = 0;
    for (const profile of VEHICLE_PROFILES) {
      acc += profile.weight;
      if (r <= acc) return profile;
    }
    return VEHICLE_PROFILES[0];
  }

  private spawnVehicle(dir: 1 | -1, customXM?: number): void {
    const cfg = SCENARIOS[this.scenario];
    const willStop = Math.random() < this.params.pStop / 100;
    const profile = this.pickProfile(willStop && Math.random() < 0.18);
    const startM = customXM !== undefined ? customXM : dir === 1 ? -4 : CORRIDOR.lengthM + 4;

    let stopType: StopType = 'none';
    let stopTargetM = -1;
    if (willStop) {
      if (!cfg.hasOffstreet) {
        stopType = 'onstreet';
        // 60% of on-street parking/unloading concentrates right in front of Pasar Gegerkalong (288-338 m)
        stopTargetM = Math.random() < 0.6 ? 288 + Math.random() * 50 : 65 + Math.random() * 205;
      } else if (Math.random() < 0.5) {
        stopType = 'dropoff';
        stopTargetM =
          CORRIDOR.dropoffBay.startM +
          6 +
          Math.random() * (CORRIDOR.dropoffBay.endM - CORRIDOR.dropoffBay.startM - 12);
      } else {
        stopType = 'parking';
        stopTargetM =
          CORRIDOR.parkingLot.startM +
          8 +
          Math.random() * (CORRIDOR.parkingLot.endM - CORRIDOR.parkingLot.startM - 16);
      }
    }

    let lane: 1 | -1 = dir === 1 ? 1 : -1;
    if (!cfg.twoWay) {
      lane = this.isEntryClear(startM, 1) && Math.random() < 0.5 ? 1 : -1;
    }

    const stopDurationSec = willStop
      ? Math.max(8, this.params.stopDur * (0.75 + Math.random() * 0.5))
      : 0;
    const colorHex = profile.palette[Math.floor(Math.random() * profile.palette.length)];

    this.vehicles.push({
      id: this.nextVehId++,
      kind: profile.kind,
      colorHex,
      lengthM: profile.lengthM,
      widthM: profile.widthM,
      heightM: profile.heightM,
      maxSpeedMs: profile.maxSpeedMs,
      speedMs: profile.maxSpeedMs * 0.72,
      dir,
      lane,
      xM: startM,
      zOffsetM: 0,
      stopType,
      stopTargetM,
      stopPhase: willStop ? 'approaching' : 'none',
      stopTimerSec: 0,
      stopDurationSec,
      waitSec: 0,
      inQueue: false
    });
  }

  private sampleHistory(): void {
    this.lastHistorySampleSec = this.simTimeSec;
    this.history.push({
      clockLabel: this.formatClock(this.simTimeSec),
      queue: this.currentQueue,
      avgWait: Number(this.getAvgWaitSec().toFixed(1))
    });
    if (this.history.length > 36) {
      this.history.shift();
    }
  }

  private getAvgWaitSec(): number {
    const liveWaits = this.vehicles.filter(v => v.waitSec > 0).map(v => v.waitSec);
    const all = this.waitSamples.concat(liveWaits);
    if (all.length === 0) return 0;
    return all.reduce((a, b) => a + b, 0) / all.length;
  }

  private computeMetrics(): SimulationMetrics {
    const avgWaitSec = this.getAvgWaitSec();
    const throughputPerHour =
      this.simTimeSec < 5 ? 0 : Math.round((this.servedCount / this.simTimeSec) * 3600);

    let losGrade: 'A-B' | 'C-D' | 'E-F' = 'A-B';
    let statusLabel = 'Lancar';
    if (this.currentQueue >= 16 || avgWaitSec >= 50) {
      losGrade = 'E-F';
      statusLabel = 'Macet / Meluber';
    } else if (this.currentQueue >= 7 || avgWaitSec >= 18) {
      losGrade = 'C-D';
      statusLabel = 'Padat Merayap';
    }

    return {
      simTimeSec: this.simTimeSec,
      clockLabel: this.formatClock(this.simTimeSec),
      avgWaitSec,
      currentQueue: this.currentQueue,
      maxQueue: this.maxQueue,
      spillbackQueue: this.spillbackQueue,
      throughputPerHour,
      servedCount: this.servedCount,
      activeVehicles: this.vehicles.length,
      losGrade,
      statusLabel
    };
  }

  private formatClock(sec: number): string {
    const base = 7 * 3600 + Math.floor(sec);
    const h = Math.floor(base / 3600) % 24;
    const m = Math.floor((base % 3600) / 60);
    const s = base % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
}
