import * as THREE from 'three';
import { OSM_ROAD_CENTERLINE } from '../config/osmCorridorData';

export interface CorridorFrame {
  x: number;
  y: number;
  z: number;
  /** Centerline Y before any lateral offset */
  groundY: number;
  /** Three.js rotation.y for an object whose forward axis is +X */
  yaw: number;
  /** Three.js rotation.z (pitch) matching the real Bandung Utara road slope */
  pitch: number;
  tx: number;
  ty: number;
  tz: number;
  /** Lateral unit normal pointing toward +Z (West side) */
  nx: number;
  nz: number;
}

/**
 * Samples the exact OpenStreetMap centerline + Open-Meteo elevation profile
 * of Jalan Gegerkalong Tengah (0 m = Simpang Gegerkalong Girang -> 355 m = South end).
 * Smoothly extrapolates slightly outside [0, 355] for intersection approaches.
 */
export function sampleCorridorFrame(distM: number, lateralZ = 0): CorridorFrame {
  const pts = OSM_ROAD_CENTERLINE;
  const lastIdx = pts.length - 1;

  let i0 = 0;
  let i1 = 1;
  let t = 0;

  if (distM <= pts[0].distM) {
    i0 = 0;
    i1 = 1;
    const span = Math.max(0.001, pts[1].distM - pts[0].distM);
    t = (distM - pts[0].distM) / span;
  } else if (distM >= pts[lastIdx].distM) {
    i0 = lastIdx - 1;
    i1 = lastIdx;
    const span = Math.max(0.001, pts[lastIdx].distM - pts[lastIdx - 1].distM);
    t = (distM - pts[lastIdx - 1].distM) / span;
  } else {
    for (let i = 0; i < lastIdx; i++) {
      if (distM >= pts[i].distM && distM <= pts[i + 1].distM) {
        i0 = i;
        i1 = i + 1;
        const span = Math.max(0.001, pts[i1].distM - pts[i0].distM);
        t = (distM - pts[i0].distM) / span;
        break;
      }
    }
  }

  const a = pts[i0];
  const b = pts[i1];

  const cx = a.x + t * (b.x - a.x);
  const cy = a.y + t * (b.y - a.y);
  const cz = a.z + t * (b.z - a.z);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const horizLen = Math.max(0.001, Math.hypot(dx, dz));
  const fullLen = Math.max(0.001, Math.hypot(dx, dy, dz));

  const tx = dx / fullLen;
  const ty = dy / fullLen;
  const tz = dz / fullLen;

  // Horizontal unit tangent & left (+Z / West) normal
  const htx = dx / horizLen;
  const htz = dz / horizLen;
  const nx = -htz;
  const nz = htx;

  // For Three.js mesh facing +X, rotation.y = -atan2(htz, htx) aligns +X with (htx, 0, htz)
  const yaw = -Math.atan2(htz, htx);
  const pitch = Math.atan2(dy, horizLen);

  return {
    x: cx + nx * lateralZ,
    y: cy,
    z: cz + nz * lateralZ,
    groundY: cy,
    yaw,
    pitch,
    tx,
    ty,
    tz,
    nx,
    nz
  };
}

/**
 * Returns the real Bandung Utara terrain elevation at any world (x, z) by matching
 * the closest longitudinal coordinate along Jalan Gegerkalong Tengah.
 */
export function sampleTerrainElevation(worldX: number): number {
  const pts = OSM_ROAD_CENTERLINE;
  if (worldX <= pts[0].x) return pts[0].y;
  const last = pts[pts.length - 1];
  if (worldX >= last.x) return last.y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (worldX >= a.x && worldX <= b.x) {
      const t = (worldX - a.x) / Math.max(0.001, b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return 0;
}

/**
 * Estimates longitudinal distance along Jalan Gegerkalong Tengah (0..636.4 m) from a world X coordinate.
 */
export function estimateCorridorDistM(worldX: number): number {
  const pts = OSM_ROAD_CENTERLINE;
  if (worldX <= pts[0].x) return pts[0].distM;
  const last = pts[pts.length - 1];
  if (worldX >= last.x) return last.distM;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (worldX >= a.x && worldX <= b.x) {
      const t = (worldX - a.x) / Math.max(0.001, b.x - a.x);
      return a.distM + t * (b.distM - a.distM);
    }
  }
  return 0;
}

/**
 * Returns the human-readable landmark zone name along the 636 m corridor.
 */
export function getCorridorZoneLabel(distM: number): string {
  if (distM < 45) return 'Simpang Girang · UPI';
  if (distM < 175) return 'Zona Kos & Ruko Utara';
  if (distM < 225) return 'Drop-Off · Kampus IV UNPAS';
  if (distM < 302) return 'Parkir Khusus · Utara Pasar';
  if (distM < 322) return 'KPAD · Masjid Baiturahman';
  if (distM < 385) return 'Pasar Gegerkalong (355 m)';
  if (distM < 575) return 'Segmen Selatan · Ruko';
  return 'Simpang Jl. Gegerkalong Hilir';
}

/**
 * Builds a smooth 3D ribbon strip along the corridor centerline between [startM, endM]
 * at a given lateral offset and width, with clean UVs along length (U) and width (V).
 */
export function createCorridorRibbonGeometry(
  startM: number,
  endM: number,
  lateralCenterZ: number,
  width: number,
  yOffset: number,
  stepM = 3.0,
  uvMetersPerTileU = 8.0
): THREE.BufferGeometry {
  const steps = Math.max(2, Math.ceil((endM - startM) / stepM));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= steps; i++) {
    const d = startM + (i / steps) * (endM - startM);
    const left = sampleCorridorFrame(d, lateralCenterZ - width / 2);
    const right = sampleCorridorFrame(d, lateralCenterZ + width / 2);

    positions.push(left.x, left.y + yOffset, left.z);
    positions.push(right.x, right.y + yOffset, right.z);

    const u = (d - startM) / uvMetersPerTileU;
    uvs.push(u, 0);
    uvs.push(u, 1);

    if (i < steps) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a flat 3D road ribbon along an arbitrary OSM polyline (for Simpang Girang & connecting alleys).
 */
export function createPolylineRoadGeometry(
  points: { x: number; y: number; z: number }[],
  width: number,
  yOffset = 0.025
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let accum = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    if (i > 0) {
      accum += Math.hypot(p.x - prev.x, p.z - prev.z);
    }
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    const nx = -dz / len;
    const nz = dx / len;

    positions.push(p.x - nx * (width / 2), p.y + yOffset, p.z - nz * (width / 2));
    positions.push(p.x + nx * (width / 2), p.y + yOffset, p.z + nz * (width / 2));

    uvs.push(accum / 8, 0);
    uvs.push(accum / 8, 1);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sloping Bandung Utara terrain plane whose height follows the real elevation
 * of Jalan Gegerkalong Tengah (901 m at Simpang Girang -> 885 m at South).
 */
export function createSlopedTerrainGeometry(lengthX = 860, widthZ = 560): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(lengthX, widthZ, 72, 12);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = sampleTerrainElevation(x) - 0.30;
    pos.setY(i, y);
  }
  geo.computeVertexNormals();
  return geo;
}
