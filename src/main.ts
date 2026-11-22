import './styles/main.css';
import { SCENARIOS } from './config/scenarios';
import { TrafficEngine } from './simulation/trafficEngine';
import type { SnapshotRecord } from './simulation/types';
import { TrafficScene3D } from './scene/trafficScene';
import { ChartsController } from './ui/chartsController';
import { HudController } from './ui/hudController';

function bootstrap(): void {
  const canvasMount = document.getElementById('canvasMount');
  const liveChartCanvas = document.getElementById('liveChart') as HTMLCanvasElement | null;
  const benchChartCanvas = document.getElementById('benchChart') as HTMLCanvasElement | null;

  if (!canvasMount || !liveChartCanvas || !benchChartCanvas) {
    throw new Error('Elemen mount aplikasi 3D tidak ditemukan.');
  }

  const engine = new TrafficEngine();
  const scene3d = new TrafficScene3D(canvasMount);
  const charts = new ChartsController(liveChartCanvas, benchChartCanvas);

  let running = true;
  let speed = 1;
  let snapshots: SnapshotRecord[] = [];
  let nextSnapId = 1;
  let lastHistoryVersion = -1;

  const hud = new HudController({
    onScenarioChange: key => {
      engine.setScenario(key);
      const view = engine.getStateView();
      hud.syncScenarioSelection(view);
      hud.syncState(view);
      charts.updateLive(view.history);
      lastHistoryVersion = view.historyVersion;
    },
    onVolumePresetChange: preset => {
      engine.setVolumePreset(preset);
      const view = engine.getStateView();
      hud.syncScenarioSelection(view);
      hud.syncState(view);
      charts.updateLive(view.history);
      lastHistoryVersion = view.historyVersion;
    },
    onOneWayDirChange: dir => {
      engine.setOneWayDirection(dir);
      const lightMode = dir === 1 ? 'morning' : 'afternoon';
      scene3d.setLightingMode(lightMode);
      hud.syncLightingSelection(lightMode);
      const view = engine.getStateView();
      hud.syncScenarioSelection(view);
      hud.syncState(view);
      charts.updateLive(view.history);
      lastHistoryVersion = view.historyVersion;
    },
    onCameraPreset: preset => {
      scene3d.setCameraPreset(preset);
    },
    onPovVehicle: () => {
      scene3d.enterVehiclePov(engine.getStateView());
    },
    onPovPedestrian: () => {
      scene3d.enterPedestrianPov(engine.getStateView());
    },
    onToggleTour: () => {
      scene3d.toggleCorridorTour();
    },
    onPovStyleToggle: () => {
      scene3d.toggleVehiclePovStyle();
    },
    onPovCycle: () => {
      scene3d.cyclePovTarget(engine.getStateView());
    },
    onPovExit: () => {
      scene3d.exitPov(true);
    },
    onCorridorScrub: distM => {
      scene3d.scrubCorridor(distM);
    },
    onLightingChange: mode => {
      scene3d.setLightingMode(mode);
    },
    onPlayPauseToggle: () => {
      running = !running;
      return running;
    },
    onReset: () => {
      engine.reset();
      const view = engine.getStateView();
      hud.syncState(view);
      charts.updateLive(view.history);
      lastHistoryVersion = view.historyVersion;
    },
    onSpeedChange: nextSpeed => {
      speed = nextSpeed;
    },
    onParamsChange: partial => {
      engine.updateParams(partial);
    },
    onBenchMetricChange: metric => {
      charts.setBenchmarkMetric(metric);
    },
    onTakeSnapshot: () => {
      const view = engine.getStateView();
      const cfg = SCENARIOS[view.scenario];
      snapshots.push({
        id: nextSnapId++,
        scenarioKey: view.scenario,
        scenarioLabel: cfg.shortName,
        directionLabel:
          view.scenario === 'sk2' ? (view.oneWayDir === 1 ? 'Pagi' : 'Sore') : '',
        params: { ...view.params },
        avgWaitSec: view.metrics.avgWaitSec,
        maxQueue: view.metrics.maxQueue,
        throughputPerHour: view.metrics.throughputPerHour
      });
      hud.renderSnapshots(snapshots);
    },
    onClearSnapshots: () => {
      snapshots = [];
      hud.renderSnapshots(snapshots);
    }
  });

  // Initial sync
  const initialView = engine.getStateView();
  hud.syncScenarioSelection(initialView);
  hud.syncState(initialView);
  hud.renderSnapshots(snapshots);
  charts.updateLive(initialView.history);
  lastHistoryVersion = initialView.historyVersion;

  window.addEventListener('resize', () => scene3d.resize());
  window.addEventListener('beforeunload', () => scene3d.dispose());

  let lastNow = performance.now();
  let lastHudSyncNow = -999;
  const frame = (now: number): void => {
    const realDt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
    lastNow = now;

    if (running) {
      const subSteps = speed >= 4 ? 4 : 2;
      const simDt = (realDt * speed) / subSteps;
      for (let i = 0; i < subSteps; i++) {
        engine.step(simDt);
      }
    }

    const view = engine.getStateView();
    const totalSimDt = running ? realDt * speed : 0;
    const { hover, cameraStatus } = scene3d.syncAndRender(view, realDt, totalSimDt);

    if (now - lastHudSyncNow >= 80) {
      lastHudSyncNow = now;
      hud.syncState(view);
    }
    hud.syncCameraStatus(cameraStatus);
    hud.renderTooltip(hover);

    if (view.historyVersion !== lastHistoryVersion) {
      charts.updateLive(view.history);
      lastHistoryVersion = view.historyVersion;
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', bootstrap);
