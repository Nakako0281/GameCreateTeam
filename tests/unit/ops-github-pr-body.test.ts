import { describe, expect, it } from 'vitest'
import {
  isDocsOnlyChangedFiles,
  validatePullRequestBody,
} from '../../scripts/ops_github.mjs'

describe('ops_github PR template & acceptance body validation (Issue #55)', () => {
  it('detects docs-only file lists including .github/pull_request_template.md', () => {
    expect(
      isDocsOnlyChangedFiles([
        'docs/STATE.md',
        '.agents/skills/daily-ops/SKILL.md',
        '.github/pull_request_template.md',
        'README.md',
      ])
    ).toBe(true)

    expect(
      isDocsOnlyChangedFiles(['docs/STATE.md', 'src/data/llm-pricing.ts'])
    ).toBe(false)
    expect(isDocsOnlyChangedFiles([])).toBe(false)
  })

  it('rejects empty bodies, unfilled template placeholders, and unchecked boxes', () => {
    expect(validatePullRequestBody({ body: '' }).valid).toBe(false)

    const unfilledTemplate = `
<!-- comment -->
## 概要
- 対象Issue: Refs #00
- 変更の狙いと要点: TODO

## 変更と検証証跡
- プレビュー確認環境 / 対象ルート: /tools/llm-cost-calculator/
- 自動テスト・機械監査の実行結果: check:all 全通過

## サブエージェント監査と自己受け入れ確認
- [ ] 未完了のチェック項目
- AI自己受け入れテスト結果: PC 1280px と モバイル 390px で確認済み
`
    const res = validatePullRequestBody({
      body: unfilledTemplate,
      changedFiles: ['src/components/tools/LlmCostCalculator.tsx'],
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.includes('プレースホルダ'))).toBe(true)
    expect(res.errors.some((e) => e.includes('未完了チェックボックス'))).toBe(true)
  })

  it('enforces PC(1280px)/mobile(390px) self-acceptance notes on UI PRs and primary source URLs on pricing PRs', () => {
    const missingViewportAndPricingSource = `
## 概要
- 対象Issue: Closes #79, Closes #78
- 変更の狙いと要点: LLM料金シミュレーターへ性能ベンチマーク比較を追加しました。

## 変更と検証証跡
- プレビュー確認環境 / 対象ルート: /tools/llm-cost-calculator/
- 自動テスト・機械監査の実行結果: npm run check:all 9ゲート全通過を確認しました。

## サブエージェント監査と自己受け入れ確認
- サブエージェント協議・監査要約: 01・02・05でパレート散布図統合を合意しました。
- AI自己受け入れテスト結果: 画面表示を確認し問題ありませんでした。
`
    const failedUiAndPricing = validatePullRequestBody({
      body: missingViewportAndPricingSource,
      changedFiles: [
        'src/data/llm-pricing.ts',
        'src/components/tools/LlmCostCalculator.tsx',
      ],
    })
    expect(failedUiAndPricing.valid).toBe(false)
    expect(
      failedUiAndPricing.errors.some((e) => e.includes('PC(1280px)'))
    ).toBe(true)
    expect(
      failedUiAndPricing.errors.some((e) =>
        e.includes('src/data/llm-pricing.ts')
      )
    ).toBe(true)

    const validFullPrBody = `
## 概要
- 対象Issue: Closes #79, Closes #78, Closes #55
- 変更の狙いと要点: LLM料金シミュレーターにBenchLM横断性能ベンチマーク散布図・棒グラフを統合し、PR受け入れゲートを導入しました。

## 変更と検証証跡
- プレビュー確認環境 / 対象ルート: /tools/llm-cost-calculator/
- 自動テスト・機械監査の実行結果: npm run check:all 全9ゲートおよび vitest 単体テスト全通過
- 一次ソース検証: 2026-11-27 に https://ai.google.dev/gemini-api/docs/pricing および https://benchlm.ai/ を確認

## サブエージェント監査と自己受け入れ確認
- サブエージェント協議・監査要約: 01/02/05 協議により独立ページではなく実利用月額連動のパレート散布図統合を採用
- AI自己受け入れテスト結果: Playwright で PC 1280px および モバイル 390px の初期表示・散布図・棒グラフのスクリーンショットを撮影し文字潰れ・横溢れ0件を確認
- レビュアーに確認してほしい点: コスパ×性能マップのパレート最適表示と評価軸切替の操作感
`
    const passed = validatePullRequestBody({
      body: validFullPrBody,
      changedFiles: [
        'src/data/llm-pricing.ts',
        'src/components/tools/LlmCostCalculator.tsx',
      ],
    })
    expect(passed).toEqual({
      valid: true,
      docs_only: false,
      errors: [],
    })
  })

  it('exempts docs-only PRs from UI viewport screenshot requirements without requiring fake checkboxes', () => {
    const docsOnlyBody = `
## 概要
- 対象Issue: Refs #55
- 変更の狙いと要点: STATE.md の最新ステータスと運用手順を更新しました。

## 変更と検証証跡
- プレビュー確認環境 / 対象ルート: 対象外（docs-only）
- 自動テスト・機械監査の実行結果: audit:ci-parity および audit-org-memory --docs-only 通過を確認

## サブエージェント監査と自己受け入れ確認
- サブエージェント協議・監査要約: Size S ドキュメント更新のため招集省略
- AI自己受け入れテスト結果: docs-only 変更のため画面スクリーンショット確認は対象外
- レビュアーに確認してほしい点: スケジュール記載の整合性
`
    const res = validatePullRequestBody({
      body: docsOnlyBody,
      changedFiles: ['docs/STATE.md'],
    })
    expect(res).toEqual({
      valid: true,
      docs_only: true,
      errors: [],
    })
  })
})
