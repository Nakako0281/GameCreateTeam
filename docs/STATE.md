# 現在地ダッシュボード (`docs/STATE.md`)

> **単一真実（Single Source of Truth）**: 新しいチャットセッション・日次定例・週次振り返りは必ず本ファイルと `npm run ops:status` から開始すること。

- **最終更新日**: 2026-11-22
- **運用フェーズ**: `Phase 0 / Phase 1: LocalBox MVP（Wave 1）構築完了 ＆ 適量バッチ運用（Adaptive Batching / L-09）への刷新・P0フィードバック消化中`
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
| Tool 1 | `/tools/ai-pii-masker/` | 修正済み (2026-11-22) | AI入力前・個人情報（PII）自動マスキング＆回答復元（日本語助詞境界・`[PERSON_1]` 復元・未復元検知を刷新／L-08） |
| Tool 2 | `/tools/llm-cost-calculator/` | 刷新済み (2026-11-21) | 最新15モデル（GPT-6/Claude 5.5・5.2/Gemini 4・3.8/DeepSeek V4）対応・為替159円・プロバイダ絞り込み・14日鮮度＆改定日自動監視 |
| Tool 3 | `/tools/csv-encoding-fixer/` | 実装済み | Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング |
| Tool 4 | `/tools/image-exif-cleaner/` | 実装済み | 画像 EXIF/GPS位置情報 完全削除＆WebP/JPG/PNG一括軽量化 |
| 法務ページ | `/privacy/` | 実装済み | プライバシーポリシー・電気通信事業法 外部送信規律公表・CMP記載 |
| 法務ページ | `/terms/` | 実装済み | 利用規約・免責事項 |
| 法務ページ | `/about/` | 実装済み | 運営方針・技術アーキテクチャ・DevToolsゼロ送信検証ガイド |
| 法務ページ | `/contact/` | 実装済み | ゼロPII方針に基づくお問い合わせ窓口案内（Issue #41 で導線再設計予定） |

---

## 2. 最新の機械チェック結果 ＆ オープンIssue状況

- `npm run check:all`: `.node-version` / ロックファイル整合監査（`audit:ci-parity`）、14日鮮度・`priceEffectiveUntil`改定日・退役モデルIDブロック＋硬直1タスク固定ルール退行ガード（`audit:memory` / `L-09`）を含む全8ゲート + リモート GitHub Actions CI（`wait-ci` / `ready-pr` ゲート）を標準装備。
- **運用ルール刷新（`L-09`）**: 「1回＝1 Issue固定」を撤廃し、タスク規模（Size S / M / L）と関連性に応じて1セッションあたり目安 3〜4pt を自律バッチ消化する **Adaptive Batching** 運用へ移行。ドキュメント専用PRは軽量検証（`audit:ci-parity` ＋ `audit:memory --docs-only`）で高速完了する。
- 日次自動監視（`.github/workflows/daily-freshness-check.yml`）: 毎日 08:30 JST に `audit:memory --docs-only` を実行し、14日超過・改定期限切れ（P0）および7日以内の改定予告（P1）を自動Issue化（`L-07`）。
- **ブランチ同期メモ**: PR #37（`*.pages.dev` 自動 `noindex` 防護）が `main` へ先行マージされているため、次回の `dev` ➔ `main` 本番リリース PR 作成時に差分を統合する。
- **Milestone 2 (`M1: Local MVP & 12 Tools`, 期限 2026-12-05)**:
  - Issue #32 `[Human] Cloudflare Pages テスト環境（*.pages.dev）実機確認 ＆ 独自ドメイン購入判断` (`owner:human`, `priority:p0`) — 人間コメント「もう少し私の方で実際に触ってみたり、他の友人エンジニアに触ってもらってから発行します」を受領済み
  - Issue #38 `LLMトークン数＆API料金 リアルタイム比較シミュレーターについて。` (`status:done`, **クローズ済み**) — PR #42 の `dev` マージ確認後に完了クローズ（2026-11-22）
  - Issue #44 `[PERSON_1]が復元されない` (`status:done`, **クローズ済み**) — PR #45 の `dev` マージ確認後に完了クローズ（2026-11-22）
  - Issue #41 `README記載内容について。` (`owner:ai`, `priority:p0`, `status:ready`, `Size S`) — ツール利用者に内部マネタイズ記載が見えないよう `README.md` と問い合わせ導線を再設計予定
  - Issue #39 `Webのデザインについて。` (`owner:ai`, `priority:p0`, `status:ready`, `Size M`) — 情報過多の解消・ファーストビュー即操作性向上・解説階層化の抜本改善を予定
  - Issue #46 `文字について。` (`owner:ai`, `priority:p0`, `status:ready`, `Size S`) — 見出しタイトル内の単語途中折り返し（例：`ブラウ/ザ`）防止。Issue #39 と同一バッチ・同一PRで修正予定
  - Issue #43 `バージョン表示について検討する` (`owner:ai`, `priority:p1`, `status:ready`, `Size S`) — トリアージ済み・ビルド時自動注入によるフッター端＆`<meta name="app-version">` 案を提示済み
  - Issue #33 `[AI] Wave 2（第2弾4ツール）の実装` (`owner:ai`, `priority:p1`, `Size L × 4本`)
  - Issue #34 `[AI] Wave 3（第3弾4ツール）の実装` (`owner:ai`, `priority:p1`, `Size L × 4本`)
- **Milestone 3 (`M2: Custom Domain, Production Launch & AdSense Approval`, 期限 2026-12-25)**:
  - Issue #35 `[AI] 初期集客・被リンク獲得用 Zenn/Qiita/X 技術記事ドラフト3本作成` (`owner:ai`, `priority:p2`, `Size S × 3本`)
- **Milestone 4 (`M3: Growth PDCA, EN Expansion & 100 JPY/mo`, 期限 2027-02-20)**: 収益化・英語展開・週次PDCA目標。

---

## 3. 次セッションの適量バッチ実行プラン（Next Action）

`daily-ops`（Adaptive Batching / 目安 3〜4pt）に基づき、関連タスクをまとめて効率よく消化する：

1. **Batch A（軽量・管理/表示系 2pt: Size S + Size S ➔ 1PR集約も可）**: Issue #41（公開 `README.md` ＆ `/contact/` 導線再設計）＋ Issue #43（ビルド時自動バージョン表示）。
2. **Batch B（UI/デザイン抜本改善 3pt: Size M + Size S ➔ 密接関連のため同一PR統合）**: Issue #39（情報過多削減・即操作性向上のデザイン刷新）＋ Issue #46（見出しタイトル単語の途中折り返し防止）。
3. **Batch C（Wave 2 着工 ＆ `dev ➔ main` 同期）**: P0解消後、Issue #33（Wave 2 ツール群）を順次実装しつつ、PR #37 差分を含む `dev ➔ main` 本番リリース PR 準備を適宜行う。
