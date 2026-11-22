import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  OSM_BG_BUILDINGS,
  OSM_FRONT_BUILDINGS,
  OSM_LANDMARKS,
  OSM_SIDE_ROADS,
  type OsmFrontBuilding
} from '../config/osmCorridorData';
import { CORRIDOR, SCENARIOS, type OneWayDirection, type ScenarioKey } from '../config/scenarios';
import {
  createDetailedKosBuilding,
  createDetailedRuko,
  createTropicalTree,
  createUtilityPole,
  type RukoSpec
} from './buildingFactory';
import {
  createCorridorRibbonGeometry,
  createPolylineRoadGeometry,
  createSlopedTerrainGeometry,
  sampleCorridorFrame
} from './roadSpline';
import {
  createBandungTrashBin,
  createConvexMirror,
  createDishubOfficer,
  createGerobakCart,
  createPlanterBox,
  createSpeedBump,
  createStreetNamePost,
  createTrafficCone,
  createWarningBeacon,
  type AnimatedOfficer
} from './streetProps';
import {
  createKanstinCurbTexture,
  createLeafClusterTexture,
  createNoStopSignTexture,
  createSignTexture,
  loadAsphaltPbr,
  loadClayRoofPbr,
  loadCorrugatedPbr,
  loadFacadeTexture,
  loadGreyRoofPbr,
  loadPaversPbr,
  loadWeatheredWallPbr
} from './textures';
import { buildDetailedIndonesianScooter, createPedestrianMesh } from './vehicleFactory';

export interface CorridorHandles {
  sidewalkGroup: THREE.Group;
  offstreetGroup: THREE.Group;
  baselineClutterGroup: THREE.Group;
  noStopSignGroup: THREE.Group;
  twoWayArrows: THREE.Group;
  oneWayPagiArrows: THREE.Group;
  oneWaySoreArrows: THREE.Group;
  officers: AnimatedOfficer[];
  beaconBulbMat: THREE.MeshStandardMaterial;
  updateForScenario(key: ScenarioKey, oneWayDir: OneWayDirection): void;
}

interface ShopPreset {
  name: string;
  sub: string;
  bg: string;
  fg: string;
  accent: string;
  awning: string;
  wall: number;
  trim: number;
  roof: RukoSpec['roofType'];
  blade?: boolean;
  porch?: boolean;
}

// Authentic Gegerkalong Tengah shopfront presets (verified local corridor character)
const SHOP_PRESETS: ShopPreset[] = [
  { name: 'KANTOR KAS BANK BJB', sub: 'Gegerkalong Tengah', bg: '#0c4a6e', fg: '#ffffff', accent: '#facc15', awning: '#0369a1', wall: 0xf1ede4, trim: 0x1e3a5f, roof: 'flat-parapet', blade: true },
  { name: 'BAROKAH MM', sub: 'Jl. Gegerkalong Tengah No. 23', bg: '#1e3a8a', fg: '#ffffff', accent: '#f59e0b', awning: '#1d4ed8', wall: 0xebe6db, trim: 0x334155, roof: 'tile-dark', blade: true },
  { name: 'WARUNG 46', sub: 'Sembako & Harian · No. 46', bg: '#166534', fg: '#fefce8', accent: '#facc15', awning: '#15803d', wall: 0xe6e0d2, trim: 0x57534e, roof: 'tile-red', porch: true },
  { name: 'FOTOKOPI & PRINT UPI', sub: 'Jilid · ATK · Cetak 24 Jam', bg: '#1d4ed8', fg: '#ffffff', accent: '#facc15', awning: '#2563eb', wall: 0xf0ebe0, trim: 0x475569, roof: 'flat-parapet', blade: true },
  { name: 'WARTEG GEGERKALONG', sub: 'Masakan Rumahan Mahasiswa', bg: '#15803d', fg: '#ffffff', accent: '#fbbf24', awning: '#16a34a', wall: 0xe8e2d5, trim: 0x4b5563, roof: 'tile-red', porch: true },
  { name: 'APOTEK GEGERKALONG', sub: 'Obat Resep & Alkes', bg: '#0f766e', fg: '#ffffff', accent: '#5eead4', awning: '#0d9488', wall: 0xf4f1ea, trim: 0x1e293b, roof: 'flat-parapet', blade: true },
  { name: 'LAUNDRY KILOAN UPI', sub: 'Cuci Setrika Express', bg: '#0284c7', fg: '#ffffff', accent: '#38bdf8', awning: '#0369a1', wall: 0xeee9df, trim: 0x64748b, roof: 'spandek-slope' },
  { name: 'WARUNG NASI SUNDA', sub: 'Ayam Goreng · Sambal Dadak', bg: '#9a3412', fg: '#fef3c7', accent: '#f59e0b', awning: '#b45309', wall: 0xe7dfd1, trim: 0x78350f, roof: 'tile-red', porch: true },
  { name: 'TOKO BERAS & SEMBAKO', sub: 'Grosir Pasar Gegerkalong', bg: '#7c2d12', fg: '#fef3c7', accent: '#fb923c', awning: '#c2410c', wall: 0xeae1d3, trim: 0x57534e, roof: 'tile-dark', porch: true },
  { name: 'WARKOP & KOPI BANDUNG', sub: 'Kopi Tubruk · Mie Rebus', bg: '#3f3f46', fg: '#f8fafc', accent: '#eab308', awning: '#52525b', wall: 0xe9e4da, trim: 0x27272a, roof: 'spandek-slope', porch: true },
  { name: 'KONTER PULSA & SERVIS', sub: 'Aksesoris HP · Kuota', bg: '#8b1e24', fg: '#ffffff', accent: '#fcd34d', awning: '#991b1b', wall: 0xefece4, trim: 0x334155, roof: 'flat-parapet', blade: true },
  { name: 'BAKSO & MIE AYAM', sub: 'Porsi Mahasiswa · Halal', bg: '#b45309', fg: '#fffbeb', accent: '#fde047', awning: '#d97706', wall: 0xebe3d5, trim: 0x6b5b4d, roof: 'tile-red', porch: true }
];

const PASAR_FRONT_PRESETS: ShopPreset[] = [
  { name: 'KIOS SAYUR & BUMBU', sub: 'Pasar Gegerkalong No. 35A', bg: '#166534', fg: '#fefce8', accent: '#facc15', awning: '#15803d', wall: 0xe8e0d0, trim: 0x4b5563, roof: 'spandek-slope', porch: true },
  { name: 'TOKO BERAS & SEMBAKO', sub: 'Grosir Pasar Gegerkalong', bg: '#7c2d12', fg: '#fef3c7', accent: '#fb923c', awning: '#c2410c', wall: 0xeae1d3, trim: 0x57534e, roof: 'tile-dark', porch: true },
  { name: 'KIOS BUAH & LAUK SEGAR', sub: 'Pasar Rakyat Gegerkalong', bg: '#9a3412', fg: '#fffbeb', accent: '#fde047', awning: '#b45309', wall: 0xe7dfd1, trim: 0x78350f, roof: 'spandek-slope', porch: true }
];

const HILIR_PRESETS: ShopPreset[] = [
  { name: 'INDOMARET GEGERKALONG', sub: 'Simpang Jl. Gegerkalong Hilir', bg: '#1d4ed8', fg: '#ffffff', accent: '#facc15', awning: '#dc2626', wall: 0xf4f4f0, trim: 0x1e3a8a, roof: 'flat-parapet', blade: true },
  { name: 'ALFAMART GEGERKALONG', sub: 'Jl. Gegerkalong Hilir · 24 Jam', bg: '#b91c1c', fg: '#ffffff', accent: '#facc15', awning: '#1d4ed8', wall: 0xf4f4f0, trim: 0x991b1b, roof: 'flat-parapet', blade: true }
];

export function buildCorridorEnvironment(scene: THREE.Scene): CorridorHandles {
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const visLen = CORRIDOR.lengthM;

  // 1. Sloping Bandung Utara Terrain (901 m dpl at Simpang Girang -> 889 m dpl at Pasar -> 875 m dpl at Simpang Hilir)
  const terrainGeo = createSlopedTerrainGeometry(1180, 760);
  const ground = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({
      color: 0xc5cbb7,
      roughness: 0.97,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    })
  );
  ground.receiveShadow = true;
  worldGroup.add(ground);

  // Dense Bandung Utara tropical tree canopy surrounding the urban blocks (collision-checked!)
  addNeighborhoodCanopy(worldGroup);

  // 2. Real Curved & Sloping OSM Asphalt Carriageway (Way 125178979: Jalan Gegerkalong Tengah 636,4 m)
  const asphalt = loadAsphaltPbr();
  asphalt.map.repeat.set(1, 1);
  if (asphalt.normalMap) asphalt.normalMap.repeat.set(1, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphalt.map,
    normalMap: asphalt.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.84,
    metalness: 0.05
  });

  const mainRoadGeo = createCorridorRibbonGeometry(-16, visLen + 6, 0, CORRIDOR.roadWidthM, 0.04, 2.5, 7.5);
  const mainRoad = new THREE.Mesh(mainRoadGeo, roadMat);
  mainRoad.receiveShadow = true;
  worldGroup.add(mainRoad);

  // 3. All Real OpenStreetMap Side Roads & Alleys (Simpang Girang, Gang Al Barkah, Gg 9, KPAD Kartika II, Jl. Haji Ridho, Lorong Pasar)
  const alleyMat = new THREE.MeshStandardMaterial({
    color: 0xc2c6cc,
    map: asphalt.map,
    roughness: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  for (const sr of OSM_SIDE_ROADS) {
    const isMajor = sr.name.toLowerCase().includes('girang') || sr.highway === 'tertiary' || sr.highway === 'secondary';
    const srGeo = createPolylineRoadGeometry(sr.points, sr.width, isMajor ? 0.032 : 0.02);
    const srMesh = new THREE.Mesh(srGeo, isMajor ? roadMat : alleyMat);
    srMesh.receiveShadow = true;
    worldGroup.add(srMesh);
  }

  // Concrete drainage gutters + iron grates hugging both curved road edges (no sidewalk in Baseline)
  const gutterMat = new THREE.MeshStandardMaterial({ color: 0x8c929c, roughness: 0.88 });
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.55, metalness: 0.65 });
  for (const sideSign of [-1, 1]) {
    const gutterLat = sideSign * (CORRIDOR.roadWidthM / 2 + 0.17);
    const gutterGeo = createCorridorRibbonGeometry(0, visLen, gutterLat, 0.34, 0.045, 3.0, 6.0);
    const gutter = new THREE.Mesh(gutterGeo, gutterMat);
    gutter.receiveShadow = true;
    worldGroup.add(gutter);

    for (let m = 16; m < visLen - 16; m += 24) {
      const f = sampleCorridorFrame(m, gutterLat);
      const grate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.025, 0.28), grateMat);
      grate.position.set(f.x, f.y + 0.055, f.z);
      grate.rotation.order = 'YXZ';
      grate.rotation.y = f.yaw;
      grate.rotation.z = f.pitch;
      worldGroup.add(grate);
    }
  }

  // Speed bumps flanking real Pasar Gegerkalong zone (314 m & 358 m)
  for (const mBump of [314, 358]) {
    const f = sampleCorridorFrame(mBump, 0);
    const bump = createSpeedBump(CORRIDOR.roadWidthM);
    bump.position.set(f.x, f.y + 0.045, f.z);
    bump.rotation.order = 'YXZ';
    bump.rotation.y = f.yaw;
    bump.rotation.z = f.pitch;
    worldGroup.add(bump);
  }

  // Zebra crosswalks at Simpang Girang (4 m), Pasar Gegerkalong (351 m), and Simpang Hilir (630 m)
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xf4f4f0,
    roughness: 0.68,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  for (const mZebra of [4, CORRIDOR.northSegmentM - 4, CORRIDOR.lengthM - 6]) {
    for (let s = -1.35; s <= 1.35; s += 0.68) {
      const f = sampleCorridorFrame(mZebra, s);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.02, 0.34), stripeMat);
      stripe.position.set(f.x, f.y + 0.072, f.z);
      stripe.rotation.order = 'YXZ';
      stripe.rotation.y = f.yaw;
      stripe.rotation.z = f.pitch;
      worldGroup.add(stripe);
    }
  }

  // Crisp dashed center divider along wide arterial Jalan Raya Gegerkalong Hilir (636 m)
  for (const sr of OSM_SIDE_ROADS) {
    if (sr.highway !== 'secondary' || sr.points.length < 2) continue;
    for (let i = 0; i < sr.points.length - 1; i++) {
      const a = sr.points[i];
      const b = sr.points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      for (let d = 3; d < segLen - 3; d += 7.5) {
        const t = d / segLen;
        const dash = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.02, 0.14), stripeMat);
        dash.position.set(a.x + t * (b.x - a.x), a.y + 0.068, a.z + t * (b.z - a.z));
        dash.rotation.y = yaw;
        worldGroup.add(dash);
      }
    }
  }

  // Continuous crisp edge lines (no center divider on authentic 3.8 m narrow street)
  for (const edgeSign of [-1, 1]) {
    const edgeGeo = createCorridorRibbonGeometry(
      0,
      visLen,
      edgeSign * (CORRIDOR.roadWidthM / 2 - 0.16),
      0.11,
      0.072,
      3.0,
      10
    );
    worldGroup.add(new THREE.Mesh(edgeGeo, stripeMat));
  }

  // Flashing amber warning beacon + Convex Safety Mirror + Green Street Name Signs at Girang & Hilir
  const beacon = createWarningBeacon();
  const fBeac = sampleCorridorFrame(2, -4.4);
  beacon.group.position.set(fBeac.x, fBeac.y, fBeac.z);
  worldGroup.add(beacon.group);

  const mirror = createConvexMirror();
  const fMir = sampleCorridorFrame(3, 4.2);
  mirror.position.set(fMir.x, fMir.y, fMir.z);
  mirror.rotation.y = fMir.yaw + Math.PI * 0.78;
  worldGroup.add(mirror);

  const streetSign = createStreetNamePost('Jl. Gegerkalong Tengah');
  const fSign = sampleCorridorFrame(8, -4.8);
  streetSign.position.set(fSign.x, fSign.y, fSign.z);
  streetSign.rotation.y = fSign.yaw;
  worldGroup.add(streetSign);

  const hilirSign = createStreetNamePost('Jl. Gegerkalong Hilir');
  const fHilirSign = sampleCorridorFrame(CORRIDOR.lengthM - 8, 5.2);
  hilirSign.position.set(fHilirSign.x, fHilirSign.y, fHilirSign.z);
  hilirSign.rotation.y = fHilirSign.yaw + Math.PI / 2;
  worldGroup.add(hilirSign);

  // Real OSM Portal Lift-Gate at KPAD / Jl. Kartika II entrance (dist 308 m, West +Z)
  buildKpadLiftGate(worldGroup);

  const twoWayArrows = buildCurvedRoadArrows('twoway');
  const oneWayPagiArrows = buildCurvedRoadArrows('pagi');
  const oneWaySoreArrows = buildCurvedRoadArrows('sore');
  worldGroup.add(twoWayArrows, oneWayPagiArrows, oneWaySoreArrows);

  // 4. Baseline Street Clutter (parked scooters encroaching the narrow curved road + gerobak)
  const baselineClutterGroup = new THREE.Group();
  const scooterColors = [0x1f2937, 0xb91c1c, 0x1d4ed8, 0xf8fafc, 0x0f766e];
  const clutterSpotsM = [36, 48, 76, 134, 158, 210, 268, 322, 336, 344, 412, 468, 524, 578, 608];
  clutterSpotsM.forEach((m, idx) => {
    const side = idx % 2 === 0 ? 1 : -1;
    const f = sampleCorridorFrame(m, side * (CORRIDOR.roadWidthM / 2 + 0.04));
    const sc = buildDetailedIndonesianScooter(scooterColors[idx % scooterColors.length], false, false);
    sc.position.set(f.x, f.y + 0.05, f.z);
    sc.rotation.y = f.yaw + (side === 1 ? -0.42 : 0.42);
    baselineClutterGroup.add(sc);
  });
  for (const [mCart, side, hex] of [[332, 1, 0x1d4ed8], [70, -1, 0xb91c1c], [516, -1, 0x047857]] as const) {
    const f = sampleCorridorFrame(mCart, side * (CORRIDOR.roadWidthM / 2 - 0.1));
    const cart = createGerobakCart(hex);
    cart.position.set(f.x, f.y + 0.05, f.z);
    cart.rotation.y = f.yaw;
    baselineClutterGroup.add(cart);
  }
  worldGroup.add(baselineClutterGroup);

  // 5. Toggleable Curved Raised Sidewalk on East side (-Z) with Poly Haven Pavers & Kanstin Curb
  const sidewalkGroup = new THREE.Group();
  const pavers = loadPaversPbr(1, 1);
  const swLat = -(CORRIDOR.roadWidthM / 2 + CORRIDOR.sidewalkWidthM / 2 + 0.24);
  const swGeo = createCorridorRibbonGeometry(0, CORRIDOR.lengthM, swLat, CORRIDOR.sidewalkWidthM, 0.26, 2.5, 2.2);
  const sidewalk = new THREE.Mesh(
    swGeo,
    new THREE.MeshStandardMaterial({
      map: pavers.map,
      normalMap: pavers.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.82
    })
  );
  sidewalk.receiveShadow = true;
  sidewalkGroup.add(sidewalk);

  const kanstinTex = createKanstinCurbTexture();
  kanstinTex.repeat.set(1, 1);
  const curbLat = -(CORRIDOR.roadWidthM / 2 + 0.34);
  const curbGeo = createCorridorRibbonGeometry(0, CORRIDOR.lengthM, curbLat, 0.22, 0.265, 2.5, 2.0);
  sidewalkGroup.add(new THREE.Mesh(curbGeo, new THREE.MeshStandardMaterial({ map: kanstinTex, roughness: 0.78 })));

  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.38, metalness: 0.68 });
  const bollardStripeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
  for (let m = 14; m <= CORRIDOR.lengthM - 14; m += 13) {
    // Keep Drop-off Bay mouth & Jalan Haji Ridho mouth (317 m) cleanly open
    if (m > CORRIDOR.dropoffBay.startM - 3 && m < CORRIDOR.dropoffBay.endM + 3) continue;
    if (m > 311 && m < 323) continue;
    const f = sampleCorridorFrame(m, -(CORRIDOR.roadWidthM / 2 + 0.52));
    const bPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 8), bollardMat);
    bPost.position.set(f.x, f.y + 0.65, f.z);
    bPost.castShadow = true;
    sidewalkGroup.add(bPost);

    const bBand = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.12, 8), bollardStripeMat);
    bBand.position.set(f.x, f.y + 0.9, f.z);
    sidewalkGroup.add(bBand);
  }

  for (let m = 24; m <= CORRIDOR.lengthM - 24; m += 36) {
    if (m > CORRIDOR.dropoffBay.startM - 8 && m < CORRIDOR.dropoffBay.endM + 8) continue;
    if (m > 306 && m < 328) continue;
    const fTree = sampleCorridorFrame(m, -(CORRIDOR.roadWidthM / 2 + 1.42));
    const tree = createTropicalTree(0.74 + (m % 3) * 0.08);
    tree.position.set(fTree.x, fTree.y + 0.26, fTree.z);
    sidewalkGroup.add(tree);

    const fBin = sampleCorridorFrame(m + 6, -(CORRIDOR.roadWidthM / 2 + 1.08));
    const bin = createBandungTrashBin();
    bin.position.set(fBin.x, fBin.y + 0.26, fBin.z);
    bin.rotation.y = fBin.yaw;
    sidewalkGroup.add(bin);

    const fPlanter = sampleCorridorFrame(m + 14, -(CORRIDOR.roadWidthM / 2 + 1.2));
    const planter = createPlanterBox();
    planter.position.set(fPlanter.x, fPlanter.y + 0.26, fPlanter.z);
    planter.rotation.y = fPlanter.yaw;
    sidewalkGroup.add(planter);
  }
  worldGroup.add(sidewalkGroup);

  // 6. Toggleable Off-Street Drop-Off Bay (East 186-214 m) & Dedicated Parking Lot (West 262-296 m)
  const offstreetGroup = new THREE.Group();
  const dropGeo = createCorridorRibbonGeometry(
    CORRIDOR.dropoffBay.startM,
    CORRIDOR.dropoffBay.endM,
    CORRIDOR.dropoffBay.bayZ,
    2.5,
    0.058,
    2.5,
    4.0
  );
  const dropPad = new THREE.Mesh(
    dropGeo,
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.72, transparent: true, opacity: 0.46 })
  );
  offstreetGroup.add(dropPad);

  const dropMid = sampleCorridorFrame(
    (CORRIDOR.dropoffBay.startM + CORRIDOR.dropoffBay.endM) / 2,
    CORRIDOR.dropoffBay.bayZ - 1.85
  );
  const dropSign = createPoleSign(
    'ZONA DROP-OFF',
    'Singgah Maks. 30 dtk · Bebas Badan Jalan',
    '#0369a1',
    '#ffffff',
    '#38bdf8'
  );
  dropSign.position.set(dropMid.x, dropMid.y, dropMid.z);
  dropSign.rotation.y = dropMid.yaw;
  offstreetGroup.add(dropSign);

  const parkGeo = createCorridorRibbonGeometry(
    CORRIDOR.parkingLot.startM,
    CORRIDOR.parkingLot.endM,
    CORRIDOR.parkingLot.bayZ,
    3.1,
    0.058,
    2.5,
    4.0
  );
  const parkPad = new THREE.Mesh(
    parkGeo,
    new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.76, transparent: true, opacity: 0.44 })
  );
  offstreetGroup.add(parkPad);

  const parkMid = sampleCorridorFrame(
    (CORRIDOR.parkingLot.startM + CORRIDOR.parkingLot.endM) / 2,
    CORRIDOR.parkingLot.bayZ + 2.2
  );
  const parkSign = createPoleSign(
    'PARKIR KHUSUS PASAR',
    'Luar Badan Jalan · Utara Pasar & KPAD',
    '#047857',
    '#ffffff',
    '#34d399'
  );
  parkSign.position.set(parkMid.x, parkMid.y, parkMid.z);
  parkSign.rotation.y = parkMid.yaw + Math.PI;
  offstreetGroup.add(parkSign);

  for (let m = CORRIDOR.dropoffBay.startM; m <= CORRIDOR.dropoffBay.endM; m += 9.0) {
    const f = sampleCorridorFrame(m, -(CORRIDOR.roadWidthM / 2 + 0.15));
    const cone = createTrafficCone();
    cone.position.set(f.x, f.y + 0.05, f.z);
    offstreetGroup.add(cone);
  }

  const officers: AnimatedOfficer[] = [];
  for (const [mOff, lat, flip] of [[12, -2.06, false], [295, 2.35, true], [622, -2.06, false]] as const) {
    const f = sampleCorridorFrame(mOff, lat);
    const off = createDishubOfficer();
    off.group.position.set(f.x, f.y + 0.05, f.z);
    off.group.rotation.y = f.yaw + (flip ? Math.PI : 0);
    offstreetGroup.add(off.group);
    officers.push(off);
  }
  worldGroup.add(offstreetGroup);

  // 7. Toggleable No-Stopping Signs (Rambu S Coret) along curved corridor gutter edge
  const noStopSignGroup = new THREE.Group();
  const noStopTex = createNoStopSignTexture();
  const signMat = new THREE.MeshBasicMaterial({ map: noStopTex, transparent: true, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.45, metalness: 0.55 });
  for (let m = 28; m <= CORRIDOR.lengthM - 20; m += 56) {
    for (const side of [-1, 1]) {
      const f = sampleCorridorFrame(m, side * (CORRIDOR.roadWidthM / 2 + 0.28));
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.75, 8), poleMat);
      p.position.set(f.x, f.y + 1.38, f.z);
      noStopSignGroup.add(p);

      const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), signMat);
      disc.position.set(f.x, f.y + 2.55, f.z);
      disc.rotation.y = f.yaw + Math.PI / 2;
      noStopSignGroup.add(disc);
    }
  }
  worldGroup.add(noStopSignGroup);

  // 8. ALL REAL OPENSTREETMAP FRONT-ROW BUILDINGS (PULLED FLUSH TO ROAD EDGE)
  buildOsmFrontBuildings(worldGroup);

  // 9. AUTHENTIC PASAR GEGERKALONG AT EXACT SATELLITE / OSM LOCATION (MID-CORRIDOR, 347-375 m)
  buildPasarGegerkalongRealZone(worldGroup);

  // 10. REAL ICONIC LANDMARKS (Kampus IV UNPAS, Masjid Baiturahman, Mesjid Ulul Albab, UPI CoE, SDN Isola 2, Kantor Pos Hilir)
  buildOsmLandmarks(worldGroup);

  // 11. ALL 823 REAL OPENSTREETMAP BACKGROUND POLYGON BUILDINGS (MERGED INTO 6 DRAW CALLS!)
  buildOsmBackgroundPolygons(worldGroup);

  // 12. Curved PLN Utility Poles + Sagging Catenary Overhead Cables (hugging gutter edge)
  const poleXPositions: THREE.Vector3[] = [];
  for (let m = 16; m <= visLen - 16; m += 42) {
    if (m >= 302 && m <= 362) continue;
    const f = sampleCorridorFrame(m, CORRIDOR.roadWidthM / 2 + 0.3);
    const pole = createUtilityPole();
    pole.position.set(f.x, f.y, f.z);
    pole.rotation.y = f.yaw;
    worldGroup.add(pole);
    poleXPositions.push(new THREE.Vector3(f.x, f.y + 7.55, f.z));
  }
  const cableMat = new THREE.LineBasicMaterial({ color: 0x27272a });
  for (let i = 0; i < poleXPositions.length - 1; i++) {
    const pA = poleXPositions[i];
    const pB = poleXPositions[i + 1];
    if (pA.distanceTo(pB) > 58) continue;
    for (const zOff of [-0.55, 0, 0.55]) {
      const mid = pA.clone().lerp(pB, 0.5);
      mid.y -= 0.72;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(pA.x, pA.y, pA.z + zOff),
        new THREE.Vector3(mid.x, mid.y, mid.z + zOff),
        new THREE.Vector3(pB.x, pB.y, pB.z + zOff)
      );
      worldGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(10)), cableMat));
    }
  }

  // 13. Real Intersection Portals & Mid-Corridor LKM-2 Marker (verified OSM distances & Open-Meteo DEM)
  const fNorth = sampleCorridorFrame(0, 0);
  const northBanner = createIntersectionPortal('SIMPANG GEGERKALONG GIRANG', 'Utara · 0 m · 901 m dpl · Kampus UPI');
  northBanner.position.set(fNorth.x, fNorth.y, fNorth.z);
  northBanner.rotation.y = fNorth.yaw;
  worldGroup.add(northBanner);

  const fMid = sampleCorridorFrame(CORRIDOR.northSegmentM, 0);
  const midBanner = createIntersectionPortal('PASAR GEGERKALONG · 355 m', 'Batas Segmen Utara (LKM-2) · 889 m dpl');
  midBanner.position.set(fMid.x, fMid.y, fMid.z);
  midBanner.rotation.y = fMid.yaw;
  worldGroup.add(midBanner);

  const fSouth = sampleCorridorFrame(CORRIDOR.lengthM - 2, 0);
  const southBanner = createIntersectionPortal('SIMPANG GEGERKALONG HILIR', 'Selatan · 636 m · 875 m dpl · Jalan Raya');
  southBanner.position.set(fSouth.x, fSouth.y, fSouth.z);
  southBanner.rotation.y = fSouth.yaw;
  worldGroup.add(southBanner);

  // Market shoppers near Pasar Gegerkalong front stalls & blue canopy mouth (320-352 m, West +Z)
  for (let i = 0; i < 6; i++) {
    const mShop = 320 + i * 5.6;
    const f = sampleCorridorFrame(mShop, CORRIDOR.roadWidthM / 2 + 0.16 + (i % 2) * 0.08);
    const shopper = createPedestrianMesh({
      id: 900 + i,
      xM: mShop,
      dir: i % 2 === 0 ? 1 : -1,
      speedMs: 0,
      lateralJitterM: 0,
      shirtHex: [0x1d4ed8, 0x15803d, 0xb91c1c, 0x7c3aed, 0x0f766e, 0xd97706][i]
    });
    shopper.group.position.set(f.x, f.y + 0.08, f.z);
    shopper.group.rotation.y = f.yaw + (i % 2 === 0 ? 0.5 : -0.6);
    worldGroup.add(shopper.group);
  }

  return {
    sidewalkGroup,
    offstreetGroup,
    baselineClutterGroup,
    noStopSignGroup,
    twoWayArrows,
    oneWayPagiArrows,
    oneWaySoreArrows,
    officers,
    beaconBulbMat: beacon.bulbMat,
    updateForScenario(key: ScenarioKey, oneWayDir: OneWayDirection): void {
      const cfg = SCENARIOS[key];
      sidewalkGroup.visible = cfg.hasSidewalk;
      offstreetGroup.visible = cfg.hasOffstreet;
      baselineClutterGroup.visible = !cfg.hasOffstreet;
      noStopSignGroup.visible = cfg.hasNoStopSign;
      twoWayArrows.visible = cfg.twoWay;
      oneWayPagiArrows.visible = !cfg.twoWay && oneWayDir === 1;
      oneWaySoreArrows.visible = !cfg.twoWay && oneWayDir === -1;
    }
  };
}

/**
 * Authentic KPAD / Jalan Kartika II access portal lift-gate verified from OSM node
 * (`barrier=lift_gate` at -6.867036, 107.591615, dist 308.2 m West).
 */
function buildKpadLiftGate(parent: THREE.Group): void {
  const f = sampleCorridorFrame(308.2, CORRIDOR.roadWidthM / 2 + 2.6);
  const g = new THREE.Group();
  g.position.set(f.x, f.y + 0.04, f.z);
  g.rotation.y = f.yaw;

  const postMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.35 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });

  // Barrier housing beside the KPAD road mouth
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.15, 0.42), postMat);
  box.position.set(-1.7, 0.58, 0.4);
  box.castShadow = true;
  g.add(box);

  // Raised red-white striped barrier arm (angled up at 65 deg so KPAD traffic enters freely)
  const armPivot = new THREE.Group();
  armPivot.position.set(-1.7, 0.95, 0.4);
  armPivot.rotation.z = -1.1;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.06), i % 2 === 0 ? redMat : whiteMat);
    seg.position.set(0.26 + i * 0.48, 0, 0);
    armPivot.add(seg);
  }
  g.add(armPivot);

  // Small directional sign "KOMPLEKS KPAD / JL. KARTIKA II"
  const signTex = createSignTexture('AKSES KPAD · KARTIKA II', 'Portal Kompleks · Gegerkalong', '#1e3a5f', '#ffffff', '#facc15');
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.62, 2.2),
    [
      new THREE.MeshBasicMaterial({ map: signTex }),
      new THREE.MeshBasicMaterial({ map: signTex }),
      postMat, postMat, postMat, postMat
    ]
  );
  board.position.set(-1.95, 2.45, 0.4);
  g.add(board);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6), postMat);
  pole.position.set(-1.95, 1.25, 0.4);
  g.add(pole);

  parent.add(g);
}

/**
 * Places OpenStreetMap front-row buildings tightly hugging the narrow 3.8 m road gutter (~0.42 m from
 * asphalt edge) to authentically reflect the cramped corridor where neither road widening nor sidewalks
 * are physically feasible, while preserving real open pockets for the off-street bays & alley mouths.
 */
function buildOsmFrontBuildings(parent: THREE.Group): void {
  let kosCount = 0;
  let usedBjb = false;
  let usedBarokah = false;
  let usedWarung46 = false;
  let usedIndomaret = false;
  let usedAlfamart = false;
  let pasarFrontIdx = 0;

  const keepRealSetback = (b: OsmFrontBuilding): boolean => {
    // Keep Simpang Girang & Simpang Hilir corners open for cross-arterials
    if (b.distM < 10 || b.distM > CORRIDOR.lengthM - 10) return true;
    // Keep East Drop-Off Bay (186-214 m) & Jl. Haji Ridho mouth (317 m) open
    if (b.side === -1 && ((b.distM >= 182 && b.distM <= 218) || (b.distM >= 312 && b.distM <= 322))) return true;
    // Keep West Parking Lot (262-296 m), KPAD mouth (308 m), & Pasar blue canopy alley (347 m) open
    if (
      b.side === 1 &&
      ((b.distM >= 258 && b.distM <= 300) || (b.distM >= 303 && b.distM <= 314) || (b.distM >= 343 && b.distM <= 352))
    ) {
      return true;
    }
    return false;
  };

  OSM_FRONT_BUILDINGS.forEach((b: OsmFrontBuilding, idx: number) => {
    const bWidth = Math.max(4.0, b.width);
    const bDepth = Math.max(4.2, b.depth);
    const flush = !keepRealSetback(b);
    const tightFrame = flush
      ? sampleCorridorFrame(b.distM, b.side * (CORRIDOR.roadWidthM / 2 + 0.42 + bDepth / 2))
      : null;
    const posX = tightFrame ? tightFrame.x : b.cx;
    const posY = tightFrame ? tightFrame.y : b.y;
    const posZ = tightFrame ? tightFrame.z : b.cz;
    const yaw = tightFrame ? tightFrame.yaw : b.angleY;

    // Large multi-story boarding house (Kos UPI) footprints in the northern UPI zone
    if (b.levels >= 4 && b.width >= 9 && kosCount < 3) {
      kosCount++;
      const kos = createDetailedKosBuilding(bWidth, bDepth, 4);
      kos.position.set(posX, posY, posZ);
      kos.rotation.y = yaw + (b.side === 1 ? Math.PI : 0);
      parent.add(kos);
      return;
    }

    // Assign real verified local landmarks at their real corridor zones
    let preset: ShopPreset;
    if (b.isPasarZone) {
      preset = PASAR_FRONT_PRESETS[pasarFrontIdx++ % PASAR_FRONT_PRESETS.length];
    } else if (!usedIndomaret && b.distM >= 580 && b.side === 1) {
      usedIndomaret = true;
      preset = HILIR_PRESETS[0]; // Indomaret dekat Simpang Gegerkalong Hilir
    } else if (!usedAlfamart && b.distM >= 580 && b.side === -1) {
      usedAlfamart = true;
      preset = HILIR_PRESETS[1]; // Alfamart dekat Simpang Gegerkalong Hilir
    } else if (!usedBjb && b.distM >= 312 && b.distM <= 355 && b.side === -1) {
      usedBjb = true;
      preset = SHOP_PRESETS[0]; // Kantor Kas Bank BJB seberang Pasar Gegerkalong
    } else if (!usedBarokah && b.distM >= 135 && b.distM <= 178 && b.side === -1) {
      usedBarokah = true;
      preset = SHOP_PRESETS[1]; // Barokah MM No. 23
    } else if (!usedWarung46 && b.distM >= 205 && b.distM <= 245 && b.side === 1) {
      usedWarung46 = true;
      preset = SHOP_PRESETS[2]; // Warung 46 near Jl. Gegerkalong Tengah 9
    } else {
      preset = SHOP_PRESETS[3 + (idx % (SHOP_PRESETS.length - 3))];
    }

    const ruko = createDetailedRuko({
      width: bWidth,
      depth: bDepth,
      floors: Math.min(3, Math.max(1, b.levels)),
      wallHex: preset.wall,
      trimHex: preset.trim,
      roofType: preset.roof,
      shopName: b.name || preset.name,
      shopSub: preset.sub,
      signBg: preset.bg,
      signFg: preset.fg,
      signAccent: preset.accent,
      awningHex: preset.awning,
      facingDir: b.side === 1 ? -1 : 1,
      hasBladeSign: preset.blade && bWidth >= 6,
      hasPorchStall: !flush && preset.porch && bWidth >= 5.2
    });

    ruko.position.set(posX, posY, posZ);
    ruko.rotation.y = yaw;
    parent.add(ruko);
  });
}

/**
 * Builds the authentic Pasar Gegerkalong complex at its EXACT satellite & OSM GPS footprint:
 * 1. Iconic blue translucent polycarbonate arched canopy corridor running West (+Z) along Way 566513488 (dist 347 m)
 *    with Gapura "PASAR GEGERKALONG · Jl. Gegerkalong Tengah No. 35A" facing the street.
 * 2. Main Market Hall on exact OSM Way 522195464 polygon (dist 352-375 m, West +Z, ~702 m²):
 *    weathered corrugated iron roof with bright skylight strips, open colonnade, stocked produce stalls,
 *    rice sacks, warm hanging lamps, vendors, and shoppers.
 * 3. Iconic large tropical shade tree right at the south lip of Pasar entrance (dist 355 m, West +Z).
 */
function buildPasarGegerkalongRealZone(parent: THREE.Group): void {
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.55 });
  const wallMaps = loadWeatheredWallPbr();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6dccb, map: wallMaps.map, roughness: 0.88 });
  const tileBaseMat = new THREE.MeshStandardMaterial({ color: 0xdbe7e4, roughness: 0.55 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c5434, roughness: 0.86 });
  const sackMat = new THREE.MeshStandardMaterial({ color: 0xe7dfd0, roughness: 0.92 });
  const basketMat = new THREE.MeshStandardMaterial({ color: 0xb08952, roughness: 0.9 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfbbf24, emissiveIntensity: 1.9 });
  const awningColors = [0x1d4ed8, 0xd97706, 0x15803d, 0xb91c1c, 0x0f766e];
  const produceColors = [0xdc2626, 0x16a34a, 0xea580c, 0xeab308, 0x15803d, 0xf97316, 0x65a30d, 0x991b1b];

  // --- PART A: BLUE ARCHED POLYCARBONATE CANOPY ALLEY (exact Way 566513488 at dist 347 m heading West) ---
  const fLaneStart = sampleCorridorFrame(CORRIDOR.pasar.canopyLaneM, CORRIDOR.roadWidthM / 2 + 1.8);
  const fLaneEnd = sampleCorridorFrame(CORRIDOR.pasar.canopyLaneM, 48.0);
  const laneLen = Math.hypot(fLaneEnd.x - fLaneStart.x, fLaneEnd.z - fLaneStart.z);
  const laneYaw = -Math.atan2(fLaneEnd.z - fLaneStart.z, fLaneEnd.x - fLaneStart.x);

  const laneGroup = new THREE.Group();
  laneGroup.position.set(
    (fLaneStart.x + fLaneEnd.x) / 2,
    fLaneStart.y - 0.05,
    (fLaneStart.z + fLaneEnd.z) / 2
  );
  laneGroup.rotation.y = laneYaw;

  const laneW = 6.4;
  const canopyH = 4.3;

  // Paved market alley floor
  const laneFloor = new THREE.Mesh(
    new THREE.BoxGeometry(laneLen, 0.25, laneW),
    new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.88 })
  );
  laneFloor.position.set(0, 0.02, 0);
  laneFloor.receiveShadow = true;
  laneGroup.add(laneFloor);

  // Arched translucent blue polycarbonate canopy matching satellite imagery
  const archGeo = new THREE.CylinderGeometry(laneW / 2 + 0.35, laneW / 2 + 0.35, laneLen, 18, 1, true, 0, Math.PI);
  archGeo.rotateZ(Math.PI / 2);
  archGeo.scale(1, 0.44, 1);
  const blueCanopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1d4ed8,
    roughness: 0.24,
    metalness: 0.14,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide
  });
  const archRoof = new THREE.Mesh(archGeo, blueCanopyMat);
  archRoof.position.set(0, canopyH, 0);
  archRoof.castShadow = true;
  laneGroup.add(archRoof);

  const ribMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.42, metalness: 0.55 });
  const numRibs = 9;
  for (let i = 0; i <= numRibs; i++) {
    const rx = -laneLen / 2 + 0.6 + (i / numRibs) * (laneLen - 1.2);
    const rib = new THREE.Mesh(new THREE.TorusGeometry(laneW / 2 + 0.32, 0.07, 6, 18, Math.PI), ribMat);
    rib.rotation.y = Math.PI / 2;
    rib.scale.set(1, 0.44, 1);
    rib.position.set(rx, canopyH, 0);
    laneGroup.add(rib);

    for (const cz of [-laneW / 2 + 0.2, laneW / 2 - 0.2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, canopyH, 0.22), steelMat);
      col.position.set(rx, canopyH / 2, cz);
      col.castShadow = true;
      laneGroup.add(col);
    }

    if (i > 0 && i < numRibs && i % 2 === 1) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), bulbMat);
      bulb.position.set(rx, canopyH - 0.35, 0);
      laneGroup.add(bulb);
    }
  }

  // Front Gapura Pasar Gegerkalong at the street mouth of the blue canopy (-laneLen/2 faces Jl. Gegerkalong Tengah!)
  const signTex = createSignTexture(
    'PASAR GEGERKALONG',
    'Jl. Gegerkalong Tengah No. 35A · Perumda Pasar Juara',
    '#7c2d12',
    '#fef3c7',
    '#f59e0b'
  );
  const gapuraBeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 1.55, laneW + 1.2),
    new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.7 })
  );
  gapuraBeam.position.set(-laneLen / 2 + 0.2, canopyH + 0.55, 0);
  gapuraBeam.castShadow = true;
  laneGroup.add(gapuraBeam);

  const signPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(laneW + 0.8, 1.32),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  signPlane.position.set(-laneLen / 2 - 0.1, canopyH + 0.55, 0);
  signPlane.rotation.y = -Math.PI / 2;
  laneGroup.add(signPlane);

  // Produce stalls & shoppers inside the blue canopy lane
  for (let i = 0; i < 7; i++) {
    const bx = -laneLen / 2 + 4.0 + i * ((laneLen - 8) / 7);
    for (const side of [-1, 1] as const) {
      const sz = side * (laneW / 2 - 0.95);
      const table = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.78, 1.1), tileBaseMat);
      table.position.set(bx, 0.45, sz);
      table.castShadow = true;
      laneGroup.add(table);

      for (const ox of [-0.95, 0, 0.95]) {
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.25, 0.28, 7), basketMat);
        basket.position.set(bx + ox, 0.96, sz);
        laneGroup.add(basket);
        const mound = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 6, 5, 0, Math.PI * 2, 0, Math.PI * 0.56),
          new THREE.MeshStandardMaterial({
            color: produceColors[(i * 3 + (side > 0 ? 2 : 0) + Math.round(ox + 2)) % produceColors.length],
            roughness: 0.88
          })
        );
        mound.scale.set(1.05, 0.65, 0.95);
        mound.position.set(bx + ox, 1.08, sz);
        laneGroup.add(mound);
      }
    }
  }

  parent.add(laneGroup);

  // --- PART B: MAIN MARKET HALL ON EXACT OSM WAY 522195464 (~20 m x 35 m, 702 m²) ---
  const pasarLm = OSM_LANDMARKS.find(l => l.kind === 'pasar-hall');
  if (pasarLm && pasarLm.poly.length >= 4) {
    // Compute hall center, length (long axis W-E), depth (N-S), and exact edge yaw from OSM Way 522195464
    const p0 = pasarLm.poly[0];
    const p1 = pasarLm.poly[1];
    const p2 = pasarLm.poly[2];
    const d01 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const d12 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    // Align local +X along the long axis (~35 m), local +Z along short axis (~20 m)
    const longVec = d12 >= d01 ? [p2[0] - p1[0], p2[1] - p1[1]] : [p1[0] - p0[0], p1[1] - p0[1]];
    const hallLen = Math.max(d01, d12);
    const hallWid = Math.min(d01, d12);
    const hallYaw = -Math.atan2(longVec[1], longVec[0]);
    const wallH = 4.9;

    const hall = new THREE.Group();
    hall.position.set(pasarLm.cx, pasarLm.y - 0.1, pasarLm.cz);
    hall.rotation.y = hallYaw;

    // Concrete plinth embedded cleanly into slope
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xbcb6ac, roughness: 0.9 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(hallLen + 1.0, 2.2, hallWid + 1.0), concreteMat);
    plinth.position.set(0, -0.75, 0);
    plinth.receiveShadow = true;
    hall.add(plinth);

    // Photorealistic market facade around lower masonry walls + open ventilation clerestory
    const pasarTex = loadFacadeTexture('pasar', 3, 1);
    const pasarFacadeMat = new THREE.MeshStandardMaterial({
      map: pasarTex,
      emissive: 0x3b2a14,
      emissiveMap: pasarTex,
      emissiveIntensity: 0.22,
      roughness: 0.85
    });

    // Side & rear walls with open road-facing eastern arcade
    const rearWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, wallH, hallWid), wallMat);
    rearWall.position.set(hallLen / 2 - 0.18, wallH / 2 + 0.35, 0);
    rearWall.castShadow = true;
    hall.add(rearWall);

    for (const sz of [-hallWid / 2 + 0.18, hallWid / 2 - 0.18]) {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(hallLen, 2.6, 0.32), wallMat);
      sideWall.position.set(0, 1.65, sz);
      sideWall.castShadow = true;
      hall.add(sideWall);

      const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(hallLen - 0.8, 2.5), pasarFacadeMat);
      backdrop.position.set(0, 1.65, sz + (sz > 0 ? 0.18 : -0.18));
      backdrop.rotation.y = sz > 0 ? 0 : Math.PI;
      hall.add(backdrop);
    }

    // Perimeter steel columns
    for (let i = 0; i <= 7; i++) {
      const cx = -hallLen / 2 + 0.5 + (i / 7) * (hallLen - 1.0);
      for (const cz of [-hallWid / 2 + 0.25, 0, hallWid / 2 - 0.25]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, wallH, 0.28), steelMat);
        col.position.set(cx, wallH / 2 + 0.35, cz);
        col.castShadow = true;
        hall.add(col);
      }
    }

    // Interior market stall rows (los pasar tradisional) + sacks + colorful awnings
    for (let i = 0; i < 6; i++) {
      const bx = -hallLen / 2 + 3.2 + i * ((hallLen - 6.4) / 5.5);
      for (const rz of [-hallWid * 0.28, hallWid * 0.28]) {
        const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.86, 2.1), tileBaseMat);
        counter.position.set(bx, 0.78, rz);
        counter.castShadow = true;
        hall.add(counter);

        const rack = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.65), woodMat);
        rack.position.set(bx, 1.28, rz);
        hall.add(rack);

        const tarp = new THREE.Mesh(
          new THREE.BoxGeometry(3.9, 0.08, 2.5),
          new THREE.MeshStandardMaterial({
            color: awningColors[(i + (rz > 0 ? 2 : 0)) % awningColors.length],
            roughness: 0.8
          })
        );
        tarp.position.set(bx, 2.9, rz);
        hall.add(tarp);

        const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.68, 8), sackMat);
        sack.position.set(bx + 1.6, 0.68, rz + (rz > 0 ? -1.35 : 1.35));
        hall.add(sack);
      }
    }

    // Authentic Weathered Grey Corrugated Gable Roof + Bright Translucent Skylight Strips (exact satellite appearance!)
    const corrMaps = loadCorrugatedPbr();
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x6f7472,
      map: corrMaps.map,
      normalMap: corrMaps.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.68,
      metalness: 0.32
    });
    const skylightMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0xfff7ed,
      emissiveIntensity: 0.35,
      roughness: 0.35
    });

    const halfW = hallWid / 2 + 0.9;
    const slopeLen = Math.hypot(halfW, 2.15);
    const slopeAng = Math.atan2(2.15, halfW);

    for (const side of [-1, 1] as const) {
      const pitch = new THREE.Mesh(new THREE.BoxGeometry(hallLen + 1.4, 0.14, slopeLen), roofMat);
      pitch.position.set(0, wallH + 1.38, side * (halfW / 2));
      pitch.rotation.x = side * slopeAng;
      pitch.castShadow = true;
      pitch.receiveShadow = true;
      hall.add(pitch);

      // Skylight translucent fiberglass panels matching the white roof stripes in Esri satellite view!
      for (const skX of [-hallLen * 0.28, 0, hallLen * 0.28]) {
        const sk = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.17, 1.35), skylightMat);
        sk.position.set(skX, wallH + 1.56, side * (halfW * 0.42));
        sk.rotation.x = side * slopeAng;
        hall.add(sk);
      }
    }

    // Raised ventilated ridge monitor (atap monitor pasar tradisional)
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(hallLen + 0.6, 0.65, 2.2), roofMat);
    monitor.position.set(0, wallH + 2.65, 0);
    monitor.castShadow = true;
    hall.add(monitor);

    // Street-side Pasar sign on east gable facing Jl. Gegerkalong Tengah
    const hallSign = new THREE.Mesh(
      new THREE.PlaneGeometry(11.5, 1.55),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
    );
    hallSign.position.set(-hallLen / 2 - 0.12, wallH + 0.65, 0);
    hallSign.rotation.y = -Math.PI / 2;
    hall.add(hallSign);

    parent.add(hall);
  }

  // --- PART C: ICONIC HUGE SHADE TREE RIGHT AT PASAR ENTRANCE (355 m West +Z, visible in satellite!) ---
  const fBigTree = sampleCorridorFrame(355.5, CORRIDOR.roadWidthM / 2 + 7.2);
  const bigTree = createTropicalTree(2.15);
  bigTree.position.set(fBigTree.x, fBigTree.y, fBigTree.z);
  parent.add(bigTree);
}

/**
 * Renders verified real OpenStreetMap institutional & religious landmarks around Jl. Gegerkalong Tengah:
 * - Kampus IV UNPAS (Gedung A Rektorat, Gedung B) with authentic brown Sundanese hipped roofs
 * - Masjid Baiturahman (near Jl. Haji Ridho, 310 m East) & Mesjid Ulul Albab (UNPAS) with tiered tajug roof & dome
 * - Gedung Centre of Excellence UPI (8-story modern academic tower at Simpang Girang NE)
 * - SD Negeri Isola 2 & Food Court UPI
 */
function buildOsmLandmarks(parent: THREE.Group): void {
  const wallMaps = loadWeatheredWallPbr();
  const clayMaps = loadClayRoofPbr();
  const greyMaps = loadGreyRoofPbr();
  wallMaps.map.repeat.set(0.14, 0.14);
  greyMaps.map.repeat.set(0.14, 0.14);

  const campusWallMat = new THREE.MeshStandardMaterial({
    color: 0xf0eadc,
    map: wallMaps.map,
    roughness: 0.86
  });
  const campusRoofMat = new THREE.MeshStandardMaterial({
    color: 0x9a5c3d,
    map: clayMaps.map,
    roughness: 0.78
  });
  const schoolRoofMat = new THREE.MeshStandardMaterial({
    map: clayMaps.map,
    roughness: 0.8
  });
  const mosqueWallMat = new THREE.MeshStandardMaterial({
    color: 0xf7f5ef,
    map: wallMaps.map,
    roughness: 0.84
  });
  const mosqueRoofMat = new THREE.MeshStandardMaterial({
    color: 0x0f766e,
    roughness: 0.55,
    metalness: 0.22
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.28,
    metalness: 0.78
  });
  const upiTowerWallMat = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    roughness: 0.62,
    metalness: 0.12
  });
  const upiTowerGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x264b6e,
    roughness: 0.12,
    metalness: 0.35,
    clearcoat: 0.9
  });
  const upiRoofMat = new THREE.MeshStandardMaterial({
    map: greyMaps.map,
    roughness: 0.76
  });

  for (const lm of OSM_LANDMARKS) {
    if (lm.kind === 'pasar-hall') continue; // Modeled in buildPasarGegerkalongRealZone
    if (lm.poly.length < 3) continue;

    const shape = new THREE.Shape();
    shape.moveTo(lm.poly[0][0], -lm.poly[0][1]);
    for (let i = 1; i < lm.poly.length; i++) {
      shape.lineTo(lm.poly[i][0], -lm.poly[i][1]);
    }
    shape.closePath();

    const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: lm.height + 1.4, bevelEnabled: false });
    baseGeo.rotateX(-Math.PI / 2);

    const wallMat =
      lm.kind === 'mosque'
        ? mosqueWallMat
        : lm.kind === 'upi-tower'
        ? upiTowerWallMat
        : campusWallMat;
    const capMat =
      lm.kind === 'mosque'
        ? mosqueRoofMat
        : lm.kind === 'upi-tower'
        ? upiRoofMat
        : lm.kind === 'school'
        ? schoolRoofMat
        : campusRoofMat;

    const body = new THREE.Mesh(baseGeo, [capMat, wallMat]);
    body.position.y = lm.y - 1.4;
    body.castShadow = true;
    body.receiveShadow = true;
    parent.add(body);

    const xs = lm.poly.map(p => p[0]);
    const zs = lm.poly.map(p => p[1]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanZ = Math.max(...zs) - Math.min(...zs);

    if (lm.kind === 'mosque') {
      // Tiered Sundanese-Javanese tajug pyramid roof + golden dome finial
      const rBase = Math.min(spanX, spanZ) * 0.48;
      const tier1 = new THREE.Mesh(new THREE.ConeGeometry(rBase, 3.2, 4), mosqueRoofMat);
      tier1.position.set(lm.cx, lm.y + lm.height + 1.6, lm.cz);
      tier1.rotation.y = Math.PI / 4;
      tier1.castShadow = true;
      parent.add(tier1);

      const tier2 = new THREE.Mesh(new THREE.ConeGeometry(rBase * 0.56, 2.3, 4), mosqueRoofMat);
      tier2.position.set(lm.cx, lm.y + lm.height + 3.6, lm.cz);
      tier2.rotation.y = Math.PI / 4;
      tier2.castShadow = true;
      parent.add(tier2);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(rBase * 0.24, 12, 8), goldMat);
      dome.position.set(lm.cx, lm.y + lm.height + 4.95, lm.cz);
      parent.add(dome);

      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 1.4, 6), goldMat);
      spire.position.set(lm.cx, lm.y + lm.height + 6.0, lm.cz);
      parent.add(spire);
    } else if (lm.kind === 'campus' || lm.kind === 'school') {
      // Iconic Bandung pitched/hipped campus clay roof cap
      const r = Math.min(spanX, spanZ) * 0.55;
      const hipRoof = new THREE.Mesh(
        new THREE.ConeGeometry(r, lm.kind === 'school' ? 2.4 : 4.2, 4),
        lm.kind === 'school' ? schoolRoofMat : campusRoofMat
      );
      hipRoof.scale.set(spanX / Math.max(1, r * 1.45), 1, spanZ / Math.max(1, r * 1.45));
      hipRoof.position.set(lm.cx, lm.y + lm.height + (lm.kind === 'school' ? 1.2 : 2.1), lm.cz);
      hipRoof.rotation.y = Math.PI / 4;
      hipRoof.castShadow = true;
      parent.add(hipRoof);
    } else if (lm.kind === 'post-office') {
      // Kantor Pos Gegerkalong Hilir (PT Pos Indonesia orange fascia + roof parapet)
      const posOrange = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.48 });
      const band = new THREE.Mesh(new THREE.BoxGeometry(spanX + 0.3, 0.9, spanZ + 0.3), posOrange);
      band.position.set(lm.cx, lm.y + lm.height - 0.35, lm.cz);
      band.castShadow = true;
      parent.add(band);

      const posTex = createSignTexture('KANTOR POS', 'Gegerkalong Hilir No. 42', '#ea580c', '#ffffff', '#fde047');
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(4.5, spanZ * 0.72), 1.05),
        new THREE.MeshBasicMaterial({ map: posTex, side: THREE.DoubleSide })
      );
      sign.position.set(lm.cx + spanX / 2 + 0.25, lm.y + lm.height + 0.4, lm.cz);
      sign.rotation.y = Math.PI / 2;
      parent.add(sign);
    } else if (lm.kind === 'upi-tower') {
      // Modern horizontal ribbon glazing + rooftop mechanical penthouse for 8-story CoE UPI
      for (let fl = 1; fl <= 6; fl++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(spanX * 0.88, 1.35, spanZ * 0.88), upiTowerGlassMat);
        band.position.set(lm.cx, lm.y + fl * 3.25, lm.cz);
        parent.add(band);
      }
      const penthouse = new THREE.Mesh(new THREE.BoxGeometry(spanX * 0.45, 3.0, spanZ * 0.45), upiTowerWallMat);
      penthouse.position.set(lm.cx, lm.y + lm.height + 1.5, lm.cz);
      penthouse.castShadow = true;
      parent.add(penthouse);
    }
  }
}

/**
 * Splits a non-indexed BufferGeometry slice [start, start + count) into a standalone BufferGeometry.
 */
function sliceGeometryGroup(geo: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  out.setAttribute('position', new THREE.BufferAttribute(pos.array.slice(start * 3, (start + count) * 3), 3));
  if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor.array.slice(start * 3, (start + count) * 3), 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv.array.slice(start * 2, (start + count) * 2), 2));
  return out;
}

/**
 * Extrudes all 823 real OpenStreetMap neighborhood building footprints and merges them
 * into 6 batched GPU meshes (3 roof buckets + 3 wall buckets) for smooth 60 FPS across 636 m.
 */
function buildOsmBackgroundPolygons(parent: THREE.Group): void {
  const wallMaps = loadWeatheredWallPbr();
  const clayMaps = loadClayRoofPbr();
  const greyMaps = loadGreyRoofPbr();

  // ExtrudeGeometry generates UVs in world meters, so scale repeat to ~1 tile per 6-7 meters!
  wallMaps.map.repeat.set(0.16, 0.16);
  clayMaps.map.repeat.set(0.14, 0.14);
  greyMaps.map.repeat.set(0.14, 0.14);

  const bgWallMats = [0xe8e2d6, 0xdfd8c9, 0xede8dd].map(
    hex =>
      new THREE.MeshStandardMaterial({
        color: hex,
        map: wallMaps.map,
        roughness: 0.9
      })
  );
  const bgRoofMats = [
    new THREE.MeshStandardMaterial({ map: clayMaps.map, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ map: greyMaps.map, roughness: 0.78 }),
    new THREE.MeshStandardMaterial({ color: 0xa47154, map: clayMaps.map, roughness: 0.84 })
  ];

  const roofBuckets: THREE.BufferGeometry[][] = [[], [], []];
  const wallBuckets: THREE.BufferGeometry[][] = [[], [], []];

  OSM_BG_BUILDINGS.forEach((b, idx) => {
    if (b.poly.length < 3) return;
    const shape = new THREE.Shape();
    shape.moveTo(b.poly[0][0], -b.poly[0][1]);
    for (let i = 1; i < b.poly.length; i++) {
      shape.lineTo(b.poly[i][0], -b.poly[i][1]);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height + 1.4, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, b.y - 1.4, 0);

    const roofIdx = idx % bgRoofMats.length;
    const wallIdx = idx % bgWallMats.length;
    for (const grp of geo.groups) {
      const part = sliceGeometryGroup(geo, grp.start, grp.count);
      if (grp.materialIndex === 0) {
        roofBuckets[roofIdx].push(part);
      } else {
        wallBuckets[wallIdx].push(part);
      }
    }
    geo.dispose();
  });

  roofBuckets.forEach((geos, i) => {
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, bgRoofMats[i]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });

  wallBuckets.forEach((geos, i) => {
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, bgWallMats[i]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
}

/**
 * Road directional markings:
 * - Two-Way (Baseline & Skenario 1): Indonesian Left-Hand Traffic (Southbound on East -Z, Northbound on West +Z).
 * - One-Way Pagi (Skenario 2): Blue (#2563EB) heading South (Girang -> Pasar/Hilir), matching LKM-2 Page 6!
 * - One-Way Sore (Skenario 2): Orange (#EA580C) heading North (Pasar/Hilir -> Girang), matching LKM-2 Page 6!
 */
function buildCurvedRoadArrows(mode: 'twoway' | 'pagi' | 'sore'): THREE.Group {
  const group = new THREE.Group();
  const colorHex = mode === 'twoway' ? 0xf8fafc : mode === 'pagi' ? 0x2563eb : 0xea580c;
  const arrowMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: mode === 'twoway' ? 0x000000 : colorHex,
    emissiveIntensity: mode === 'twoway' ? 0 : 0.25,
    roughness: 0.58
  });

  for (let m = 28; m <= CORRIDOR.lengthM - 24; m += 48) {
    if (mode === 'twoway') {
      // Indonesian Left-Hand Traffic: dir=1 (South) on East (-laneOffsetZ), dir=-1 (North) on West (+laneOffsetZ)
      group.add(createCurvedRoadArrow(m, -CORRIDOR.laneOffsetZ, 1, arrowMat));
      group.add(createCurvedRoadArrow(m + 20, CORRIDOR.laneOffsetZ, -1, arrowMat));
    } else if (mode === 'pagi') {
      group.add(createCurvedRoadArrow(m, 0, 1, arrowMat));
    } else {
      group.add(createCurvedRoadArrow(m, 0, -1, arrowMat));
    }
  }
  return group;
}

function createCurvedRoadArrow(
  distM: number,
  lateralZ: number,
  dir: 1 | -1,
  mat: THREE.Material
): THREE.Group {
  const f = sampleCorridorFrame(distM, lateralZ);
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.02, 0.24), mat);
  shaft.position.x = -0.5;
  g.add(shaft);

  const headShape = new THREE.Shape();
  headShape.moveTo(0.45, -0.44);
  headShape.lineTo(1.35, 0);
  headShape.lineTo(0.45, 0.44);
  headShape.closePath();

  const headGeo = new THREE.ShapeGeometry(headShape);
  headGeo.rotateX(-Math.PI / 2);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = 0.012;
  g.add(head);

  g.position.set(f.x, f.y + 0.082, f.z);
  g.rotation.order = 'YXZ';
  g.rotation.y = dir === 1 ? f.yaw : f.yaw + Math.PI;
  g.rotation.z = dir === 1 ? f.pitch : -f.pitch;
  return g;
}

function createPoleSign(
  title: string,
  subtitle: string,
  bg: string,
  fg: string,
  accent: string
): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.6 });
  for (const px of [-2.4, 2.4]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.8, 8), poleMat);
    pole.position.set(px, 1.9, 0);
    g.add(pole);
  }
  const tex = createSignTexture(title, subtitle, bg, fg, accent);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 1.65, 0.14),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  board.position.set(0, 3.45, 0);
  g.add(board);
  return g;
}

function createIntersectionPortal(title: string, subtitle: string): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.65 });
  const span = CORRIDOR.roadWidthM + 3.4;

  for (const pz of [-span / 2, span / 2]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 6.4, 10), poleMat);
    col.position.set(0, 3.2, pz);
    col.castShadow = true;
    g.add(col);
  }

  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, span + 0.4), poleMat);
  crossbar.position.set(0, 6.2, 0);
  g.add(crossbar);

  const tex = createSignTexture(title, subtitle, '#1e3a5f', '#ffffff', '#10b981');
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.48, 7.8),
    [
      new THREE.MeshBasicMaterial({ map: tex }),
      new THREE.MeshBasicMaterial({ map: tex }),
      poleMat,
      poleMat,
      poleMat,
      poleMat
    ]
  );
  board.position.set(0, 5.75, 0);
  g.add(board);
  return g;
}

/**
 * Populates open surrounding Bandung Utara parcels with multi-branch botanical trees
 * while strictly avoiding every OSM landmark, front building, background polygon, Pasar hall/lane, and side road.
 */
function addNeighborhoodCanopy(parent: THREE.Group): void {
  const isPointInPoly = (px: number, pz: number, poly: [number, number][]): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const distToSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
    const vx = bx - ax;
    const vz = bz - az;
    const l2 = vx * vx + vz * vz;
    if (l2 < 1e-6) return Math.hypot(px - ax, pz - az);
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
    return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
  };

  const hitsPoly = (px: number, pz: number, poly: [number, number][], pad: number): boolean => {
    if (isPointInPoly(px, pz, poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (distToSeg(px, pz, a[0], a[1], b[0], b[1]) < pad) return true;
    }
    return false;
  };

  const hitsAnyBuildingOrRoad = (px: number, pz: number, distM: number, lat: number): boolean => {
    // 1. Keep Pasar canopy lane & entrance plaza clear
    if (distM >= 338 && distM <= 362 && lat > 0 && lat < 56) return true;

    // 2. Check all dedicated OSM landmarks (UNPAS, UPI, Mosques, Pasar Hall)
    for (const lm of OSM_LANDMARKS) {
      if (hitsPoly(px, pz, lm.poly, 3.6)) return true;
    }

    // 3. Check all front-row OSM buildings
    for (const b of OSM_FRONT_BUILDINGS) {
      const r = Math.hypot(b.width / 2, b.depth / 2) + 3.4;
      if (Math.hypot(px - b.cx, pz - b.cz) < r) return true;
    }

    // 4. Check all background OSM polygon buildings
    for (const bg of OSM_BG_BUILDINGS) {
      if (hitsPoly(px, pz, bg.poly, 3.0)) return true;
    }

    // 5. Check all side roads & alleys
    for (const sr of OSM_SIDE_ROADS) {
      const clear = sr.width / 2 + 2.8;
      for (let i = 0; i < sr.points.length - 1; i++) {
        const a = sr.points[i];
        const b = sr.points[i + 1];
        if (distToSeg(px, pz, a.x, a.z, b.x, b.z) < clear) return true;
      }
    }

    return false;
  };

  const spots: { x: number; y: number; z: number; s: number; rot: number }[] = [];
  let seed = 4271;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let attempt = 0; attempt < 1600 && spots.length < 260; attempt++) {
    const distM = -32 + rand() * (CORRIDOR.lengthM + 64);
    const side = attempt % 2 === 0 ? 1 : -1;
    const lat = side * (16 + Math.pow(rand(), 1.08) * 110);
    const f = sampleCorridorFrame(distM, lat);

    if (hitsAnyBuildingOrRoad(f.x, f.z, distM, lat)) continue;
    if (spots.some(sp => Math.hypot(sp.x - f.x, sp.z - f.z) < 5.4)) continue;

    spots.push({
      x: f.x,
      y: f.y,
      z: f.z,
      s: 0.85 + rand() * 0.75,
      rot: rand() * Math.PI * 2
    });
  }

  if (spots.length === 0) return;

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.28, 3.2, 6);
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x543e2d, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, spots.length);

  const limbGeo = new THREE.CylinderGeometry(0.06, 0.12, 1.9, 5);
  const limbs = new THREE.InstancedMesh(limbGeo, barkMat, spots.length * 3);

  const leafTex = createLeafClusterTexture();
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.88
  });
  const cardGeo = new THREE.PlaneGeometry(3.3, 3.3);
  const cardsPerTree = 7;
  const leafCards = new THREE.InstancedMesh(cardGeo, leafMat, spots.length * cardsPerTree);
  leafCards.castShadow = true;
  leafCards.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tints = [
    new THREE.Color(0xdcfce7),
    new THREE.Color(0xeef7dc),
    new THREE.Color(0xcdebd0),
    new THREE.Color(0xf4f7de),
    new THREE.Color(0xd4ead6)
  ];

  const cardOffsets: [number, number, number, number, number, number][] = [
    [0, 4.4, 0, 0.15, 0, 1.15],
    [0, 4.5, 0, -0.2, Math.PI / 3, 1.1],
    [0, 4.4, 0, 0.25, (2 * Math.PI) / 3, 1.05],
    [1.05, 3.6, 0.65, 0.48, 0.4, 0.92],
    [-1.05, 3.65, -0.6, -0.45, 1.4, 0.95],
    [0.55, 3.7, -1.0, 0.42, 2.3, 0.88],
    [-0.6, 3.65, 0.95, -0.4, 0.9, 0.9]
  ];

  spots.forEach((sp, idx) => {
    dummy.position.set(sp.x, sp.y + 1.4 * sp.s, sp.z);
    dummy.rotation.set(0, sp.rot, 0);
    dummy.scale.set(sp.s, sp.s, sp.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);

    for (let b = 0; b < 3; b++) {
      const ang = sp.rot + (b * Math.PI * 2) / 3;
      dummy.position.set(sp.x + Math.cos(ang) * 0.55 * sp.s, sp.y + 3.0 * sp.s, sp.z + Math.sin(ang) * 0.55 * sp.s);
      dummy.rotation.set(Math.sin(ang) * 0.55, ang, -Math.cos(ang) * 0.55);
      dummy.scale.setScalar(sp.s);
      dummy.updateMatrix();
      limbs.setMatrixAt(idx * 3 + b, dummy.matrix);
    }

    const tint = tints[idx % tints.length];
    for (let c = 0; c < cardsPerTree; c++) {
      const [ox, oy, oz, rx, ry, sc] = cardOffsets[c];
      const cosR = Math.cos(sp.rot);
      const sinR = Math.sin(sp.rot);
      const wx = sp.x + (ox * cosR - oz * sinR) * sp.s;
      const wz = sp.z + (ox * sinR + oz * cosR) * sp.s;
      dummy.position.set(wx, sp.y + oy * sp.s, wz);
      dummy.rotation.set(rx, ry + sp.rot, c % 2 === 0 ? 0.2 : -0.2);
      dummy.scale.setScalar(sp.s * sc);
      dummy.updateMatrix();
      const ci = idx * cardsPerTree + c;
      leafCards.setMatrixAt(ci, dummy.matrix);
      leafCards.setColorAt(ci, tint);
    }
  });

  trunks.instanceMatrix.needsUpdate = true;
  limbs.instanceMatrix.needsUpdate = true;
  leafCards.instanceMatrix.needsUpdate = true;
  if (leafCards.instanceColor) leafCards.instanceColor.needsUpdate = true;
  parent.add(trunks, limbs, leafCards);
}
