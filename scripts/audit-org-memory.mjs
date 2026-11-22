#!/usr/bin/env node
/**
 * 組織永続メモリ・ツール台帳整合性・LLM料金データ鮮度/改定日/退役モデル 機械監査
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DOCS_ONLY = process.argv.includes('--docs-only')
const errors = []
const warnings = []

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

for (const rel of REQUIRED_MEMORY_FILES) {
  const full = path.join(ROOT, rel)
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
const FORBIDDEN_SINGLE_TASK_RE = /1スライス|1タスク自律消化|最優先タスク・Issueを1つ/
for (const rel of ORG_POLICY_GUARD_FILES) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) continue
  const text = fs.readFileSync(full, 'utf-8')
  const matched = text.match(FORBIDDEN_SINGLE_TASK_RE)
  if (matched) {
    errors.push(
      `[OrgPolicy] Rigid single-task wording detected in ${rel}: "${matched[0]}" (violates L-09 Adaptive Batching)`
    )
  }
}

const dailyOpsPath = path.join(ROOT, '.agents', 'skills', 'daily-ops', 'SKILL.md')
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

// src/data/tools.ts の published ツールとビルド成果物・ページの整合性
const toolsTs = fs.readFileSync(
  path.join(ROOT, 'src', 'data', 'tools.ts'),
  'utf-8'
)
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
  const astroPage = path.join(ROOT, 'src', 'pages', 'tools', `${slug}.astro`)
  const builtPage = path.join(ROOT, 'dist', 'tools', slug, 'index.html')
  if (!fs.existsSync(astroPage)) {
    errors.push(`[Registry] Missing Astro page for published tool: ${slug}`)
  }
  if (!DOCS_ONLY && !fs.existsSync(builtPage)) {
    errors.push(`[Registry] Missing built HTML for published tool: ${slug}`)
  }
}

// 単体テスト数の確認
const testsDir = path.join(ROOT, 'src', 'lib', 'tools', '__tests__')
const testFiles = fs.existsSync(testsDir)
  ? fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.ts'))
  : []
if (testFiles.length < publishedSlugs.length) {
  errors.push(
    `[Tests] Expected at least ${publishedSlugs.length} tool unit test files in src/lib/tools/__tests__/, found ${testFiles.length}`
  )
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

// LLM料金データ鮮度・公式ソース・退役モデル・改定予定日チェック
const pricingFile = path.join(ROOT, 'src', 'data', 'llm-pricing.ts')
const pricingText = fs.readFileSync(pricingFile, 'utf-8')
const verifiedMatch = pricingText.match(
  /PRICING_LAST_VERIFIED\s*=\s*'(\d{4}-\d{2}-\d{2})'/
)
if (!verifiedMatch) {
  errors.push('[Pricing] PRICING_LAST_VERIFIED not found in src/data/llm-pricing.ts')
} else if (!isValidIsoDateString(verifiedMatch[1])) {
  errors.push(`[Pricing] Invalid PRICING_LAST_VERIFIED date: ${verifiedMatch[1]}`)
} else {
  const verifiedDate = new Date(`${verifiedMatch[1]}T00:00:00Z`)
  const ageDays = (Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays < -1) {
    errors.push(
      `[Pricing] PRICING_LAST_VERIFIED (${verifiedMatch[1]}) cannot be in the future.`
    )
  } else if (ageDays > MAX_PRICING_AGE_DAYS) {
    errors.push(
      `[Pricing] PRICING_LAST_VERIFIED (${verifiedMatch[1]}) is ${Math.floor(ageDays)} days old (> ${MAX_PRICING_AGE_DAYS} days). Re-verify latest LLM models and official rates.`
    )
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

const modelBlocks = extractTopLevelArrayObjects(pricingText, 'export const LLM_MODELS')
if (modelBlocks.length === 0) {
  errors.push('[Pricing] No models found in LLM_MODELS in src/data/llm-pricing.ts')
}

const coveredProviders = new Set()
const seenModelIds = new Set()

for (const block of modelBlocks) {
  const idMatch = block.match(/id:\s*'([^']+)'/)
  const providerMatch = block.match(/provider:\s*'([^']+)'/)
  const releasedMatch = block.match(/releasedAt:\s*'([^']+)'/)
  const effectiveUntilMatch = block.match(/priceEffectiveUntil:\s*'([^']+)'/)
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
    errors.push(
      `[Pricing] Model "${id}" missing valid https:// sourceUrl`
    )
  }

  if (effectiveUntilMatch) {
    const untilStr = effectiveUntilMatch[1]
    if (!isValidIsoDateString(untilStr)) {
      errors.push(
        `[Pricing] Model "${id}" has invalid priceEffectiveUntil date: ${untilStr}`
      )
    } else {
      const expiryMs = new Date(`${untilStr}T23:59:59Z`).getTime()
      const msRemaining = expiryMs - Date.now()
      if (msRemaining < 0) {
        errors.push(
          `[Pricing] Price transition deadline expired for "${id}" (priceEffectiveUntil=${untilStr}). Update official pricing.`
        )
      } else if (msRemaining <= TRANSITION_WARN_DAYS * 24 * 60 * 60 * 1000) {
        warnings.push(
          `[Pricing Warning] Upcoming price transition within ${TRANSITION_WARN_DAYS} days: ${id} (until ${untilStr})`
        )
      }
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
  `audit:memory PASSED (${REQUIRED_MEMORY_FILES.length} memory files, ${publishedSlugs.length} published tools, ${testFiles.length} test suites, ${modelBlocks.length} current LLM models verified ${verifiedMatch?.[1]}).`
)
