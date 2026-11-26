#!/usr/bin/env node
/**
 * SEO・AdSenseポリシー・構造化データ・ページ間類似度・ゼロ送信表現 機械監査
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ABSOLUTE_ONE_BYTE_RE =
  /(?:1|１|一)\s*バイトも[^。！？\n]{0,16}(?:送(?:信|ら|り)|通信)/g

const UNQUALIFIED_ZERO_CLAIM_RES = [
  /(?:外部通信|外部送信|サーバー送信|通信)(?:\s*|[がはもを])(?:一切)?(?:ゼロ|0\s*件|なし|発生(?:しない|しません|せず)|行わ(?:ない|ず)|行いません)/g,
  /ゼロ送信/g,
]

const INPUT_SCOPE_QUALIFIER_RE =
  /(?:入力(?:データ|内容|テキスト|文章|ファイル|プロンプト)|ファイル(?:内容|の中身)?|処理(?:データ|内容|結果)|個人情報|機密|秘匿|画像|CSV|ツール由来|原本)/

const CLAUSE_BOUNDARY_RE = /[。！？\r\n|｜・—]/

const FORBIDDEN_CANONICAL_HOST_RE =
  /(?:^|\.)(?:example\.com|pages\.dev|workers\.dev)$/i

export function validateRobotsAndCanonical({
  robotsTxt = '',
  canonicalEntries = [],
  sitemapXmls = [],
} = {}) {
  const errors = []

  const sitemapLineMatch = String(robotsTxt || '').match(/^Sitemap:\s*(\S+)\s*$/m)
  if (!sitemapLineMatch) {
    errors.push('[SEO] robots.txt missing Sitemap: directive')
  } else {
    const sitemapUrl = sitemapLineMatch[1]
    if (!sitemapUrl.startsWith('https://')) {
      errors.push(
        `[SEO] robots.txt Sitemap directive must be an absolute https:// URL (got "${sitemapUrl}")`
      )
    } else {
      try {
        const parsed = new URL(sitemapUrl)
        if (FORBIDDEN_CANONICAL_HOST_RE.test(parsed.hostname)) {
          errors.push(
            `[SEO] robots.txt Sitemap URL points to placeholder/preview host "${parsed.hostname}"`
          )
        }
      } catch {
        errors.push(`[SEO] robots.txt Sitemap URL is invalid: "${sitemapUrl}"`)
      }
    }
  }

  for (const { route, href } of canonicalEntries) {
    if (!href) {
      errors.push(`[SEO] ${route}: Missing canonical href`)
      continue
    }
    if (!href.startsWith('https://')) {
      errors.push(
        `[SEO] ${route}: Canonical href must be an absolute https:// URL (got "${href}")`
      )
      continue
    }
    try {
      const parsed = new URL(href)
      if (FORBIDDEN_CANONICAL_HOST_RE.test(parsed.hostname)) {
        errors.push(
          `[SEO] ${route}: Canonical URL points to placeholder/preview noindex host "${parsed.hostname}"`
        )
      }
    } catch {
      errors.push(`[SEO] ${route}: Invalid canonical URL "${href}"`)
    }
  }

  for (const { name, content } of sitemapXmls) {
    for (const locMatch of String(content || '').matchAll(/<loc>([^<]+)<\/loc>/gi)) {
      const loc = locMatch[1].trim()
      try {
        const parsed = new URL(loc)
        if (FORBIDDEN_CANONICAL_HOST_RE.test(parsed.hostname)) {
          errors.push(
            `[SEO] ${name}: Sitemap <loc> points to placeholder/preview host "${parsed.hostname}" (${loc})`
          )
          break
        }
      } catch {
        errors.push(`[SEO] ${name}: Invalid <loc> URL "${loc}"`)
        break
      }
    }
  }

  return errors
}

function getClausePrefix(text, index, maxLookback = 24) {
  const start = Math.max(0, index - maxLookback)
  const rawSlice = text.slice(start, index)
  let lastBoundary = -1
  for (let i = rawSlice.length - 1; i >= 0; i--) {
    if (CLAUSE_BOUNDARY_RE.test(rawSlice[i])) {
      lastBoundary = i
      break
    }
  }
  return lastBoundary >= 0 ? rawSlice.slice(lastBoundary + 1) : rawSlice
}

/**
 * 広告・アクセス解析有効時に誤解を招く無条件の「ゼロ送信 / 外部通信ゼロ」表現を検出する
 */
export function findUnqualifiedZeroSendClaims(text) {
  if (!text) return []
  const hits = []

  ABSOLUTE_ONE_BYTE_RE.lastIndex = 0
  let m
  while ((m = ABSOLUTE_ONE_BYTE_RE.exec(text)) !== null) {
    hits.push({
      phrase: m[0],
      index: m.index,
      reason: 'unconditional-one-byte-claim',
    })
  }

  for (const baseRe of UNQUALIFIED_ZERO_CLAIM_RES) {
    const re = new RegExp(baseRe.source, baseRe.flags)
    while ((m = re.exec(text)) !== null) {
      const prefix = getClausePrefix(text, m.index, 24)
      if (!INPUT_SCOPE_QUALIFIER_RE.test(prefix)) {
        hits.push({
          phrase: m[0],
          index: m.index,
          reason: 'missing-input-scope-qualifier',
        })
      }
    }
  }

  hits.sort((a, b) => a.index - b.index)
  return hits
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

function stripTagsToVisibleText(fragment) {
  const cleaned = fragment
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntities(cleaned).replace(/\s+/g, ' ').trim()
}

function extractMainVisibleText(html) {
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  const region = mainMatch ? mainMatch[1] : html
  return stripTagsToVisibleText(region)
}

function extractFooterVisibleText(html) {
  const footerMatch = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)
  return footerMatch ? stripTagsToVisibleText(footerMatch[1]) : ''
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

function resolveInternalRouteExists(distDir, href) {
  const clean = href.split('#')[0].split('?')[0]
  if (!clean.startsWith('/')) return true
  if (clean === '/') {
    return fs.existsSync(path.join(distDir, 'index.html'))
  }
  const rel = clean.replace(/^\/+/, '').replace(/\/+$/, '')
  const directFile = path.join(distDir, rel)
  const indexFile = path.join(distDir, rel, 'index.html')
  return (
    (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) ||
    fs.existsSync(indexFile)
  )
}

export function runSeoAudit({ root = process.cwd() } = {}) {
  const distDir = path.join(root, 'dist')
  const errors = []

  if (!fs.existsSync(distDir)) {
    throw new Error('dist/ not found. Run npm run build first.')
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
    if (!fs.existsSync(path.join(distDir, reqPath))) {
      errors.push(`[Artifact] Missing required built asset: dist/${reqPath}`)
    }
  }

  // README.md の誇大・無条件ゼロ送信表現チェック
  const readmePath = path.join(root, 'README.md')
  if (fs.existsSync(readmePath)) {
    const readmeText = fs.readFileSync(readmePath, 'utf-8')
    const readmeClaims = findUnqualifiedZeroSendClaims(readmeText)
    for (const hit of readmeClaims) {
      errors.push(
        `[ClaimAccuracy] README.md contains unqualified zero-send claim "${hit.phrase}" (${hit.reason})`
      )
    }
  }

  const htmlFiles = walkHtmlFiles(distDir)
  const seenTitles = new Map()
  const seenDescriptions = new Map()
  const toolTexts = []
  const canonicalEntries = []

  for (const filePath of htmlFiles) {
    const rel = path.relative(distDir, filePath).replace(/\\/g, '/')
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
    const canonicalMatch = html.match(
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']\s*\/?>/i
    )
    if (!canonicalMatch) {
      errors.push(`[SEO] ${route}: Missing canonical link`)
    } else {
      canonicalEntries.push({ route, href: canonicalMatch[1].trim() })
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
    const footerText = extractFooterVisibleText(html)
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

    // 無条件のゼロ送信・外部通信ゼロ表現チェック（title / description / main / footer）
    const regionsToCheck = [
      { label: 'title', text: title },
      { label: 'meta description', text: desc },
      { label: 'main', text: mainText },
      ...(route === '/' ? [{ label: 'footer', text: footerText }] : []),
    ]
    for (const region of regionsToCheck) {
      const claimHits = findUnqualifiedZeroSendClaims(region.text)
      for (const hit of claimHits) {
        errors.push(
          `[ClaimAccuracy] ${route} (${region.label}): Unqualified zero-send claim "${hit.phrase}" (${hit.reason})`
        )
      }
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
      if (!resolveInternalRouteExists(distDir, href)) {
        errors.push(`[Links] ${route}: Broken internal link -> ${href}`)
      }
    }
  }

  // robots.txt / Canonical / Sitemap の本番オリジン妥当性チェック（L-17）
  const robotsDistPath = path.join(distDir, 'robots.txt')
  const robotsTxt = fs.existsSync(robotsDistPath)
    ? fs.readFileSync(robotsDistPath, 'utf-8')
    : ''
  const sitemapXmls = fs
    .readdirSync(distDir)
    .filter((name) => /^sitemap.*\.xml$/i.test(name))
    .map((name) => ({
      name,
      content: fs.readFileSync(path.join(distDir, name), 'utf-8'),
    }))
  errors.push(
    ...validateRobotsAndCanonical({
      robotsTxt,
      canonicalEntries,
      sitemapXmls,
    })
  )

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

  return {
    errors,
    stats: {
      htmlCount: htmlFiles.length,
      toolCount: toolTexts.length,
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
  let result
  try {
    result = runSeoAudit({ root: process.cwd() })
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  if (result.errors.length > 0) {
    console.error('audit:seo FAILED:')
    for (const err of result.errors) {
      console.error(`  - ${err}`)
    }
    process.exit(1)
  }

  console.log(
    `audit:seo PASSED (${result.stats.htmlCount} HTML pages, ${result.stats.toolCount} tool guides, links, JSON-LD, claim accuracy, and uniqueness verified).`
  )
}
