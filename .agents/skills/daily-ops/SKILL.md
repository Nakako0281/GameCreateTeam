---
name: daily-ops
description: 毎日定例で実行する自律運用スキル。GitHub上の人間完了Issue・オープンPR・AIタスクを確認し、最優先タスクを1スライス完了してPRとSTATE.mdを更新する。
---

# Daily AutoGrowth Studio Ops スキル

## 実行手順（日次定例）

1. **現状把握（Boot）**:
   - `docs/STATE.md` を読む。
   - `npm run ops:status` を実行する。
   - `recently_closed_human_issues` があれば `node scripts/ops_github.mjs get-issue <num>` で人間の完了内容・コメント（独自ドメインURL、GSC/GA4/AdSense設定値、判断結果など）を取得し、`docs/STATE.md` や設定ファイルの更新計画に反映する。

2. **優先順位トリアージ**:
   - **P0**: 既存PRへのレビュー指摘・CI失敗の修正、またはセキュリティ/稼働障害対応。
   - **P1**: 人間が完了した `owner:human` Issueによってアンブロックされた設定・本番準備タスク（例：ドメイン設定反映、AdSenseコード組込、CMP案内確認）。
   - **P2**: `owner:ai` かつ `status:ready` の中で `priority:p0` → `p1` → `p2` 順で最も価値の高いタスクを1スライス選定。
     - もし新ツール実装タスクであれば `new-tool` スキルに従う。
   - **P3**: オープンなAIタスクも人間待ちブロックもない場合、`01_market_seo_strategist` と `06_growth_qa_analyst` の観点で次期改善（SEOメタ改善、英語 `/en/` 展開準備、機械チェック強化、集客記事作成）のIssueを起票して1スライス実行する。

3. **安全実装と全機械検証**:
   - `dev` から最新化した専用作業ブランチ（既にオープンな同トピックブランチがあればそれを利用）で作業する。
   - 実装・ドキュメント更新後、必ず `npm run check:all` を実行し全項目グリーンにする。

4. **記録とPR提出（リモートCIリリースゲート）**:
   - `docs/STATE.md` を更新する。
   - コミット＆Pushし、`dev` 宛ての Draft PR を作成（または既存PRを更新）する。
   - `node scripts/ops_github.mjs ready-pr <pr_number>` を実行してリモートCI（GitHub Actions ＋ Cloudflare プレビュー）の全通過を確認し、失敗時はログから修正・再Pushして再通過させてから、関連Issueへのコメント・ステータス更新と人間報告を行う。
