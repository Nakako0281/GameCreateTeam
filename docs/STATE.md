# 現在地ダッシュボード (`docs/STATE.md`)

> **単一真実（Single Source of Truth）**: 新しいチャットセッション・日次定例・週次振り返りは必ず本ファイルと `npm run ops:status` から開始すること。

- **最終更新日**: 2026-11-22
- **運用フェーズ**: `Phase 1: LocalBox Wave 2 拡充 ＆ 信頼境界・決定的CI基盤整備（PR #50 devマージ済、P0 #51・#52 対応）`
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
| トップページ | `/` | 刷新済み (2026-11-22) | ファーストビュー即アクセス型レイアウト・H1文節折り返し防止・スリムトラスト帯 |
| Tool 1 | `/tools/ai-pii-masker/` | 刷新済み (2026-11-22) | AI入力前・個人情報（PII）自動マスキング＆回答復元（即貼付UI＋カテゴリ折りたたみ＋`[PERSON_1]` 境界修正／L-08, L-10） |
| Tool 2 | `/tools/llm-cost-calculator/` | 更新済み (2026-11-22) | 最新15モデル（GPT-6/Claude 5.5・5.2/Gemini 4・3.8/DeepSeek V4）対応・為替159円・予定改定価格自動切替（Gemini 4 Argon 12/1 等・2026-11-22 4社検証済） |
| Tool 3 | `/tools/csv-encoding-fixer/` | 刷新済み (2026-11-22) | Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング（ドロップ対応単一枠化） |
| Tool 4 | `/tools/image-exif-cleaner/` | 刷新済み (2026-11-22) | 画像 EXIF/GPS位置情報 完全削除＆WebP/JPG/PNG一括軽量化（ドロップ枠最上段配置・設定簡素化） |
| Tool 5 | `/tools/ai-markdown-formatter/` | 実装済み (2026-11-22) | AI出力（Markdown・表）➔ Word書式付きHTML・Excel用TSV/BOM付CSV・Slack mrkdwn・平文整形（外部画像遮断・数式インジェクション防御付き） |
| Tool 6 | `/tools/config-sanitizer/` | 実装済み (2026-11-22) | `.env`・JSON/JSONC・マルチドキュメントYAML（K8s Secret含む）・JSONLログの非破壊秘匿値マスク＆`.env.example`生成・相互変換 |
| 法務ページ | `/privacy/` | 実装済み | プライバシーポリシー・電気通信事業法 外部送信規律公表・CMP記載（H1フレーズ制御適用） |
| 法務ページ | `/terms/` | 更新済み (2026-11-22) | 利用規約・免責事項（設定ファイル・ログ秘匿化の免責＆露出キー無効化案内を追記・H1フレーズ制御適用） |
| 法務ページ | `/about/` | 刷新済み (2026-11-22) | ゼロ送信設計・DevTools検証手順（内部組織用語除去・フィードバック導線更新／L-11） |
| 法務ページ | `/contact/` | 刷新済み (2026-11-22) | ユーザー向けフィードバックテンプレート（`user_feedback.md`）直結のお問い合わせ窓口（L-11） |

---

## 2. 最新の機械チェック結果 ＆ オープンIssue状況

- `npm run check:all`: `.node-version` / ロックファイル整合監査（`audit:ci-parity`）、決定論的組織メモリ＆信頼境界監査（`audit:memory`：L-09 退行ガード・L-11 公開境界・L-12 テンプレート/信頼境界分類・L-13 `scheduledPricing` 構造検証）、さらに Playwright による **`h1` 文節/単語途中折り返しゼロ物理計測（`L-10`）** とビルド時バージョン表示確認を含む全8ゲート + リモート GitHub Actions CI（`wait-ci` / `ready-pr` ゲート）を標準装備。
- **時刻依存鮮度ゲートの分離（`L-13`）**: 14日鮮度および `priceEffectiveUntil` 期限切れチェックは `--time-sensitive`（`npm run audit:memory:freshness`）へ分離し、日次監視（`.github/workflows/daily-freshness-check.yml` 毎日 08:30 JST・`audit:memory --docs-only --time-sensitive`）および `src/data/llm-pricing.ts` 変更PRのみで失敗判定する（無関係なPRでは警告のみ）。
- **外部入力の信頼境界（`L-12`）**: `ops_github.mjs` は `OWNER`/`COLLABORATOR`/`MEMBER` と公式 `github-actions[bot]`（`type: Bot`）・同一リポPRのみを信頼し、外部Issue・外部コメント・フォークPRは隔離して本文/タイトルをデフォルト省略する。
- **運用ルール刷新（`L-09`）**: タスク規模（Size S / M / L）と関連性に応じて1セッションあたり目安 3〜4pt を自律バッチ消化する **Adaptive Batching** 運用。ドキュメント専用PRは軽量検証（`audit:ci-parity` ＋ `audit:memory --docs-only`）で高速完了する。
- **ブランチ同期メモ**: PR #37（`*.pages.dev` 自動 `noindex` 防護）が `main` へ先行マージされているため、次回の `dev` ➔ `main` 本番リリース PR 作成時に差分を統合する。
- **Milestone 2 (`M1: Local MVP & 12 Tools`, 期限 2026-12-05)**:
  - Issue #32 `[Human] Cloudflare Pages テスト環境（*.pages.dev）実機確認 ＆ 独自ドメイン購入判断` (`owner:human`, `priority:p0`) — 人間コメント「もう少し私の方で実際に触ってみたり、他の友人エンジニアに触ってもらってから発行します」を受領済み
  - Issue #51 `[AI] 公開リポジトリの外部Issueによるプロンプトインジェクション対策（信頼境界の導入）` (`status:review`, 本PR対応)
  - Issue #52 `[AI] 日付依存チェック（料金鮮度・priceEffectiveUntil）をPRゲートから分離（11/30期限前に対応）` (`status:review`, 本PR対応)
  - Issue #33 `[AI] Wave 2（第2弾4ツール）の実装` (`owner:ai`, `priority:p1`, `status:in-progress`, 進捗 2/4: `/tools/ai-markdown-formatter/`・`/tools/config-sanitizer/` `dev`マージ済、残2本: `pdf-organizer`, `pdf-redactor`)
  - Issue #57 `[AI] PIIマスカーの検出率ベンチマーク・往復property test・検出漏れ注意表示` (`owner:ai`, `priority:p1`)
  - Issue #34 `[AI] Wave 3（第3弾4ツール）の実装` (`owner:ai`, `priority:p1`, `Size L × 4本`)
- **Milestone 3 (`M2: Custom Domain, Production Launch & AdSense Approval`, 期限 2026-12-25)**:
  - Issue #53 `[AI] 「ゼロ送信」表現を広告・解析導入後の実態に整合＆広告有効ビルドでの入力漏洩E2E追加` (`owner:ai`, `priority:p0`)
  - Issue #58 `[AI] ローンチ前倒し計画の策定と人間待ちボトルネック解消（#32分割・#35格上げ）` (`owner:ai`, `priority:p1`)
  - Issue #35 `[AI] 初期集客・被リンク獲得用 Zenn/Qiita/X 技術記事ドラフト3本作成` (`owner:ai`, `priority:p2`, `Size S × 3本`)
- **その他 AI運用・品質強化バックログ**:
  - Issue #54（自律度KPI計測）, #55（AI受入テスト・PRテンプレート）, #56（組織ルール肥大化対策）, #59（問い合わせ導線・リポジトリ公開方針/衛生）
- **Milestone 4 (`M3: Growth PDCA, EN Expansion & 100 JPY/mo`, 期限 2027-02-20)**: 収益化・英語展開・週次PDCA目標。

---

## 3. 次セッションの実行プラン（Next Action）

1. **最優先 P0（Issue #53）**: 広告・解析有効ビルド（ダミー `PUBLIC_ADSENSE_CLIENT` / GA4 ID＋通信ブロック）での入力漏洩ゼロ E2E を追加し、公開ページ・READMEの「入力データ送信ゼロ」表現整合および広告配置ポリシーを文書化する。
2. **Wave 2 残2ツール実装（Issue #33）**: 残る Wave 2 ツール（PDFローカル結合分割 `pdf-organizer`、PDF真の墨消し `pdf-redactor`）を `new-tool` スキルに従って順次実装する。
3. **`dev ➔ main` 本番リリース同期**: PR #37 差分統合を含め、まとまった区切りで `dev ➔ main` 本番リリース PR を作成し、Cloudflare テスト環境へ反映する。
