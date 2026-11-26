import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUND_DURATION_SECONDS,
  applyBlackholeRowSuck,
  applyPlaceParcel,
  calculateBlackholeZapScore,
  calculatePackLaunchScore,
  canAcceptParcel,
  createInitialBays,
  formatShareText,
  getWaveForElapsed,
  loadRecords,
  mergeAndSaveRecords,
  pickNextParcelKind,
} from './rules';

test('wave progression shifts every 30 seconds across 90 second round', () => {
  assert.equal(ROUND_DURATION_SECONDS, 90);
  const w1 = getWaveForElapsed(0);
  const w1End = getWaveForElapsed(29.9);
  const w2 = getWaveForElapsed(30);
  const w3 = getWaveForElapsed(60);

  assert.equal(w1.wave, 1);
  assert.equal(w1End.wave, 1);
  assert.equal(w2.wave, 2);
  assert.equal(w3.wave, 3);

  assert.ok(w2.beltSpeedRatio > w1.beltSpeedRatio);
  assert.ok(w3.beltSpeedRatio > w2.beltSpeedRatio);
  assert.ok(w2.spawnInterval < w1.spawnInterval);
  assert.ok(w3.spawnInterval < w2.spawnInterval);
});

test('color matching accepts same color and rainbow wild, rejects wrong color and blackhole', () => {
  assert.equal(canAcceptParcel('gold', 'gold'), true);
  assert.equal(canAcceptParcel('gold', 'rainbow'), true);
  assert.equal(canAcceptParcel('cyan', 'rainbow'), true);
  assert.equal(canAcceptParcel('gold', 'coral'), false);
  assert.equal(canAcceptParcel('emerald', 'blackhole'), false);
});

test('placing 3+ matching parcels starts auto-pack fuse and 5 triggers instant overcharge', () => {
  const bays = createInitialBays();
  const goldBay = bays[0];

  const r1 = applyPlaceParcel(goldBay, 1, 'gold', 0);
  assert.equal(r1.accepted, true);
  assert.equal(r1.triggeredFuse, false);
  assert.equal(goldBay.packFuse, null);

  const r2 = applyPlaceParcel(goldBay, 2, 'rainbow', r1.nextCombo);
  assert.equal(r2.accepted, true);
  assert.equal(r2.triggeredFuse, false);
  assert.equal(goldBay.items.length, 2);

  const r3 = applyPlaceParcel(goldBay, 3, 'gold', r2.nextCombo);
  assert.equal(r3.accepted, true);
  assert.equal(r3.triggeredFuse, true);
  assert.ok(goldBay.packFuse !== null && goldBay.packFuse > 0);

  // Adding a 4th and 5th parcel overcharges into immediate max pack
  const r4 = applyPlaceParcel(goldBay, 4, 'gold', r3.nextCombo);
  assert.equal(r4.accepted, true);
  assert.equal(r4.instantOverchargePack, false);

  const r5 = applyPlaceParcel(goldBay, 5, 'rainbow', r4.nextCombo);
  assert.equal(r5.accepted, true);
  assert.equal(r5.instantOverchargePack, true);
  assert.equal(goldBay.packFuse, 0);
});

test('wrong color placement resets combo and leaves bay intact', () => {
  const bays = createInitialBays();
  const cyanBay = bays[2];
  const r = applyPlaceParcel(cyanBay, 10, 'coral', 7);
  assert.equal(r.accepted, false);
  assert.equal(r.reason, 'wrong_color');
  assert.equal(r.nextCombo, 0);
  assert.equal(cyanBay.items.length, 0);
});

test('pack launch scoring scales with combo, overcharge count, and wave', () => {
  const pack3Low = calculatePackLaunchScore(
    [{ sourceKind: 'gold' }, { sourceKind: 'gold' }, { sourceKind: 'gold' }],
    1,
    1
  );
  const pack3HighCombo = calculatePackLaunchScore(
    [{ sourceKind: 'gold' }, { sourceKind: 'gold' }, { sourceKind: 'gold' }],
    12,
    1
  );
  const pack4Rainbow = calculatePackLaunchScore(
    [
      { sourceKind: 'gold' },
      { sourceKind: 'gold' },
      { sourceKind: 'rainbow' },
      { sourceKind: 'gold' },
    ],
    12,
    2
  );

  assert.ok(pack3HighCombo.points > pack3Low.points);
  assert.ok(pack4Rainbow.points > pack3HighCombo.points);
  assert.equal(pack4Rainbow.overchargeLabel, '四连加速打包');
});

test('black hole row suck removes one parcel from every non-empty bay and cancels fuse if < 3', () => {
  const bays = createInitialBays();
  applyPlaceParcel(bays[0], 1, 'gold', 0);
  applyPlaceParcel(bays[0], 2, 'gold', 1);
  applyPlaceParcel(bays[0], 3, 'gold', 2); // fuse active
  applyPlaceParcel(bays[1], 4, 'coral', 3);
  // bays[2] empty
  applyPlaceParcel(bays[3], 5, 'emerald', 4);

  const suck = applyBlackholeRowSuck(bays);
  assert.equal(suck.suckedCount, 3);
  assert.deepEqual(suck.affectedBays, ['gold', 'coral', 'emerald']);
  assert.equal(bays[0].items.length, 2);
  assert.equal(bays[0].packFuse, null);
  assert.equal(bays[1].items.length, 0);
  assert.equal(bays[2].items.length, 0);
  assert.equal(bays[3].items.length, 0);
});

test('black hole zap awards wave and combo scaled points and avoids early black hole spawns', () => {
  const w1 = getWaveForElapsed(2);
  // Opening 7 seconds never spawn black holes even when rng returns 0
  const earlyKind = pickNextParcelKind(2, w1, () => 0.0, 0);
  assert.notEqual(earlyKind, 'blackhole');

  const lateKind = pickNextParcelKind(15, w1, () => 0.01, 0);
  assert.equal(lateKind, 'blackhole');

  const zap1 = calculateBlackholeZapScore(0, 1);
  const zap3 = calculateBlackholeZapScore(10, 3);
  assert.ok(zap3.points > zap1.points);
});

test('localStorage records persist and format shareable Chinese report', () => {
  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  const initial = loadRecords(mockStorage);
  assert.equal(initial.bestScore, 0);

  const first = mergeAndSaveRecords(
    initial,
    { score: 3200, maxCombo: 14, packedCount: 9, packedParcels: 29, blackholesCleared: 4 },
    mockStorage
  );
  assert.equal(first.summary.isNewBestScore, true);
  assert.equal(first.records.bestScore, 3200);
  assert.equal(first.records.totalPackedAllTime, 9);

  const reloaded = loadRecords(mockStorage);
  assert.equal(reloaded.bestScore, 3200);
  assert.equal(reloaded.bestMaxCombo, 14);
  assert.equal(reloaded.totalPackedAllTime, 9);

  const shareText = formatShareText(first.summary, reloaded);
  assert.ok(shareText.includes('星尘快递站'));
  assert.ok(shareText.includes('3200'));
  assert.ok(shareText.includes('x14'));
  assert.ok(shareText.includes('9 批'));
});
