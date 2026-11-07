import { describe, it, expect } from 'vitest';
import {
  PROJECTILE_POOL,
  JUST_PARRY_MIN,
  advanceProjectileProgress,
  evaluatePlayerAction,
  evaluateTimeoutAtPlayer,
  getTeijiRankInfo,
} from '../logic';

describe('17:59 定時退社パリィ！ logic', () => {
  it('advances projectile progress and clamps at 100', () => {
    const normal = PROJECTILE_POOL[0]; // hazard_normal
    const p1 = advanceProjectileProgress(0, normal, 0.5, 1);
    expect(p1).toBeGreaterThan(0);
    expect(p1).toBeLessThan(100);

    const pMax = advanceProjectileProgress(95, normal, 1.0, 1);
    expect(pMax).toBe(100);
  });

  it('triggers JUST_PARRY when parrying a hazard inside sweet spot', () => {
    const hazard = PROJECTILE_POOL[0];
    const res = evaluatePlayerAction('PARRY', hazard, JUST_PARRY_MIN + 2, 2);
    expect(res.outcome).toBe('JUST_PARRY');
    expect(res.scoreDelta).toBeGreaterThan(1000);
    expect(res.hpDelta).toBe(0);
  });

  it('penalizes parrying a safe_bonus projectile', () => {
    const bonus = PROJECTILE_POOL.find((p) => p.kind === 'safe_bonus')!;
    const res = evaluatePlayerAction('PARRY', bonus, JUST_PARRY_MIN + 2, 1);
    expect(res.outcome).toBe('WRONG_PARRY_BONUS');
    expect(res.hpDelta).toBe(-1);
  });

  it('rewards bowing to a safe_bonus projectile', () => {
    const bonus = PROJECTILE_POOL.find((p) => p.kind === 'safe_bonus')!;
    const res = evaluatePlayerAction('BOW', bonus, 80, 1);
    expect(res.outcome).toBe('SAFE_RECEIVED');
    expect(res.scoreDelta).toBeGreaterThan(0);
    expect(res.hpDelta).toBe(0);
  });

  it('evaluates timeout correctly for hazard vs bonus', () => {
    const hazard = PROJECTILE_POOL[0];
    const bonus = PROJECTILE_POOL.find((p) => p.kind === 'safe_bonus')!;
    expect(evaluateTimeoutAtPlayer(hazard, 0).hpDelta).toBe(-1);
    expect(evaluateTimeoutAtPlayer(bonus, 0).hpDelta).toBe(0);
  });

  it('returns rank S for cleared high score and rank D for immediate defeat', () => {
    const rankS = getTeijiRankInfo(9200, true, 6, 0);
    expect(rankS.rank).toBe('S');
    expect(rankS.title).toContain('定時退社神');

    const rankD = getTeijiRankInfo(200, false, 0, 480);
    expect(rankD.rank).toBe('D');
    expect(rankD.title).toContain('サンドバッグ');
  });
});
