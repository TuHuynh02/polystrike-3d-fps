import * as THREE from '../three.js';

export function createGridTexture(game, theme = {}, halfSize = 60) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const isDesert = theme.floorBase === '#27170c';
  const isLab = theme.floorBase === '#0b0f1e';
  const baseHex = isDesert ? '#4d3c2c' : isLab ? '#232a38' : '#323a45';
  const altHex = isDesert ? '#574432' : isLab ? '#293242' : '#3a434f';

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 1024, 1024);

  // Alternating poured harbor concrete / Saltline coastal tarmac slabs
  ctx.fillStyle = altHex;
  ctx.fillRect(6, 6, 500, 500);
  ctx.fillRect(518, 518, 500, 500);

  // Sub-slab subtle mineral tone variation & slab-edge weathering gradients
  ctx.fillStyle = isDesert ? 'rgba(255, 232, 195, 0.042)' : 'rgba(226, 238, 255, 0.032)';
  ctx.fillRect(256, 6, 250, 250);
  ctx.fillRect(6, 518, 250, 250);
  ctx.fillStyle = isDesert ? 'rgba(32, 20, 10, 0.06)' : 'rgba(10, 15, 22, 0.065)';
  ctx.fillRect(768, 6, 250, 250);
  ctx.fillRect(256, 768, 250, 250);

  // Saltline multi-scale mineral aggregate speckle & weathered coastal tarmac micro-texture
  for (let i = 0; i < 6400; i++) {
    const rx = (i * 73 + 19) % 1024;
    const ry = (i * 127 + 31) % 1024;
    const sz = (i % 3) + 1.2;
    if (i % 6 === 0) {
      ctx.fillStyle = isDesert ? 'rgba(245, 218, 180, 0.075)' : 'rgba(203, 213, 225, 0.068)';
    } else if (i % 11 === 0) {
      ctx.fillStyle = isDesert ? 'rgba(180, 130, 82, 0.08)' : 'rgba(148, 163, 184, 0.065)';
    } else {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.042)' : 'rgba(8, 12, 18, 0.078)';
    }
    ctx.fillRect(rx, ry, sz, sz);
  }

  // Organic weathered tire/oil smudges & salt-dampened patches
  for (let w = 0; w < 18; w++) {
    const wx = ((w * 193 + 80) % 900) + 60;
    const wy = ((w * 251 + 60) % 900) + 60;
    const rad = 58 + (w % 4) * 32;
    const wGrad = ctx.createRadialGradient(wx, wy, 6, wx, wy, rad);
    wGrad.addColorStop(0, isDesert ? 'rgba(52, 34, 18, 0.17)' : 'rgba(10, 15, 23, 0.18)');
    wGrad.addColorStop(0.65, isDesert ? 'rgba(68, 46, 26, 0.06)' : 'rgba(15, 23, 36, 0.065)');
    wGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(wx - rad, wy - rad, rad * 2, rad * 2);
  }

  // Realistic port forklift / heavy hauler dual tire tracks with subtle tread marks
  ctx.strokeStyle = isDesert ? 'rgba(38, 24, 12, 0.14)' : 'rgba(10, 14, 20, 0.14)';
  ctx.lineWidth = 10;
  for (const tx of [248, 280, 744, 776]) {
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx + (tx > 512 ? -18 : 10), 512);
    ctx.lineTo(tx + (tx > 512 ? -10 : 18), 1024);
    ctx.stroke();
  }
  ctx.fillStyle = isDesert ? 'rgba(30, 18, 8, 0.12)' : 'rgba(8, 11, 16, 0.11)';
  for (let ty = 12; ty < 1012; ty += 16) {
    ctx.fillRect(244, ty, 10, 5);
    ctx.fillRect(276, ty + 4, 10, 5);
  }

  // Realistic hairline concrete stress cracks & spalling branches
  ctx.strokeStyle = 'rgba(10, 13, 18, 0.48)';
  ctx.lineWidth = 1.4;
  for (let c = 0; c < 10; c++) {
    let cx = ((c * 179 + 90) % 860) + 80;
    let cy = ((c * 233 + 110) % 860) + 80;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 7; s++) {
      cx += ((c + s) % 2 === 0 ? 15 : -11) + s * 2.5;
      cy += ((c * s) % 3 === 0 ? 17 : -12);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Poured Concrete Expansion Joint Seams (Dark Bitumen Tar Sealant + Bevel Highlight)
  ctx.strokeStyle = 'rgba(7, 10, 15, 0.90)';
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

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.085)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 256) {
    ctx.beginPath();
    ctx.moveTo(i + 4, 0);
    ctx.lineTo(i + 4, 1024);
    ctx.moveTo(0, i + 4);
    ctx.lineTo(1024, i + 4);
    ctx.stroke();
  }

  // Weathered Saltline Safety-Yellow Berth Markings & Crisp White Port Lane Ticks
  ctx.fillStyle = isDesert ? 'rgba(218, 156, 46, 0.36)' : 'rgba(234, 170, 42, 0.52)';
  ctx.fillRect(488, 507, 48, 8);
  ctx.fillRect(507, 488, 8, 48);
  ctx.fillStyle = isDesert ? 'rgba(235, 224, 200, 0.18)' : 'rgba(226, 232, 240, 0.28)';
  for (let lx = 64; lx < 1000; lx += 128) {
    ctx.fillRect(lx, 509, 26, 5);
  }
  ctx.fillRect(244, 509, 24, 6);
  ctx.fillRect(756, 509, 24, 6);
  // Chipped paint wear on markings
  ctx.fillStyle = baseHex;
  ctx.fillRect(500, 508, 5, 5);
  ctx.fillRect(519, 510, 4, 4);
  ctx.fillRect(508, 496, 5, 5);

  // Detailed Cast-Iron Storm Drainage Grates at slab corners
  for (const bx of [32, 480, 544, 992]) {
    for (const by of [32, 480, 544, 992]) {
      ctx.fillStyle = 'rgba(12, 17, 24, 0.84)';
      ctx.fillRect(bx - 9, by - 9, 18, 18);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 9, by - 9, 18, 18);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
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
    base.setHSL(hsl.h, Math.min(hsl.s, 0.14), Math.max(0.28, Math.min(0.44, hsl.l * 1.08)));
  } else if (type === 'container') {
    let ch = hsl.h;
    let cs = Math.min(hsl.s, 0.56);
    if (ch >= 0.86 || ch <= 0.035) ch = 0.018;
    else if (ch > 0.16 && ch < 0.47) { ch = 0.265; cs = Math.min(cs, 0.36); }
    else if (ch >= 0.47 && ch <= 0.66) ch = 0.585;
    else if (ch > 0.035 && ch <= 0.16) ch = 0.075;
    base.setHSL(ch, cs, Math.max(0.22, Math.min(0.36, hsl.l)));
  } else if (type === 'crate') {
    const timberPalette = [0x6b4c35, 0x4a5238, 0x5a422e, 0x73593a];
    const numericHex = typeof hexColor === 'number' ? hexColor : parseInt(String(hexColor).replace('#', ''), 16) || 0;
    base.setHex(timberPalette[Math.abs(numericHex) % timberPalette.length]);
  }

  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 512, 512);

  // High-frequency surface grain
  for (let i = 0; i < 2200; i++) {
    const rx = (i * 67 + 13) % 512;
    const ry = (i * 109 + 29) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.034)' : 'rgba(0,0,0,0.052)';
    ctx.fillRect(rx, ry, 2.5, 2.5);
  }

  const vGrad = ctx.createLinearGradient(0, 0, 0, 512);
  vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.09)');
  vGrad.addColorStop(0.62, 'rgba(0, 0, 0, 0.0)');
  vGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.38)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 512, 512);

  if (type === 'container') {
    // Corrugated Steel Shipping Container Ribs with Smooth Cylindrical Shading & Edge Scuffs
    for (let x = 0; x < 512; x += 24) {
      const ribGrad = ctx.createLinearGradient(x, 0, x + 24, 0);
      ribGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.28)');
      ribGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.14)');
      ribGrad.addColorStop(0.68, 'rgba(255, 255, 255, 0.03)');
      ribGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.24)');
      ctx.fillStyle = ribGrad;
      ctx.fillRect(x, 26, 24, 460);
      // Subtle metallic wear glint along rib edge
      ctx.fillStyle = 'rgba(226, 232, 240, 0.06)';
      ctx.fillRect(x + 7, 32, 2, 444);
    }

    // Subtle Corten Steel Weathering, Paint Scuffs & Vertical Rain Streaks
    for (let w = 0; w < 20; w++) {
      const wx = ((w * 89 + 24) % 460) + 26;
      const wGrad = ctx.createLinearGradient(0, 26, 0, 170 + (w % 4) * 75);
      wGrad.addColorStop(0, w % 2 === 0 ? 'rgba(92, 40, 20, 0.22)' : 'rgba(12, 16, 24, 0.24)');
      wGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = wGrad;
      ctx.fillRect(wx, 26, 6 + (w % 3) * 2, 145 + (w % 4) * 75);
    }

    // Heavy Welded Outer ISO Steel Frame
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.90)';
    ctx.lineWidth = 28;
    ctx.strokeRect(0, 0, 512, 512);

    // Stenciled Saltline Maritime Port Logistics Identification Plate
    ctx.fillStyle = 'rgba(13, 18, 26, 0.86)';
    ctx.fillRect(38, 204, 436, 84);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(38, 204, 436, 84);

    ctx.fillStyle = 'rgba(241, 245, 249, 0.94)';
    ctx.font = '800 26px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NORDKAP LINE // SALTLINE', 256, 242);
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillStyle = 'rgba(234, 170, 42, 0.92)';
    ctx.fillText('BERTH 04 • 40HC • MAX GROSS 30,480 KG', 256, 268);

    // ISO Corner Casting Lift Pockets
    ctx.fillStyle = 'rgba(8, 11, 16, 0.92)';
    for (const cx of [14, 482]) {
      for (const cy of [14, 482]) {
        ctx.fillRect(cx, cy, 16, 16);
      }
    }

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

    // Central Stenciled Port Authority Cargo / IPPC HT Plate
    ctx.fillStyle = 'rgba(15, 19, 25, 0.92)';
    ctx.fillRect(118, 200, 276, 112);
    ctx.strokeStyle = 'rgba(229, 160, 36, 0.82)';
    ctx.lineWidth = 3;
    ctx.strokeRect(118, 200, 276, 112);

    ctx.fillStyle = '#e5a024';
    ctx.font = '800 22px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SALTLINE // ORDNANCE', 256, 242);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillText('IPPC HT-NO • LOT 04-762', 256, 272);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.78)';
    ctx.fillText('KEEP DRY // UP ↑↑', 256, 294);

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
    // Saltline Board-Formed Harbor Quay Concrete / Precast Blast Wall with Shuttering Grain & Tie-Rod Cones
    for (let by = 28; by < 492; by += 36) {
      ctx.fillStyle = by % 72 === 0 ? 'rgba(255, 255, 255, 0.025)' : 'rgba(8, 12, 18, 0.045)';
      ctx.fillRect(18, by, 476, 18);
      ctx.strokeStyle = 'rgba(10, 14, 20, 0.24)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(18, by);
      ctx.lineTo(494, by);
      ctx.stroke();
    }

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
    for (let w = 0; w < 24; w++) {
      const wx = ((w * 73 + 18) % 470) + 20;
      const wLen = 90 + (w % 5) * 55;
      const streakGrad = ctx.createLinearGradient(0, 16, 0, 16 + wLen);
      streakGrad.addColorStop(0, 'rgba(8, 12, 18, 0.30)');
      streakGrad.addColorStop(1, 'rgba(8, 12, 18, 0)');
      ctx.fillStyle = streakGrad;
      ctx.fillRect(wx, 16, 5 + (w % 3) * 3, wLen);
    }

    // Ground-splash grime darkening along wall base
    const splashGrad = ctx.createLinearGradient(0, 410, 0, 512);
    splashGrad.addColorStop(0, 'rgba(8, 12, 18, 0)');
    splashGrad.addColorStop(1, 'rgba(8, 12, 18, 0.36)');
    ctx.fillStyle = splashGrad;
    ctx.fillRect(16, 410, 480, 102);

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
    ctx.fillStyle = 'rgba(229, 160, 36, 0.58)';
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

/**
 * Returns [u0, v0, u1, v1] for one of the 4 quadrants in `createSaltlineDecalAtlasTexture`
 * (accounting for CanvasTexture flipY = true).
 */
export function getSaltlineDecalUVRect(quadrantIndex = 0) {
  const q = ((quadrantIndex % 4) + 4) % 4;
  const col = q % 2;
  const row = Math.floor(q / 2);
  const pad = 0.012;
  const u0 = col * 0.5 + pad;
  const u1 = (col + 1) * 0.5 - pad;
  const v1 = 1.0 - row * 0.5 - pad;
  const v0 = 1.0 - (row + 1) * 0.5 + pad;
  return [u0, v0, u1, v1];
}

/**
 * Saltline-style 512x512 industrial stencil & hazard decal atlas with chipped paint alpha breakup,
 * allowing dozens of wall/floor/container stencils to render in a single merged draw call.
 */
export function createSaltlineDecalAtlasTexture(game) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  // Quadrant 0 (top-left: x=0..256, y=0..256): ISO High-Voltage / Port Hazard Diamond
  ctx.fillStyle = 'rgba(12, 17, 24, 0.54)';
  ctx.fillRect(20, 18, 216, 214);
  ctx.strokeStyle = 'rgba(234, 170, 42, 0.65)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 18, 216, 214);
  ctx.save();
  ctx.translate(128, 98);
  ctx.beginPath();
  ctx.moveTo(0, -60);
  ctx.lineTo(60, 0);
  ctx.lineTo(0, 60);
  ctx.lineTo(-60, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(234, 170, 42, 0.92)';
  ctx.fill();
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = 'rgba(12, 16, 22, 0.96)';
  ctx.stroke();
  // Lightning bolt icon
  ctx.fillStyle = 'rgba(12, 16, 22, 0.96)';
  ctx.beginPath();
  ctx.moveTo(6, -32);
  ctx.lineTo(-17, 2);
  ctx.lineTo(-2, 2);
  ctx.lineTo(-10, 32);
  ctx.lineTo(17, -4);
  ctx.lineTo(2, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(15, 20, 28, 0.92)';
  ctx.fillRect(28, 174, 200, 44);
  ctx.strokeStyle = 'rgba(234, 170, 42, 0.88)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(28, 174, 200, 44);
  ctx.fillStyle = 'rgba(234, 170, 42, 0.96)';
  ctx.font = '800 16px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CAUTION // 480V PORT', 128, 202);
  // Corner mounting rivets
  ctx.fillStyle = 'rgba(203, 213, 225, 0.65)';
  for (const rx of [28, 224]) {
    for (const ry of [26, 220]) {
      ctx.fillRect(rx, ry, 4, 4);
    }
  }

  // Quadrant 1 (top-right: x=256..512, y=0..256): NORDKAP LINE // BERTH 04 Stencil
  ctx.fillStyle = 'rgba(13, 19, 28, 0.86)';
  ctx.fillRect(272, 42, 224, 172);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.72)';
  ctx.lineWidth = 3;
  ctx.strokeRect(272, 42, 224, 172);
  ctx.fillStyle = 'rgba(234, 170, 42, 0.94)';
  ctx.fillRect(282, 52, 204, 28);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 15px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText('NORDKAP LINE • OPS', 384, 71);
  ctx.fillStyle = 'rgba(241, 245, 249, 0.94)';
  ctx.font = '800 34px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText('BERTH 04', 384, 122);
  ctx.font = '700 13px Consolas, monospace';
  ctx.fillStyle = 'rgba(186, 198, 212, 0.92)';
  ctx.fillText('SALTLINE TERMINAL // S-04', 384, 152);
  ctx.fillText('LOAD LIMIT 32T • QUAY WALL', 384, 176);
  // Industrial stencil barcode strip
  ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
  for (let bx = 294; bx < 474; bx += 7) {
    ctx.fillRect(bx, 189, (bx % 3) + 2, 13);
  }

  // Quadrant 2 (bottom-left: x=0..256, y=256..512): Chipped Safety-Yellow Chevron Floor/Curb Marking
  ctx.save();
  if (typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
    ctx.beginPath();
    ctx.rect(16, 286, 224, 108);
    ctx.clip();
  }
  ctx.fillStyle = 'rgba(12, 17, 24, 0.88)';
  ctx.fillRect(16, 286, 224, 108);
  ctx.fillStyle = 'rgba(234, 170, 42, 0.90)';
  for (let sx = 18; sx <= 186; sx += 36) {
    ctx.beginPath();
    ctx.moveTo(sx, 394);
    ctx.lineTo(sx + 18, 394);
    ctx.lineTo(sx + 54, 286);
    ctx.lineTo(sx + 36, 286);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(234, 170, 42, 0.88)';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 286, 224, 108);
  ctx.fillStyle = 'rgba(15, 20, 28, 0.72)';
  ctx.fillRect(16, 404, 224, 38);
  ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
  ctx.font = '800 17px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText('LOADING ZONE // CLEAR', 128, 429);

  // Quadrant 3 (bottom-right: x=256..512, y=256..512): Industrial Sector Number Stencil
  ctx.fillStyle = 'rgba(13, 18, 25, 0.42)';
  ctx.fillRect(276, 282, 216, 200);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.78)';
  ctx.lineWidth = 4;
  ctx.strokeRect(276, 282, 216, 200);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.88)';
  ctx.font = '800 16px Consolas, monospace';
  ctx.fillText('SECTOR // PORT AUTH', 384, 316);
  ctx.fillStyle = 'rgba(234, 170, 42, 0.94)';
  ctx.font = '800 72px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText('B-07', 384, 398);
  ctx.fillStyle = 'rgba(203, 213, 225, 0.84)';
  ctx.font = '700 14px Consolas, monospace';
  ctx.fillText('NO UNAUTHORIZED ACCESS', 384, 444);

  // Procedural paint-chipping erosion pass + stencil-bridge distress so decals blend naturally into concrete/steel
  ctx.globalCompositeOperation = 'destination-out';
  // Stencil cut bridges across the large B-07 lettering
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(382, 336, 3, 72);
  ctx.fillRect(298, 370, 172, 2.5);
  for (let i = 0; i < 520; i++) {
    const cx = (i * 89 + 17) % 512;
    const cy = (i * 131 + 29) % 512;
    const w = 2 + (i % 5);
    const h = 2 + ((i * 3) % 4);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.26 + (i % 4) * 0.16})`;
    ctx.fillRect(cx, cy, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  const maxAniso = game?.renderer?.capabilities?.getMaxAnisotropy?.() || 4;
  tex.anisotropy = Math.min(8, maxAniso);
  game?.arenaTextures?.add(tex);
  return tex;
}

/**
 * Returns [u0, v0, u1, v1] for one of the 4 quadrants in `createBombsiteDecalAtlasTexture`
 * (0: Bombsite A, 1: Bombsite B, 2: Arrow -> A, 3: Arrow -> B).
 */
export function getBombsiteDecalUVRect(quadrantIndex = 0) {
  const q = ((quadrantIndex % 4) + 4) % 4;
  const col = q % 2;
  const row = Math.floor(q / 2);
  const pad = 0.014;
  const u0 = col * 0.5 + pad;
  const u1 = (col + 1) * 0.5 - pad;
  const v1 = 1.0 - row * 0.5 - pad;
  const v0 = 1.0 - (row + 1) * 0.5 + pad;
  return [u0, v0, u1, v1];
}

/**
 * Weathered CS:GO-style Bombsite A / B & directional route arrow stencil atlas (512x512).
 * Arrow quadrants (Q2, Q3) point along +U (right) so rotated floor quads orient cleanly without mirroring letters.
 */
export function createBombsiteDecalAtlasTexture(game) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  const drawSiteBadge = (ox, oy, letter, subLabel, accentFill, accentBorder) => {
    // Subtle dark spray overspray backing for readability on both light sand and dark concrete
    const glow = ctx.createRadialGradient(ox + 128, oy + 128, 24, ox + 128, oy + 128, 114);
    glow.addColorStop(0.0, 'rgba(10, 14, 20, 0.72)');
    glow.addColorStop(0.72, 'rgba(10, 14, 20, 0.36)');
    glow.addColorStop(1.0, 'rgba(10, 14, 20, 0.0)');
    ctx.fillStyle = glow;
    ctx.fillRect(ox + 8, oy + 8, 240, 240);

    // Painted industrial stencil box & corner ticks
    ctx.fillStyle = accentFill;
    ctx.fillRect(ox + 34, oy + 28, 188, 152);
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.88)';
    ctx.lineWidth = 6;
    ctx.strokeRect(ox + 34, oy + 28, 188, 152);
    ctx.strokeStyle = accentBorder;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(ox + 42, oy + 36, 172, 136);

    // Huge bold stencil letter
    ctx.textAlign = 'center';
    ctx.font = '900 116px "Chakra Petch", "Impact", "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(10, 14, 20, 0.65)';
    ctx.fillText(letter, ox + 131, oy + 148);
    ctx.fillStyle = 'rgba(242, 239, 230, 0.94)';
    ctx.fillText(letter, ox + 128, oy + 145);

    // Sub-plate ("SITE ALPHA" / "SITE BRAVO")
    ctx.fillStyle = 'rgba(12, 16, 22, 0.88)';
    ctx.fillRect(ox + 34, oy + 186, 188, 36);
    ctx.strokeStyle = accentBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 34, oy + 186, 188, 36);
    ctx.fillStyle = 'rgba(242, 239, 230, 0.92)';
    ctx.font = '800 17px "Chakra Petch", Consolas, monospace';
    ctx.fillText(subLabel, ox + 128, oy + 210);
  };

  const drawRouteArrow = (ox, oy, letter, accentFill, accentStroke) => {
    const glow = ctx.createRadialGradient(ox + 128, oy + 128, 22, ox + 128, oy + 128, 118);
    glow.addColorStop(0.0, 'rgba(10, 14, 20, 0.56)');
    glow.addColorStop(0.75, 'rgba(10, 14, 20, 0.22)');
    glow.addColorStop(1.0, 'rgba(10, 14, 20, 0.0)');
    ctx.fillStyle = glow;
    ctx.fillRect(ox + 6, oy + 18, 244, 220);

    // Site letter badge at arrow tail (left side)
    ctx.fillStyle = accentFill;
    ctx.fillRect(ox + 16, oy + 80, 68, 96);
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.90)';
    ctx.lineWidth = 4;
    ctx.strokeRect(ox + 16, oy + 80, 68, 96);
    ctx.textAlign = 'center';
    ctx.font = '900 58px "Chakra Petch", "Impact", sans-serif';
    ctx.fillStyle = 'rgba(10, 14, 20, 0.60)';
    ctx.fillText(letter, ox + 52, oy + 150);
    ctx.fillStyle = 'rgba(244, 241, 232, 0.95)';
    ctx.fillText(letter, ox + 50, oy + 148);

    // Directional double-chevron + heavy spray arrow pointing +U (right)
    ctx.fillStyle = 'rgba(238, 235, 225, 0.92)';
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.lineWidth = 5;

    // Chevron 1
    ctx.beginPath();
    ctx.moveTo(ox + 96, oy + 78);
    ctx.lineTo(ox + 124, oy + 78);
    ctx.lineTo(ox + 158, oy + 128);
    ctx.lineTo(ox + 124, oy + 178);
    ctx.lineTo(ox + 96, oy + 178);
    ctx.lineTo(ox + 130, oy + 128);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Primary arrowhead pointing +U
    ctx.fillStyle = accentStroke;
    ctx.beginPath();
    ctx.moveTo(ox + 146, oy + 62);
    ctx.lineTo(ox + 184, oy + 62);
    ctx.lineTo(ox + 240, oy + 128);
    ctx.lineTo(ox + 184, oy + 194);
    ctx.lineTo(ox + 146, oy + 194);
    ctx.lineTo(ox + 200, oy + 128);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  // Q0: Bombsite A (oxidized tactical crimson-red)
  drawSiteBadge(0, 0, 'A', 'SITE ALPHA // A', 'rgba(182, 48, 38, 0.86)', 'rgba(242, 236, 224, 0.78)');
  // Q1: Bombsite B (tactical ochre-amber)
  drawSiteBadge(256, 0, 'B', 'SITE BRAVO // B', 'rgba(204, 136, 28, 0.88)', 'rgba(242, 236, 224, 0.78)');
  // Q2: Route Arrow -> A
  drawRouteArrow(0, 256, 'A', 'rgba(182, 48, 38, 0.90)', 'rgba(214, 72, 54, 0.92)');
  // Q3: Route Arrow -> B
  drawRouteArrow(256, 256, 'B', 'rgba(204, 136, 28, 0.90)', 'rgba(232, 166, 42, 0.92)');

  // Stencil bridges & heavy weathered paint-chipping erosion pass
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  // Clean stencil cut bridges through A & B letterforms
  ctx.fillRect(126, 48, 3, 120);
  ctx.fillRect(382, 48, 3, 120);
  for (let i = 0; i < 640; i++) {
    const cx = (i * 97 + 13) % 512;
    const cy = (i * 149 + 31) % 512;
    const w = 2 + (i % 6);
    const h = 1.5 + ((i * 3) % 4);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.24 + (i % 4) * 0.17})`;
    ctx.fillRect(cx, cy, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  const maxAniso = game?.renderer?.capabilities?.getMaxAnisotropy?.() || 4;
  tex.anisotropy = Math.min(8, maxAniso);
  game?.arenaTextures?.add(tex);
  return tex;
}
