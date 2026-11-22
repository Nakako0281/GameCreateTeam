---
name: daily-ops
description: 毎日定例で実行する自律運用スキル。GitHub上の人間完了Issue・オープンPR・AIタスクを確認し、タスク規模（Size S/M/L）と関連性を見極めて適量をバッチ統合または連続消化し、PRとSTATE.mdを更新する。
---

# Daily AutoGrowth Studio Ops スキル

## 実行手順（日次定例）

1. **現状把握（Boot）**:
   - `docs/STATE.md` を読む。
   - `npm run ops:status` を実行する。
   - `all_open_issues` に **未ラベルの人間起票Issue** が含まれる場合は即座に `get-issue` で精査し、`owner:ai` / `priority:p0`（または適切な優先度・Milestone）を付与して最優先トリアージを行う。
   - `recently_closed_human_issues` があれば `node scripts/ops_github.mjs get-issue <num>` で人間の完了内容・コメント（独自ドメインURL、GSC/GA4/AdSense設定値、判断結果など）を取得し、`docs/STATE.md` や設定ファイルの更新計画に反映する。
   - 既に `dev` マージ済みの `status:review` Issue があれば `status:done` へ更新してクローズする。
   - LLM料金データ等（`PRICING_LAST_VERIFIED` 14日鮮度上限・`priceEffectiveUntil` 7日以内予告）やAI関連の最新情報に鮮度接近・警告・変更が必要な箇所があれば、必ず `search_web` 等で公式一次ソースを確認してから実装に入る。

2. **優先順位トリアージ ＆ 適量バッチ計画（Adaptive Sizing）**:
   - **P0**: 既存PRへのレビュー指摘・CI失敗の修正、またはセキュリティ/稼働障害対応。
   - **P1**: 人間が完了した `owner:human` Issueによってアンブロックされた設定・本番準備タスク（例：ドメイン設定反映、AdSenseコード組込、CMP案内確認）。
   - **P2**: `owner:ai` かつ `status:ready` の中から `priority:p0` → `p1` → `p2` 順で候補を抽出し、**1件固定にせず**以下の規模基準（Adaptive Batching）で **1セッションの適量予算（目安 3〜4pt）** に収まる作業セットを決定する：
     - **Size S（1pt・軽量）**: ドキュメント整備、README/文言/メタデータ調整、小規模な設定・UI微調整、単一関数バグ修正 ➔ 関連する複数件を **同一PRへ統合して 2〜4件まとめて消化**。不要なサブエージェント会議は省く。
     - **Size M（2pt・中量）**: 既存ツールの機能刷新、複数ページにまたがるUI/UX・デザイン改修 ➔ 密接に関連する Size S タスク（例：デザイン刷新＋タイトル改行制御）は **同一PRへ統合** し、1セッションで `M 1件 ＋ S 1〜2件`（または `M 2件`）を目安に進める。
     - **Size L（3〜4pt・重量）**: 新規ツール1本のフル実装（`new-tool` スキルに従う）、大規模構成変更 ➔ 品質とレビュー粒度維持のため専用PR（1件）で完遂する。
     - **PR分割判断**: 密接に関連するタスク同士やドキュメント整備一式は1つのPRへ集約してCIと人間レビューの往復を減らし、無関係でリスクの高い変更同士は独立したPR（最大1〜2本）へ分けて連続消化する。
   - **P3**: オープンなAIタスクも人間待ちブロックもない場合、`01_market_seo_strategist` と `06_growth_qa_analyst` の観点で次期改善（SEOメタ改善、英語 `/en/` 展開準備、機械チェック強化、集客記事作成）を複数ピックアップし、適量バッチ（目安 3〜4pt）としてIssue起票＆実行する。

3. **安全実装と検証ルートの最適化**:
   - `dev` から最新化した専用作業ブランチ（既にオープンな同トピックブランチがあればそれを利用）で作業する。
   - 変更内容に応じて最適なローカル機械検証を実行し、すべてエラー0件にする：
     - **コード変更を含むPR（`src/`, `scripts/`, `tests/`, `public/`, `package.json`, `.github/workflows/` 等）**: `npm run check:all` 全8ゲートを実行する。
     - **ドキュメント・ルール専用PR（`docs/**`, `.agents/**`, `README.md`, `AGENTS.md` のみ）**: `npm run audit:ci-parity && node scripts/audit-org-memory.mjs --docs-only` の軽量検証を実行する。

4. **記録とPR提出（リモートCIリリースゲート）**:
   - `docs/STATE.md` を更新する。
   - コミット＆Pushし、`dev` 宛ての Draft PR を作成（または既存PRを更新）する。
   - `node scripts/ops_github.mjs ready-pr <pr_number>` を実行してリモートCI（GitHub Actions ＋ Cloudflare プレビュー）の全通過を確認し、失敗時はログから修正・再Pushして再通過させてから、関連Issueへのコメント・ステータス更新と人間報告を行う。
