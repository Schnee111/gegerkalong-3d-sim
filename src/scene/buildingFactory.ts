import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createLeafClusterTexture,
  createSignTexture,
  createStorefrontInteriorTexture,
  createStripedAwningTexture,
  loadClayRoofPbr,
  loadCorrugatedPbr,
  loadFacadeTexture,
  loadGreyRoofPbr,
  loadWeatheredWallPbr,
  type FacadeKind
} from './textures';

export interface RukoSpec {
  width: number;
  depth: number;
  floors: number;
  wallHex: number;
  trimHex: number;
  roofType: 'tile-red' | 'tile-dark' | 'flat-parapet' | 'spandek-slope';
  shopName: string;
  shopSub: string;
  signBg: string;
  signFg: string;
  signAccent: string;
  awningHex: string;
  facingDir: 1 | -1;
  hasBladeSign?: boolean;
  hasPorchStall?: boolean;
}

const weatheredWallMaps = loadWeatheredWallPbr();
const clayRoofMaps = loadClayRoofPbr();
const greyRoofMaps = loadGreyRoofPbr();
const corrugatedMaps = loadCorrugatedPbr();
const storefrontInterior = createStorefrontInteriorTexture();

const sideWallMatCache = new Map<number, THREE.MeshStandardMaterial>();
const trimMatCache = new Map<number, THREE.MeshStandardMaterial>();
const awningMatCache = new Map<string, THREE.MeshStandardMaterial>();
const facadeMatCache = new Map<string, THREE.MeshStandardMaterial>();

function pushTranslatedBox(
  target: THREE.BufferGeometry[],
  sx: number,
  sy: number,
  sz: number,
  px: number,
  py: number,
  pz: number
): void {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(px, py, pz);
  target.push(geo);
}

function addMergedMesh(
  parent: THREE.Object3D,
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  castShadow = false,
  receiveShadow = false
): void {
  if (geos.length === 0) return;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
}

const sharedMaterials = {
  frame: new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4, metalness: 0.42 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x2c4a66,
    roughness: 0.06,
    metalness: 0.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05
  }),
  storeGlass: new THREE.MeshStandardMaterial({
    map: storefrontInterior,
    emissive: 0xffe4b5,
    emissiveIntensity: 0.25,
    roughness: 0.16
  }),
  concrete: new THREE.MeshStandardMaterial({
    color: 0xbeb9b0,
    map: weatheredWallMaps.map,
    normalMap: weatheredWallMaps.normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.9
  }),
  railing: new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.35, metalness: 0.7 }),
  acUnit: new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.55 }),
  pipe: new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.45, metalness: 0.35 }),
  tankBlue: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3 }),
  tankOrange: new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.3 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.58 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7c5434, roughness: 0.85 }),
  tileRed: new THREE.MeshStandardMaterial({
    map: clayRoofMaps.map,
    normalMap: clayRoofMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.78
  }),
  tileDark: new THREE.MeshStandardMaterial({
    map: greyRoofMaps.map,
    normalMap: greyRoofMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.74
  }),
  marketRoof: new THREE.MeshStandardMaterial({
    map: corrugatedMaps.map,
    normalMap: corrugatedMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.58,
    metalness: 0.35
  }),
  spandekRoof: new THREE.MeshStandardMaterial({
    color: 0x52606d,
    map: corrugatedMaps.map,
    normalMap: corrugatedMaps.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.5,
    metalness: 0.45
  })
};

function pickRukoFacadeKind(spec: RukoSpec): FacadeKind {
  const lower = spec.shopName.toLowerCase();
  if (spec.hasPorchStall || lower.includes('warung') || lower.includes('warteg') || lower.includes('bakso') || lower.includes('kopi')) {
    return 'warung';
  }
  let hash = 0;
  for (let i = 0; i < spec.shopName.length; i++) {
    hash = (hash * 31 + spec.shopName.charCodeAt(i)) | 0;
  }
  const mod = Math.abs(hash) % 3;
  if (mod === 0) return 'ruko';
  if (mod === 1) return 'toko';
  return 'ruko';
}

function blendTint(wallHex: number, strength = 0.2): THREE.Color {
  const white = new THREE.Color(0xffffff);
  const tint = new THREE.Color(wallHex);
  return white.lerp(tint, strength);
}

/**
 * Photorealistic Bandung Ruko / Warung / Toko (Jl. Gegerkalong Tengah):
 * - Full photorealistic orthographic elevation texture mapped to front facade (rolling doors,
 *   illuminated interiors, louvered wooden shutters, AC units, power meters, tropical weathering).
 * - Real 3D architectural relief layered over the facade: concrete slab ledges, corner pilasters,
 *   cantilevered balcony slabs & railings, sloped awnings on steel posts, shop fascia + blade signs,
 *   side-wall weathered plaster with recessed windows, and Poly Haven scanned tiled/corrugated roofs.
 */
export function createDetailedRuko(spec: RukoSpec): THREE.Group {
  const g = new THREE.Group();
  const floorH = 3.25;
  const totalH = spec.floors * floorH;
  const w = spec.width;
  const d = spec.depth;
  const f = spec.facingDir;
  const frontZ = f * (d / 2);

  // Cached Weathered Bandung plaster for side, rear, and structural walls
  let sideWallMat = sideWallMatCache.get(spec.wallHex);
  if (!sideWallMat) {
    sideWallMat = new THREE.MeshStandardMaterial({
      color: blendTint(spec.wallHex, 0.45),
      map: weatheredWallMaps.map,
      normalMap: weatheredWallMaps.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.88
    });
    sideWallMatCache.set(spec.wallHex, sideWallMat);
  }

  let trimMat = trimMatCache.get(spec.trimHex);
  if (!trimMat) {
    trimMat = new THREE.MeshStandardMaterial({
      color: spec.trimHex,
      map: weatheredWallMaps.map,
      roughness: 0.78
    });
    trimMatCache.set(spec.trimHex, trimMat);
  }

  const concreteGeos: THREE.BufferGeometry[] = [];
  const trimGeos: THREE.BufferGeometry[] = [];
  const railingGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const frameGeos: THREE.BufferGeometry[] = [];
  const acGeos: THREE.BufferGeometry[] = [];

  // Main building volume (weathered plaster sides/back)
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, totalH, d), sideWallMat);
  body.position.set(0, totalH / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Photorealistic Front Elevation Plane (cached by facadeKind, repX, repY, wallHex)
  const facadeKind = pickRukoFacadeKind(spec);
  const repX = Math.max(1, Math.round(w / 9.2));
  const repY = spec.floors >= 3 ? 1.45 : 1;
  const facadeKey = `${facadeKind}_${repX}_${repY}_${spec.wallHex}`;
  let facadeMat = facadeMatCache.get(facadeKey);
  if (!facadeMat) {
    const facadeTex = loadFacadeTexture(facadeKind, repX, repY);
    facadeMat = new THREE.MeshStandardMaterial({
      map: facadeTex,
      color: blendTint(spec.wallHex, facadeKind === 'ruko' ? 0.22 : 0.1),
      normalMap: weatheredWallMaps.normalMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.82,
      metalness: 0.04
    });
    facadeMatCache.set(facadeKey, facadeMat);
  }

  const facadePlane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, totalH - 0.1), facadeMat);
  facadePlane.position.set(0, totalH / 2, frontZ + f * 0.018);
  facadePlane.rotation.y = f === 1 ? 0 : Math.PI;
  facadePlane.receiveShadow = true;
  g.add(facadePlane);

  // Deep concrete foundation skirt + compact front threshold step
  pushTranslatedBox(concreteGeos, w + 0.04, 1.4, d + 0.04, 0, -0.7, 0);
  pushTranslatedBox(concreteGeos, w + 0.04, 0.22, 0.2, 0, 0.11, frontZ + f * 0.1);

  // 3D Structural Corner Pilasters
  for (const px of [-w / 2 + 0.18, w / 2 - 0.18]) {
    pushTranslatedBox(trimGeos, 0.36, totalH + 0.05, 0.18, px, totalH / 2, frontZ + f * 0.04);
  }

  // Horizontal concrete slab drip ledges between floors
  for (let fl = 1; fl <= spec.floors; fl++) {
    pushTranslatedBox(concreteGeos, w + 0.16, 0.18, d + 0.22, 0, fl * floorH, 0);
  }

  // Side-wall recessed windows
  for (const sideX of [-w / 2, w / 2]) {
    const sideDir = sideX > 0 ? 1 : -1;
    for (let fl = 1; fl < spec.floors; fl++) {
      pushTranslatedBox(glassGeos, 0.1, 1.25, 1.1, sideX + sideDir * 0.02, fl * floorH + 1.65, f * (d * 0.18));
      pushTranslatedBox(frameGeos, 0.14, 1.36, 1.22, sideX + sideDir * 0.01, fl * floorH + 1.65, f * (d * 0.18));
    }
  }

  // Rainwater downspout pipe
  const downspout = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, totalH, 6), sharedMaterials.pipe);
  downspout.position.set(w / 2 - 0.18, totalH / 2, frontZ + f * 0.1);
  g.add(downspout);

  // Shopfront Fascia Signboard
  const signTex = createSignTexture(
    spec.shopName,
    spec.shopSub,
    spec.signBg,
    spec.signFg,
    spec.signAccent
  );
  const signW = Math.min(w * 0.86, 9.0);
  const signFaceMat = new THREE.MeshBasicMaterial({ map: signTex });
  const signMesh = new THREE.Mesh(
    new THREE.BoxGeometry(signW, 0.78, 0.14),
    [
      sharedMaterials.steelDark,
      sharedMaterials.steelDark,
      sharedMaterials.steelDark,
      sharedMaterials.steelDark,
      f === 1 ? signFaceMat : sharedMaterials.steelDark,
      f === -1 ? signFaceMat : sharedMaterials.steelDark
    ]
  );
  signMesh.position.set(0, floorH - 0.12, frontZ + f * 0.1);
  signMesh.castShadow = true;
  g.add(signMesh);

  // Compact high-mounted blade sign (stays behind road curb envelope)
  if (spec.hasBladeSign) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.25, 0.46), signFaceMat);
    blade.position.set(w / 2 - 0.38, floorH + 1.38, frontZ + f * 0.25);
    blade.castShadow = true;
    g.add(blade);
  }

  // Cantilevered wall-mounted awning canopy (cached material by awningHex)
  if (facadeKind !== 'warung') {
    let awningMat = awningMatCache.get(spec.awningHex);
    if (!awningMat) {
      const awningTex = createStripedAwningTexture(spec.awningHex, '#f8fafc');
      awningMat = new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.72 });
      awningMatCache.set(spec.awningHex, awningMat);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.07, 0.44), awningMat);
    awning.position.set(0, floorH - 0.52, frontZ + f * 0.22);
    awning.rotation.x = f * 0.2;
    awning.castShadow = true;
    g.add(awning);
  }

  // Optional 3D wooden warung display showcase / glass vitrine on deep-setback lots only
  if (spec.hasPorchStall) {
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.92, 0.48), sharedMaterials.wood);
    counter.position.set(-w * 0.24, 0.7, frontZ + f * 0.3);
    counter.castShadow = true;
    g.add(counter);

    const vitrine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.54, 0.4), sharedMaterials.storeGlass);
    vitrine.position.set(-w * 0.24, 1.44, frontZ + f * 0.3);
    g.add(vitrine);
  }

  // Slim cantilevered upper-floor balcony slab + railing + AC condenser (batched per ruko)
  for (let fl = 1; fl < spec.floors; fl++) {
    const baseY = fl * floorH;
    const balcW = w * 0.52;
    const balcX = w * 0.18;

    pushTranslatedBox(concreteGeos, balcW, 0.15, 0.32, balcX, baseY + 0.36, frontZ + f * 0.16);
    pushTranslatedBox(railingGeos, balcW, 0.05, 0.05, balcX, baseY + 1.12, frontZ + f * 0.3);

    const railPosts = Math.max(4, Math.floor(balcW / 0.95));
    for (let rp = 0; rp <= railPosts; rp++) {
      const rx = balcX - balcW / 2 + (rp / railPosts) * balcW;
      pushTranslatedBox(railingGeos, 0.034, 0.72, 0.034, rx, baseY + 0.76, frontZ + f * 0.3);
    }

    pushTranslatedBox(acGeos, 0.68, 0.48, 0.24, balcX + balcW * 0.36, baseY + 0.74, frontZ + f * 0.16);
  }

  // Varied architectural roof silhouettes (Poly Haven real scanned clay/dark tiles & spandek)
  if (spec.roofType === 'flat-parapet') {
    pushTranslatedBox(trimGeos, w + 0.16, 0.82, d + 0.16, 0, totalH + 0.41, 0);
    pushTranslatedBox(trimGeos, w * 0.56, 0.62, 0.36, 0, totalH + 1.12, frontZ);
  } else if (spec.roofType === 'spandek-slope') {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.14, d + 1.2), sharedMaterials.spandekRoof);
    slope.position.set(0, totalH + 0.82, 0);
    slope.rotation.x = f * 0.16;
    slope.castShadow = true;
    g.add(slope);
  } else {
    const roofMat = spec.roofType === 'tile-red' ? sharedMaterials.tileRed : sharedMaterials.tileDark;
    const roofH = 2.3;
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-d / 2 - 0.42, 0);
    gableShape.lineTo(0, roofH);
    gableShape.lineTo(d / 2 + 0.42, 0);
    gableShape.closePath();

    const roofGeo = new THREE.ExtrudeGeometry(gableShape, { depth: w + 0.24, bevelEnabled: false });
    roofGeo.rotateY(Math.PI / 2);
    roofGeo.translate(-(w + 0.24) / 2, totalH, 0);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.castShadow = true;
    roof.receiveShadow = true;
    g.add(roof);

    pushTranslatedBox(concreteGeos, w + 0.36, 0.24, 0.3, 0, totalH + roofH, 0);
  }

  addMergedMesh(g, concreteGeos, sharedMaterials.concrete, true, true);
  addMergedMesh(g, trimGeos, trimMat, true, true);
  addMergedMesh(g, railingGeos, sharedMaterials.railing, false, false);
  addMergedMesh(g, glassGeos, sharedMaterials.glass, false, false);
  addMergedMesh(g, frameGeos, sharedMaterials.frame, false, false);
  addMergedMesh(g, acGeos, sharedMaterials.acUnit, true, false);

  if (spec.floors >= 3) {
    const tank = createWaterTank(spec.floors % 2 === 0 ? 'blue' : 'orange');
    tank.position.set(-w * 0.26, totalH + (spec.roofType === 'flat-parapet' ? 0.82 : 0.65), -f * (d * 0.25));
    g.add(tank);
  }

  return g;
}

const kosSideWallMat = new THREE.MeshStandardMaterial({
  color: 0xeae4d8,
  map: weatheredWallMaps.map,
  normalMap: weatheredWallMaps.normalMap,
  normalScale: new THREE.Vector2(0.42, 0.42),
  roughness: 0.88
});
const kosAccentWallMat = new THREE.MeshStandardMaterial({
  color: 0x64748b,
  map: weatheredWallMaps.map,
  roughness: 0.84
});

/**
 * Photorealistic 4-Story UPI Student Kos (Jl. Gegerkalong Tengah):
 * - Full photographic 4-story kos elevation (balcony doors, windows, breeze blocks/roster,
 *   hanging laundry, potted plants, ground-floor motorcycle parking gate & weathered concrete).
 * - Layered with real 3D projecting floor slabs, railings, structural divider fins,
 *   side stairwell tower, rooftop parapet, and twin blue/orange water tanks (toren air).
 */
export function createDetailedKosBuilding(w: number, d: number, floors = 4): THREE.Group {
  const g = new THREE.Group();
  const floorH = 3.05;
  const totalH = floors * floorH;

  const concreteGeos: THREE.BufferGeometry[] = [];
  const accentGeos: THREE.BufferGeometry[] = [];
  const railingGeos: THREE.BufferGeometry[] = [];

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, totalH, d), kosSideWallMat);
  body.position.y = totalH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  pushTranslatedBox(concreteGeos, w + 0.06, 1.5, d + 0.06, 0, -0.75, 0);

  // Photorealistic 4-story Kos Front Elevation
  const kosRepX = Math.max(1, Math.round((w - 3.2) / 17.5));
  const kosKey = `kos_${kosRepX}`;
  let kosFacadeMat = facadeMatCache.get(kosKey);
  if (!kosFacadeMat) {
    const kosTex = loadFacadeTexture('kos', kosRepX, 1);
    kosFacadeMat = new THREE.MeshStandardMaterial({
      map: kosTex,
      normalMap: weatheredWallMaps.normalMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.82
    });
    facadeMatCache.set(kosKey, kosFacadeMat);
  }
  const kosFront = new THREE.Mesh(new THREE.PlaneGeometry(w - 3.3, totalH - 0.1), kosFacadeMat);
  kosFront.position.set(-1.6, totalH / 2, d / 2 + 0.02);
  kosFront.receiveShadow = true;
  g.add(kosFront);

  // Flush side stairwell tower + structural bay pilasters + parapet (batched into 1 accent mesh)
  pushTranslatedBox(accentGeos, 3.2, totalH + 1.8, 3.6, w / 2 - 1.5, (totalH + 1.8) / 2, d / 2 - 1.72);

  const bays = Math.max(3, Math.floor((w - 3.2) / 5.5));
  const bayW = (w - 3.2) / bays;
  for (let b = 0; b <= bays; b++) {
    const px = -w / 2 + b * bayW;
    pushTranslatedBox(accentGeos, 0.24, totalH, 0.2, px, totalH / 2, d / 2 + 0.08);
  }
  pushTranslatedBox(accentGeos, w + 0.2, 0.95, d + 0.2, 0, totalH + 0.48, 0);

  for (let fl = 1; fl < floors; fl++) {
    const y = fl * floorH;
    pushTranslatedBox(concreteGeos, w - 3.0, 0.18, 0.34, -1.5, y, d / 2 + 0.16);
    pushTranslatedBox(railingGeos, w - 3.2, 0.06, 0.06, -1.6, y + 0.9, d / 2 + 0.31);
  }

  addMergedMesh(g, concreteGeos, sharedMaterials.concrete, true, true);
  addMergedMesh(g, accentGeos, kosAccentWallMat, true, true);
  addMergedMesh(g, railingGeos, sharedMaterials.railing, false, false);

  const tank1 = createWaterTank('blue');
  tank1.position.set(-w * 0.28, totalH + 0.95, -d * 0.15);
  g.add(tank1);
  const tank2 = createWaterTank('orange');
  tank2.position.set(-w * 0.15, totalH + 0.95, -d * 0.15);
  g.add(tank2);

  const signTex = createSignTexture('KAWASAN KOS UPI', 'Gegerkalong Tengah · 4 Lantai', '#1e293b', '#f8fafc', '#38bdf8');
  const sign = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.7, 0.16), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(-1.5, totalH + 1.55, d / 2 + 0.12);
  g.add(sign);

  return g;
}

/**
 * Photorealistic Traditional Pasar Gegerkalong Complex:
 * - Full-width photorealistic open-market colonnade backdrop (glowing pendant bulbs,
 *   vegetable & fruit baskets, vendors, weathered tiled plinth, rusted corrugated eaves).
 * - Framed by real 3D concrete colonnade columns, 3D Gapura Pasar Gegerkalong entrance arch,
 *   3D street-edge wooden produce stalls with blue/orange tarpaulin canopies, and double-pitched
 *   Poly Haven corrugated metal roof + clerestory monitor.
 */
export function createPasarGegerkalong(): THREE.Group {
  const g = new THREE.Group();
  const W = 76;
  const D = 18;
  const wallH = 4.8;

  // Main concrete market apron
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 0.38, D + 5.5), sharedMaterials.concrete);
  floor.position.set(0, 0.19, -0.8);
  floor.receiveShadow = true;
  g.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xeae0ce,
    map: weatheredWallMaps.map,
    normalMap: weatheredWallMaps.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.88
  });

  // Back & side masonry walls
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, wallH, 0.5), wallMat);
  backWall.position.set(0, wallH / 2 + 0.38, D / 2 - 0.25);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  g.add(backWall);

  for (const sx of [-W / 2 + 0.25, W / 2 - 0.25]) {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallH, D), wallMat);
    sideWall.position.set(sx, wallH / 2 + 0.38, 0);
    sideWall.castShadow = true;
    g.add(sideWall);
  }

  // Photorealistic Pasar Gegerkalong Open-Stall Colonnade Elevation (4 seamless bays across 76 m)
  const pasarTex = loadFacadeTexture('pasar', 4, 1);
  const pasarFacadeMat = new THREE.MeshStandardMaterial({
    map: pasarTex,
    emissive: 0x3b2a14,
    emissiveMap: pasarTex,
    emissiveIntensity: 0.22,
    roughness: 0.84
  });
  const pasarFront = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.8, wallH), pasarFacadeMat);
  pasarFront.position.set(0, wallH / 2 + 0.38, -D / 2 + 0.85);
  pasarFront.rotation.y = Math.PI;
  pasarFront.receiveShadow = true;
  g.add(pasarFront);

  // Real 3D Front Colonnade Columns + Steel Trusses + Warm Pendant Lamps
  const colMat = new THREE.MeshStandardMaterial({
    color: 0xd9cbb4,
    map: weatheredWallMaps.map,
    roughness: 0.82
  });
  const lampBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfbbf24,
    emissiveIntensity: 1.5
  });
  const numCols = 11;
  for (let i = 0; i < numCols; i++) {
    const cx = -W / 2 + 1.2 + (i / (numCols - 1)) * (W - 2.4);
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.58, wallH, 0.58), colMat);
    col.position.set(cx, wallH / 2 + 0.38, -D / 2 + 0.45);
    col.castShadow = true;
    g.add(col);

    const truss = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, D - 1.2), sharedMaterials.steelDark);
    truss.position.set(cx, wallH + 0.25, 0);
    g.add(truss);

    if (i % 2 === 1) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), lampBulbMat);
      lamp.position.set(cx, wallH - 0.32, -D / 2 + 0.25);
      g.add(lamp);
    }
  }

  // Front Street-Edge 3D Produce Stalls + Tarpaulin Tents (Tenda Terpal Biru/Oranye)
  const tarpBlueMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.8 });
  const tarpOrangeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 });
  const crateColors = [0x15803d, 0xd97706, 0xb91c1c, 0xca8a04, 0x0f766e, 0xea580c];

  for (let i = 0; i < 12; i++) {
    const sx = -W / 2 + 4.5 + i * 6.0;
    if (Math.abs(sx) < 6.5) continue; // Keep central Gapura entrance wide open

    const stall = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 2.0), sharedMaterials.wood);
    stall.position.set(sx, 0.82, -D / 2 - 1.3);
    stall.castShadow = true;
    g.add(stall);

    for (let c = -1; c <= 1; c++) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.4, 0.88),
        new THREE.MeshStandardMaterial({ color: crateColors[(i + c + 4) % crateColors.length], roughness: 0.82 })
      );
      crate.position.set(sx + c * 1.32, 1.44, -D / 2 - 1.3);
      g.add(crate);

      const mound = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: crateColors[(i + c + 2) % crateColors.length], roughness: 0.9 })
      );
      mound.scale.set(1.2, 0.65, 0.9);
      mound.position.set(sx + c * 1.32, 1.62, -D / 2 - 1.3);
      g.add(mound);
    }

    const tarp = new THREE.Mesh(
      new THREE.BoxGeometry(5.3, 0.08, 3.4),
      i % 2 === 0 ? tarpBlueMat : tarpOrangeMat
    );
    tarp.position.set(sx, 3.15, -D / 2 - 1.65);
    tarp.rotation.x = -0.22;
    tarp.castShadow = true;
    g.add(tarp);

    for (const px of [-2.3, 2.3]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.75, 6), sharedMaterials.steelDark);
      pole.position.set(sx + px, 1.7, -D / 2 - 3.05);
      g.add(pole);
    }
  }

  // Maroon Fascia Beam
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.4, 0.72, 0.82),
    new THREE.MeshStandardMaterial({ color: 0x8b1e24, roughness: 0.7 })
  );
  beam.position.set(0, wallH + 0.38, -D / 2 + 0.45);
  beam.castShadow = true;
  g.add(beam);

  // Double-pitched main corrugated roof + clerestory monitor roof
  const mainGable = new THREE.Shape();
  mainGable.moveTo(-D / 2 - 1.4, 0);
  mainGable.lineTo(0, 3.4);
  mainGable.lineTo(D / 2 + 1.4, 0);
  mainGable.closePath();

  const mainRoofGeo = new THREE.ExtrudeGeometry(mainGable, { depth: W + 2.2, bevelEnabled: false });
  mainRoofGeo.rotateY(Math.PI / 2);
  mainRoofGeo.translate(-(W + 2.2) / 2, wallH + 0.58, 0);
  const mainRoof = new THREE.Mesh(mainRoofGeo, sharedMaterials.marketRoof);
  mainRoof.castShadow = true;
  mainRoof.receiveShadow = true;
  g.add(mainRoof);

  const monitorBase = new THREE.Mesh(
    new THREE.BoxGeometry(W - 8, 1.15, 3.2),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
  );
  monitorBase.position.set(0, wallH + 3.88, 0);
  g.add(monitorBase);

  const monGable = new THREE.Shape();
  monGable.moveTo(-2.3, 0);
  monGable.lineTo(0, 1.1);
  monGable.lineTo(2.3, 0);
  monGable.closePath();
  const monRoofGeo = new THREE.ExtrudeGeometry(monGable, { depth: W - 6, bevelEnabled: false });
  monRoofGeo.rotateY(Math.PI / 2);
  monRoofGeo.translate(-(W - 6) / 2, wallH + 4.42, 0);
  const monRoof = new THREE.Mesh(monRoofGeo, sharedMaterials.marketRoof);
  monRoof.castShadow = true;
  g.add(monRoof);

  // Grand Gapura Entrance Portal with twin masonry piers + tiled mini roof
  for (const px of [-5.8, 5.8]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.4, 1.1), wallMat);
    pier.position.set(px, 2.7, -D / 2 - 2.6);
    pier.castShadow = true;
    g.add(pier);
  }
  const portalArch = new THREE.Mesh(
    new THREE.BoxGeometry(13.6, 2.4, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.7 })
  );
  portalArch.position.set(0, 5.3, -D / 2 - 2.6);
  portalArch.castShadow = true;
  g.add(portalArch);

  const signTex = createSignTexture(
    'PASAR GEGERKALONG',
    'PD Pasar Bermartabat Kota Bandung',
    '#7c2d12',
    '#fef3c7',
    '#f59e0b'
  );
  const signPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(12.8, 2.1),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  signPlane.position.set(0, 5.32, -D / 2 - 3.24);
  signPlane.rotation.y = Math.PI;
  g.add(signPlane);

  const roofSign = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 3.6),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  roofSign.position.set(0, wallH + 7.2, 0);
  g.add(roofSign);

  return g;
}

export function createWaterTank(color: 'blue' | 'orange'): THREE.Group {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), sharedMaterials.steelDark);
  stand.position.y = 0.25;
  g.add(stand);

  const mat = color === 'blue' ? sharedMaterials.tankBlue : sharedMaterials.tankOrange;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 1.35, 12), mat);
  body.position.y = 1.15;
  body.castShadow = true;
  g.add(body);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.y = 1.82;
  g.add(dome);
  return g;
}

export function createUtilityPole(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 8.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.65, metalness: 0.35 })
  );
  pole.position.y = 4.1;
  pole.castShadow = true;
  g.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.6), sharedMaterials.steelDark);
  arm.position.set(0, 7.6, 0);
  g.add(arm);

  const insMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
  for (const iz of [-0.65, 0, 0.65]) {
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 8), insMat);
    ins.position.set(0, 7.75, iz);
    g.add(ins);
  }

  const lampArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.8), sharedMaterials.steelDark);
  lampArm.position.set(0, 6.4, -0.9);
  g.add(lampArm);

  const luminaire = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.12, 0.65),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfde68a, emissiveIntensity: 0.75 })
  );
  luminaire.position.set(0, 6.32, -1.65);
  g.add(luminaire);
  return g;
}

const sharedLeafTex = createLeafClusterTexture();
const sharedLeafMat = new THREE.MeshStandardMaterial({
  map: sharedLeafTex,
  alphaTest: 0.42,
  side: THREE.DoubleSide,
  roughness: 0.88
});
const sharedBarkMat = new THREE.MeshStandardMaterial({ color: 0x523c2c, roughness: 0.95 });

export function createTropicalTree(scale = 1.0): THREE.Group {
  const g = new THREE.Group();
  // Tapered main trunk with root flare
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.24, 2.7, 7), sharedBarkMat);
  trunk.position.y = 1.35;
  trunk.castShadow = true;
  g.add(trunk);

  // 4 organic splayed limbs supporting layered leafy sub-canopies
  const branches: [number, number, number, number, number][] = [
    [0.45, 2.75, 0.25, -0.52, 0.25],
    [-0.42, 2.8, -0.28, 0.48, -0.22],
    [0.18, 2.9, -0.45, -0.25, -0.48],
    [-0.22, 2.85, 0.42, 0.28, 0.45]
  ];
  for (const [bx, by, bz, rz, rx] of branches) {
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.095, 1.55, 6), sharedBarkMat);
    limb.position.set(bx, by, bz);
    limb.rotation.set(rx, 0, rz);
    limb.castShadow = true;
    g.add(limb);
  }

  // Layered botanical alpha-cutout leaf-cluster cards (natural leafy silhouette, zero round balls!)
  const clusters: [number, number, number, number][] = [
    [0, 4.15, 0, 2.3],
    [0.95, 3.45, 0.55, 1.85],
    [-0.92, 3.5, -0.52, 1.9],
    [0.42, 3.65, -0.88, 1.75],
    [-0.5, 3.6, 0.85, 1.75],
    [0.15, 4.65, 0.1, 1.55]
  ];
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  for (const [cx, cy, cz, sz] of clusters) {
    for (let k = 0; k < 3; k++) {
      const card = new THREE.Mesh(cardGeo, sharedLeafMat);
      card.position.set(cx, cy, cz);
      card.scale.setScalar(sz);
      card.rotation.set((k - 1) * 0.48, (k * Math.PI) / 3 + cx, (k === 1 ? 0.3 : -0.25));
      card.castShadow = true;
      card.receiveShadow = true;
      g.add(card);
    }
  }

  g.scale.setScalar(scale);
  return g;
}
