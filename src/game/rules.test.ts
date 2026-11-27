import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLACKHOLE_ERUPTION_PENALTY,
  BLACKHOLE_ZAP_POINTS,
  COMBO_MAX_STACK,
  FEVER_DURATION_SECONDS,
  PACK_BONUS_3,
  ROUND_DURATION_SECONDS,
  VIP_ORDER_MULTIPLIER,
  applyBlackholePenalty,
  applyParcelMissPenalty,
  applyPlaceParcel,
  applyVipPackProgress,
  calculateBlackholeZapScore,
  calculatePackLaunchScore,
  calculateSortScore,
  canAcceptParcel,
  createInitialBays,
  createRoundMission,
  createVipOrder,
  formatShareText,
  getNextRankProgress,
  getRainbowChainAdjacentIndices,
  getWaveForElapsed,
  loadRecords,
  mergeAndSaveRecords,
  pickBiasedColor,
  pickNextParcelSpec,
  updateMissionProgress,
} from './rules';

test('wave progression shifts every 30s across 90s round and Wave 1 starts briskly', () => {
  assert.equal(ROUND_DURATION_SECONDS, 90);
  assert.equal(FEVER_DURATION_SECONDS, 8);
  assert.equal(VIP_ORDER_MULTIPLIER, 3);

  const w1 = getWaveForElapsed(0);
  const w2 = getWaveForElapsed(30);
  const w3 = getWaveForElapsed(60);

  assert.equal(w1.wave, 1);
  assert.equal(w2.wave, 2);
  assert.equal(w3.wave, 3);
  assert.ok(w1.spawnInterval <= 0.95);
  assert.ok(w2.beltSpeedRatio > w1.beltSpeedRatio);
  assert.ok(w3.beltSpeedRatio > w2.beltSpeedRatio);
  assert.ok(w2.golden5xChance > 0);
  assert.ok(w3.slowmoChance > 0);
});

test('sort scoring follows 30/60/100 base with combo cap x10, golden 5x, and Fever 2x', () => {
  // Base 30 / 60 / 100 at combo 0
  assert.equal(calculateSortScore(1, 0), 30);
  assert.equal(calculateSortScore(2, 0), 60);
  assert.equal(calculateSortScore(3, 0), 100);

  // Combo formula: base * (1 + 0.1 * min(combo, 10))
  assert.equal(calculateSortScore(1, 5), Math.round(30 * 1.5)); // 45
  assert.equal(calculateSortScore(2, 10), Math.round(60 * 2.0)); // 120
  // Combo capped at x10
  assert.equal(calculateSortScore(3, 15), Math.round(100 * 2.0)); // 200
  assert.equal(COMBO_MAX_STACK, 10);

  // Golden 5x & Fever 2x
  assert.equal(calculateSortScore(2, 0, { isGolden5x: true }), 300);
  assert.equal(calculateSortScore(3, 10, { isGolden5x: true, isFever: true }), 2000);
});

test('placing 1st/2nd/3rd parcel scores correctly, triggers pack bonus +300, VIP x3, and Fever x2', () => {
  const bays = createInitialBays();
  const goldBay = bays[0];

  const r1 = applyPlaceParcel(goldBay, 1, 'gold', 0);
  assert.equal(r1.accepted, true);
  assert.equal(r1.nextCombo, 1);
  assert.equal(r1.placePoints, Math.round(30 * 1.1)); // 33

  const r2 = applyPlaceParcel(goldBay, 2, 'gold', r1.nextCombo);
  assert.equal(r2.accepted, true);
  assert.equal(r2.nextCombo, 2);
  assert.equal(r2.placePoints, Math.round(60 * 1.2)); // 72

  const r3 = applyPlaceParcel(goldBay, 3, 'gold', r2.nextCombo);
  assert.equal(r3.accepted, true);
  assert.equal(r3.nextCombo, 3);
  assert.equal(r3.placePoints, Math.round(100 * 1.3)); // 130
  assert.equal(r3.triggeredFuse, true);

  // Pack bonus +300 standard, x3 VIP, x2 Fever
  const packStd = calculatePackLaunchScore(goldBay.items);
  assert.equal(packStd.points, PACK_BONUS_3);
  assert.equal(packStd.points, 300);

  const packVip = calculatePackLaunchScore(goldBay.items, { isVipMatch: true });
  assert.equal(packVip.points, 900);

  const packVipFever = calculatePackLaunchScore(goldBay.items, { isVipMatch: true, isFever: true });
  assert.equal(packVipFever.points, 1800);
});

test('rainbow parcel into 2-item bay triggers instant rainbow chain explosion on adjacent bays', () => {
  const bays = createInitialBays();
  applyPlaceParcel(bays[1], 1, 'coral', 0);
  applyPlaceParcel(bays[1], 2, 'coral', 1);

  const r3 = applyPlaceParcel(bays[1], 3, 'rainbow', 2);
  assert.equal(r3.accepted, true);
  assert.equal(r3.triggeredRainbowChain, true);
  assert.equal(r3.instantOverchargePack, true);
  assert.equal(bays[1].packFuse, 0);

  assert.deepEqual(getRainbowChainAdjacentIndices(0), [1]);
  assert.deepEqual(getRainbowChainAdjacentIndices(1), [0, 2]);
  assert.deepEqual(getRainbowChainAdjacentIndices(3), [2]);
});

test('combo reaching x10 triggers Fever mode cleanly', () => {
  const bays = createInitialBays();
  const r = applyPlaceParcel(bays[0], 1, 'gold', 9, { isFever: false });
  assert.equal(r.nextCombo, 10);
  assert.equal(r.triggeredFever, true);
  // Already in Fever does not re-trigger
  const r2 = applyPlaceParcel(bays[0], 2, 'gold', 10, { isFever: true });
  assert.equal(r2.triggeredFever, false);
});

test('black hole eruption only breaks combo & deducts 25 pts (floor 0) and NEVER clears cargo bays', () => {
  const bays = createInitialBays();
  applyPlaceParcel(bays[0], 1, 'gold', 0);
  applyPlaceParcel(bays[0], 2, 'gold', 1);
  applyPlaceParcel(bays[2], 3, 'cyan', 2);

  const p1 = applyBlackholePenalty(100);
  assert.equal(BLACKHOLE_ERUPTION_PENALTY, 25);
  assert.equal(p1.nextScore, 75);
  assert.equal(p1.deducted, 25);
  assert.equal(p1.nextCombo, 0);

  // Floored at 0
  const p2 = applyBlackholePenalty(10);
  assert.equal(p2.nextScore, 0);
  assert.equal(p2.deducted, 10);

  // Cargo bays remain completely untouched!
  assert.equal(bays[0].items.length, 2);
  assert.equal(bays[2].items.length, 1);

  // Tapping black hole gives 20 pts
  const zap = calculateBlackholeZapScore(3, false);
  assert.equal(BLACKHOLE_ZAP_POINTS, 20);
  assert.equal(zap.points, 20);
  assert.equal(zap.nextCombo, 4);
});

test('missed parcel deducts 10 pts (floor 0) and resets combo', () => {
  const m1 = applyParcelMissPenalty(50);
  assert.equal(m1.nextScore, 40);
  assert.equal(m1.nextCombo, 0);

  const m2 = applyParcelMissPenalty(4);
  assert.equal(m2.nextScore, 0);
});

test('smart spawn biases toward bays with 2/3 items and Fever floods rainbows', () => {
  const bays = createInitialBays();
  applyPlaceParcel(bays[3], 1, 'emerald', 0);
  applyPlaceParcel(bays[3], 2, 'emerald', 1);

  // rng returning 0.1 triggers the 55% bias branch -> emerald
  const biased = pickBiasedColor(bays, () => 0.1);
  assert.equal(biased, 'emerald');

  // Fever with rng < 0.58 produces rainbow
  const w1 = getWaveForElapsed(10);
  const feverSpec = pickNextParcelSpec(10, w1, bays, true, () => 0.2, 0, false);
  assert.equal(feverSpec.kind, 'rainbow');

  // Slow-mo not accepted directly as bay parcel
  assert.equal(canAcceptParcel('gold', 'slowmo'), false);
});

test('mission progress, VIP order progress, next rank distance, and localStorage records work', () => {
  const mission = createRoundMission(() => 0.0); // pack_3
  assert.equal(mission.type, 'pack');
  const step1 = updateMissionProgress(mission, { packedCount: 2, blackholesCleared: 0, score: 100 });
  assert.equal(step1.newlyCompleted, false);
  assert.equal(mission.current, 2);
  const step2 = updateMissionProgress(mission, { packedCount: 3, blackholesCleared: 0, score: 400 });
  assert.equal(step2.newlyCompleted, true);
  assert.equal(mission.completed, true);

  const vip = createVipOrder(1, () => 0.0);
  const c1 = vip.requirements[0].color;
  const c2 = vip.requirements[1].color;
  const v1 = applyVipPackProgress(vip, c1);
  assert.equal(v1.matched, true);
  assert.equal(v1.orderCompleted, false);
  const v2 = applyVipPackProgress(vip, c2);
  assert.equal(v2.matched, true);
  assert.equal(v2.orderCompleted, true);

  const nextRank = getNextRankProgress(850);
  assert.ok(nextRank !== null);
  assert.equal(nextRank.nextTitle, '星际快递员');
  assert.equal(nextRank.pointsNeeded, 350);
  assert.equal(getNextRankProgress(12000), null);

  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  const initial = loadRecords(mockStorage);
  const saved = mergeAndSaveRecords(
    initial,
    { score: 3200, maxCombo: 10, packedCount: 8, packedParcels: 24, blackholesCleared: 3, missionCompleted: true, missionLabel: mission.label },
    mockStorage
  );
  assert.equal(saved.records.bestScore, 3200);
  const report = formatShareText(saved.summary, saved.records);
  assert.ok(report.includes('3200'));
});
