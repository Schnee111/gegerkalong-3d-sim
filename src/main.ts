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
  let lastHistoryLen = -1;

  const hud = new HudController({
    onScenarioChange: key => {
      engine.setScenario(key);
      const view = engine.getStateView();
      hud.syncScenarioSelection(view.scenario, view.oneWayDir);
      charts.updateLive(view.history);
      lastHistoryLen = view.history.length;
    },
    onOneWayDirChange: dir => {
      engine.setOneWayDirection(dir);
      const view = engine.getStateView();
      hud.syncScenarioSelection(view.scenario, view.oneWayDir);
      charts.updateLive(view.history);
      lastHistoryLen = view.history.length;
    },
    onCameraPreset: preset => {
      scene3d.setCameraPreset(preset);
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
      charts.updateLive(view.history);
      lastHistoryLen = view.history.length;
    },
    onSpeedChange: nextSpeed => {
      speed = nextSpeed;
    },
    onParamsChange: partial => {
      engine.updateParams(partial);
    },
    onPresetReset: () => {
      const current = engine.getStateView().scenario;
      engine.setScenario(current);
      const view = engine.getStateView();
      hud.syncScenarioSelection(view.scenario, view.oneWayDir);
      charts.updateLive(view.history);
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
  hud.syncScenarioSelection(initialView.scenario, initialView.oneWayDir);
  hud.syncState(initialView);
  hud.renderSnapshots(snapshots);
  charts.updateLive(initialView.history);

  window.addEventListener('resize', () => scene3d.resize());

  let lastNow = performance.now();
  const frame = (now: number): void => {
    const realDt = Math.min(0.05, (now - lastNow) / 1000);
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
    const hoverInfo = scene3d.syncAndRender(view, realDt, totalSimDt);
    hud.syncState(view);
    hud.renderTooltip(hoverInfo);

    if (view.history.length !== lastHistoryLen || (running && Math.floor(view.metrics.simTimeSec) % 5 === 0)) {
      charts.updateLive(view.history);
      lastHistoryLen = view.history.length;
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', bootstrap);
