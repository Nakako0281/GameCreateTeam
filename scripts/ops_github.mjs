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
      const draft = Boolean(flags.draft)
      const pr = await githubRequest('/pulls', 'POST', {
        title,
        head,
        base: flags.base || base,
        body,
        draft,
      })
      console.log(
        JSON.stringify(
          { number: pr.number, draft: pr.draft, html_url: pr.html_url },
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
          '  create-pr <head_branch> "<title>" <body_file_or_text> [base_branch] [--draft]',
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
