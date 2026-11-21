# 現在地ダッシュボード (`docs/STATE.md`)

> **単一真実（Single Source of Truth）**: 新しいチャットセッション・日次定例・週次振り返りは必ず本ファイルと `npm run ops:status` から開始すること。

- **最終更新日**: 2026-11-21
- **運用フェーズ**: `Phase 0 / Phase 1: 組織基盤刷新 ＆ LocalBox MVP（Wave 1）構築完了 → 人間によるローカル確認待ち`
- **収益目標**: **2027-02-20 までに Google AdSense 月 100 円以上**（達成後は月 1,000 円 → 10,000 円へ拡大）
- **対象リポジトリ**: `Nakako0281/GameCreateTeam`（旧 GameCreateTeam v1 はタグ `archive/game-create-team-v1` で保全済み）
- **ブランド / サイト名**: **LocalBox**（完全ブラウザ完結・ゼロ送信 実務ツールスタジオ）
- **本番URL**: 未公開（独自ドメイン未購入。人間のローカル確認後、Cloudflare Pages + 独自ドメインへ公開予定）
- **AdSense状態**: 未申請（Phase 2 で12ツール整備＆公開後に初回申請予定）
- **GA4 / GSC接続**: 未接続（独自ドメイン購入＆本番デプロイ時に設定）

---

## 1. 実装済みコンテンツ（Wave 1: 公開準備完了）

| 種別 | URLパス | 状態 | 概要 |
| :--- | :--- | :---: | :--- |
| トップページ | `/` | 実装済み | LocalBox 価値提案・技術保証・ツール一覧・予定ロードマップ |
| Tool 1 | `/tools/ai-pii-masker/` | 実装済み | AI入力前・個人情報（PII）自動マスキング＆回答ワンクリック復元 |
| Tool 2 | `/tools/llm-cost-calculator/` | 実装済み | LLMトークン数＆API料金 リアルタイム比較シミュレーター（主要10モデル+カスタム） |
| Tool 3 | `/tools/csv-encoding-fixer/` | 実装済み | Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング |
| Tool 4 | `/tools/image-exif-cleaner/` | 実装済み | 画像 EXIF/GPS位置情報 完全削除＆WebP/JPG/PNG一括軽量化 |
| 法務ページ | `/privacy/` | 実装済み | プライバシーポリシー・電気通信事業法 外部送信規律公表・CMP記載 |
| 法務ページ | `/terms/` | 実装済み | 利用規約・免責事項 |
| 法務ページ | `/about/` | 実装済み | 運営方針・技術アーキテクチャ・DevToolsゼロ送信検証ガイド |
| 法務ページ | `/contact/` | 実装済み | ゼロPII方針に基づくお問い合わせ窓口案内 |

---

## 2. 最新の機械チェック結果 ＆ オープンIssue状況

- `npm run check:all`: 全7ゲート通過確認後に本ブランチからPR提出予定（`typecheck`, `test`, `build`, `audit:security`, `audit:seo`, `audit:memory`, `test:e2e`）。
- `npm audit --audit-level=high`: 2026-11-21 実行で `found 0 vulnerabilities`（exit 0）。
- **Milestone 2 (`M1: Local MVP & 12 Tools`, 期限 2026-12-05)**:
  - Issue #32 `[Human] LocalBox MVP（第1弾4ツール）のローカル実機確認 ＆ 独自ドメイン購入判断` (`owner:human`, `priority:p0`)
  - Issue #33 `[AI] Wave 2（第2弾4ツール）の実装` (`owner:ai`, `priority:p1`)
  - Issue #34 `[AI] Wave 3（第3弾4ツール）の実装` (`owner:ai`, `priority:p1`)
- **Milestone 3 (`M2: Custom Domain, Production Launch & AdSense Approval`, 期限 2026-12-25)**:
  - Issue #35 `[AI] 初期集客・被リンク獲得用 Zenn/Qiita/X 技術記事ドラフト3本作成` (`owner:ai`, `priority:p2`)
- **Milestone 4 (`M3: Growth PDCA, EN Expansion & 100 JPY/mo`, 期限 2027-02-20)**: 収益化・英語展開・週次PDCA目標。

---

## 3. 次セッションの最優先アクション（Next Action）

1. **人間の作業待ち検知**: `npm run ops:status` で Issue #32（`owner:human`）がClose・コメントされたか確認し、独自ドメイン・GA4 ID が提示されていれば本番設定PRを作成する。
2. **Wave 2 ツール着工**: Issue #33（PDF真の墨消し、PDFローカル結合分割、AI Markdown整形、`.env`/JSONサニタイズ）を1〜2ツールずつ実装・検証しPR化する。
3. **Wave 3 ツール ＆ 集客記事**: Issue #34・Issue #35 を順次消化し、12ツール揃った段階でAdSense初回申請へ進む。
