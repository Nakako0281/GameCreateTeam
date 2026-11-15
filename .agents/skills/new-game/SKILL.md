---
name: new-game
description: 新しいゲームの市場調査・複数案ブレスト・辛口セルフリジェクト監査・企画書MD作成・GitHub企画Issue提出までを自律実行するスラッシュコマンド（`/new-game`）。ユーザーが `/new-game`（または `/new-game <テーマやジャンルのヒント>`）と入力した時や「新しいゲームを企画して」「次のゲーム考えて」と指示した時に発動する。
---

# `/new-game` ── 新規ゲーム市場調査 ＆ 企画書（MD）提出スキル

ユーザーがチャット欄で **`/new-game`**（または `/new-game 物理パズル系` などのヒント付き）を実行した際、以下の手順を自律的に遂行し、**市場調査 ➔ チーム内3案比較＆辛口監査 ➔ 企画書MD作成 ➔ GitHub企画Issue起票 ➔ 人間（最高責任者）へのGoサイン伺い** までを一気通貫で完了させること。

---

## 実行手順（Step-by-Step）

### Step 1: プロジェクト現状確認 ＆ レビュー台帳（`R-01`〜`R-11`）の必読
1. 現在のGitHub状況を確認する：
   ```bash
   node .agents/skills/game-create-team/scripts/github_api.mjs status
   ```
2. **【絶対必須】** 企画考案に入る前に、以下の2つのドキュメントを必ず `read_file` で読み込み、過去の指摘が100%反映される状態にする：
   - [`docs/REVIEW_GUIDELINES_AND_LOG.md`](../../../docs/REVIEW_GUIDELINES_AND_LOG.md)（最高責任者レビュー指針＆指摘履歴台帳：`R-01`〜`R-11`）
   - [`docs/GAME_FEEL_AND_UX_PRINCIPLES.md`](../../../docs/GAME_FEEL_AND_UX_PRINCIPLES.md)（桜井政博氏の7原則・名作演出技法・絵文字禁止・説明不要の直感設計）

---

### Step 2: 徹底的な市場調査（`01_idea_scout` ＆ `search_web`）
1. ユーザーからジャンルや方向の指定があればそれを軸にし、指定がなければ**「ブラウザで1秒で触り方が分かり、何十回もリトライしてしまう中毒性の高いジャンル（物理演算マージ/アクション、ローグライト、デッキ/ダイス/タイル構築、クリッカー/インクリメンタル×戦略、テキスト/選択サバイバル等）」**から幅広く市場調査を行う。
2. `search_web` 等を活用し、世の中のヒット作（例：『スイカゲーム』『Balatro』『Dicey Dungeons』『80億分の1』『Slay the Spire』『Vampire Survivors』、Flash時代の名作ゲーム等）について以下を分析する：
   - **なぜ説明文を1文字も読まずに1秒で遊べるのか？（直感的な視覚・物理・ダイレクト操作）**
   - **なぜ1プレイ終わった瞬間に「もう1回！」とリトライしてしまうのか？（ランダム性×ビルド/戦略分岐×ニアミス体験）**
3. 調査結果を [`docs/templates/MARKET_RESEARCH_TEMPLATE.md`](../../../docs/templates/MARKET_RESEARCH_TEMPLATE.md) に従い、`docs/proposals/<game-id>-research.md` に保存する。

---

### Step 3: 3案ブレスト ＆ 辛口セルフリジェクト監査（`02`, `03`, `04`）
1. 市場調査をもとに、AIチーム内で **3つの異なるゲームコンセプト案** を立案する。
2. 辛口レビュアー（`04_critic.md`）の視点で、以下の **絶対棄却ゲート（`R-01`〜`R-11`）** に照らして3案を厳しく審査し、最も面白くリトライ性の高い1案を選出・ブラッシュアップする：
   - **❌ 絵文字禁止（`R-09`）**: Unicode絵文字を一切使わず、Canvas 2D（物理演算・アニメーションスプライト）またはカスタムSVGベクターアートでリッチに表現できるか？
   - **❌ 説明文・表計算UIの禁止（`R-10`）**: 何百文字も説明を読ませたり、「枠に並べて別ボタンを押すまで何も起きない」管理画面のようなゲームになっていないか？タップ/ドラッグした瞬間にダイレクトに画面が反応するか？
   - **❌ 出落ち・単一最適解の禁止（`R-01`）**: 最低3系統以上の異なる勝ち筋・ビルド・戦略があり、ボット検証（`fun-metrics`）で多様性とスキル差を証明できるか？
   - **⏱️ 最適プレイ時間の定義（`R-02`）**: そのゲームが最も輝く1プレイ時間（1〜3分の高速周回、または10〜60分の本格構築）を定義し、5分以上の場合は `localStorage` オートセーブ＆途中再開を組み込んでいるか？
   - **🎵 無料フリー素材・OSSライブラリの活用（`R-05`）**: 必要に応じて無料の物理エンジンや音声・画像素材リスト（人間側で用意してもらう無料素材があればその一覧）を整理しているか？

---

### Step 4: 企画書MDの作成 ＆ GitHub 企画Issueの起票
1. [`docs/templates/GAME_PROPOSAL_TEMPLATE.md`](../../../docs/templates/GAME_PROPOSAL_TEMPLATE.md) を用いて、**`docs/proposals/<game-id>.md`** を作成する。
   - 企画書には必ず「画面内テキスト上限（Text Budget）」「入力〜結果までのダイレクトアニメーション設計（予備動作・ヒットストップ・エフェクト）」「マルチセッション分割計画（M1〜M5）」を明記する。
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
   - 企画の核（1秒で分かる直感操作、リトライ性の核となる3系統以上の戦略、想定プレイ時間、使用予定の無料素材有無）
2. **「企画書またはGitHub IssueにてGoサイン（または修正指示）をお願いします。Issueにコメントされた場合は `/issue` でいつでも読み取ります！」** と案内し、**人間からGoサインが出るまで絶対にコード実装（Stage 2以降）へ進まないこと**。
