import {
  BAY_MAX_CAPACITY,
  FEVER_DURATION_SECONDS,
  PACK_FUSE_SECONDS,
  PACK_MIN_COUNT,
  ROUND_DURATION_SECONDS,
  SLOWMO_BELT_FACTOR,
  SLOWMO_DURATION_SECONDS,
  applyBlackholePenalty,
  applyParcelMissPenalty,
  applyPlaceParcel,
  applyVipPackProgress,
  calculateBlackholeZapScore,
  calculatePackLaunchScore,
  canAcceptParcel,
  createInitialBays,
  createRoundMission,
  createVipOrder,
  getRainbowChainAdjacentIndices,
  getWaveForElapsed,
  getWaveProgress,
  pickNextParcelSpec,
  updateMissionProgress,
} from './rules';
import { drawBayIcon, drawParcelSprite, traceShapePath } from './shapes';
import { SoundEngine } from './sound';
import {
  BAY_SPECS,
  BAY_SPEC_MAP,
  BayState,
  GamePhase,
  HudSnapshot,
  MissionState,
  ParcelColor,
  ParcelKind,
  VipOrderState,
} from './types';

interface ConveyorParcel {
  id: number;
  kind: ParcelKind;
  isGolden5x: boolean;
  /** 0..1 normalized position along belt width */
  u: number;
  yOffset: number;
  bobPhase: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  spawnPop: number;
  age: number;
}

interface VisualFlyTrail {
  kind: ParcelColor | 'rainbow';
  isGolden5x: boolean;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  t: number;
  duration: number;
  targetParcelId: number;
}

interface LaunchCrate {
  color: ParcelColor;
  count: number;
  x: number;
  y: number;
  vy: number;
  age: number;
  duration: number;
}

interface ChainArc {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  age: number;
  life: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  age: number;
  life: number;
  kind: 'spark' | 'star' | 'ring';
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  subtext?: string;
  color: string;
  scale: number;
  age: number;
  life: number;
}

interface BgStar {
  x: number;
  y: number;
  r: number;
  layer: number;
  twinklePhase: number;
  hue: number;
}

interface LayoutMetrics {
  width: number;
  height: number;
  isCompact: boolean;
  beltY: number;
  beltHeight: number;
  beltLeft: number;
  beltRight: number;
  parcelRadius: number;
  baysTop: number;
  baysHeight: number;
  bayRects: { x: number; y: number; w: number; h: number; cx: number; cy: number }[];
}

interface DragState {
  pointerId: number;
  parcelId: number;
  kind: ParcelColor | 'rainbow';
  isGolden5x: boolean;
  originU: number;
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  isDragging: boolean;
  hoverBayIndex: number | null;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onWaveChange: (wave: 1 | 2 | 3, waveName: string, speedTier: string) => void;
  onRoundComplete: (stats: {
    score: number;
    maxCombo: number;
    packedCount: number;
    packedParcels: number;
    blackholesCleared: number;
    missionCompleted: boolean;
    missionLabel: string;
    vipCompletedCount: number;
  }) => void;
}

const PARTICLE_POOL_SIZE = 280;
const VIP_SCHEDULE_SECONDS = [16, 44, 70];

export class StardustEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sound: SoundEngine;
  private callbacks: EngineCallbacks;
  private resizeObserver: ResizeObserver;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private animTime = 0;
  private beltScroll = 0;

  private phase: GamePhase = 'title';
  private duration = ROUND_DURATION_SECONDS;
  private elapsed = 0;
  private currentWave: 1 | 2 | 3 = 1;
  private lastCountdownSec = 99;
  private lastFeverTenth = -1;
  private lastSlowmoTenth = -1;
  private lastVipSec = -1;

  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private packedCount = 0;
  private packedParcels = 0;
  private blackholesCleared = 0;
  private vipCompletedCount = 0;

  private feverTimer = 0;
  private slowmoTimer = 0;
  private exitFlashTimer = 0;

  private mission: MissionState | null = null;
  private vipOrder: VipOrderState | null = null;
  private nextVipScheduleIdx = 0;
  private nextVipOrderId = 1;

  private nextParcelId = 1;
  private spawnTimer = 0;
  private ambientSpawnTimer = 0;
  private parcels: ConveyorParcel[] = [];
  private flyTrails: VisualFlyTrail[] = [];
  private launchCrates: LaunchCrate[] = [];
  private chainArcs: ChainArc[] = [];
  private bays: BayState[] = createInitialBays();
  private particles: Particle[] = [];
  private particleCursor = 0;
  private floatingTexts: FloatingText[] = [];
  private bgStars: BgStar[] = [];

  private hitstopTimer = 0;
  private trauma = 0;
  private screenFlashAlpha = 0;
  private screenFlashColor = '#FFFFFF';

  private drag: DragState | null = null;
  private selectedParcelId: number | null = null;
  private hudDirty = true;

  private layout: LayoutMetrics;
  private backdropCanvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement, sound: SoundEngine, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.ctx = ctx;
    this.sound = sound;
    this.callbacks = callbacks;

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        color: '#FFF',
        alpha: 1,
        age: 0,
        life: 0.5,
        kind: 'spark',
      });
    }

    this.initStarfield();
    this.layout = this.computeLayout(window.innerWidth, window.innerHeight);
    this.handleResize();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    if (canvas.parentElement) {
      this.resizeObserver.observe(canvas.parentElement);
    }

    this.bindPointerEvents();
    this.seedAmbientParcels();
    this.startLoop();
  }

  private initStarfield(): void {
    this.bgStars = [];
    for (let i = 0; i < 95; i++) {
      const layer = i < 45 ? 0 : i < 78 ? 1 : 2;
      this.bgStars.push({
        x: Math.random(),
        y: Math.random(),
        r: layer === 0 ? 0.9 + Math.random() * 0.8 : layer === 1 ? 1.3 + Math.random() * 1.1 : 1.9 + Math.random() * 1.3,
        layer,
        twinklePhase: Math.random() * Math.PI * 2,
        hue: 195 + Math.random() * 80,
      });
    }
  }

  private seedAmbientParcels(): void {
    this.parcels = [];
    const sampleKinds: ParcelKind[] = ['gold', 'cyan', 'coral', 'emerald', 'rainbow'];
    for (let i = 0; i < 4; i++) {
      this.parcels.push({
        id: this.nextParcelId++,
        kind: sampleKinds[i % sampleKinds.length],
        isGolden5x: false,
        u: 0.14 + i * 0.22,
        yOffset: 0,
        bobPhase: i * 1.4,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        spawnPop: 1,
        age: 0,
      });
    }
  }

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    const width = Math.max(320, parent ? parent.clientWidth : window.innerWidth);
    const height = Math.max(480, parent ? parent.clientHeight : window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.layout = this.computeLayout(width, height);
    this.rebuildBackdropCache(width, height);
  }

  private rebuildBackdropCache(w: number, h: number): void {
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(w));
    off.height = Math.max(1, Math.round(h));
    const bctx = off.getContext('2d');
    if (!bctx) return;

    const sky = bctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#080D22');
    sky.addColorStop(0.5, '#0E1838');
    sky.addColorStop(1, '#14224A');
    bctx.fillStyle = sky;
    bctx.fillRect(0, 0, w, h);

    const neb1 = bctx.createRadialGradient(w * 0.2, h * 0.34, 10, w * 0.2, h * 0.34, w * 0.48);
    neb1.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
    neb1.addColorStop(1, 'rgba(56, 189, 248, 0)');
    bctx.fillStyle = neb1;
    bctx.fillRect(0, 0, w, h);

    const neb2 = bctx.createRadialGradient(w * 0.82, h * 0.52, 10, w * 0.82, h * 0.52, w * 0.46);
    neb2.addColorStop(0, 'rgba(255, 183, 3, 0.11)');
    neb2.addColorStop(1, 'rgba(255, 183, 3, 0)');
    bctx.fillStyle = neb2;
    bctx.fillRect(0, 0, w, h);

    const neb3 = bctx.createRadialGradient(w * 0.5, h * 0.72, 10, w * 0.5, h * 0.72, w * 0.38);
    neb3.addColorStop(0, 'rgba(168, 85, 247, 0.09)');
    neb3.addColorStop(1, 'rgba(168, 85, 247, 0)');
    bctx.fillStyle = neb3;
    bctx.fillRect(0, 0, w, h);

    bctx.strokeStyle = 'rgba(148, 185, 255, 0.11)';
    bctx.lineWidth = 1.5;
    bctx.beginPath();
    bctx.ellipse(w * 0.5, h * 0.5, w * 0.62, h * 0.25, -0.06, 0, Math.PI * 2);
    bctx.stroke();

    this.backdropCanvas = off;
  }

  private computeLayout(width: number, height: number): LayoutMetrics {
    const isCompact = width < 680;
    // Extra headroom for Mission + VIP/Fever bar so conveyor never collides with top HUD
    const hudReserve = isCompact ? 114 : 112;
    const sidePad = isCompact ? 12 : Math.max(32, Math.min(110, width * 0.08));

    const beltHeight = isCompact
      ? Math.max(74, Math.min(88, height * 0.11))
      : Math.max(92, Math.min(110, height * 0.125));
    const beltY = hudReserve + beltHeight * 0.5 + (isCompact ? 12 : 14);
    const beltLeft = sidePad;
    const beltRight = width - sidePad;

    const parcelRadius = isCompact
      ? Math.max(22, Math.min(27, (width - 44) / 13.5))
      : Math.max(28, Math.min(35, height * 0.039));

    const bottomPad = isCompact ? 34 : 40;
    const baysHeight = isCompact
      ? Math.max(204, Math.min(262, height * 0.315))
      : Math.max(236, Math.min(290, height * 0.325));
    const baysTop = height - bottomPad - baysHeight;

    const baysAreaW = Math.min(width - sidePad * 2, isCompact ? width - 20 : 1040);
    const baysStartX = (width - baysAreaW) / 2;
    const gap = isCompact ? 8 : 18;
    const bayW = (baysAreaW - gap * 3) / 4;

    const bayRects = BAY_SPECS.map((_, idx) => {
      const x = baysStartX + idx * (bayW + gap);
      return {
        x,
        y: baysTop,
        w: bayW,
        h: baysHeight,
        cx: x + bayW * 0.5,
        cy: baysTop + baysHeight * 0.5,
      };
    });

    return {
      width,
      height,
      isCompact,
      beltY,
      beltHeight,
      beltLeft,
      beltRight,
      parcelRadius,
      baysTop,
      baysHeight,
      bayRects,
    };
  }

  private bindPointerEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('blur', this.onWindowBlur);
  }

  public destroy(): void {
    this.sound.stopBgm();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('blur', this.onWindowBlur);
  }

  /**
   * Maps viewport CSS coordinates into logical canvas layout coordinates,
   * automatically normalizing against live getBoundingClientRect() scale.
   */
  private screenToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: clientX, y: clientY };
    }
    return {
      x: ((clientX - rect.left) / rect.width) * this.layout.width,
      y: ((clientY - rect.top) / rect.height) * this.layout.height,
    };
  }

  private getParcelPosition(p: ConveyorParcel): { x: number; y: number } {
    const { beltLeft, beltRight, beltY } = this.layout;
    const x = beltLeft + p.u * (beltRight - beltLeft);
    const y = beltY + Math.sin(this.animTime * 3.8 + p.bobPhase) * 3.5 + p.yOffset;
    return { x, y };
  }

  private findParcelAt(x: number, y: number): ConveyorParcel | null {
    const hitRadius = this.layout.parcelRadius * (this.layout.isCompact ? 1.6 : 1.44);
    let best: ConveyorParcel | null = null;
    let bestDist = hitRadius;

    for (const p of this.parcels) {
      if (this.drag && this.drag.parcelId === p.id) continue;
      const pos = this.getParcelPosition(p);
      const dist = Math.hypot(x - pos.x, y - pos.y);
      const effectiveDist = p.kind === 'blackhole' || p.kind === 'slowmo' ? dist * 0.85 : dist;
      if (effectiveDist < bestDist) {
        bestDist = effectiveDist;
        best = p;
      }
    }
    return best;
  }

  private findBayAt(x: number, y: number, generousVertical = false): number | null {
    const topThreshold = generousVertical
      ? this.layout.baysTop - (this.layout.isCompact ? 64 : 78)
      : this.layout.baysTop - 22;
    if (y < topThreshold) return null;

    for (let i = 0; i < this.layout.bayRects.length; i++) {
      const r = this.layout.bayRects[i];
      const padX = this.layout.isCompact ? 6 : 12;
      if (x >= r.x - padX && x <= r.x + r.w + padX && y <= r.y + r.h + 32) {
        return i;
      }
    }
    return null;
  }

  private pickAutoBayIndexForParcel(kind: ParcelColor | 'rainbow'): number {
    if (kind !== 'rainbow') {
      return BAY_SPECS.findIndex((b) => b.id === kind);
    }
    // Rainbow smart auto-target:
    // 1) Any bay at 2 items (triggers Rainbow Chain Explosion!)
    const twoIdx = this.bays.findIndex((b) => b.items.length === 2);
    if (twoIdx !== -1) return twoIdx;
    // 2) Active VIP order needed color with highest fill
    if (this.vipOrder && !this.vipOrder.completed) {
      for (const req of this.vipOrder.requirements) {
        if (req.done < req.needed) {
          const idx = this.bays.findIndex((b) => b.color === req.color);
          if (idx !== -1) return idx;
        }
      }
    }
    // 3) Highest filled non-full bay
    let bestIdx = 0;
    let bestLen = -1;
    for (let i = 0; i < this.bays.length; i++) {
      if (this.bays[i].items.length > bestLen && this.bays[i].items.length < BAY_MAX_CAPACITY) {
        bestLen = this.bays[i].items.length;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'playing') return;
    this.sound.unlock();

    const { x, y } = this.screenToCanvas(e.clientX, e.clientY);

    // 1. If a parcel is already selected via tap, clicking ANY cargo bay routes it immediately!
    if (this.selectedParcelId !== null) {
      const bayIdx = this.findBayAt(x, y, true);
      if (bayIdx !== null) {
        this.sendParcelByIdToBay(this.selectedParcelId, bayIdx);
        return;
      }
    }

    // 2. Check if tapping a parcel on the conveyor belt
    const hitParcel = this.findParcelAt(x, y);
    if (hitParcel) {
      if (hitParcel.kind === 'blackhole') {
        this.zapBlackHole(hitParcel);
        return;
      }
      if (hitParcel.kind === 'slowmo') {
        this.activateSlowmo(hitParcel);
        return;
      }

      // During Fever mode: single tap on ANY parcel immediately auto-flies it to its matching bay!
      if (this.feverTimer > 0) {
        const autoBay = this.pickAutoBayIndexForParcel(hitParcel.kind);
        this.sendParcelByIdToBay(hitParcel.id, autoBay);
        return;
      }

      this.sound.playPickup();
      hitParcel.scaleX = 1.18;
      hitParcel.scaleY = 0.84;

      this.drag = {
        pointerId: e.pointerId,
        parcelId: hitParcel.id,
        kind: hitParcel.kind,
        isGolden5x: hitParcel.isGolden5x,
        originU: hitParcel.u,
        startX: x,
        startY: y,
        currX: x,
        currY: y,
        isDragging: false,
        hoverBayIndex: null,
      };
      this.selectedParcelId = hitParcel.id;
      this.hudDirty = true;
      return;
    }

    // 3. Clicking empty space deselects cleanly
    if (this.selectedParcelId !== null) {
      this.selectedParcelId = null;
      this.hudDirty = true;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const { x, y } = this.screenToCanvas(e.clientX, e.clientY);
    this.drag.currX = x;
    this.drag.currY = y;

    if (!this.drag.isDragging && Math.hypot(x - this.drag.startX, y - this.drag.startY) > 10) {
      this.drag.isDragging = true;
    }

    if (this.drag.isDragging) {
      this.drag.hoverBayIndex = this.findBayAt(x, y, true);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;
    this.drag = null;

    if (this.phase !== 'playing') return;

    if (drag.isDragging) {
      const bayIdx = this.findBayAt(drag.currX, drag.currY, true);
      if (bayIdx !== null) {
        this.dropDraggedParcelInBay(drag, bayIdx);
      } else {
        const existing = this.parcels.find((p) => p.id === drag.parcelId);
        if (existing) {
          existing.scaleX = 0.86;
          existing.scaleY = 1.15;
        }
      }
      this.selectedParcelId = null;
      this.hudDirty = true;
    }
    // Quick tap (isDragging === false): keep selectedParcelId active so clicking a bay sends it!
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (this.drag && e.pointerId === this.drag.pointerId) {
      this.drag = null;
    }
  };

  private onWindowBlur = (): void => {
    this.drag = null;
  };

  // --- Public Game Controls ---

  public startGame(customDuration?: number): void {
    this.sound.unlock();
    this.phase = 'playing';
    this.duration = customDuration && customDuration >= 5 ? customDuration : ROUND_DURATION_SECONDS;
    this.elapsed = 0;
    this.currentWave = 1;
    this.lastCountdownSec = Math.ceil(this.duration);
    this.lastFeverTenth = -1;
    this.lastSlowmoTenth = -1;
    this.lastVipSec = -1;

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.packedCount = 0;
    this.packedParcels = 0;
    this.blackholesCleared = 0;
    this.vipCompletedCount = 0;

    this.feverTimer = 0;
    this.slowmoTimer = 0;
    this.exitFlashTimer = 0;
    this.mission = createRoundMission(Math.random);
    this.vipOrder = null;
    this.nextVipScheduleIdx = 0;

    this.parcels = [];
    this.flyTrails = [];
    this.launchCrates = [];
    this.chainArcs = [];
    this.bays = createInitialBays();
    this.floatingTexts = [];
    this.drag = null;
    this.selectedParcelId = null;
    this.hitstopTimer = 0;
    this.trauma = 0;
    this.screenFlashAlpha = 0;
    this.spawnTimer = 0.35;

    for (const p of this.particles) p.active = false;

    // Start upbeat procedural space BGM immediately on user start gesture!
    this.sound.startBgm(1, 'normal');

    // Spawn 3 brisk opening parcels immediately so there's zero dead air at t = 0
    const starters: ParcelColor[] = ['gold', 'coral', 'cyan'];
    starters.forEach((c, i) => {
      this.parcels.push({
        id: this.nextParcelId++,
        kind: c,
        isGolden5x: false,
        u: 0.08 + i * 0.16,
        yOffset: 0,
        bobPhase: Math.random() * Math.PI * 2,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        spawnPop: 0.5,
        age: 0,
      });
    });

    this.pushHudSnapshot(true);
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    this.drag = null;
    if (next === 'playing') {
      this.sound.startBgm(this.currentWave, this.feverTimer > 0 ? 'fever' : 'normal');
    } else {
      this.sound.stopBgm();
    }
    if (next === 'title') {
      this.seedAmbientParcels();
      this.bays = createInitialBays();
      this.flyTrails = [];
      this.launchCrates = [];
      this.chainArcs = [];
      this.feverTimer = 0;
      this.slowmoTimer = 0;
      this.vipOrder = null;
    }
    this.pushHudSnapshot(true);
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public routeByHotkey(bayIndex: number): void {
    if (this.phase !== 'playing') return;
    if (bayIndex < 0 || bayIndex >= this.bays.length) return;
    this.sound.unlock();

    let targetId = this.selectedParcelId;
    if (
      targetId === null ||
      !this.parcels.some((p) => p.id === targetId && p.kind !== 'blackhole' && p.kind !== 'slowmo')
    ) {
      let rightmost: ConveyorParcel | null = null;
      for (const p of this.parcels) {
        if (p.kind === 'blackhole' || p.kind === 'slowmo') continue;
        if (!rightmost || p.u > rightmost.u) rightmost = p;
      }
      targetId = rightmost ? rightmost.id : null;
    }

    if (targetId !== null) {
      this.sendParcelByIdToBay(targetId, bayIndex);
    }
  }

  public zapNearestBlackHoleByHotkey(): void {
    if (this.phase !== 'playing') return;
    this.sound.unlock();
    let urgent: ConveyorParcel | null = null;
    for (const p of this.parcels) {
      if (p.kind !== 'blackhole' && p.kind !== 'slowmo') continue;
      if (!urgent || p.u > urgent.u) urgent = p;
    }
    if (urgent) {
      if (urgent.kind === 'slowmo') this.activateSlowmo(urgent);
      else this.zapBlackHole(urgent);
    }
  }

  /** Helper exposing active parcel positions in viewport CSS coords (useful for accessibility & E2E verification) */
  public getDebugSnapshot(): {
    parcels: { id: number; kind: ParcelKind; x: number; y: number }[];
    bays: { color: ParcelColor; count: number; cx: number; cy: number }[];
    selectedParcelId: number | null;
    feverActive: boolean;
  } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width / Math.max(1, this.layout.width);
    const sy = rect.height / Math.max(1, this.layout.height);
    return {
      parcels: this.parcels.map((p) => {
        const pos = this.getParcelPosition(p);
        return {
          id: p.id,
          kind: p.kind,
          x: Math.round(rect.left + pos.x * sx),
          y: Math.round(rect.top + pos.y * sy),
        };
      }),
      bays: this.bays.map((b, i) => ({
        color: b.color,
        count: b.items.length,
        cx: Math.round(rect.left + this.layout.bayRects[i].cx * sx),
        cy: Math.round(rect.top + this.layout.bayRects[i].cy * sy),
      })),
      selectedParcelId: this.selectedParcelId,
      feverActive: this.feverTimer > 0,
    };
  }

  // --- Core Gameplay Actions ---

  private sendParcelByIdToBay(parcelId: number, bayIndex: number): void {
    const idx = this.parcels.findIndex((p) => p.id === parcelId);
    if (idx === -1) {
      this.selectedParcelId = null;
      this.hudDirty = true;
      return;
    }
    const parcel = this.parcels[idx];
    if (parcel.kind === 'blackhole') {
      this.zapBlackHole(parcel);
      return;
    }
    if (parcel.kind === 'slowmo') {
      this.activateSlowmo(parcel);
      return;
    }

    const bay = this.bays[bayIndex];
    const bayRect = this.layout.bayRects[bayIndex];
    const startPos = this.getParcelPosition(parcel);

    if (!canAcceptParcel(bay.color, parcel.kind)) {
      bay.rejectTimer = 0.35;
      this.combo = 0;
      this.trauma = Math.min(1, this.trauma + 0.22);
      this.sound.playReject();
      this.spawnFloatingText(bayRect.cx, bayRect.y + 30, '颜色不符', undefined, '#FF6B8A', 0.95);
      this.selectedParcelId = null;
      this.hudDirty = true;
      return;
    }

    // Remove from conveyor, clear selection, launch crisp visual arc, AND commit immediately
    // so score/combo/bay count update instantaneously with zero race conditions!
    this.parcels.splice(idx, 1);
    this.selectedParcelId = null;

    const targetSlotIndex = Math.min(bay.items.length, BAY_MAX_CAPACITY - 1);
    const targetSlotPos = this.getBaySlotCenter(bayIndex, targetSlotIndex);
    this.flyTrails.push({
      kind: parcel.kind,
      isGolden5x: parcel.isGolden5x,
      startX: startPos.x,
      startY: startPos.y,
      targetX: targetSlotPos.x,
      targetY: targetSlotPos.y,
      t: 0,
      duration: 0.13,
      targetParcelId: parcel.id,
    });

    this.commitParcelIntoBay(bayIndex, parcel.id, parcel.kind, parcel.isGolden5x);
  }

  private dropDraggedParcelInBay(drag: DragState, bayIndex: number): void {
    const idx = this.parcels.findIndex((p) => p.id === drag.parcelId);
    if (idx === -1) return;

    const bay = this.bays[bayIndex];
    const bayRect = this.layout.bayRects[bayIndex];

    if (!canAcceptParcel(bay.color, drag.kind)) {
      bay.rejectTimer = 0.36;
      this.combo = 0;
      this.trauma = Math.min(1, this.trauma + 0.24);
      this.sound.playReject();
      this.spawnBurst(drag.currX, drag.currY, '#FF4D6D', 8, 1);
      this.spawnFloatingText(bayRect.cx, bayRect.y + 32, '颜色不符', undefined, '#FF6B8A', 0.96);
      this.hudDirty = true;
      return;
    }

    this.parcels.splice(idx, 1);
    this.commitParcelIntoBay(bayIndex, drag.parcelId, drag.kind, drag.isGolden5x);
  }

  private commitParcelIntoBay(
    bayIndex: number,
    parcelId: number,
    kind: ParcelColor | 'rainbow',
    isGolden5x: boolean
  ): void {
    const bay = this.bays[bayIndex];
    const bayRect = this.layout.bayRects[bayIndex];
    const spec = BAY_SPEC_MAP[bay.color];

    const res = applyPlaceParcel(bay, parcelId, kind, this.combo, {
      isGolden5x,
      isFever: this.feverTimer > 0,
    });
    if (!res.accepted) {
      this.sound.playReject();
      this.hudDirty = true;
      return;
    }

    this.combo = res.nextCombo;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += res.placePoints;

    if (res.triggeredFever) {
      this.triggerFeverMode();
    }

    this.sound.playSlotIn(this.combo, kind === 'rainbow', isGolden5x);

    const slotPos = this.getBaySlotCenter(bayIndex, Math.max(0, res.newCount - 1));
    const comboHeat = Math.min(2.0, 1 + this.combo * 0.08);
    this.spawnBurst(
      slotPos.x,
      slotPos.y,
      isGolden5x ? '#FFE066' : kind === 'rainbow' ? '#FFFFFF' : spec.bright,
      Math.round((isGolden5x ? 18 : 8) * comboHeat),
      comboHeat
    );

    if (isGolden5x) {
      this.spawnShockwave(slotPos.x, slotPos.y, '#FFE066', 54);
      this.spawnFloatingText(slotPos.x, slotPos.y - 26, `+${res.placePoints}`, '金色 ×5 爆发!', '#FFE066', 1.2);
    } else if (!res.instantOverchargePack) {
      const sub = res.newCount === 2 ? '再1个就打包!' : undefined;
      this.spawnFloatingText(slotPos.x, slotPos.y - 22, `+${res.placePoints}`, sub, spec.bright, 0.96);
    }

    if (res.triggeredRainbowChain) {
      this.triggerRainbowChainExplosion(bayIndex);
    } else if (res.instantOverchargePack) {
      this.launchBayPack(bayIndex, false);
    } else if (res.triggeredFuse) {
      this.spawnFloatingText(bayRect.cx, bayRect.y - 16, '三连打包!', undefined, spec.bright, 0.96);
    }

    this.checkMissionProgress();
    this.hudDirty = true;
  }

  private triggerFeverMode(): void {
    this.feverTimer = FEVER_DURATION_SECONDS;
    this.lastFeverTenth = Math.ceil(this.feverTimer * 10);
    this.sound.playFeverStart();
    this.sound.setBgmMode('fever');
    this.trauma = Math.min(1, this.trauma + 0.35);
    this.screenFlashColor = '#FFD166';
    this.screenFlashAlpha = 0.28;

    const cx = this.layout.width * 0.5;
    const cy = (this.layout.beltY + this.layout.baysTop) * 0.5;
    this.spawnShockwave(cx, cy, '#FFD166', 140);
    this.spawnBurst(cx, cy, '#FFE066', 32, 1.8);
    this.spawnFloatingText(cx, cy - 12, 'FEVER 狂热模式!', '得分×2 · 轻点任意包裹秒入舱!', '#FFE066', 1.32);
    this.hudDirty = true;
  }

  private triggerRainbowChainExplosion(centerBayIndex: number): void {
    const centerRect = this.layout.bayRects[centerBayIndex];
    this.sound.playRainbowChain();
    this.spawnShockwave(centerRect.cx, centerRect.cy, '#FFFFFF', 105);

    // First launch center bay immediately
    this.launchBayPack(centerBayIndex, false);

    // Detonate adjacent bays!
    const neighbors = getRainbowChainAdjacentIndices(centerBayIndex, this.bays.length);
    for (const adjIdx of neighbors) {
      const adjBay = this.bays[adjIdx];
      const adjRect = this.layout.bayRects[adjIdx];
      this.chainArcs.push({
        fromX: centerRect.cx,
        fromY: centerRect.cy,
        toX: adjRect.cx,
        toY: adjRect.cy,
        color: '#FFE066',
        age: 0,
        life: 0.42,
      });

      if (adjBay.items.length > 0) {
        this.launchBayPack(adjIdx, true);
      } else {
        // Empty adjacent bay still gets dazzling prismatic FX
        adjBay.launchPulse = 0.85;
        this.spawnBurst(adjRect.cx, adjRect.cy, '#7DF0FF', 16, 1.3);
        this.spawnShockwave(adjRect.cx, adjRect.cy, '#E879F9', 60);
      }
    }
  }

  private launchBayPack(bayIndex: number, isChainBonus = false): void {
    const bay = this.bays[bayIndex];
    if (!isChainBonus && bay.items.length < PACK_MIN_COUNT) {
      bay.packFuse = null;
      return;
    }
    if (bay.items.length === 0) {
      bay.packFuse = null;
      return;
    }

    const spec = BAY_SPEC_MAP[bay.color];
    const bayRect = this.layout.bayRects[bayIndex];

    const vipRes = applyVipPackProgress(this.vipOrder, bay.color);
    const launchRes = calculatePackLaunchScore(bay.items, {
      isFever: this.feverTimer > 0,
      isVipMatch: vipRes.matched,
      isChainBonus,
    });

    this.score += launchRes.points;
    this.packedCount += 1;
    this.packedParcels += launchRes.count;

    bay.items = [];
    bay.packFuse = null;
    bay.launchPulse = 1.0;

    const intensity = Math.min(2.5, 1.05 + this.combo * 0.09 + (launchRes.vipApplied ? 0.5 : 0));
    this.hitstopTimer = Math.min(0.055, 0.025 + (launchRes.count >= 4 ? 0.015 : 0));
    this.trauma = Math.min(1, this.trauma + 0.25 * Math.min(1.6, intensity));
    this.screenFlashColor = launchRes.vipApplied ? '#FFE066' : spec.bright;
    this.screenFlashAlpha = Math.min(0.24, 0.09 + this.combo * 0.01);

    this.sound.playPackLaunch(this.combo, launchRes.count);

    this.spawnBurst(bayRect.cx, bayRect.cy - 10, spec.bright, Math.round(20 * intensity), intensity);
    this.spawnBurst(bayRect.cx, bayRect.cy - 10, '#FFFFFF', Math.round(9 * intensity), intensity * 1.15);
    this.spawnShockwave(bayRect.cx, bayRect.cy - 10, spec.primary, 52 * intensity);
    if (this.combo >= 5 || launchRes.vipApplied || isChainBonus) {
      this.spawnShockwave(bayRect.cx, bayRect.cy - 10, '#FFE066', 78 * intensity);
    }

    this.launchCrates.push({
      color: bay.color,
      count: launchRes.count,
      x: bayRect.cx,
      y: bayRect.cy - 8,
      vy: -560,
      age: 0,
      duration: 0.65,
    });

    const headline = `+${launchRes.points}`;
    const tags: string[] = [];
    if (launchRes.vipApplied) tags.push('VIP ×3');
    if (launchRes.feverApplied) tags.push('FEVER ×2');
    if (launchRes.overchargeLabel) tags.push(launchRes.overchargeLabel);
    else if (tags.length === 0) tags.push('三连打包奖励');

    this.spawnFloatingText(
      bayRect.cx,
      bayRect.y - 16,
      headline,
      tags.join(' · '),
      launchRes.vipApplied ? '#FFE066' : spec.bright,
      Math.min(1.4, 1.04 + (launchRes.vipApplied ? 0.16 : 0))
    );

    if (vipRes.orderCompleted) {
      this.vipCompletedCount += 1;
      this.sound.playVipComplete();
      const cx = this.layout.width * 0.5;
      const cy = this.layout.beltY + 72;
      this.spawnBurst(cx, cy, '#FFE066', 28, 1.6);
      this.spawnFloatingText(cx, cy, 'VIP 急单达成!', '3倍打包分已到手', '#FFE066', 1.25);
      // Keep completed banner visible briefly via a short visual decay? Clear immediately so next is clean
      this.vipOrder = null;
    }

    this.checkMissionProgress();
    this.hudDirty = true;
  }

  private zapBlackHole(parcel: ConveyorParcel): void {
    const idx = this.parcels.findIndex((p) => p.id === parcel.id);
    if (idx === -1) return;

    const pos = this.getParcelPosition(parcel);
    this.parcels.splice(idx, 1);

    const zap = calculateBlackholeZapScore(this.combo, this.feverTimer > 0);
    this.combo = zap.nextCombo;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += zap.points;
    this.blackholesCleared += 1;

    if (zap.triggeredFever) {
      this.triggerFeverMode();
    }

    this.hitstopTimer = 0.028;
    this.trauma = Math.min(1, this.trauma + 0.22);
    this.sound.playBlackholeZap(this.combo);

    this.spawnBurst(pos.x, pos.y, '#E879F9', 20, 1.3);
    this.spawnBurst(pos.x, pos.y, '#FFFFFF', 9, 1.1);
    this.spawnShockwave(pos.x, pos.y, '#E879F9', 60);
    this.spawnFloatingText(pos.x, pos.y - 24, `黑洞清除 +${zap.points}`, `连击 x${this.combo}`, '#F5A3FF', 1.02);

    this.checkMissionProgress();
    this.hudDirty = true;
  }

  private activateSlowmo(parcel: ConveyorParcel): void {
    const idx = this.parcels.findIndex((p) => p.id === parcel.id);
    if (idx === -1) return;

    const pos = this.getParcelPosition(parcel);
    this.parcels.splice(idx, 1);

    this.slowmoTimer = SLOWMO_DURATION_SECONDS;
    this.lastSlowmoTenth = Math.ceil(this.slowmoTimer * 10);
    this.sound.playSlowmoActivate();
    this.screenFlashColor = '#7DD3FC';
    this.screenFlashAlpha = 0.2;

    this.spawnBurst(pos.x, pos.y, '#7DD3FC', 22, 1.35);
    this.spawnShockwave(pos.x, pos.y, '#38BDF8', 75);
    this.spawnFloatingText(pos.x, pos.y - 24, '时空减速 5秒!', '传送带速度减半', '#7DD3FC', 1.15);
    this.hudDirty = true;
  }

  /**
   * Black hole eruption NO LONGER steals items from cargo bays!
   * Only breaks combo and deducts 25 points (floored at 0).
   */
  private triggerBlackHoleEruption(x: number, y: number): void {
    const res = applyBlackholePenalty(this.score);
    this.score = res.nextScore;
    this.combo = res.nextCombo;
    this.hitstopTimer = 0.045;
    this.trauma = Math.min(1, this.trauma + 0.45);
    this.screenFlashColor = '#A855F7';
    this.screenFlashAlpha = 0.22;
    this.exitFlashTimer = 0.45;
    this.sound.playBlackholeSuck();

    this.spawnShockwave(x, y, '#FF3366', 92);
    this.spawnBurst(x, y, '#C084FC', 24, 1.35);

    const msg = res.deducted > 0 ? `黑洞干扰 -${res.deducted}` : '黑洞干扰 · 连击中断';
    this.spawnFloatingText(
      Math.min(this.layout.width - 110, x - 20),
      this.layout.beltY + 56,
      msg,
      '货舱进度已保全',
      '#F472B6',
      1.1
    );
    this.hudDirty = true;
  }

  private checkMissionProgress(): void {
    if (!this.mission || this.mission.completed) return;
    const { newlyCompleted } = updateMissionProgress(this.mission, {
      packedCount: this.packedCount,
      blackholesCleared: this.blackholesCleared,
      score: this.score,
    });
    if (newlyCompleted) {
      this.score += this.mission.reward;
      this.sound.playMissionComplete();
      const cx = this.layout.width * 0.5;
      this.spawnFloatingText(cx, this.layout.beltY + 46, `任务达成 +${this.mission.reward}`, this.mission.label, '#6BFFB8', 1.18);
      this.spawnBurst(cx, this.layout.beltY + 46, '#6BFFB8', 22, 1.35);
      this.hudDirty = true;
    }
  }

  // --- Particle & FX Pools ---

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    color: string,
    life: number,
    kind: Particle['kind']
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.color = color;
    p.alpha = 1;
    p.age = 0;
    p.life = life;
    p.kind = kind;
  }

  private spawnBurst(x: number, y: number, color: string, count: number, intensity: number): void {
    const n = Math.min(44, Math.max(4, count));
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.35;
      const speed = (70 + Math.random() * 190) * Math.min(1.6, 0.8 + intensity * 0.35);
      const isStar = i % 3 === 0;
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        (isStar ? 4.5 : 2.6) + Math.random() * 2.5 * Math.min(1.5, intensity),
        color,
        0.34 + Math.random() * 0.32,
        isStar ? 'star' : 'spark'
      );
    }
  }

  private spawnShockwave(x: number, y: number, color: string, maxRadius: number): void {
    this.spawnParticle(x, y, maxRadius, 0, 12, color, 0.38, 'ring');
  }

  private spawnFloatingText(
    x: number,
    y: number,
    text: string,
    subtext: string | undefined,
    color: string,
    scale = 1
  ): void {
    const safeX = Math.max(82, Math.min(this.layout.width - 82, x));
    this.floatingTexts.push({
      x: safeX,
      y,
      vy: -56,
      text,
      subtext,
      color,
      scale,
      age: 0,
      life: 1.05,
    });
  }

  private getBaySlotCenter(bayIndex: number, slotIndex: number): { x: number; y: number } {
    const r = this.layout.bayRects[bayIndex];
    const headerH = this.layout.isCompact ? 48 : 54;
    const footerH = 24;
    const usableH = r.h - headerH - footerH;
    const row = Math.min(slotIndex, 4);
    if (row < 3) {
      const spacing = usableH / 3;
      return {
        x: r.cx,
        y: r.y + r.h - footerH - spacing * (row + 0.5),
      };
    }
    const offset = row === 3 ? -r.w * 0.2 : r.w * 0.2;
    return {
      x: r.cx + offset,
      y: r.y + headerH + 22,
    };
  }

  // --- Main 60fps Loop ---

  private startLoop(): void {
    const step = (ts: number) => {
      if (this.lastTimestamp === 0) this.lastTimestamp = ts;
      const rawDt = (ts - this.lastTimestamp) / 1000;
      this.lastTimestamp = ts;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  private update(dt: number): void {
    this.animTime += dt;

    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt * 1.15);
    this.exitFlashTimer = Math.max(0, this.exitFlashTimer - dt);

    if (this.phase === 'title') {
      this.updateAmbientTitle(dt);
      this.updateParticles(dt);
      return;
    }

    if (this.phase !== 'playing') {
      this.updateParticles(dt);
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateParticles(dt * 0.45);
      return;
    }

    // Advance 90s timer
    this.elapsed += dt;
    const timeLeft = Math.max(0, this.duration - this.elapsed);

    const secCeil = Math.ceil(timeLeft);
    if (secCeil !== this.lastCountdownSec) {
      this.lastCountdownSec = secCeil;
      if (secCeil > 0 && secCeil <= 5) {
        this.sound.playCountdownTick(secCeil <= 3);
      }
      this.hudDirty = true;
    }

    // Update Fever timer (8s)
    if (this.feverTimer > 0) {
      this.feverTimer = Math.max(0, this.feverTimer - dt);
      const tenth = Math.ceil(this.feverTimer * 10);
      if (tenth !== this.lastFeverTenth) {
        this.lastFeverTenth = tenth;
        this.hudDirty = true;
      }
      if (this.feverTimer <= 0) {
        this.sound.setBgmMode('normal');
        this.combo = 0; // Fresh build toward next Fever!
        this.hudDirty = true;
      }
    }

    // Update Slow-Mo timer (5s)
    if (this.slowmoTimer > 0) {
      this.slowmoTimer = Math.max(0, this.slowmoTimer - dt);
      const tenth = Math.ceil(this.slowmoTimer * 10);
      if (tenth !== this.lastSlowmoTenth) {
        this.lastSlowmoTenth = tenth;
        this.hudDirty = true;
      }
    }

    // Schedule VIP Timed Orders (at 16s, 44s, 70s -> >= 2 per 90s round!)
    if (
      !this.vipOrder &&
      this.nextVipScheduleIdx < VIP_SCHEDULE_SECONDS.length &&
      this.elapsed >= VIP_SCHEDULE_SECONDS[this.nextVipScheduleIdx] &&
      timeLeft >= 10
    ) {
      this.vipOrder = createVipOrder(this.nextVipOrderId++, Math.random);
      this.nextVipScheduleIdx += 1;
      this.lastVipSec = Math.ceil(this.vipOrder.timeLeft);
      this.sound.playPickup();
      this.hudDirty = true;
    }

    if (this.vipOrder) {
      this.vipOrder.timeLeft = Math.max(0, this.vipOrder.timeLeft - dt);
      const vSec = Math.ceil(this.vipOrder.timeLeft);
      if (vSec !== this.lastVipSec) {
        this.lastVipSec = vSec;
        this.hudDirty = true;
      }
      if (this.vipOrder.timeLeft <= 0) {
        // Silent fade-out with zero penalty
        this.vipOrder = null;
        this.hudDirty = true;
      }
    }

    // Wave progression (0s -> W1, 30s -> W2, 60s -> W3)
    const waveCfg = getWaveForElapsed(this.elapsed);
    if (waveCfg.wave !== this.currentWave) {
      this.currentWave = waveCfg.wave;
      this.sound.setBgmWave(waveCfg.wave);
      if (waveCfg.wave === 2 || waveCfg.wave === 3) {
        this.sound.playWaveUp(waveCfg.wave);
      }
      this.callbacks.onWaveChange(waveCfg.wave, waveCfg.name, waveCfg.speedTier);
      this.hudDirty = true;
    }

    // Check round end
    if (this.elapsed >= this.duration) {
      for (let i = 0; i < this.bays.length; i++) {
        if (this.bays[i].items.length >= PACK_MIN_COUNT) {
          this.launchBayPack(i, false);
        }
      }
      this.phase = 'gameover';
      this.drag = null;
      this.selectedParcelId = null;
      this.sound.stopBgm();
      this.sound.playRoundEnd();
      this.pushHudSnapshot(true);
      this.callbacks.onRoundComplete({
        score: this.score,
        maxCombo: this.maxCombo,
        packedCount: this.packedCount,
        packedParcels: this.packedParcels,
        blackholesCleared: this.blackholesCleared,
        missionCompleted: Boolean(this.mission?.completed),
        missionLabel: this.mission?.label ?? '',
        vipCompletedCount: this.vipCompletedCount,
      });
      return;
    }

    // Belt speed with Slow-Mo multiplier
    const slowMult = this.slowmoTimer > 0 ? SLOWMO_BELT_FACTOR : 1.0;
    const beltWidth = this.layout.beltRight - this.layout.beltLeft;
    this.beltScroll += beltWidth * waveCfg.beltSpeedRatio * slowMult * dt;

    // Spawn parcels smoothly (smart biased toward 2/3 bays, floods rainbows in Fever)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const hasCrowdAtEntry = this.parcels.some((p) => p.u < 0.11);
      if (!hasCrowdAtEntry) {
        const activeBlackholes = this.parcels.filter((p) => p.kind === 'blackhole').length;
        const activeSlowmo = this.slowmoTimer > 0 || this.parcels.some((p) => p.kind === 'slowmo');
        const spec = pickNextParcelSpec(
          this.elapsed,
          waveCfg,
          this.bays,
          this.feverTimer > 0,
          Math.random,
          activeBlackholes,
          activeSlowmo
        );
        this.parcels.push({
          id: this.nextParcelId++,
          kind: spec.kind,
          isGolden5x: spec.isGolden5x,
          u: -0.02,
          yOffset: 0,
          bobPhase: Math.random() * Math.PI * 2,
          rotation: 0,
          scaleX: 0.75,
          scaleY: 1.22,
          spawnPop: 0,
          age: 0,
        });
        if (spec.kind === 'blackhole') {
          this.sound.playBlackholeSpawn();
        }
        const feverSpawnFactor = this.feverTimer > 0 ? 0.68 : 1.0;
        this.spawnTimer = waveCfg.spawnInterval * feverSpawnFactor * (0.86 + Math.random() * 0.24);
      } else {
        this.spawnTimer = 0.12;
      }
    }

    // Advance parcels along conveyor
    for (let i = this.parcels.length - 1; i >= 0; i--) {
      const p = this.parcels[i];
      p.age += dt;
      p.spawnPop = Math.min(1, p.spawnPop + dt * 5.2);
      p.scaleX += (1 - p.scaleX) * Math.min(1, dt * 14);
      p.scaleY += (1 - p.scaleY) * Math.min(1, dt * 14);

      const isBeingDragged = this.drag && this.drag.parcelId === p.id && this.drag.isDragging;
      const isSelected = this.selectedParcelId === p.id;
      if (!isBeingDragged) {
        const kindMult = p.kind === 'blackhole' ? 0.92 : isSelected ? 0.28 : 1.0;
        p.u += waveCfg.beltSpeedRatio * slowMult * kindMult * dt;
        // Magnetic clamp while selected so parcel never vanishes mid-click while moving pointer to bay
        if (isSelected && p.u > 0.95) {
          p.u = 0.95;
        }
      }

      if (p.u >= 1.02) {
        const pos = this.getParcelPosition(p);
        this.parcels.splice(i, 1);
        if (this.selectedParcelId === p.id) {
          this.selectedParcelId = null;
          this.hudDirty = true;
        }
        if (this.drag && this.drag.parcelId === p.id) {
          this.drag = null;
        }

        if (p.kind === 'blackhole') {
          this.triggerBlackHoleEruption(pos.x, pos.y);
        } else if (p.kind === 'slowmo') {
          // Powerup simply leaves without penalty
        } else {
          // Missed regular/rainbow/golden parcel: ALWAYS give visible feedback, break combo, deduct 10 pts
          const miss = applyParcelMissPenalty(this.score);
          this.score = miss.nextScore;
          this.combo = miss.nextCombo;
          this.exitFlashTimer = 0.35;
          this.sound.playMiss();
          const sub = miss.deducted > 0 ? `-${miss.deducted} 分` : '断连击';
          this.spawnFloatingText(this.layout.beltRight - 46, this.layout.beltY + 42, '漏掉了！', sub, '#FF758F', 1.02);
          this.hudDirty = true;
        }
      }
    }

    // Update visual flight trails (purely cosmetic; bay state already updated cleanly)
    for (let i = this.flyTrails.length - 1; i >= 0; i--) {
      const f = this.flyTrails[i];
      f.t += dt / f.duration;
      if (f.t >= 1) {
        this.flyTrails.splice(i, 1);
      }
    }

    // Update bays & auto-pack fuses
    for (let i = 0; i < this.bays.length; i++) {
      const bay = this.bays[i];
      bay.flashTimer = Math.max(0, bay.flashTimer - dt);
      bay.rejectTimer = Math.max(0, bay.rejectTimer - dt);
      bay.launchPulse = Math.max(0, bay.launchPulse - dt * 2.2);

      for (const item of bay.items) {
        item.pop = Math.min(1, item.pop + dt * 7.5);
      }

      if (bay.packFuse !== null) {
        bay.packFuse -= dt;
        if (bay.packFuse <= 0) {
          this.launchBayPack(i, false);
        }
      }
    }

    // Update launching packed crates
    for (let i = this.launchCrates.length - 1; i >= 0; i--) {
      const c = this.launchCrates[i];
      c.age += dt;
      c.y += c.vy * dt;
      c.vy -= 820 * dt;
      if (Math.random() < 0.75) {
        const spec = BAY_SPEC_MAP[c.color];
        this.spawnParticle(
          c.x + (Math.random() - 0.5) * 20,
          c.y + 20,
          (Math.random() - 0.5) * 45,
          90 + Math.random() * 80,
          3.2,
          spec.bright,
          0.26,
          'spark'
        );
      }
      if (c.age >= c.duration) {
        this.launchCrates.splice(i, 1);
      }
    }

    this.updateParticles(dt);

    if (this.hudDirty) {
      this.pushHudSnapshot(false);
      this.hudDirty = false;
    }
  }

  private updateAmbientTitle(dt: number): void {
    const beltWidth = this.layout.beltRight - this.layout.beltLeft;
    this.beltScroll += beltWidth * 0.08 * dt;
    this.ambientSpawnTimer -= dt;

    for (let i = this.parcels.length - 1; i >= 0; i--) {
      const p = this.parcels[i];
      p.u += 0.08 * dt;
      if (p.u > 1.05) {
        this.parcels.splice(i, 1);
      }
    }

    if (this.ambientSpawnTimer <= 0 && this.parcels.length < 5) {
      const kinds: ParcelKind[] = ['gold', 'coral', 'cyan', 'emerald', 'rainbow'];
      this.parcels.push({
        id: this.nextParcelId++,
        kind: kinds[this.nextParcelId % kinds.length],
        isGolden5x: false,
        u: -0.04,
        yOffset: 0,
        bobPhase: Math.random() * Math.PI * 2,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        spawnPop: 1,
        age: 0,
      });
      this.ambientSpawnTimer = 2.0;
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      const prog = p.age / p.life;
      if (p.kind === 'ring') {
        p.size = 14 + p.vx * prog;
        p.alpha = 1 - prog;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.alpha = 1 - prog;
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.age += dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.94;
      if (ft.age >= ft.life) {
        this.floatingTexts.splice(i, 1);
      }
    }

    for (let i = this.chainArcs.length - 1; i >= 0; i--) {
      const arc = this.chainArcs[i];
      arc.age += dt;
      if (arc.age >= arc.life) {
        this.chainArcs.splice(i, 1);
      }
    }
  }

  private pushHudSnapshot(force: boolean): void {
    if (!force && !this.hudDirty && this.phase !== 'playing') return;
    const waveCfg = getWaveForElapsed(this.elapsed);
    this.callbacks.onHudUpdate({
      phase: this.phase,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      packedCount: this.packedCount,
      packedParcels: this.packedParcels,
      blackholesCleared: this.blackholesCleared,
      timeLeft: Math.max(0, this.duration - this.elapsed),
      duration: this.duration,
      wave: waveCfg.wave,
      waveName: waveCfg.name,
      waveSpeedTier: waveCfg.speedTier,
      waveProgress: getWaveProgress(this.elapsed),
      selectedParcelId: this.selectedParcelId,
      feverActive: this.feverTimer > 0,
      feverTimeLeft: this.feverTimer,
      feverDuration: FEVER_DURATION_SECONDS,
      slowmoTimeLeft: this.slowmoTimer,
      mission: this.mission ? { ...this.mission } : null,
      vipOrder: this.vipOrder
        ? {
            ...this.vipOrder,
            requirements: this.vipOrder.requirements.map((r) => ({ ...r })),
          }
        : null,
    });
  }

  // --- Rendering ---

  private render(): void {
    const ctx = this.ctx;
    const { width, height } = this.layout;

    ctx.save();

    if (this.trauma > 0.005) {
      const shake = this.trauma * this.trauma * 11;
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
    }

    this.renderSpaceBackdrop(ctx, width, height);
    this.renderConveyorBelt(ctx);
    this.renderCargoBays(ctx);
    this.renderChainArcs(ctx);
    this.renderParcels(ctx);
    this.renderFlyTrails(ctx);
    this.renderLaunchCrates(ctx);
    this.renderDraggedParcel(ctx);
    this.renderParticles(ctx);
    this.renderFloatingTexts(ctx);

    // Fever golden-prismatic frame edge shimmer
    if (this.phase === 'playing' && this.feverTimer > 0) {
      const pulse = 0.25 + Math.sin(this.animTime * 12) * 0.1;
      ctx.strokeStyle = `rgba(255, 209, 102, ${pulse + 0.35})`;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, width - 8, height - 8);
    } else if (this.phase === 'playing' && this.combo >= 4) {
      const edgeAlpha = Math.min(0.22, (this.combo - 3) * 0.025);
      ctx.strokeStyle = `rgba(255, 209, 102, ${edgeAlpha})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(2.5, 2.5, width - 5, height - 5);
    }

    if (this.screenFlashAlpha > 0.005) {
      ctx.fillStyle = this.screenFlashColor;
      ctx.globalAlpha = this.screenFlashAlpha;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private renderSpaceBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.backdropCanvas) {
      ctx.drawImage(this.backdropCanvas, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#070B1A';
      ctx.fillRect(0, 0, w, h);
    }

    for (const s of this.bgStars) {
      const drift = (this.animTime * (0.0025 + s.layer * 0.003)) % 1;
      const sx = ((s.x + drift) % 1) * w;
      const sy = s.y * h;
      const twinkle = 0.42 + 0.58 * Math.sin(this.animTime * (1.8 + s.layer) + s.twinklePhase);
      ctx.fillStyle = `hsla(${s.hue}, 85%, 90%, ${twinkle * (0.4 + s.layer * 0.25)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderConveyorBelt(ctx: CanvasRenderingContext2D): void {
    const { beltLeft, beltRight, beltY, beltHeight } = this.layout;
    const beltW = beltRight - beltLeft;
    const top = beltY - beltHeight * 0.5;
    const waveCfg = getWaveForElapsed(this.phase === 'title' ? 0 : this.elapsed);
    const railColor =
      this.feverTimer > 0
        ? '#FFE066'
        : this.slowmoTimer > 0
          ? '#7DD3FC'
          : waveCfg.railColor;

    ctx.save();

    this.roundRect(ctx, beltLeft - 10, top - 6, beltW + 20, beltHeight + 12, 20);
    ctx.fillStyle = 'rgba(15, 24, 50, 0.94)';
    ctx.fill();
    ctx.strokeStyle = this.feverTimer > 0 ? 'rgba(255, 224, 102, 0.55)' : 'rgba(148, 185, 255, 0.22)';
    ctx.lineWidth = this.feverTimer > 0 ? 2.5 : 1.5;
    ctx.stroke();

    this.roundRect(ctx, beltLeft, top + 6, beltW, beltHeight - 12, 14);
    ctx.fillStyle = this.slowmoTimer > 0 ? '#071B30' : '#090F24';
    ctx.fill();

    ctx.save();
    this.roundRect(ctx, beltLeft, top + 6, beltW, beltHeight - 12, 14);
    ctx.clip();

    const step = 46;
    const offset = this.beltScroll % step;
    ctx.strokeStyle =
      this.feverTimer > 0
        ? 'rgba(255, 224, 102, 0.28)'
        : this.slowmoTimer > 0
          ? 'rgba(125, 211, 252, 0.26)'
          : 'rgba(148, 185, 255, 0.14)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let x = beltLeft - step + offset; x < beltRight + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x - 10, beltY - beltHeight * 0.24);
      ctx.lineTo(x + 8, beltY);
      ctx.lineTo(x - 10, beltY + beltHeight * 0.24);
      ctx.stroke();
    }

    const entryGrad = ctx.createLinearGradient(beltLeft, 0, beltLeft + 52, 0);
    entryGrad.addColorStop(0, `${railColor}66`);
    entryGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = entryGrad;
    ctx.fillRect(beltLeft, top + 6, 52, beltHeight - 12);

    const exitAlpha = this.exitFlashTimer > 0 ? 0.65 : 0.34;
    const exitGrad = ctx.createLinearGradient(beltRight - 58, 0, beltRight, 0);
    exitGrad.addColorStop(0, 'rgba(0,0,0,0)');
    exitGrad.addColorStop(1, `rgba(255, 77, 109, ${exitAlpha})`);
    ctx.fillStyle = exitGrad;
    ctx.fillRect(beltRight - 58, top + 6, 58, beltHeight - 12);

    ctx.restore();

    ctx.strokeStyle = railColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(beltLeft + 14, top + 4);
    ctx.lineTo(beltRight - 14, top + 4);
    ctx.moveTo(beltLeft + 14, top + beltHeight - 4);
    ctx.lineTo(beltRight - 14, top + beltHeight - 4);
    ctx.stroke();

    ctx.fillStyle = '#19274F';
    this.roundRect(ctx, beltLeft - 14, top - 2, 16, beltHeight + 4, 6);
    ctx.fill();
    ctx.strokeStyle = railColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = this.exitFlashTimer > 0 ? '#681531' : '#2B1733';
    this.roundRect(ctx, beltRight - 2, top - 2, 16, beltHeight + 4, 6);
    ctx.fill();
    ctx.strokeStyle = '#FF4D6D';
    ctx.lineWidth = this.exitFlashTimer > 0 ? 2.5 : 1.5;
    ctx.stroke();

    ctx.restore();
  }

  private renderCargoBays(ctx: CanvasRenderingContext2D): void {
    const { isCompact, bayRects } = this.layout;
    const activeDragKind = this.drag?.isDragging
      ? this.drag.kind
      : this.selectedParcelId !== null
        ? (this.parcels.find((p) => p.id === this.selectedParcelId)?.kind ?? null)
        : null;

    for (let i = 0; i < this.bays.length; i++) {
      const bay = this.bays[i];
      const spec = BAY_SPEC_MAP[bay.color];
      const r = bayRects[i];

      const isValidTarget = activeDragKind !== null && canAcceptParcel(bay.color, activeDragKind);
      const isHovered = this.drag?.isDragging && this.drag.hoverBayIndex === i;
      const isDimmed = activeDragKind !== null && !isValidTarget;
      const isAlmostPack = bay.items.length === 2 && bay.packFuse === null;
      const isVipTarget = Boolean(
        this.vipOrder &&
          !this.vipOrder.completed &&
          this.vipOrder.requirements.some((req) => req.color === bay.color && req.done < req.needed)
      );

      ctx.save();
      if (isDimmed) {
        ctx.globalAlpha = 0.56;
      }

      const rejectShake = bay.rejectTimer > 0 ? Math.sin(bay.rejectTimer * 52) * 5 : 0;
      const rx = r.x + rejectShake;
      const ry = r.y;

      // Pulsing highlight when 2/3 almost ready, hovered, valid target, or VIP requested
      if ((isHovered && isValidTarget) || isValidTarget || bay.packFuse !== null || isAlmostPack) {
        const pulseAlpha = isAlmostPack ? 0.35 + Math.sin(this.animTime * 8) * 0.22 : 0.42;
        this.roundRect(ctx, rx - 3, ry - 3, r.w + 6, r.h + 6, isCompact ? 18 : 22);
        ctx.strokeStyle =
          isHovered && isValidTarget
            ? `${spec.primary}88`
            : isAlmostPack
              ? `rgba(255, 224, 102, ${pulseAlpha})`
              : `${spec.primary}44`;
        ctx.lineWidth = isHovered && isValidTarget ? 6 : isAlmostPack ? 5 : 4;
        ctx.stroke();
      }

      this.roundRect(ctx, rx, ry, r.w, r.h, isCompact ? 16 : 20);
      if (bay.rejectTimer > 0) {
        ctx.fillStyle = 'rgba(72, 16, 36, 0.94)';
      } else if (isHovered && isValidTarget) {
        ctx.fillStyle = 'rgba(24, 40, 80, 0.96)';
      } else if (isAlmostPack) {
        ctx.fillStyle = 'rgba(20, 33, 66, 0.94)';
      } else {
        ctx.fillStyle = 'rgba(13, 22, 47, 0.92)';
      }
      ctx.fill();

      ctx.strokeStyle =
        bay.rejectTimer > 0
          ? '#FF4D6D'
          : isHovered && isValidTarget
            ? '#FFFFFF'
            : isAlmostPack
              ? '#FFE066'
              : isValidTarget || bay.packFuse !== null
                ? spec.bright
                : `${spec.primary}75`;
      ctx.lineWidth =
        isHovered && isValidTarget ? 3 : isAlmostPack || isValidTarget || bay.packFuse !== null ? 2.4 : 1.5;
      ctx.stroke();

      // Top color accent header strip
      const headerH = isCompact ? 44 : 52;
      ctx.save();
      this.roundRect(ctx, rx + 2, ry + 2, r.w - 4, headerH, isCompact ? 14 : 17);
      ctx.fillStyle = `${spec.primary}22`;
      ctx.fill();
      ctx.restore();

      // Shape emblem + Bay Chinese label + Hotkey / VIP cue
      const iconR = isCompact ? 9.5 : 12;
      drawBayIcon(ctx, rx + (isCompact ? 16 : 24), ry + headerH * 0.5, iconR, bay.color);

      ctx.fillStyle = '#F5F8FF';
      ctx.font = `700 ${isCompact ? 13 : 16}px "Noto Sans SC", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(isCompact ? spec.shortLabel : spec.name, rx + (isCompact ? 31 : 44), ry + headerH * 0.5);

      if (isVipTarget) {
        ctx.fillStyle = '#FFE066';
        ctx.font = `800 ${isCompact ? 10 : 12}px "JetBrains Mono", sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText('VIP×3', rx + r.w - (isCompact ? 8 : 14), ry + headerH * 0.5);
      } else if (!isCompact) {
        ctx.fillStyle = 'rgba(203, 213, 240, 0.55)';
        ctx.font = `700 12px "JetBrains Mono", monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`[${spec.hotkey}]`, rx + r.w - 14, ry + headerH * 0.5);
      }

      // Draw 3 core empty socket guides
      const slotRadius = Math.min(this.layout.parcelRadius * 0.78, (r.w - 22) * 0.34);
      for (let s = 0; s < 3; s++) {
        const pos = this.getBaySlotCenter(i, s);
        const filled = s < bay.items.length;

        ctx.save();
        ctx.translate(pos.x + rejectShake, pos.y);
        traceShapePath(ctx, spec.shape, slotRadius * 0.94);
        ctx.fillStyle = filled ? `${spec.primary}24` : 'rgba(255, 255, 255, 0.03)';
        ctx.fill();
        ctx.strokeStyle = filled ? `${spec.bright}88` : `${spec.primary}38`;
        ctx.lineWidth = 1.5;
        if (!filled) ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();
      }

      // Draw placed parcels inside the bay (skip if its brief visual flight trail is still in mid-air)
      for (let s = 0; s < bay.items.length; s++) {
        const item = bay.items[s];
        const stillFlying = this.flyTrails.some((f) => f.targetParcelId === item.id);
        if (stillFlying) continue;

        const pos = this.getBaySlotCenter(i, s);
        const ease = 1 - Math.pow(1 - item.pop, 3);
        const popScale = 0.65 + ease * 0.35 + (bay.packFuse !== null ? Math.sin(this.animTime * 22) * 0.04 : 0);

        drawParcelSprite(ctx, {
          x: pos.x + rejectShake,
          y: pos.y,
          radius: slotRadius * (s >= 3 ? 0.82 : 0.98),
          kind: item.sourceKind,
          isGolden5x: item.isGolden5x,
          time: this.animTime,
          scaleX: popScale,
          scaleY: popScale,
        });
      }

      // Pulsing "再1个就打包！" banner right above the bay when at 2/3!
      if (isAlmostPack && this.phase === 'playing') {
        const bob = Math.sin(this.animTime * 8) * 2.5;
        const badgeW = Math.min(r.w + 4, isCompact ? 86 : 118);
        const badgeH = 22;
        const bx = rx + (r.w - badgeW) * 0.5;
        const by = ry - 27 + bob;

        this.roundRect(ctx, bx, by, badgeW, badgeH, 8);
        ctx.fillStyle = '#FFB703';
        ctx.fill();

        ctx.fillStyle = '#090F24';
        ctx.font = `800 ${isCompact ? 10 : 12}px "Noto Sans SC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('再1个就打包！', rx + r.w * 0.5, by + badgeH * 0.5 + 0.5);
      }

      // Footer: fuse bar or 0/3 counter
      const footerY = ry + r.h - 14;
      if (bay.packFuse !== null) {
        const prog = 1 - Math.max(0, bay.packFuse) / PACK_FUSE_SECONDS;
        const barW = r.w - 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        this.roundRect(ctx, rx + 10, footerY - 3, barW, 6, 3);
        ctx.fill();

        ctx.fillStyle = spec.bright;
        this.roundRect(ctx, rx + 10, footerY - 3, Math.max(6, barW * prog), 6, 3);
        ctx.fill();
      } else {
        ctx.fillStyle = isAlmostPack
          ? '#FFE066'
          : bay.items.length > 0
            ? spec.bright
            : 'rgba(148, 163, 200, 0.52)';
        ctx.font = `700 12px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${bay.items.length}/3`, rx + r.w * 0.5, footerY);
      }

      if (bay.launchPulse > 0.02) {
        this.roundRect(ctx, rx, ry, r.w, r.h, isCompact ? 16 : 20);
        ctx.fillStyle = spec.bright;
        ctx.globalAlpha = bay.launchPulse * 0.34;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private renderParcels(ctx: CanvasRenderingContext2D): void {
    const r = this.layout.parcelRadius;
    for (const p of this.parcels) {
      if (this.drag && this.drag.isDragging && this.drag.parcelId === p.id) continue;
      const pos = this.getParcelPosition(p);
      const pop = 0.4 + 0.6 * Math.min(1, p.spawnPop);
      const isSelected = this.selectedParcelId === p.id;
      const danger = p.kind === 'blackhole' ? Math.max(0, Math.min(1, p.u)) : 0;

      drawParcelSprite(ctx, {
        x: pos.x,
        y: pos.y,
        radius: r,
        kind: p.kind,
        isGolden5x: p.isGolden5x,
        time: this.animTime,
        scaleX: p.scaleX * pop * (isSelected ? 1.14 : 1),
        scaleY: p.scaleY * pop * (isSelected ? 1.14 : 1),
        selected: isSelected,
        dangerProgress: danger,
      });
    }
  }

  private renderFlyTrails(ctx: CanvasRenderingContext2D): void {
    const r = this.layout.parcelRadius * 0.9;
    for (const f of this.flyTrails) {
      const t = Math.min(1, f.t);
      const ease = 1 - Math.pow(1 - t, 3);
      const x = f.startX + (f.targetX - f.startX) * ease;
      const arcLift = Math.sin(t * Math.PI) * 32;
      const y = f.startY + (f.targetY - f.startY) * ease - arcLift;

      drawParcelSprite(ctx, {
        x,
        y,
        radius: r,
        kind: f.kind,
        isGolden5x: f.isGolden5x,
        time: this.animTime,
        scaleX: 1.06,
        scaleY: 0.94,
      });
    }
  }

  private renderDraggedParcel(ctx: CanvasRenderingContext2D): void {
    if (!this.drag || !this.drag.isDragging) return;
    const { currX, currY, kind, isGolden5x, hoverBayIndex } = this.drag;
    const drawY = this.layout.isCompact ? currY - 26 : currY;

    if (hoverBayIndex !== null && canAcceptParcel(this.bays[hoverBayIndex].color, kind)) {
      const target = this.layout.bayRects[hoverBayIndex];
      const spec = BAY_SPEC_MAP[this.bays[hoverBayIndex].color];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(currX, drawY);
      ctx.lineTo(target.cx, target.y + 30);
      ctx.strokeStyle = spec.bright;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.restore();
    }

    drawParcelSprite(ctx, {
      x: currX,
      y: drawY,
      radius: this.layout.parcelRadius * 1.14,
      kind,
      isGolden5x,
      time: this.animTime,
      selected: true,
    });
  }

  private renderLaunchCrates(ctx: CanvasRenderingContext2D): void {
    for (const c of this.launchCrates) {
      const spec = BAY_SPEC_MAP[c.color];
      const alpha = Math.max(0, 1 - c.age / c.duration);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(c.x, c.y);

      const flameH = 38 + Math.random() * 18;
      const flameGrad = ctx.createLinearGradient(0, 12, 0, 12 + flameH);
      flameGrad.addColorStop(0, '#FFFFFF');
      flameGrad.addColorStop(0.35, spec.bright);
      flameGrad.addColorStop(1, 'rgba(255, 183, 3, 0)');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(-12, 14);
      ctx.lineTo(0, 14 + flameH);
      ctx.lineTo(12, 14);
      ctx.closePath();
      ctx.fill();

      this.roundRect(ctx, -26, -24, 52, 42, 12);
      ctx.fillStyle = spec.primary;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      traceShapePath(ctx, spec.shape, 12);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      ctx.restore();
    }
  }

  private renderChainArcs(ctx: CanvasRenderingContext2D): void {
    for (const arc of this.chainArcs) {
      const prog = arc.age / arc.life;
      const alpha = 1 - prog;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 6 * (1 - prog * 0.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(arc.fromX, arc.fromY);
      ctx.quadraticCurveTo(
        (arc.fromX + arc.toX) * 0.5,
        Math.min(arc.fromY, arc.toY) - 42,
        arc.toX,
        arc.toY
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.translate(p.x, p.y);
        ctx.fillStyle = p.color;
        traceShapePath(ctx, 'star', p.size);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderFloatingTexts(ctx: CanvasRenderingContext2D): void {
    for (const ft of this.floatingTexts) {
      const prog = ft.age / ft.life;
      const alpha = prog < 0.7 ? 1 : (1 - prog) / 0.3;
      const pop = prog < 0.14 ? 0.8 + (prog / 0.14) * 0.28 : 1.0;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(ft.x, ft.y);
      ctx.scale(ft.scale * pop, ft.scale * pop);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = '800 22px "JetBrains Mono", "Noto Sans SC", sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(5, 8, 22, 0.92)';
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);

      if (ft.subtext) {
        ctx.font = '700 13px "Noto Sans SC", sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeText(ft.subtext, 0, 22);
        ctx.fillStyle = '#F8FAFF';
        ctx.fillText(ft.subtext, 0, 22);
      }

      ctx.restore();
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
