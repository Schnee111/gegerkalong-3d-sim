"""Simulasi antrean kendaraan Jalan Gegerkalong Tengah (Multi-Kelas + Common Random Numbers).

Kalibrasi lapangan & literatur (diperbarui untuk lebar aspal efektif ~3,2 m):
- Lebar aspal efektif ~3,2 m (fotogrametri Google Street View No. 86 Jl. Gegerkalong Tengah:
  3,15–3,21 m; rentang 3–4 m LKM-2; ruang dinding-ke-dinding ~4,2 m termasuk got/bahu).
  Dua mobil (2 x 1,75 m = 3,5 m) tidak muat berpapasan langsung sehingga memicu tunda konflik
  papasan (12–22 dtk) pada Baseline & Skenario 1.
- Komposisi 75% Motor / 25% Roda 4 (BPS 2025 Kota Bandung: 70,9% motor + survei kampus JPR ITS 2024).
- Hambatan samping parkir/bongkar muat depan Pasar Gegerkalong (PKJI 2023 & SainTekA 2025).
- Kecepatan rata-rata lalu lintas Kota Bandung 18,5 km/jam (FPIPS UPI / TomTom Traffic Index).
- Metode Common Random Numbers (CRN): urutan kedatangan dan tipe kendaraan identik antar skenario
  pada setiap replikasi agar perbandingan throughput bebas bias variasi acak.
"""

import json
import random
import statistics
import simpy

SIM_TIME = 7200       # 2 jam simulasi (detik)
WARMUP = 600          # 10 menit warm-up dibuang
REPLICATIONS = 10
LAM_PER_HOUR = 540    # 540 kend./jam (75% motor, 25% roda 4)
P_MOTOR = 0.75        # 75% sepeda motor, 25% kendaraan roda 4


def generate_arrival_stream(seed):
    """Membangkitkan urutan kedatangan Poisson & kelas kendaraan yang identik antar skenario (CRN)."""
    rng = random.Random(seed)
    lam = LAM_PER_HOUR / 3600
    events = []
    t = 0.0
    while True:
        t += rng.expovariate(lam)
        if t >= SIM_TIME:
            break
        events.append((t, rng.random() < P_MOTOR, rng.random(), rng.random(), rng.random(), rng.random()))
    return events


class RealisticNarrowRoad:
    """Model SimPy ruas sempit ~3,2 m dengan 2 kelas kendaraan, konflik papasan, & hambatan samping."""

    def __init__(self, env, scn, collect_from):
        self.env = env
        self.scn = scn
        self.collect_from = collect_from
        self.bottleneck = simpy.Resource(env, capacity=1)
        self.wait, self.q, self.maxq, self.served = [], [], 0, 0
        self.env.process(self.monitor())

    def monitor(self):
        while True:
            if self.env.now >= self.collect_from:
                n = len(self.bottleneck.queue)
                self.q.append(n)
                self.maxq = max(self.maxq, n)
            yield self.env.timeout(10)

    def vehicle(self, is_motor, u_conf, u_conf_d, u_stop, u_stop_d):
        t0 = self.env.now
        with self.bottleneck.request() as req:
            yield req
            if self.env.now >= self.collect_from:
                self.wait.append(self.env.now - t0)

            st = self.scn["svc_motor"] if is_motor else self.scn["svc_car"]
            if self.scn["two_way"]:
                p_conf = self.scn["p_conflict_motor"] if is_motor else self.scn["p_conflict_car"]
                if u_conf < p_conf:
                    lo, hi = self.scn["conflict_delay"]
                    st += lo + u_conf_d * (hi - lo)

            p_stop = self.scn["p_stop_motor"] if is_motor else self.scn["p_stop_car"]
            if u_stop < p_stop:
                lo, hi = self.scn["stop_delay"]
                st += lo + u_stop_d * (hi - lo)

            yield self.env.timeout(st)
            if self.env.now >= self.collect_from:
                self.served += 1


SCENARIOS = [
    {
        "key": "baseline",
        "label": "Baseline (2 arah + parkir badan jalan, aspal ~3,2 m)",
        "two_way": True,
        "svc_motor": 2.3,
        "svc_car": 4.0,
        "p_conflict_motor": 0.18,
        "p_conflict_car": 0.72,
        "conflict_delay": (12, 22),
        "p_stop_motor": 0.035,
        "p_stop_car": 0.11,
        "stop_delay": (20, 40),
    },
    {
        "key": "sk1",
        "label": "Skenario 1 (2 arah + parkir KPAD & muat luar sibuk)",
        "two_way": True,
        "svc_motor": 2.3,
        "svc_car": 4.0,
        "p_conflict_motor": 0.16,
        "p_conflict_car": 0.68,
        "conflict_delay": (12, 22),
        "p_stop_motor": 0.015,
        "p_stop_car": 0.03,
        "stop_delay": (10, 18),
    },
    {
        "key": "sk2",
        "label": "Skenario 2 (1 arah bergantian + Skenario 1 + petugas)",
        "two_way": False,
        "svc_motor": 1.8,
        "svc_car": 3.0,
        "p_conflict_motor": 0.0,
        "p_conflict_car": 0.0,
        "conflict_delay": (0, 0),
        "p_stop_motor": 0.01,
        "p_stop_car": 0.02,
        "stop_delay": (8, 15),
    },
]


def run(scn, stream):
    env = simpy.Environment()
    road = RealisticNarrowRoad(env, scn, WARMUP)

    def arrivals():
        prev_t = 0.0
        for t, is_motor, u_conf, u_conf_d, u_stop, u_stop_d in stream:
            yield env.timeout(t - prev_t)
            prev_t = t
            env.process(road.vehicle(is_motor, u_conf, u_conf_d, u_stop, u_stop_d))

    env.process(arrivals())
    env.run(until=SIM_TIME)
    dur = SIM_TIME - WARMUP
    return {
        "wait": statistics.mean(road.wait) if road.wait else 0,
        "maxq": road.maxq,
        "thr": road.served / dur * 3600,
    }


if __name__ == "__main__":
    streams = [generate_arrival_stream(seed) for seed in range(1, REPLICATIONS + 1)]
    results = {}
    for scn in SCENARIOS:
        reps = [run(scn, st) for st in streams]
        results[scn["key"]] = {
            "label": scn["label"],
            "wait": round(statistics.mean(r["wait"] for r in reps)),
            "maxq": round(statistics.mean(r["maxq"] for r in reps)),
            "thr": round(statistics.mean(r["thr"] for r in reps)),
        }
    print(json.dumps(results, indent=2, ensure_ascii=False))