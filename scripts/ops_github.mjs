#!/usr/bin/env node
/**
 * GitHub Project & Autonomous Ops CLI for AutoGrowth Studio
 *
 * Git Credential Manager (または環境変数 GITHUB_TOKEN) の認証情報を利用して、
 * Milestone・Label・Issue（owner:human / owner:ai）・PR（作成/更新まで、マージは人間専権）を管理する。
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const OWNER = 'Nakako0281'
const REPO = 'GameCreateTeam'
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`

const STANDARD_LABELS = [
  {
    name: 'owner:ai',
    color: '1d76db',
    description: 'AI自律チームが担当するタスク',
  },
  {
    name: 'owner:human',
    color: 'd93f0b',
    description: '従業員兼最終責任者（人間）の操作・確認・決裁待ちタスク',
  },
  {
    name: 'type:tool',
    color: '0e8a16',
    description: '新規ブラウザツールの企画・実装・改善',
  },
  {
    name: 'type:infra',
    color: '5319e7',
    description: 'ドメイン・Cloudflare・GA4・GSC・AdSense・CI環境構築',
  },
  {
    name: 'type:seo-growth',
    color: '0075ca',
    description: 'SEO・LLMO・構造化データ・CTR・コンテンツ改善',
  },
  {
    name: 'type:promotion',
    color: 'fbca04',
    description: 'Zenn・Qiita・X等の外部集客・被リンク施策',
  },
  {
    name: 'type:security',
    color: 'b60205',
    description: 'ゼロ送信・CSP・OSSライセンス・脆弱性・法務対応',
  },
  {
    name: 'type:postmortem',
    color: 'e99695',
    description: '失敗・審査落ち・指摘の記録と機械チェック強化',
  },
  {
    name: 'type:retrospective',
    color: 'c2e0c6',
    description: '週次振り返り・自己進化レポート',
  },
  {
    name: 'type:ops',
    color: 'bfdadc',
    description: '日次定例・ドキュメント/台帳メンテナンス',
  },
  {
    name: 'status:ready',
    color: 'c5def5',
    description: '着手可能（前提条件クリア）',
  },
  {
    name: 'status:in-progress',
    color: '0052cc',
    description: 'AIが現在作業中',
  },
  {
    name: 'status:blocked-by-human',
    color: 'f9d0c4',
    description: '人間タスク完了または判断待ちでブロック中',
  },
  {
    name: 'status:review',
    color: 'fef2c0',
    description: 'PR提出済み・最終責任者レビュー待ち',
  },
  {
    name: 'status:done',
    color: '0e8a16',
    description: '完了済み',
  },
  {
    name: 'priority:p0',
    color: 'b60205',
    description: '最優先（即時対応）',
  },
  {
    name: 'priority:p1',
    color: 'd93f0b',
    description: '高優先（直近スプリント）',
  },
  {
    name: 'priority:p2',
    color: '0075ca',
    description: '通常優先（計画順）',
  },
]

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN
  }
  const res = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf-8',
  })
  if (res.status === 0 && res.stdout) {
    const match = res.stdout.match(/^password=(.+)$/m)
    if (match) {
      return match[1].trim()
    }
  }
  throw new Error('GitHub認証トークンを取得できませんでした。')
}

function readContentOrText(arg) {
  if (!arg) return ''
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
    return fs.readFileSync(arg, 'utf-8')
  }
  return arg
}

function parseArgs(rawArgs) {
  const positional = []
  const flags = {}
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = rawArgs[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

function splitCsv(val) {
  if (!val || typeof val !== 'string') return []
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function githubRequest(path, method = 'GET', body = undefined) {
  const token = getGitHubToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'AutoGrowthStudio-Ops',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`GitHub API Error (${res.status} ${method} ${path}): ${errText}`)
  }
  if (res.status === 204) return null
  return res.json()
}

async function githubTextRequest(path) {
  const token = getGitHubToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AutoGrowthStudio-Ops',
    },
  })
  if (!res.ok) {
    return ''
  }
  return res.text()
}

async function githubGraphql(query, variables = {}) {
  const token = getGitHubToken()
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'AutoGrowthStudio-Ops',
    },
    body: JSON.stringify({ query, variables }),
  })
  const payload = await res.json()
  if (!res.ok || (payload.errors && payload.errors.length > 0)) {
    throw new Error(
      `GitHub GraphQL Error: ${JSON.stringify(payload.errors || payload)}`
    )
  }
  return payload.data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const PASS_CONCLUSIONS = new Set(['success', 'skipped', 'neutral'])

function getExpectedPushedHeadSha(headRef) {
  try {
    const branchRes = spawnSync('git', ['branch', '--show-current'], {
      encoding: 'utf-8',
    })
    if (branchRes.status !== 0 || branchRes.stdout.trim() !== headRef) {
      return null
    }
    const localRes = spawnSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf-8',
    })
    const remoteRes = spawnSync('git', ['rev-parse', `origin/${headRef}`], {
      encoding: 'utf-8',
    })
    if (localRes.status !== 0 || remoteRes.status !== 0) return null
    const localSha = localRes.stdout.trim()
    const remoteSha = remoteRes.stdout.trim()
    if (localSha && localSha === remoteSha) {
      return localSha
    }
  } catch {
    // git参照不可時はスキップ
  }
  return null
}

async function waitAndVerifyPrCi(prNumber, timeoutSec = 600) {
  if (!prNumber) throw new Error('PR番号を指定してください')
  let pr = await githubRequest(`/pulls/${prNumber}`)
  if (pr.state !== 'open') {
    throw new Error(
      `PR #${pr.number} は既に ${pr.state}（merged=${Boolean(pr.merged)}）のためCI検証対象外です。最新mainから新ブランチ・新PRを作成してください。`
    )
  }
  const expectedSha = pr.head?.ref ? getExpectedPushedHeadSha(pr.head.ref) : null
  const syncDeadline = Date.now() + 30000
  while (expectedSha && pr.head?.sha !== expectedSha && Date.now() < syncDeadline) {
    await sleep(2000)
    pr = await githubRequest(`/pulls/${prNumber}`)
  }
  if (expectedSha && pr.head?.sha !== expectedSha) {
    throw new Error(
      `PR #${pr.number} の head.sha (${pr.head?.sha}) が最新Push済みコミット (${expectedSha}) と一致しません。CI誤判定を防ぐため停止しました。`
    )
  }
  const headSha = pr.head?.sha
  if (!headSha) throw new Error(`PR #${prNumber} の head.sha が取得できません`)

  const deadline = Date.now() + timeoutSec * 1000
  const appearDeadline = Date.now() + Math.min(60, timeoutSec) * 1000

  let latestRuns = []
  let latestCheckRuns = []

  while (true) {
    const [runsRes, checksRes] = await Promise.all([
      githubRequest(`/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=30`),
      githubRequest(`/commits/${encodeURIComponent(headSha)}/check-runs?per_page=50`),
    ])

    latestRuns = runsRes.workflow_runs || []
    latestCheckRuns = checksRes.check_runs || []

    const hasAny = latestRuns.length > 0 || latestCheckRuns.length > 0
    const allRunsCompleted =
      latestRuns.length > 0 && latestRuns.every((r) => r.status === 'completed')
    const allChecksCompleted =
      latestCheckRuns.length === 0 ||
      latestCheckRuns.every((c) => c.status === 'completed')

    if (hasAny && allRunsCompleted && allChecksCompleted) {
      break
    }

    if (!hasAny && Date.now() >= appearDeadline) {
      throw new Error(
        `CIワークフローが60秒以内に開始されませんでした (PR #${prNumber}, sha=${headSha})`
      )
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `CI完了待機がタイムアウトしました (${timeoutSec}秒, PR #${prNumber}, sha=${headSha})`
      )
    }

    await sleep(10000)
  }

  const failedRuns = latestRuns.filter(
    (r) => !PASS_CONCLUSIONS.has(r.conclusion || '')
  )
  const failedChecks = latestCheckRuns.filter(
    (c) => !PASS_CONCLUSIONS.has(c.conclusion || '')
  )

  const failureDetails = []
  for (const run of failedRuns) {
    const jobsRes = await githubRequest(
      `/actions/runs/${run.id}/jobs?per_page=50`
    )
    const badJobs = (jobsRes.jobs || []).filter(
      (j) => !PASS_CONCLUSIONS.has(j.conclusion || '')
    )
    for (const job of badJobs) {
      const failedSteps = (job.steps || [])
        .filter((s) => !PASS_CONCLUSIONS.has(s.conclusion || ''))
        .map((s) => `${s.number}:${s.name}(${s.conclusion})`)
      const rawLog = await githubTextRequest(`/actions/jobs/${job.id}/logs`)
      failureDetails.push({
        run_id: run.id,
        workflow: run.name,
        run_url: run.html_url,
        job: job.name,
        conclusion: job.conclusion,
        failed_steps: failedSteps,
        log_tail: rawLog ? rawLog.slice(-2500) : '',
      })
    }
  }

  const result = {
    pr_number: pr.number,
    pr_url: pr.html_url,
    draft: pr.draft,
    head_ref: pr.head?.ref,
    head_sha: headSha,
    all_passed: failedRuns.length === 0 && failedChecks.length === 0,
    workflow_runs: latestRuns.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      html_url: r.html_url,
    })),
    check_runs: latestCheckRuns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      html_url: c.html_url,
    })),
    failure_details: failureDetails,
  }

  return { pr, result }
}

function formatMilestone(m) {
  const total = (m.open_issues || 0) + (m.closed_issues || 0)
  const progress =
    total > 0 ? Math.round(((m.closed_issues || 0) / total) * 100) : 0
  return {
    number: m.number,
    title: m.title,
    state: m.state,
    description: m.description || '',
    open_issues: m.open_issues,
    closed_issues: m.closed_issues,
    progress_percent: progress,
    due_on: m.due_on,
    html_url: m.html_url,
  }
}

function formatIssueSummary(i) {
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    labels: (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
    milestone: i.milestone
      ? { number: i.milestone.number, title: i.milestone.title }
      : null,
    created_at: i.created_at,
    updated_at: i.updated_at,
    closed_at: i.closed_at || null,
    html_url: i.html_url,
  }
}

function hasLabel(issue, labelName) {
  return (issue.labels || []).some(
    (l) => (typeof l === 'string' ? l : l.name) === labelName
  )
}

async function main() {
  const [, , command, ...rawArgs] = process.argv
  const { positional, flags } = parseArgs(rawArgs)

  switch (command) {
    case 'status':
    case 'dashboard': {
      const sevenDaysAgoIso = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString()

      const [milestones, openRaw, closedHumanRaw, pulls] = await Promise.all([
        githubRequest('/milestones?state=open&per_page=20'),
        githubRequest('/issues?state=open&per_page=100'),
        githubRequest(
          `/issues?state=closed&labels=owner:human&since=${encodeURIComponent(sevenDaysAgoIso)}&per_page=30`
        ),
        githubRequest('/pulls?state=open&per_page=20'),
      ])

      const openIssues = openRaw.filter((i) => !i.pull_request)
      const humanOpen = openIssues.filter((i) => hasLabel(i, 'owner:human'))
      const aiOpen = openIssues.filter((i) => hasLabel(i, 'owner:ai'))
      const recentlyClosedHuman = closedHumanRaw.filter(
        (i) =>
          !i.pull_request &&
          i.closed_at &&
          new Date(i.closed_at).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000
      )

      console.log(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            summary: {
              open_milestones: milestones.length,
              open_issues_total: openIssues.length,
              open_human_issues: humanOpen.length,
              open_ai_issues: aiOpen.length,
              recently_closed_human_issues_7d: recentlyClosedHuman.length,
              open_prs: pulls.length,
            },
            milestones: milestones.map(formatMilestone),
            open_human_issues: humanOpen.map(formatIssueSummary),
            open_ai_issues: aiOpen.map(formatIssueSummary),
            recently_closed_human_issues: recentlyClosedHuman.map(
              formatIssueSummary
            ),
            all_open_issues: openIssues.map(formatIssueSummary),
            open_pull_requests: pulls.map((p) => ({
              number: p.number,
              title: p.title,
              head: p.head?.ref,
              base: p.base?.ref,
              draft: p.draft,
              html_url: p.html_url,
            })),
          },
          null,
          2
        )
      )
      break
    }

    case 'ensure-labels': {
      const existing = await githubRequest('/labels?per_page=100')
      const existingMap = new Map(existing.map((l) => [l.name, l]))
      const results = []

      for (const label of STANDARD_LABELS) {
        if (existingMap.has(label.name)) {
          await githubRequest(
            `/labels/${encodeURIComponent(label.name)}`,
            'PATCH',
            {
              new_name: label.name,
              color: label.color,
              description: label.description,
            }
          )
          results.push({ name: label.name, action: 'updated' })
        } else {
          await githubRequest('/labels', 'POST', label)
          results.push({ name: label.name, action: 'created' })
        }
      }
      console.log(JSON.stringify({ ensured_labels: results }, null, 2))
      break
    }

    case 'list-milestones': {
      const state = positional[0] || flags.state || 'open'
      const milestones = await githubRequest(
        `/milestones?state=${encodeURIComponent(state)}&per_page=50`
      )
      console.log(JSON.stringify(milestones.map(formatMilestone), null, 2))
      break
    }

    case 'create-milestone': {
      const [title, descriptionArg, dueOnArg] = positional
      if (!title) throw new Error('Milestoneタイトルを指定してください')
      const description = readContentOrText(
        descriptionArg || flags.description || ''
      )
      const dueOn = dueOnArg || flags['due-on'] || undefined
      const payload = { title, description }
      if (dueOn) payload.due_on = dueOn

      const created = await githubRequest('/milestones', 'POST', payload)
      console.log(JSON.stringify(formatMilestone(created), null, 2))
      break
    }

    case 'update-milestone': {
      const [num] = positional
      if (!num) throw new Error('Milestone番号を指定してください')
      const payload = {}
      if (flags.title) payload.title = flags.title
      if (flags.description !== undefined) {
        payload.description = readContentOrText(flags.description)
      }
      if (flags.state) payload.state = flags.state
      if (flags['due-on']) payload.due_on = flags['due-on']

      const updated = await githubRequest(`/milestones/${num}`, 'PATCH', payload)
      console.log(JSON.stringify(formatMilestone(updated), null, 2))
      break
    }

    case 'list-issues': {
      const state = flags.state || 'open'
      const params = new URLSearchParams({
        state,
        per_page: '50',
      })
      if (flags.milestone) params.set('milestone', String(flags.milestone))
      if (flags.labels) params.set('labels', String(flags.labels))

      const issues = await githubRequest(`/issues?${params.toString()}`)
      const onlyIssues = issues.filter((i) => !i.pull_request)
      console.log(
        JSON.stringify(
          onlyIssues.map((i) => ({
            ...formatIssueSummary(i),
            body: i.body,
          })),
          null,
          2
        )
      )
      break
    }

    case 'get-issue': {
      const num = positional[0]
      if (!num) throw new Error('Issue番号を指定してください')
      const [issue, comments] = await Promise.all([
        githubRequest(`/issues/${num}`),
        githubRequest(`/issues/${num}/comments?per_page=100`),
      ])
      console.log(
        JSON.stringify(
          {
            ...formatIssueSummary(issue),
            body: issue.body,
            comments: comments.map((c) => ({
              id: c.id,
              user: c.user?.login,
              created_at: c.created_at,
              body: c.body,
            })),
          },
          null,
          2
        )
      )
      break
    }

    case 'create-issue': {
      const [title, bodyArg] = positional
      if (!title) throw new Error('タイトルを指定してください')
      const body = readContentOrText(bodyArg || flags.body || '')
      const labels = flags.labels ? splitCsv(flags.labels) : ['owner:ai']
      const payload = { title, body, labels }
      if (flags.milestone) {
        payload.milestone = Number(flags.milestone)
      }
      const created = await githubRequest('/issues', 'POST', payload)
      console.log(JSON.stringify(formatIssueSummary(created), null, 2))
      break
    }

    case 'update-issue': {
      const [num] = positional
      if (!num) throw new Error('Issue番号を指定してください')
      const payload = {}
      if (flags.title) payload.title = flags.title
      if (flags.body !== undefined) {
        payload.body = readContentOrText(flags.body)
      }
      if (flags.state) payload.state = flags.state
      if (flags.milestone !== undefined) {
        payload.milestone =
          flags.milestone === 'null' || flags.milestone === 'none'
            ? null
            : Number(flags.milestone)
      }

      if (flags.labels !== undefined) {
        payload.labels = splitCsv(flags.labels)
      } else if (flags['add-labels'] || flags['remove-labels']) {
        const current = await githubRequest(`/issues/${num}`)
        const labelSet = new Set(
          (current.labels || []).map((l) =>
            typeof l === 'string' ? l : l.name
          )
        )
        for (const toAdd of splitCsv(flags['add-labels'])) {
          labelSet.add(toAdd)
        }
        for (const toRemove of splitCsv(flags['remove-labels'])) {
          labelSet.delete(toRemove)
        }
        payload.labels = Array.from(labelSet)
      }

      const updated = await githubRequest(`/issues/${num}`, 'PATCH', payload)
      console.log(JSON.stringify(formatIssueSummary(updated), null, 2))
      break
    }

    case 'comment-issue': {
      const [num, bodyArg] = positional
      if (!num || (!bodyArg && !flags.body)) {
        throw new Error(
          'Issue番号とコメント内容（またはファイルパス）を指定してください'
        )
      }
      const body = readContentOrText(bodyArg || flags.body)
      const comment = await githubRequest(`/issues/${num}/comments`, 'POST', {
        body,
      })
      console.log(
        JSON.stringify(
          { id: comment.id, html_url: comment.html_url },
          null,
          2
        )
      )
      break
    }

    case 'list-prs': {
      const state = positional[0] || flags.state || 'open'
      const pulls = await githubRequest(
        `/pulls?state=${encodeURIComponent(state)}&per_page=30`
      )
      console.log(
        JSON.stringify(
          pulls.map((p) => ({
            number: p.number,
            title: p.title,
            state: p.state,
            draft: p.draft,
            head: p.head?.ref,
            base: p.base?.ref,
            html_url: p.html_url,
          })),
          null,
          2
        )
      )
      break
    }

    case 'create-pr': {
      const [head, title, bodyArg, base = 'main'] = positional
      if (!head || !title) {
        throw new Error('ブランチ名(head)とPRタイトルを指定してください')
      }
      const body = readContentOrText(bodyArg || flags.body || '')
      // 安全強制：CIゲート未通過でのレビュー依頼を防ぐため常にDraftで作成し、ready-pr経由のみ昇格させる
      const draft = true
      const pr = await githubRequest('/pulls', 'POST', {
        title,
        head,
        base: flags.base || base,
        body,
        draft,
      })
      console.log(
        JSON.stringify(
          {
            number: pr.number,
            draft: pr.draft,
            html_url: pr.html_url,
            next_required_gate: `node scripts/ops_github.mjs ready-pr ${pr.number}`,
          },
          null,
          2
        )
      )
      break
    }

    case 'wait-ci': {
      const num = positional[0]
      const timeoutSec = flags.timeout ? Number(flags.timeout) : 600
      const { result } = await waitAndVerifyPrCi(num, timeoutSec)
      console.log(JSON.stringify(result, null, 2))
      if (!result.all_passed) {
        process.exit(1)
      }
      break
    }

    case 'ready-pr': {
      const num = positional[0]
      const timeoutSec = flags.timeout ? Number(flags.timeout) : 600
      const { pr, result } = await waitAndVerifyPrCi(num, timeoutSec)
      if (!result.all_passed) {
        console.log(JSON.stringify({ ...result, ready_promoted: false }, null, 2))
        throw new Error(
          `PR #${pr.number} のリモートCIが失敗しているため Ready for Review への昇格を拒否しました。`
        )
      }
      let readyPromoted = false
      let currentDraft = pr.draft
      if (pr.draft) {
        const gqlData = await githubGraphql(
          `mutation($id: ID!) {
            markPullRequestReadyForReview(input: { pullRequestId: $id }) {
              pullRequest { number isDraft url }
            }
          }`,
          { id: pr.node_id }
        )
        currentDraft = Boolean(
          gqlData?.markPullRequestReadyForReview?.pullRequest?.isDraft
        )
        readyPromoted = !currentDraft
      }
      console.log(
        JSON.stringify(
          {
            ...result,
            draft: currentDraft,
            ready_promoted: readyPromoted,
            ci_verified: true,
          },
          null,
          2
        )
      )
      break
    }

    case 'update-pr': {
      const [num] = positional
      if (!num) throw new Error('PR番号を指定してください')
      const payload = {}
      if (flags.title) payload.title = flags.title
      if (flags.body !== undefined) {
        payload.body = readContentOrText(flags.body)
      }
      if (flags.state) payload.state = flags.state

      const pr = await githubRequest(`/pulls/${num}`, 'PATCH', payload)
      console.log(
        JSON.stringify(
          {
            number: pr.number,
            title: pr.title,
            state: pr.state,
            draft: pr.draft,
            html_url: pr.html_url,
          },
          null,
          2
        )
      )
      break
    }

    default:
      console.error(
        [
          'Usage: ops_github.mjs <command> [args...]',
          'Commands:',
          '  status | dashboard',
          '  ensure-labels',
          '  list-milestones [open|closed|all]',
          '  create-milestone "<title>" "[description]" "[due_on_iso]"',
          '  update-milestone <number> [--title "..."] [--description "..."] [--state open|closed] [--due-on "..."]',
          '  list-issues [--state open|closed|all] [--milestone <number>] [--labels "a,b"]',
          '  get-issue <issue_number>',
          '  create-issue "<title>" "<body_file_or_text>" [--labels "a,b"] [--milestone <number>]',
          '  update-issue <issue_number> [--title "..."] [--body <file_or_text>] [--state open|closed] [--labels "a,b"] [--add-labels "c"] [--remove-labels "d"] [--milestone <number|null>]',
          '  comment-issue <issue_number> <body_file_or_text>',
          '  list-prs [open|closed|all]',
          '  create-pr <head_branch> "<title>" <body_file_or_text> [base_branch]  (always Draft until ready-pr)',
          '  wait-ci <pr_number> [--timeout <seconds>]',
          '  ready-pr <pr_number> [--timeout <seconds>]',
          '  update-pr <pr_number> [--title "..."] [--body <file_or_text>] [--state open|closed]',
        ].join('\n')
      )
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
