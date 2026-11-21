#!/usr/bin/env node
/**
 * セキュリティ・ゼロ送信・絵文字禁止・ヘッダー・OSSライセンス機械監査
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC_DIR = path.join(ROOT, 'src')
const HEADERS_FILE = path.join(ROOT, 'public', '_headers')

const errors = []

function walkFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, result)
    } else {
      result.push(full)
    }
  }
  return result
}

const sourceFiles = walkFiles(SRC_DIR).filter((filePath) => {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/')
  if (rel.includes('__tests__/') || /\.test\.[tj]sx?$/.test(rel)) return false
  return /\.(astro|ts|tsx|js|jsx|css)$/.test(rel)
})

const FORBIDDEN_PATTERNS = [
  {
    label: 'Unauthorized fetch() call',
    regex: /\bfetch\s*\(/g,
  },
  {
    label: 'XMLHttpRequest usage',
    regex: /\bXMLHttpRequest\b/g,
  },
  {
    label: 'navigator.sendBeacon usage',
    regex: /navigator\.sendBeacon\b/g,
  },
  {
    label: 'WebSocket usage',
    regex: /\bnew\s+WebSocket\b/g,
  },
  {
    label: 'EventSource usage',
    regex: /\bnew\s+EventSource\b/g,
  },
  {
    label: 'External HTTP form action',
    regex: /<form[^>]+action\s*=\s*['"]https?:/gi,
  },
  {
    label: 'Dynamic eval() call',
    regex: /\beval\s*\(/g,
  },
  {
    label: 'Dynamic new Function() call',
    regex: /\bnew\s+Function\s*\(/g,
  },
  {
    label: 'React dangerouslySetInnerHTML usage',
    regex: /dangerouslySetInnerHTML/g,
  },
  {
    label: 'Hardcoded OpenAI/GitHub/AWS secret literal',
    regex: /(?<!\[)(?:ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}(?!\|)|sk-live-[A-Za-z0-9]{16,})/g,
  },
]

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu

for (const filePath of sourceFiles) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/')
  const content = fs.readFileSync(filePath, 'utf-8')

  for (const rule of FORBIDDEN_PATTERNS) {
    rule.regex.lastIndex = 0
    if (rule.regex.test(content)) {
      errors.push(`[Security] ${rel}: ${rule.label} detected`)
    }
  }

  // set:html は JSON-LD スクリプトタグ内のみ許容
  if (content.includes('set:html')) {
    const stripped = content.replace(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*set:html=\{[^}]+\}[^>]*\/>/g,
      ''
    )
    if (stripped.includes('set:html')) {
      errors.push(
        `[Security] ${rel}: set:html is restricted exclusively to application/ld+json script tags`
      )
    }
  }

  // Unicode 絵文字の完全禁止
  const emojiMatches = content.match(EMOJI_REGEX)
  if (emojiMatches && emojiMatches.length > 0) {
    errors.push(
      `[UI Policy] ${rel}: Unicode emoji detected (${Array.from(new Set(emojiMatches)).join(', ')})`
    )
  }
}

// Cloudflare Pages _headers 検証
if (!fs.existsSync(HEADERS_FILE)) {
  errors.push('[Headers] public/_headers is missing')
} else {
  const headersContent = fs.readFileSync(HEADERS_FILE, 'utf-8')
  if (headersContent.includes('\t')) {
    errors.push('[Headers] public/_headers contains tab characters (use 2 spaces only)')
  }
  const requiredHeaders = [
    'X-Frame-Options: DENY',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy:',
    'Permissions-Policy:',
    'Strict-Transport-Security:',
    'Content-Security-Policy:',
  ]
  for (const h of requiredHeaders) {
    if (!headersContent.includes(h)) {
      errors.push(`[Headers] public/_headers missing required directive: ${h}`)
    }
  }
}

// 直接依存パッケージのOSSライセンス監査
const pkgJson = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')
)
const directDeps = [
  ...Object.keys(pkgJson.dependencies || {}),
  ...Object.keys(pkgJson.devDependencies || {}),
]
const FORBIDDEN_LICENSE_RE = /\b(AGPL|GPL|LGPL|SSPL|BUSL)\b/i
const ALLOWED_LICENSE_RE =
  /\b(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|MPL-2\.0|BlueOak-1\.0\.0)\b/i

for (const dep of directDeps) {
  const depPkgPath = path.join(ROOT, 'node_modules', dep, 'package.json')
  if (!fs.existsSync(depPkgPath)) {
    errors.push(`[License] node_modules/${dep}/package.json not found`)
    continue
  }
  const depPkg = JSON.parse(fs.readFileSync(depPkgPath, 'utf-8'))
  const lic =
    typeof depPkg.license === 'string'
      ? depPkg.license
      : JSON.stringify(depPkg.license || '')
  if (!lic || FORBIDDEN_LICENSE_RE.test(lic) || !ALLOWED_LICENSE_RE.test(lic)) {
    errors.push(`[License] Disallowed or missing license for ${dep}: ${lic}`)
  }
}

if (errors.length > 0) {
  console.error('audit:security FAILED:')
  for (const err of errors) {
    console.error(`  - ${err}`)
  }
  process.exit(1)
}

console.log(
  `audit:security PASSED (${sourceFiles.length} source files, _headers, and ${directDeps.length} direct dependencies verified).`
)
