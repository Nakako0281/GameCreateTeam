---
name: issue
description: GitHubの最新IssueおよびIssueコメント（最高責任者からの改善要望・レビュー指摘・Goサイン）を自動取得して読み取り、調査・レビュー台帳記録・実装・テスト・PR作成まで一気通貫で消化するスラッシュコマンド（`/issue`）。ユーザーが `/issue` と入力した時や「Issue確認して」「Issue消化して」と指示した時に発動する。
---

# `/issue` ── GitHub Issue ＆ コメント自動確認・消化スキル

ユーザーがチャット欄で **`/issue`**（または `/issue #<番号>`）を実行した際、以下の手順を自律的に実行して GitHub 上の最新 Issue およびコメントを読み取り、対応を完了させること。

---

## 実行手順（Step-by-Step）

### Step 1: GitHub上の未消化Issue・最新コメントの取得
まず以下のコマンドを実行し、現在オープンになっている Issue 一覧と、人間（最高責任者）からの最新コメントを取得する：

```bash
node .agents/skills/game-create-team/scripts/github_api.mjs status
node .agents/skills/game-create-team/scripts/github_api.mjs check-feedback
```

対象のオープン Issue（複数ある場合は新しいもの、または未対応のものすべて）について、本文と全コメントを詳細取得する：

```bash
node .agents/skills/game-create-team/scripts/github_api.mjs get-issue <issue_number>
```

---

### Step 2: 最高責任者レビュー台帳（`docs/REVIEW_GUIDELINES_AND_LOG.md`）への記録と矛盾照合
1. [`docs/REVIEW_GUIDELINES_AND_LOG.md`](../../../docs/REVIEW_GUIDELINES_AND_LOG.md) および [`docs/GAME_FEEL_AND_UX_PRINCIPLES.md`](../../../docs/GAME_FEEL_AND_UX_PRINCIPLES.md) を読み込む。
2. 取得した Issue / コメントに「今後のゲーム制作にも共通する指摘・方針」が含まれている場合は、作業着手前に必ず `docs/REVIEW_GUIDELINES_AND_LOG.md` に新しい指針（`R-XX`）および履歴ログとして追記する。
3. **過去指針との矛盾チェック**: もし過去のレビュー指針と矛盾・方針転換がある場合は、実装前に人間へ「過去のレビューでは〇〇でしたが、今回は△△へ変更してよろしいでしょうか？」と確認する。矛盾がなければそのまま Step 3 へ進む。

---

### Step 3: Issue種別に応じた自律消化アクション

#### パターンA：既存ゲームの改善要望・バグ報告・UI/演出改修 Issue の場合
1. **先行調査と比較（独りよがりな改修の禁止 / `R-08`）**:
   - UI・操作感・演出・ゲーム性に関する改善要望の場合、いきなりコードを書き始めず、世の中の名作ゲームや先人の知見（『桜井政博のゲーム作るには』等）を調査し、現状のゲームとのギャップを整理してドキュメント（`docs/GAME_FEEL_AND_UX_PRINCIPLES.md` 等）へ反映する。
2. **ブランチ作成・実装・自動テスト追加**:
   - `main`（または進行中の該当PRブランチ）から作業ブランチを作成し、改善実装を行う。
   - 同じ問題が再発しないよう、単体テスト（`vitest`）または E2E テスト（`tests/e2e/*.spec.ts`）に検証ゲートを追加する。
3. **総合QAゲートの完全通過**:
   ```bash
   npm run lint
   npm run test
   npm run build
   npm run test:e2e
   ```
   Playwright で撮影された実画面スクリーンショット・動画を `read_file` で視覚確認し、エラー 0件・はみ出しゼロ・文字量上限・アニメーション発火を確認する。
4. **コミット・Push・Issueコメント報告・Pull Request作成**:
   - 作業ブランチを `origin` へ Push する。
   - `comment-issue <issue_number> <body_file>` で対応内容を Issue にコメント報告する。
   - `create-pr <branch> "<title> (Closes #<issue_number>)" <body_file>` で Pull Request を作成し、ユーザーへ PR の URL を報告する（※マージは必ず人間が行うため、AIはマージしない）。

#### パターンB：企画書提出 Issue（`type:proposal`）へのコメント（Goサイン / 修正指示）の場合
- [`.agents/skills/game-create-team/SKILL.md`](../game-create-team/SKILL.md) の **Stage 2 / Stage 3** に従い：
  - **🔄 修正指示の場合**: 企画書（`docs/proposals/<game-id>.md`）を改訂して再提出する。
  - **✅ Goサインの場合**: Milestone と Task Issues（M1〜M5）を作成し、開発・ボット検証・E2E検証・PR提出まで進める。
