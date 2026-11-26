import { describe, expect, it } from 'vitest'
import { OWNER, REPO, computeAutonomyReport } from '../../scripts/ops_github.mjs'

describe('ops_github autonomy-report (Issue #54)', () => {
  it('computes self-discovery rate, human wait days, and PR rework rate while excluding untrusted external items', () => {
    const untilIso = '2026-11-24T00:00:00Z'
    const sinceIso = '2026-11-17T00:00:00Z'

    const issues = [
      {
        number: 1,
        state: 'closed',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        labels: [{ name: 'owner:ai' }, { name: 'type:security' }, { name: 'found-by:ai' }],
        created_at: '2026-11-20T00:00:00Z',
        updated_at: '2026-11-21T00:00:00Z',
        closed_at: '2026-11-21T00:00:00Z',
      },
      {
        number: 2,
        state: 'closed',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        labels: [{ name: 'owner:ai' }, { name: 'type:postmortem' }, { name: 'found-by:human' }],
        created_at: '2026-11-21T00:00:00Z',
        updated_at: '2026-11-22T00:00:00Z',
        closed_at: '2026-11-22T00:00:00Z',
      },
      {
        number: 3,
        state: 'open',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        labels: [{ name: 'owner:ai' }, { name: 'type:ops' }],
        created_at: '2026-11-22T00:00:00Z',
        updated_at: '2026-11-22T00:00:00Z',
        closed_at: null,
      },
      {
        number: 4,
        state: 'closed',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        labels: [{ name: 'owner:human' }, { name: 'type:infra' }],
        created_at: '2026-11-18T00:00:00Z',
        updated_at: '2026-11-20T00:00:00Z',
        closed_at: '2026-11-20T00:00:00Z',
      },
      {
        number: 5,
        state: 'open',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        labels: [{ name: 'owner:human' }, { name: 'type:infra' }],
        created_at: '2026-11-19T00:00:00Z',
        updated_at: '2026-11-19T00:00:00Z',
        closed_at: null,
      },
      // Outside window (should not count in created-in-window)
      {
        number: 6,
        state: 'closed',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        labels: [{ name: 'owner:ai' }, { name: 'found-by:ai' }],
        created_at: '2026-11-10T00:00:00Z',
        updated_at: '2026-11-12T00:00:00Z',
        closed_at: '2026-11-12T00:00:00Z',
      },
      // Untrusted external issue (must be excluded)
      {
        number: 99,
        state: 'open',
        author_association: 'NONE',
        user: { login: 'stranger', type: 'User' },
        labels: [{ name: 'found-by:human' }, { name: 'owner:human' }],
        created_at: '2026-11-22T00:00:00Z',
        updated_at: '2026-11-19T00:00:00Z',
        closed_at: null,
      },
    ]

    const pulls = [
      {
        number: 10,
        title: 'feat: initial feature',
        state: 'closed',
        merged_at: '2026-11-20T06:00:00Z',
        created_at: '2026-11-20T00:00:00Z',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        head: { ref: 'feat/initial', repo: { full_name: `${OWNER}/${REPO}` } },
      },
      {
        number: 11,
        title: 'fix(pii): boundary fix',
        state: 'closed',
        merged_at: '2026-11-21T06:00:00Z',
        created_at: '2026-11-21T00:00:00Z',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        head: { ref: 'fix/boundary', repo: { full_name: `${OWNER}/${REPO}` } },
      },
      {
        number: 12,
        title: 'release: superseded PR',
        state: 'closed',
        merged_at: null,
        created_at: '2026-11-22T00:00:00Z',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        head: { ref: 'release/old', repo: { full_name: `${OWNER}/${REPO}` } },
      },
      {
        number: 13,
        title: 'feat: open PR',
        state: 'open',
        merged_at: null,
        created_at: '2026-11-23T00:00:00Z',
        author_association: 'OWNER',
        user: { login: OWNER, type: 'User' },
        head: { ref: 'feat/open', repo: { full_name: `${OWNER}/${REPO}` } },
      },
      // External fork PR (must be excluded)
      {
        number: 90,
        title: 'fix: untrusted fork',
        state: 'closed',
        merged_at: null,
        created_at: '2026-11-23T00:00:00Z',
        author_association: 'CONTRIBUTOR',
        user: { login: 'attacker', type: 'User' },
        head: { ref: 'fix/evil', repo: { full_name: `attacker/${REPO}` } },
      },
    ]

    const report = computeAutonomyReport({
      issues,
      pulls,
      sinceIso,
      untilIso,
      days: 7,
    })

    expect(report.issues.total_trusted_created).toBe(5)
    expect(report.issues.found_by_ai).toBe(1)
    expect(report.issues.found_by_human).toBe(1)
    expect(report.issues.unclassified_defect_or_improvement).toBe(1)
    expect(report.issues.self_discovery_rate).toBe(0.5)
    expect(report.issues.owner_human_opened).toBe(2)
    expect(report.issues.owner_human_closed).toBe(1)
    expect(report.issues.human_wait_days).toEqual({
      sample_count: 1,
      avg_days: 2,
      max_days: 2,
      open_stagnant_over_3d: 1,
    })

    expect(report.pull_requests.total_trusted_created).toBe(4)
    expect(report.pull_requests.merged_count).toBe(2)
    expect(report.pull_requests.closed_unmerged_count).toBe(1)
    expect(report.pull_requests.open_count).toBe(1)
    expect(report.pull_requests.fix_pr_count).toBe(1)
    expect(report.pull_requests.rework_rate).toBe(0.5)
  })

  it('returns null rates when denominators are zero', () => {
    const report = computeAutonomyReport({
      issues: [],
      pulls: [],
      sinceIso: '2026-11-17T00:00:00Z',
      untilIso: '2026-11-24T00:00:00Z',
      days: 7,
    })
    expect(report.issues.self_discovery_rate).toBeNull()
    expect(report.issues.human_wait_days.avg_days).toBeNull()
    expect(report.pull_requests.rework_rate).toBeNull()
  })
})
