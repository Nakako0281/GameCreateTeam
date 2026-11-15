---
name: new-game
description: 新しいゲームの市場調査・複数案ブレスト・辛口セルフリジェクト監査・企画書MD作成・GitHub企画Issue提出までをチームサブエージェントと自律実行するスラッシュコマンド（`/new-game`）。ユーザーが `/new-game`（または `/new-game <テーマやジャンルのヒント>`）と入力した時や「新しいゲームを企画して」「次のゲーム考えて」と指示した時に発動する。
---

# `/new-game` ── 新規ゲーム市場調査 ＆ 企画書（MD）提出スキル

ユーザーがチャット欄で **`/new-game`**（または `/new-game 物理パズル系` などのヒント付き）を実行した際、以下の手順を自律的に遂行し、**チームサブエージェントによる市場調査 ➔ 3案比較＆辛口監査 ➔ 企画書MD作成 ➔ GitHub企画Issue起票 ➔ 人間（最高責任者）へのGoサイン伺い** までを一気通貫で完了させること。

---

## 実行手順（Step-by-Step）

### Step 1: プロジェクト現状確認 ＆ レビュー台帳（`R-01`〜`R-15`）の必読
1. 現在のGitHub状況を確認する：
   ```bash
   node .agents/skills/game-create-team/scripts/github_api.mjs status
   ```
2. **【絶対必須】** 企画考案に入る前に、以下の2つのドキュメントを必ず `read_file` で読み込み、過去の指摘が100%反映される状態にする：
   - [`docs/REVIEW_GUIDELINES_AND_LOG.md`](../../../docs/REVIEW_GUIDELINES_AND_LOG.md)（最高責任者レビュー指針＆指摘履歴台帳：`R-01`〜`R-15`）
   - [`docs/GAME_FEEL_AND_UX_PRINCIPLES.md`](../../../docs/GAME_FEEL_AND_UX_PRINCIPLES.md)（桜井政博氏の7原則・名作演出・固定ゾーン・0ベース一貫性・見切れ禁止基準）

---

### Step 2: 徹底的な市場調査（サブエージェント `01_idea_scout` 必須起動）
1. `.agents/members/01_idea_scout.md` をベースにサブエージェントを `define_subagent`（`EnableWriteTools: false`）で定義・起動し、`search_web` も活用して対象領域の名作・トレンドを調査させる：
   - ユーザーからジャンルや方向の指定があればそれを軸にし、指定がなければ**「ブラウザで1秒で触り方が分かり、何十回もリトライしてしまう中毒性の高いジャンル」**から調査する。
   - **なぜ説明文を1文字も読まずに1秒で遊べるのか？（直感的な視覚・物理・1コマンド即時操作）**
   - **なぜ1プレイ終わった瞬間に「もう1回！」とリトライしてしまうのか？（ランダム性×ビルド分岐×ニアミス体験）**
2. 調査結果を [`docs/templates/MARKET_RESEARCH_TEMPLATE.md`](../../../docs/templates/MARKET_RESEARCH_TEMPLATE.md) に従い、`docs/proposals/<game-id>-research.md` に保存する。

---

### Step 3: 3案ブレスト ＆ 辛口セルフリジェクト監査（サブエージェント `02`, `03`, `04` 必須起動）
1. サブエージェント `02_game_designer` と `03_art_sound` を起動し、市場調査をもとに **3つの異なるゲームコンセプト案** を立案させる。
2. サブエージェント `04_critic`（`.agents/members/04_critic.md`）を別コンテキストで起動し、以下の **絶対棄却ゲート（`R-01`〜`R-15`）** に照らして3案を厳しく審査し、最も面白くリトライ性の高い1案を選出・ブラッシュアップする：
   - **❌ 絵文字禁止（`R-09`）**: Unicode絵文字を一切使わず、Canvas 2D またはカスタムSVGベクターアートで表現できるか？
   - **❌ 説明文・表計算UI・重複操作ボタンの禁止（`R-10`, `R-14`）**: タップした瞬間にダイレクトに画面が反応する「1コマンド＝1即時アクション」か？出目や数字の意味に0ベースで一貫性があるか？単調連打（`monotoneBot`）のクリア率が `0%` になる設計か？
   - **✅ タイトル画面＆固定ゾーン＆省略なしUI（`R-12`, `R-13`, `R-15`）**: 専用タイトル画面があり、タイトル〜バトル〜報酬の全画面で上下UIゾーンの高さがガタつかず、能力常時表示と文字省略（`...`）ゼロの設計になっているか？
   - **❌ 出落ち・単一最適解の禁止（`R-01`）**: 最低3系統以上の異なる勝ち筋・ビルド・キャラ/スタイル差があり、ボット検証で多様性とスキル差を証明できるか？
   - **⏱️ 最適プレイ時間の定義（`R-02`）**: 最も輝くプレイ時間と、5分以上の場合の `localStorage` オートセーブ＆再開を組み込んでいるか？
   - **🎵 無料フリー素材・OSSライブラリの活用（`R-05`）**: 必要な無料音声・画像素材やOSSライブラリを整理しているか？

---

### Step 4: 企画書MDの作成 ＆ GitHub 企画Issueの起票
1. [`docs/templates/GAME_PROPOSAL_TEMPLATE.md`](../../../docs/templates/GAME_PROPOSAL_TEMPLATE.md) を用いて、**`docs/proposals/<game-id>.md`** を作成する。
   - 企画書には「タイトル画面設計」「固定ゾーン寸法とText Budget（`...` 省略禁止）」「1コマンド即時アニメーション設計」「マルチセッション分割計画（M1〜M5）」を明記する。
2. [`docs/README.md`](../../../docs/README.md) のプロジェクト一覧テーブルに新規企画を `🟡 企画審査中（Goサイン待ち）` として追記する。
3. GitHub 上に企画書提出 Issue を自動起票する：
   ```bash
   node .agents/skills/game-create-team/scripts/github_api.mjs create-issue "【企画書提出】<ゲームタイトル> (<game-id>)" docs/proposals/<game-id>.md --labels "type:proposal,status:awaiting-approval"
   ```

---

### Step 5: 🛑 最高責任者（人間）への報告とGoサイン待機
1. ユーザー（最高責任者）へ以下の情報を簡潔に提示してターンを終了する：
   - 作成した企画書MD（`docs/proposals/<game-id>.md`）と市場調査レポート（`docs/proposals/<game-id>-research.md`）のリンク
   - 起票した GitHub 企画Issue のURL
   - 企画の核（1秒で分かる直感操作、リトライ性の核となる3系統以上の戦略、想定プレイ時間、使用予定の無料素材有無、チーム監査サマリー）
2. **「企画書またはGitHub IssueにてGoサイン（または修正指示）をお願いします。Issueにコメントされた場合は `/issue` でいつでも読み取ります！」** と案内し、**人間からGoサインが出るまで絶対にコード実装（Stage 2以降）へ進まないこと**。
