---
name: autonomous-web-studio
description: AutoGrowth Studio の標準運用ワークフロー全体。セッション開始・終了、GitHub Issue/PR運用、サブエージェント協働、機械チェックゲート、自己進化ルールを定義する。
---

# AutoGrowth Studio 標準運用スキル

## 1. セッション開始プロトコル（必須）
毎回コンテキストがリセットされる前提で、必ず最初に以下を実行する：
1. `docs/STATE.md` を読み込み、現在のフェーズ・本番ドメイン・公開中ツール・直近の課題を把握する。
2. `npm run ops:status` を実行し、`owner:human` / `owner:ai` のオープンIssue・直近7日に人間がCloseした `owner:human` Issue・オープンPRを確認する。
3. 重要制約を再確認するため `AGENTS.md` と `docs/POSTMORTEM_AND_LESSONS.md` の最新追記分を確認する。

## 2. サブエージェント協働プロトコル
単独判断での見落としを防ぐため、`.agents/members/00`〜`06` のロールを意識し、必要に応じて `define_subagent` / `invoke_subagent` で以下を招集する：
- 企画・SEO時: `01_market_seo_strategist` ＋ `05_devils_advocate_critic`
- 実装・UI変更時: `02_product_ux_architect` ＋ `03_security_privacy_officer`
- リリース前監査: `05_devils_advocate_critic` ＋ `06_growth_qa_analyst`

## 3. 人間（従業員兼最終責任者）との連携ルール
- 人間に依頼する外部操作（ドメイン購入・Cloudflare連携・AdSense申請・記事投稿・PRレビュー）は、チャットで済ませず **必ず `owner:human` ラベルの GitHub Issue を起票** する。
- 質問・確認事項がある場合も「AIチームの調査結果と最善案」を先に確定して記載する。
- 人間が `owner:human` IssueをCloseしていた場合、そのコメント内容を読み取り、`docs/STATE.md` と後続タスクを即座に更新する。

## 4. 完了・引き継ぎプロトコル（必須）
1. `package.json` / 依存変更時はローカルで `npm ci` のクリーン再現確認を行う（ロックファイル不整合によるCI落ち防止）。
2. `npm run check:all` を実行し、`audit:ci-parity` を含む全ゲートがエラー0件で通過することを確認する。
3. `docs/STATE.md` を最新状態（完了内容・チェック結果・次の最優先タスク）へ更新する。
4. 最新 `dev` から切った作業ブランチへコミット＆Pushし、`node scripts/ops_github.mjs create-pr` で `dev` 宛ての **Draft PR** を作成（または既存PRを更新）する（本番反映時は `dev` ➔ `main` のリリースPRを作成）。**`main` / `dev` 直接PushとPR自己マージは絶対に行わない。**
5. **`node scripts/ops_github.mjs ready-pr <pr_number>` を実行して GitHub Actions CI の完了・全ジョブ `success` 確認と Ready 昇格を完了させる。** 1件でも失敗した場合は自動取得したログから修正・再Pushし、リモートCIが完全通過するまで人間への完了・確認依頼は絶対に行わない。
