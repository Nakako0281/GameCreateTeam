import { describe, it, expect } from 'vitest';
import {
  INGREDIENT_CATALOG,
  PERFECT_CENTER_THRESHOLD,
  evaluateIngredientDrop,
  getBurgerRankInfo,
} from '../logic';

describe('注文の多すぎる違法建築ハンバーガー logic', () => {
  it('triggers PERFECT center lock and halves existing tilt when dropped near center', () => {
    const patty = INGREDIENT_CATALOG[0];
    const res = evaluateIngredientDrop(PERFECT_CENTER_THRESHOLD - 2, patty, 16, 3, 1);
    expect(res.collapsed).toBe(false);
    expect(res.isPerfectCenter).toBe(true);
    expect(res.nextTiltDeg).toBeLessThan(10);
    expect(res.scoreDelta).toBeGreaterThan(1500);
  });

  it('triggers collapse when tilt exceeds MAX_SAFE_TILT_DEG', () => {
    const lobster = INGREDIENT_CATALOG.find((i) => i.id === 'lobster')!;
    const res = evaluateIngredientDrop(55, lobster, 20, 5, 0);
    expect(res.collapsed).toBe(true);
    expect(res.collapseReason).toContain(lobster.name);
  });

  it('detects counterweight save when placed on opposite side of serious tilt', () => {
    const wagyu = INGREDIENT_CATALOG.find((i) => i.id === 'wagyu')!;
    const res = evaluateIngredientDrop(-20, wagyu, 18, 4, 0);
    expect(res.collapsed).toBe(false);
    expect(res.isCounterweightSave).toBe(true);
    expect(res.nextTiltDeg).toBeLessThan(18);
  });

  it('awards Rank S for tall safe delivery and Rank C for timid 2-layer delivery', () => {
    const rankS = getBurgerRankInfo(12000, 10, 95, true);
    expect(rankS.rank).toBe('S');
    expect(rankS.title).toContain('バベルの肉塊');

    const rankC = getBurgerRankInfo(1500, 2, 12, true);
    expect(rankC.rank).toBe('C');
    expect(rankC.title).toContain('実質マカロン');
  });
});
