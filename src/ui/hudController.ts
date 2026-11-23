import {
  computeEffectiveEmp,
  SCENARIOS,
  type CameraPresetKey,
  type OneWayDirection,
  type ScenarioKey,
  type VolumePresetKey
} from '../config/scenarios';
import type { EngineStateView, SnapshotRecord } from '../simulation/types';
import type {
  CameraMode,
  CameraStatusView,
  LightingMode,
  VehicleHoverInfo
} from '../scene/trafficScene';
import type { BenchmarkMetricKey } from './chartsController';

export interface HudCallbacks {
  onScenarioChange(key: ScenarioKey): void;
  onVolumePresetChange(preset: VolumePresetKey): void;
  onOneWayDirChange(dir: OneWayDirection): void;
  onCameraPreset(preset: CameraPresetKey): void;
  onPovVehicle(): void;
  onPovPedestrian(): void;
  onToggleTour(): void;
  onPovStyleToggle(): void;
  onPovCycle(): void;
  onPovExit(): void;
  onCorridorScrub(distM: number): void;
  onLightingChange(mode: LightingMode): void;
  onPlayPauseToggle(): boolean;
  onReset(): void;
  onSpeedChange(speed: number): void;
  onParamsChange(params: { lam?: number; motorPct?: number; pStop?: number; stopDur?: number }): void;
  onBenchMetricChange(metric: BenchmarkMetricKey): void;
  onTakeSnapshot(): void;
  onClearSnapshots(): void;
}

export class HudController {
  private callbacks: HudCallbacks;
  private drawerOpen = true;
  private activeCameraMode: CameraMode = 'free';
  private isScrubbingRail = false;

  private elClock: HTMLElement;
  private elCompassArrow: HTMLElement;
  private elWait: HTMLElement;
  private elQueue: HTMLElement;
  private elMaxQueue: HTMLElement;
  private elThroughput: HTMLElement;
  private elSmpDs: HTMLElement;
  private elLos: HTMLElement;
  private elSafety: HTMLElement;
  private elSpillback: HTMLElement;
  private elInsight: HTMLElement;
  private elTooltip: HTMLElement;
  private elDirSwitch: HTMLElement;
  private elDrawer: HTMLElement;
  private elDrawerBtn: HTMLButtonElement;
  private elPlayBtn: HTMLButtonElement;
  private elSnapshotBody: HTMLElement;

  private elPovBanner: HTMLElement;
  private elPovTitle: HTMLElement;
  private elPovDetail: HTMLElement;
  private btnPovVehicle: HTMLButtonElement;
  private btnPovPedestrian: HTMLButtonElement;
  private btnTour: HTMLButtonElement;
  private btnPovStyle: HTMLButtonElement;
  private btnPovCycle: HTMLButtonElement;
  private btnPovExit: HTMLButtonElement;

  private sliderCorridor: HTMLInputElement;
  private elRailReadout: HTMLElement;

  private sliderLam: HTMLInputElement;
  private sliderMotorPct: HTMLInputElement;
  private sliderPStop: HTMLInputElement;
  private sliderStopDur: HTMLInputElement;
  private valLam: HTMLElement;
  private valLamSmp: HTMLElement;
  private valMotorPct: HTMLElement;
  private valCarPct: HTMLElement;
  private valPStop: HTMLElement;
  private valStopDur: HTMLElement;

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;

    this.elClock = this.mustGet('simClock');
    this.elCompassArrow = this.mustGet('compassArrow');
    this.elWait = this.mustGet('kpiWait');
    this.elQueue = this.mustGet('kpiQueue');
    this.elMaxQueue = this.mustGet('kpiMaxQueue');
    this.elThroughput = this.mustGet('kpiThroughput');
    this.elSmpDs = this.mustGet('kpiSmpDs');
    this.elLos = this.mustGet('kpiLos');
    this.elSafety = this.mustGet('kpiSafety');
    this.elSpillback = this.mustGet('spillbackBadge');
    this.elInsight = this.mustGet('scenarioInsight');
    this.elTooltip = this.mustGet('vehicleTooltip');
    this.elDirSwitch = this.mustGet('oneWayControls');
    this.elDrawer = this.mustGet('analysisDrawer');
    this.elDrawerBtn = this.mustGet('btnToggleDrawer') as HTMLButtonElement;
    this.elPlayBtn = this.mustGet('btnPlayPause') as HTMLButtonElement;
    this.elSnapshotBody = this.mustGet('snapshotBody');

    this.elPovBanner = this.mustGet('povBanner');
    this.elPovTitle = this.mustGet('povTitle');
    this.elPovDetail = this.mustGet('povDetail');
    this.btnPovVehicle = this.mustGet('btnPovVehicle') as HTMLButtonElement;
    this.btnPovPedestrian = this.mustGet('btnPovPedestrian') as HTMLButtonElement;
    this.btnTour = this.mustGet('btnTour') as HTMLButtonElement;
    this.btnPovStyle = this.mustGet('btnPovStyle') as HTMLButtonElement;
    this.btnPovCycle = this.mustGet('btnPovCycle') as HTMLButtonElement;
    this.btnPovExit = this.mustGet('btnPovExit') as HTMLButtonElement;

    this.sliderCorridor = this.mustGet('sliderCorridor') as HTMLInputElement;
    this.elRailReadout = this.mustGet('railReadout');

    this.sliderLam = this.mustGet('sliderLam') as HTMLInputElement;
    this.sliderMotorPct = this.mustGet('sliderMotorPct') as HTMLInputElement;
    this.sliderPStop = this.mustGet('sliderPStop') as HTMLInputElement;
    this.sliderStopDur = this.mustGet('sliderStopDur') as HTMLInputElement;
    this.valLam = this.mustGet('valLam');
    this.valLamSmp = this.mustGet('valLamSmp');
    this.valMotorPct = this.mustGet('valMotorPct');
    this.valCarPct = this.mustGet('valCarPct');
    this.valPStop = this.mustGet('valPStop');
    this.valStopDur = this.mustGet('valStopDur');

    if (window.innerWidth < 1100) {
      this.drawerOpen = false;
      this.syncDrawerState();
    }

    this.bindEvents();
  }

  public syncCameraStatus(status: CameraStatusView): void {
    this.activeCameraMode = status.mode;
    this.elCompassArrow.style.transform = `rotate(${status.northDeg.toFixed(1)}deg)`;

    // Update Corridor Rail scrubber smoothly when user isn't dragging it
    const distRound = Math.round(status.corridorDistM);
    if (!this.isScrubbingRail) {
      this.sliderCorridor.value = String(distRound);
    }
    this.elRailReadout.textContent = `${distRound} m · ${status.zoneLabel}`;

    // Sync POV / Tour toolbar active pills
    const setActive = (btn: HTMLButtonElement, active: boolean) => {
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    };
    setActive(this.btnPovVehicle, status.mode === 'vehicle');
    setActive(this.btnPovPedestrian, status.mode === 'pedestrian');
    setActive(this.btnTour, status.mode === 'tour');

    if (status.mode !== 'free') {
      document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      this.elPovTitle.textContent = status.activeLabel;
      this.elPovDetail.textContent = status.activeDetail;
      this.btnPovStyle.hidden = status.mode !== 'vehicle';
      this.btnPovStyle.textContent = status.vehiclePovStyle === 'chase' ? 'Dashcam' : 'Chase-Cam';
      this.btnPovCycle.hidden = status.mode === 'tour';
      this.elPovBanner.hidden = false;
    } else {
      this.elPovBanner.hidden = true;
    }
  }

  public syncLightingSelection(mode: LightingMode): void {
    document.querySelectorAll<HTMLButtonElement>('[data-lighting]').forEach(btn => {
      const active = btn.dataset.lighting === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  public syncState(view: EngineStateView): void {
    const m = view.metrics;
    const cfg = SCENARIOS[view.scenario];

    this.elClock.textContent = m.clockLabel;
    this.elWait.textContent = `${m.avgWaitSec.toFixed(1)} dtk`;
    this.elWait.dataset.status = m.avgWaitSec < 60 ? 'ok' : 'warn';

    this.elQueue.textContent = `${m.currentQueue}`;
    this.elMaxQueue.textContent = `maks ${m.maxQueue} (target < 20)`;
    this.elQueue.dataset.status = m.maxQueue < 20 ? 'ok' : 'warn';

    this.elThroughput.textContent = `${m.throughputPerHour} /jam`;
    this.elSmpDs.textContent = `${m.throughputSmpPerHour} smp/j · DS ${m.degreeOfSaturation.toFixed(2)}`;
    this.elLos.textContent = `LOS ${m.losGrade} · ${m.statusLabel}`;
    this.elLos.dataset.grade = m.losGrade;

    this.elSafety.textContent = !cfg.hasOffstreet
      ? 'Bangunan rapat tanpa ruang trotoar · pejalan kaki terdesak parkir liar di bahu aspal'
      : cfg.twoWay
      ? 'Bangunan rapat tanpa trotoar · tepi jalan bebas parkir liar, ruang pejalan lebih lega'
      : 'Bangunan rapat tanpa trotoar · satu arah & bebas parkir liar, konflik pejalan minimal';

    if (m.spillbackQueue > 0) {
      this.elSpillback.textContent = `Luberan ${m.spillbackOriginLabel}: +${m.spillbackQueue} kendaraan`;
      this.elSpillback.hidden = false;
    } else {
      this.elSpillback.hidden = true;
    }
  }

  public syncScenarioSelection(view: EngineStateView): void {
    const cfg = SCENARIOS[view.scenario];
    document.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(btn => {
      const active = btn.dataset.scenario === view.scenario;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('is-active', active);
    });

    document.querySelectorAll<HTMLButtonElement>('[data-volpreset]').forEach(btn => {
      const active = btn.dataset.volpreset === view.volumePreset;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('is-active', active);
    });

    this.elDirSwitch.hidden = view.scenario !== 'sk2';
    document.querySelectorAll<HTMLButtonElement>('[data-oneway]').forEach(btn => {
      const active = Number(btn.dataset.oneway) === view.oneWayDir;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('is-active', active);
    });

    this.sliderLam.value = String(view.params.lam);
    this.valLam.textContent = String(view.params.lam);
    this.sliderMotorPct.value = String(view.params.motorPct);
    this.valMotorPct.textContent = String(view.params.motorPct);
    this.valCarPct.textContent = `(${100 - view.params.motorPct}% roda 4)`;
    this.valLamSmp.textContent = `(≈ ${Math.round(view.params.lam * computeEffectiveEmp(view.params.motorPct))} smp)`;
    this.sliderPStop.value = String(view.params.pStop);
    this.valPStop.textContent = String(view.params.pStop);
    this.sliderStopDur.value = String(view.params.stopDur);
    this.valStopDur.textContent = String(view.params.stopDur);

    this.elInsight.textContent = cfg.insight;
  }

  public renderTooltip(hover: VehicleHoverInfo | null): void {
    if (!hover) {
      this.elTooltip.hidden = true;
      return;
    }
    const v = hover.agent;
    let status = 'Melaju';
    if (v.stopPhase === 'stopped') {
      status =
        v.stopType === 'onstreet'
          ? 'Berhenti di badan jalan'
          : v.stopType === 'dropoff'
          ? 'Drop-off di luar badan jalan'
          : 'Parkir di area khusus';
    } else if (v.inQueue) {
      status = 'Mengantre';
    }

    const dirLabel = v.dir === 1 ? 'Girang → Hilir' : 'Hilir → Girang';
    this.elTooltip.innerHTML = `
      <div class="tip-head">${v.kind} #${v.id} · ${dirLabel}</div>
      <div class="tip-row">Status: <strong>${status}</strong></div>
      <div class="tip-row">Kecepatan: ${(v.speedMs * 3.6).toFixed(1)} km/j · Tunggu: ${v.waitSec.toFixed(1)} dtk</div>
      <div class="tip-row"><em>Klik kendaraan untuk masuk POV</em></div>
    `;
    const left = Math.min(window.innerWidth - 250, Math.max(12, hover.screenX + 14));
    const top = Math.max(64, hover.screenY - 82);
    this.elTooltip.style.left = `${left}px`;
    this.elTooltip.style.top = `${top}px`;
    this.elTooltip.hidden = false;
  }

  public renderSnapshots(records: readonly SnapshotRecord[]): void {
    if (records.length === 0) {
      this.elSnapshotBody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-cell">
            Belum ada rekaman. Jalankan skenario lalu klik Rekam Snapshot untuk perbandingan langsung.
          </td>
        </tr>`;
      return;
    }

    this.elSnapshotBody.innerHTML = records
      .map(
        r => `
        <tr>
          <td>
            <div class="snap-name">${r.scenarioLabel}${r.directionLabel ? ` (${r.directionLabel})` : ''}</div>
            <div class="snap-sub">${r.params.lam}/j, mtr ${r.params.motorPct}%, stop ${r.params.pStop}%</div>
          </td>
          <td class="num ${r.avgWaitSec < 60 ? 'ok' : 'warn'}">${r.avgWaitSec.toFixed(1)} dtk</td>
          <td class="num ${r.maxQueue < 20 ? 'ok' : 'warn'}">${r.maxQueue}</td>
          <td class="num">${r.throughputPerHour}</td>
        </tr>`
      )
      .join('');
  }

  private bindEvents(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.scenario as ScenarioKey;
        this.callbacks.onScenarioChange(key);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-volpreset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.volpreset as VolumePresetKey;
        this.callbacks.onVolumePresetChange(preset);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-oneway]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.oneway) as OneWayDirection;
        this.callbacks.onOneWayDirChange(dir);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        this.callbacks.onCameraPreset(btn.dataset.camera as CameraPresetKey);
      });
    });

    this.btnPovVehicle.addEventListener('click', () => this.callbacks.onPovVehicle());
    this.btnPovPedestrian.addEventListener('click', () => this.callbacks.onPovPedestrian());
    this.btnTour.addEventListener('click', () => this.callbacks.onToggleTour());
    this.btnPovStyle.addEventListener('click', () => this.callbacks.onPovStyleToggle());
    this.btnPovCycle.addEventListener('click', () => this.callbacks.onPovCycle());
    this.btnPovExit.addEventListener('click', () => this.callbacks.onPovExit());

    this.sliderCorridor.addEventListener('pointerdown', () => {
      this.isScrubbingRail = true;
    });
    const endScrub = () => {
      this.isScrubbingRail = false;
    };
    this.sliderCorridor.addEventListener('pointerup', endScrub);
    this.sliderCorridor.addEventListener('change', endScrub);
    this.sliderCorridor.addEventListener('input', () => {
      this.callbacks.onCorridorScrub(Number(this.sliderCorridor.value));
    });

    document.querySelectorAll<HTMLButtonElement>('[data-lighting]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.lighting as LightingMode;
        this.syncLightingSelection(mode);
        this.callbacks.onLightingChange(mode);
      });
    });

    this.elPlayBtn.addEventListener('click', () => {
      const running = this.callbacks.onPlayPauseToggle();
      this.elPlayBtn.textContent = running ? 'Jeda' : 'Lanjut';
      this.elPlayBtn.setAttribute('aria-pressed', String(!running));
    });

    this.mustGet('btnReset').addEventListener('click', () => this.callbacks.onReset());

    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        this.callbacks.onSpeedChange(Number(btn.dataset.speed));
      });
    });

    this.elDrawerBtn.addEventListener('click', () => {
      this.drawerOpen = !this.drawerOpen;
      this.syncDrawerState();
    });

    document.addEventListener('keydown', e => {
      // Only close drawer on Escape if NOT currently exiting a POV/Tour mode
      if (e.key === 'Escape' && this.activeCameraMode === 'free' && this.drawerOpen) {
        this.drawerOpen = false;
        this.syncDrawerState();
      }
    });

    this.sliderLam.addEventListener('input', () => {
      const lam = Number(this.sliderLam.value);
      const motorPct = Number(this.sliderMotorPct.value);
      this.valLam.textContent = String(lam);
      this.valLamSmp.textContent = `(≈ ${Math.round(lam * computeEffectiveEmp(motorPct))} smp)`;
      this.callbacks.onParamsChange({ lam });
    });

    this.sliderMotorPct.addEventListener('input', () => {
      const motorPct = Number(this.sliderMotorPct.value);
      const lam = Number(this.sliderLam.value);
      this.valMotorPct.textContent = String(motorPct);
      this.valCarPct.textContent = `(${100 - motorPct}% roda 4)`;
      this.valLamSmp.textContent = `(≈ ${Math.round(lam * computeEffectiveEmp(motorPct))} smp)`;
      this.callbacks.onParamsChange({ motorPct });
    });

    this.sliderPStop.addEventListener('input', () => {
      const pStop = Number(this.sliderPStop.value);
      this.valPStop.textContent = String(pStop);
      this.callbacks.onParamsChange({ pStop });
    });

    this.sliderStopDur.addEventListener('input', () => {
      const stopDur = Number(this.sliderStopDur.value);
      this.valStopDur.textContent = String(stopDur);
      this.callbacks.onParamsChange({ stopDur });
    });

    const benchSelect = this.mustGet('selectBenchMetric') as HTMLSelectElement;
    benchSelect.addEventListener('change', () => {
      this.callbacks.onBenchMetricChange(benchSelect.value as BenchmarkMetricKey);
    });

    this.mustGet('btnSnapshot').addEventListener('click', () => this.callbacks.onTakeSnapshot());
    this.mustGet('btnClearSnapshots').addEventListener('click', () => this.callbacks.onClearSnapshots());
  }

  private syncDrawerState(): void {
    this.elDrawer.classList.toggle('is-closed', !this.drawerOpen);
    this.elDrawerBtn.setAttribute('aria-expanded', String(this.drawerOpen));
    this.elDrawerBtn.textContent = this.drawerOpen ? 'Tutup Analisis' : 'Panel Analisis';
  }

  private mustGet(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing required DOM element #${id}`);
    return el;
  }
}
