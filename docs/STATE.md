# 現在地ダッシュボード (`docs/STATE.md`)

> **単一真実（Single Source of Truth）**: 新しいチャットセッション・日次定例・週次振り返りは必ず本ファイルと `npm run ops:status` から開始すること。

- **最終更新日**: 2026-11-27
- **運用フェーズ**: `Phase 2 公開準備進行・Wave 2 全4ツール dev統合完了（計8ツール／temotobox.com は 2026-12-07 取得予定）`
- **収益目標**: **2027-02-20 までに Google AdSense 月 100 円以上**（達成後は月 1,000 円 → 10,000 円へ拡大）
- **対象リポジトリ**: `Nakako0281/GameCreateTeam`（旧 GameCreateTeam v1 はタグ `archive/game-create-team-v1` で保全済み）
- **ブランド / サイト名**: **TemotoBox**（生成AI・社外共有前の下ごしらえ特化型・検証可能なブラウザ完結実務ワークベンチ／`ADR-004`）
- **テスト環境URL**: Cloudflare Workers / Pages（`*.workers.dev`・`*.pages.dev` ともに `X-Robots-Tag: noindex, nofollow` 保護済み、`PUBLIC_NOINDEX=true` でバナー・meta制御可）
- **本番URL**: 未公開（取得対象ドメイン **`temotobox.com`**（すべて小文字）確定・Canonical/Sitemap 自動 `https://temotobox.com` 化済／**Issue #32 人間コメント合意により他個人開発ドメインと更新日を揃え `2026-12-07` に購入・接続予定、12/07まで催促リマインド停止**）
- **AdSense状態**: 未申請（2026-12-07 独自ドメイン公開後、12月中旬の初回申請目標に向け準備進行）
- **GA4 / GSC接続**: 未接続（2026-12-07 独自ドメイン購入＆本番デプロイ時に設定）

---

## 1. 実装済みコンテンツ（公開中8ツール ＋ 法務4ページ）

| 種別 | URLパス | 状態 | 概要 |
| :--- | :--- | :---: | :--- |
| トップページ | `/` | 刷新済み (2026-11-22) | ファーストビュー即アクセス型レイアウト・H1文節折り返し防止・スリムトラスト帯 |
| Tool 1 | `/tools/ai-pii-masker/` | 強化済み (2026-11-23) | AI入力前・個人情報（PII）自動マスキング＆回答復元（115件評価コーパス Recall 98.9%/Precision 100.0%・`fast-check` 往復property test・常時目視確認注意表示／L-08, L-10, L-16） |
| Tool 2 | `/tools/llm-cost-calculator/` | 強化済み (2026-11-27) | 最新15モデル（GPT-6/Claude 5.5・5.2/Gemini 4・3.8/DeepSeek V4）料金＆BenchLM性能ベンチマーク比較（実利用月額×性能のパレート最適散布図・棒グラフ・2026-11-27 一次ソース再検証済／#78, #79） |
| Tool 3 | `/tools/csv-encoding-fixer/` | 刷新済み (2026-11-22) | Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング（ドロップ対応単一枠化） |
| Tool 4 | `/tools/image-exif-cleaner/` | 刷新済み (2026-11-22) | 画像 EXIF/GPS位置情報 完全削除＆WebP/JPG/PNG一括軽量化（ドロップ枠最上段配置・設定簡素化） |
| Tool 5 | `/tools/pdf-redactor/` | 実装済み (2026-11-26) | PDF「真の墨消し（黒塗り/白塗り）」＆Info/XMPメタデータ完全削除（全ページ画像化・PII候補1クリック提案・処理後0文字/0件再検査証明） |
| Tool 6 | `/tools/pdf-organizer/` | 実装済み (2026-11-27) | PDF 完全ローカル結合・範囲分割（ZIP一括出力）・90度回転・白紙挿入・A4縦統一＆ページ単位注釈/XMP/不要構造除去＋再スキャン証明 |
| Tool 7 | `/tools/ai-markdown-formatter/` | 実装済み (2026-11-22) | AI出力（Markdown・表）➔ Word書式付きHTML・Excel用TSV/BOM付CSV・Slack mrkdwn・平文整形（外部画像遮断・数式インジェクション防御付き） |
| Tool 8 | `/tools/config-sanitizer/` | 実装済み (2026-11-22) | `.env`・JSON/JSONC・マルチドキュメントYAML（K8s Secret含む）・JSONLログの非破壊秘匿値マスク＆`.env.example`生成・相互変換 |
| 法務ページ | `/privacy/` | 更新済み (2026-11-23) | プライバシーポリシー・電気通信事業法 外部送信規律公表・CMP記載（入力データ送信ゼロ＋GA4/AdSense分離明記） |
| 法務ページ | `/terms/` | 更新済み (2026-11-22) | 利用規約・免責事項（設定ファイル・ログ秘匿化の免責＆露出キー無効化案内を追記・H1フレーズ制御適用） |
| 法務ページ | `/about/` | 刷新済み (2026-11-23) | 入力データ非送信設計・DevTools検証手順（GA4/AdSense通信と入力処理の分離検証手順へ統一・L-14） |
| 法務ページ | `/contact/` | 刷新済み (2026-11-23) | ユーザー向けフィードバックテンプレート（`user_feedback.md`）直結のお問い合わせ窓口（L-11, L-14） |

---

## 2. 最新の機械チェック結果 ＆ オープンIssue状況

- `npm run check:all`: `.node-version` / ロックファイル整合監査（`audit:ci-parity`）、決定論的組織メモリ＆信頼境界監査（`audit:memory`：L-09 退行ガード・L-11 公開境界・L-12 テンプレート/信頼境界分類・L-13 `scheduledPricing` 構造検証）、`audit:seo` 内の **無条件ゼロ送信表現機械検出（`findUnqualifiedZeroSendClaims` / L-14）**、Playwright による **`h1` 文節/単語途中折り返しゼロ物理計測（`L-10`）** とビルド時バージョン表示確認、さらに **広告(AdSense)・GA4有効ビルドでの全8ツール入力漏洩ゼロ証明（`npm run test:e2e:ads` / L-14）** を含む全9ゲート + リモート GitHub Actions CI（`wait-ci` / `ready-pr` ゲート）を標準装備。
- **時刻依存鮮度ゲートの分離（`L-13`）**: 14日鮮度および `priceEffectiveUntil` 期限切れチェックは `--time-sensitive`（`npm run audit:memory:freshness`）へ分離し、日次監視（`.github/workflows/daily-freshness-check.yml` 毎日 08:30 JST・`audit:memory --docs-only --time-sensitive`）および `src/data/llm-pricing.ts` 変更PRのみで失敗判定する（無関係なPRでは警告のみ）。
- **外部入力の信頼境界（`L-12`）**: `ops_github.mjs` は `OWNER`/`COLLABORATOR`/`MEMBER` と公式 `github-actions[bot]`（`type: Bot`）・同一リポPRのみを信頼し、外部Issue・外部コメント・フォークPRは隔離して本文/タイトルをデフォルト省略する。
- **運用ルール刷新（`L-09` & 人間待ち3日ルール）**: タスク規模（Size S / M / L）と関連性に応じて1セッションあたり目安 3〜4pt を自律バッチ消化する **Adaptive Batching** 運用。ドキュメント専用PRは軽量検証（`audit:ci-parity` ＋ `audit:memory --docs-only`）で高速完了し、`owner:human` Issue の3日以上滞留時は分割案・代替案付きでリマインドする。
- **ガバナンス ＆ 3層ハーネス（`ADR-005` / L-15 / #55 / #56）**: `.agents/hooks.json`（`SessionStart` 乖離警告、`PreToolUse` の `main`/`dev` 直操作 `deny` ＆ 保護ファイル/`main` PR `force_ask`）、`ops_github.mjs`（`status` の `branch_sync`・`create-pr` の `main`/連鎖ガード・`ready-pr` の `.github/pull_request_template.md` 必須見出し/PC・モバイル自己受け入れ証跡/料金一次ソースURL検証）、`.github/workflows/ci.yml`（`base_ref=main` サーバーゲート）を標準装備。常時読み込みルールも純減完了（Issue #56 クローズ済み）。
- **ブランチ同期状態**: PR #74 により PR #71 マージコミットの `main ➔ dev` 履歴同期は完了済み（`main_ahead_by = 0`）。また `ops:status` の `open_human_issues` に信頼済み最新コメント（`latest_trusted_comment`）を自動同梱し、人間からの日程連絡・質問の見落としを防止（`L-19`）。
- **Milestone 2 (`M1: Local MVP & 12 Tools`, 期限 2026-12-05)**:
  - Issue #32 `[Human] Cloudflare Pages テスト環境（*.pages.dev）実機確認 ＆ 独自ドメイン購入判断` (`owner:human`, `priority:p0`) — ブランド名 `TemotoBox`・取得対象ドメイン **`temotobox.com`**（すべて小文字・ADR-004）で確定。**他個人開発ドメインとの更新時期統一のため `2026-12-07` に Cloudflare Registrar で購入・接続予定（Issue #32 人間コメント合意済み・`2026-12-07` まで催促リマインド停止）**
  - Issue #33 `[AI] Wave 2（第2弾4ツール）の実装` (`owner:ai`, `status:done`, **4/4 `dev` マージ＆クローズ完了**)
  - Issue #57 `[AI] PIIマスカーの検出率ベンチマーク・往復property test・検出漏れ注意表示` (`owner:ai`, `status:done`, クローズ済み)
  - Issue #34 `[AI] Wave 3（第3弾4ツール）の実装` (`owner:ai`, `priority:p1`, `Size L × 4本`, 競合分析を踏まえ機密実務特化の `text-cleaner`・`offline-qr-password`・`jp-business-days`・`regex-tester-jp` を順次実装予定)
- **Milestone 3 (`M2: Custom Domain, Production Launch & AdSense Approval`, 期限 2026-12-25 / ADR-003 合意スケジュール: `2026-12-07` ドメイン公開・12月中旬申請)**:
  - Issue #66 `[Human] TemotoBox 公開記念 Zenn / Qiita / X 技術記事3本の投稿` (`owner:human`, `priority:p1`, `docs/promotions/` 3/3本完成・`2026-12-07` の `temotobox.com` 疎通後に1本目から公開予定、12/07までリマインド停止)
- **その他 AI運用・品質強化バックログ**:
  - 対応完了・レビュー提出: Issue #79（LLM料金シミュレーターへの性能ベンチマーク散布図・棒グラフ統合）、#78（LLM 4社料金＆12/1 Gemini 4 Argon 改定予定の一次ソース再検証）、#55（PRテンプレート・AI自己受け入れテスト・`ready-pr` 本文ゲート導入）、#56（ルール肥大化対策クローズ完了）
  - 残バックログ: Issue #75（保護ファイル `.github/workflows/` 自動起票ワークフロー2本の信頼境界・重複抑止統一と `found-by:ai` 自動付与）、#59（問い合わせ導線・リポジトリ公開方針整理・モジュール/E2E分割・古いブランチ整理）
- **Milestone 4 (`M3: Growth PDCA, EN Expansion & 100 JPY/mo`, 期限 2027-02-20)**: 収益化・英語展開・週次PDCA目標。

---

## 3. 次セッションの実行プラン（Next Action）

1. **公開前メンテナンス・品質衛生の仕上げ（Issue #75 / #59 / Wave 3 第1弾 #34）**: `2026-12-07` の本番ドメイン取得日に向け、保護対象ワークフロー改善（#75・人間承認スライス）、公開リポジトリ衛生・巨大ファイル分割（#59）、および Wave 3 優先① `text-cleaner`（#34）を推進する（※ Issue #32・#66 は `2026-12-07` ドメイン購入予定合意済みのため期日前のリマインド不要）。
2. **`2026-12-07` ドメイン取得・本番リリース ＆ 記事公開（#32 Track A ＋ #66 ＋ #68）**: 12/7 の `temotobox.com`（小文字）購入に合わせ、最新8ツール統合済み `dev ➔ main` リリースPR作成、GSC/GA4登録、および Zenn/Qiita/X 技術記事公開（#66）を実施する。
