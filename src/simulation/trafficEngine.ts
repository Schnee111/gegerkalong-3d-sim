import {
  AVERAGE_EMP,
  BASELINE_STATIC_OBSTACLES,
  CORRIDOR,
  SCENARIOS,
  VEHICLE_PROFILES,
  VOLUME_PRESETS,
  type OneWayDirection,
  type ScenarioKey,
  type VehicleProfile,
  type VolumePresetKey
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
const MAX_SPILLBACK_BUFFER = 160;

export class TrafficEngine {
  private scenario: ScenarioKey = 'baseline';
  private volumePreset: VolumePresetKey = 'realPeak';
  private oneWayDir: OneWayDirection = 1;
  private params: SimulationParams = { ...SCENARIOS.baseline.defaultParams };

  private simTimeSec = 0;
  private vehicles: VehicleAgent[] = [];
  private pedestrians: PedestrianAgent[] = [];
  private nextVehId = 1;

  private waitSamples: number[] = [];
  private servedCount = 0;
  private servedEmpSum = 0;
  private currentQueue = 0;
  private maxQueue = 0;
  private mainSpillbackArrivals: number[] = [];
  private oppSpillbackArrivals: number[] = [];

  private lastHistorySampleSec = -10;
  private history: HistoryPoint[] = [];
  private historyVersion = 0;

  constructor() {
    this.reset();
  }

  public setScenario(key: ScenarioKey): void {
    this.scenario = key;
    const presetLam = VOLUME_PRESETS[this.volumePreset].lam;
    this.params = {
      ...SCENARIOS[key].defaultParams,
      lam: presetLam
    };
    this.reset();
  }

  public setVolumePreset(preset: VolumePresetKey): void {
    this.volumePreset = preset;
    this.params = {
      ...SCENARIOS[this.scenario].defaultParams,
      lam: VOLUME_PRESETS[preset].lam
    };
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
    this.servedEmpSum = 0;
    this.currentQueue = 0;
    this.maxQueue = 0;
    this.mainSpillbackArrivals = [];
    this.oppSpillbackArrivals = [];
    this.lastHistorySampleSec = -10;
    this.history = [];
    this.initPedestrians();

    const cfg = SCENARIOS[this.scenario];
    const mainDir: 1 | -1 = cfg.twoWay ? 1 : this.oneWayDir;
    const densityScale = Math.max(0.42, Math.min(1.3, this.params.lam / 850));

    if (this.scenario === 'baseline') {
      // Active on-street unloading at Pasar Gegerkalong (332 m), northern ruko (162 m), & southern ruko (498 m)
      // Left-Hand Traffic: dir=1 (South) uses lane=-1 (East), dir=-1 (North) uses lane=+1 (West)
      this.spawnActiveOnStreetBlocker(1, 332, true);
      this.spawnActiveOnStreetBlocker(-1, 162, false);
      this.spawnActiveOnStreetBlocker(1, 502, false);

      // Visible bumper-to-bumper queue forming behind the Pasar Gegerkalong bottleneck
      const queueCount = Math.round(14 * densityScale);
      for (let i = 0; i < queueCount; i++) {
        this.spawnVehicle(1, 320 - i * 5.8, 18 + i * 2.2, -1);
      }
      // Upstream platoon approaching from Simpang Girang (0..220 m)
      const upstreamCount = Math.round(10 * densityScale);
      for (let i = 0; i < upstreamCount; i++) {
        const xm = 14 + i * 20;
        if (xm < 320 - queueCount * 5.8 - 10) {
          this.spawnVehicle(1, xm, 0, -1);
        }
      }
      // Downstream southbound platoon heading from Pasar toward Simpang Hilir (355..615 m)
      const downstreamCount = Math.round(10 * densityScale);
      for (let i = 0; i < downstreamCount; i++) {
        const xm = 362 + i * 24;
        if (Math.abs(xm - 502) > 10 && xm < CORRIDOR.lengthM - 12) {
          this.spawnVehicle(1, xm, 0, -1);
        }
      }
      // Opposing South -> North stream from Simpang Hilir toward Simpang Girang on West lane (+1)
      const oppCount = Math.round(13 * densityScale);
      for (let i = 0; i < oppCount; i++) {
        const xm = 24 + i * 45;
        if (Math.abs(xm - 162) > 10 && xm < CORRIDOR.lengthM - 12) {
          this.spawnVehicle(-1, xm, 0, 1);
        }
      }
    } else {
      // Little's Law steady-state seeding for full 636 m (L = lambda * W ≈ 21 vehicles at 850/jam, ~9 at 350/jam)
      const totalSteady = Math.max(8, Math.round(21 * densityScale));
      const mainCount = cfg.twoWay ? Math.max(5, Math.round(totalSteady * 0.65)) : totalSteady;
      const spacing = (CORRIDOR.lengthM - 36) / Math.max(1, mainCount);
      for (let i = 0; i < mainCount; i++) {
        const xm = 18 + i * spacing;
        const lane: 1 | -1 = cfg.twoWay ? -1 : i % 2 === 0 ? -1 : 1;
        this.spawnVehicle(mainDir, xm, 0, lane);
      }
      if (cfg.twoWay) {
        const oppCount = Math.max(3, totalSteady - mainCount);
        const oppSpacing = (CORRIDOR.lengthM - 44) / Math.max(1, oppCount);
        for (let i = 0; i < oppCount; i++) {
          this.spawnVehicle(-1, 22 + i * oppSpacing, 0, 1);
        }
      }
    }

    this.sampleHistory();
  }

  public step(dt: number): void {
    const cfg = SCENARIOS[this.scenario];
    this.simTimeSec += dt;

    // 1. Exact physical Poisson arrivals (kend./jam directly matches slider — zero hidden multipliers!)
    const lamPerSec = this.params.lam / 3600;
    const mainDir: 1 | -1 = cfg.twoWay ? 1 : this.oneWayDir;
    // Morning/peak directional split on Gegerkalong Tengah ~65% dominant / 35% opposing
    const mainRate = cfg.twoWay ? lamPerSec * 0.65 : lamPerSec;
    const oppRate = cfg.twoWay ? lamPerSec * 0.35 : 0;

    if (Math.random() < mainRate * dt && this.mainSpillbackArrivals.length < MAX_SPILLBACK_BUFFER) {
      this.mainSpillbackArrivals.push(this.simTimeSec);
    }

    // Release from main FIFO spillback queue into corridor entry if space is clear
    if (this.mainSpillbackArrivals.length > 0) {
      const entryM = mainDir === 1 ? 0 : CORRIDOR.lengthM;
      const chosenLane = this.pickClearEntryLane(entryM, mainDir, cfg.twoWay);
      if (chosenLane !== null) {
        const arrivalTime = this.mainSpillbackArrivals.shift()!;
        const spillWait = Math.max(0, this.simTimeSec - arrivalTime);
        this.spawnVehicle(mainDir, undefined, spillWait, chosenLane);
      }
    }

    if (oppRate > 0) {
      if (Math.random() < oppRate * dt && this.oppSpillbackArrivals.length < MAX_SPILLBACK_BUFFER) {
        this.oppSpillbackArrivals.push(this.simTimeSec);
      }
      if (this.oppSpillbackArrivals.length > 0) {
        const oppEntryM = CORRIDOR.lengthM;
        const oppLane: 1 | -1 = 1; // Left-Hand Traffic: Northbound (-1) uses West lane (+1)
        if (this.isEntryClear(oppEntryM, oppLane)) {
          const arrivalTime = this.oppSpillbackArrivals.shift()!;
          const spillWait = Math.max(0, this.simTimeSec - arrivalTime);
          this.spawnVehicle(-1, undefined, spillWait, oppLane);
        }
      }
    }

    // 2. Microscopic car-following + narrow 3.8 m side-friction dynamics
    let activeQueue = this.mainSpillbackArrivals.length + this.oppSpillbackArrivals.length;
    const onStreetBlockers = this.vehicles.filter(
      v => v.stopType === 'onstreet' && v.stopPhase === 'stopped'
    );

    for (const v of this.vehicles) {
      if (v.stopPhase === 'approaching') {
        const distToStop = (v.stopTargetM - v.xM) * v.dir;
        if (distToStop <= 1.2 && distToStop >= -2.0 && v.speedMs < 2.6) {
          v.stopPhase = 'stopped';
          v.speedMs = 0;
          v.stopTimerSec = v.stopDurationSec;
        } else if (distToStop < -2.5) {
          v.stopPhase = 'done';
        }
      }

      if (v.stopPhase === 'stopped') {
        v.speedMs = 0;
        v.stopTimerSec -= dt;
        const targetZ = this.getStopLateralOffset(v);
        v.zOffsetM += (targetZ - v.zOffsetM) * Math.min(1, dt * 4.2);

        if (v.stopTimerSec <= 0) {
          // Off-street vehicles wait for a safe gap on the carriageway before merging back in!
          const canMerge =
            v.stopType === 'onstreet' || this.isMergeGapClear(v);
          if (canMerge) {
            v.stopPhase = 'done';
          }
        }
        v.inQueue = false;
        continue;
      }

      // Compute desired speed & 3.8 m narrow-street interaction (Left-Hand Traffic)
      let desiredSpeed = v.maxSpeedMs * (cfg.twoWay ? 0.9 : 1.06);
      let minGap = 999;
      let leaderSpeed = desiredSpeed;
      let headOnSqueeze = false;

      // Smoothly decelerate before reaching ANY stop target (prevents sudden brake & rear-end clipping)
      let approachingOffstreet = false;
      if (v.stopPhase === 'approaching') {
        const distToStop = (v.stopTargetM - v.xM) * v.dir;
        if (distToStop > 0 && distToStop < 16) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0.8, distToStop * 0.42));
          if (v.stopType === 'dropoff' || v.stopType === 'parking') {
            approachingOffstreet = true;
          }
        }
      }

      for (const other of this.vehicles) {
        if (other === v) continue;
        // Vehicles safely parked inside off-street drop-off / parking lot do not obstruct carriageway!
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

        // On real 3.8 m Jl. Gegerkalong Tengah, opposing vehicles must crawl & edge onto left shoulder
        if (opposing && gap > -3 && gap < 14) {
          if (v.kind !== 'Motor' && other.kind !== 'Motor') {
            headOnSqueeze = true;
            desiredSpeed = Math.min(desiredSpeed, 1.35);
          } else if (gap < 9 && (v.kind !== 'Motor' || other.kind !== 'Motor')) {
            // Multi-class caution when a car passes an opposing motorcycle on a 3.8 m narrow road
            desiredSpeed = Math.min(desiredSpeed, v.kind === 'Motor' ? 5.2 : 4.2);
          }
        }

        if (!sameLane && !narrowRoadFriction) continue;

        const isStoppedOnStreetMotor =
          other.stopType === 'onstreet' &&
          other.stopPhase === 'stopped' &&
          other.kind === 'Motor';

        if (gap > -0.4 && gap < minGap) {
          if (sameLane) {
            if (isStoppedOnStreetMotor) {
              // A parked scooter narrows the 3.8 m curb rather than completely deadlocking the lane
              if (gap < 11) {
                desiredSpeed = Math.min(desiredSpeed, v.kind === 'Motor' ? 2.4 : 1.15);
              }
            } else {
              minGap = Math.max(0, gap);
              leaderSpeed = other.speedMs;
            }
          } else if (narrowRoadFriction && gap < 22) {
            // Opposing traffic squeezing past an on-street blocker on a 3.8 m narrow street slows sharply
            if (isStoppedOnStreetMotor) {
              desiredSpeed = Math.min(desiredSpeed, v.kind === 'Motor' ? 3.2 : 1.9);
            } else {
              desiredSpeed = Math.min(desiredSpeed, v.kind === 'Motor' ? 0.95 : 0.45);
            }
          }
        }
      }

      // Baseline static pinch-point friction from 15 parked scooters & 3 gerobak PKL along the 3.8 m curb
      let staticPinchNudgeZ = 0;
      if (!cfg.hasOffstreet) {
        for (const obs of BASELINE_STATIC_OBSTACLES) {
          const obsGap = (obs.xM - v.xM) * v.dir;
          if (obsGap > -2.5 && obsGap < 9.5) {
            const sameSide = obs.side === v.lane;
            if (sameSide) {
              const capMs =
                obs.kind === 'gerobak'
                  ? v.kind === 'Motor'
                    ? 3.8
                    : 2.1
                  : v.kind === 'Motor'
                  ? 4.6
                  : 2.8;
              desiredSpeed = Math.min(desiredSpeed, capMs);
              staticPinchNudgeZ = obs.side === -1 ? 0.24 : -0.24;
            } else if (v.kind !== 'Motor') {
              desiredSpeed = Math.min(desiredSpeed, obs.kind === 'gerobak' ? 3.4 : 4.4);
            }
          }
        }
      }

      // Smooth lateral positioning (Lajur Kiri):
      let cruiseZ = staticPinchNudgeZ;
      if (approachingOffstreet) {
        cruiseZ = this.getStopLateralOffset(v) * 0.45;
      } else if (!cfg.twoWay) {
        cruiseZ = v.kind === 'Motor' ? 0 : -v.lane * CORRIDOR.laneOffsetZ * 0.78;
      } else if (headOnSqueeze) {
        cruiseZ = v.lane > 0 ? 0.36 : -0.36;
      }
      v.zOffsetM += (cruiseZ - v.zOffsetM) * Math.min(1, dt * 4.5);

      // Pedestrian side friction: only affects same-side lane, stronger in Baseline (curb blocked by clutter)
      if (!cfg.hasSidewalk) {
        const inPasarZone = v.xM >= CORRIDOR.pasar.frontStartM - 6 && v.xM <= CORRIDOR.pasar.hallEndM + 4;
        for (const ped of this.pedestrians) {
          if (ped.side !== v.lane) continue;
          const pedGap = (ped.xM - v.xM) * v.dir;
          if (pedGap > -1.2 && pedGap < 7.0) {
            if (!cfg.hasOffstreet) {
              // Baseline: parked scooters & gerobak push pedestrians onto the 3.8 m asphalt
              desiredSpeed = Math.min(desiredSpeed, inPasarZone ? 1.8 : 2.9);
            } else if (inPasarZone) {
              // Skenario 1 & 2: curb clear of illegal parking, mild caution only around Pasar crowd
              desiredSpeed = Math.min(desiredSpeed, v.kind === 'Motor' ? 5.4 : 4.2);
            }
            break;
          }
        }
      }

      // Upstream friction near Simpang Girang when corridor has active on-street blockers
      if (this.scenario === 'baseline' && v.dir === 1 && onStreetBlockers.length > 0 && v.xM < 85) {
        desiredSpeed = Math.min(desiredSpeed, 3.2);
      }

      const minBumper = v.kind === 'Motor' ? 1.25 : 1.95;
      const safeGap = minBumper + 0.75 + v.speedMs * 0.78;
      if (minGap < minBumper) {
        desiredSpeed = 0;
      } else if (minGap < safeGap + 9) {
        const ratio = Math.max(0, (minGap - minBumper) / (safeGap + 6));
        desiredSpeed = Math.min(desiredSpeed, leaderSpeed + (desiredSpeed - leaderSpeed) * ratio * 0.72);
      }

      const accel = desiredSpeed > v.speedMs ? 2.8 : 6.8;
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
        this.servedEmpSum += v.emp;
        this.waitSamples.push(v.waitSec);
        if (this.waitSamples.length > 260) this.waitSamples.shift();
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
      if (p.xM > CORRIDOR.lengthM - 5) p.dir = -1;
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
      volumePreset: this.volumePreset,
      oneWayDir: this.oneWayDir,
      params: { ...this.params },
      vehicles: this.vehicles,
      pedestrians: this.pedestrians,
      metrics: this.computeMetrics(),
      history: this.history,
      historyVersion: this.historyVersion
    };
  }

  public getVehicleById(id: number): VehicleAgent | undefined {
    return this.vehicles.find(v => v.id === id);
  }

  private getStopLateralOffset(v: VehicleAgent): number {
    if (v.stopType === 'dropoff') {
      return CORRIDOR.dropoffBay.bayZ - v.lane * CORRIDOR.laneOffsetZ;
    }
    if (v.stopType === 'parking') {
      return CORRIDOR.parkingLot.bayZ - v.lane * CORRIDOR.laneOffsetZ;
    }
    // On-street pull-over toward each vehicle's own left curb (East -Z for lane=-1, West +Z for lane=+1)
    return v.lane === -1 ? -0.55 : 0.55;
  }

  private pickClearEntryLane(entryM: number, dir: 1 | -1, twoWay: boolean): (1 | -1) | null {
    if (twoWay) {
      // Indonesian Left-Hand Traffic: dir=1 (South) -> lane=-1 (East), dir=-1 (North) -> lane=+1 (West)
      const lane: 1 | -1 = dir === 1 ? -1 : 1;
      return this.isEntryClear(entryM, lane) ? lane : null;
    }
    const leftClear = this.isEntryClear(entryM, -1);
    const rightClear = this.isEntryClear(entryM, 1);
    if (leftClear && rightClear) {
      return Math.random() < 0.5 ? -1 : 1;
    }
    if (leftClear) return -1;
    if (rightClear) return 1;
    return null;
  }

  private isMergeGapClear(v: VehicleAgent): boolean {
    return !this.vehicles.some(other => {
      if (other === v || other.lane !== v.lane) return false;
      if (other.stopPhase === 'stopped' && other.stopType !== 'onstreet') return false;
      const clearance = (other.lengthM + v.lengthM) * 0.5 + 3.2;
      return Math.abs(other.xM - v.xM) < clearance;
    });
  }

  private initPedestrians(): void {
    this.pedestrians = [];
    for (let i = 0; i < 36; i++) {
      // Cluster 12 shoppers around Pasar Gegerkalong (314-370 m), 14 north (12-308 m), 10 south (375-624 m)
      const isPasarCrowd = i < 12;
      const isNorth = i >= 12 && i < 26;
      const xM = isPasarCrowd
        ? 314 + Math.random() * 56
        : isNorth
        ? 12 + Math.random() * 296
        : 375 + Math.random() * 248;
      this.pedestrians.push({
        id: i + 1,
        xM,
        dir: Math.random() < 0.5 ? 1 : -1,
        // 60% sisi Timur (-1, arah Pasar/UNPAS) & 40% sisi Barat (+1, sisi kos/ruko)
        side: i % 5 < 3 ? -1 : 1,
        speedMs: isPasarCrowd ? 0.8 + Math.random() * 0.35 : 1.05 + Math.random() * 0.45,
        lateralJitterM: (Math.random() - 0.5) * 0.65,
        shirtHex: PED_SHIRTS[i % PED_SHIRTS.length]
      });
    }
  }

  private spawnActiveOnStreetBlocker(dir: 1 | -1, xM: number, isBoxTruck: boolean): void {
    const profile =
      VEHICLE_PROFILES.find(p => p.kind === (isBoxTruck ? 'Boks Muat' : 'Mobil')) ?? VEHICLE_PROFILES[0];
    // Left-Hand Traffic: dir=1 -> lane=-1 (East), dir=-1 -> lane=+1 (West)
    const lane: 1 | -1 = dir === 1 ? -1 : 1;
    this.vehicles.push({
      id: this.nextVehId++,
      kind: profile.kind,
      colorHex: profile.palette[0],
      lengthM: profile.lengthM,
      widthM: profile.widthM,
      heightM: profile.heightM,
      maxSpeedMs: profile.maxSpeedMs,
      emp: profile.emp,
      speedMs: 0,
      dir,
      lane,
      xM,
      zOffsetM: lane === -1 ? -0.55 : 0.55,
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
      v => v.lane === lane && v.stopPhase !== 'stopped' && Math.abs(v.xM - entryM) < 6.0
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

  private spawnVehicle(
    dir: 1 | -1,
    customXM?: number,
    initialWaitSec = 0,
    explicitLane?: 1 | -1
  ): void {
    const cfg = SCENARIOS[this.scenario];
    const startM = customXM !== undefined ? customXM : dir === 1 ? -4 : CORRIDOR.lengthM + 4;
    const baseProfile = this.pickProfile(false);
    // Selaras SimPy CRN (3,5% motor vs 11% roda 4): peluang berhenti motor ~0,32x roda 4
    const stopProb =
      baseProfile.kind === 'Motor'
        ? (this.params.pStop / 100) * 0.32
        : this.params.pStop / 100;
    let willStop = Math.random() < stopProb;
    const profile =
      willStop && baseProfile.kind !== 'Motor' && Math.random() < 0.22
        ? this.pickProfile(true)
        : baseProfile;

    let stopType: StopType = 'none';
    let stopTargetM = -1;

    if (willStop) {
      if (!cfg.hasOffstreet) {
        // 55% concentrate at Pasar Gegerkalong (312-364 m), 25% northern ruko, 20% southern ruko toward Hilir
        const roll = Math.random();
        const candidate =
          roll < 0.55
            ? 312 + Math.random() * 52
            : roll < 0.8
            ? 55 + Math.random() * 240
            : 385 + Math.random() * 210;
        if ((candidate - startM) * dir > 14) {
          stopType = 'onstreet';
          stopTargetM = candidate;
        } else {
          willStop = false;
        }
      } else {
        // Choose an off-street facility strictly ahead of startM, preferring same-side curb first
        const dropTarget =
          CORRIDOR.dropoffBay.startM +
          5 +
          Math.random() * (CORRIDOR.dropoffBay.endM - CORRIDOR.dropoffBay.startM - 10);
        const parkTarget =
          CORRIDOR.parkingLot.startM +
          6 +
          Math.random() * (CORRIDOR.parkingLot.endM - CORRIDOR.parkingLot.startM - 12);

        const canDrop = (dropTarget - startM) * dir > 14;
        const canPark = (parkTarget - startM) * dir > 14;

        if (canDrop && canPark) {
          const pickDrop = dir === 1 ? Math.random() < 0.55 : Math.random() < 0.35;
          stopType = pickDrop ? 'dropoff' : 'parking';
          stopTargetM = pickDrop ? dropTarget : parkTarget;
        } else if (canDrop) {
          stopType = 'dropoff';
          stopTargetM = dropTarget;
        } else if (canPark) {
          stopType = 'parking';
          stopTargetM = parkTarget;
        } else {
          willStop = false;
        }
      }
    }

    const lane: 1 | -1 = explicitLane ?? (dir === 1 ? -1 : 1);
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
      emp: profile.emp,
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
      waitSec: initialWaitSec,
      inQueue: initialWaitSec > 0
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
    this.historyVersion += 1;
  }

  private getAvgWaitSec(): number {
    let sum = 0;
    let count = 0;
    for (const w of this.waitSamples) {
      sum += w;
      count += 1;
    }
    for (const v of this.vehicles) {
      if (v.waitSec > 0) {
        sum += v.waitSec;
        count += 1;
      }
    }
    for (const tArr of this.mainSpillbackArrivals) {
      sum += Math.max(0, this.simTimeSec - tArr);
      count += 1;
    }
    for (const tArr of this.oppSpillbackArrivals) {
      sum += Math.max(0, this.simTimeSec - tArr);
      count += 1;
    }
    return count === 0 ? 0 : sum / count;
  }

  private computeMetrics(): SimulationMetrics {
    const cfg = SCENARIOS[this.scenario];
    const avgWaitSec = this.getAvgWaitSec();
    const throughputPerHour =
      this.simTimeSec < 5 ? 0 : Math.round((this.servedCount / this.simTimeSec) * 3600);
    const throughputSmpPerHour =
      this.simTimeSec < 5 ? 0 : Math.round((this.servedEmpSum / this.simTimeSec) * 3600);
    const demandSmpPerHour = Math.round(this.params.lam * AVERAGE_EMP);
    const degreeOfSaturation = Number((demandSmpPerHour / cfg.effectiveCapacitySmp).toFixed(2));

    const spillbackQueue = this.mainSpillbackArrivals.length + this.oppSpillbackArrivals.length;
    let spillbackOriginLabel = 'Simpang Girang';
    if (!cfg.twoWay && this.oneWayDir === -1) {
      spillbackOriginLabel = 'Simpang Hilir';
    } else if (this.oppSpillbackArrivals.length > this.mainSpillbackArrivals.length) {
      spillbackOriginLabel = 'Simpang Hilir';
    }

    let losGrade: 'A-B' | 'C-D' | 'E-F' = 'A-B';
    let statusLabel = 'Lancar';
    if (this.currentQueue >= 20 || avgWaitSec >= 60) {
      losGrade = 'E-F';
      statusLabel = 'Macet / Meluber';
    } else if (this.currentQueue >= 8 || avgWaitSec >= 20) {
      losGrade = 'C-D';
      statusLabel = 'Padat Merayap';
    }

    return {
      simTimeSec: this.simTimeSec,
      clockLabel: this.formatClock(this.simTimeSec),
      avgWaitSec,
      currentQueue: this.currentQueue,
      maxQueue: this.maxQueue,
      spillbackQueue,
      spillbackOriginLabel,
      throughputPerHour,
      throughputSmpPerHour,
      demandSmpPerHour,
      degreeOfSaturation,
      servedCount: this.servedCount,
      activeVehicles: this.vehicles.length,
      losGrade,
      statusLabel
    };
  }

  private formatClock(sec: number): string {
    const startHour = !SCENARIOS[this.scenario].twoWay && this.oneWayDir === -1 ? 16 : 7;
    const base = startHour * 3600 + Math.floor(sec);
    const h = Math.floor(base / 3600) % 24;
    const m = Math.floor((base % 3600) / 60);
    const s = base % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
}
