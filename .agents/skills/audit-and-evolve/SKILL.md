---
name: audit-and-evolve
description: 週次振り返りと自己進化スキル。直近1週間のPR・Issue・KPI・エラーや審査結果を総括し、POSTMORTEM更新と「新しい機械チェックルール（または構造改善）」をリポジトリへ実装する。
---

# 週次振り返り ＆ 自己進化スキル (`audit-and-evolve`)

## 目的
「同じ失敗を繰り返さない」「チャットのたびに記憶を失わない」「人間もAIもミスしても仕組みが止める」組織を維持・強化する。

## 週次手順（毎週月曜 10:00 JST 実行）

1. **過去1週間の事実収集**:
   - `git log --since="7 days ago" --oneline` で変更履歴を確認。
   - `npm run ops:status`、`npm run ops:autonomy`（`autonomy-report --days 7`）、および `node scripts/ops_github.mjs list-issues --state all` / `list-prs --state all` で完了・滞留・自律度KPI（`found-by:ai` / `found-by:human` 欠陥発見比率・人間待ち日数・手戻り率）を把握。
   - `docs/STATE.md`、`docs/METRICS_LOG.md`、`docs/POSTMORTEM_AND_LESSONS.md` を読む。
   - もし `npm audit --audit-level=high` やリンク/料金鮮度（`llm-pricing.ts` の `PRICING_LAST_VERIFIED` 14日以内上限・`priceEffectiveUntil` 7日以内改定予定・退役モデル非混入）で警告があれば即座に課題化する。

2. **KPI・自律度・収益・AdSense進捗の分析**:
   - 目標（2027-02-20までに AdSense 月100円以上）および実験目標（自律度KPI改善）に対する現在地を評価する。
   - 週内に発生した不具合・改善Issueに `found-by:ai` / `found-by:human` ラベルが付与されているか確認し、`autonomy-report` の実測値を `docs/METRICS_LOG.md` の自律度KPIログへ記録する。
   - GSC/GA4/AdSenseデータ（`docs/METRICS_LOG.md` または人間コメント経由で提供された値）がある場合は、「表示回数が多いのにCTRが低いページ」「順位4〜15位ページ」「離脱率」を抽出し、改善Issue（`owner:ai`）を作成する。
   - まだデータ取得連携が未設定（またはドメイン購入前）の場合、先行してツール品質・解説独自性・内部リンク・機械監査を強化する。

3. **「気をつけます」の禁止 → 機械チェック昇格 ＆ ルール棚卸し**:
   - 直近1週間で発生したバグ・テスト失敗・人間からの指摘・手戻り・CI警告を `docs/POSTMORTEM_AND_LESSONS.md` へ記録する。
   - **最低1つ以上、再発を機械的に防ぐコード改善（`scripts/audit-*.mjs` への新ルール追加、単体テスト追加、E2Eチェック追加、またはスキル/メモリ改善）を実際に実装してPRを出す**。
   - **ルール廃止・統合レビュー（Issue #56）**: `AGENTS.md` / `.agents/rules/AGENTS.md`（90行予算）および `POSTMORTEM` 教訓について、直近4週間で未使用・形骸化・ハーネス代替済みの記述を統合・簡素化できないか点検する。

4. **週次レポート記録（リモートCIリリースゲート）**:
   - `docs/METRICS_LOG.md` と `docs/STATE.md` に今週の総括・来週の最優先3アクションを記録する。
   - 変更をブランチへコミットし、`npm run check:all` を通して Push・Draft PR 作成後、`node scripts/ops_github.mjs ready-pr <pr_number>` でリモートCIの全通過を実測確認してから報告する。
