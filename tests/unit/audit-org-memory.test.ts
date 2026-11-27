import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RULE_LINE_BUDGET,
  auditAlwaysOnRuleBudget,
  auditBrandAndRoleTerminology,
  auditPostmortemClassification,
  auditPublishedToolSync,
  runOrgMemoryAudit,
} from '../../scripts/audit-org-memory.mjs'

const REPO_ROOT = path.resolve('.')

describe('audit-org-memory deterministic vs time-sensitive separation (Issue #52 / L-13)', () => {
  it('passes cleanly on 2026-11-27 even with timeSensitive=true', () => {
    const res = runOrgMemoryAudit({
      root: REPO_ROOT,
      docsOnly: true,
      timeSensitive: true,
      now: '2026-11-27T12:00:00Z',
    })
    expect(res.errors).toEqual([])
    expect(
      res.warnings.every((w) => w.includes('gemini-4-argon'))
    ).toBe(true)
  })

  it('emits 7-day advance warning for gemini-4-argon on 2026-11-28 without failing', () => {
    const res = runOrgMemoryAudit({
      root: REPO_ROOT,
      docsOnly: true,
      timeSensitive: true,
      now: '2026-11-28T00:00:00Z',
    })
    expect(res.errors).toEqual([])
    expect(
      res.warnings.some(
        (w) => w.includes('[Pricing Warning]') && w.includes('gemini-4-argon')
      )
    ).toBe(true)
  })

  it('does NOT block deterministic PR checks on 2026-12-01 (timeSensitive=false), while timeSensitive=true fails', () => {
    const deterministic = runOrgMemoryAudit({
      root: REPO_ROOT,
      docsOnly: true,
      timeSensitive: false,
      now: '2026-12-01T00:00:00Z',
    })
    expect(deterministic.errors).toEqual([])
    expect(
      deterministic.warnings.some(
        (w) =>
          w.includes('[Pricing Warning]') &&
          w.includes('gemini-4-argon') &&
          w.includes('2026-11-30')
      )
    ).toBe(true)

    const timeSensitive = runOrgMemoryAudit({
      root: REPO_ROOT,
      docsOnly: true,
      timeSensitive: true,
      now: '2026-12-01T00:00:00Z',
    })
    expect(
      timeSensitive.errors.some(
        (e) => e.includes('gemini-4-argon') && e.includes('2026-11-30')
      )
    ).toBe(true)
  })

  it('does NOT block deterministic PR checks on 2027-01-15 (>14 days stale), while timeSensitive=true fails on both staleness and expired deadlines', () => {
    const deterministic = runOrgMemoryAudit({
      root: REPO_ROOT,
      docsOnly: true,
      timeSensitive: false,
      now: '2027-01-15T00:00:00Z',
    })
    expect(deterministic.errors).toEqual([])
    expect(
      deterministic.warnings.some((w) =>
        w.includes('PRICING_LAST_VERIFIED')
      )
    ).toBe(true)

    const timeSensitive = runOrgMemoryAudit({
      root: REPO_ROOT,
      docsOnly: true,
      timeSensitive: true,
      now: '2027-01-15T00:00:00Z',
    })
    expect(
      timeSensitive.errors.some((e) => e.includes('PRICING_LAST_VERIFIED'))
    ).toBe(true)
    expect(
      timeSensitive.errors.some((e) => e.includes('gemini-4-argon'))
    ).toBe(true)
    expect(
      timeSensitive.errors.some((e) => e.includes('gemini-3-8-flash'))
    ).toBe(true)
  })

  it('enforces always-on rule line budget as a non-blocking soft warning and keeps repo under budget', () => {
    expect(RULE_LINE_BUDGET).toBe(90)
    expect(auditAlwaysOnRuleBudget(REPO_ROOT)).toEqual([])

    const overBudget = auditAlwaysOnRuleBudget(REPO_ROOT, 10)
    expect(overBudget).toHaveLength(2)
    expect(overBudget[0]).toContain('[RuleBudget Warning]')
    expect(overBudget[1]).toContain('[RuleBudget Warning]')
  })

  it('verifies 5-file published tool sync, terminology hygiene, and postmortem tier/evidence tags (L-17, L-18, #56)', () => {
    expect(auditPublishedToolSync(REPO_ROOT)).toEqual([])
    expect(auditBrandAndRoleTerminology(REPO_ROOT)).toEqual([])

    const goodPostmortem =
      '| **L-99** | テスト失敗 | 原因 | `[Tier B: Harness/CLI]` `scripts/audit-org-memory.mjs` に検査追加 |'
    expect(auditPostmortemClassification(goodPostmortem, 'test.md')).toEqual([])

    const missingTierAndPath =
      '| **L-99** | テスト失敗 | 原因 | 次回から気をつけます |'
    const badErrors = auditPostmortemClassification(
      missingTierAndPath,
      'test.md'
    )
    expect(badErrors).toHaveLength(2)
    expect(badErrors[0]).toContain('missing Resolution Tier tag')
    expect(badErrors[1]).toContain('missing concrete repository artifact path')
  })
})
