# 現在地ダッシュボード (`docs/STATE.md`)

> **単一真実（Single Source of Truth）**: 新しいチャットセッション・日次定例・週次振り返りは必ず本ファイルと `npm run ops:status` から開始すること。

- **最終更新日**: 2026-11-26
- **運用フェーズ**: `Phase 1 → Phase 2 前倒し移行中（PR #69 main ➔ dev 同期完了／PR #65 レビュー待ち／Wave 2 第3弾 pdf-redactor PR作成）`
- **収益目標**: **2027-02-20 までに Google AdSense 月 100 円以上**（達成後は月 1,000 円 → 10,000 円へ拡大）
- **対象リポジトリ**: `Nakako0281/GameCreateTeam`（旧 GameCreateTeam v1 はタグ `archive/game-create-team-v1` で保全済み）
- **ブランド / サイト名**: **TemotoBox**（生成AI・社外共有前の下ごしらえ特化型・検証可能なブラウザ完結実務ワークベンチ／`ADR-004`）
- **テスト環境URL**: Cloudflare Workers / Pages（`*.workers.dev`・`*.pages.dev` ともに `X-Robots-Tag: noindex, nofollow` 保護済み、`PUBLIC_NOINDEX=true` でバナー・meta制御可）
- **本番URL**: 未公開（取得対象ドメイン `temotobox.com` 確定済み・`ADR-004`／Issue #32 で人間によるドメイン取得＆先行公開予定）
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
| Tool 5 | `/tools/pdf-redactor/` | 実装済み (2026-11-26) | PDF「真の墨消し（黒塗り/白塗り）」＆Info/XMPメタデータ完全削除（全ページ画像化・PII候補1クリック提案・処理後0文字/0件再検査証明） |
| Tool 6 | `/tools/ai-markdown-formatter/` | 実装済み (2026-11-22) | AI出力（Markdown・表）➔ Word書式付きHTML・Excel用TSV/BOM付CSV・Slack mrkdwn・平文整形（外部画像遮断・数式インジェクション防御付き） |
| Tool 7 | `/tools/config-sanitizer/` | 実装済み (2026-11-22) | `.env`・JSON/JSONC・マルチドキュメントYAML（K8s Secret含む）・JSONLログの非破壊秘匿値マスク＆`.env.example`生成・相互変換 |
| 法務ページ | `/privacy/` | 更新済み (2026-11-23) | プライバシーポリシー・電気通信事業法 外部送信規律公表・CMP記載（入力データ送信ゼロ＋GA4/AdSense分離明記） |
| 法務ページ | `/terms/` | 更新済み (2026-11-22) | 利用規約・免責事項（設定ファイル・ログ秘匿化の免責＆露出キー無効化案内を追記・H1フレーズ制御適用） |
| 法務ページ | `/about/` | 刷新済み (2026-11-23) | 入力データ非送信設計・DevTools検証手順（GA4/AdSense通信と入力処理の分離検証手順へ統一・L-14） |
| 法務ページ | `/contact/` | 刷新済み (2026-11-23) | ユーザー向けフィードバックテンプレート（`user_feedback.md`）直結のお問い合わせ窓口（L-11, L-14） |

---

## 2. 最新の機械チェック結果 ＆ オープンIssue状況

- `npm run check:all`: `.node-version` / ロックファイル整合監査（`audit:ci-parity`）、決定論的組織メモリ＆信頼境界監査（`audit:memory`：L-09 退行ガード・L-11 公開境界・L-12 テンプレート/信頼境界分類・L-13 `scheduledPricing` 構造検証）、`audit:seo` 内の **無条件ゼロ送信表現機械検出（`findUnqualifiedZeroSendClaims` / L-14）**、Playwright による **`h1` 文節/単語途中折り返しゼロ物理計測（`L-10`）** とビルド時バージョン表示確認、さらに **広告(AdSense)・GA4有効ビルドでの全7ツール入力漏洩ゼロ証明（`npm run test:e2e:ads` / L-14）** を含む全9ゲート + リモート GitHub Actions CI（`wait-ci` / `ready-pr` ゲート）を標準装備。
- **時刻依存鮮度ゲートの分離（`L-13`）**: 14日鮮度および `priceEffectiveUntil` 期限切れチェックは `--time-sensitive`（`npm run audit:memory:freshness`）へ分離し、日次監視（`.github/workflows/daily-freshness-check.yml` 毎日 08:30 JST・`audit:memory --docs-only --time-sensitive`）および `src/data/llm-pricing.ts` 変更PRのみで失敗判定する（無関係なPRでは警告のみ）。
- **外部入力の信頼境界（`L-12`）**: `ops_github.mjs` は `OWNER`/`COLLABORATOR`/`MEMBER` と公式 `github-actions[bot]`（`type: Bot`）・同一リポPRのみを信頼し、外部Issue・外部コメント・フォークPRは隔離して本文/タイトルをデフォルト省略する。
- **運用ルール刷新（`L-09` & 人間待ち3日ルール）**: タスク規模（Size S / M / L）と関連性に応じて1セッションあたり目安 3〜4pt を自律バッチ消化する **Adaptive Batching** 運用。ドキュメント専用PRは軽量検証（`audit:ci-parity` ＋ `audit:memory --docs-only`）で高速完了し、`owner:human` Issue の3日以上滞留時は分割案・代替案付きでリマインドする。
- **ガバナンス ＆ 3層ハーネス（`ADR-005` / L-15）**: `.agents/hooks.json`（`SessionStart` 乖離警告、`PreToolUse` の `main`/`dev` 直操作 `deny` ＆ 保護ファイル/`main` PR `force_ask`）、`ops_github.mjs`（`status` の `branch_sync`・`create-pr` の `main`/連鎖ガード）、`.github/workflows/ci.yml`（`base_ref=main` サーバーゲート）を標準装備。常時読み込みルール（`AGENTS.md` + `.agents/rules/AGENTS.md`）も重複削減で純減し、90行ソフト予算警告を導入（Issue #56 前進）。
- **ブランチ同期状態**: PR #69（`chore/sync-main-to-dev` ➔ `dev`）のマージにより、`origin/main`（PR #37）と `origin/dev` の先行乖離・競合は解消済み（`main_ahead_by = 0`）。PR #65（`feat/pii-benchmark-and-promo-3` ➔ `dev`）も最新 `dev` 基準で CI 全通過済み。
- **Milestone 2 (`M1: Local MVP & 12 Tools`, 期限 2026-12-05)**:
  - Issue #32 `[Human] Cloudflare Pages テスト環境（*.pages.dev）実機確認 ＆ 独自ドメイン購入判断` (`owner:human`, `priority:p0`) — ブランド名 `TemotoBox`・取得対象ドメイン **`temotobox.com`**（ADR-004）で確定、Track A（11/29目標 独自ドメイン取得＆GSC登録）と Track B（12/6目標 友人検証）の2トラック分割案を提示中（`dev ➔ main` リリースPR作成前に確認）
  - Issue #33 `[AI] Wave 2（第2弾4ツール）の実装` (`owner:ai`, `priority:p1`, `status:in-progress`, 進捗 3/4: `/tools/ai-markdown-formatter/`・`/tools/config-sanitizer/` `dev`マージ済、`/tools/pdf-redactor/` PR提出、残1本: `pdf-organizer`)
  - Issue #57 `[AI] PIIマスカーの検出率ベンチマーク・往復property test・検出漏れ注意表示` (`owner:ai`, `priority:p1`, `status:review`, PR #65)
  - Issue #34 `[AI] Wave 3（第3弾4ツール）の実装` (`owner:ai`, `priority:p1`, `Size L × 4本`, `ADR-004` 優先順: `text-cleaner` → `offline-qr-password` → `jp-business-days` → `regex-tester-jp`)
- **Milestone 3 (`M2: Custom Domain, Production Launch & AdSense Approval`, 期限 2026-12-25 / ADR-003 前倒し目標 2026-11-29 公開・12/10申請)**:
  - Issue #35 `[AI] 初期集客・被リンク獲得用 Zenn/Qiita/X 技術記事ドラフト3本作成` (`owner:ai`, `priority:p1`, `status:review`, PR #65)
- **その他 AI運用・品質強化バックログ**:
  - Issue #54（自律度KPI計測）, #55（AI受入テスト・PRテンプレート）, #56（組織ルール肥大化対策）, #59（問い合わせ導線・リポジトリ公開方針/衛生）
- **Milestone 4 (`M3: Growth PDCA, EN Expansion & 100 JPY/mo`, 期限 2027-02-20)**: 収益化・英語展開・週次PDCA目標。

---

## 3. 次セッションの実行プラン（Next Action）

1. **`dev ➔ main` 本番公開 ＆ 記事公開（#32 Track A ＋ #66 ＋ #68）**: PR #65 および Wave 2 `pdf-redactor` PR を `dev` へマージ後、人間の事前合意のもとで競合ゼロの純粋な `dev ➔ main` リリース PR を作成・マージし、`temotobox.com` 本番公開・GSC/GA4登録（#32 Track A）・GitHub Branch Rulesets（#68）・記事公開（#66）を進める。
2. **Wave 2 残1ツール実装（Issue #33 完了へ）**: `pdf-organizer`（PDF完全ローカル結合・分割・ページ並べ替え）を実装し、Wave 2（4/4）を完遂する。
3. **LLM料金自動切替確認（12/1 予定）＆ Wave 3・運用改善消化**: `gemini-4-argon` 12/1 価格改定の一次ソース確認および Issue #34 / #54〜#56 / #59 を進める。
