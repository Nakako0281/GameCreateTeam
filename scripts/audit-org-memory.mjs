#!/usr/bin/env node
/**
 * 組織永続メモリ・ツール台帳整合性・料金データ鮮度 機械監査
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const errors = []

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
  if (!fs.existsSync(builtPage)) {
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

// LLM料金データ鮮度チェック (45日以内)
const pricingFile = path.join(ROOT, 'src', 'data', 'llm-pricing.ts')
const pricingText = fs.readFileSync(pricingFile, 'utf-8')
const verifiedMatch = pricingText.match(
  /PRICING_LAST_VERIFIED\s*=\s*'(\d{4}-\d{2}-\d{2})'/
)
if (!verifiedMatch) {
  errors.push('[Pricing] PRICING_LAST_VERIFIED not found in src/data/llm-pricing.ts')
} else {
  const verifiedDate = new Date(`${verifiedMatch[1]}T00:00:00Z`)
  if (Number.isNaN(verifiedDate.getTime())) {
    errors.push(`[Pricing] Invalid PRICING_LAST_VERIFIED date: ${verifiedMatch[1]}`)
  } else {
    const ageDays = (Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > 45) {
      errors.push(
        `[Pricing] PRICING_LAST_VERIFIED (${verifiedMatch[1]}) is ${Math.floor(ageDays)} days old (> 45 days). Re-verify model rates.`
      )
    }
  }
}

if (errors.length > 0) {
  console.error('audit:memory FAILED:')
  for (const err of errors) {
    console.error(`  - ${err}`)
  }
  process.exit(1)
}

console.log(
  `audit:memory PASSED (${REQUIRED_MEMORY_FILES.length} memory files, ${publishedSlugs.length} published tools, ${testFiles.length} test suites, pricing verified ${verifiedMatch?.[1]}).`
)
