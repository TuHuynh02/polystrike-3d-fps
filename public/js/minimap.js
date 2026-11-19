// Tactical Top-Left Mini Map / Radar (#hud-minimap)
// Renders static map obstacles (cached on offscreen canvas), active health packs,
// dropped weapons, enemy positions, and the local player's position + FOV cone.

import { DEFAULT_MAP_ID, getMapConfig } from '../shared/constants.js';

function formatCalloutLabel(callout) {
  if (!callout) return '';
  if (callout.shortName && String(callout.shortName).trim()) {
    return String(callout.shortName).trim().toUpperCase();
  }
  const raw = String(callout.name || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s*&\s*/g, '/')
    .replace(/\bCONTAINER\b/gi, 'CARGO')
    .replace(/\bOVERWATCH\b/gi, 'OVW')
    .replace(/\bSANCTUARY\b/gi, 'SANC')
    .replace(/\bGENERATOR\b/gi, 'GEN')
    .replace(/\bCROSSROADS\b/gi, 'CROSS')
    .replace(/\bWATCHTOWER\b/gi, 'TOWER')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return raw.length > 10 ? raw.slice(0, 10).trim() : raw;
}

function boxesOverlap(a, b) {
  return !(a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3]);
}

export class TacticalMinimap {
  constructor(options = {}) {
    this.canvasId = options.canvasId || 'minimap-canvas';
    this.coordsId = options.coordsId || 'minimap-coords';
    this.mapLabelId = options.mapLabelId || 'minimap-map-label';

    this.canvas = typeof document !== 'undefined' ? document.getElementById(this.canvasId) : null;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.coordsEl = typeof document !== 'undefined' ? document.getElementById(this.coordsId) : null;
    this.mapLabelEl = typeof document !== 'undefined' ? document.getElementById(this.mapLabelId) : null;

    this.size = this.canvas ? this.canvas.width : 184;
    this.staticCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.staticCanvas) {
      this.staticCanvas.width = this.size;
      this.staticCanvas.height = this.size;
    }
    this.staticCtx = this.staticCanvas ? this.staticCanvas.getContext('2d') : null;

    this.mapConfig = getMapConfig(DEFAULT_MAP_ID);
    this.arenaHalfSize = this.mapConfig.arenaHalfSize || 60;
    this.lastRenderAt = -Infinity;
    this.lastCoordsUpdateAt = 0;
    this.lastCoordStr = '';
    this.gunfireBlips = new Map();

    this.setMap(DEFAULT_MAP_ID);
  }

  /**
   * Records an enemy gunfire blip on the radar for unsuppressed weapons.
   * Suppressed weapons (`m4a1` PHANTOM-M4) and melee (`knife`) remain stealthy and do not trigger a gunfire sonar ring.
   */
  recordGunfireBlip(shooterId, x, z, weaponId = 'rifle', now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    if (!shooterId || weaponId === 'm4a1' || weaponId === 'knife') return false;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    this.gunfireBlips.set(shooterId, {
      x,
      z,
      weaponId,
      at: now,
      durationMs: 2200
    });
    return true;
  }

  worldToCanvasX(x) {
    const span = this.arenaHalfSize * 2;
    return ((x + this.arenaHalfSize) / span) * this.size;
  }

  worldToCanvasY(z) {
    const span = this.arenaHalfSize * 2;
    return ((z + this.arenaHalfSize) / span) * this.size;
  }

  clampBlipCoord(px, margin = 4) {
    return Math.max(margin, Math.min(this.size - margin, px));
  }

  setMap(mapIdOrConfig) {
    const cfg = typeof mapIdOrConfig === 'string'
      ? getMapConfig(mapIdOrConfig)
      : (mapIdOrConfig || getMapConfig(DEFAULT_MAP_ID));

    if (this.canvas && this.canvas.width > 0 && this.size === this._bakedSize && this.canvas.width !== this.size) {
      this.size = this.canvas.width;
    }

    this.mapConfig = cfg;
    this.arenaHalfSize = cfg.arenaHalfSize || 60;
    this.lastRenderAt = -Infinity;
    if (this.gunfireBlips) this.gunfireBlips.clear();

    if (this.mapLabelEl && cfg.name) {
      this.mapLabelEl.textContent = cfg.name;
    }

    if (
      cfg.id &&
      this._bakedMapId === cfg.id &&
      this._bakedSize === this.size &&
      this._bakedObstaclesRef === (cfg.obstacles || null)
    ) {
      if (this.ctx && this.staticCanvas) {
        this.ctx.drawImage(this.staticCanvas, 0, 0, this.size, this.size);
      }
      return;
    }

    this.bakeStaticObstacles();
  }

  bakeStaticObstacles() {
    if (!this.staticCtx) return;
    const ctx = this.staticCtx;
    const s = this.size;
    if (this.staticCanvas && (this.staticCanvas.width !== s || this.staticCanvas.height !== s)) {
      this.staticCanvas.width = s;
      this.staticCanvas.height = s;
    }
    const span = this.arenaHalfSize * 2;
    const scale = s / span;

    ctx.clearRect(0, 0, s, s);

    // 1. Tactical Dark Radar Background
    const bgGrad = ctx.createRadialGradient(s / 2, s / 2, s * 0.06, s / 2, s / 2, s * 0.74);
    bgGrad.addColorStop(0, 'rgba(18, 25, 36, 0.96)');
    bgGrad.addColorStop(0.65, 'rgba(11, 16, 24, 0.97)');
    bgGrad.addColorStop(1, 'rgba(5, 8, 13, 0.99)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, s, s);

    // 2. Subtle Sector Grid & Radar Range Rings
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    const gridStep = s / 6;
    for (let i = 1; i < 6; i++) {
      const p = Math.round(i * gridStep) + 0.5;
      ctx.strokeStyle = i === 3 ? 'rgba(56, 189, 248, 0.13)' : 'rgba(148, 163, 184, 0.08)';
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(s, p);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.11)';
    for (const rRatio of [0.24, 0.44]) {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * rRatio, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Draw Map Obstacles (Platforms first, then Steps, Barricades, Crates, Containers, Walls, Pillars)
    const obstacles = this.mapConfig?.obstacles || [];
    const layerOrder = { platform: 1, step: 2, barricade: 3, crate: 3, container: 4, wall: 5, pillar: 6 };
    const sorted = [...obstacles].sort(
      (a, b) => (layerOrder[a.type] || 3) - (layerOrder[b.type] || 3)
    );

    for (let i = 0; i < sorted.length; i++) {
      const obs = sorted[i];
      // Skip outer perimeter walls so the border frame stays clean
      if (obs.type === 'wall' && Math.max(obs.w, obs.d) > span * 0.85) continue;

      const w = Math.max(1.5, obs.w * scale);
      const d = Math.max(1.5, obs.d * scale);
      const x = this.worldToCanvasX(obs.x) - w / 2;
      const y = this.worldToCanvasY(obs.z) - d / 2;

      if (obs.type === 'platform') {
        ctx.fillStyle = 'rgba(43, 55, 72, 0.74)';
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, d);
        ctx.strokeRect(x, y, w, d);
      } else if (obs.type === 'step') {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.60)';
        ctx.fillRect(x, y, w, d);
      } else if (obs.type === 'barricade') {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.42)';
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.fillRect(x, y, w, d);
        ctx.strokeRect(x, y, w, d);
      } else if (obs.type === 'container') {
        ctx.fillStyle = 'rgba(14, 116, 168, 0.56)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.80)';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, d);
        ctx.strokeRect(x, y, w, d);
      } else if (obs.type === 'crate') {
        ctx.fillStyle = 'rgba(217, 119, 6, 0.64)';
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
        ctx.lineWidth = 0.8;
        ctx.fillRect(x, y, w, d);
        ctx.strokeRect(x, y, w, d);
      } else if (obs.type === 'pillar') {
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.lineWidth = 1;
        const pw = Math.max(2.5, w);
        const pd = Math.max(2.5, d);
        ctx.fillRect(x, y, pw, pd);
        ctx.strokeRect(x, y, pw, pd);
      } else {
        // Wall
        ctx.fillStyle = 'rgba(186, 199, 214, 0.88)';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.lineWidth = 0.8;
        ctx.fillRect(x, y, w, d);
        ctx.strokeRect(x, y, w, d);
      }
    }

    // 4. Pre-render Tactical Callout Zone Labels onto the static radar canvas (with 2D AABB collision guard)
    const callouts = this.mapConfig?.callouts || [];
    if (callouts.length > 0 && typeof ctx.fillText === 'function') {
      ctx.save?.();
      ctx.font = '700 6.8px "JetBrains Mono", "Rajdhani", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;

      const pad = 4;
      const mid = s * 0.5;
      const cardHalfW = Math.max(12, s * 0.075);
      const cardDepth = Math.max(17, s * 0.095);
      const placedBoxes = [
        [mid - cardHalfW, 0, mid + cardHalfW, cardDepth], // N cardinal zone
        [mid - cardHalfW, s - cardDepth, mid + cardHalfW, s], // S cardinal zone
        [0, mid - 9, cardDepth, mid + 9], // W cardinal zone
        [s - cardDepth, mid - 9, s, mid + 9] // E cardinal zone
      ];

      const labelH = 8;
      const nudgeOffsets = [
        [0, 0],
        [0, 10],
        [0, -10],
        [12, 0],
        [-12, 0],
        [0, 18],
        [0, -18]
      ];

      for (let i = 0; i < callouts.length; i++) {
        const label = formatCalloutLabel(callouts[i]);
        if (!label) continue;

        const rawW = typeof ctx.measureText === 'function' ? ctx.measureText(label).width : label.length * 4.5;
        const labelW = Math.max(10, rawW);
        const halfW = labelW * 0.5;
        const halfH = labelH * 0.5;
        const marginX = halfW + 4;
        const marginY = halfH + 4;
        if (marginX * 2 >= s || marginY * 2 >= s) continue;

        const baseX = Math.max(marginX, Math.min(s - marginX, this.worldToCanvasX(callouts[i].x)));
        const baseY = Math.max(marginY, Math.min(s - marginY, this.worldToCanvasY(callouts[i].z)));

        let chosen = null;
        for (let k = 0; k < nudgeOffsets.length; k++) {
          const cx = baseX + nudgeOffsets[k][0];
          const cy = baseY + nudgeOffsets[k][1];
          if (cx < marginX || cx > s - marginX || cy < marginY || cy > s - marginY) continue;
          const box = [cx - halfW - pad, cy - halfH - pad, cx + halfW + pad, cy + halfH + pad];
          let hits = false;
          for (let j = 0; j < placedBoxes.length; j++) {
            if (boxesOverlap(box, placedBoxes[j])) {
              hits = true;
              break;
            }
          }
          if (!hits) {
            chosen = { cx, cy, box };
            break;
          }
        }

        if (!chosen) continue;
        placedBoxes.push(chosen.box);
        ctx.strokeStyle = 'rgba(4, 8, 14, 0.92)';
        ctx.lineWidth = 2.5;
        ctx.strokeText?.(label, chosen.cx, chosen.cy);
        ctx.fillStyle = 'rgba(226, 232, 240, 0.80)';
        ctx.fillText(label, chosen.cx, chosen.cy);
      }
      ctx.restore?.();
    }

    this._bakedMapId = this.mapConfig?.id || null;
    this._bakedSize = s;
    this._bakedObstaclesRef = this.mapConfig?.obstacles || null;

    if (this.ctx && this.staticCanvas) {
      this.ctx.drawImage(this.staticCanvas, 0, 0, s, s);
    }
  }

  getCalloutAt(x, z) {
    const callouts = this.mapConfig?.callouts;
    if (!Array.isArray(callouts)) return null;
    for (let i = 0; i < callouts.length; i++) {
      const c = callouts[i];
      const r = c.radius || 10;
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz <= r * r) {
        return c.name;
      }
    }
    return null;
  }

  update(stateOrGame, nowArg) {
    if (!this.ctx || !stateOrGame) return;
    const inMatch = stateOrGame.inMatch !== undefined ? Boolean(stateOrGame.inMatch) : true;
    if (!inMatch) return;

    const now = typeof nowArg === 'number'
      ? nowArg
      : (typeof stateOrGame.now === 'number' ? stateOrGame.now : performance.now());
    if (now >= this.lastRenderAt && now - this.lastRenderAt < 33) return; // Cap radar redraw at ~30 FPS for zero overhead
    this.lastRenderAt = now;

    if (this.canvas && this.canvas.width > 0 && this.size === this._bakedSize && this.canvas.width !== this.size) {
      this.size = this.canvas.width;
    }

    const ctx = this.ctx;
    const s = this.size;
    if (this._bakedSize !== s || this._bakedMapId !== (this.mapConfig?.id || null)) {
      this.bakeStaticObstacles();
    }

    const pickups = stateOrGame.pickupMeshes || stateOrGame.pickups;
    const droppedWeapons = stateOrGame.droppedWeaponMeshes || stateOrGame.droppedWeapons;
    const remotePlayers = stateOrGame.remotePlayers;
    const localPos = stateOrGame.position || stateOrGame.localPos;
    const localYaw = stateOrGame.yaw ?? stateOrGame.localYaw ?? 0;

    // 1. Blit pre-rendered static map obstacles
    if (this.staticCanvas) {
      ctx.drawImage(this.staticCanvas, 0, 0, s, s);
    } else {
      ctx.clearRect(0, 0, s, s);
    }

    // 2. Render Active Health Packs (Green Crosses)
    if (pickups && typeof pickups.values === 'function') {
      ctx.fillStyle = '#22c55e';
      for (const item of pickups.values()) {
        const isActive = item?.crossGroup ? item.crossGroup.visible : Boolean(item?.active);
        if (!isActive) continue;
        const posX = item?.group ? item.group.position.x : item.x;
        const posZ = item?.group ? item.group.position.z : item.z;
        const hx = this.clampBlipCoord(this.worldToCanvasX(posX), 4);
        const hy = this.clampBlipCoord(this.worldToCanvasY(posZ), 4);
        ctx.fillRect(hx - 1.2, hy - 3.4, 2.4, 6.8);
        ctx.fillRect(hx - 3.4, hy - 1.2, 6.8, 2.4);
      }
    }

    // 3. Render Dropped Primary Weapons (Amber Diamonds)
    if (droppedWeapons && typeof droppedWeapons.values === 'function') {
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1;
      for (const drop of droppedWeapons.values()) {
        if (!drop) continue;
        const dx = this.clampBlipCoord(this.worldToCanvasX(drop.x), 4);
        const dy = this.clampBlipCoord(this.worldToCanvasY(drop.z), 4);
        ctx.beginPath();
        ctx.moveTo(dx, dy - 3.8);
        ctx.lineTo(dx + 3.8, dy);
        ctx.lineTo(dx, dy + 3.8);
        ctx.lineTo(dx - 3.8, dy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // 3b. Prune expired gunfire blips (enemy red dots removed in favor of thin 3D character outlines)
    if (this.gunfireBlips && this.gunfireBlips.size > 0) {
      for (const [shooterId, blip] of this.gunfireBlips.entries()) {
        const elapsed = now - blip.at;
        if (elapsed >= blip.durationMs || elapsed < 0) {
          this.gunfireBlips.delete(shooterId);
        }
      }
    }

    // 3c. Render Teammates on Radar in TDM (Cyan Dots)
    const gameMode = stateOrGame.gameMode;
    const localTeam = stateOrGame.localTeam;
    if (remotePlayers && typeof remotePlayers.values === 'function') {
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1.1;
      for (const rp of remotePlayers.values()) {
        if (!rp || !rp.alive) continue;
        const isTeammate = Boolean(
          rp.isTeammate ?? (gameMode === 'tdm' && localTeam && rp.team && rp.team === localTeam)
        );
        if (!isTeammate) continue;
        const rpPos = rp.group ? rp.group.position : rp;
        if (!rpPos || typeof rpPos.x !== 'number') continue;
        const rx = this.clampBlipCoord(this.worldToCanvasX(rpPos.x), 4);
        const ry = this.clampBlipCoord(this.worldToCanvasY(rpPos.z), 4);
        ctx.beginPath();
        ctx.arc(rx, ry, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 4. Render Local Player Position & Viewing Direction Cone
    if (localPos) {
      const px = this.clampBlipCoord(this.worldToCanvasX(localPos.x), 5);
      const py = this.clampBlipCoord(this.worldToCanvasY(localPos.z), 5);
      const dirX = -Math.sin(localYaw);
      const dirZ = -Math.cos(localYaw);
      const lookAngle = Math.atan2(dirZ, dirX);
      const halfFov = 0.52; // ~60 deg radar cone

      if (!this._fovConeGrad || this._fovConeGradCtx !== ctx) {
        const coneGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 38);
        coneGrad.addColorStop(0, 'rgba(56, 189, 248, 0.50)');
        coneGrad.addColorStop(0.55, 'rgba(56, 189, 248, 0.16)');
        coneGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
        this._fovConeGrad = coneGrad;
        this._fovConeGradCtx = ctx;
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(lookAngle);

      // Translucent FOV cone (drawn in local player coordinate space around (0, 0))
      ctx.fillStyle = this._fovConeGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 38, -halfFov, halfFov);
      ctx.closePath();
      ctx.fill();

      // Player directional arrow / chevron with crisp cyan glow
      ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
      ctx.shadowBlur = 7;
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(6.2, 0);
      ctx.lineTo(-4.4, -4.0);
      ctx.lineTo(-2.2, 0);
      ctx.lineTo(-4.4, 4.0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Update tactical sector & coordinates readout at ~5Hz
      if (this.coordsEl && now - this.lastCoordsUpdateAt >= 200) {
        this.lastCoordsUpdateAt = now;
        const colIdx = Math.max(0, Math.min(5, Math.floor((px / s) * 6)));
        const rowIdx = Math.max(1, Math.min(6, Math.floor((py / s) * 6) + 1));
        const sector = `${String.fromCharCode(65 + colIdx)}${rowIdx}`;
        const rx = Math.round(localPos.x);
        const rz = Math.round(localPos.z);
        const nextStr = `${sector} (${rx}, ${rz})`;
        if (nextStr !== this.lastCoordStr) {
          this.lastCoordStr = nextStr;
          this.coordsEl.textContent = nextStr;
        }
      }
    }
  }
}
