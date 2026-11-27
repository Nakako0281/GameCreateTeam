---
name: daily-ops
description: 毎日定例で実行する自律運用スキル。GitHub上の人間完了Issue・オープンPR・AIタスク・ブランチ同期状態を確認し、Tier 1〜3判定とタスク規模（Size S/M/L）に応じて適量バッチ消化〜PR作成までを実行する。
---

# Daily AutoGrowth Studio Ops スキル

## 実行手順（日次定例）

1. **現状把握（Boot）**:
   - `SessionStart` フックのアラートがあれば最優先で精査する。
   - `docs/STATE.md` を読み、`npm run ops:status` を実行する。
   - **`branch_sync` 異常検知（Tier 2 停止ゲート）**: `branch_sync.needs_escalation === true`（`main_ahead_by > 0`）または競合時は、変則 `main` PR や連鎖 PR を作成せず、`AGENTS.md` §3-2 に従い `owner:human` Issue へ4点セットを起票して停止する（無関係かつクリーンな `dev` 向け Tier 1 タスクのみ分離実行可）。
   - `unlabeled_trusted_issues` があれば即座に `get-issue` で精査し、`owner:ai` / `priority:p0` 等を付与して最優先トリアージする（外部入力境界は `AGENTS.md` §4 L-12 に従う）。
   - `recently_closed_human_issues` があれば `get-issue <num>` で人間の完了内容を取得し、`docs/STATE.md` と後続計画へ反映する。
   - **オープン中の `owner:human` コメント確認 ＆ 人間待ち滞留エスカレーション（3日ルール / L-19）**: `open_human_issues` の `latest_trusted_comment`（長文で `truncated: true` の場合や文脈確認時は `get-issue <num>`）を必ず確認し、人間からの実施予定日連絡・質問・判断があれば即座に回答および `docs/STATE.md` へ反映する。人間が具体的な実施予定日（例：`2026-12-07`）を明示している場合はその期日到来前の催促リマインドを禁止し、予定日未指定で `updated_at` から72時間以上滞留している場合のみ分割案・選択肢付きでリマインドする（連日重複禁止）。
   - 既に `dev` マージ済みの `status:review` Issue があれば `status:done` へ更新しクローズする。
   - 鮮度接近（`PRICING_LAST_VERIFIED` 14日上限・`priceEffectiveUntil` 7日以内）があれば公式一次ソースを確認してから実装する。

2. **Tier 判定 ＆ 適量バッチ計画（Adaptive Sizing）**:
   - 着手前に必ず [`AGENTS.md`](../../../AGENTS.md) §3-2（`Tier 3 ➔ Tier 2 ➔ Tier 1`）を判定し、Tier 2/3 に該当する作業は実装前に停止・相談または差し戻しを行う。
   - Tier 1 の対象から **P0**（既存PRレビュー/CI修正・障害）→ **P1**（人間完了でアンブロックされた本番準備）→ **P2**（`owner:ai` & `status:ready` を `priority:p0`→`p1`→`p2` 順）→ **P3**（未処理ゼロ時は `01`・`06` 観点で改善起票）を抽出し、**1件固定にせず** [運用細則 §3](../../rules/AGENTS.md) の S/M/L 基準で **1セッション 3〜4pt** の作業セットを決める（関連軽量タスクは1PR統合、無関係な高リスク変更は最大1〜2PRへ分割）。

3. **安全実装と検証ルートの最適化**:
   - 最新 `dev` から専用作業ブランチを切る（同トピックのクリーンな既存ブランチがあれば継続可）。
   - [運用細則 §4](../../rules/AGENTS.md) に従い、コード変更PRは `npm run check:all`、ドキュメント・ルール専用PRは `npm run audit:ci-parity && node scripts/audit-org-memory.mjs --docs-only` をエラー0件で通過させる。

4. **記録とPR提出（リモートCIリリースゲート）**:
   - `docs/STATE.md` を更新し、コミット＆Pushして `dev` 宛て Draft PR を作成（または既存PR更新）する。
   - `node scripts/ops_github.mjs ready-pr <pr_number>` でリモートCI全通過と Ready 昇格を確認した後にのみ、関連Issueと人間へ報告する。
