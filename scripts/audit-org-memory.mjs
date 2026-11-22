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
]

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

  // 組織運用ルール退行ガード（L-09: 硬直的な1タスク固定の禁止 & Adaptive Batching 存在検証）
  const ORG_POLICY_GUARD_FILES = [
    'AGENTS.md',
    '.agents/skills/daily-ops/SKILL.md',
    'docs/HUMAN_OPERATIONS_GUIDE.md',
  ]
  const FORBIDDEN_SINGLE_TASK_RE =
    /1スライス|1タスク自律消化|最優先タスク・Issueを1つ/
  for (const rel of ORG_POLICY_GUARD_FILES) {
    const full = path.join(root, rel)
    if (!fs.existsSync(full)) continue
    const text = fs.readFileSync(full, 'utf-8')
    const matched = text.match(FORBIDDEN_SINGLE_TASK_RE)
    if (matched) {
      errors.push(
        `[OrgPolicy] Rigid single-task wording detected in ${rel}: "${matched[0]}" (violates L-09 Adaptive Batching)`
      )
    }
  }

  const dailyOpsPath = path.join(root, '.agents', 'skills', 'daily-ops', 'SKILL.md')
  if (fs.existsSync(dailyOpsPath)) {
    const dailyOpsText = fs.readFileSync(dailyOpsPath, 'utf-8')
    for (const requiredToken of ['Size S', 'Size M', 'Size L', 'Adaptive']) {
      if (!dailyOpsText.includes(requiredToken)) {
        errors.push(
          `[OrgPolicy] .agents/skills/daily-ops/SKILL.md missing Adaptive Batching criteria: "${requiredToken}"`
        )
      }
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

  // 正本・スキル・ワークフロー間の信頼境界・廃止キー整合チェック
  const agentsMdPath = path.join(root, 'AGENTS.md')
  if (fs.existsSync(agentsMdPath)) {
    const agentsText = fs.readFileSync(agentsMdPath, 'utf-8')
    if (
      !agentsText.includes('trusted_issues') ||
      !agentsText.includes('external_issues')
    ) {
      errors.push(
        '[TrustBoundary] AGENTS.md must define trusted_issues and external_issues trust boundary'
      )
    }
  }
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

  // 公開境界リーク防止ガード（L-11: README・公開画面への内部マネタイズ/組織用語混入禁止）
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
