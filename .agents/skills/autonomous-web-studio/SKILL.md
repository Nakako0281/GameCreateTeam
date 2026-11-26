---
name: autonomous-web-studio
description: AutoGrowth Studio の標準運用ワークフロー全体。セッション開始・終了、GitHub Issue/PR運用、サブエージェント協働、機械チェックゲート、自己進化ルールを定義する。
---

# AutoGrowth Studio 標準運用スキル

## 1. セッション開始プロトコル（必須）
毎回コンテキストがリセットされる前提で、最初に以下を実行する：
1. `SessionStart` フックのアラートおよび `docs/STATE.md` を読み込み、現在のフェーズ・本番ドメイン・公開中ツール・直近の課題を把握する。
2. `npm run ops:status` を実行し、`branch_sync`・`trusted_issues`（`open_human_issues` / `open_ai_issues` / `unlabeled_trusted_issues`）・`recently_closed_human_issues`・`trusted_pull_requests` を確認する（L-12 信頼境界厳守）。
3. 重要制約を確認するため [`AGENTS.md`](../../../AGENTS.md) と `docs/POSTMORTEM_AND_LESSONS.md` の最新追記分を参照する。

## 2. サブエージェント協働プロトコル（Adaptive）
単独判断での見落としを防ぐため、`.agents/members/00`〜`06` のロールを意識し、重要設計・新規ツール企画・セキュリティ境界変更・リリース前監査・**ルール例外や人間指摘による方針反転検討時**には `define_subagent` / `invoke_subagent` で以下を招集する：
- 企画・SEO時: `01_market_seo_strategist` ＋ `05_devils_advocate_critic`
- 実装・UI大幅変更時: `02_product_ux_architect` ＋ `03_security_privacy_officer`
- 大規模リリース前・例外/方針再検討時: `05_devils_advocate_critic` ＋ `03_security_privacy_officer` ＋ `06_growth_qa_analyst`

※ 通常フロー内の Size S ドキュメント整備や軽微修正では不要な招集を行わず迅速にバッチ処理を進める。

## 3. 人間との連携・エスカレーション
- 役割分離・Tier 3➔2➔1 判定・提案型相談4点セット・反迎合ルールは [`AGENTS.md`](../../../AGENTS.md) §3 を正本とする。
- 人間に依頼する外部操作（ドメイン購入・Cloudflare連携・AdSense申請・記事投稿・PRレビュー）および非同期の Tier 2 相談は、必ず `owner:human` ラベルの GitHub Issue へ事実・比較・推奨案を添えて起票する。

## 4. 完了・引き継ぎプロトコル（必須）
1. `package.json` / 依存変更時はローカルでクリーン `npm ci` の通過を確認する。
2. [運用細則 §4](../../rules/AGENTS.md) に従い変更種別ごとのローカル検証（`npm run check:all` または `--docs-only` 軽量検証）を通過させる。
3. `docs/STATE.md` を更新し、最新 `dev` から切った作業ブランチへコミット＆Pushして `dev` 宛て Draft PR を作成する（`dev`/`main` 乖離時は Tier 2 停止し `main` 宛てPRを強行しない）。**`main` / `dev` 直Push・自己マージは厳禁**（`.agents/hooks.json`・`ops_github.mjs`・`ci.yml` で拘束）。
4. **`node scripts/ops_github.mjs ready-pr <pr_number>` でリモートCI全ジョブ `success` 確認と Ready 昇格を完了させてから**、人間へ報告する。
