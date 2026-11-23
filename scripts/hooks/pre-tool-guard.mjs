#!/usr/bin/env node
/**
 * Antigravity PreToolUse Hook
 * run_command / write_file / edit_file の実行前に機械的境界（main/dev直Push・自己マージ遮断、
 * 保護ファイル編集・main宛てPR作成・main巻き込みマージの強制人間確認）を強制する。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROTECTED_EXACT_PATHS = new Set([
  'agents.md',
  '.agents/rules/agents.md',
  '.agents/hooks.json',
  'public/_headers',
  'src/pages/privacy.astro',
  'src/pages/terms.astro',
])

const PROTECTED_DIR_PREFIXES = ['scripts/hooks/', '.github/workflows/']

const PROTECTED_PATH_FRAGMENTS = [
  '.agents/hooks.json',
  '.agents/rules/agents.md',
  'scripts/hooks',
  '.github/workflows',
  'public/_headers',
  'src/pages/privacy.astro',
  'src/pages/terms.astro',
]

const SHELL_WRITE_OR_DELETE_RE =
  /(?:>>?|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|\brm\b|\bdel\b|\bmv\b|\bcp\b|\bsed\s+-i|\btee\b|\btruncate\b|writeFile(?:Sync)?|appendFile(?:Sync)?|unlink(?:Sync)?|rmSync)/i

const SAFE_CLEANUP_TARGETS = new Set([
  'dist',
  './dist',
  'dist-ads',
  './dist-ads',
  'node_modules',
  './node_modules',
])

function normalizePosix(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

export function isProtectedFilePath(targetPath, repoRoot = '') {
  const norm = normalizePosix(targetPath)
  if (!norm) return false

  if (norm === 'gemini.md' || norm.endsWith('/gemini.md')) {
    return true
  }

  let rel = norm.replace(/^\.\//, '')
  const normRoot = normalizePosix(repoRoot)
  if (normRoot && norm.startsWith(`${normRoot}/`)) {
    rel = norm.slice(normRoot.length + 1)
  }

  if (PROTECTED_EXACT_PATHS.has(rel)) {
    return true
  }
  for (const prefix of PROTECTED_DIR_PREFIXES) {
    if (rel.startsWith(prefix)) {
      return true
    }
  }

  if (!normRoot) {
    for (const exact of PROTECTED_EXACT_PATHS) {
      if (norm.endsWith(`/${exact}`)) return true
    }
    for (const prefix of PROTECTED_DIR_PREFIXES) {
      if (norm.includes(`/${prefix}`)) return true
    }
  }

  return false
}

function splitCommandSegments(cmd) {
  const segments = []
  let cur = ''
  let quote = null
  let escaped = false

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    const next = cmd[i + 1]

    if (escaped) {
      cur += ch
      escaped = false
      continue
    }
    if (ch === '\\' && quote !== "'") {
      cur += ch
      escaped = true
      continue
    }
    if (quote) {
      if (ch === quote) quote = null
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
      continue
    }
    if (ch === ';' || ch === '\n' || ch === '\r') {
      if (cur.trim()) segments.push(cur.trim())
      cur = ''
      continue
    }
    if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
      if (cur.trim()) segments.push(cur.trim())
      cur = ''
      i += 1
      continue
    }
    if (ch === '|') {
      if (cur.trim()) segments.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) segments.push(cur.trim())
  return segments
}

function tokenizeSegment(segment) {
  const tokens = []
  let cur = ''
  let quote = null
  let hadToken = false

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      hadToken = true
      continue
    }
    if (/\s/.test(ch)) {
      if (hadToken || cur.length > 0) {
        tokens.push(cur)
        cur = ''
        hadToken = false
      }
      continue
    }
    cur += ch
    hadToken = true
  }
  if (hadToken || cur.length > 0) {
    tokens.push(cur)
  }
  return tokens
}

function isProtectedBranchRefTarget(token, currentBranch = '') {
  const cleaned = String(token || '').trim()
  if (!cleaned || cleaned.startsWith('-')) return false
  const target = cleaned.includes(':')
    ? cleaned.slice(cleaned.lastIndexOf(':') + 1)
    : cleaned
  if (
    target === 'main' ||
    target === 'dev' ||
    target === 'refs/heads/main' ||
    target === 'refs/heads/dev'
  ) {
    return true
  }
  if (target === 'HEAD' && (currentBranch === 'main' || currentBranch === 'dev')) {
    return true
  }
  return false
}

function isProtectedGitPushSegment(tokens, currentBranch) {
  if (tokens[0] !== 'git' || tokens[1] !== 'push') return false
  const args = tokens.slice(2)
  const positional = []

  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (t === '-o' || t === '--push-option' || t === '--repo' || t === '--receive-pack') {
      i += 1
      continue
    }
    if (t.startsWith('-')) continue
    positional.push(t)
  }

  // positional[0] = remote, positional[1..] = refspecs
  if (positional.length <= 1) {
    return currentBranch === 'main' || currentBranch === 'dev'
  }
  return positional.slice(1).some((t) => isProtectedBranchRefTarget(t, currentBranch))
}

function targetsMainMergeOrRebase(tokens) {
  if (tokens[0] !== 'git') return false
  if (tokens[1] !== 'merge' && tokens[1] !== 'rebase') return false
  const args = tokens.slice(2)
  for (let i = 0; i < args.length; i++) {
    const t = args[i]
    if (t === '-m' || t === '--strategy' || t === '-s' || t === '--onto') {
      i += 1
      continue
    }
    if (t.startsWith('-')) continue
    if (t === 'main' || t === 'origin/main' || t === 'refs/heads/main') {
      return true
    }
  }
  return false
}

function targetsMainPullRequest(tokens) {
  const joined = tokens.join(' ')
  const isOpsCreatePr =
    tokens.includes('create-pr') && joined.includes('ops_github')
  const isGhPrCreate =
    tokens[0] === 'gh' && tokens[1] === 'pr' && tokens[2] === 'create'

  if (!isOpsCreatePr && !isGhPrCreate) return false

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '--base=main' || t === '-Bmain') return true
    if ((t === '--base' || t === '-B') && tokens[i + 1] === 'main') {
      return true
    }
  }

  if (isOpsCreatePr) {
    const idx = tokens.indexOf('create-pr')
    const positionalAfterCmd = []
    for (let i = idx + 1; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.startsWith('--')) {
        if (!t.includes('=') && i + 1 < tokens.length && (t === '--base' || t === '--body' || t === '--reason')) {
          i += 1
        }
        continue
      }
      positionalAfterCmd.push(t)
    }
    // create-pr <head> <title> <body> [base]
    if (positionalAfterCmd[3] === 'main') {
      return true
    }
  }

  return false
}

function isDangerousRmOrRemoveItem(tokens) {
  if (tokens[0] === 'rm') {
    const flags = tokens.filter((t) => t.startsWith('-')).join('')
    const hasRecursive = flags.includes('r') || flags.includes('R') || tokens.includes('--recursive')
    const hasForce = flags.includes('f') || tokens.includes('--force')
    if (hasRecursive && hasForce) {
      const targets = tokens
        .slice(1)
        .filter((t) => !t.startsWith('-'))
        .map((t) => normalizePosix(t))
      if (targets.length === 0) return true
      return targets.some((t) => !SAFE_CLEANUP_TARGETS.has(t))
    }
  }

  if (tokens[0]?.toLowerCase() === 'remove-item') {
    const lower = tokens.map((t) => t.toLowerCase())
    if (lower.includes('-recurse') && lower.includes('-force')) {
      const targets = tokens
        .slice(1)
        .filter((t) => !t.startsWith('-'))
        .map((t) => normalizePosix(t))
      if (targets.length === 0) return true
      return targets.some((t) => !SAFE_CLEANUP_TARGETS.has(t))
    }
  }

  return false
}

function isShellProtectedFileMutation(segment, tokens) {
  if (!SHELL_WRITE_OR_DELETE_RE.test(segment)) return false
  // git commit -m "..." などはシェル書き込み操作ではない
  if (tokens[0] === 'git' && (tokens[1] === 'commit' || tokens[1] === 'add' || tokens[1] === 'status' || tokens[1] === 'diff')) {
    return false
  }
  const lowerSeg = segment.replace(/\\/g, '/').toLowerCase()
  for (const frag of PROTECTED_PATH_FRAGMENTS) {
    if (lowerSeg.includes(frag)) return true
  }
  if (/(?:^|[\s/"'])agents\.md(?=$|[\s"';>])/i.test(lowerSeg)) return true
  if (/(?:^|[\s/"'])gemini\.md(?=$|[\s"';>])/i.test(lowerSeg)) return true
  return false
}

export function evaluatePreToolGuard(
  payload,
  { currentBranch = '', repoRoot = '' } = {}
) {
  const toolName = String(payload?.toolCall?.name || '').toLowerCase()
  const args = payload?.toolCall?.args || {}

  if (toolName === 'write_file' || toolName === 'edit_file') {
    const targetPath = args.Path || args.path || ''
    if (isProtectedFilePath(targetPath, repoRoot)) {
      return {
        decision: 'force_ask',
        reason: `保護対象ファイル（憲法・ハーネス・CI・セキュリティ/法務境界）への変更のため人間の明示承認が必要です: ${targetPath}`,
      }
    }
    return { decision: 'allow' }
  }

  if (toolName === 'run_command') {
    const cmd = String(args.CommandLine || args.command || '')
    if (!cmd.trim()) return { decision: 'allow' }

    const segments = splitCommandSegments(cmd)
    let forceAskReason = null

    // パイプ経由リモートスクリプト実行のブロック/確認
    if (
      /\b(?:curl|wget|invoke-webrequest|iwr|irm)\b[^|]*\|\s*(?:sh|bash|pwsh|powershell|iex|invoke-expression)\b/i.test(
        cmd
      )
    ) {
      forceAskReason =
        'リモートスクリプトのパイプ直接実行が検出されたため人間の明示承認が必要です。'
    }

    for (const seg of segments) {
      const tokens = tokenizeSegment(seg)
      if (tokens.length === 0) continue

      // Hard deny checks
      if (
        (tokens[0] === 'gh' && tokens[1] === 'pr' && tokens[2] === 'merge') ||
        /\/pulls\/\d+\/merge\b/i.test(seg)
      ) {
        return {
          decision: 'deny',
          reason:
            'PRの自己マージ（gh pr merge / APIマージ）は組織ハーネスにより禁止されています。マージは人間（法的最終責任者・外部実務担当）が行います。',
        }
      }

      if (
        (currentBranch === 'main' || currentBranch === 'dev') &&
        tokens[0] === 'git' &&
        tokens[1] === 'commit'
      ) {
        return {
          decision: 'deny',
          reason: `保護ブランチ "${currentBranch}" 上での直接 git commit は禁止されています。origin/dev から作業ブランチを切ってください。`,
        }
      }

      if (isProtectedGitPushSegment(tokens, currentBranch)) {
        return {
          decision: 'deny',
          reason:
            'main / dev ブランチへの直接 git push（--force 含む）は組織ハーネスにより禁止されています。作業ブランチへ Push してください。',
        }
      }

      // Mandatory force_ask checks
      if (!forceAskReason && targetsMainMergeOrRebase(tokens)) {
        forceAskReason =
          'main / origin/main を対象とする git merge / rebase は事前相談・承認境界（Tier 2）のため人間の明示承認が必要です。'
      }

      if (!forceAskReason && targetsMainPullRequest(tokens)) {
        forceAskReason =
          'main 宛て Pull Request の作成は本番公開境界（Tier 2）のため人間の明示承認が必要です。'
      }

      if (!forceAskReason && tokens.includes('--allow-exception')) {
        forceAskReason =
          '--allow-exception 例外フラグの使用には人間の明示承認が必要です。'
      }

      if (!forceAskReason && isShellProtectedFileMutation(seg, tokens)) {
        forceAskReason =
          '保護対象ファイル（憲法・ハーネス・CI・セキュリティ/法務境界）を変更するシェル操作のため人間の明示承認が必要です。'
      }

      if (!forceAskReason && isDangerousRmOrRemoveItem(tokens)) {
        forceAskReason =
          '保護対象外パスへの再帰強制削除コマンドのため人間の明示承認が必要です。'
      }
    }

    if (forceAskReason) {
      return {
        decision: 'force_ask',
        reason: forceAskReason,
      }
    }
    return { decision: 'allow' }
  }

  return { decision: 'allow' }
}

function readCurrentBranch(repoRoot) {
  const res = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  })
  return res.status === 0 ? (res.stdout || '').trim() : ''
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
    const raw = fs.readFileSync(0, 'utf-8')
    const payload = JSON.parse(raw)
    const defaultRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    )
    const repoRoot =
      payload.cwd || payload.workspacePaths?.[0] || defaultRoot
    const currentBranch = readCurrentBranch(repoRoot)
    const result = evaluatePreToolGuard(payload, { currentBranch, repoRoot })
    console.log(JSON.stringify(result))
  } catch (err) {
    console.log(
      JSON.stringify({
        decision: 'force_ask',
        reason: `PreToolUse hook failed closed: ${err instanceof Error ? err.message : String(err)}`,
      })
    )
  }
}
