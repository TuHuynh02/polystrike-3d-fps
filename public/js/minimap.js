// Tactical Top-Left Mini Map / Radar (#hud-minimap)
// Renders static map obstacles (cached on offscreen canvas), active health packs,
// dropped weapons, enemy positions, and the local player's position + FOV cone.

import { DEFAULT_MAP_ID, getMapConfig } from '../shared/constants.js';

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
    this.lastRenderAt = 0;
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

    this.mapConfig = cfg;
    this.arenaHalfSize = cfg.arenaHalfSize || 60;
    this.lastRenderAt = 0;
    if (this.gunfireBlips) this.gunfireBlips.clear();

    if (this.mapLabelEl && cfg.name) {
      this.mapLabelEl.textContent = cfg.name;
    }

    this.bakeStaticObstacles();
  }

  bakeStaticObstacles() {
    if (!this.staticCtx) return;
    const ctx = this.staticCtx;
    const s = this.size;
    const span = this.arenaHalfSize * 2;
    const scale = s / span;

    ctx.clearRect(0, 0, s, s);

    // 1. Tactical Dark Radar Background
    const bgGrad = ctx.createRadialGradient(s / 2, s / 2, 12, s / 2, s / 2, s * 0.72);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.94)');
    bgGrad.addColorStop(1, 'rgba(4, 9, 20, 0.97)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, s, s);

    // 2. Subtle Sector Grid & Radar Range Rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.11)';
    ctx.lineWidth = 1;
    const gridStep = s / 6;
    for (let i = 1; i < 6; i++) {
      const p = Math.round(i * gridStep) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(s, p);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
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
        ctx.fillStyle = 'rgba(51, 65, 85, 0.65)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, d);
        ctx.strokeRect(x, y, w, d);
      } else if (obs.type === 'step') {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.55)';
        ctx.fillRect(x, y, w, d);
      } else if (obs.type === 'barricade') {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.48)';
        ctx.fillRect(x, y, w, d);
      } else if (obs.type === 'container') {
        ctx.fillStyle = 'rgba(14, 165, 233, 0.42)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, d);
        ctx.strokeRect(x, y, w, d);
      } else if (obs.type === 'crate') {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.62)';
        ctx.fillRect(x, y, w, d);
      } else if (obs.type === 'pillar') {
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(x, y, Math.max(2.5, w), Math.max(2.5, d));
      } else {
        // Wall
        ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
        ctx.fillRect(x, y, w, d);
      }
    }

    // 4. Pre-render Tactical Callout Zone Labels onto the static radar canvas
    const callouts = this.mapConfig?.callouts || [];
    if (callouts.length > 0 && typeof ctx.fillText === 'function') {
      ctx.save?.();
      ctx.font = '600 6.5px "Orbitron", "Rajdhani", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.52)';
      for (let i = 0; i < callouts.length; i++) {
        const c = callouts[i];
        const cx = this.clampBlipCoord(this.worldToCanvasX(c.x), 14);
        const cy = this.clampBlipCoord(this.worldToCanvasY(c.z), 8);
        ctx.fillText(c.name, cx, cy);
      }
      ctx.restore?.();
    }

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
    if (now - this.lastRenderAt < 33) return; // Cap radar redraw at ~30 FPS for zero overhead
    this.lastRenderAt = now;

    const ctx = this.ctx;
    const s = this.size;

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

    // 4. Render Local Player Position & Viewing Direction Cone
    if (localPos) {
      const px = this.clampBlipCoord(this.worldToCanvasX(localPos.x), 5);
      const py = this.clampBlipCoord(this.worldToCanvasY(localPos.z), 5);
      const dirX = -Math.sin(localYaw);
      const dirZ = -Math.cos(localYaw);
      const lookAngle = Math.atan2(dirZ, dirX);
      const halfFov = 0.52; // ~60 deg radar cone

      // Translucent FOV cone
      const coneGrad = ctx.createRadialGradient(px, py, 2, px, py, 34);
      coneGrad.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
      coneGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, 34, lookAngle - halfFov, lookAngle + halfFov);
      ctx.closePath();
      ctx.fill();

      // Player directional arrow / chevron
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(lookAngle);
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(5.8, 0);
      ctx.lineTo(-4.2, -3.8);
      ctx.lineTo(-2.2, 0);
      ctx.lineTo(-4.2, 3.8);
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
