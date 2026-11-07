---
name: game-create-team
description: >-
  Autonomous AI Game Create Team workflow. Activate this skill whenever the user asks to
  create a new game, process a GitHub Issue requesting a game, or run the AI game creation team
  (market research, 4-member planning debate, requirements/design, implementation, Vitest/Playwright QA,
  memory-preserving 3-planner review, and Pull Request creation).
---

# GameCreateTeam 自律ゲーム開発ワークフロー

このスキルは、7名のAI社員（サブエージェント）がチームとして協調し、GitHub Issueを起点に **「市場調査 ➔ 4人企画会議 ➔ 要件定義・設計 ➔ 製造・単体テスト ➔ QA実ブラウザ検証＆企画3名の記憶引き継ぎレビュー ➔ PR作成」** までを自律的に完遂するための標準ランブックです。

---

## 👥 チーム編成（`.agents/members/`）

1. **進行プロデューサー**: [00_producer.md](../../members/00_producer.md)
2. **トレンドリサーチャー（企画会議）**: [01_trend_researcher.md](../../members/01_trend_researcher.md)
3. **王道・ルール番人（企画会議 ＆ 実装後レビュー兼任）**: [02_classic_guardian.md](../../members/02_classic_guardian.md)
4. **バズ・中毒性プランナー（企画会議 ＆ 実装後レビュー兼任）**: [03_buzz_planner.md](../../members/03_buzz_planner.md)
5. **モバイルUXデザイナー（企画会議 ＆ 実装後レビュー兼任）**: [04_mobile_ux_designer.md](../../members/04_mobile_ux_designer.md)
6. **リードゲームエンジニア（製造・単体テスト担当）**: [05_game_developer.md](../../members/05_game_developer.md)
7. **QA自動検証エンジニア（Vitest・Build・Playwright実ブラウザ検査担当）**: [06_qa_engineer.md](../../members/06_qa_engineer.md)

> [!IMPORTANT]
> **ドキュメント管理の鉄則**:
> リポジトリ内に企画書や議事録のMarkdownファイルをコミットして残してはいけません。
> すべての議論ログ・要件定義・設計書・レビュー結果は [github_api.mjs](./scripts/github_api.mjs) を使って **対象のGitHub Issueのコメント欄** に記録してください。（一時ファイルを作成してスクリプトに渡す場合は、OSの一時ディレクトリまたはアーティファクトの `scratch/` を使い、リポジトリを汚さないこと）

---

## 🚀 実行ステップ

### Step 1: 対象GitHub Issueの確認（または自動起票）

1. 現在のオープンなIssue一覧を確認します：
   ```bash
   node .agents/skills/game-create-team/scripts/github_api.mjs list-issues
   ```
2. ユーザーが特定のIssue番号を指定した場合は `get-issue <番号>` で詳細を取得します。
3. もしユーザーがGitHub上にまだIssueを立てずにチャットで直接「〇〇を作って」と依頼した場合は、`create-issue` コマンドで自動的にGitHub Issueを起票し、そのIssue番号を以降の記録先とします。

---

### Step 2: 市場調査 ＆ 4人の企画会議（2ラウンド議論）

1人で仕様を決めることは厳禁です。必ず以下の4名のサブエージェントを `define_subagent` で定義（各 `.agents/members/*.md` の内容をシステムプロンプトに設定、`EnableWriteTools: false`）し、並列で議論させます。

#### Round 1: 市場調査＆初期提案（並列起動）
- `invoke_subagent` で以下の4名を同時に起動し、Issueのお題に対する調査と初期アイデアを出させます：
  1. `trend-researcher`（`search_web` を使って既存のWeb/スマホ人気作やアレンジ事例を調査）
  2. `classic-guardian`（王道ルール・CPU難易度・直感性の提案）
  3. `buzz-planner`（爽快演出・独自のひねり・リプレイ性の提案）
  4. `mobile-ux-designer`（スマホ縦画面 `430px` フレーム内のUI配置・片手操作・ポップ配色の提案）
- **【最重要】会話ID（記憶）の保持**:
  - `classic-guardian`、`buzz-planner`、`mobile-ux-designer` の3名の `conversationId` を必ず控えておきます。Step 5のレビュー工程で、この **同じ `conversationId`** に `send_message` を送ることで、自分が企画した記憶を持った状態でレビューさせます。

#### Round 2: 相互ツッコミ・議論ラウンド（`send_message`）
- 4名全員のRound 1提案が出揃ったら、4人全員の提案内容をまとめたテキストを作成し、各サブエージェントの `conversationId` に `send_message` で共有します。
- それぞれの専門視点から「他のメンバーの案へのツッコミ・賛成・懸念点・ベストな折衷案」を議論させます。

#### Issueへの記録（Phase 1）
- Round 1（市場調査・各初期案）とRound 2（相互議論・合意形成）の内容をまとめ、GitHub Issueにコメント投稿します：
  ```bash
  node .agents/skills/game-create-team/scripts/github_api.mjs comment-issue <issue_number> <comment_file_path>
  ```

---

### Step 3: 要件定義 ＆ 基本設計書の策定

進行プロデューサー（[00_producer.md](../../members/00_producer.md)）として、4人の議論結果を以下の項目を含む **「要件定義＆基本設計書」** にまとめます：
1. **ゲーム基本情報**: ゲームID（`id`: 英小文字ハイフン繋ぎ）、タイトル、紹介文、タグ、アクセントカラー
2. **ゲームルール＆モード仕様**: コアルール、ゲームモード（王道＋アレンジ要素やCPU難易度など）、勝敗・終了条件
3. **演出・Juiciness仕様**: アニメーション、エフェクト、コンボ・スコア演出
4. **モバイル縦画面UIレイアウト**: 上部・中央盤面・下部コントロールの配置（`375px〜430px` 幅で横はみ出しゼロ設計）
5. **モジュール・状態設計**: `src/games/<id>/logic.ts`（純粋関数ロジック）、`src/games/<id>/index.tsx`（UIコンポーネント）、`src/games/<id>/__tests__/logic.test.ts`（単体テスト項目）

策定した要件定義＆基本設計書を、GitHub Issueに **【Phase 2: 要件定義＆基本設計書】** としてコメント投稿します。

---

### Step 4: ブランチ作成 ＆ 製造・単体テスト実装

1. `main` ブランチから最新を取得し、作業用ブランチを作成します：
   ```bash
   git checkout main && git pull origin main
   git checkout -b feat/game-<game-id>
   ```
2. リードゲームエンジニア（[05_game_developer.md](../../members/05_game_developer.md)）のガイドラインに従い、以下を実装します：
   - `src/games/<game-id>/logic.ts`（ゲームのコアロジック・CPU思考ルーチン等）
   - `src/games/<game-id>/__tests__/logic.test.ts`（Vitestによるルール・境界値・勝敗判定の単体テスト）
   - `src/games/<game-id>/index.tsx`（モバイル縦画面フレーム対応・カジュアルポップUIのゲーム本体）
   - `src/games/registry.ts`（`GAME_REGISTRY` への `React.lazy` 登録）
   - `tests/e2e/platform.spec.ts`（作成した `/games/<game-id>` を開いてコンソールエラー・画面はみ出し・操作を検証するE2Eテストケースの追加または確認）

---

### Step 5: QA自動検証 ＆ 企画3名（記憶引き継ぎ）による検収レビュー

実装が完了したら、以下の **4名による検収** を実施します。

#### 1. QA自動検証エンジニアによる実行テスト
以下の4コマンドを順番に実行し、すべてエラー0件で通過することを確認します：
```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

#### 2. 企画メンバー3名（記憶引き継ぎ）によるコード＆仕様レビュー
Step 2で起動した以下の3名の **既存の `conversationId`** に対して、`send_message` で実装ファイル（`src/games/<game-id>/index.tsx` と `logic.ts` の内容）およびテスト結果を送り、各自の専門視点でレビューさせます：
- `classic-guardian`（王道番人）：コアルールの正確性、CPU挙動、ゲームバランスに破綻や手抜きがないか？
- `buzz-planner`（バズ企画）：企画会議で合意した演出や独自の面白さが勝手に省略されず、楽しく実装されているか？
- `mobile-ux-designer`（モバイルUX）：スマホ縦画面（最大幅 `430px`）で美しく収まり、タップ操作しやすくポップなデザインになっているか？

#### 3. 修正ループ（全員 `✅ LGTM` になるまで）
- もしQAテストの失敗、または企画レビュワー3名のうち1人でも `❌ 要修正`（または改善指摘）を出した場合は、リードゲームエンジニアがコードを修正し、再度テストとレビューを行います。
- 4名全員の `✅ LGTM` が揃ったら、GitHub Issueに **【Phase 3: QA自動検証＆企画3名による検収レビュー結果】** をコメント投稿します。

---

### Step 6: Push ＆ Pull Request作成

1. `git status` で不要なファイルが含まれていないことを確認し、変更をコミット＆Pushします：
   ```bash
   git add src/ tests/
   git commit -m "feat(game): <ゲームタイトル> (<game-id>) を追加 (#<issue_number>)"
   git push -u origin feat/game-<game-id>
   ```
2. [github_api.mjs](./scripts/github_api.mjs) を使って `main` ブランチ向けのPull Requestを作成します（PR本文に必ず `Closes #<issue_number>` を記載します）：
   ```bash
   node .agents/skills/game-create-team/scripts/github_api.mjs create-pr feat/game-<game-id> "feat(game): <ゲームタイトル> を追加 (#<issue_number>)" <pr_body_file_path>
   ```
3. 作成したPRのURLをGitHub Issueにもコメント投稿し、ユーザーへ「PRのマージ待ち（マージボタンを押すとGitHub Pagesへ自動デプロイされます）」である旨を報告して完了します。
