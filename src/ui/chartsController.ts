import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js';
import { SIMPY_BENCHMARK_SERIES } from '../config/scenarios';
import type { HistoryPoint } from '../simulation/types';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend
);

export type BenchmarkMetricKey = 'wait' | 'maxq' | 'thr';

export class ChartsController {
  private liveChart: Chart<'line'>;
  private benchChart: Chart<'bar'>;
  private activeBenchMetric: BenchmarkMetricKey = 'wait';

  constructor(liveCanvas: HTMLCanvasElement, benchCanvas: HTMLCanvasElement) {
    this.liveChart = new Chart(liveCanvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Antrean (kend.)',
            data: [],
            borderColor: '#8b1e24',
            backgroundColor: 'rgba(139, 30, 36, 0.12)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 1.5,
            yAxisID: 'y'
          },
          {
            label: 'Tunggu (dtk)',
            data: [],
            borderColor: '#1e3a5f',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 1.5,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'start',
            labels: { color: '#3f3f46', boxWidth: 10, font: { size: 11, family: 'Plus Jakarta Sans, sans-serif' } }
          }
        },
        scales: {
          x: {
            ticks: { color: '#71717a', maxTicksLimit: 5, font: { size: 10, family: 'IBM Plex Mono, monospace' } },
            grid: { color: '#eceae4' }
          },
          y: {
            position: 'left',
            beginAtZero: true,
            ticks: { color: '#8b1e24', font: { size: 10, family: 'IBM Plex Mono, monospace' } },
            grid: { color: '#eceae4' }
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            ticks: { color: '#1e3a5f', font: { size: 10, family: 'IBM Plex Mono, monospace' } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    this.benchChart = new Chart(benchCanvas, {
      type: 'bar',
      data: {
        labels: [...SIMPY_BENCHMARK_SERIES.labels],
        datasets: [
          {
            label: SIMPY_BENCHMARK_SERIES.wait.label,
            data: [...SIMPY_BENCHMARK_SERIES.wait.values],
            backgroundColor: ['#991b1b', '#b45309', '#047857'],
            borderRadius: 4,
            maxBarThickness: 44
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.y} ${SIMPY_BENCHMARK_SERIES[this.activeBenchMetric].unit}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#27272a', font: { size: 11, weight: 600, family: 'Plus Jakarta Sans, sans-serif' } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#52525b', font: { size: 10, family: 'IBM Plex Mono, monospace' } },
            grid: { color: '#eceae4' }
          }
        }
      }
    });
  }

  public updateLive(history: readonly HistoryPoint[]): void {
    this.liveChart.data.labels = history.map(h => h.clockLabel);
    this.liveChart.data.datasets[0].data = history.map(h => h.queue);
    this.liveChart.data.datasets[1].data = history.map(h => h.avgWait);
    this.liveChart.update();
  }

  public setBenchmarkMetric(metric: BenchmarkMetricKey): void {
    this.activeBenchMetric = metric;
    const series = SIMPY_BENCHMARK_SERIES[metric];
    this.benchChart.data.datasets[0].label = series.label;
    this.benchChart.data.datasets[0].data = [...series.values];
    this.benchChart.update();
  }
}
