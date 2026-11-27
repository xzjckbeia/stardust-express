import {
  BAY_SPECS,
  BayState,
  MissionState,
  NextRankProgress,
  ParcelColor,
  ParcelKind,
  RunSummary,
  StoredRecords,
  VipOrderState,
  WaveConfig,
} from './types';

export const ROUND_DURATION_SECONDS = 90;
export const WAVE_DURATION_SECONDS = 30;
export const PACK_MIN_COUNT = 3;
export const BAY_MAX_CAPACITY = 5;
export const PACK_FUSE_SECONDS = 0.44;
export const RECORDS_STORAGE_KEY = 'stardust_express_records_v1';

// Core balance constants
export const SORT_BASE_POINTS: readonly [number, number, number] = [30, 60, 100];
export const COMBO_MULTIPLIER_STEP = 0.1;
export const COMBO_MAX_STACK = 10;
export const PACK_BONUS_3 = 300;
export const BLACKHOLE_ZAP_POINTS = 20;
export const BLACKHOLE_ERUPTION_PENALTY = 25;
export const PARCEL_MISS_PENALTY = 10;
export const GOLDEN_5X_MULTIPLIER = 5;
export const FEVER_COMBO_THRESHOLD = 10;
export const FEVER_DURATION_SECONDS = 8;
export const FEVER_SCORE_MULTIPLIER = 2;
export const SLOWMO_DURATION_SECONDS = 5;
export const SLOWMO_BELT_FACTOR = 0.5;
export const VIP_ORDER_MULTIPLIER = 3;
export const VIP_ORDER_DURATION_SECONDS = 12;

export const WAVE_CONFIGS: readonly WaveConfig[] = [
  {
    wave: 1,
    name: '星港起航',
    speedTier: '1档',
    beltSpeedRatio: 0.175,
    spawnInterval: 0.9,
    rainbowChance: 0.09,
    blackholeChance: 0.09,
    golden5xChance: 0,
    slowmoChance: 0,
    railColor: '#38BDF8',
  },
  {
    wave: 2,
    name: '脉冲提速 · 黄金特快',
    speedTier: '2档',
    beltSpeedRatio: 0.225,
    spawnInterval: 0.74,
    rainbowChance: 0.12,
    blackholeChance: 0.12,
    golden5xChance: 0.14,
    slowmoChance: 0,
    railColor: '#FFB703',
  },
  {
    wave: 3,
    name: '超光速冲刺 · 减速支援',
    speedTier: '3档',
    beltSpeedRatio: 0.28,
    spawnInterval: 0.6,
    rainbowChance: 0.14,
    blackholeChance: 0.15,
    golden5xChance: 0.16,
    slowmoChance: 0.09,
    railColor: '#FF4D6D',
  },
] as const;

export const RANK_TIERS: readonly { minScore: number; title: string; subtitle: string }[] = [
  { minScore: 0, title: '星港见习员', subtitle: '熟悉传送带节奏，下局一定更高分' },
  { minScore: 1200, title: '星际快递员', subtitle: '稳步起航，星尘航线运转顺利' },
  { minScore: 3000, title: '轨道分拣专家', subtitle: '稳定控场，连击如流星雨般流畅' },
  { minScore: 6000, title: '超光速王牌', subtitle: '手速与节奏完美同步的星港精英' },
  { minScore: 10000, title: '银河特快传奇', subtitle: '全宇宙最耀眼的极速分拣大师' },
] as const;

export function getWaveForElapsed(elapsedSeconds: number): WaveConfig {
  const clamped = Math.max(0, elapsedSeconds);
  if (clamped < WAVE_DURATION_SECONDS) return WAVE_CONFIGS[0];
  if (clamped < WAVE_DURATION_SECONDS * 2) return WAVE_CONFIGS[1];
  return WAVE_CONFIGS[2];
}

export function getWaveProgress(elapsedSeconds: number): number {
  const clamped = Math.max(0, Math.min(elapsedSeconds, ROUND_DURATION_SECONDS));
  const waveStart =
    Math.floor(Math.min(clamped, ROUND_DURATION_SECONDS - 0.001) / WAVE_DURATION_SECONDS) *
    WAVE_DURATION_SECONDS;
  return Math.max(0, Math.min(1, (clamped - waveStart) / WAVE_DURATION_SECONDS));
}

export function canAcceptParcel(bayColor: ParcelColor, parcelKind: ParcelKind): boolean {
  if (parcelKind === 'blackhole' || parcelKind === 'slowmo') return false;
  if (parcelKind === 'rainbow') return true;
  return parcelKind === bayColor;
}

export function createInitialBays(): BayState[] {
  return BAY_SPECS.map((spec) => ({
    color: spec.id,
    items: [],
    packFuse: null,
    flashTimer: 0,
    rejectTimer: 0,
    launchPulse: 0,
  }));
}

/**
 * Base sort score based on item count in bay AFTER placement:
 * 1st -> 30, 2nd -> 60, 3rd+ -> 100.
 */
export function getSortBasePoints(itemCountAfterPlace: number): number {
  if (itemCountAfterPlace <= 1) return SORT_BASE_POINTS[0];
  if (itemCountAfterPlace === 2) return SORT_BASE_POINTS[1];
  return SORT_BASE_POINTS[2];
}

/**
 * Sort score formula:
 * 基础分 × (1 + 0.1 × min(当前连击数, 10)) × (金色5倍 ? 5 : 1) × (Fever ? 2 : 1)
 */
export function calculateSortScore(
  itemCountAfterPlace: number,
  comboCount: number,
  options?: { isGolden5x?: boolean; isFever?: boolean }
): number {
  const base = getSortBasePoints(itemCountAfterPlace);
  const cappedCombo = Math.min(Math.max(0, comboCount), COMBO_MAX_STACK);
  const comboMult = 1 + COMBO_MULTIPLIER_STEP * cappedCombo;
  const goldenMult = options?.isGolden5x ? GOLDEN_5X_MULTIPLIER : 1;
  const feverMult = options?.isFever ? FEVER_SCORE_MULTIPLIER : 1;
  return Math.round(base * comboMult * goldenMult * feverMult);
}

export interface PlaceParcelResult {
  accepted: boolean;
  reason?: 'wrong_color' | 'bay_full';
  newCount: number;
  triggeredFuse: boolean;
  instantOverchargePack: boolean;
  triggeredRainbowChain: boolean;
  placePoints: number;
  nextCombo: number;
  triggeredFever: boolean;
}

/**
 * Pure rule for placing a parcel into a cargo bay:
 * - 1st item: 30 base, 2nd: 60 base, 3rd+: 100 base, scaled by combo (cap x10), golden 5x, and Fever 2x.
 * - Rainbow parcel placed into a bay that ALREADY has 2+ parcels triggers instant pack + adjacent bay chain!
 * - Reaching combo x10 (when not already in Fever) triggers Fever mode!
 */
export function applyPlaceParcel(
  bay: BayState,
  parcelId: number,
  parcelKind: ParcelKind,
  currentCombo: number,
  options?: { isGolden5x?: boolean; isFever?: boolean }
): PlaceParcelResult {
  if (!canAcceptParcel(bay.color, parcelKind)) {
    bay.rejectTimer = 0.35;
    return {
      accepted: false,
      reason: 'wrong_color',
      newCount: bay.items.length,
      triggeredFuse: false,
      instantOverchargePack: false,
      triggeredRainbowChain: false,
      placePoints: 0,
      nextCombo: 0,
      triggeredFever: false,
    };
  }

  if (bay.items.length >= BAY_MAX_CAPACITY) {
    bay.rejectTimer = 0.25;
    return {
      accepted: false,
      reason: 'bay_full',
      newCount: bay.items.length,
      triggeredFuse: false,
      instantOverchargePack: false,
      triggeredRainbowChain: false,
      placePoints: 0,
      nextCombo: currentCombo,
      triggeredFever: false,
    };
  }

  const prevCount = bay.items.length;
  const slotKind = parcelKind === 'rainbow' ? 'rainbow' : bay.color;
  bay.items.push({
    id: parcelId,
    sourceKind: slotKind,
    isGolden5x: Boolean(options?.isGolden5x),
    pop: 0,
  });
  bay.flashTimer = 0.26;

  const nextCombo = Math.min(COMBO_MAX_STACK, currentCombo + 1);
  const triggeredFever = !options?.isFever && currentCombo < FEVER_COMBO_THRESHOLD && nextCombo >= FEVER_COMBO_THRESHOLD;
  const effectiveFever = Boolean(options?.isFever || triggeredFever);

  const placePoints = calculateSortScore(bay.items.length, nextCombo, {
    isGolden5x: options?.isGolden5x,
    isFever: effectiveFever,
  });

  const triggeredRainbowChain = parcelKind === 'rainbow' && prevCount >= 2;
  let triggeredFuse = false;
  let instantOverchargePack = false;

  if (triggeredRainbowChain || bay.items.length >= BAY_MAX_CAPACITY) {
    bay.packFuse = 0;
    instantOverchargePack = true;
  } else if (bay.items.length >= PACK_MIN_COUNT) {
    if (bay.packFuse === null) {
      bay.packFuse = PACK_FUSE_SECONDS;
      triggeredFuse = true;
    } else {
      bay.packFuse = Math.max(bay.packFuse, 0.3);
    }
  }

  return {
    accepted: true,
    newCount: bay.items.length,
    triggeredFuse,
    instantOverchargePack,
    triggeredRainbowChain,
    placePoints,
    nextCombo,
    triggeredFever,
  };
}

export interface PackLaunchScore {
  points: number;
  count: number;
  rainbowCount: number;
  overchargeLabel: string | null;
  vipApplied: boolean;
  feverApplied: boolean;
}

/**
 * Calculates pack launch bonus:
 * - Standard 3-parcel pack bonus = 300 points (4-parcel = 450, 5-parcel = 600).
 * - Chain-detonated adjacent bays with 1-2 items receive proportional pack bonus (120 / 220).
 * - Multiplied by VIP order (x3) if this bay's color fulfills an active VIP requirement,
 *   and by Fever (x2) if Fever is active.
 */
export function calculatePackLaunchScore(
  items: readonly { sourceKind: ParcelColor | 'rainbow' }[],
  options?: { isFever?: boolean; isVipMatch?: boolean; isChainBonus?: boolean }
): PackLaunchScore {
  const count = items.length;
  const rainbowCount = items.filter((i) => i.sourceKind === 'rainbow').length;

  let baseBonus = PACK_BONUS_3;
  if (count >= 5) baseBonus = 600;
  else if (count === 4) baseBonus = 450;
  else if (count === 3) baseBonus = PACK_BONUS_3;
  else if (count === 2) baseBonus = 220;
  else baseBonus = 120;

  const vipMult = options?.isVipMatch ? VIP_ORDER_MULTIPLIER : 1;
  const feverMult = options?.isFever ? FEVER_SCORE_MULTIPLIER : 1;
  const points = Math.round(baseBonus * vipMult * feverMult);

  let overchargeLabel: string | null = null;
  if (options?.isChainBonus) overchargeLabel = '彩虹连消引爆';
  else if (count >= 5) overchargeLabel = '五星超载特快';
  else if (count === 4) overchargeLabel = '四连加速打包';

  return {
    points,
    count,
    rainbowCount,
    overchargeLabel,
    vipApplied: Boolean(options?.isVipMatch),
    feverApplied: Boolean(options?.isFever),
  };
}

export function getRainbowChainAdjacentIndices(bayIndex: number, totalBays = 4): number[] {
  const out: number[] = [];
  if (bayIndex - 1 >= 0) out.push(bayIndex - 1);
  if (bayIndex + 1 < totalBays) out.push(bayIndex + 1);
  return out;
}

export function calculateBlackholeZapScore(
  currentCombo: number,
  isFever = false
): {
  points: number;
  nextCombo: number;
  triggeredFever: boolean;
} {
  const nextCombo = Math.min(COMBO_MAX_STACK, currentCombo + 1);
  const triggeredFever = !isFever && currentCombo < FEVER_COMBO_THRESHOLD && nextCombo >= FEVER_COMBO_THRESHOLD;
  const points = BLACKHOLE_ZAP_POINTS * (isFever || triggeredFever ? FEVER_SCORE_MULTIPLIER : 1);
  return { points, nextCombo, triggeredFever };
}

export interface BlackholePenaltyResult {
  nextScore: number;
  deducted: number;
  nextCombo: number;
}

/**
 * Black hole eruption NO LONGER steals cargo from bays.
 * It only breaks combo and deducts 25 points (floored at 0).
 */
export function applyBlackholePenalty(currentScore: number): BlackholePenaltyResult {
  const nextScore = Math.max(0, currentScore - BLACKHOLE_ERUPTION_PENALTY);
  return {
    nextScore,
    deducted: currentScore - nextScore,
    nextCombo: 0,
  };
}

export function applyParcelMissPenalty(currentScore: number): { nextScore: number; deducted: number; nextCombo: number } {
  const nextScore = Math.max(0, currentScore - PARCEL_MISS_PENALTY);
  return {
    nextScore,
    deducted: currentScore - nextScore,
    nextCombo: 0,
  };
}

export interface SpawnedParcelSpec {
  kind: ParcelKind;
  isGolden5x: boolean;
}

/**
 * Smart parcel generator:
 * - During Fever: floods with Rainbow parcels (~58%) and no black holes.
 * - Wave 3: spawns occasional Slow-Mo powerups.
 * - Wave 2+: spawns Golden 5x color parcels.
 * - Biases color selection toward bays that currently have 2 items ("差1个就打包").
 */
export function pickNextParcelSpec(
  elapsedSeconds: number,
  waveConfig: WaveConfig,
  bays: readonly BayState[],
  isFever: boolean,
  rng: () => number,
  activeBlackholes: number,
  activeSlowmo: boolean
): SpawnedParcelSpec {
  const roll = rng();

  if (isFever) {
    if (roll < 0.58) {
      return { kind: 'rainbow', isGolden5x: false };
    }
    const color = pickBiasedColor(bays, rng);
    const isGolden5x = waveConfig.wave >= 2 && rng() < waveConfig.golden5xChance;
    return { kind: color, isGolden5x };
  }

  // Wave 3 Slow-Mo item
  if (waveConfig.slowmoChance > 0 && !activeSlowmo && roll < waveConfig.slowmoChance) {
    return { kind: 'slowmo', isGolden5x: false };
  }

  const canSpawnBlackhole = elapsedSeconds >= 5 && activeBlackholes < (waveConfig.wave === 3 ? 2 : 1);
  let cursor = waveConfig.slowmoChance > 0 && !activeSlowmo ? waveConfig.slowmoChance : 0;

  if (canSpawnBlackhole && roll < cursor + waveConfig.blackholeChance) {
    return { kind: 'blackhole', isGolden5x: false };
  }
  if (canSpawnBlackhole) cursor += waveConfig.blackholeChance;

  if (elapsedSeconds >= 3 && roll < cursor + waveConfig.rainbowChance) {
    return { kind: 'rainbow', isGolden5x: false };
  }

  const color = pickBiasedColor(bays, rng);
  const isGolden5x = waveConfig.wave >= 2 && rng() < waveConfig.golden5xChance;
  return { kind: color, isGolden5x };
}

export function pickBiasedColor(bays: readonly BayState[], rng: () => number): ParcelColor {
  const almostFull = bays.filter((b) => b.items.length === 2).map((b) => b.color);
  // Strong 55% bias toward colors that only need 1 more parcel to pack!
  if (almostFull.length > 0 && rng() < 0.55) {
    const idx = Math.floor(rng() * almostFull.length) % almostFull.length;
    return almostFull[idx];
  }
  const colors: ParcelColor[] = ['gold', 'coral', 'cyan', 'emerald'];
  return colors[Math.floor(rng() * colors.length) % colors.length];
}

// --- Per-Round Mission Helpers ---

const MISSION_TEMPLATES: readonly Omit<MissionState, 'current' | 'completed'>[] = [
  { id: 'pack_3', type: 'pack', label: '打包发车 3 次', target: 3, reward: 200 },
  { id: 'blackhole_3', type: 'blackhole', label: '清除 3 个黑洞', target: 3, reward: 200 },
  { id: 'score_800', type: 'score', label: '本局达到 800 分', target: 800, reward: 200 },
  { id: 'pack_5', type: 'pack', label: '打包发车 5 次', target: 5, reward: 300 },
];

export function createRoundMission(rng: () => number): MissionState {
  const tpl = MISSION_TEMPLATES[Math.floor(rng() * MISSION_TEMPLATES.length) % MISSION_TEMPLATES.length];
  return {
    ...tpl,
    current: 0,
    completed: false,
  };
}

export function updateMissionProgress(
  mission: MissionState,
  stats: { packedCount: number; blackholesCleared: number; score: number }
): { newlyCompleted: boolean } {
  const raw =
    mission.type === 'pack'
      ? stats.packedCount
      : mission.type === 'blackhole'
        ? stats.blackholesCleared
        : stats.score;
  mission.current = Math.min(mission.target, raw);
  if (!mission.completed && mission.current >= mission.target) {
    mission.completed = true;
    return { newlyCompleted: true };
  }
  return { newlyCompleted: false };
}

// --- VIP Timed Order Helpers ---

export function createVipOrder(orderId: number, rng: () => number): VipOrderState {
  const colors: ParcelColor[] = ['gold', 'coral', 'cyan', 'emerald'];
  const firstIdx = Math.floor(rng() * colors.length) % colors.length;
  let secondIdx = Math.floor(rng() * (colors.length - 1)) % (colors.length - 1);
  if (secondIdx >= firstIdx) secondIdx += 1;

  return {
    id: orderId,
    requirements: [
      { color: colors[firstIdx], needed: 1, done: 0 },
      { color: colors[secondIdx], needed: 1, done: 0 },
    ],
    timeLeft: VIP_ORDER_DURATION_SECONDS,
    duration: VIP_ORDER_DURATION_SECONDS,
    multiplier: VIP_ORDER_MULTIPLIER,
    completed: false,
  };
}

export function applyVipPackProgress(
  order: VipOrderState | null,
  packedColor: ParcelColor
): { matched: boolean; orderCompleted: boolean } {
  if (!order || order.completed || order.timeLeft <= 0) {
    return { matched: false, orderCompleted: false };
  }

  const req = order.requirements.find((r) => r.color === packedColor && r.done < r.needed);
  if (!req) {
    return { matched: false, orderCompleted: false };
  }

  req.done += 1;
  const allDone = order.requirements.every((r) => r.done >= r.needed);
  if (allDone) {
    order.completed = true;
  }
  return { matched: true, orderCompleted: allDone };
}

// --- Courier Rank & Next Rank Progress ---

export function getCourierRank(score: number): { title: string; subtitle: string } {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (score >= tier.minScore) current = tier;
  }
  return { title: current.title, subtitle: current.subtitle };
}

export function getNextRankProgress(score: number): NextRankProgress | null {
  for (const tier of RANK_TIERS) {
    if (score < tier.minScore) {
      return {
        nextTitle: tier.title,
        nextThreshold: tier.minScore,
        pointsNeeded: tier.minScore - score,
      };
    }
  }
  return null;
}

export const EMPTY_RECORDS: StoredRecords = {
  bestScore: 0,
  bestMaxCombo: 0,
  totalPackedAllTime: 0,
  gamesPlayed: 0,
};

export function loadRecords(storage?: Pick<Storage, 'getItem'> | null): StoredRecords {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return { ...EMPTY_RECORDS };
  try {
    const raw = store.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_RECORDS };
    const parsed = JSON.parse(raw) as Partial<StoredRecords>;
    return {
      bestScore: Math.max(0, Math.floor(Number(parsed.bestScore) || 0)),
      bestMaxCombo: Math.max(0, Math.floor(Number(parsed.bestMaxCombo) || 0)),
      totalPackedAllTime: Math.max(0, Math.floor(Number(parsed.totalPackedAllTime) || 0)),
      gamesPlayed: Math.max(0, Math.floor(Number(parsed.gamesPlayed) || 0)),
    };
  } catch {
    return { ...EMPTY_RECORDS };
  }
}

export function mergeAndSaveRecords(
  prev: StoredRecords,
  run: {
    score: number;
    maxCombo: number;
    packedCount: number;
    packedParcels: number;
    blackholesCleared: number;
    missionCompleted?: boolean;
    missionLabel?: string;
    vipCompletedCount?: number;
  },
  storage?: Pick<Storage, 'setItem'> | null
): { records: StoredRecords; summary: RunSummary } {
  const isNewBestScore = run.score > prev.bestScore && run.score > 0;
  const isNewBestCombo = run.maxCombo > prev.bestMaxCombo && run.maxCombo > 0;

  const records: StoredRecords = {
    bestScore: Math.max(prev.bestScore, run.score),
    bestMaxCombo: Math.max(prev.bestMaxCombo, run.maxCombo),
    totalPackedAllTime: prev.totalPackedAllTime + run.packedCount,
    gamesPlayed: prev.gamesPlayed + 1,
  };

  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (store) {
    try {
      store.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Ignore quota / privacy mode storage errors
    }
  }

  const rank = getCourierRank(run.score);
  const nextRank = getNextRankProgress(run.score);
  const summary: RunSummary = {
    score: run.score,
    maxCombo: run.maxCombo,
    packedCount: run.packedCount,
    packedParcels: run.packedParcels,
    blackholesCleared: run.blackholesCleared,
    isNewBestScore,
    isNewBestCombo,
    rankTitle: rank.title,
    rankSubtitle: rank.subtitle,
    nextRank,
    missionCompleted: Boolean(run.missionCompleted),
    missionLabel: run.missionLabel ?? '',
    vipCompletedCount: run.vipCompletedCount ?? 0,
  };

  return { records, summary };
}

export function formatShareText(summary: RunSummary, records: StoredRecords): string {
  const bestTag = summary.isNewBestScore ? '（新纪录!）' : '';
  return [
    `《星尘快递站》90秒极速分拣战报`,
    `称号：${summary.rankTitle}`,
    `本局得分：${summary.score}${bestTag}`,
    `最高连击：x${summary.maxCombo}`,
    `打包发车：${summary.packedCount} 批（共 ${summary.packedParcels} 件包裹）`,
    `累计总打包：${records.totalPackedAllTime} 批 · 历史最高：${records.bestScore} 分`,
    `来挑战我的星尘快递纪录吧！`,
  ].join('\n');
}
