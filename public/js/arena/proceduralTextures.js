import * as THREE from '../three.js';

export function createGridTexture(game, theme = {}, halfSize = 60) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const isDesert = theme.floorBase === '#27170c';
  const isLab = theme.floorBase === '#0b0f1e';
  const baseHex = isDesert ? '#423427' : isLab ? '#1e2430' : '#282e37';
  const altHex = isDesert ? '#4a3b2c' : isLab ? '#232a38' : '#2f3640';

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 1024, 1024);

  // Alternating poured concrete / asphalt tarmac slabs
  ctx.fillStyle = altHex;
  ctx.fillRect(6, 6, 500, 500);
  ctx.fillRect(518, 518, 500, 500);

  // Sub-slab subtle tone variation
  ctx.fillStyle = isDesert ? 'rgba(255, 235, 200, 0.03)' : 'rgba(255, 255, 255, 0.022)';
  ctx.fillRect(256, 6, 250, 250);
  ctx.fillRect(6, 518, 250, 250);

  // High-frequency mineral aggregate speckle & weathered tarmac micro-texture
  for (let i = 0; i < 4800; i++) {
    const rx = (i * 73 + 19) % 1024;
    const ry = (i * 127 + 31) % 1024;
    const sz = (i % 3) + 1.5;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.048)' : 'rgba(0, 0, 0, 0.068)';
    ctx.fillRect(rx, ry, sz, sz);
  }

  // Organic weathered tire/oil smudge & moisture patches
  for (let w = 0; w < 14; w++) {
    const wx = ((w * 193 + 80) % 900) + 60;
    const wy = ((w * 251 + 60) % 900) + 60;
    const rad = 65 + (w % 4) * 28;
    const wGrad = ctx.createRadialGradient(wx, wy, 6, wx, wy, rad);
    wGrad.addColorStop(0, isDesert ? 'rgba(52, 34, 18, 0.18)' : 'rgba(8, 11, 16, 0.16)');
    wGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(wx - rad, wy - rad, rad * 2, rad * 2);
  }

  // Realistic hairline concrete stress cracks
  ctx.strokeStyle = 'rgba(12, 15, 20, 0.45)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 8; c++) {
    let cx = ((c * 179 + 90) % 860) + 80;
    let cy = ((c * 233 + 110) % 860) + 80;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += ((c + s) % 2 === 0 ? 14 : -11) + s * 3;
      cy += ((c * s) % 3 === 0 ? 16 : -12);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Poured Concrete Expansion Joint Seams (Dark Bitumen Sealant + Bevel Highlight)
  ctx.strokeStyle = 'rgba(10, 12, 16, 0.84)';
  ctx.lineWidth = 5;
  for (let i = 0; i <= 1024; i += 256) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.065)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 256) {
    ctx.beginPath();
    ctx.moveTo(i + 4, 0);
    ctx.lineTo(i + 4, 1024);
    ctx.moveTo(0, i + 4);
    ctx.lineTo(1024, i + 4);
    ctx.stroke();
  }

  // Faded Tactical Ochre/Yellow Painted Tarmac Alignment Markings at slab intersections
  ctx.fillStyle = 'rgba(229, 160, 36, 0.38)';
  ctx.fillRect(496, 508, 32, 8);
  ctx.fillRect(508, 496, 8, 32);

  // Detailed Cast-Iron Storm Drainage Grates at slab corners
  for (const bx of [32, 480, 544, 992]) {
    for (const by of [32, 480, 544, 992]) {
      ctx.fillStyle = 'rgba(15, 20, 28, 0.78)';
      ctx.fillRect(bx - 8, by - 8, 16, 16);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
      for (let slot = -5; slot <= 5; slot += 4) {
        ctx.fillRect(bx - 6, by + slot, 12, 1.5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const maxAniso = game.renderer.capabilities.getMaxAnisotropy?.() || 4;
  tex.anisotropy = Math.min(8, maxAniso);
  const repeats = Math.round(halfSize / 2);
  tex.repeat.set(repeats, repeats);
  game.arenaTextures.add(tex);
  return tex;
}

export function createFloorBumpTexture(game, halfSize = 60) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);

  // Micro-aggregate concrete grain relief
  for (let i = 0; i < 3200; i++) {
    const rx = (i * 59 + 11) % 512;
    const ry = (i * 97 + 23) % 512;
    ctx.fillStyle = i % 2 === 0 ? '#9c9c9c' : '#646464';
    ctx.fillRect(rx, ry, 2, 2);
  }

  // Subtle surface wear patches for roughness variation
  for (let w = 0; w < 8; w++) {
    const wx = ((w * 97 + 40) % 440) + 36;
    const wy = ((w * 127 + 30) % 440) + 36;
    const g = ctx.createRadialGradient(wx, wy, 4, wx, wy, 44);
    g.addColorStop(0, '#585858');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(wx - 44, wy - 44, 88, 88);
  }

  // Recessed concrete slab expansion joints
  ctx.strokeStyle = '#202020';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const repeats = Math.round(halfSize / 2);
  tex.repeat.set(repeats, repeats);
  game.arenaTextures.add(tex);
  return tex;
}

export function createObstacleTexture(game, hexColor, type = 'wall') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Map obstacle colors into grounded military concrete, weathered shipping containers, steel decks, and timber crates
  const base = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  if (type === 'wall' || type === 'platform' || type === 'step') {
    base.setHSL(hsl.h, Math.min(hsl.s, 0.14), Math.max(0.26, Math.min(0.42, hsl.l * 1.12)));
  } else if (type === 'container') {
    let containerH = hsl.h;
    if (containerH > 0.72 && containerH < 0.96) {
      containerH = 0.04; // Corten rust-red
    }
    base.setHSL(containerH, Math.min(hsl.s, 0.44), Math.max(0.22, Math.min(0.38, hsl.l)));
  } else if (type === 'crate') {
    const timberPalette = [0x6b4c35, 0x4a5238, 0x5a422e, 0x785c3c];
    const numericHex = typeof hexColor === 'number' ? hexColor : parseInt(String(hexColor).replace('#', ''), 16) || 0;
    base.setHex(timberPalette[Math.abs(numericHex) % timberPalette.length]);
  }

  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 512, 512);

  // High-frequency surface grain
  for (let i = 0; i < 1800; i++) {
    const rx = (i * 67 + 13) % 512;
    const ry = (i * 109 + 29) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.048)';
    ctx.fillRect(rx, ry, 3, 3);
  }

  const vGrad = ctx.createLinearGradient(0, 0, 0, 512);
  vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.10)');
  vGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.0)');
  vGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.34)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 512, 512);

  if (type === 'container') {
    // Deep Corrugated Steel Shipping Container Ribs with Smooth Cylindrical Shading
    for (let x = 0; x < 512; x += 24) {
      const ribGrad = ctx.createLinearGradient(x, 0, x + 24, 0);
      ribGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.38)');
      ribGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.15)');
      ribGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.04)');
      ribGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.32)');
      ctx.fillStyle = ribGrad;
      ctx.fillRect(x, 26, 24, 460);
    }

    // Subtle Corten Steel Weathering, Paint Scuffs & Rain Streaks
    for (let w = 0; w < 16; w++) {
      const wx = ((w * 89 + 24) % 460) + 26;
      ctx.fillStyle = w % 2 === 0 ? 'rgba(68, 32, 16, 0.16)' : 'rgba(15, 20, 28, 0.18)';
      ctx.fillRect(wx, 28, 8, 120 + (w % 4) * 70);
    }

    // Heavy Welded Outer ISO Steel Frame
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.90)';
    ctx.lineWidth = 28;
    ctx.strokeRect(0, 0, 512, 512);

    // Stenciled Military Logistics Identification Plate
    ctx.fillStyle = 'rgba(15, 20, 28, 0.80)';
    ctx.fillRect(42, 208, 428, 76);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.38)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 208, 428, 76);

    ctx.fillStyle = 'rgba(241, 245, 249, 0.90)';
    ctx.font = '800 28px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NATO // LOG-CARGO 40HC', 256, 246);
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillStyle = 'rgba(229, 160, 36, 0.90)';
    ctx.fillText('MAX GROSS 30,480 KG  •  TARE 3,800 KG', 256, 270);

    // Bottom Forklift Pockets
    ctx.fillStyle = 'rgba(12, 15, 20, 0.88)';
    ctx.fillRect(140, 482, 68, 22);
    ctx.fillRect(304, 482, 68, 22);
  } else if (type === 'crate') {
    // Horizontal Wood Grain Fiber Streaks & Timber Knots
    for (let g = 0; g < 180; g++) {
      const gx = (g * 53 + 17) % 440 + 36;
      const gy = (g * 29 + 39) % 430 + 40;
      const glen = 28 + (g % 5) * 18;
      ctx.fillStyle = g % 3 === 0 ? 'rgba(25, 16, 8, 0.20)' : 'rgba(255, 235, 205, 0.07)';
      ctx.fillRect(gx, gy, Math.min(glen, 472 - gx), 2);
    }

    // Military Timber Ordnance Supply Crate with Recessed Panel & Bolted Steel Framing
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.92)';
    ctx.lineWidth = 34;
    ctx.strokeRect(16, 16, 480, 480);

    // Horizontal Plank Slats
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.46)';
    ctx.lineWidth = 4;
    for (let y = 72; y < 448; y += 54) {
      ctx.beginPath();
      ctx.moveTo(42, y);
      ctx.lineTo(470, y);
      ctx.stroke();
    }

    // Diagonal Timber Cross-Braces with Bevel Highlight
    ctx.strokeStyle = 'rgba(18, 12, 8, 0.48)';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(58, 58);
    ctx.lineTo(454, 454);
    ctx.moveTo(454, 58);
    ctx.lineTo(58, 454);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 240, 215, 0.16)';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(58, 58);
    ctx.lineTo(454, 454);
    ctx.moveTo(454, 58);
    ctx.lineTo(58, 454);
    ctx.stroke();

    // Central Stenciled Military Ammunition Plate
    ctx.fillStyle = 'rgba(15, 19, 25, 0.92)';
    ctx.fillRect(126, 204, 260, 104);
    ctx.strokeStyle = 'rgba(229, 160, 36, 0.82)';
    ctx.lineWidth = 3;
    ctx.strokeRect(126, 204, 260, 104);

    ctx.fillStyle = '#e5a024';
    ctx.font = '800 24px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ORDNANCE SUPPLY', 256, 248);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillText('CAL 7.62MM NATO // LOT-42', 256, 282);

    // Corner Steel L-Brackets & Rivets
    ctx.fillStyle = '#94a3b8';
    for (const cx of [38, 474]) {
      for (const cy of [38, 474]) {
        ctx.fillRect(cx - 9, cy - 9, 18, 18);
      }
    }
  } else if (type === 'pillar') {
    // Structural Concrete & Steel H-Beam Column with Hazard Base
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.lineWidth = 22;
    ctx.strokeRect(12, 12, 488, 488);

    ctx.fillStyle = 'rgba(30, 36, 46, 0.68)';
    ctx.fillRect(54, 36, 404, 440);

    // Vertical Steel Flange Seams & Rivet Bolts
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.48)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(176, 24);
    ctx.lineTo(176, 488);
    ctx.moveTo(336, 24);
    ctx.lineTo(336, 488);
    ctx.stroke();

    ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
    for (let ry = 48; ry < 400; ry += 36) {
      ctx.fillRect(162, ry, 6, 6);
      ctx.fillRect(344, ry, 6, 6);
    }

    // Industrial Yellow/Black Hazard Striping near base
    ctx.fillStyle = '#e5a024';
    ctx.fillRect(36, 412, 440, 48);
    ctx.fillStyle = '#111827';
    for (let hx = 40; hx < 460; hx += 40) {
      ctx.beginPath();
      ctx.moveTo(hx, 412);
      ctx.lineTo(hx + 20, 412);
      ctx.lineTo(hx, 460);
      ctx.lineTo(hx - 20, 460);
      ctx.closePath();
      ctx.fill();
    }
  } else if (type === 'platform') {
    // Reinforced Concrete & Anti-Slip Diamond-Plate Steel Decking (Tiles seamlessly)
    ctx.strokeStyle = 'rgba(15, 20, 28, 0.72)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 506);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();

    // Inset diamond-plate steel deck panels
    ctx.fillStyle = 'rgba(30, 41, 59, 0.35)';
    ctx.fillRect(24, 24, 208, 208);
    ctx.fillRect(280, 280, 208, 208);

    // Anti-slip diamond tread micro-pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let py = 36; py < 480; py += 16) {
      for (let px = 36; px < 480; px += 16) {
        ctx.fillRect(px, py, 6, 2);
        ctx.fillRect(px + 8, py + 8, 2, 6);
      }
    }

    // Recessed corner bolt heads
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    for (const bx of [18, 238, 274, 494]) {
      for (const by of [18, 238, 274, 494]) {
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (type === 'step') {
    // Galvanized Industrial Stair Tread with High-Vis Anti-Slip Yellow Nosing
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    for (let y = 24; y < 488; y += 24) {
      for (let x = 16; x < 496; x += 32) {
        ctx.fillRect(x, y, 18, 8);
      }
    }
    ctx.fillStyle = '#e5a024';
    ctx.fillRect(0, 0, 512, 28);
    ctx.fillRect(0, 484, 512, 28);
    ctx.fillStyle = '#111827';
    for (let hx = 0; hx < 512; hx += 48) {
      ctx.fillRect(hx, 0, 24, 28);
      ctx.fillRect(hx + 24, 484, 24, 28);
    }
  } else {
    // Precast Reinforced Concrete Blast Wall / Bremer Wall with Formwork Seams & Tie-Rod Cones
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 506);

    ctx.strokeStyle = 'rgba(10, 14, 20, 0.58)';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, 480, 480);

    ctx.beginPath();
    ctx.moveTo(16, 256);
    ctx.lineTo(496, 256);
    ctx.moveTo(256, 16);
    ctx.lineTo(256, 496);
    ctx.stroke();

    // Subtle vertical water-runoff weathering streaks from top coping
    for (let w = 0; w < 18; w++) {
      const wx = ((w * 73 + 18) % 470) + 20;
      const wLen = 70 + (w % 5) * 45;
      const streakGrad = ctx.createLinearGradient(0, 16, 0, 16 + wLen);
      streakGrad.addColorStop(0, 'rgba(10, 14, 20, 0.22)');
      streakGrad.addColorStop(1, 'rgba(10, 14, 20, 0)');
      ctx.fillStyle = streakGrad;
      ctx.fillRect(wx, 16, 6 + (w % 3) * 3, wLen);
    }

    // Concrete Formwork Tie-Rod Recess Cones with Metallic Plugs
    for (const tx of [84, 196, 316, 428]) {
      for (const ty of [84, 196, 316, 428]) {
        ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
        ctx.beginPath();
        ctx.arc(tx, ty, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.beginPath();
        ctx.arc(tx - 1, ty - 1, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Faded Ochre Caution Curb Markers at bottom
    ctx.fillStyle = 'rgba(229, 160, 36, 0.55)';
    for (let wx = 36; wx < 476; wx += 52) {
      ctx.fillRect(wx, 462, 28, 12);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const maxAniso = game.renderer.capabilities.getMaxAnisotropy?.() || 4;
  tex.anisotropy = Math.min(8, maxAniso);
  game.arenaTextures.add(tex);
  return tex;
}

export function createObstacleBumpTexture(game, type = 'wall') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle micro-surface grain
  for (let i = 0; i < 1200; i++) {
    const rx = (i * 43 + 7) % 256;
    const ry = (i * 71 + 19) % 256;
    ctx.fillStyle = i % 2 === 0 ? '#969696' : '#6a6a6a';
    ctx.fillRect(rx, ry, 2, 2);
  }

  if (type === 'container') {
    for (let x = 0; x < 256; x += 12) {
      ctx.fillStyle = x % 24 === 0 ? '#242424' : '#dedede';
      ctx.fillRect(x, 12, 6, 232);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, 256, 256);
  } else if (type === 'crate') {
    ctx.strokeStyle = '#e4e4e4';
    ctx.lineWidth = 18;
    ctx.strokeRect(8, 8, 240, 240);
    ctx.fillStyle = '#484848';
    ctx.fillRect(28, 28, 200, 200);
    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 3;
    for (let y = 36; y < 224; y += 27) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(232, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(224, 224);
    ctx.moveTo(224, 32);
    ctx.lineTo(32, 224);
    ctx.stroke();
  } else if (type === 'platform' || type === 'step') {
    ctx.strokeStyle = '#282828';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 252);
    ctx.fillStyle = '#b8b8b8';
    for (let y = 12; y < 244; y += 12) {
      for (let x = 12; x < 244; x += 12) {
        ctx.fillRect(x, y, 4, 2);
        ctx.fillRect(x + 5, y + 5, 2, 4);
      }
    }
  } else {
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.strokeStyle = '#242424';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 232, 232);
    ctx.beginPath();
    ctx.moveTo(12, 128);
    ctx.lineTo(244, 128);
    ctx.moveTo(128, 12);
    ctx.lineTo(128, 244);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  game.arenaTextures.add(tex);
  return tex;
}

/**
 * Scales BoxGeometry UVs proportionally to world dimensions (w, h, d) so tiled concrete/deck textures
 * maintain crisp, uniform texel density on both 1.5m cover blocks and 120m perimeter walls.
 */
export function applyBoxWorldUVs(geo, w, h, d, tileSize = 3.2) {
  const uv = geo.attributes.uv;
  if (!uv || uv.count < 24) return;

  const setFaceUVScale = (faceIndex, uSpan, vSpan) => {
    const uRep = Math.max(0.5, Number((uSpan / tileSize).toFixed(2)));
    const vRep = Math.max(0.5, Number((vSpan / tileSize).toFixed(2)));
    const base = faceIndex * 4;
    for (let i = 0; i < 4; i++) {
      const u0 = uv.getX(base + i);
      const v0 = uv.getY(base + i);
      uv.setXY(base + i, u0 * uRep, v0 * vRep);
    }
  };

  // BoxGeometry face order: 0:+X (d x h), 1:-X (d x h), 2:+Y (w x d), 3:-Y (w x d), 4:+Z (w x h), 5:-Z (w x h)
  setFaceUVScale(0, d, h);
  setFaceUVScale(1, d, h);
  setFaceUVScale(2, w, d);
  setFaceUVScale(3, w, d);
  setFaceUVScale(4, w, h);
  setFaceUVScale(5, w, h);
  uv.needsUpdate = true;
}
