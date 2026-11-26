import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Hash,
  MessageSquare,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  createExcelCsvBlobBytes,
  DEFAULT_FORMATTER_OPTIONS,
  formatAiMarkdown,
  SAMPLE_AI_MARKDOWN,
  type BlockNode,
  type ExtractedTable,
  type FormatTarget,
  type FormatterOptions,
  type InlineNode,
  type ListItemNode,
} from '../../lib/tools/markdown-formatter'

const TARGET_TABS: Array<{ id: FormatTarget; label: string }> = [
  { id: 'word', label: 'Word・Docs' },
  { id: 'excel', label: 'Excel表抽出' },
  { id: 'slack', label: 'Slack' },
  { id: 'plain', label: 'メール・平文' },
]

function renderInlineNodes(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.text}</Fragment>
      case 'strong':
        return (
          <strong key={key} className="font-bold text-slate-900">
            {renderInlineNodes(node.children, key)}
          </strong>
        )
      case 'em':
        return (
          <em key={key} className="italic">
            {renderInlineNodes(node.children, key)}
          </em>
        )
      case 'strike':
        return (
          <s key={key} className="text-slate-500 line-through">
            {renderInlineNodes(node.children, key)}
          </s>
        )
      case 'code':
        return (
          <code
            key={key}
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800"
          >
            {node.code}
          </code>
        )
      case 'link': {
        if (!node.safe || !node.url) {
          return (
            <span key={key} className="text-slate-700 underline decoration-dotted">
              {renderInlineNodes(node.label, key)}
            </span>
          )
        }
        return (
          <a
            key={key}
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-700 underline hover:text-sky-800"
          >
            {renderInlineNodes(node.label, key)}
          </a>
        )
      }
      case 'image':
        return (
          <span
            key={key}
            className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900"
          >
            {node.alt ? `[画像: ${node.alt} (外部読込ブロック)]` : '[画像 (外部読込ブロック)]'}
          </span>
        )
      case 'br':
        return <br key={key} />
    }
  })
}

function renderListItems(
  items: ListItemNode[],
  ordered: boolean,
  keyPrefix: string
): ReactNode {
  const ListTag = ordered ? 'ol' : 'ul'
  const listClass = ordered
    ? 'my-1.5 list-decimal space-y-1 pl-5 text-sm text-slate-800'
    : 'my-1.5 list-disc space-y-1 pl-5 text-sm text-slate-800'

  return (
    <ListTag className={listClass}>
      {items.map((item, idx) => {
        const key = `${keyPrefix}-li-${idx}`
        return (
          <li key={key} className="leading-relaxed">
            {item.task && (
              <span className="mr-1.5 inline-block rounded bg-slate-100 px-1 font-mono text-xs font-semibold text-slate-700">
                {item.task === 'checked' ? '[x]' : '[ ]'}
              </span>
            )}
            {renderInlineNodes(item.content, key)}
            {item.children.length > 0 &&
              renderListItems(
                item.children,
                Boolean(item.children[0]?.ordered),
                key
              )}
          </li>
        )
      })}
    </ListTag>
  )
}

function renderBlocks(blocks: BlockNode[], keyPrefix = 'blk'): ReactNode[] {
  return blocks.map((block, idx) => {
    const key = `${keyPrefix}-${idx}`
    switch (block.type) {
      case 'heading': {
        const children = renderInlineNodes(block.children, key)
        if (block.level === 1) {
          return (
            <h2 key={key} className="mt-3 mb-2 text-lg font-bold text-slate-900 first:mt-0">
              {children}
            </h2>
          )
        }
        if (block.level === 2) {
          return (
            <h3 key={key} className="mt-3 mb-1.5 text-base font-bold text-slate-900 first:mt-0">
              {children}
            </h3>
          )
        }
        return (
          <h4 key={key} className="mt-2.5 mb-1 text-sm font-bold text-slate-800 first:mt-0">
            {children}
          </h4>
        )
      }
      case 'paragraph':
        return (
          <p key={key} className="my-2 text-sm leading-relaxed text-slate-800 first:mt-0">
            {renderInlineNodes(block.children, key)}
          </p>
        )
      case 'codeblock':
        return (
          <pre
            key={key}
            className="my-2.5 overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100"
          >
            <code>{block.code}</code>
          </pre>
        )
      case 'blockquote':
        return (
          <blockquote
            key={key}
            className="my-2 border-l-4 border-slate-300 pl-3 text-sm text-slate-600"
          >
            {renderBlocks(block.blocks, key)}
          </blockquote>
        )
      case 'list':
        return (
          <Fragment key={key}>
            {renderListItems(block.items, block.ordered, key)}
          </Fragment>
        )
      case 'hr':
        return <hr key={key} className="my-3 border-slate-200" />
      case 'table':
        return (
          <div key={key} className="my-2.5 overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead className="bg-slate-100">
                <tr>
                  {block.headers.map((h, hIdx) => (
                    <th
                      key={`${key}-th-${hIdx}`}
                      className="border border-slate-300 px-2.5 py-1.5 font-bold text-slate-900"
                    >
                      {renderInlineNodes(h, `${key}-th-${hIdx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rIdx) => (
                  <tr key={`${key}-tr-${rIdx}`} className="odd:bg-white even:bg-slate-50/50">
                    {row.map((cell, cIdx) => (
                      <td
                        key={`${key}-td-${rIdx}-${cIdx}`}
                        className="border border-slate-300 px-2.5 py-1.5 align-top text-slate-800"
                      >
                        {renderInlineNodes(cell, `${key}-td-${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    }
  })
}

export default function AiMarkdownFormatter() {
  const [sourceText, setSourceText] = useState('')
  const [target, setTarget] = useState<FormatTarget>('word')
  const [options, setOptions] = useState<FormatterOptions>(
    DEFAULT_FORMATTER_OPTIONS
  )
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const result = useMemo(
    () => formatAiMarkdown(sourceText, options),
    [sourceText, options]
  )

  const markCopied = (key: string) => {
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 2000)
  }

  const handleCopyPlain = async (value: string, key: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      markCopied(key)
    } catch {
      // Clipboard API 制限環境でもエラーを投げない
    }
  }

  const handleCopyRichHtml = async () => {
    if (!result.richHtml) return
    try {
      if (
        typeof ClipboardItem !== 'undefined' &&
        typeof navigator.clipboard?.write === 'function'
      ) {
        const item = new ClipboardItem({
          'text/html': new Blob([result.richHtml], { type: 'text/html' }),
          'text/plain': new Blob([result.plainText], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
        markCopied('rich')
        return
      }
      await navigator.clipboard.writeText(result.plainText)
      markCopied('rich')
    } catch {
      try {
        await navigator.clipboard.writeText(result.plainText)
        markCopied('rich')
      } catch {
        // ignore clipboard permission restriction
      }
    }
  }

  const handleDownloadCsv = (table: ExtractedTable) => {
    const bytes = createExcelCsvBlobBytes(table.csv)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const blob = new Blob([copy], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `table-${table.index}-excel-utf8bom.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleLoadSample = () => {
    setSourceText(SAMPLE_AI_MARKDOWN)
  }

  const handleClear = () => {
    setSourceText('')
  }

  const toggleOption = (
    key: 'normalizeMath' | 'stripAiCitations' | 'guardFormulaInjection' | 'collapseBlankLines'
  ) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const hasContent = sourceText.trim().length > 0

  return (
    <div className="space-y-4">
      {/* 上部1行バー: 出力先タブ ＋ サンプル/クリア */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div
          role="group"
          aria-label="出力先の選択"
          className="flex flex-wrap items-center gap-1.5"
        >
          {TARGET_TABS.map((tab) => {
            const active = target === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTarget(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-sky-700 text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.id === 'word' && <FileText className="h-3.5 w-3.5" />}
                {tab.id === 'excel' && <FileSpreadsheet className="h-3.5 w-3.5" />}
                {tab.id === 'slack' && <Hash className="h-3.5 w-3.5" />}
                {tab.id === 'plain' && <MessageSquare className="h-3.5 w-3.5" />}
                <span>{tab.label}</span>
                {tab.id === 'excel' && result.tables.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active
                        ? 'bg-sky-800 text-sky-100'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {result.tables.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
          >
            <Sparkles className="h-3.5 w-3.5" />
            サンプルを試す
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!sourceText}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            クリア
          </button>
        </div>
      </div>

      {/* セキュリティ無害化通知（外部画像や危険URIが含まれる場合のみ表示） */}
      {(result.stats.blockedExternalImages > 0 ||
        result.stats.blockedUnsafeLinks > 0) && (
        <div
          data-testid="md-security-notice"
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            外部送信とスクリプト実行を防ぐため、
            {result.stats.blockedExternalImages > 0 &&
              `外部画像の自動読み込み（${result.stats.blockedExternalImages}件）`}
            {result.stats.blockedExternalImages > 0 &&
              result.stats.blockedUnsafeLinks > 0 &&
              'および'}
            {result.stats.blockedUnsafeLinks > 0 &&
              `安全でないリンクスキーム（${result.stats.blockedUnsafeLinks}件）`}
            を安全なテキスト表記へ変換しました。
          </span>
        </div>
      )}

      {/* メイン2ペイン */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左: Markdown入力 */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="md-source-input"
              className="text-xs font-semibold text-slate-700"
            >
              AIの回答（Markdown）を貼り付け
            </label>
            <span className="text-[11px] tabular-nums text-slate-500">
              {sourceText.length.toLocaleString()}字 / 表 {result.stats.tableCount} / コード {result.stats.codeBlockCount}
            </span>
          </div>
          <textarea
            id="md-source-input"
            rows={13}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="ChatGPTやClaude等の回答をそのまま貼り付けてください（見出し・太字・Markdown表・コード・数式に対応）..."
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none sm:text-sm"
          />
        </div>

        {/* 右: 出力先別プレビュー ＆ コピー */}
        <div className="flex min-w-0 flex-col">
          {target === 'word' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  Word・Googleドキュメント用プレビュー
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyRichHtml}
                    disabled={!hasContent}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {copiedKey === 'rich' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        コピー完了
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        書式付きコピー
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyPlain(result.richHtml, 'html')}
                    disabled={!hasContent}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copiedKey === 'html' ? 'HTML完了' : 'HTML'}
                  </button>
                </div>
              </div>
              <div
                data-testid="md-word-preview"
                className="mt-1.5 min-h-[290px] max-h-[380px] flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-4"
              >
                {hasContent ? (
                  renderBlocks(result.blocks)
                ) : (
                  <p className="text-xs text-slate-400">
                    左側にMarkdownを貼り付けると、表の罫線や太字を含む貼り付けイメージがここに表示されます。
                  </p>
                )}
              </div>
            </>
          )}

          {target === 'excel' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  抽出された表データ（{result.tables.length}件）
                </span>
                {result.tables.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyPlain(result.allTablesTsv, 'all-tsv')
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-800"
                  >
                    {copiedKey === 'all-tsv' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        コピー完了
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        全表TSVコピー
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="mt-1.5 min-h-[290px] max-h-[380px] flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                {result.tables.length === 0 ? (
                  <p className="p-2 text-xs leading-relaxed text-slate-500">
                    Markdown形式の表が見つかりません。`| 列1 | 列2 |` 形式の表を含む回答を左側に貼り付けてください。
                  </p>
                ) : (
                  result.tables.map((table) => (
                    <div
                      key={table.index}
                      data-testid="extracted-table-card"
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {table.title}
                          </p>
                          <p className="text-[11px] tabular-nums text-slate-500">
                            {table.rows.length}行 × {table.headers.length}列
                            {table.formulaDangerCount > 0 &&
                              options.guardFormulaInjection &&
                              ` ・ 数式防御 ${table.formulaDangerCount}件`}
                            {table.leadingZeroCount > 0 &&
                              ` ・ 前ゼロ数値 ${table.leadingZeroCount}件（貼付先書式に注意）`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyPlain(table.tsv, `tsv-${table.index}`)
                            }
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-800"
                          >
                            {copiedKey === `tsv-${table.index}` ? (
                              <>
                                <Check className="h-3 w-3" />
                                完了
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                TSVコピー
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadCsv(table)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Download className="h-3 w-3" />
                            CSV(BOM付)
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full border-collapse border border-slate-200 text-left text-[11px]">
                          <thead className="bg-slate-50">
                            <tr>
                              {table.headers.map((h, hIdx) => (
                                <th
                                  key={hIdx}
                                  className="border border-slate-200 px-2 py-1 font-semibold text-slate-800"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.slice(0, 6).map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="border border-slate-200 px-2 py-1 whitespace-pre-wrap text-slate-700"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {target === 'slack' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="slack-table-style"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Slack mrkdwn 出力
                  </label>
                  <select
                    id="slack-table-style"
                    value={options.slackTableStyle}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        slackTableStyle: e.target.value as 'codeblock' | 'bullets',
                      }))
                    }
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 focus:border-sky-500 focus:outline-none"
                  >
                    <option value="codeblock">表: コードブロック整列</option>
                    <option value="bullets">表: 箇条書き展開</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyPlain(result.slackText, 'slack')}
                  disabled={!hasContent}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {copiedKey === 'slack' ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      コピー完了
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Slack形式でコピー
                    </>
                  )}
                </button>
              </div>
              <textarea
                id="md-slack-output"
                rows={13}
                readOnly
                value={result.slackText}
                placeholder="Slackの mrkdwn 形式（*太字*, <URL|表示名>, 等幅コードブロック表）に変換されます..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-sm"
              />
            </>
          )}

          {target === 'plain' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="md-plain-output"
                  className="text-xs font-semibold text-slate-700"
                >
                  メール・チャット用 プレーン整形
                </label>
                <button
                  type="button"
                  onClick={() => handleCopyPlain(result.plainText, 'plain')}
                  disabled={!hasContent}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {copiedKey === 'plain' ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      コピー完了
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      平文をコピー
                    </>
                  )}
                </button>
              </div>
              <textarea
                id="md-plain-output"
                rows={13}
                readOnly
                value={result.plainText}
                placeholder="記号ノイズを取り除き、■・【】・箇条書きで整えたメール向けテキストが出力されます..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-sm"
              />
            </>
          )}
        </div>
      </div>

      {/* 詳細オプション（初期折りたたみ） */}
      <details className="group rounded-xl border border-slate-200 bg-slate-50/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-800">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
            整形オプション（数式・AI引用・Excel防御）
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="grid gap-2.5 border-t border-slate-200 bg-white p-3.5 text-xs text-slate-700 sm:grid-cols-2">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={options.normalizeMath}
              onChange={() => toggleOption('normalizeMath')}
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            <span>LaTeX数式（$x^2$, \frac 等）を可読文字へ変換</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={options.stripAiCitations}
              onChange={() => toggleOption('stripAiCitations')}
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            <span>AI引用番号 [1] と追跡パラメータ（utm_source等）を除去</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={options.guardFormulaInjection}
              onChange={() => toggleOption('guardFormulaInjection')}
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            <span>Excel表の先頭 = / + / @ へ &apos; を付け数式誤認を防止</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={options.collapseBlankLines}
              onChange={() => toggleOption('collapseBlankLines')}
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            <span>連続した余分な空行を1行に整理</span>
          </label>
        </div>
      </details>
    </div>
  )
}
