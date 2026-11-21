#!/usr/bin/env node
/**
 * SEO・AdSenseポリシー・構造化データ・ページ間類似度 機械監査
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DIST_DIR = path.join(ROOT, 'dist')

const errors = []

if (!fs.existsSync(DIST_DIR)) {
  console.error('dist/ not found. Run npm run build first.')
  process.exit(1)
}

function walkHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkHtmlFiles(full, out)
    } else if (entry.name.endsWith('.html')) {
      out.push(full)
    }
  }
  return out
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '→')
    .replace(/&copy;/g, '©')
}

function extractMainVisibleText(html) {
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  const region = mainMatch ? mainMatch[1] : html
  const cleaned = region
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntities(cleaned).replace(/\s+/g, ' ').trim()
}

function buildCharTrigrams(text) {
  const compact = text.replace(/\s+/g, '')
  const set = new Set()
  for (let i = 0; i <= compact.length - 3; i++) {
    set.add(compact.slice(i, i + 3))
  }
  return set
}

function jaccardSimilarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const gram of a) {
    if (b.has(gram)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function resolveInternalRouteExists(href) {
  const clean = href.split('#')[0].split('?')[0]
  if (!clean.startsWith('/')) return true
  if (clean === '/') {
    return fs.existsSync(path.join(DIST_DIR, 'index.html'))
  }
  const rel = clean.replace(/^\/+/, '').replace(/\/+$/, '')
  const directFile = path.join(DIST_DIR, rel)
  const indexFile = path.join(DIST_DIR, rel, 'index.html')
  return (
    (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) ||
    fs.existsSync(indexFile)
  )
}

// 必須成果物チェック
const requiredArtifacts = [
  'index.html',
  'privacy/index.html',
  'terms/index.html',
  'about/index.html',
  'contact/index.html',
  'robots.txt',
  '_headers',
  'sitemap-index.xml',
]
for (const reqPath of requiredArtifacts) {
  if (!fs.existsSync(path.join(DIST_DIR, reqPath))) {
    errors.push(`[Artifact] Missing required built asset: dist/${reqPath}`)
  }
}

const htmlFiles = walkHtmlFiles(DIST_DIR)
const seenTitles = new Map()
const seenDescriptions = new Map()
const toolTexts = []

for (const filePath of htmlFiles) {
  const rel = path.relative(DIST_DIR, filePath).replace(/\\/g, '/')
  const route =
    rel === 'index.html' ? '/' : `/${rel.replace(/\/index\.html$/, '/')}`
  const html = fs.readFileSync(filePath, 'utf-8')

  // Title check
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : ''
  if (!title) {
    errors.push(`[SEO] ${route}: Missing <title>`)
  } else {
    if (title.length < 15 || title.length > 65) {
      errors.push(
        `[SEO] ${route}: <title> length ${title.length} outside 15..65 (${title})`
      )
    }
    if (seenTitles.has(title)) {
      errors.push(
        `[SEO] ${route}: Duplicate <title> with ${seenTitles.get(title)}`
      )
    }
    seenTitles.set(title, route)
  }

  // Meta description check
  const descMatch = html.match(
    /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i
  )
  const desc = descMatch ? decodeHtmlEntities(descMatch[1]).trim() : ''
  if (!desc) {
    errors.push(`[SEO] ${route}: Missing <meta name="description">`)
  } else {
    if (desc.length < 50 || desc.length > 165) {
      errors.push(
        `[SEO] ${route}: meta description length ${desc.length} outside 50..165`
      )
    }
    if (seenDescriptions.has(desc)) {
      errors.push(
        `[SEO] ${route}: Duplicate meta description with ${seenDescriptions.get(desc)}`
      )
    }
    seenDescriptions.set(desc, route)
  }

  // Canonical & OGP
  if (!/<link\s+rel=["']canonical["']/i.test(html)) {
    errors.push(`[SEO] ${route}: Missing canonical link`)
  }
  if (!/property=["']og:title["']/i.test(html)) {
    errors.push(`[SEO] ${route}: Missing og:title`)
  }

  // Single H1 check
  const h1Matches = html.match(/<h1\b[^>]*>/gi) || []
  if (h1Matches.length !== 1) {
    errors.push(
      `[SEO] ${route}: Expected exactly 1 <h1>, found ${h1Matches.length}`
    )
  }

  // Visible text length check
  const mainText = extractMainVisibleText(html)
  const isToolPage = route.startsWith('/tools/')
  const isLegalPage = ['/privacy/', '/terms/', '/about/', '/contact/'].includes(
    route
  )
  const minChars = isToolPage ? 1200 : isLegalPage ? 500 : 400
  if (mainText.length < minChars) {
    errors.push(
      `[Content] ${route}: Initial HTML visible text too short (${mainText.length} < ${minChars} chars)`
    )
  }

  // JSON-LD validation
  const ldMatches = Array.from(
    html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  )
  const ldTypes = new Set()
  for (const m of ldMatches) {
    try {
      const parsed = JSON.parse(m[1])
      if (parsed['@type']) ldTypes.add(String(parsed['@type']))
    } catch (e) {
      errors.push(`[JSON-LD] ${route}: Invalid JSON-LD syntax (${e.message})`)
    }
  }
  if (isToolPage) {
    if (!ldTypes.has('SoftwareApplication')) {
      errors.push(`[JSON-LD] ${route}: Missing SoftwareApplication schema`)
    }
    if (!ldTypes.has('FAQPage')) {
      errors.push(`[JSON-LD] ${route}: Missing FAQPage schema`)
    }
    toolTexts.push({ route, trigrams: buildCharTrigrams(mainText) })
  }

  // Internal link integrity check
  const hrefMatches = Array.from(
    html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)
  )
  for (const m of hrefMatches) {
    const href = m[1]
    if (
      href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('mailto:') ||
      href.startsWith('#')
    ) {
      continue
    }
    if (!resolveInternalRouteExists(href)) {
      errors.push(`[Links] ${route}: Broken internal link -> ${href}`)
    }
  }
}

// ツールページ間の3-gram類似度チェック（Scaled Content Abuse 防止）
for (let i = 0; i < toolTexts.length; i++) {
  for (let j = i + 1; j < toolTexts.length; j++) {
    const sim = jaccardSimilarity(toolTexts[i].trigrams, toolTexts[j].trigrams)
    if (sim >= 0.55) {
      errors.push(
        `[Uniqueness] High text similarity (${sim.toFixed(3)} >= 0.55) between ${toolTexts[i].route} and ${toolTexts[j].route}`
      )
    }
  }
}

if (errors.length > 0) {
  console.error('audit:seo FAILED:')
  for (const err of errors) {
    console.error(`  - ${err}`)
  }
  process.exit(1)
}

console.log(
  `audit:seo PASSED (${htmlFiles.length} HTML pages, ${toolTexts.length} tool guides, links, JSON-LD, and uniqueness verified).`
)
