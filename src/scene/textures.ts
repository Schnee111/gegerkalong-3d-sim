import * as THREE from 'three';

// Real CC0 scanned photorealistic PBR textures & photographic skies (Poly Haven)
import asphaltDiffUrl from '../assets/textures/asphalt_diff.jpg';
import asphaltNorUrl from '../assets/textures/asphalt_nor.jpg';
import clayRoofDiffUrl from '../assets/textures/clay_roof_diff.jpg';
import clayRoofNorUrl from '../assets/textures/clay_roof_nor.jpg';
import greyRoofDiffUrl from '../assets/textures/grey_roof_diff.jpg';
import corrugatedDiffUrl from '../assets/textures/corrugated_diff.jpg';
import corrugatedNorUrl from '../assets/textures/corrugated_nor.jpg';
import paversDiffUrl from '../assets/textures/pavers_diff.jpg';
import paversNorUrl from '../assets/textures/pavers_nor.jpg';
import plasterDiffUrl from '../assets/textures/plaster_diff.jpg';
import plasterNorUrl from '../assets/textures/plaster_nor.jpg';
import skyMorningUrl from '../assets/textures/sky_morning.jpg';
import skyAfternoonUrl from '../assets/textures/sky_afternoon.jpg';

// Photorealistic Bandung architectural elevation textures (Ruko, Warung, Toko, Kos 4F, Pasar)
import facadeRukoCreamUrl from '../assets/textures/facade_ruko_cream.jpg';
import facadeWarungGreenUrl from '../assets/textures/facade_warung_green.jpg';
import facadeTokoRedUrl from '../assets/textures/facade_toko_red.jpg';
import facadeKos4fUrl from '../assets/textures/facade_kos_4f.jpg';
import facadePasarUrl from '../assets/textures/facade_pasar.jpg';
import wallWeatheredUrl from '../assets/textures/wall_weathered.jpg';

const loader = new THREE.TextureLoader();

function loadRepeatingTex(
  url: string,
  repX: number,
  repY: number,
  isColor: boolean
): THREE.Texture {
  const tex = loader.load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.anisotropy = 8;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  return tex;
}

export interface PbrMaterialMaps {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
}

export type FacadeKind = 'ruko' | 'warung' | 'toko' | 'kos' | 'pasar';

const FACADE_URLS: Record<FacadeKind, string> = {
  ruko: facadeRukoCreamUrl,
  warung: facadeWarungGreenUrl,
  toko: facadeTokoRedUrl,
  kos: facadeKos4fUrl,
  pasar: facadePasarUrl
};

export function loadFacadeTexture(kind: FacadeKind, repX = 1, repY = 1): THREE.Texture {
  const tex = loader.load(FACADE_URLS[kind]);
  tex.wrapS = repX > 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repY > 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.repeat.set(repX, repY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function loadWeatheredWallPbr(): PbrMaterialMaps {
  return {
    map: loadRepeatingTex(wallWeatheredUrl, 2.2, 1.4, true),
    normalMap: loadRepeatingTex(plasterNorUrl, 3, 2, false)
  };
}

export function loadAsphaltPbr(): PbrMaterialMaps {
  return {
    map: loadRepeatingTex(asphaltDiffUrl, 48, 1.4, true),
    normalMap: loadRepeatingTex(asphaltNorUrl, 48, 1.4, false)
  };
}

export function loadPaversPbr(repX = 64, repY = 1.2): PbrMaterialMaps {
  return {
    map: loadRepeatingTex(paversDiffUrl, repX, repY, true),
    normalMap: loadRepeatingTex(paversNorUrl, repX, repY, false)
  };
}

export function loadClayRoofPbr(): PbrMaterialMaps {
  return {
    map: loadRepeatingTex(clayRoofDiffUrl, 5, 2.5, true),
    normalMap: loadRepeatingTex(clayRoofNorUrl, 5, 2.5, false)
  };
}

export function loadGreyRoofPbr(): PbrMaterialMaps {
  return {
    map: loadRepeatingTex(greyRoofDiffUrl, 5, 2.5, true),
    normalMap: loadRepeatingTex(clayRoofNorUrl, 5, 2.5, false)
  };
}

export function loadCorrugatedPbr(): PbrMaterialMaps {
  return {
    map: loadRepeatingTex(corrugatedDiffUrl, 16, 3, true),
    normalMap: loadRepeatingTex(corrugatedNorUrl, 16, 3, false)
  };
}

export function loadPlasterPbr(): PbrMaterialMaps {
  return {
    map: loadRepeatingTex(plasterDiffUrl, 3, 2, true),
    normalMap: loadRepeatingTex(plasterNorUrl, 3, 2, false)
  };
}

export function loadEquirectSky(mode: 'morning' | 'afternoon'): THREE.Texture {
  const tex = loader.load(mode === 'morning' ? skyMorningUrl : skyAfternoonUrl);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Indonesian black-and-white painted concrete curb (Kanstin) texture.
 */
export function createKanstinCurbTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f1f0ec';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#23262b';
  ctx.fillRect(128, 0, 128, 64);
  const dust = ctx.createLinearGradient(0, 42, 0, 64);
  dust.addColorStop(0, 'rgba(60,55,48,0)');
  dust.addColorStop(1, 'rgba(60,55,48,0.45)');
  ctx.fillStyle = dust;
  ctx.fillRect(0, 42, 256, 22);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(90, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Realistic Bandung "D" license plate texture for vehicles.
 */
export function createBandungPlateTexture(plateText: string, isPublic = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = isPublic ? '#facc15' : '#111827';
  ctx.fillRect(0, 0, 256, 80);
  ctx.strokeStyle = isPublic ? '#18181b' : '#e5e7eb';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 72);
  ctx.fillStyle = isPublic ? '#111827' : '#f8fafc';
  ctx.font = '800 34px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateText, 128, 36);
  ctx.font = '600 15px "IBM Plex Mono", monospace';
  ctx.fillText('08 · 29', 128, 62);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRollingDoorTexture(tint = '#94a3b8'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    ctx.fillStyle = 'rgba(15,23,42,0.28)';
    ctx.fillRect(0, y, 128, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, y + 2, 128, 1.5);
  }
  ctx.fillStyle = 'rgba(15,23,42,0.4)';
  ctx.fillRect(62, 0, 4, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStorefrontInteriorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#fff7dc');
  grad.addColorStop(0.45, '#d6b482');
  grad.addColorStop(1, '#31261c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = 'rgba(30,24,18,0.5)';
  for (const sy of [64, 120, 176]) {
    ctx.fillRect(14, sy, 228, 10);
    for (let px = 22; px < 224; px += 22) {
      ctx.fillStyle = px % 44 === 0 ? 'rgba(185,28,28,0.45)' : 'rgba(29,78,216,0.4)';
      ctx.fillRect(px, sy - 24, 14, 24);
    }
    ctx.fillStyle = 'rgba(30,24,18,0.5)';
  }
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(100, 0);
  ctx.lineTo(28, 256);
  ctx.lineTo(0, 256);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStripedAwningTexture(colorA: string, colorB = '#f8fafc'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = (x / 32) % 2 === 0 ? colorA : colorB;
    ctx.fillRect(x, 0, 32, 128);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 114, 256, 14);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 62);
  grad.addColorStop(0, 'rgba(8, 10, 14, 0.65)');
  grad.addColorStop(0.65, 'rgba(8, 10, 14, 0.32)');
  grad.addColorStop(1, 'rgba(8, 10, 14, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(c);
}

export function createSignTexture(
  title: string,
  subtitle: string,
  bgColor: string,
  textColor: string,
  accentColor: string
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 160);

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 512, 16);

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 154);

  ctx.fillStyle = textColor;
  ctx.font = '800 42px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, subtitle ? 68 : 84, 476);

  if (subtitle) {
    ctx.font = '600 23px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.88;
    ctx.fillText(subtitle, 256, 120, 476);
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNoStopSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 114, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 22;
  ctx.strokeStyle = '#b91c1c';
  ctx.stroke();

  ctx.fillStyle = '#18181b';
  ctx.font = '900 130px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', 128, 134);

  ctx.strokeStyle = '#b91c1c';
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(46, 210);
  ctx.lineTo(210, 46);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * High-detail botanical tropical leaf-cluster texture with alpha transparency
 * so tree canopies have crisp leafy silhouettes & dappled shadows instead of round balls.
 */
export function createLeafClusterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  // Subtle dark woody twigs radiating from center
  ctx.strokeStyle = '#3b2d22';
  ctx.lineWidth = 4;
  for (let b = 0; b < 6; b++) {
    const ang = (b / 6) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.cos(ang) * 76, 128 + Math.sin(ang) * 76);
    ctx.stroke();
  }

  // Deterministic overlapping pointed tropical leaves (Angsana/Mangga Bandung)
  let seed = 9012;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const leafColors = ['#2d5a34', '#396d3f', '#467d47', '#558c4f', '#244a2a', '#649a56'];
  for (let i = 0; i < 88; i++) {
    const r = Math.pow(rand(), 0.65) * 96;
    const theta = rand() * Math.PI * 2;
    const lx = 128 + Math.cos(theta) * r;
    const ly = 128 + Math.sin(theta) * r;
    const rot = theta + (rand() - 0.5) * 1.1;
    const len = 18 + rand() * 18;
    const wid = 7 + rand() * 7;

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(rot);
    ctx.fillStyle = leafColors[Math.floor(rand() * leafColors.length)];
    ctx.beginPath();
    ctx.moveTo(-len * 0.45, 0);
    ctx.quadraticCurveTo(0, -wid, len * 0.55, 0);
    ctx.quadraticCurveTo(0, wid, -len * 0.45, 0);
    ctx.closePath();
    ctx.fill();

    // Subtle sunlit midrib vein
    ctx.strokeStyle = 'rgba(210, 235, 175, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-len * 0.35, 0);
    ctx.lineTo(len * 0.42, 0);
    ctx.stroke();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
