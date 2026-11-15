---
name: issue
description: GitHubの最新IssueおよびIssueコメント（最高責任者からの改善要望・レビュー指摘・Goサイン）を自動取得して読み取り、調査・チームサブエージェント設計レビュー・レビュー台帳記録・実装・テスト・第三者サブエージェント実機監査・PR作成まで一気通貫で消化するスラッシュコマンド（`/issue`）。ユーザーが `/issue` と入力した時や「Issue確認して」「Issue消化して」と指示した時に発動する。
---

# `/issue` ── GitHub Issue ＆ コメント自動確認・チーム消化スキル

ユーザーがチャット欄で **`/issue`**（または `/issue #<番号>`）を実行した際、以下の手順を自律的に実行して GitHub 上の最新 Issue およびコメントを読み取り、**チームメンバー（サブエージェント）と協働しながら** 対応を完了させること。

> [!IMPORTANT]
> **自作自演バイアスの禁止**: メインエージェント（`00/05/06`）が1人で改修を完結させ、自分の画面を自分で「OK」と判定してはならない。設計段階と最終検収段階では、必ず `define_subagent` / `invoke_subagent` を使って専門ロール（`02`, `03`, `04`, `07`）を別コンテキストで起動すること。

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
2. 取得した Issue / コメントに「今後のゲーム制作にも共通する指摘・方針」が含まれている場合は、作業着手前に必ず `docs/REVIEW_GUIDELINES_AND_LOG.md` に新しい指針（`R-XX`）および履歴ログとして追記し、必要に応じ `docs/GAME_FEEL_AND_UX_PRINCIPLES.md` へ原則を追記する。
3. **過去指針との矛盾チェック**: もし過去のレビュー指針と矛盾・方針転換がある場合は、実装前に人間へ「過去のレビューでは〇〇でしたが、今回は△△へ変更してよろしいでしょうか？」と確認する。矛盾がなければそのまま Step 3 へ進む。

---

### Step 3: Issue種別に応じた自律消化アクション

#### パターンA：既存ゲームの改善要望・バグ報告・UI/演出改修 Issue の場合

1. **チーム設計レビュー（サブエージェント必須：`02_game_designer` ＆ `03_art_sound`）**:
   - UI・操作感・演出・ゲーム性に関する改善要望の場合、いきなりコードを書き始めず、`02_game_designer.md` と `03_art_sound.md` をベースにサブエージェントを定義・起動（`EnableWriteTools: false`）し、以下を設計レビューさせる：
     - 世の中の名作ゲームとのギャップ整理（`R-08`）
     - 0ベースでの要素・数字の一貫性、連打クリア防止（`R-14`）
     - `375px〜390px` 固定ゾーン設計・文字省略 `...` 禁止のテキストバジェット・常時能力表示（`R-13`, `R-15`）
2. **ブランチ作成・実装・自動テスト追加（`05_engineer` / `06_qa`）**:
   - `main`（または進行中の該当PRブランチ）から作業ブランチを作成し、設計レビューを反映した改善実装を行う。
   - 同じ問題が再発しないよう、単体テスト（`vitest`）・ボットバランス検証（`fun-metrics`）・E2E テスト（`tests/e2e/*.spec.ts`：固定ゾーン高さ一致、絵文字0件、最小フォント12px、文字省略・クリップ検証等）に検証ゲートを追加する。
3. **総合技術QAゲートの完全通過**:
   ```bash
   npm run lint
   npm run test
   npm run build
   npm run test:e2e
   ```
   すべてのコマンドが終了コード `0`・エラー `0` 件で通過し、`test-results/<game-id>/` に実画面スクリーンショットと動画が保存されることを確認する。
4. **第三者サブエージェントによる実機検収ゲート（必須：`07_blind_playtester` ＆ `04_critic`）**:
   - **必ず `define_subagent`（`EnableWriteTools: false`）＋ `invoke_subagent` で `07_blind_playtester` と `04_critic` を別コンテキストとして起動する**。
   - `07_blind_playtester` にはソースコードや実装意図を一切教えず、`test-results/<game-id>/` のスクリーンショットと動画パスだけを渡して初見評価（直感性・キャラ差・文字見切れ・ガタつき・リトライ意欲4以上）を行わせる。
   - `04_critic` には `docs/REVIEW_GUIDELINES_AND_LOG.md`（`R-01`〜`R-15`）および `fun-metrics` 実測値・実機スクショを渡し、厳しい自己ダメ出し監査（`✅ LGTM` or `❌ 要修正`）を行わせる。
   - **差し戻しループ**: どちらか一方でも `❌ 要修正`（または文字見切れ・分かりにくさの指摘）を出した場合は、手順2へ戻って修正し、全コマンド再実行 ➔ 再スクショ監査で **`✅ LGTM` が揃うまで繰り返す**。
5. **コミット・Push・Issueコメント報告・Pull Request作成**:
   - 作業ブランチを `origin` へ Push する。
   - `comment-issue <issue_number> <body_file>` で対応内容（チーム監査結果を含む）を Issue にコメント報告する。
   - `create-pr <branch> "<title> (Closes #<issue_number>)" <body_file>` で Pull Request を作成し、ユーザーへ PR の URL を報告する（※マージは必ず人間が行うため、AIはマージしない）。

#### パターンB：企画書提出 Issue（`type:proposal`）へのコメント（Goサイン / 修正指示）の場合
- [`.agents/skills/game-create-team/SKILL.md`](../game-create-team/SKILL.md) の **Stage 2 / Stage 3** に従い：
  - **🔄 修正指示の場合**: サブエージェント（`02`, `03`, `04`）と協議して企画書（`docs/proposals/<game-id>.md`）を改訂・再提出する。
  - **✅ Goサインの場合**: Milestone と Task Issues（M1〜M5）を作成し、開発・ボット検証・E2E検証・サブエージェント検収・PR提出まで進める。
