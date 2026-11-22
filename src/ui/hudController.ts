import {
  SCENARIOS,
  type CameraPresetKey,
  type OneWayDirection,
  type ScenarioKey
} from '../config/scenarios';
import type { EngineStateView, SnapshotRecord } from '../simulation/types';
import type { LightingMode, VehicleHoverInfo } from '../scene/trafficScene';
import type { BenchmarkMetricKey } from './chartsController';

export interface HudCallbacks {
  onScenarioChange(key: ScenarioKey): void;
  onOneWayDirChange(dir: OneWayDirection): void;
  onCameraPreset(preset: CameraPresetKey): void;
  onLightingChange(mode: LightingMode): void;
  onPlayPauseToggle(): boolean;
  onReset(): void;
  onSpeedChange(speed: number): void;
  onParamsChange(params: { lam?: number; pStop?: number; stopDur?: number }): void;
  onPresetReset(): void;
  onBenchMetricChange(metric: BenchmarkMetricKey): void;
  onTakeSnapshot(): void;
  onClearSnapshots(): void;
}

export class HudController {
  private callbacks: HudCallbacks;
  private drawerOpen = true;

  private elClock: HTMLElement;
  private elWait: HTMLElement;
  private elQueue: HTMLElement;
  private elMaxQueue: HTMLElement;
  private elThroughput: HTMLElement;
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

  private sliderLam: HTMLInputElement;
  private sliderPStop: HTMLInputElement;
  private sliderStopDur: HTMLInputElement;
  private valLam: HTMLElement;
  private valPStop: HTMLElement;
  private valStopDur: HTMLElement;

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;

    this.elClock = this.mustGet('simClock');
    this.elWait = this.mustGet('kpiWait');
    this.elQueue = this.mustGet('kpiQueue');
    this.elMaxQueue = this.mustGet('kpiMaxQueue');
    this.elThroughput = this.mustGet('kpiThroughput');
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

    this.sliderLam = this.mustGet('sliderLam') as HTMLInputElement;
    this.sliderPStop = this.mustGet('sliderPStop') as HTMLInputElement;
    this.sliderStopDur = this.mustGet('sliderStopDur') as HTMLInputElement;
    this.valLam = this.mustGet('valLam');
    this.valPStop = this.mustGet('valPStop');
    this.valStopDur = this.mustGet('valStopDur');

    // Start collapsed on narrower screens so 3D viewport remains focal
    if (window.innerWidth < 1100) {
      this.drawerOpen = false;
      this.syncDrawerState();
    }

    this.bindEvents();
  }

  public syncState(view: EngineStateView): void {
    const m = view.metrics;
    const cfg = SCENARIOS[view.scenario];

    this.elClock.textContent = m.clockLabel;
    this.elWait.textContent = `${m.avgWaitSec.toFixed(1)} dtk`;
    this.elWait.dataset.status = m.avgWaitSec < 60 ? 'ok' : 'warn';

    this.elQueue.textContent = `${m.currentQueue}`;
    this.elMaxQueue.textContent = `maks ${m.maxQueue}`;
    this.elQueue.dataset.status = m.maxQueue < 20 ? 'ok' : 'warn';

    this.elThroughput.textContent = `${m.throughputPerHour} /jam`;
    this.elLos.textContent = `LOS ${m.losGrade} · ${m.statusLabel}`;
    this.elLos.dataset.grade = m.losGrade;

    this.elSafety.textContent = cfg.hasSidewalk
      ? 'Trotoar aktif (pejalan kaki terlindungi)'
      : 'Tanpa trotoar (pejalan kaki di bahu jalan)';

    if (m.spillbackQueue > 0) {
      this.elSpillback.textContent = `Luberan Simpang Girang: +${m.spillbackQueue} kendaraan`;
      this.elSpillback.hidden = false;
    } else {
      this.elSpillback.hidden = true;
    }
  }

  public syncScenarioSelection(key: ScenarioKey, oneWayDir: OneWayDirection): void {
    const cfg = SCENARIOS[key];
    document.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(btn => {
      const active = btn.dataset.scenario === key;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('is-active', active);
    });

    this.elDirSwitch.hidden = key !== 'sk2';
    document.querySelectorAll<HTMLButtonElement>('[data-oneway]').forEach(btn => {
      const active = Number(btn.dataset.oneway) === oneWayDir;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('is-active', active);
    });

    this.sliderLam.value = String(cfg.defaultParams.lam);
    this.valLam.textContent = String(cfg.defaultParams.lam);
    this.sliderPStop.value = String(cfg.defaultParams.pStop);
    this.valPStop.textContent = String(cfg.defaultParams.pStop);
    this.sliderStopDur.value = String(cfg.defaultParams.stopDur);
    this.valStopDur.textContent = String(cfg.defaultParams.stopDur);

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

    this.elTooltip.innerHTML = `
      <div class="tip-head">${v.kind} #${v.id}</div>
      <div class="tip-row">Status: <strong>${status}</strong></div>
      <div class="tip-row">Kecepatan: ${(v.speedMs * 3.6).toFixed(1)} km/j · Tunggu: ${v.waitSec.toFixed(1)} dtk</div>
    `;
    const left = Math.min(window.innerWidth - 230, Math.max(12, hover.screenX + 14));
    const top = Math.max(64, hover.screenY - 68);
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
            <div class="snap-sub">${r.params.lam}/jam, stop ${r.params.pStop}%</div>
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

    document.querySelectorAll<HTMLButtonElement>('[data-lighting]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll<HTMLButtonElement>('[data-lighting]').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        this.callbacks.onLightingChange(btn.dataset.lighting as LightingMode);
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
      if (e.key === 'Escape' && this.drawerOpen) {
        this.drawerOpen = false;
        this.syncDrawerState();
      }
    });

    this.sliderLam.addEventListener('input', () => {
      const lam = Number(this.sliderLam.value);
      this.valLam.textContent = String(lam);
      this.callbacks.onParamsChange({ lam });
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

    this.mustGet('btnPresetReset').addEventListener('click', () => this.callbacks.onPresetReset());

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
