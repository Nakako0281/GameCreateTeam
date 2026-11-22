import { describe, expect, it } from 'vitest'
import {
  cleanUrl,
  createExcelCsvBlobBytes,
  formatAiMarkdown,
  isFormulaInjectionRisk,
  isSafeUrl,
  normalizeLatexExpression,
  SAMPLE_AI_MARKDOWN,
} from '../markdown-formatter'

describe('formatAiMarkdown', () => {
  it('converts headings, bold, italic, strikethrough, blockquote, hr, and nested task lists cleanly', () => {
    const md = `# 大見出し
## 中見出し
### 小見出し

これは**太字**と*斜体*と~~打消し~~を含む段落です。

> 引用文のテキスト
> 2行目

---

- [x] 親タスク完了
  - [ ] 子タスク未完了
  1. 手順A
  2. 手順B
`
    const res = formatAiMarkdown(md)
    expect(res.stats.headingCount).toBe(3)
    expect(res.stats.listItemCount).toBe(4)

    expect(res.richHtml).toContain('<h1')
    expect(res.richHtml).toContain('<strong>太字</strong>')
    expect(res.richHtml).toContain('<em>斜体</em>')
    expect(res.richHtml).toContain('<s>打消し</s>')
    expect(res.richHtml).toContain('<blockquote')
    expect(res.richHtml).toContain('<hr')

    expect(res.plainText).toContain('■ 大見出し')
    expect(res.plainText).toContain('【中見出し】')
    expect(res.plainText).toContain('▼ 小見出し')
    expect(res.plainText).toContain('・[済] 親タスク完了')
    expect(res.plainText).toContain('  ・[未] 子タスク未完了')
    expect(res.plainText).not.toContain('**')
    expect(res.plainText).not.toContain('~~')

    expect(res.slackText).toContain('*大見出し*')
    expect(res.slackText).toContain('*太字*')
    expect(res.slackText).toContain('_斜体_')
    expect(res.slackText).toContain('~打消し~')
    expect(res.slackText).toContain('[x] 親タスク完了')
    expect(res.slackText).toContain('[ ] 子タスク未完了')
  })

  it('preserves #, **, |, $, and [1] inside fenced code blocks and inline code', () => {
    const md = `コード説明：\`**keep** | $x$ [1]\` はそのまま残します。

\`\`\`python
# コメントの見出し扱い禁止
val = "**bold** | [1] $a+b$"
\`\`\`

~~~bash
# tilde fence
echo "hello | world"
~~~
`
    const res = formatAiMarkdown(md)
    expect(res.stats.codeBlockCount).toBe(2)
    expect(res.stats.headingCount).toBe(0)
    expect(res.stats.tableCount).toBe(0)

    expect(res.plainText).toContain('**keep** | $x$ [1]')
    expect(res.plainText).toContain('# コメントの見出し扱い禁止')
    expect(res.plainText).toContain('val = "**bold** | [1] $a+b$"')
    expect(res.slackText).toContain('`**keep** | $x$ [1]`')
    expect(res.richHtml).toContain('# コメントの見出し扱い禁止')
  })

  it('extracts multiple GFM tables including escaped pipes, code pipes, <br>, and omitted outer pipes', () => {
    const md = `## 売上表

項目 | 備考 | 数値
:---|---:|---:
A\\|B | \`x | y\`<br>**重要** | 100
C | 通常 | 200

## 在庫表

| 商品名 | 型番 |
| :--- | :--- |
| ケーブル | 00123 |
`
    const res = formatAiMarkdown(md)
    expect(res.tables).toHaveLength(2)

    const t1 = res.tables[0]
    expect(t1.title).toBe('売上表')
    expect(t1.headers).toEqual(['項目', '備考', '数値'])
    expect(t1.rows[0][0]).toBe('A|B')
    expect(t1.rows[0][1]).toBe('x | y\n重要')
    expect(t1.rows[0][2]).toBe('100')
    expect(t1.tsv).toContain('A|B\t"x | y\n重要"\t100')

    const t2 = res.tables[1]
    expect(t2.title).toBe('在庫表')
    expect(t2.leadingZeroCount).toBe(1)

    const bomBytes = createExcelCsvBlobBytes(t2.csv)
    expect(bomBytes[0]).toBe(0xef)
    expect(bomBytes[1]).toBe(0xbb)
    expect(bomBytes[2]).toBe(0xbf)
  })

  it('guards formula injection payloads while keeping normal negative numbers intact', () => {
    expect(isFormulaInjectionRisk('=SUM(A1:A5)')).toBe(true)
    expect(isFormulaInjectionRisk('+cmd|calc')).toBe(true)
    expect(isFormulaInjectionRisk('@SUM(1,2)')).toBe(true)
    expect(isFormulaInjectionRisk('-SUM(A1)')).toBe(true)
    expect(isFormulaInjectionRisk('-1+1')).toBe(true)
    expect(isFormulaInjectionRisk('-150')).toBe(false)
    expect(isFormulaInjectionRisk('-3.5%')).toBe(false)
    expect(isFormulaInjectionRisk('-1,200')).toBe(false)

    const md = `| 項目 | 値 |
| :--- | :--- |
| 攻撃 | =HYPERLINK("http://evil") |
| マイナス式 | -cmd |
| 通常負数 | -150 |
| 通常率 | -3.5% |
`
    const guarded = formatAiMarkdown(md, { guardFormulaInjection: true })
    expect(guarded.tables[0].formulaDangerCount).toBe(2)
    expect(guarded.tables[0].rows[0][1]).toBe(`'=HYPERLINK("http://evil")`)
    expect(guarded.tables[0].rows[1][1]).toBe(`'-cmd`)
    expect(guarded.tables[0].rows[2][1]).toBe('-150')
    expect(guarded.tables[0].rows[3][1]).toBe('-3.5%')

    const unguarded = formatAiMarkdown(md, { guardFormulaInjection: false })
    expect(unguarded.tables[0].formulaDangerCount).toBe(2)
    expect(unguarded.tables[0].rows[0][1]).toBe('=HYPERLINK("http://evil")')
  })

  it('formats Slack mrkdwn tables in both monospace codeblock and bullets styles', () => {
    const md = `| 項目 | 担当 |
| :--- | :--- |
| テスト | 佐藤 |
| 確認 | 高橋 |
`
    const codeRes = formatAiMarkdown(md, { slackTableStyle: 'codeblock' })
    expect(codeRes.slackText).toContain('```\n項目   | 担当\n-------+-----\nテスト | 佐藤\n確認   | 高橋\n```')

    const bulletRes = formatAiMarkdown(md, { slackTableStyle: 'bullets' })
    expect(bulletRes.slackText).toContain('• *項目*: テスト / *担当*: 佐藤')
    expect(bulletRes.slackText).toContain('• *項目*: 確認 / *担当*: 高橋')
  })

  it('normalizes LaTeX math expressions while leaving currency dollar amounts untouched', () => {
    expect(normalizeLatexExpression('\\frac{a + b}{2} \\times \\sqrt{x^2} \\approx 10')).toBe(
      '(a + b)/2 × √(x²) ≈ 10'
    )

    const md = `試算式は $ROI = \\frac{120 - 80}{80} \\times 100$ であり、費用は $100 と $200 の範囲です。`
    const res = formatAiMarkdown(md)
    expect(res.plainText).toContain('ROI = (120 - 80)/80 × 100')
    expect(res.plainText).toContain('$100 と $200')
  })

  it('strips AI citation badges and tracking query params while preserving meaningful query params', () => {
    const cleaned = cleanUrl(
      'https://example.com/docs/guide?utm_source=chatgpt.com&section=2&utm_medium=referral',
      true
    )
    expect(cleaned).toBe('https://example.com/docs/guide?section=2')

    const res = formatAiMarkdown(SAMPLE_AI_MARKDOWN)
    expect(res.plainText).not.toContain('[1]')
    expect(res.plainText).not.toContain('[2]')
    expect(res.plainText).not.toContain('utm_source')
    expect(res.plainText).toContain('https://example.com/docs/guide?section=2')
    expect(res.slackText).toContain(
      '<https://example.com/docs/guide?section=2|公式ガイドライン>'
    )
  })

  it('blocks XSS scripts, unsafe URI schemes, and external images to guarantee zero transmission', () => {
    const dangerousMd = `# テスト

<script>alert('xss')</script>
<img src="https://evil.example/leak.png" onerror="alert(1)">

![トラッカー画像](https://tracker.example.invalid/pixel.png)
[危険なリンク](javascript:alert(1))
[データURI](data:text/html,<script>alert(1)</script>)
[安全なリンク](https://example.com/safe)
`
    const res = formatAiMarkdown(dangerousMd)
    expect(res.stats.blockedExternalImages).toBe(1)
    expect(res.stats.blockedUnsafeLinks).toBe(2)

    expect(res.richHtml).not.toContain('<script>')
    expect(res.richHtml).not.toContain('<img')
    expect(res.richHtml).not.toContain('javascript:')
    expect(res.richHtml).not.toContain('data:text/html')
    expect(res.richHtml).toContain('&lt;script&gt;')
    expect(res.richHtml).toContain('[画像: トラッカー画像]')
    expect(res.richHtml).toContain('<a href="https://example.com/safe"')

    expect(isSafeUrl('https://example.com')).toBe(true)
    expect(isSafeUrl('mailto:info@example.com')).toBe(true)
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('data:text/html,hi')).toBe(false)
  })

  it('completes parsing large inputs linearly without ReDoS', () => {
    const hugeLines: string[] = []
    for (let idx = 0; idx < 5000; idx++) {
      hugeLines.push(`- 項目 ${idx}: ${'*'.repeat(12)} 値=${idx} | [1]`)
    }
    const start = performance.now()
    const res = formatAiMarkdown(hugeLines.join('\n'))
    const elapsedMs = performance.now() - start
    expect(res.stats.listItemCount).toBe(5000)
    expect(elapsedMs).toBeLessThan(1500)
  })
})
