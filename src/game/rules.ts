import {
  BAY_SPECS,
  BayState,
  ParcelColor,
  ParcelKind,
  RunSummary,
  StoredRecords,
  WaveConfig,
} from './types';

export const ROUND_DURATION_SECONDS = 90;
export const WAVE_DURATION_SECONDS = 30;
export const PACK_MIN_COUNT = 3;
export const BAY_MAX_CAPACITY = 5;
export const PACK_FUSE_SECONDS = 0.48;
export const RECORDS_STORAGE_KEY = 'stardust_express_records_v1';

export const WAVE_CONFIGS: readonly WaveConfig[] = [
  {
    wave: 1,
    name: '星港起航',
    speedTier: '1档',
    beltSpeedRatio: 0.135,
    spawnInterval: 1.38,
    rainbowChance: 0.09,
    blackholeChance: 0.08,
    railColor: '#38BDF8',
  },
  {
    wave: 2,
    name: '脉冲提速',
    speedTier: '2档',
    beltSpeedRatio: 0.19,
    spawnInterval: 1.05,
    rainbowChance: 0.12,
    blackholeChance: 0.13,
    railColor: '#FFB703',
  },
  {
    wave: 3,
    name: '超光速冲刺',
    speedTier: '3档',
    beltSpeedRatio: 0.255,
    spawnInterval: 0.82,
    rainbowChance: 0.14,
    blackholeChance: 0.17,
    railColor: '#FF4D6D',
  },
] as const;

export function getWaveForElapsed(elapsedSeconds: number): WaveConfig {
  const clamped = Math.max(0, elapsedSeconds);
  if (clamped < WAVE_DURATION_SECONDS) return WAVE_CONFIGS[0];
  if (clamped < WAVE_DURATION_SECONDS * 2) return WAVE_CONFIGS[1];
  return WAVE_CONFIGS[2];
}

export function getWaveProgress(elapsedSeconds: number): number {
  const clamped = Math.max(0, Math.min(elapsedSeconds, ROUND_DURATION_SECONDS));
  const waveStart = Math.floor(Math.min(clamped, ROUND_DURATION_SECONDS - 0.001) / WAVE_DURATION_SECONDS) * WAVE_DURATION_SECONDS;
  return Math.max(0, Math.min(1, (clamped - waveStart) / WAVE_DURATION_SECONDS));
}

export function canAcceptParcel(bayColor: ParcelColor, parcelKind: ParcelKind): boolean {
  if (parcelKind === 'blackhole') return false;
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

export interface PlaceParcelResult {
  accepted: boolean;
  reason?: 'wrong_color' | 'bay_full';
  newCount: number;
  triggeredFuse: boolean;
  instantOverchargePack: boolean;
  placePoints: number;
  nextCombo: number;
}

/**
 * Pure rule for placing a parcel into a cargo bay.
 * - Normal parcels only fit their matching color bay.
 * - Rainbow parcels fit any bay and count as that bay's color.
 * - Reaching 3 starts the brief auto-pack fuse (allowing 4th/5th overcharge chain).
 * - Reaching 5 triggers immediate maximum overcharge launch.
 */
export function applyPlaceParcel(
  bay: BayState,
  parcelId: number,
  parcelKind: ParcelKind,
  currentCombo: number
): PlaceParcelResult {
  if (!canAcceptParcel(bay.color, parcelKind)) {
    bay.rejectTimer = 0.35;
    return {
      accepted: false,
      reason: 'wrong_color',
      newCount: bay.items.length,
      triggeredFuse: false,
      instantOverchargePack: false,
      placePoints: 0,
      nextCombo: 0,
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
      placePoints: 0,
      nextCombo: currentCombo,
    };
  }

  const slotKind = parcelKind === 'rainbow' ? 'rainbow' : bay.color;
  bay.items.push({ id: parcelId, sourceKind: slotKind, pop: 0 });
  bay.flashTimer = 0.26;

  const nextCombo = currentCombo + 1;
  const comboBonus = Math.min(nextCombo - 1, 20) * 4;
  const placePoints = (parcelKind === 'rainbow' ? 25 : 15) + comboBonus;

  let triggeredFuse = false;
  let instantOverchargePack = false;

  if (bay.items.length >= BAY_MAX_CAPACITY) {
    bay.packFuse = 0;
    instantOverchargePack = true;
  } else if (bay.items.length >= PACK_MIN_COUNT) {
    if (bay.packFuse === null) {
      bay.packFuse = PACK_FUSE_SECONDS;
      triggeredFuse = true;
    } else {
      // Adding a 4th parcel extends fuse briefly to reward quick 5-chain!
      bay.packFuse = Math.max(bay.packFuse, 0.32);
    }
  }

  return {
    accepted: true,
    newCount: bay.items.length,
    triggeredFuse,
    instantOverchargePack,
    placePoints,
    nextCombo,
  };
}

export interface PackLaunchScore {
  points: number;
  count: number;
  rainbowCount: number;
  overchargeLabel: string | null;
  nextCombo: number;
}

/**
 * Calculates score when a cargo bay with 3+ parcels auto-packs and launches.
 * Higher combo and 4/5-parcel overcharges dramatically amplify score & visual intensity.
 */
export function calculatePackLaunchScore(
  items: readonly { sourceKind: ParcelColor | 'rainbow' }[],
  currentCombo: number,
  wave: 1 | 2 | 3
): PackLaunchScore {
  const count = items.length;
  const rainbowCount = items.filter((i) => i.sourceKind === 'rainbow').length;
  const nextCombo = currentCombo + 1;

  const baseByCount =
    count >= 5 ? 360 : count === 4 ? 220 : 120;
  const rainbowBonus = rainbowCount * 45;
  const comboMultiplier = 1 + Math.min(nextCombo, 25) * 0.12;
  const waveMultiplier = wave === 3 ? 1.3 : wave === 2 ? 1.15 : 1.0;

  const points = Math.round((baseByCount + rainbowBonus) * comboMultiplier * waveMultiplier);
  const overchargeLabel =
    count >= 5 ? '五星超载特快' : count === 4 ? '四连加速打包' : null;

  return {
    points,
    count,
    rainbowCount,
    overchargeLabel,
    nextCombo,
  };
}

export function calculateBlackholeZapScore(currentCombo: number, wave: 1 | 2 | 3): {
  points: number;
  nextCombo: number;
} {
  const nextCombo = currentCombo + 1;
  const base = 60 + (wave - 1) * 20;
  const points = Math.round(base * (1 + Math.min(nextCombo, 20) * 0.08));
  return { points, nextCombo };
}

export interface BlackholeSuckResult {
  suckedCount: number;
  affectedBays: ParcelColor[];
}

/**
 * When a Black Hole parcel is NOT tapped in time, it erupts and sucks away
 * an entire row of cargo (the bottom/front slot across all 4 cargo bays).
 */
export function applyBlackholeRowSuck(bays: BayState[]): BlackholeSuckResult {
  let suckedCount = 0;
  const affectedBays: ParcelColor[] = [];

  for (const bay of bays) {
    if (bay.items.length > 0) {
      bay.items.shift();
      suckedCount += 1;
      affectedBays.push(bay.color);
      bay.rejectTimer = 0.55;
      if (bay.items.length < PACK_MIN_COUNT) {
        bay.packFuse = null;
      }
    }
  }

  return { suckedCount, affectedBays };
}

/**
 * Selects the next parcel kind using weighted wave probabilities.
 * Keeps opening 7 seconds free of black holes so the player settles in smoothly.
 */
export function pickNextParcelKind(
  elapsedSeconds: number,
  waveConfig: WaveConfig,
  rng: () => number,
  activeBlackholes: number
): ParcelKind {
  const roll = rng();
  const canSpawnBlackhole = elapsedSeconds >= 7 && activeBlackholes < (waveConfig.wave === 3 ? 2 : 1);

  if (canSpawnBlackhole && roll < waveConfig.blackholeChance) {
    return 'blackhole';
  }
  const rainbowThreshold = (canSpawnBlackhole ? waveConfig.blackholeChance : 0) + waveConfig.rainbowChance;
  if (elapsedSeconds >= 4 && roll < rainbowThreshold) {
    return 'rainbow';
  }

  const colors: ParcelColor[] = ['gold', 'coral', 'cyan', 'emerald'];
  const idx = Math.floor(rng() * colors.length) % colors.length;
  return colors[idx];
}

export function getCourierRank(score: number): { title: string; subtitle: string } {
  if (score >= 7500) {
    return { title: '银河特快传奇', subtitle: '全宇宙最耀眼的极速分拣大师' };
  }
  if (score >= 4800) {
    return { title: '超光速王牌', subtitle: '手速与节奏完美同步的星港精英' };
  }
  if (score >= 2600) {
    return { title: '轨道分拣专家', subtitle: '稳定控场，连击如流星雨般流畅' };
  }
  if (score >= 1200) {
    return { title: '星际快递员', subtitle: '稳步起航，星尘航线运转顺利' };
  }
  return { title: '星港见习员', subtitle: '熟悉传送带节奏，下局一定更高分' };
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
