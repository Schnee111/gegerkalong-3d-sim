# DESIGN.md — Simulasi 3D Jalan Gegerkalong Tengah (Kelompok 9 MSTR-UPI)

## Design Read
Reading this as: Architectural 3D urban-traffic digital twin and classroom presentation simulator for FPMIPA UPI (MSTR-Transportasi), styled in a **Daylight Urban-Planning Studio** visual language.
Dial: ENERGY 2 / RHYTHM 2 / MOTION 2.

## Core Visual Decisions (Rule R-31)
- **Theme (Light Warm Architectural Paper + Sunlit 3D World):** Chosen for maximum projector legibility in classroom presentations and to avoid generic dark-mode tech dashboards.
- **Color Palette (2 core neutrals + 1 brand accent + semantic status):**
  - Surface paper: `#F7F5F0` / `#FFFFFF` with hairline `#D6D3CD` borders.
  - Primary ink: `#18181B` (contrast > 13:1 on paper), secondary ink `#52525B` (contrast > 6.5:1).
  - Institutional accent: UPI Maroon `#8B1E24` for active scenario focus and title identity.
  - Semantic status only: `#B91C1C` (macet/baseline), `#B45309` (padat/skenario 1), `#047857` (lancar/skenario 2).
- **Typography:** `Plus Jakarta Sans` (clean geometric humanist sans suited for architectural & transport presentation) paired with `IBM Plex Mono` for tabular live telemetry numbers.
- **Layout & Focal Point:** Full-bleed 3D WebGL viewport as the single primary focal point. Floating studio HUD panels use crisp 1px borders, solid paper backgrounds (no glassmorphism blur spam, no neon glows, no uniform bento card grids), and a collapsible right-hand analysis drawer so presenters can toggle between pure 3D immersion and quantitative charts.
- **Copywriting:** Natural Indonesian academic/engineering terms, zero em-dashes, zero marketing buzzwords, and every benchmark number grounded strictly on LKM-2 Kelompok 9 SimPy results (Baseline 404 dtk / 85 kend., Skenario 1 8 dtk / 9 kend., Skenario 2 3 dtk / 6 kend.).
