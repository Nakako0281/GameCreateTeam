import { describe, it, expect } from 'vitest';
import {
  MIDNIGHT_DRAFT_DECK,
  evaluateDraftSort,
  getPoemDefenseRankInfo,
} from '../logic';

describe('深夜3時の黒歴史ポエム防衛 logic', () => {
  it('rewards shredding a dark history poem', () => {
    const poemCard = MIDNIGHT_DRAFT_DECK.find((c) => c.category === 'poem')!;
    const res = evaluateDraftSort('SHRED', poemCard, 0.8, 2);
    expect(res.isCorrect).toBe(true);
    expect(res.scoreDelta).toBeGreaterThan(700);
  });

  it('rewards shredding a trap recipient message with extra trap bonus', () => {
    const trapCard = MIDNIGHT_DRAFT_DECK.find((c) => c.category === 'trap_recipient')!;
    const res = evaluateDraftSort('SHRED', trapCard, 0.9, 1);
    expect(res.isCorrect).toBe(true);
    expect(res.headline).toContain('宛先トラップ');
    expect(res.scoreDelta).toBeGreaterThan(1000);
  });

  it('triggers social death when sending a poem or trap recipient card', () => {
    const trapCard = MIDNIGHT_DRAFT_DECK.find((c) => c.category === 'trap_recipient')!;
    const res = evaluateDraftSort('SEND', trapCard, 0.5, 3);
    expect(res.isCorrect).toBe(false);
    expect(res.failureReason).toContain(trapCard.recipient);
    expect(res.leakedReply.length).toBeGreaterThan(0);
  });

  it('rewards sending a normal message', () => {
    const normalCard = MIDNIGHT_DRAFT_DECK.find((c) => c.category === 'normal')!;
    const res = evaluateDraftSort('SEND', normalCard, 0.7, 0);
    expect(res.isCorrect).toBe(true);
    expect(res.scoreDelta).toBeGreaterThan(500);
  });

  it('returns rank S for flawless clear and rank D for immediate leak', () => {
    const rankS = getPoemDefenseRankInfo(11000, 7, true);
    expect(rankS.rank).toBe('S');
    expect(rankS.title).toContain('黒歴史守護神');

    const rankD = getPoemDefenseRankInfo(0, 0, false);
    expect(rankD.rank).toBe('D');
    expect(rankD.title).toContain('デジタルタトゥー彫り師');
  });
});
