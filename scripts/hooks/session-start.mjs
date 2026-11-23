#!/usr/bin/env node
/**
 * Antigravity SessionStart Hook
 * セッション開始時にローカル Git refs の状態（origin/main 先行乖離・保護ブランチ滞在）を検知し、
 * 異常時のみ systemMessage アラートを注入する（正常時は無音 {}）。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function buildSessionStartOutput({
  currentBranch = '',
  mainAheadBy = 0,
  devAheadBy = 0,
} = {}) {
  const alerts = []

  if (Number(mainAheadBy) > 0) {
    alerts.push(
      `[Harness Alert] origin/main is ahead of origin/dev by ${mainAheadBy} commit(s) (dev ahead by ${devAheadBy}). Do NOT open a workaround release PR to main; escalate (Tier 2) and sync main -> dev first.`
    )
  }

  if (currentBranch === 'main' || currentBranch === 'dev') {
    alerts.push(
      `[Harness Alert] Currently checked out on protected branch "${currentBranch}". Switch to a work branch from origin/dev before editing or committing.`
    )
  }

  if (alerts.length === 0) {
    return {}
  }

  return {
    injectSteps: [
      {
        systemMessage: {
          systemMessage: alerts.join('\n'),
        },
      },
    ],
  }
}

function readGitBranchCounts(repoCwd) {
  let currentBranch = ''
  let mainAheadBy = 0
  let devAheadBy = 0

  const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoCwd,
    encoding: 'utf-8',
  })
  if (branchRes.status === 0) {
    currentBranch = (branchRes.stdout || '').trim()
  }

  const countRes = spawnSync(
    'git',
    ['rev-list', '--left-right', '--count', 'origin/dev...origin/main'],
    {
      cwd: repoCwd,
      encoding: 'utf-8',
    }
  )
  if (countRes.status === 0) {
    const parts = (countRes.stdout || '').trim().split(/\s+/)
    if (parts.length >= 2) {
      devAheadBy = Number(parts[0]) || 0
      mainAheadBy = Number(parts[1]) || 0
    }
  }

  return { currentBranch, mainAheadBy, devAheadBy }
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  const selfPath = path.resolve(fileURLToPath(import.meta.url))
  const entryPath = path.resolve(process.argv[1])
  return process.platform === 'win32'
    ? selfPath.toLowerCase() === entryPath.toLowerCase()
    : selfPath === entryPath
}

if (isDirectExecution()) {
  try {
    let raw = ''
    try {
      raw = fs.readFileSync(0, 'utf-8')
    } catch {
      raw = ''
    }
    const payload = raw.trim() ? JSON.parse(raw) : {}
    const defaultRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    )
    const repoCwd =
      payload.cwd || payload.workspacePaths?.[0] || defaultRoot
    const state = readGitBranchCounts(repoCwd)
    const output = buildSessionStartOutput(state)
    console.log(JSON.stringify(output))
  } catch {
    console.log('{}')
  }
}
