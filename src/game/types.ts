export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type ParcelColor = 'gold' | 'coral' | 'cyan' | 'emerald';

export type ParcelKind = ParcelColor | 'rainbow' | 'blackhole';

export type ParcelShape = 'star' | 'diamond' | 'hexagon' | 'triangle' | 'prism' | 'vortex';

export interface BaySpec {
  id: ParcelColor;
  name: string;
  shortLabel: string;
  shape: ParcelShape;
  hotkey: string;
  primary: string;
  bright: string;
  deep: string;
  glow: string;
}

export const BAY_SPECS: readonly BaySpec[] = [
  {
    id: 'gold',
    name: '星芒舱',
    shortLabel: '星芒',
    shape: 'star',
    hotkey: '1',
    primary: '#FFB703',
    bright: '#FFE066',
    deep: '#5C3B00',
    glow: 'rgba(255, 183, 3, 0.52)',
  },
  {
    id: 'coral',
    name: '绯晶舱',
    shortLabel: '绯晶',
    shape: 'diamond',
    hotkey: '2',
    primary: '#FF4D6D',
    bright: '#FF8FA3',
    deep: '#5E0E24',
    glow: 'rgba(255, 77, 109, 0.52)',
  },
  {
    id: 'cyan',
    name: '极光舱',
    shortLabel: '极光',
    shape: 'hexagon',
    hotkey: '3',
    primary: '#00D9FF',
    bright: '#7DF0FF',
    deep: '#004258',
    glow: 'rgba(0, 217, 255, 0.52)',
  },
  {
    id: 'emerald',
    name: '翡翠舱',
    shortLabel: '翡翠',
    shape: 'triangle',
    hotkey: '4',
    primary: '#2CEAA3',
    bright: '#84FFD0',
    deep: '#064B34',
    glow: 'rgba(44, 234, 163, 0.52)',
  },
] as const;

export const BAY_SPEC_MAP: Record<ParcelColor, BaySpec> = {
  gold: BAY_SPECS[0],
  coral: BAY_SPECS[1],
  cyan: BAY_SPECS[2],
  emerald: BAY_SPECS[3],
};

export interface WaveConfig {
  wave: 1 | 2 | 3;
  name: string;
  speedTier: string;
  /** Fraction of belt width traversed per second */
  beltSpeedRatio: number;
  /** Seconds between parcel spawns */
  spawnInterval: number;
  /** Probability of rainbow parcel */
  rainbowChance: number;
  /** Probability of black hole parcel */
  blackholeChance: number;
  /** Accent hex color for conveyor rails */
  railColor: string;
}

export interface BaySlotItem {
  id: number;
  sourceKind: ParcelColor | 'rainbow';
  /** 0..1 pop-in animation progress */
  pop: number;
}

export interface BayState {
  color: ParcelColor;
  items: BaySlotItem[];
  /** When items.length >= 3, counts down to 0 before auto-pack launch */
  packFuse: number | null;
  /** Visual feedback timers */
  flashTimer: number;
  rejectTimer: number;
  launchPulse: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  score: number;
  combo: number;
  maxCombo: number;
  packedCount: number;
  packedParcels: number;
  blackholesCleared: number;
  timeLeft: number;
  duration: number;
  wave: 1 | 2 | 3;
  waveName: string;
  waveSpeedTier: string;
  waveProgress: number;
  selectedParcelId: number | null;
}

export interface StoredRecords {
  bestScore: number;
  bestMaxCombo: number;
  totalPackedAllTime: number;
  gamesPlayed: number;
}

export interface RunSummary {
  score: number;
  maxCombo: number;
  packedCount: number;
  packedParcels: number;
  blackholesCleared: number;
  isNewBestScore: boolean;
  isNewBestCombo: boolean;
  rankTitle: string;
  rankSubtitle: string;
}
