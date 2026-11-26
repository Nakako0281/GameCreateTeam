# 現在地ダッシュボード (`docs/STATE.md`)

> **単一真実（Single Source of Truth）**: 新しいチャットセッション・日次定例・週次振り返りは必ず本ファイルと `npm run ops:status` から開始すること。

- **最終更新日**: 2026-11-26
- **運用フェーズ**: `Phase 2 本番 main 初回公開済み・7ツール dev 統合完了（PR #71 main公開・PR #73 pdf-redactor・PR #74 履歴同期完了／週次監査 L-17・L-18・#56 反映）`
- **収益目標**: **2027-02-20 までに Google AdSense 月 100 円以上**（達成後は月 1,000 円 → 10,000 円へ拡大）
- **対象リポジトリ**: `Nakako0281/GameCreateTeam`（旧 GameCreateTeam v1 はタグ `archive/game-create-team-v1` で保全済み）
- **ブランド / サイト名**: **TemotoBox**（生成AI・社外共有前の下ごしらえ特化型・検証可能なブラウザ完結実務ワークベンチ／`ADR-004`）
- **テスト環境URL**: Cloudflare Workers / Pages（`*.workers.dev`・`*.pages.dev` ともに `X-Robots-Tag: noindex, nofollow` 保護済み、`PUBLIC_NOINDEX=true` でバナー・meta制御可）
- **本番URL**: 未公開（取得対象ドメイン `temotobox.com` 確定・Canonical/Sitemap 自動 `https://temotobox.com` 化済／Issue #32 で最小15分手順によるドメイン接続待ち）
- **AdSense状態**: 未申請（12/10 初回申請目標に向けツール拡充＆独自ドメイン公開準備完了）
- **GA4 / GSC接続**: 未接続（独自ドメイン購入＆本番デプロイ時に設定）

---

## 1. 実装済みコンテンツ（公開中7ツール ＋ 法務4ページ）

| 種別 | URLパス | 状態 | 概要 |
| :--- | :--- | :---: | :--- |
| トップページ | `/` | 刷新済み (2026-11-22) | ファーストビュー即アクセス型レイアウト・H1文節折り返し防止・スリムトラスト帯 |
| Tool 1 | `/tools/ai-pii-masker/` | 強化済み (2026-11-23) | AI入力前・個人情報（PII）自動マスキング＆回答復元（115件評価コーパス Recall 98.9%/Precision 100.0%・`fast-check` 往復property test・常時目視確認注意表示／L-08, L-10, L-16） |
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

- `npm run check:all`: `.node-version` / ロックファイル整合監査（`audit:ci-parity`）、決定論的組織メモリ＆信頼境界監査（`audit:memory`：公開ツール5ファイル横断同期 `auditPublishedToolSync`・旧ブランド/廃止呼称ドリフト検査・POSTMORTEM `Tier A/B/C` 分類強制・`--docs-only` 時の `README.md` L-14 検査・L-11/L-12/L-13）、`audit:security`（直接＆本番推移的依存のコピーレフト拒否・`public/pdfjs/` `.wasm` 非混入監査）、`audit:seo`（L-14 無条件ゼロ送信表現検出・`validateRobotsAndCanonical` による `pages.dev`/`workers.dev`/`example.com`/相対Sitemap拒否）、Playwright による **`h1` 文節/単語途中折り返しゼロ物理計測（`L-10`）**、さらに **広告(AdSense)・GA4有効ビルドでの全7ツール入力漏洩ゼロ証明（`npm run test:e2e:ads` / L-14）** を含む全9ゲート + リモート GitHub Actions CI（`wait-ci` / `ready-pr` ゲート）を標準装備。
- **時刻依存鮮度ゲートの分離（`L-13`）**: 14日鮮度および `priceEffectiveUntil` 期限切れチェックは `--time-sensitive`（`npm run audit:memory:freshness`）へ分離し、日次監視（`.github/workflows/daily-freshness-check.yml` 毎日 08:30 JST）および `src/data/llm-pricing.ts` 変更PRのみで失敗判定する（2026-11-26 当日一次確認でも4社15モデル・12/1 `gemini-4-argon` 予定改定単価に乖離なし）。
- **外部入力の信頼境界（`L-12`）＆ 自律度KPI強制（`L-18`）**: `ops_github.mjs` は信頼済み作成者・同一リポPRのみを信頼し、`create-issue` 時に `found-by:ai|human` / `origin:planned` 排他指定を必須化、`status` で未分類Issueおよび72時間超滞留 `owner:human` Issueを常時可視化する。
- **ガバナンス・3層ハーネス ＆ ルール予算管理（`ADR-005` / L-15 / Issue #56 完了）**: `.agents/hooks.json`・`ops_github.mjs`（`create-pr` / `update-pr --base` ガード・事前 `git fetch`・ファイル差分判別）・`.github/workflows/ci.yml` を標準装備。常時読み込みルールは合計122行（62行＋60行、各90行予算内）を維持し、週次退役レビューと POSTMORTEM 3層分類を定着済み。
- **ブランチ同期状態**: PR #74 により PR #71 マージコミットの `main ➔ dev` 履歴同期は完了済み（`main_ahead_by = 0`、`dev` が `pdf-redactor` 等で先行中）。
- **Milestone 2 (`M1: Local MVP & 12 Tools`, 期限 2026-12-05)**:
  - Issue #32 `[Human] Cloudflare Pages テスト環境実機確認 ＆ 独自ドメイン購入判断` (`owner:human`, `priority:p0`) — `temotobox.com` 確定・PR #71 `main` 公開済み・Day 1 最小15分3ステップ手順（ドメイン取得➔Custom Domain接続➔GSC送信）を案内済み
  - Issue #68 `[Human] GitHub Branch Rulesets（main / dev 直Push禁止・verify必須化）の設定` (`owner:human`, `priority:p1`, 公開非ブロッカー・5分手順リマインド済)
  - Issue #33 `[AI] Wave 2（第2弾4ツール）の実装` (`owner:ai`, `priority:p1`, `status:in-progress`, 進捗 3/4: `/tools/ai-markdown-formatter/`・`/tools/config-sanitizer/`・`/tools/pdf-redactor/` `dev`マージ済、残1本: `pdf-organizer`)
  - Issue #34 `[AI] Wave 3（第3弾4ツール）の実装` (`owner:ai`, `priority:p1`, `Size L × 4本`, `ADR-004` 優先順: `text-cleaner` → `offline-qr-password` → `jp-business-days` → `regex-tester-jp`)
- **Milestone 3 (`M2: Custom Domain, Production Launch & AdSense Approval`, 期限 2026-12-25 / ADR-003 前倒し目標 12/10申請)**:
  - Issue #66 `[Human] TemotoBox 公開記念 Zenn / Qiita / X 技術記事3本の投稿` (`owner:human`, `priority:p1`, `docs/promotions/` 3/3本完成・PR #71に合わせて手順最新化済、`temotobox.com` 疎通後に1本目から公開予定)
- **その他 AI運用・品質強化バックログ**:
  - Issue #55（AI受入テスト・PRテンプレート）, #56（組織ルール肥大化対策：本週次PRで完了）, #59（問い合わせ導線・リポジトリ公開方針/衛生）, #75（自動起票ワークフロー2本の信頼境界・重複抑止統一と `found-by:ai` 自動付与：`found-by:ai` 自己発見起票）
- **Milestone 4 (`M3: Growth PDCA, EN Expansion & 100 JPY/mo`, 期限 2027-02-20)**: 収益化・英語展開・週次PDCA目標。

---

## 3. 次セッションの実行プラン（Next Action）

1. **7ツール版 `dev ➔ main` 公開反映 ＆ `temotobox.com` 開通・初動記事公開（#32 ＋ #66）**: 本PRおよび `pdf-redactor` を含む `dev` を `main` へ反映し、`temotobox.com` 接続・GSCサイトマップ送信（#32）と Zenn 1本目公開（#66）で検索インデックス時計を始動する。
2. **Wave 2 完遂（`pdf-organizer` 実装で8ツール化 / Issue #33）＆ 12/1 LLM料金改定一次確認**: `pdf-organizer`（PDF完全ローカル結合・分割・ページ並べ替え）を実装して Wave 2（4/4）を完了し、2026-12-01 の `gemini-4-argon` 改定日に4社公式料金を一次検証する。
3. **保護ワークフロー統一（#75）・AI自己受入テスト導入（#55）・Wave 3（`text-cleaner` / #34）着手**: 自動起票ワークフローの信頼境界統一、PRテンプレート＋受入テスト整備、および12/10 AdSense申請に向けた Wave 3 実装を進める。
