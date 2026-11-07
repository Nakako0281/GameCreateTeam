#!/usr/bin/env node
/**
 * GitHub API Helper for GameCreateTeam
 * Git Credential Manager (または環境変数 GITHUB_TOKEN) の認証情報を利用して
 * Issueの取得・作成・コメント投稿・PR作成を行います。
 *
 * 使い方:
 *   node .agents/skills/game-create-team/scripts/github_api.mjs list-issues
 *   node .agents/skills/game-create-team/scripts/github_api.mjs get-issue <issue_number>
 *   node .agents/skills/game-create-team/scripts/github_api.mjs create-issue "<title>" "<body>"
 *   node .agents/skills/game-create-team/scripts/github_api.mjs comment-issue <issue_number> <markdown_file_path_or_text>
 *   node .agents/skills/game-create-team/scripts/github_api.mjs create-pr <head_branch> "<title>" <markdown_file_path_or_text>
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const OWNER = 'Nakako0281'
const REPO = 'GameCreateTeam'
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN
  }
  const res = spawnSync(
    'git',
    ['credential', 'fill'],
    {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf-8',
    }
  )
  if (res.status === 0 && res.stdout) {
    const match = res.stdout.match(/^password=(.+)$/m)
    if (match) {
      return match[1].trim()
    }
  }
  throw new Error('GitHubの認証トークンが取得できませんでした。')
}

function readContentOrText(arg) {
  if (!arg) return ''
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
    return fs.readFileSync(arg, 'utf-8')
  }
  return arg
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
      'User-Agent': 'GameCreateTeam-Agent',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`GitHub API Error (${res.status}): ${errText}`)
  }
  return res.json()
}

async function main() {
  const [, , command, ...args] = process.argv

  switch (command) {
    case 'list-issues': {
      const issues = await githubRequest('/issues?state=open&per_page=30')
      const onlyIssues = issues.filter((i) => !i.pull_request)
      console.log(
        JSON.stringify(
          onlyIssues.map((i) => ({
            number: i.number,
            title: i.title,
            body: i.body,
            labels: i.labels.map((l) => l.name),
            html_url: i.html_url,
          })),
          null,
          2
        )
      )
      break
    }

    case 'get-issue': {
      const num = args[0]
      if (!num) throw new Error('Issue番号を指定してください')
      const issue = await githubRequest(`/issues/${num}`)
      const comments = await githubRequest(`/issues/${num}/comments`)
      console.log(
        JSON.stringify(
          {
            number: issue.number,
            title: issue.title,
            body: issue.body,
            state: issue.state,
            html_url: issue.html_url,
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
      const [title, bodyArg] = args
      if (!title) throw new Error('タイトルを指定してください')
      const body = readContentOrText(bodyArg)
      const created = await githubRequest('/issues', 'POST', {
        title,
        body,
        labels: ['game-request'],
      })
      console.log(
        JSON.stringify(
          { number: created.number, html_url: created.html_url },
          null,
          2
        )
      )
      break
    }

    case 'comment-issue': {
      const [num, bodyArg] = args
      if (!num || !bodyArg) {
        throw new Error('Issue番号とコメント内容（またはファイルパス）を指定してください')
      }
      const body = readContentOrText(bodyArg)
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

    case 'create-pr': {
      const [head, title, bodyArg, base = 'main'] = args
      if (!head || !title) {
        throw new Error('ブランチ名(head)とPRタイトルを指定してください')
      }
      const body = readContentOrText(bodyArg)
      const pr = await githubRequest('/pulls', 'POST', {
        title,
        head,
        base,
        body,
      })
      console.log(
        JSON.stringify(
          { number: pr.number, html_url: pr.html_url },
          null,
          2
        )
      )
      break
    }

    default:
      console.error(
        'Usage: github_api.mjs <list-issues|get-issue|create-issue|comment-issue|create-pr> ...'
      )
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
