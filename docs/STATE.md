# 現在地ダッシュボード (`docs/STATE.md`)

> **単一真実（Single Source of Truth）**: 新しいチャットセッション・日次定例・週次振り返りは必ず本ファイルと `npm run ops:status` から開始すること。

- **最終更新日**: 2026-11-22
- **運用フェーズ**: `Phase 0 / Phase 1: LocalBox MVP（Wave 1）UI・タイポグラフィ・公開境界・バージョン表示一括刷新（P0/P1フィードバック 4件消化）`
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
| Tool 2 | `/tools/llm-cost-calculator/` | 刷新済み (2026-11-22) | 最新15モデル（GPT-6/Claude 5.5・5.2/Gemini 4・3.8/DeepSeek V4）対応・為替159円・スリムツールバー＆`tabular-nums`表 |
| Tool 3 | `/tools/csv-encoding-fixer/` | 刷新済み (2026-11-22) | Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング（ドロップ対応単一枠化） |
| Tool 4 | `/tools/image-exif-cleaner/` | 刷新済み (2026-11-22) | 画像 EXIF/GPS位置情報 完全削除＆WebP/JPG/PNG一括軽量化（ドロップ枠最上段配置・設定簡素化） |
| 法務ページ | `/privacy/` | 実装済み | プライバシーポリシー・電気通信事業法 外部送信規律公表・CMP記載（H1フレーズ制御適用） |
| 法務ページ | `/terms/` | 実装済み | 利用規約・免責事項（H1フレーズ制御適用） |
| 法務ページ | `/about/` | 刷新済み (2026-11-22) | ゼロ送信設計・DevTools検証手順（内部組織用語除去・フィードバック導線更新／L-11） |
| 法務ページ | `/contact/` | 刷新済み (2026-11-22) | ユーザー向けフィードバックテンプレート（`user_feedback.md`）直結のお問い合わせ窓口（L-11） |

---

## 2. 最新の機械チェック結果 ＆ オープンIssue状況

- `npm run check:all`: `.node-version` / ロックファイル整合監査（`audit:ci-parity`）、14日鮮度・`priceEffectiveUntil`改定日・退役モデルIDブロック＋硬直1タスク固定ルール退行ガード（`L-09`）＋公開境界リーク防止ガード（`L-11`）、さらに Playwright による **`h1` 文節/単語途中折り返しゼロ物理計測（`L-10`）** とビルド時バージョン表示確認を含む全8ゲート + リモート GitHub Actions CI（`wait-ci` / `ready-pr` ゲート）を標準装備。
- **運用ルール刷新（`L-09`）**: タスク規模（Size S / M / L）と関連性に応じて1セッションあたり目安 3〜4pt を自律バッチ消化する **Adaptive Batching** 運用。ドキュメント専用PRは軽量検証（`audit:ci-parity` ＋ `audit:memory --docs-only`）で高速完了する。
- 日次自動監視（`.github/workflows/daily-freshness-check.yml`）: 毎日 08:30 JST に `audit:memory --docs-only` を実行し、14日超過・改定期限切れ（P0）および7日以内の改定予告（P1）を自動Issue化（`L-07`）。
- **ブランチ同期メモ**: PR #37（`*.pages.dev` 自動 `noindex` 防護）が `main` へ先行マージされているため、次回の `dev` ➔ `main` 本番リリース PR 作成時に差分を統合する。
- **Milestone 2 (`M1: Local MVP & 12 Tools`, 期限 2026-12-05)**:
  - Issue #32 `[Human] Cloudflare Pages テスト環境（*.pages.dev）実機確認 ＆ 独自ドメイン購入判断` (`owner:human`, `priority:p0`) — 人間コメント「もう少し私の方で実際に触ってみたり、他の友人エンジニアに触ってもらってから発行します」を受領済み
  - Issue #38 `LLMトークン数＆API料金 リアルタイム比較シミュレーターについて。` (`status:done`, **クローズ済み**) — PR #42 の `dev` マージ確認後に完了クローズ（2026-11-22）
  - Issue #44 `[PERSON_1]が復元されない` (`status:done`, **クローズ済み**) — PR #45 の `dev` マージ確認後に完了クローズ（2026-11-22）
  - Issue #39 `Webのデザインについて。` (`status:review` へ移行予定, Size M) — ファーストビュー即操作化・重複バナー削減・`<details>` 解説階層化を実装
  - Issue #46 `文字について。` (`status:review` へ移行予定, Size S) — `PhraseHeading` による見出し文節/単語分割防止とPC/モバイル物理座標E2E検証を実装
  - Issue #41 `README記載内容について。` (`status:review` へ移行予定, Size S) — 公開 `README.md` の利用者向け刷新、`.github/ISSUE_TEMPLATE/user_feedback.md` 新設、`/contact/`・`/about/` クリーンアップ、`audit:memory` 公開境界ガードを実装
  - Issue #43 `バージョン表示について検討する` (`status:review` へ移行予定, Size S) — `astro.config.mjs` の `vite.define` でビルド時自動注入し、フッター右下＋`<meta name="app-version">` へ表示
  - Issue #33 `[AI] Wave 2（第2弾4ツール）の実装` (`owner:ai`, `priority:p1`, `Size L × 4本`)
  - Issue #34 `[AI] Wave 3（第3弾4ツール）の実装` (`owner:ai`, `priority:p1`, `Size L × 4本`)
- **Milestone 3 (`M2: Custom Domain, Production Launch & AdSense Approval`, 期限 2026-12-25)**:
  - Issue #35 `[AI] 初期集客・被リンク獲得用 Zenn/Qiita/X 技術記事ドラフト3本作成` (`owner:ai`, `priority:p2`, `Size S × 3本`)
- **Milestone 4 (`M3: Growth PDCA, EN Expansion & 100 JPY/mo`, 期限 2027-02-20)**: 収益化・英語展開・週次PDCA目標。

---

## 3. 次セッションの実行プラン（Next Action）

1. **レビュー＆マージ後のクローズ処理**: 今回バッチ PR（#39 / #41 / #43 / #46）が `dev` へマージされたことを確認後、4 Issue を `status:done` へ更新してクローズする。
2. **Wave 2 着工 ＆ `dev ➔ main` 同期**: 既存の P0 指摘が解消されたため、次セッションから Issue #33（Wave 2 ツール群：PDF真の墨消し / PDFローカル結合分割 / AI Markdown整形 / .env・JSONサニタイズ）を `new-tool` スキルに従って順次実装し、区切りで PR #37 差分を含む `dev ➔ main` 本番リリース PR を作成する。
