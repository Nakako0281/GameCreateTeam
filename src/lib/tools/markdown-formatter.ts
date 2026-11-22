export type FormatTarget = 'word' | 'excel' | 'slack' | 'plain'

export type SlackTableStyle = 'codeblock' | 'bullets'

export type TableAlign = 'left' | 'center' | 'right' | null

export interface FormatterOptions {
  normalizeMath: boolean
  stripAiCitations: boolean
  guardFormulaInjection: boolean
  slackTableStyle: SlackTableStyle
  collapseBlankLines: boolean
}

export const DEFAULT_FORMATTER_OPTIONS: FormatterOptions = {
  normalizeMath: true,
  stripAiCitations: true,
  guardFormulaInjection: true,
  slackTableStyle: 'codeblock',
  collapseBlankLines: true,
}

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'strike'; children: InlineNode[] }
  | { type: 'code'; code: string }
  | { type: 'link'; label: InlineNode[]; url: string; safe: boolean }
  | { type: 'image'; alt: string; url: string }
  | { type: 'br' }

export interface ListItemNode {
  ordered: boolean
  number?: number
  task?: 'checked' | 'unchecked'
  content: InlineNode[]
  children: ListItemNode[]
}

export type BlockNode =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'codeblock'; lang: string; code: string }
  | { type: 'blockquote'; blocks: BlockNode[] }
  | { type: 'list'; ordered: boolean; items: ListItemNode[] }
  | {
      type: 'table'
      headers: InlineNode[][]
      alignments: TableAlign[]
      rows: InlineNode[][][]
    }
  | { type: 'hr' }

export interface ExtractedTable {
  index: number
  title: string
  headers: string[]
  rows: string[][]
  tsv: string
  csv: string
  formulaDangerCount: number
  leadingZeroCount: number
}

export interface FormatStats {
  headingCount: number
  tableCount: number
  codeBlockCount: number
  listItemCount: number
  formulaDangerCount: number
  blockedUnsafeLinks: number
  blockedExternalImages: number
}

export interface FormattedResult {
  blocks: BlockNode[]
  richHtml: string
  plainText: string
  slackText: string
  tables: ExtractedTable[]
  allTablesTsv: string
  stats: FormatStats
}

export const SAMPLE_AI_MARKDOWN = `# 四半期業務改善レポート案[1]

今回の導入テストでは、処理時間の削減と手戻りの防止で**高い効果**が確認されました[1][2]。
旧手順の一部（~~手動転記フロー~~）は廃止し、詳細は[公式ガイドライン](https://example.com/docs/guide?utm_source=chatgpt.com&section=2)を参照してください。

## 1. 部門別の検証結果サマリー

| 部門 | 削減時間 | 主な改善内容 | 担当者コード |
| :--- | :---: | :--- | :---: |
| 営業企画 | 12.5時間/週 | **定例資料**の自動集計<br>顧客リストの整形 | 00124 |
| カスタマー対応 | 8.0時間/週 | 返信テンプレート標準化 | 00458 |
| 情報システム | -1.5時間 | 初期設定スクリプト整備 | 00901 |

## 2. 今週のアクションと試算

- [x] 営業企画チームへ共有（確認済み）
  - [ ] 週次定例での運用フィードバック収集
- [ ] 次期フェーズのROI試算：$ROI = \\frac{120 - 80}{80} \\times 100 = 50\\%$ （予算目安 $1,200）

\`\`\`python
# このコードブロック内の # や ** や | は変換されません
def calc_summary(rows):
    total = sum(r["hours"] for r in rows)
    return f"total={total} | status=**ok**"
\`\`\`
`

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'yclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
])

const LATEX_SYMBOL_MAP: Record<string, string> = {
  '\\times': '×',
  '\\cdot': '・',
  '\\div': '÷',
  '\\pm': '±',
  '\\mp': '∓',
  '\\approx': '≈',
  '\\neq': '≠',
  '\\ne': '≠',
  '\\leq': '≤',
  '\\le': '≤',
  '\\geq': '≥',
  '\\ge': '≥',
  '\\to': '→',
  '\\rightarrow': '→',
  '\\leftarrow': '←',
  '\\iff': '⇔',
  '\\Rightarrow': '⇒',
  '\\infty': '∞',
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\Delta': 'Δ',
  '\\epsilon': 'ε',
  '\\theta': 'θ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\pi': 'π',
  '\\sigma': 'σ',
  '\\Sigma': 'Σ',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\phi': 'φ',
  '\\omega': 'ω',
  '\\Omega': 'Ω',
  '\\%': '%',
}

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  'n': 'ⁿ',
}

interface ParseStats {
  blockedUnsafeLinks: number
  blockedExternalImages: number
}

function normalizeNewlines(input: string): string {
  return input.replace(/\r\n?/g, '\n')
}

export function isSafeUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim()
  if (!trimmed) return false
  // 制御文字・空白がスキーム前に紛れる攻撃を拒否
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false
  return /^(?:https?:\/\/|mailto:)/i.test(trimmed)
}

export function cleanUrl(rawUrl: string, stripTracking: boolean): string {
  const trimmed = rawUrl.trim()
  if (!stripTracking || !/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  try {
    const parsed = new URL(trimmed)
    let modified = false
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key)
        modified = true
      }
    }
    return modified ? parsed.toString() : trimmed
  } catch {
    return trimmed
  }
}

function readBracedArg(
  input: string,
  startIdx: number
): { value: string; nextIdx: number } | null {
  let idx = startIdx
  while (idx < input.length && input[idx] === ' ') idx++
  if (idx >= input.length || input[idx] !== '{') return null
  let depth = 0
  let out = ''
  for (let i = idx; i < input.length; i++) {
    const ch = input[i]
    if (ch === '{') {
      if (depth > 0) out += ch
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        return { value: out, nextIdx: i + 1 }
      }
      out += ch
    } else {
      out += ch
    }
  }
  return null
}

function replaceLatexCommandWithTwoArgs(
  text: string,
  cmd: string,
  formatter: (a: string, b: string) => string
): string {
  let result = text
  let searchFrom = 0
  while (true) {
    const idx = result.indexOf(cmd, searchFrom)
    if (idx < 0) break
    const afterCmd = idx + cmd.length
    if (afterCmd < result.length && /[A-Za-z]/.test(result[afterCmd])) {
      searchFrom = afterCmd
      continue
    }
    const arg1 = readBracedArg(result, afterCmd)
    if (!arg1) {
      searchFrom = afterCmd
      continue
    }
    const arg2 = readBracedArg(result, arg1.nextIdx)
    if (!arg2) {
      searchFrom = afterCmd
      continue
    }
    const formatted = formatter(arg1.value, arg2.value)
    result =
      result.slice(0, idx) + formatted + result.slice(arg2.nextIdx)
    searchFrom = idx + formatted.length
  }
  return result
}

function replaceLatexCommandWithOneArg(
  text: string,
  cmd: string,
  formatter: (a: string) => string
): string {
  let result = text
  let searchFrom = 0
  while (true) {
    const idx = result.indexOf(cmd, searchFrom)
    if (idx < 0) break
    const afterCmd = idx + cmd.length
    if (afterCmd < result.length && /[A-Za-z]/.test(result[afterCmd])) {
      searchFrom = afterCmd
      continue
    }
    const arg1 = readBracedArg(result, afterCmd)
    if (!arg1) {
      searchFrom = afterCmd
      continue
    }
    const formatted = formatter(arg1.value)
    result = result.slice(0, idx) + formatted + result.slice(arg1.nextIdx)
    searchFrom = idx + formatted.length
  }
  return result
}

export function normalizeLatexExpression(expr: string): string {
  let out = expr.trim()
  if (!out) return ''

  // ネストされた \frac や \sqrt のため最大3パス展開
  for (let pass = 0; pass < 3; pass++) {
    const prev = out
    out = replaceLatexCommandWithTwoArgs(out, '\\frac', (a, b) => {
      const lhs = /[+\-*/\s]/.test(a.trim()) ? `(${a.trim()})` : a.trim()
      const rhs = /[+\-*/\s]/.test(b.trim()) ? `(${b.trim()})` : b.trim()
      return `${lhs}/${rhs}`
    })
    out = replaceLatexCommandWithTwoArgs(out, '\\dfrac', (a, b) => {
      const lhs = /[+\-*/\s]/.test(a.trim()) ? `(${a.trim()})` : a.trim()
      const rhs = /[+\-*/\s]/.test(b.trim()) ? `(${b.trim()})` : b.trim()
      return `${lhs}/${rhs}`
    })
    out = replaceLatexCommandWithOneArg(
      out,
      '\\sqrt',
      (a) => `√(${a.trim()})`
    )
    for (const textCmd of ['\\text', '\\mathrm', '\\mathbf', '\\operatorname']) {
      out = replaceLatexCommandWithOneArg(out, textCmd, (a) => a)
    }
    if (out === prev) break
  }

  for (const [cmd, sym] of Object.entries(LATEX_SYMBOL_MAP)) {
    out = out.split(cmd).join(sym)
  }

  out = out.replace(/\^\{([0-9+\-n]+)\}/g, (_, chars: string) =>
    chars
      .split('')
      .map((c) => SUPERSCRIPT_MAP[c] || c)
      .join('')
  )
  out = out.replace(
    /\^([0-9n])/g,
    (_, ch: string) => SUPERSCRIPT_MAP[ch] || `^${ch}`
  )
  out = out.replace(/_\{([^}]+)\}/g, '_$1')
  out = out.replace(/\\[,;:! ]/g, ' ')
  out = out.replace(/\s+/g, ' ').trim()
  return out
}

function isLikelyMathExpression(expr: string): boolean {
  const trimmed = expr.trim()
  if (!trimmed) return false
  if (trimmed.length > 240) return false
  if (/[\\^_={}<>]/.test(trimmed)) return true
  if (/[A-Za-z]\s*[+\-*/]/.test(trimmed) || /[+\-*/]\s*[A-Za-z]/.test(trimmed)) {
    return true
  }
  if (/\d\s*[+\-*/=]\s*\d/.test(trimmed)) return true
  if (/^[A-Za-z](?:_[A-Za-z0-9]+|\([A-Za-z0-9,\s]+\))?$/.test(trimmed)) {
    return true
  }
  return false
}

function findNextUnescapedToken(
  input: string,
  token: string,
  fromIdx: number
): number {
  let i = fromIdx
  while (i <= input.length - token.length) {
    if (input[i] === '\\') {
      i += 2
      continue
    }
    if (input.startsWith(token, i)) {
      return i
    }
    i++
  }
  return -1
}

function parseLinkOrImage(
  input: string,
  bracketIdx: number
): { label: string; url: string; nextIdx: number } | null {
  let depth = 0
  let closeBracket = -1
  let i = bracketIdx
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '`') {
      const nextTick = input.indexOf('`', i + 1)
      if (nextTick >= 0) {
        i = nextTick + 1
        continue
      }
    }
    if (ch === '[') {
      depth++
    } else if (ch === ']') {
      depth--
      if (depth === 0) {
        closeBracket = i
        break
      }
    }
    i++
  }

  if (closeBracket < 0 || input[closeBracket + 1] !== '(') return null

  let pDepth = 1
  let j = closeBracket + 2
  let closeParen = -1
  while (j < input.length) {
    const ch = input[j]
    if (ch === '\\') {
      j += 2
      continue
    }
    if (ch === '(') {
      pDepth++
    } else if (ch === ')') {
      pDepth--
      if (pDepth === 0) {
        closeParen = j
        break
      }
    } else if (ch === '\n') {
      return null
    }
    j++
  }

  if (closeParen < 0) return null

  const label = input.slice(bracketIdx + 1, closeBracket)
  let rawDest = input.slice(closeBracket + 2, closeParen).trim()

  // Optional title: (https://example.com "title")
  const titleMatch = rawDest.match(/^(\S+)\s+(?:"[^"]*"|'[^']*')$/)
  if (titleMatch) {
    rawDest = titleMatch[1]
  }
  if (rawDest.startsWith('<') && rawDest.endsWith('>')) {
    rawDest = rawDest.slice(1, -1).trim()
  }

  return { label, url: rawDest, nextIdx: closeParen + 1 }
}

function matchCitationToken(input: string, idx: number): number {
  if (input[idx] === '[') {
    let j = idx + 1
    let hasDigit = false
    while (j < input.length) {
      const ch = input[j]
      if (ch >= '0' && ch <= '9') {
        hasDigit = true
        j++
      } else if (ch === ',' || ch === ' ' || ch === '、') {
        j++
      } else {
        break
      }
    }
    if (hasDigit && input[j] === ']' && input[j + 1] !== '(') {
      return j + 1
    }
  } else if (input[idx] === '【') {
    let j = idx + 1
    let hasDigit = false
    while (j < input.length) {
      const ch = input[j]
      if (ch >= '0' && ch <= '9') {
        hasDigit = true
        j++
      } else if (ch === ',' || ch === ' ' || ch === '、') {
        j++
      } else {
        break
      }
    }
    if (hasDigit && input[j] === '】') {
      return j + 1
    }
  }
  return -1
}

function isWordBoundaryChar(ch: string | undefined): boolean {
  if (!ch) return true
  return !/[A-Za-z0-9]/.test(ch)
}

function pushTextNode(nodes: InlineNode[], text: string): void {
  if (!text) return
  const prev = nodes[nodes.length - 1]
  if (prev && prev.type === 'text') {
    prev.text += text
  } else {
    nodes.push({ type: 'text', text })
  }
}

export function parseInline(
  input: string,
  options: FormatterOptions,
  stats: ParseStats
): InlineNode[] {
  const nodes: InlineNode[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    // 1. LaTeX delimiters \(...\) and \[...\]
    if (options.normalizeMath && ch === '\\') {
      if (input[i + 1] === '(') {
        const endIdx = input.indexOf('\\)', i + 2)
        if (endIdx >= 0) {
          pushTextNode(
            nodes,
            normalizeLatexExpression(input.slice(i + 2, endIdx))
          )
          i = endIdx + 2
          continue
        }
      }
      if (input[i + 1] === '[') {
        const endIdx = input.indexOf('\\]', i + 2)
        if (endIdx >= 0) {
          pushTextNode(
            nodes,
            normalizeLatexExpression(input.slice(i + 2, endIdx))
          )
          i = endIdx + 2
          continue
        }
      }
    }

    // 2. Backslash escape
    if (ch === '\\' && i + 1 < input.length) {
      const next = input[i + 1]
      if (/^[\\`*_{}[\]()#+\-.!|~<>]$/.test(next)) {
        pushTextNode(nodes, next)
        i += 2
        continue
      }
    }

    // 3. Inline code `...`
    if (ch === '`') {
      let tickCount = 1
      while (input[i + tickCount] === '`') tickCount++
      const fence = '`'.repeat(tickCount)
      const closeIdx = input.indexOf(fence, i + tickCount)
      if (closeIdx >= 0) {
        // Ensure exact fence match
        const codeContent = input.slice(i + tickCount, closeIdx).trim()
        nodes.push({ type: 'code', code: codeContent })
        i = closeIdx + tickCount
        continue
      }
    }

    // 4. Inline <br> tag
    if (ch === '<') {
      const brMatch = input.slice(i).match(/^<br\s*\/?>/i)
      if (brMatch) {
        nodes.push({ type: 'br' })
        i += brMatch[0].length
        continue
      }
    }

    // 5. LaTeX $$...$$ or $...$
    if (options.normalizeMath && ch === '$') {
      if (input[i + 1] === '$') {
        const closeIdx = findNextUnescapedToken(input, '$$', i + 2)
        if (closeIdx >= 0) {
          pushTextNode(
            nodes,
            normalizeLatexExpression(input.slice(i + 2, closeIdx))
          )
          i = closeIdx + 2
          continue
        }
      } else if (input[i + 1] && !/\s/.test(input[i + 1])) {
        const closeIdx = findNextUnescapedToken(input, '$', i + 1)
        if (
          closeIdx > i + 1 &&
          input[closeIdx + 1] !== '$' &&
          !/\s/.test(input[closeIdx - 1]) &&
          !/[0-9A-Za-z]/.test(input[closeIdx + 1] || '')
        ) {
          const expr = input.slice(i + 1, closeIdx)
          if (!expr.includes('\n') && isLikelyMathExpression(expr)) {
            pushTextNode(nodes, normalizeLatexExpression(expr))
            i = closeIdx + 1
            continue
          }
        }
      }
    }

    // 6. Image ![alt](url) -> zero-transmission: never emit <img>
    if (ch === '!' && input[i + 1] === '[') {
      const parsedImg = parseLinkOrImage(input, i + 1)
      if (parsedImg) {
        stats.blockedExternalImages++
        nodes.push({
          type: 'image',
          alt: parsedImg.label.trim(),
          url: cleanUrl(parsedImg.url, options.stripAiCitations),
        })
        i = parsedImg.nextIdx
        continue
      }
    }

    // 7. AI citation badge [1], [1][2], 【1】
    if (options.stripAiCitations && (ch === '[' || ch === '【')) {
      const citEnd = matchCitationToken(input, i)
      if (citEnd > 0) {
        i = citEnd
        continue
      }
    }

    // 8. Link [label](url)
    if (ch === '[') {
      const parsedLink = parseLinkOrImage(input, i)
      if (parsedLink) {
        const safe = isSafeUrl(parsedLink.url)
        if (!safe) {
          stats.blockedUnsafeLinks++
        }
        const finalUrl = safe
          ? cleanUrl(parsedLink.url, options.stripAiCitations)
          : ''
        nodes.push({
          type: 'link',
          label: parseInline(parsedLink.label, options, stats),
          url: finalUrl,
          safe,
        })
        i = parsedLink.nextIdx
        continue
      }
    }

    // 9. Strikethrough ~~...~~
    if (ch === '~' && input[i + 1] === '~') {
      const closeIdx = findNextUnescapedToken(input, '~~', i + 2)
      if (closeIdx > i + 2) {
        nodes.push({
          type: 'strike',
          children: parseInline(input.slice(i + 2, closeIdx), options, stats),
        })
        i = closeIdx + 2
        continue
      }
    }

    // 10. Strong **...** or __...__
    if (
      (ch === '*' && input[i + 1] === '*') ||
      (ch === '_' && input[i + 1] === '_' && isWordBoundaryChar(input[i - 1]))
    ) {
      const marker = ch + ch
      const closeIdx = findNextUnescapedToken(input, marker, i + 2)
      if (
        closeIdx > i + 2 &&
        (ch === '*' || isWordBoundaryChar(input[closeIdx + 2]))
      ) {
        nodes.push({
          type: 'strong',
          children: parseInline(input.slice(i + 2, closeIdx), options, stats),
        })
        i = closeIdx + 2
        continue
      }
    }

    // 11. Emphasis *...* or _..._
    if (
      (ch === '*' && input[i + 1] !== '*' && !/\s/.test(input[i + 1] || '')) ||
      (ch === '_' &&
        input[i + 1] !== '_' &&
        isWordBoundaryChar(input[i - 1]) &&
        !/\s/.test(input[i + 1] || ''))
    ) {
      const marker = ch
      let searchIdx = i + 1
      let closeIdx = -1
      while (searchIdx < input.length) {
        const candidate = findNextUnescapedToken(input, marker, searchIdx)
        if (candidate < 0) break
        if (input[candidate + 1] === marker) {
          searchIdx = candidate + 2
          continue
        }
        if (
          !/\s/.test(input[candidate - 1] || '') &&
          (marker === '*' || isWordBoundaryChar(input[candidate + 1]))
        ) {
          closeIdx = candidate
          break
        }
        searchIdx = candidate + 1
      }
      if (closeIdx > i + 1) {
        nodes.push({
          type: 'em',
          children: parseInline(input.slice(i + 1, closeIdx), options, stats),
        })
        i = closeIdx + 1
        continue
      }
    }

    // 12. Bare URL https://... or http://...
    if (
      (input.startsWith('https://', i) || input.startsWith('http://', i)) &&
      isWordBoundaryChar(input[i - 1])
    ) {
      let end = i
      while (
        end < input.length &&
        !/[\s<>"'`\])）」】、。]/.test(input[end])
      ) {
        end++
      }
      const rawUrl = input.slice(i, end)
      if (rawUrl.length > 8 && isSafeUrl(rawUrl)) {
        const cleaned = cleanUrl(rawUrl, options.stripAiCitations)
        nodes.push({
          type: 'link',
          label: [{ type: 'text', text: cleaned }],
          url: cleaned,
          safe: true,
        })
        i = end
        continue
      }
    }

    pushTextNode(nodes, ch)
    i++
  }

  return nodes
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  let inner = trimmed
  if (inner.startsWith('|')) inner = inner.slice(1)
  if (inner.endsWith('|') && !inner.endsWith('\\|')) {
    inner = inner.slice(0, -1)
  }

  const cells: string[] = []
  let current = ''
  let inCode = false
  let i = 0

  while (i < inner.length) {
    const ch = inner[i]
    if (ch === '\\' && inner[i + 1] === '|') {
      current += '|'
      i += 2
      continue
    }
    if (ch === '`') {
      inCode = !inCode
      current += ch
      i++
      continue
    }
    if (ch === '|' && !inCode) {
      cells.push(current.trim())
      current = ''
      i++
      continue
    }
    current += ch
    i++
  }
  cells.push(current.trim())
  return cells
}

function parseTableAlignments(line: string): TableAlign[] | null {
  if (!line.includes('|')) return null
  const cells = splitTableRow(line)
  if (cells.length === 0) return null
  const alignments: TableAlign[] = []
  for (const cell of cells) {
    if (!/^:?-{1,}:?$/.test(cell)) return null
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) alignments.push('center')
    else if (right) alignments.push('right')
    else if (left) alignments.push('left')
    else alignments.push(null)
  }
  return alignments
}

function isHorizontalRuleLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 3) return false
  return /^(?:-{3,}|\*{3,}|_{3,}|(?:-\s+){2,}-|(?:\*\s+){2,}\*|(?:_\s+){2,}_)$/.test(
    trimmed
  )
}

function parseHeadingLine(
  line: string
): { level: 1 | 2 | 3 | 4 | 5 | 6; text: string } | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
  if (!match) return null
  return {
    level: match[1].length as 1 | 2 | 3 | 4 | 5 | 6,
    text: match[2].trim(),
  }
}

interface ParsedListLine {
  indent: number
  ordered: boolean
  number?: number
  task?: 'checked' | 'unchecked'
  content: string
}

function parseListLine(line: string): ParsedListLine | null {
  const ulMatch = line.match(/^(\s*)([-*+])\s+(.*)$/)
  if (ulMatch) {
    let content = ulMatch[3]
    let task: 'checked' | 'unchecked' | undefined
    const taskMatch = content.match(/^\[(x|X| )\]\s+(.*)$/)
    if (taskMatch) {
      task = taskMatch[1].toLowerCase() === 'x' ? 'checked' : 'unchecked'
      content = taskMatch[2]
    }
    return {
      indent: ulMatch[1].replace(/\t/g, '  ').length,
      ordered: false,
      task,
      content,
    }
  }

  const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/)
  if (olMatch) {
    let content = olMatch[3]
    let task: 'checked' | 'unchecked' | undefined
    const taskMatch = content.match(/^\[(x|X| )\]\s+(.*)$/)
    if (taskMatch) {
      task = taskMatch[1].toLowerCase() === 'x' ? 'checked' : 'unchecked'
      content = taskMatch[2]
    }
    return {
      indent: olMatch[1].replace(/\t/g, '  ').length,
      ordered: true,
      number: Number(olMatch[2]),
      task,
      content,
    }
  }

  return null
}

function isBlockStartLine(lines: string[], idx: number): boolean {
  const line = lines[idx]
  if (!line.trim()) return true
  if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) return true
  if (parseHeadingLine(line)) return true
  if (/^\s{0,3}>/.test(line)) return true
  if (parseListLine(line)) return true
  if (isHorizontalRuleLine(line)) return true
  if (
    line.includes('|') &&
    idx + 1 < lines.length &&
    parseTableAlignments(lines[idx + 1]) !== null
  ) {
    return true
  }
  return false
}

function appendParagraphLines(
  lines: string[],
  options: FormatterOptions,
  stats: ParseStats
): InlineNode[] {
  let joined = ''
  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]
    const hardBreak = /\s{2,}$/.test(raw)
    const trimmed = raw.trim()
    if (idx === 0) {
      joined += trimmed
    } else if (hardBreak) {
      joined += '<br>' + trimmed
    } else {
      const prevChar = joined[joined.length - 1] || ''
      const nextChar = trimmed[0] || ''
      const needsSpace =
        /[A-Za-z0-9.,!?;:)\]]/.test(prevChar) &&
        /[A-Za-z0-9([\[]/.test(nextChar)
      joined += (needsSpace ? ' ' : '') + trimmed
    }
  }
  return parseInline(joined, options, stats)
}

function parseListBlock(
  lines: string[],
  startIdx: number,
  options: FormatterOptions,
  stats: ParseStats
): { block: BlockNode; nextIdx: number } {
  const rootItems: ListItemNode[] = []
  const stack: Array<{ indent: number; items: ListItemNode[] }> = [
    { indent: -1, items: rootItems },
  ]
  const firstParsed = parseListLine(lines[startIdx])!
  const rootOrdered = firstParsed.ordered
  let i = startIdx

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      // Check if next non-empty line continues list
      let lookAhead = i + 1
      while (lookAhead < lines.length && !lines[lookAhead].trim()) {
        lookAhead++
      }
      if (lookAhead < lines.length && parseListLine(lines[lookAhead])) {
        i = lookAhead
        continue
      }
      break
    }

    const parsed = parseListLine(line)
    if (!parsed) {
      // Continuation line of last list item
      if (
        stack.length > 0 &&
        stack[stack.length - 1].items.length > 0 &&
        !isBlockStartLine(lines, i)
      ) {
        const lastItem =
          stack[stack.length - 1].items[
            stack[stack.length - 1].items.length - 1
          ]
        const extra = parseInline(' ' + line.trim(), options, stats)
        lastItem.content = [...lastItem.content, ...extra]
        i++
        continue
      }
      break
    }

    const item: ListItemNode = {
      ordered: parsed.ordered,
      number: parsed.number,
      task: parsed.task,
      content: parseInline(parsed.content, options, stats),
      children: [],
    }

    while (
      stack.length > 1 &&
      parsed.indent <= stack[stack.length - 1].indent
    ) {
      stack.pop()
    }

    const top = stack[stack.length - 1]
    if (parsed.indent > top.indent && top.items.length > 0 && top.indent >= 0) {
      const parentItem = top.items[top.items.length - 1]
      parentItem.children.push(item)
      stack.push({ indent: parsed.indent, items: parentItem.children })
    } else {
      top.items.push(item)
      if (top.indent < 0) {
        stack[0].indent = parsed.indent
      }
    }

    i++
  }

  return {
    block: { type: 'list', ordered: rootOrdered, items: rootItems },
    nextIdx: i,
  }
}

export function parseMarkdownBlocks(
  markdown: string,
  options: FormatterOptions,
  stats: ParseStats
): BlockNode[] {
  const lines = normalizeNewlines(markdown).split('\n')
  const blocks: BlockNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    // 1. Fenced code block (``` or ~~~)
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/)
    if (fenceMatch) {
      const fence = fenceMatch[1]
      const fenceChar = fence[0]
      const fenceLen = fence.length
      const lang = fenceMatch[2].trim().split(/\s+/)[0] || ''
      const codeLines: string[] = []
      i++
      while (i < lines.length) {
        const closeLine = lines[i]
        const closeMatch = closeLine.match(/^\s{0,3}(`{3,}|~{3,})\s*$/)
        if (
          closeMatch &&
          closeMatch[1][0] === fenceChar &&
          closeMatch[1].length >= fenceLen
        ) {
          i++
          break
        }
        codeLines.push(closeLine)
        i++
      }
      blocks.push({
        type: 'codeblock',
        lang,
        code: codeLines.join('\n'),
      })
      continue
    }

    // 2. Block math $$...$$ or \[...\]
    if (options.normalizeMath) {
      const trimmed = line.trim()
      if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
        const openDelim = trimmed.startsWith('$$') ? '$$' : '\\['
        const closeDelim = openDelim === '$$' ? '$$' : '\\]'
        if (
          trimmed.length > openDelim.length + closeDelim.length &&
          trimmed.endsWith(closeDelim)
        ) {
          const inner = trimmed.slice(
            openDelim.length,
            trimmed.length - closeDelim.length
          )
          blocks.push({
            type: 'paragraph',
            children: [{ type: 'text', text: normalizeLatexExpression(inner) }],
          })
          i++
          continue
        }
        let j = i + 1
        const mathLines = [trimmed.slice(openDelim.length)]
        let closed = false
        while (j < lines.length) {
          const cur = lines[j].trim()
          if (cur.endsWith(closeDelim)) {
            mathLines.push(cur.slice(0, cur.length - closeDelim.length))
            closed = true
            j++
            break
          }
          mathLines.push(cur)
          j++
        }
        if (closed) {
          blocks.push({
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: normalizeLatexExpression(mathLines.join(' ')),
              },
            ],
          })
          i = j
          continue
        }
      }
    }

    // 3. ATX Heading
    const heading = parseHeadingLine(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading.level,
        children: parseInline(heading.text, options, stats),
      })
      i++
      continue
    }

    // 4. Horizontal Rule
    if (isHorizontalRuleLine(line)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // 5. GFM Table
    if (line.includes('|') && i + 1 < lines.length) {
      const alignments = parseTableAlignments(lines[i + 1])
      if (alignments !== null) {
        const rawHeaders = splitTableRow(line)
        const colCount = Math.max(rawHeaders.length, alignments.length)
        const normalizedHeaders = Array.from({ length: colCount }, (_, idx) =>
          parseInline(rawHeaders[idx] || '', options, stats)
        )
        const normalizedAligns = Array.from(
          { length: colCount },
          (_, idx) => alignments[idx] ?? null
        )

        const rows: InlineNode[][][] = []
        i += 2
        while (i < lines.length) {
          const rowLine = lines[i]
          if (!rowLine.trim() || !rowLine.includes('|')) break
          if (/^\s{0,3}(`{3,}|~{3,}|#{1,6}\s)/.test(rowLine)) break
          const rawCells = splitTableRow(rowLine)
          const parsedRow = Array.from({ length: colCount }, (_, idx) =>
            parseInline(rawCells[idx] || '', options, stats)
          )
          rows.push(parsedRow)
          i++
        }

        blocks.push({
          type: 'table',
          headers: normalizedHeaders,
          alignments: normalizedAligns,
          rows,
        })
        continue
      }
    }

    // 6. Blockquote
    if (/^\s{0,3}>/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s{0,3}>\s?/, ''))
        i++
      }
      blocks.push({
        type: 'blockquote',
        blocks: parseMarkdownBlocks(quoteLines.join('\n'), options, stats),
      })
      continue
    }

    // 7. List
    if (parseListLine(line)) {
      const { block, nextIdx } = parseListBlock(lines, i, options, stats)
      blocks.push(block)
      i = nextIdx
      continue
    }

    // 8. Paragraph (with Setext heading check)
    const paraLines: string[] = []
    while (i < lines.length && !isBlockStartLine(lines, i)) {
      paraLines.push(lines[i])
      i++
    }
    if (
      paraLines.length === 1 &&
      i < lines.length &&
      /^\s{0,3}(={3,}|-{3,})\s*$/.test(lines[i])
    ) {
      const level: 1 | 2 = lines[i].trim().startsWith('=') ? 1 : 2
      blocks.push({
        type: 'heading',
        level,
        children: parseInline(paraLines[0].trim(), options, stats),
      })
      i++
      continue
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        children: appendParagraphLines(paraLines, options, stats),
      })
    }
  }

  return blocks
}

export function inlineToPlainText(
  nodes: InlineNode[],
  includeLinks = true
): string {
  let out = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.text
        break
      case 'strong':
      case 'em':
      case 'strike':
        out += inlineToPlainText(node.children, includeLinks)
        break
      case 'code':
        out += node.code
        break
      case 'link': {
        const label = inlineToPlainText(node.label, includeLinks)
        if (!includeLinks || !node.safe || !node.url) {
          out += label
        } else if (label === node.url) {
          out += node.url
        } else {
          out += `${label} (${node.url})`
        }
        break
      }
      case 'image':
        out += node.alt ? `[画像: ${node.alt}]` : '[画像]'
        break
      case 'br':
        out += '\n'
        break
    }
  }
  return out
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineToHtml(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return escapeHtml(node.text)
        case 'strong':
          return `<strong>${inlineToHtml(node.children)}</strong>`
        case 'em':
          return `<em>${inlineToHtml(node.children)}</em>`
        case 'strike':
          return `<s>${inlineToHtml(node.children)}</s>`
        case 'code':
          return `<code style="background-color:#f1f5f9;padding:1px 4px;border-radius:4px;font-family:monospace;font-size:0.9em;">${escapeHtml(node.code)}</code>`
        case 'link': {
          const inner = inlineToHtml(node.label)
          if (!node.safe || !node.url) {
            return inner
          }
          return `<a href="${escapeHtml(node.url)}" style="color:#0369a1;text-decoration:underline;">${inner}</a>`
        }
        case 'image': {
          const label = node.alt ? `[画像: ${node.alt}]` : '[画像]'
          return `<span style="color:#475569;font-size:0.9em;">${escapeHtml(label)}</span>`
        }
        case 'br':
          return '<br />'
      }
    })
    .join('')
}

function listItemsToHtml(items: ListItemNode[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul'
  const inner = items
    .map((item) => {
      const taskPrefix =
        item.task === 'checked'
          ? '[x] '
          : item.task === 'unchecked'
            ? '[ ] '
            : ''
      const childrenHtml =
        item.children.length > 0
          ? listItemsToHtml(
              item.children,
              Boolean(item.children[0]?.ordered)
            )
          : ''
      return `<li>${taskPrefix}${inlineToHtml(item.content)}${childrenHtml}</li>`
    })
    .join('')
  return `<${tag} style="margin:0 0 10px 0;padding-left:22px;">${inner}</${tag}>`
}

export function blocksToRichHtml(blocks: BlockNode[]): string {
  const headingSizes: Record<number, string> = {
    1: '1.5em',
    2: '1.25em',
    3: '1.1em',
    4: '1em',
    5: '0.95em',
    6: '0.9em',
  }

  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const tag = `h${block.level}`
          const size = headingSizes[block.level] || '1em'
          return `<${tag} style="font-size:${size};font-weight:700;margin:14px 0 6px 0;color:#0f172a;">${inlineToHtml(block.children)}</${tag}>`
        }
        case 'paragraph':
          return `<p style="margin:0 0 10px 0;line-height:1.65;">${inlineToHtml(block.children)}</p>`
        case 'codeblock':
          return `<pre style="background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px;margin:0 0 12px 0;font-family:monospace;font-size:0.875em;white-space:pre-wrap;"><code>${escapeHtml(block.code)}</code></pre>`
        case 'blockquote':
          return `<blockquote style="border-left:3px solid #94a3b8;padding-left:12px;margin:0 0 10px 0;color:#475569;">${blocksToRichHtml(block.blocks)}</blockquote>`
        case 'list':
          return listItemsToHtml(block.items, block.ordered)
        case 'hr':
          return '<hr style="border:none;border-top:1px solid #cbd5e1;margin:14px 0;" />'
        case 'table': {
          const ths = block.headers
            .map((cell, idx) => {
              const align = block.alignments[idx] || 'left'
              return `<th style="border:1px solid #cbd5e1;background-color:#f1f5f9;padding:6px 10px;text-align:${align};font-weight:700;">${inlineToHtml(cell)}</th>`
            })
            .join('')
          const trs = block.rows
            .map((row) => {
              const tds = row
                .map((cell, idx) => {
                  const align = block.alignments[idx] || 'left'
                  return `<td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:${align};vertical-align:top;">${inlineToHtml(cell)}</td>`
                })
                .join('')
              return `<tr>${tds}</tr>`
            })
            .join('')
          return `<table style="border-collapse:collapse;width:100%;margin:0 0 12px 0;font-size:0.95em;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
        }
      }
    })
    .join('\n')
}

export function isFormulaInjectionRisk(cell: string): boolean {
  const trimmed = cell.trim()
  if (!trimmed) return false
  const first = trimmed[0]
  if (
    first === '=' ||
    first === '+' ||
    first === '@' ||
    first === '\t' ||
    first === '\r'
  ) {
    return true
  }
  if (first === '-') {
    // 通常の負数（例: -120, -3.5%, -1,200）は安全扱い
    return !/^-\d[\d,.]*%?$/.test(trimmed)
  }
  return false
}

export function isLeadingZeroNumeric(cell: string): boolean {
  return /^0\d+$/.test(cell.trim())
}

function escapeDelimitedCell(value: string, delimiter: '\t' | ','): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  if (!needsQuotes) return value
  return `"${value.replace(/"/g, '""')}"`
}

function serializeDelimitedTable(
  headers: string[],
  rows: string[][],
  delimiter: '\t' | ',',
  lineEnding: '\n' | '\r\n'
): string {
  const allRows = [headers, ...rows]
  return allRows
    .map((row) =>
      row.map((cell) => escapeDelimitedCell(cell, delimiter)).join(delimiter)
    )
    .join(lineEnding)
}

export function createExcelCsvBlobBytes(csvText: string): Uint8Array {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const encoded = new TextEncoder().encode(csvText)
  const out = new Uint8Array(bom.length + encoded.length)
  out.set(bom, 0)
  out.set(encoded, bom.length)
  return out
}

function extractTables(
  blocks: BlockNode[],
  options: FormatterOptions
): ExtractedTable[] {
  const tables: ExtractedTable[] = []
  let lastHeading = ''

  const walk = (list: BlockNode[]) => {
    for (const block of list) {
      if (block.type === 'heading') {
        lastHeading = inlineToPlainText(block.children, false).trim()
      } else if (block.type === 'blockquote') {
        walk(block.blocks)
      } else if (block.type === 'table') {
        const index = tables.length + 1
        let formulaDangerCount = 0
        let leadingZeroCount = 0

        const transformCell = (nodes: InlineNode[]): string => {
          const raw = inlineToPlainText(nodes, false).trim()
          if (isLeadingZeroNumeric(raw)) {
            leadingZeroCount++
          }
          if (isFormulaInjectionRisk(raw)) {
            formulaDangerCount++
            return options.guardFormulaInjection ? `'${raw}` : raw
          }
          return raw
        }

        const headers = block.headers.map(transformCell)
        const rows = block.rows.map((row) => row.map(transformCell))
        const tsv = serializeDelimitedTable(headers, rows, '\t', '\n')
        const csv = serializeDelimitedTable(headers, rows, ',', '\r\n')

        tables.push({
          index,
          title: lastHeading || `表 ${index}`,
          headers,
          rows,
          tsv,
          csv,
          formulaDangerCount,
          leadingZeroCount,
        })
      }
    }
  }

  walk(blocks)
  return tables
}

function getDisplayWidth(str: string): number {
  let width = 0
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0
    const isWide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    width += isWide ? 2 : 1
  }
  return width
}

function padDisplayRight(str: string, targetWidth: number): string {
  const diff = Math.max(0, targetWidth - getDisplayWidth(str))
  return str + ' '.repeat(diff)
}

function formatMonospaceTable(headers: string[], rows: string[][]): string {
  const cleanCell = (s: string) => s.replace(/\r?\n+/g, ' ').trim()
  const hCells = headers.map(cleanCell)
  const rCells = rows.map((row) => row.map(cleanCell))
  const colWidths = hCells.map((h, idx) => {
    let maxW = getDisplayWidth(h)
    for (const r of rCells) {
      maxW = Math.max(maxW, getDisplayWidth(r[idx] || ''))
    }
    return Math.max(2, maxW)
  })

  const formatRow = (cells: string[]) =>
    cells.map((c, idx) => padDisplayRight(c || '', colWidths[idx])).join(' | ')
  const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-')

  return [
    formatRow(hCells),
    separator,
    ...rCells.map((r) => formatRow(r)),
  ].join('\n')
}

function inlineToSlack(nodes: InlineNode[]): string {
  let out = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.text
        break
      case 'strong':
        out += `*${inlineToSlack(node.children)}*`
        break
      case 'em':
        out += `_${inlineToSlack(node.children)}_`
        break
      case 'strike':
        out += `~${inlineToSlack(node.children)}~`
        break
      case 'code':
        out += `\`${node.code}\``
        break
      case 'link': {
        const label = inlineToPlainText(node.label, false)
        if (!node.safe || !node.url) {
          out += label
        } else if (label === node.url) {
          out += `<${node.url}>`
        } else {
          out += `<${node.url}|${label}>`
        }
        break
      }
      case 'image':
        out += node.alt ? `[画像: ${node.alt}]` : '[画像]'
        break
      case 'br':
        out += '\n'
        break
    }
  }
  return out
}

function listItemsToSlack(items: ListItemNode[], depth = 0): string[] {
  const lines: string[] = []
  const indent = '  '.repeat(depth)
  let orderCounter = 1
  for (const item of items) {
    const bullet = item.ordered
      ? `${item.number ?? orderCounter}. `
      : '• '
    orderCounter++
    const taskPrefix =
      item.task === 'checked'
        ? '[x] '
        : item.task === 'unchecked'
          ? '[ ] '
          : ''
    lines.push(`${indent}${bullet}${taskPrefix}${inlineToSlack(item.content)}`)
    if (item.children.length > 0) {
      lines.push(...listItemsToSlack(item.children, depth + 1))
    }
  }
  return lines
}

function blocksToSlack(blocks: BlockNode[], options: FormatterOptions): string {
  const chunks: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const plainTitle = inlineToPlainText(block.children, false).trim()
        chunks.push(`*${plainTitle}*`)
        break
      }
      case 'paragraph':
        chunks.push(inlineToSlack(block.children))
        break
      case 'codeblock':
        chunks.push(`\`\`\`\n${block.code}\n\`\`\``)
        break
      case 'blockquote': {
        const inner = blocksToSlack(block.blocks, options)
        chunks.push(
          inner
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        )
        break
      }
      case 'list':
        chunks.push(listItemsToSlack(block.items).join('\n'))
        break
      case 'hr':
        chunks.push('---')
        break
      case 'table': {
        const hTexts = block.headers.map((h) =>
          inlineToPlainText(h, false).trim()
        )
        const rTexts = block.rows.map((r) =>
          r.map((c) => inlineToPlainText(c, false).trim())
        )
        if (options.slackTableStyle === 'bullets') {
          const bulletRows = rTexts.map((row) => {
            const pairs = hTexts
              .map((h, idx) => `*${h}*: ${row[idx] || ''}`)
              .join(' / ')
            return `• ${pairs}`
          })
          chunks.push(bulletRows.join('\n'))
        } else {
          chunks.push(
            `\`\`\`\n${formatMonospaceTable(hTexts, rTexts)}\n\`\`\``
          )
        }
        break
      }
    }
  }
  const joined = chunks.join('\n\n')
  return options.collapseBlankLines
    ? joined.replace(/\n{3,}/g, '\n\n').trim()
    : joined.trim()
}

function listItemsToPlain(items: ListItemNode[], depth = 0): string[] {
  const lines: string[] = []
  const indent = '  '.repeat(depth)
  let orderCounter = 1
  for (const item of items) {
    const bullet = item.ordered ? `${item.number ?? orderCounter}. ` : '・'
    orderCounter++
    const taskPrefix =
      item.task === 'checked'
        ? '[済] '
        : item.task === 'unchecked'
          ? '[未] '
          : ''
    lines.push(
      `${indent}${bullet}${taskPrefix}${inlineToPlainText(item.content, true)}`
    )
    if (item.children.length > 0) {
      lines.push(...listItemsToPlain(item.children, depth + 1))
    }
  }
  return lines
}

function blocksToPlainText(
  blocks: BlockNode[],
  options: FormatterOptions
): string {
  const chunks: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const text = inlineToPlainText(block.children, false).trim()
        if (block.level === 1) {
          chunks.push(`■ ${text}`)
        } else if (block.level === 2) {
          chunks.push(`【${text}】`)
        } else {
          chunks.push(`▼ ${text}`)
        }
        break
      }
      case 'paragraph':
        chunks.push(inlineToPlainText(block.children, true))
        break
      case 'codeblock': {
        const header = block.lang ? `[コード: ${block.lang}]` : '[コード]'
        chunks.push(`${header}\n${block.code}`)
        break
      }
      case 'blockquote': {
        const inner = blocksToPlainText(block.blocks, options)
        chunks.push(
          inner
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        )
        break
      }
      case 'list':
        chunks.push(listItemsToPlain(block.items).join('\n'))
        break
      case 'hr':
        chunks.push('----------------------------------------')
        break
      case 'table': {
        const hTexts = block.headers.map((h) =>
          inlineToPlainText(h, false).trim()
        )
        const rTexts = block.rows.map((r) =>
          r.map((c) => inlineToPlainText(c, true).trim())
        )
        chunks.push(formatMonospaceTable(hTexts, rTexts))
        break
      }
    }
  }
  const joined = chunks.join('\n\n')
  return options.collapseBlankLines
    ? joined.replace(/\n{3,}/g, '\n\n').trim()
    : joined.trim()
}

function countListItems(items: ListItemNode[]): number {
  let count = 0
  for (const item of items) {
    count++
    if (item.children.length > 0) {
      count += countListItems(item.children)
    }
  }
  return count
}

function collectBlockStats(
  blocks: BlockNode[],
  tables: ExtractedTable[],
  parseStats: ParseStats
): FormatStats {
  let headingCount = 0
  let codeBlockCount = 0
  let listItemCount = 0

  const walk = (list: BlockNode[]) => {
    for (const block of list) {
      if (block.type === 'heading') headingCount++
      else if (block.type === 'codeblock') codeBlockCount++
      else if (block.type === 'list') listItemCount += countListItems(block.items)
      else if (block.type === 'blockquote') walk(block.blocks)
    }
  }

  walk(blocks)

  const formulaDangerCount = tables.reduce(
    (sum, t) => sum + t.formulaDangerCount,
    0
  )

  return {
    headingCount,
    tableCount: tables.length,
    codeBlockCount,
    listItemCount,
    formulaDangerCount,
    blockedUnsafeLinks: parseStats.blockedUnsafeLinks,
    blockedExternalImages: parseStats.blockedExternalImages,
  }
}

export function formatAiMarkdown(
  markdown: string,
  partialOptions: Partial<FormatterOptions> = {}
): FormattedResult {
  const options: FormatterOptions = {
    ...DEFAULT_FORMATTER_OPTIONS,
    ...partialOptions,
  }
  const parseStats: ParseStats = {
    blockedUnsafeLinks: 0,
    blockedExternalImages: 0,
  }

  const blocks = parseMarkdownBlocks(markdown, options, parseStats)
  const tables = extractTables(blocks, options)
  const richHtml = blocksToRichHtml(blocks)
  const slackText = blocksToSlack(blocks, options)
  const plainText = blocksToPlainText(blocks, options)
  const allTablesTsv = tables
    .map((t) => `[${t.title}]\n${t.tsv}`)
    .join('\n\n')

  return {
    blocks,
    richHtml,
    plainText,
    slackText,
    tables,
    allTablesTsv,
    stats: collectBlockStats(blocks, tables, parseStats),
  }
}
