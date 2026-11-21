# 現在地ダッシュボード (`docs/STATE.md`)

> **単一真実（Single Source of Truth）**: 新しいチャットセッション・日次定例・週次振り返りは必ず本ファイルと `npm run ops:status` から開始すること。

- **最終更新日**: 2026-11-21
- **運用フェーズ**: `Phase 0 / Phase 1: LocalBox MVP（Wave 1）構築完了 ＆ 人間テスト環境フィードバック（#38, #39, #41）の P0 対応中`
- **収益目標**: **2027-02-20 までに Google AdSense 月 100 円以上**（達成後は月 1,000 円 → 10,000 円へ拡大）
- **対象リポジトリ**: `Nakako0281/GameCreateTeam`（旧 GameCreateTeam v1 はタグ `archive/game-create-team-v1` で保全済み）
- **ブランド / サイト名**: **LocalBox**（完全ブラウザ完結・ゼロ送信 実務ツールスタジオ）
- **本番URL**: 未公開（人間によるテスト環境実機確認・友人エンジニア検証の後に独自ドメイン購入予定／Issue #32）
- **AdSense状態**: 未申請（Phase 2 で12ツール整備＆公開後に初回申請予定）
- **GA4 / GSC接続**: 未接続（独自ドメイン購入＆本番デプロイ時に設定）

---

## 1. 実装済みコンテンツ（Wave 1: 公開準備完了）

| 種別 | URLパス | 状態 | 概要 |
| :--- | :--- | :---: | :--- |
| トップページ | `/` | 実装済み | LocalBox 価値提案・技術保証・ツール一覧・予定ロードマップ |
| Tool 1 | `/tools/ai-pii-masker/` | 実装済み | AI入力前・個人情報（PII）自動マスキング＆回答復元 |
| Tool 2 | `/tools/llm-cost-calculator/` | 刷新済み (2026-11-21) | 最新15モデル（GPT-6/Claude 5.5・5.2/Gemini 4・3.8/DeepSeek V4）対応・為替159円・プロバイダ絞り込み・14日鮮度＆改定日自動監視 |
| Tool 3 | `/tools/csv-encoding-fixer/` | 実装済み | Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング |
| Tool 4 | `/tools/image-exif-cleaner/` | 実装済み | 画像 EXIF/GPS位置情報 完全削除＆WebP/JPG/PNG一括軽量化 |
| 法務ページ | `/privacy/` | 実装済み | プライバシーポリシー・電気通信事業法 外部送信規律公表・CMP記載 |
| 法務ページ | `/terms/` | 実装済み | 利用規約・免責事項 |
| 法務ページ | `/about/` | 実装済み | 運営方針・技術アーキテクチャ・DevToolsゼロ送信検証ガイド |
| 法務ページ | `/contact/` | 実装済み | ゼロPII方針に基づくお問い合わせ窓口案内（Issue #41 で導線再設計予定） |

---

## 2. 最新の機械チェック結果 ＆ オープンIssue状況

- `npm run check:all`: `.node-version` / ロックファイル整合監査（`audit:ci-parity`）、14日鮮度・`priceEffectiveUntil`改定日・退役モデルIDブロック（`audit:memory`）を含む全8ゲート + リモート GitHub Actions CI（`wait-ci` / `ready-pr` ゲート）を標準装備。
- 日次自動監視（`.github/workflows/daily-freshness-check.yml`）: 毎日 08:30 JST に `audit:memory --docs-only` を実行し、14日超過・改定期限切れ（P0）および7日以内の改定予告（P1）を自動Issue化（`L-07`）。
- **Milestone 2 (`M1: Local MVP & 12 Tools`, 期限 2026-12-05)**:
  - Issue #32 `[Human] Cloudflare Pages テスト環境（*.pages.dev）実機確認 ＆ 独自ドメイン購入判断` (`owner:human`, `priority:p0`) — 人間コメント「もう少し私の方で実際に触ってみたり、他の友人エンジニアに触ってもらってから発行します」を受領済み
  - Issue #38 `LLMトークン数＆API料金 リアルタイム比較シミュレーターについて。` (`owner:ai`, `priority:p0`, `status:in-progress`) — 2026年11月最新15モデル刷新 ＆ `L-07` 機械監視を本スライスで実装・PR提出
  - Issue #41 `README記載内容について。` (`owner:ai`, `priority:p0`, `status:ready`) — ツール利用者に内部マネタイズ記載が見えないよう `README.md` と問い合わせ導線を再設計予定
  - Issue #39 `Webのデザインについて。` (`owner:ai`, `priority:p0`, `status:ready`) — 情報過多の解消・ファーストビュー即操作性向上・解説階層化の抜本改善を予定
  - Issue #33 `[AI] Wave 2（第2弾4ツール）の実装` (`owner:ai`, `priority:p1`)
  - Issue #34 `[AI] Wave 3（第3弾4ツール）の実装` (`owner:ai`, `priority:p1`)
- **Milestone 3 (`M2: Custom Domain, Production Launch & AdSense Approval`, 期限 2026-12-25)**:
  - Issue #35 `[AI] 初期集客・被リンク獲得用 Zenn/Qiita/X 技術記事ドラフト3本作成` (`owner:ai`, `priority:p2`)
- **Milestone 4 (`M3: Growth PDCA, EN Expansion & 100 JPY/mo`, 期限 2027-02-20)**: 収益化・英語展開・週次PDCA目標。

---

## 3. 次セッションの最優先アクション（Next Action）

1. **P0（最優先）Issue #41 対応**: 公開 `README.md` から内部マネタイズ戦略を分離・エンドユーザー向け製品案内に刷新し、`/contact/` から飛んだ際の見え方・問い合わせ導線を再設計する。
2. **P0（最優先）Issue #39 対応**: サイト全体・ツールUIの情報密度を見直し、文字過多の削減と「ぱっと見で即操作できる」洗練されたUI/デザインへ抜本改善する（SEO静的HTMLテキスト量との両立を含む）。
3. **Wave 2 ツール着工 ＆ 人間完了待ち検知**: `npm run ops:status` で Issue #32 のドメイン・GA4進捗を確認しつつ、P0解消後に Issue #33（PDF真の墨消し、PDFローカル結合分割、AI Markdown整形、`.env`/JSONサニタイズ）へ着手する。
