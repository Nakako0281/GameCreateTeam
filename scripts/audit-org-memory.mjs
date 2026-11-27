#!/usr/bin/env node
/**
 * 組織永続メモリ・ツール台帳整合性・信頼境界・LLM料金データ 機械監査
 *
 * デフォルト実行では決定的チェック（構造・整合・信頼境界・セキュリティ境界）のみをエラーとし、
 * 時刻依存チェック（PRICING_LAST_VERIFIED 14日鮮度・priceEffectiveUntil 期限切れ）は
 * `--time-sensitive` 指定時（日次監査および src/data/llm-pricing.ts 変更PR）のみ失敗させる。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OWNER,
  REPO,
  TRUSTED_AUTHOR_ASSOCIATIONS,
  classifyAuthorTrust,
  classifyPullRequestTrust,
  classifyStatusIssues,
} from './ops_github.mjs'
import { findUnqualifiedZeroSendClaims } from './audit-seo-adsense.mjs'

const MAX_PRICING_AGE_DAYS = 14
const TRANSITION_WARN_DAYS = 7
const REQUIRED_PROVIDERS = ['OpenAI', 'Anthropic', 'Google', 'DeepSeek']
const RETIRED_MODEL_IDS = new Set([
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-nano',
  'claude-3-5-haiku',
  'claude-3-5-sonnet',
  'claude-sonnet-4',
  'claude-opus-4',
  'gemini-2-5-pro',
  'gemini-2-5-flash',
  'gemini-2-5-flash-lite',
  'deepseek-chat',
  'deepseek-reasoner',
])

const REQUIRED_MEMORY_FILES = [
  'AGENTS.md',
  '.agents/rules/AGENTS.md',
  'docs/STATE.md',
  'docs/POSTMORTEM_AND_LESSONS.md',
  'docs/METRICS_LOG.md',
  'docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md',
  'docs/TOOLS_ROADMAP.md',
  'docs/ADR/ADR-001-business-strategy.md',
  'docs/ADR/ADR-002-tech-security-architecture.md',
  'docs/ADR/ADR-005-governance-escalation-and-roles.md',
]

export const RULE_LINE_BUDGET = 90

export function auditAlwaysOnRuleBudget(
  root = process.cwd(),
  budget = RULE_LINE_BUDGET
) {
  const budgetWarnings = []
  for (const rel of ['AGENTS.md', '.agents/rules/AGENTS.md']) {
    const full = path.join(root, rel)
    if (!fs.existsSync(full)) continue
    const lineCount = fs.readFileSync(full, 'utf-8').split(/\r?\n/).length
    if (lineCount > budget) {
      budgetWarnings.push(
        `[RuleBudget Warning] ${rel} has ${lineCount} lines (> ${budget} line target). Move details to docs/ADR/ or skills.`
      )
    }
  }
  return budgetWarnings
}

function walkTextFiles(dir, extRe, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTextFiles(full, extRe, out)
    } else if (extRe.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const TOOL_SYNC_TARGETS = [
  'README.md',
  'docs/STATE.md',
  'docs/TOOLS_ROADMAP.md',
  'tests/e2e/site.spec.ts',
  'tests/e2e/ads-leakage.spec.ts',
]

const LIVE_ONLY_TOOL_TARGETS = [
  'README.md',
  'tests/e2e/site.spec.ts',
  'tests/e2e/ads-leakage.spec.ts',
]

export function auditPublishedToolSync(root = process.cwd()) {
  const errors = []
  const toolsPath = path.join(root, 'src', 'data', 'tools.ts')
  if (!fs.existsSync(toolsPath)) {
    return ['[Registry] Missing src/data/tools.ts']
  }

  const toolsTs = fs.readFileSync(toolsPath, 'utf-8')
  const toolBlocks = toolsTs.match(/\{[\s\S]*?slug:\s*'[^']+'[\s\S]*?\}/g) || []
  const publishedSlugs = []
  const plannedSlugs = []

  for (const block of toolBlocks) {
    const slugMatch = block.match(/slug:\s*'([^']+)'/)
    const statusMatch = block.match(/status:\s*'([^']+)'/)
    if (!slugMatch || !statusMatch) continue
    if (statusMatch[1] === 'published') publishedSlugs.push(slugMatch[1])
    else if (statusMatch[1] === 'planned') plannedSlugs.push(slugMatch[1])
  }

  const fileContents = new Map()
  for (const rel of TOOL_SYNC_TARGETS) {
    const full = path.join(root, rel)
    if (!fs.existsSync(full)) {
      errors.push(`[ToolSync] Missing sync target file: ${rel}`)
      continue
    }
    fileContents.set(rel, fs.readFileSync(full, 'utf-8'))
  }

  for (const slug of publishedSlugs) {
    const needle = `/tools/${slug}/`
    for (const rel of TOOL_SYNC_TARGETS) {
      const content = fileContents.get(rel)
      if (content !== undefined && !content.includes(needle)) {
        errors.push(
          `[ToolSync] Published tool "${needle}" is missing from ${rel}`
        )
      }
    }
  }

  for (const slug of plannedSlugs) {
    const needle = `/tools/${slug}/`
    for (const rel of LIVE_ONLY_TOOL_TARGETS) {
      const content = fileContents.get(rel)
      if (content !== undefined && content.includes(needle)) {
        errors.push(
          `[ToolSync] Planned (unpublished) tool "${needle}" must not appear in ${rel}`
        )
      }
    }
  }

  return errors
}

const LEGACY_BRAND_OR_ROLE_RE =
  /\b(?:LocalBox|TabChest|OTEMOTO)\b|temoto-box\.com|\bTEMOTO\b|従業員兼最終責任者/

export function auditBrandAndRoleTerminology(root = process.cwd()) {
  const errors = []
  const candidateFiles = []

  for (const rel of [
    'README.md',
    'AGENTS.md',
    'docs/STATE.md',
    'docs/TOOLS_ROADMAP.md',
    'docs/HUMAN_OPERATIONS_GUIDE.md',
    'docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md',
  ]) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) candidateFiles.push(full)
  }

  for (const f of walkTextFiles(
    path.join(root, 'src'),
    /\.(?:astro|ts|tsx)$/i
  )) {
    const rel = path.relative(root, f).replace(/\\/g, '/')
    if (rel.includes('__tests__/') || /\.test\.[tj]sx?$/.test(rel)) continue
    candidateFiles.push(f)
  }
  candidateFiles.push(
    ...walkTextFiles(path.join(root, '.agents'), /\.md$/i),
    ...walkTextFiles(path.join(root, 'docs', 'promotions'), /\.md$/i)
  )

  for (const full of candidateFiles) {
    const rel = path.relative(root, full).replace(/\\/g, '/')
    const text = fs.readFileSync(full, 'utf-8')
    const hit = text.match(LEGACY_BRAND_OR_ROLE_RE)
    if (hit) {
      errors.push(
        `[Terminology] ${rel} contains deprecated brand/role term "${hit[0]}"`
      )
    }
  }

  return errors
}

const POSTMORTEM_ROW_RE = /^\|\s*\*\*(L-\d+)\*\*\s*\|/
const POSTMORTEM_TIER_RE =
  /\[Tier\s+(?:A:\s*Code\/Test|B:\s*Harness\/CLI|C:\s*Principle)\]/
const POSTMORTEM_EVIDENCE_PATH_RE =
  /(?:scripts\/|src\/|tests\/|\.agents\/|\.github\/|docs\/ADR\/|public\/|astro\.config\.mjs)/

export function auditPostmortemClassification(
  postmortemText = '',
  sourceLabel = 'docs/POSTMORTEM_AND_LESSONS.md'
) {
  const errors = []
  const lines = String(postmortemText || '').split(/\r?\n/)
  let rowCount = 0

  for (const line of lines) {
    const m = line.match(POSTMORTEM_ROW_RE)
    if (!m) continue
    rowCount += 1
    const id = m[1]
    if (!POSTMORTEM_TIER_RE.test(line)) {
      errors.push(
        `[Postmortem] ${sourceLabel} (${id}) missing Resolution Tier tag ([Tier A: Code/Test] | [Tier B: Harness/CLI] | [Tier C: Principle])`
      )
    }
    if (!POSTMORTEM_EVIDENCE_PATH_RE.test(line)) {
      errors.push(
        `[Postmortem] ${sourceLabel} (${id}) missing concrete repository artifact path (scripts/, src/, tests/, .agents/, .github/, or docs/ADR/)`
      )
    }
  }

  if (rowCount === 0) {
    errors.push(`[Postmortem] ${sourceLabel} contains no L-XX lesson rows`)
  }

  return errors
}

function extractTopLevelArrayObjects(sourceText, marker) {
  const markerIdx = sourceText.indexOf(marker)
  if (markerIdx < 0) return []
  const eqIdx = sourceText.indexOf('=', markerIdx)
  if (eqIdx < 0) return []
  const bracketStart = sourceText.indexOf('[', eqIdx)
  if (bracketStart < 0) return []

  const blocks = []
  let depth = 0
  let objStart = -1
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let i = bracketStart; i < sourceText.length; i++) {
    const ch = sourceText[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (!inDouble && ch === "'") {
      inSingle = !inSingle
      continue
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      continue
    }
    if (inSingle || inDouble) continue

    if (ch === ']' && depth === 0) {
      break
    }
    if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && objStart >= 0) {
        blocks.push(sourceText.slice(objStart, i + 1))
        objStart = -1
      }
    }
  }
  return blocks
}

function isValidIsoDateString(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const parsed = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === dateStr
}

export function runOrgMemoryAudit({
  root = process.cwd(),
  docsOnly = false,
  timeSensitive = false,
  now = new Date(),
} = {}) {
  const errors = []
  const warnings = []

  const nowDate = now instanceof Date ? now : new Date(now)
  const nowMs = nowDate.getTime()
  if (Number.isNaN(nowMs)) {
    throw new Error(`Invalid now argument: ${String(now)}`)
  }

  for (const rel of REQUIRED_MEMORY_FILES) {
    const full = path.join(root, rel)
    if (!fs.existsSync(full)) {
      errors.push(`[OrgMemory] Missing required governance/memory file: ${rel}`)
    }
  }

  // 常時読み込みルールのコンテキスト予算ソフト警告（Issue #56）
  warnings.push(...auditAlwaysOnRuleBudget(root))

  // ハーネス設定 (.agents/hooks.json) とフックスクリプトの実在・JSON妥当性チェック
  const hooksJsonPath = path.join(root, '.agents', 'hooks.json')
  if (!fs.existsSync(hooksJsonPath)) {
    errors.push('[Harness] Missing .agents/hooks.json')
  } else {
    try {
      const hooksCfg = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8'))
      if (!hooksCfg || typeof hooksCfg !== 'object' || Array.isArray(hooksCfg)) {
        errors.push('[Harness] .agents/hooks.json must be a JSON object')
      } else {
        const commands = []
        for (const hookDef of Object.values(hooksCfg)) {
          if (!hookDef || typeof hookDef !== 'object') continue
          for (const event of ['SessionStart', 'PreInvocation', 'PostInvocation', 'Stop']) {
            for (const item of hookDef[event] || []) {
              if (item?.command) commands.push(item.command)
            }
          }
          for (const event of ['PreToolUse', 'PostToolUse']) {
            for (const group of hookDef[event] || []) {
              for (const item of group?.hooks || []) {
                if (item?.command) commands.push(item.command)
              }
            }
          }
        }
        if (commands.length === 0) {
          errors.push('[Harness] .agents/hooks.json defines no hook commands')
        }
        for (const cmd of commands) {
          const scriptMatches = cmd.match(/(?:\.\.?\/)?scripts\/[^\s"']+\.(?:mjs|js|sh|ps1)/g) || []
          for (const scriptRef of scriptMatches) {
            const resolved = path.resolve(path.join(root, '.agents'), scriptRef)
            if (!fs.existsSync(resolved)) {
              errors.push(
                `[Harness] Hook command references missing script: ${scriptRef}`
              )
            }
          }
        }
      }
    } catch (err) {
      errors.push(
        `[Harness] Invalid JSON in .agents/hooks.json: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  // 信頼境界＆プロンプトインジェクション対策ガード（L-12）
  const templateDir = path.join(root, '.github', 'ISSUE_TEMPLATE')
  if (!fs.existsSync(templateDir)) {
    errors.push('[TrustBoundary] Missing .github/ISSUE_TEMPLATE directory')
  } else {
    const templateFiles = fs
      .readdirSync(templateDir)
      .filter((f) => /\.(md|ya?ml)$/i.test(f))
    if (templateFiles.length === 0) {
      errors.push('[TrustBoundary] No templates found in .github/ISSUE_TEMPLATE')
    }
    const PRIVILEGED_LABEL_RE =
      /(?:owner:(?:ai|human)|status:ready|priority:p[012])/i
    const INTERNAL_TEMPLATE_TERM_RE =
      /(?:マネタイズ|AdSense|収益目標|収益|KPI|従業員兼最終責任者|AutoGrowth Studio)/i

    for (const fileName of templateFiles) {
      const content = fs.readFileSync(path.join(templateDir, fileName), 'utf-8')
      const privMatch = content.match(PRIVILEGED_LABEL_RE)
      if (privMatch) {
        errors.push(
          `[TrustBoundary] .github/ISSUE_TEMPLATE/${fileName} contains privileged label "${privMatch[0]}"`
        )
      }
      const termMatch = content.match(INTERNAL_TEMPLATE_TERM_RE)
      if (termMatch) {
        errors.push(
          `[PublicBoundary] .github/ISSUE_TEMPLATE/${fileName} contains internal strategy term "${termMatch[0]}"`
        )
      }
    }
  }

  const userFeedbackTemplatePath = path.join(templateDir, 'user_feedback.md')
  if (!fs.existsSync(userFeedbackTemplatePath)) {
    errors.push(
      '[PublicBoundary] Missing .github/ISSUE_TEMPLATE/user_feedback.md for user inquiries'
    )
  } else {
    const feedbackTemplateText = fs.readFileSync(
      userFeedbackTemplatePath,
      'utf-8'
    )
    const labelsLineMatch = feedbackTemplateText.match(/^labels:\s*(.+)$/m)
    const labelsLine = labelsLineMatch ? labelsLineMatch[1] : ''
    if (
      !labelsLine.includes('type:feedback') ||
      !labelsLine.includes('status:needs-triage')
    ) {
      errors.push(
        '[TrustBoundary] .github/ISSUE_TEMPLATE/user_feedback.md must set labels: type:feedback and status:needs-triage'
      )
    }
  }

  // PRテンプレート存在・必須見出し・公開境界チェック（Issue #55 & L-11）
  const prTemplatePath = path.join(
    root,
    '.github',
    'pull_request_template.md'
  )
  if (!fs.existsSync(prTemplatePath)) {
    errors.push(
      '[PRTemplate] Missing .github/pull_request_template.md (Issue #55)'
    )
  } else {
    const prTemplateText = fs.readFileSync(prTemplatePath, 'utf-8')
    const prForbiddenHit = prTemplateText.match(
      /(?:マネタイズ|AdSense|収益目標|月\s*100\s*円|従業員兼最終責任者|AutoGrowth Studio)/i
    )
    if (prForbiddenHit) {
      errors.push(
        `[PublicBoundary] .github/pull_request_template.md contains internal strategy term "${prForbiddenHit[0]}"`
      )
    }
    for (const heading of [
      '## 概要',
      '## 変更と検証証跡',
      '## サブエージェント監査と自己受け入れ確認',
    ]) {
      if (!prTemplateText.includes(heading)) {
        errors.push(
          `[PRTemplate] .github/pull_request_template.md missing required heading "${heading}"`
        )
      }
    }
  }

  // ops_github.mjs 信頼境界ロジックの実動作検証（fail-closed）
  if (TRUSTED_AUTHOR_ASSOCIATIONS.has('CONTRIBUTOR')) {
    errors.push(
      '[TrustBoundary] TRUSTED_AUTHOR_ASSOCIATIONS must not include CONTRIBUTOR'
    )
  }
  if (
    classifyAuthorTrust({
      author_association: 'OWNER',
      user: { login: 'owner-user', type: 'User' },
    }) !== 'trusted'
  ) {
    errors.push('[TrustBoundary] OWNER should classify as trusted')
  }
  if (
    classifyAuthorTrust({
      author_association: 'CONTRIBUTOR',
      user: { login: 'contrib', type: 'User' },
    }) !== 'external' ||
    classifyAuthorTrust({
      author_association: 'NONE',
      user: { login: 'github-actions[bot]', type: 'User' },
    }) !== 'external'
  ) {
    errors.push(
      '[TrustBoundary] CONTRIBUTOR or spoofed bot user must classify as external'
    )
  }
  if (
    classifyAuthorTrust({
      author_association: 'NONE',
      user: { login: 'github-actions[bot]', type: 'Bot' },
    }) !== 'trusted'
  ) {
    errors.push(
      '[TrustBoundary] Official github-actions[bot] (Bot) should classify as trusted'
    )
  }
  if (
    classifyPullRequestTrust({
      author_association: 'OWNER',
      user: { login: 'owner-user', type: 'User' },
      head: { repo: { full_name: `fork-attacker/${REPO}` } },
    }) !== 'external' ||
    classifyPullRequestTrust({
      author_association: 'OWNER',
      user: { login: 'owner-user', type: 'User' },
      head: { repo: { full_name: `${OWNER}/${REPO}` } },
    }) !== 'trusted'
  ) {
    errors.push('[TrustBoundary] Fork PR trust boundary verification failed')
  }
  const probeStatus = classifyStatusIssues(
    [
      {
        number: 99999,
        author_association: 'NONE',
        user: { login: 'attacker', type: 'User' },
        labels: ['owner:ai', 'status:ready'],
        title: 'Injected task',
      },
    ],
    [],
    nowMs
  )
  if (probeStatus.aiOpen.length !== 0 || probeStatus.externalIssues.length !== 1) {
    errors.push(
      '[TrustBoundary] External issue with owner:ai label leaked into aiOpen'
    )
  }

  // 廃止キー残存チェック
  for (const rel of [
    'AGENTS.md',
    '.agents/rules/AGENTS.md',
    '.agents/skills/daily-ops/SKILL.md',
    '.agents/skills/autonomous-web-studio/SKILL.md',
  ]) {
    const full = path.join(root, rel)
    if (!fs.existsSync(full)) continue
    const content = fs.readFileSync(full, 'utf-8')
    if (content.includes('all_open_issues')) {
      errors.push(
        `[TrustBoundary] Deprecated untrusted key "all_open_issues" still referenced in ${rel}`
      )
    }
  }

  const dailyFreshnessWf = path.join(
    root,
    '.github',
    'workflows',
    'daily-freshness-check.yml'
  )
  if (fs.existsSync(dailyFreshnessWf)) {
    const wfText = fs.readFileSync(dailyFreshnessWf, 'utf-8')
    if (!wfText.includes('--time-sensitive')) {
      errors.push(
        '[Freshness] .github/workflows/daily-freshness-check.yml must pass --time-sensitive'
      )
    }
    if (!wfText.includes('author_association')) {
      errors.push(
        '[TrustBoundary] .github/workflows/daily-freshness-check.yml must verify author_association to prevent alert suppression'
      )
    }
  }

  // 公開境界リーク防止ガード（L-11: README・公開画面への内部マネタイズ/組織用語混入禁止 ＆ L-14: --docs-only 対応クレーム検査）
  const readmePath = path.join(root, 'README.md')
  if (fs.existsSync(readmePath)) {
    const readmeText = fs.readFileSync(readmePath, 'utf-8')
    const forbiddenReadmeMatch = readmeText.match(
      /マネタイズ|AdSense|収益目標|収益モデル|月\s*100\s*円|従業員兼最終責任者|AutoGrowth Studio/i
    )
    if (forbiddenReadmeMatch) {
      errors.push(
        `[PublicBoundary] README.md contains internal strategy/monetization term: "${forbiddenReadmeMatch[0]}"`
      )
    }
    for (const hit of findUnqualifiedZeroSendClaims(readmeText)) {
      errors.push(
        `[ClaimAccuracy] README.md contains unqualified zero-send claim "${hit.phrase}" (${hit.reason})`
      )
    }
  }

  // 公開ツール5ファイル横断同期・旧ブランド/廃止呼称ドリフト・POSTMORTEM分類監査（L-17, L-18, Issue #56）
  errors.push(...auditPublishedToolSync(root))
  errors.push(...auditBrandAndRoleTerminology(root))
  const postmortemPath = path.join(root, 'docs', 'POSTMORTEM_AND_LESSONS.md')
  if (fs.existsSync(postmortemPath)) {
    errors.push(
      ...auditPostmortemClassification(
        fs.readFileSync(postmortemPath, 'utf-8'),
        'docs/POSTMORTEM_AND_LESSONS.md'
      )
    )
  }

  const PUBLIC_BOUNDARY_PAGES = [
    'src/pages/contact.astro',
    'src/pages/about.astro',
    'src/pages/index.astro',
  ]
  for (const rel of PUBLIC_BOUNDARY_PAGES) {
    const full = path.join(root, rel)
    if (!fs.existsSync(full)) continue
    const pageText = fs.readFileSync(full, 'utf-8')
    const forbiddenPageMatch = pageText.match(
      /マネタイズ|非YMYL|収益目標|従業員兼最終責任者|AutoGrowth Studio|Wave\s+\d+\s*予定/i
    )
    if (forbiddenPageMatch) {
      errors.push(
        `[PublicBoundary] ${rel} contains internal jargon: "${forbiddenPageMatch[0]}"`
      )
    }
  }

  // src/data/tools.ts の published ツールとビルド成果物・ページの整合性
  const toolsTs = fs.readFileSync(path.join(root, 'src', 'data', 'tools.ts'), 'utf-8')
  const toolBlocks = toolsTs.match(/\{[\s\S]*?slug:\s*'[^']+'[\s\S]*?\}/g) || []
  const publishedSlugs = []

  for (const block of toolBlocks) {
    const slugMatch = block.match(/slug:\s*'([^']+)'/)
    const statusMatch = block.match(/status:\s*'([^']+)'/)
    if (slugMatch && statusMatch && statusMatch[1] === 'published') {
      publishedSlugs.push(slugMatch[1])
    }
  }

  if (publishedSlugs.length === 0) {
    errors.push('[Registry] No published tools found in src/data/tools.ts')
  }

  for (const slug of publishedSlugs) {
    const astroPage = path.join(root, 'src', 'pages', 'tools', `${slug}.astro`)
    const builtPage = path.join(root, 'dist', 'tools', slug, 'index.html')
    if (!fs.existsSync(astroPage)) {
      errors.push(`[Registry] Missing Astro page for published tool: ${slug}`)
    }
    if (!docsOnly && !fs.existsSync(builtPage)) {
      errors.push(`[Registry] Missing built HTML for published tool: ${slug}`)
    }
  }

  // 単体テスト数の確認
  const testsDir = path.join(root, 'src', 'lib', 'tools', '__tests__')
  const testFiles = fs.existsSync(testsDir)
    ? fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.ts'))
    : []
  if (testFiles.length < publishedSlugs.length) {
    errors.push(
      `[Tests] Expected at least ${publishedSlugs.length} tool unit test files in src/lib/tools/__tests__/, found ${testFiles.length}`
    )
  }

  // LLM料金データ構造（決定的）＆ 時刻依存鮮度/改定日チェック（--time-sensitive のみエラー）
  const pricingFile = path.join(root, 'src', 'data', 'llm-pricing.ts')
  const pricingText = fs.readFileSync(pricingFile, 'utf-8')
  const verifiedMatch = pricingText.match(
    /PRICING_LAST_VERIFIED\s*=\s*'(\d{4}-\d{2}-\d{2})'/
  )
  if (!verifiedMatch) {
    errors.push(
      '[Pricing] PRICING_LAST_VERIFIED not found in src/data/llm-pricing.ts'
    )
  } else if (!isValidIsoDateString(verifiedMatch[1])) {
    errors.push(
      `[Pricing] Invalid PRICING_LAST_VERIFIED date: ${verifiedMatch[1]}`
    )
  } else {
    const verifiedDate = new Date(`${verifiedMatch[1]}T00:00:00Z`)
    const ageDays = (nowMs - verifiedDate.getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays < -1) {
      const msg = `[Pricing] PRICING_LAST_VERIFIED (${verifiedMatch[1]}) cannot be in the future.`
      if (timeSensitive) errors.push(msg)
      else warnings.push(`[Pricing Warning] ${msg}`)
    } else if (ageDays > MAX_PRICING_AGE_DAYS) {
      const msg = `[Pricing] PRICING_LAST_VERIFIED (${verifiedMatch[1]}) is ${Math.floor(ageDays)} days old (> ${MAX_PRICING_AGE_DAYS} days). Re-verify latest LLM models and official rates.`
      if (timeSensitive) errors.push(msg)
      else warnings.push(`[Pricing Warning] ${msg}`)
    }
  }

  // 公式料金ソースURL検査
  const officialSourcesBlockMatch = pricingText.match(
    /export const OFFICIAL_PRICING_SOURCES\s*=\s*\{([\s\S]*?)\}\s*as const/
  )
  const officialSources = {}
  if (!officialSourcesBlockMatch) {
    errors.push(
      '[Pricing] OFFICIAL_PRICING_SOURCES not found in src/data/llm-pricing.ts'
    )
  } else {
    for (const m of officialSourcesBlockMatch[1].matchAll(
      /(\w+)\s*:\s*'(https:\/\/[^']+)'/g
    )) {
      officialSources[m[1]] = m[2]
    }
    for (const provider of REQUIRED_PROVIDERS) {
      if (!officialSources[provider]) {
        errors.push(
          `[Pricing] Missing official https:// URL for provider "${provider}" in OFFICIAL_PRICING_SOURCES`
        )
      }
    }
  }

  const modelBlocks = extractTopLevelArrayObjects(
    pricingText,
    'export const LLM_MODELS'
  )
  if (modelBlocks.length === 0) {
    errors.push(
      '[Pricing] No models found in LLM_MODELS in src/data/llm-pricing.ts'
    )
  }

  const coveredProviders = new Set()
  const seenModelIds = new Set()
  let validBenchmarkModelCount = 0

  const benchmarkSourceBlockMatch = pricingText.match(
    /export const OFFICIAL_BENCHMARK_SOURCE\s*=\s*\{([\s\S]*?)\}\s*as const/
  )
  const officialBenchmarkUrlMatch = benchmarkSourceBlockMatch
    ? benchmarkSourceBlockMatch[1].match(/url:\s*'(https:\/\/[^']+)'/)
    : null
  const officialBenchmarkUrl = officialBenchmarkUrlMatch?.[1] || ''
  if (!officialBenchmarkUrl) {
    errors.push(
      '[Benchmark] OFFICIAL_BENCHMARK_SOURCE.url (https://...) not found in src/data/llm-pricing.ts'
    )
  }

  for (const block of modelBlocks) {
    const idMatch = block.match(/id:\s*'([^']+)'/)
    const providerMatch = block.match(/provider:\s*'([^']+)'/)
    const releasedMatch = block.match(/releasedAt:\s*'([^']+)'/)
    const effectiveUntilMatch = block.match(/priceEffectiveUntil:\s*'([^']+)'/)
    const scheduledMatch = block.match(/scheduledPricing\s*:\s*\{([\s\S]*?)\}/)
    const literalSourceMatch = block.match(/sourceUrl:\s*'([^']+)'/)
    const refSourceMatch = block.match(
      /sourceUrl:\s*OFFICIAL_PRICING_SOURCES\.(\w+)/
    )

    const id = idMatch?.[1] || '(unknown)'
    if (!idMatch) {
      errors.push('[Pricing] Model entry missing id')
    } else {
      if (seenModelIds.has(id)) {
        errors.push(`[Pricing] Duplicate model id detected: ${id}`)
      }
      seenModelIds.add(id)
      if (RETIRED_MODEL_IDS.has(id)) {
        errors.push(
          `[Pricing] Retired or stale legacy model id "${id}" is prohibited in LLM_MODELS.`
        )
      }
    }

    if (!providerMatch) {
      errors.push(`[Pricing] Model "${id}" missing provider`)
    } else {
      coveredProviders.add(providerMatch[1])
    }

    if (!releasedMatch || !/^\d{4}-\d{2}$/.test(releasedMatch[1])) {
      errors.push(
        `[Pricing] Model "${id}" must have releasedAt in YYYY-MM format`
      )
    }

    let resolvedSourceUrl = ''
    if (literalSourceMatch && literalSourceMatch[1].startsWith('https://')) {
      resolvedSourceUrl = literalSourceMatch[1]
    } else if (refSourceMatch && officialSources[refSourceMatch[1]]) {
      resolvedSourceUrl = officialSources[refSourceMatch[1]]
    }
    if (!resolvedSourceUrl) {
      errors.push(`[Pricing] Model "${id}" missing valid https:// sourceUrl`)
    }

    if (effectiveUntilMatch) {
      const untilStr = effectiveUntilMatch[1]
      if (!isValidIsoDateString(untilStr)) {
        errors.push(
          `[Pricing] Model "${id}" has invalid priceEffectiveUntil date: ${untilStr}`
        )
      } else {
        const expiryMs = new Date(`${untilStr}T23:59:59Z`).getTime()
        const msRemaining = expiryMs - nowMs
        if (msRemaining < 0) {
          const msg = `[Pricing] Price transition deadline expired for "${id}" (priceEffectiveUntil=${untilStr}). Update official pricing.`
          if (timeSensitive) errors.push(msg)
          else warnings.push(`[Pricing Warning] ${msg}`)
        } else if (msRemaining <= TRANSITION_WARN_DAYS * 24 * 60 * 60 * 1000) {
          warnings.push(
            `[Pricing Warning] Upcoming price transition within ${TRANSITION_WARN_DAYS} days: ${id} (until ${untilStr})`
          )
        }
      }
    }

    if (scheduledMatch) {
      const schedBody = scheduledMatch[1]
      const effFromMatch = schedBody.match(/effectiveFrom:\s*'([^']+)'/)
      const schedInputMatch = schedBody.match(/inputPerMillionUsd:\s*([\d.]+)/)
      const schedOutputMatch = schedBody.match(/outputPerMillionUsd:\s*([\d.]+)/)
      const schedCachedMatch = schedBody.match(
        /cachedInputPerMillionUsd:\s*([\d.]+)/
      )
      const schedNotesMatch = schedBody.match(/notes:\s*'([^']*)'/)

      if (!effFromMatch || !isValidIsoDateString(effFromMatch[1])) {
        errors.push(
          `[Pricing] Model "${id}" scheduledPricing must have valid effectiveFrom YYYY-MM-DD`
        )
      } else if (effectiveUntilMatch && isValidIsoDateString(effectiveUntilMatch[1])) {
        const untilMs = new Date(`${effectiveUntilMatch[1]}T00:00:00Z`).getTime()
        const fromMs = new Date(`${effFromMatch[1]}T00:00:00Z`).getTime()
        if (fromMs - untilMs !== 24 * 60 * 60 * 1000) {
          errors.push(
            `[Pricing] Model "${id}" scheduledPricing.effectiveFrom (${effFromMatch[1]}) must be the exact day after priceEffectiveUntil (${effectiveUntilMatch[1]})`
          )
        }
      }

      if (!schedInputMatch || !schedOutputMatch || !schedCachedMatch) {
        errors.push(
          `[Pricing] Model "${id}" scheduledPricing missing numeric rates`
        )
      } else {
        const sInput = Number(schedInputMatch[1])
        const sOutput = Number(schedOutputMatch[1])
        const sCached = Number(schedCachedMatch[1])
        if (
          !Number.isFinite(sInput) ||
          !Number.isFinite(sOutput) ||
          !Number.isFinite(sCached) ||
          sCached < 0 ||
          sCached > sInput ||
          sInput > sOutput
        ) {
          errors.push(
            `[Pricing] Model "${id}" scheduledPricing rates violate 0 <= cached <= input <= output`
          )
        }
      }

      if (!schedNotesMatch || !schedNotesMatch[1].trim()) {
        errors.push(
          `[Pricing] Model "${id}" scheduledPricing must include non-empty notes`
        )
      }
    }

    // ベンチマーク構造・範囲・出典チェック（Issue #79）
    const benchMatch = block.match(/benchmarks\s*:\s*\{([\s\S]*?)\}/)
    if (!benchMatch) {
      errors.push(`[Benchmark] Model "${id}" missing benchmarks profile`)
    } else {
      const benchBody = benchMatch[1]
      const overallMatch = benchBody.match(/overall:\s*(null|-?[\d.]+)/)
      const codingMatch = benchBody.match(/coding:\s*(null|-?[\d.]+)/)
      const benchUrlLiteral = benchBody.match(/sourceUrl:\s*'([^']+)'/)
      const benchUrlRef = benchBody.includes('OFFICIAL_BENCHMARK_SOURCE.url')

      for (const [metricName, m] of [
        ['overall', overallMatch],
        ['coding', codingMatch],
      ]) {
        if (!m) {
          errors.push(
            `[Benchmark] Model "${id}" benchmarks missing "${metricName}" field`
          )
        } else if (m[1] !== 'null') {
          const val = Number(m[1])
          if (!Number.isFinite(val) || val <= 0 || val > 100) {
            errors.push(
              `[Benchmark] Model "${id}" benchmarks.${metricName} (${m[1]}) must be null or in (0, 100]`
            )
          }
        }
      }

      if (overallMatch && overallMatch[1] !== 'null') {
        validBenchmarkModelCount += 1
      }

      const resolvedBenchUrl = benchUrlRef
        ? officialBenchmarkUrl
        : benchUrlLiteral?.[1] || ''
      if (!resolvedBenchUrl.startsWith('https://')) {
        errors.push(
          `[Benchmark] Model "${id}" benchmarks.sourceUrl must be a valid https:// URL`
        )
      }
    }
  }

  if (
    modelBlocks.length > 0 &&
    validBenchmarkModelCount < Math.ceil(modelBlocks.length * 0.5)
  ) {
    errors.push(
      `[Benchmark] At least 50% of LLM_MODELS must have non-null overall benchmark scores (found ${validBenchmarkModelCount}/${modelBlocks.length})`
    )
  }

  for (const provider of REQUIRED_PROVIDERS) {
    if (!coveredProviders.has(provider)) {
      errors.push(
        `[Pricing] Provider "${provider}" has no models in LLM_MODELS`
      )
    }
  }

  return {
    errors,
    warnings,
    stats: {
      memoryFilesCount: REQUIRED_MEMORY_FILES.length,
      publishedCount: publishedSlugs.length,
      testFilesCount: testFiles.length,
      modelCount: modelBlocks.length,
      verifiedDate: verifiedMatch?.[1] || 'unknown',
      timeSensitive,
    },
  }
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
  const docsOnly = process.argv.includes('--docs-only')
  const timeSensitive = process.argv.includes('--time-sensitive')
  const nowArg = process.argv.find((a) => a.startsWith('--now='))
  const now = nowArg ? nowArg.slice('--now='.length) : new Date()

  const { errors, warnings, stats } = runOrgMemoryAudit({
    root: process.cwd(),
    docsOnly,
    timeSensitive,
    now,
  })

  for (const warning of warnings) {
    console.log(warning)
  }

  if (errors.length > 0) {
    console.error('audit:memory FAILED:')
    for (const err of errors) {
      console.error(`  - ${err}`)
    }
    process.exit(1)
  }

  console.log(
    `audit:memory PASSED (${stats.memoryFilesCount} memory files, ${stats.publishedCount} published tools, ${stats.testFilesCount} test suites, ${stats.modelCount} current LLM models verified ${stats.verifiedDate}, mode=${stats.timeSensitive ? 'time-sensitive' : 'deterministic'}).`
  )
}
