import { describe, expect, it } from 'vitest'
import {
  evaluateBranchSync,
  validateCreatePrBranchGuard,
} from '../../scripts/ops_github.mjs'

describe('ops_github branch sync & create-pr governance guard (Layer 2)', () => {
  it('classifies branch sync states and fails closed when compare data is missing', () => {
    expect(
      evaluateBranchSync({ status: 'behind', ahead_by: 0, behind_by: 12 })
    ).toEqual({
      status: 'behind',
      main_ahead_by: 0,
      dev_ahead_by: 12,
      needs_escalation: false,
      warning: null,
    })

    const diverged = evaluateBranchSync({
      status: 'diverged',
      ahead_by: 2,
      behind_by: 24,
    })
    expect(diverged.needs_escalation).toBe(true)
    expect(diverged.main_ahead_by).toBe(2)
    expect(diverged.dev_ahead_by).toBe(24)
    expect(diverged.warning).toContain('ahead of origin/dev by 2 commit(s)')

    const unknown = evaluateBranchSync(null)
    expect(unknown.needs_escalation).toBe(true)
    expect(unknown.status).toBe('unknown')
  })

  it('enforces dev-only release PRs to main unless explicit exception reason is given', () => {
    const cleanSync = {
      status: 'behind',
      main_ahead_by: 0,
      dev_ahead_by: 10,
      needs_escalation: false,
      warning: null,
    }
    expect(
      validateCreatePrBranchGuard({
        head: 'dev',
        base: 'main',
        branchSync: cleanSync,
      })
    ).toEqual({ allowed: true, override_used: false, reason: null })

    const nonDevHead = validateCreatePrBranchGuard({
      head: 'release/temotobox-v0.2-launch',
      base: 'main',
      branchSync: cleanSync,
    })
    expect(nonDevHead.allowed).toBe(false)
    expect(nonDevHead.reason).toContain('headは "dev" である必要があります')

    const aheadSync = {
      status: 'diverged',
      main_ahead_by: 2,
      dev_ahead_by: 24,
      needs_escalation: true,
      warning: 'origin/main is ahead of origin/dev by 2 commit(s)',
    }
    expect(
      validateCreatePrBranchGuard({
        head: 'dev',
        base: 'main',
        branchSync: aheadSync,
      }).allowed
    ).toBe(false)

    expect(
      validateCreatePrBranchGuard({
        head: 'dev',
        base: 'main',
        branchSync: aheadSync,
        allowException: true,
        exceptionReason: 'ok',
      }).allowed
    ).toBe(false)

    const overridden = validateCreatePrBranchGuard({
      head: 'release/emergency',
      base: 'main',
      branchSync: aheadSync,
      allowException: true,
      exceptionReason: 'Human explicitly approved emergency release PR',
    })
    expect(overridden.allowed).toBe(true)
    expect(overridden.override_used).toBe(true)
  })

  it('blocks chained PRs to dev containing unmerged main commits while allowing dedicated sync branches', () => {
    expect(
      validateCreatePrBranchGuard({
        head: 'feat/pii-benchmark',
        base: 'dev',
        headContainsUnmergedMain: false,
      }).allowed
    ).toBe(true)

    const chained = validateCreatePrBranchGuard({
      head: 'feat/pii-benchmark',
      base: 'dev',
      headContainsUnmergedMain: true,
    })
    expect(chained.allowed).toBe(false)
    expect(chained.reason).toContain('同期専用ブランチ')

    expect(
      validateCreatePrBranchGuard({
        head: 'chore/sync-main-to-dev',
        base: 'dev',
        headContainsUnmergedMain: true,
      }).allowed
    ).toBe(true)
  })
})
