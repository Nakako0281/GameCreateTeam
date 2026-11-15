# AI Game Lab (GameCreateTeam)

**人間（最高責任者 / Executive Producer）** と **AIゲーム開発組織（GameCreateTeam）** が協働し、市場調査・企画書提出・マイルストーン分割開発・ボット検証・自動E2Eテストを経て **「何度も繰り返し遊べる、リトライ性の高いWebゲーム」** を継続的に開発・公開していくプラットフォームです。

---

## 🏛️ 組織構造と開発コンセプト

1. **リトライ性（Replayability）最優先のゲームづくり**
   - 一瞬で消費される出落ちゲームではなく、ランダム性×ビルド/戦略の多様性×実力介入によって「もう1回、次は別の戦略で遊びたい」と思わせるゲームを開発します。
   - **プレイ時間は1分〜1時間以上まで自由**：ゲームのコアループが最も輝くプレイ時間を企画ごとに設計します（中〜長時間ゲームは `localStorage` オートセーブ対応）。
2. **人間が最終Goサインを出し、AIが全実務を担う体制**
   - AIチームが市場調査を行い、**ゲーム企画書（`docs/proposals/<game-id>.md`）** を作成して人間（最高責任者）に提出します。
   - 人間からの **Goサイン** が出た後、AIチームがGitHubの **Milestone** と **Task Issues（M1〜M5）** を構築して開発を進めます。
3. **Google One Pro 利用枠に合わせたマルチセッション（分割）開発**
   - 1日やワンショットで無理に作らず、**5時間ごとの枠リセット** や **日次スケジュール** に合わせて1セッション1〜2 Issueずつ計画的に開発・コミット・引き継ぎ（`docs/projects/<game-id>/ROADMAP.md`）を行います。

---

## 🤖 AIゲーム開発組織（`.agents/`）の構成

詳細は [SKILL.md](.agents/skills/game-create-team/SKILL.md) および [docs/README.md](docs/README.md) を参照してください。

| 役割 | 定義ファイル | 担当業務 |
| :--- | :--- | :--- |
| **00 PM ＆ リードディレクター** | [00_director.md](.agents/members/00_director.md) | 企画統括・人間EPへの企画書提出・5時間枠/日次スケジュール＆Milestone管理 |
| **01 市場調査リサーチャー** | [01_idea_scout.md](.agents/members/01_idea_scout.md) | Web市場調査・ベンチマーク分析・リトライ性の構造抽出 |
| **02 リードゲームデザイナー** | [02_game_designer.md](.agents/members/02_game_designer.md) | コアループ・ビルド多様性・最適プレイ時間・多戦略ボット設計 |
| **03 UI/UX・アート＆サウンド** | [03_art_sound.md](.agents/members/03_art_sound.md) | モバイル縦画面の情報設計・Canvas/SVG演出・Web Audio合成音 |
| **04 辛口レビュアー＆監査役** | [04_critic.md](.agents/members/04_critic.md) | 単一最適解（死にビルド）の排除・企画書＆完成品の辛口監査 |
| **05 アーキテクト＆エンジニア** | [05_engineer.md](.agents/members/05_engineer.md) | M1〜M4の段階的実装・純粋関数ロジック・オートセーブ機構 |
| **06 テクニカルQA** | [06_qa.md](.agents/members/06_qa.md) | 単体/ボット/ビルド/Playwright E2E検証・プレイ動画撮影 |
| **07 初見プレイテスター** | [07_blind_playtester.md](.agents/members/07_blind_playtester.md) | 録画映像からの直感理解度・リトライ意欲（5段階）の客観判定 |

---

## 🔄 開発ライフサイクル（4 Stages）

1. **Stage 1: 市場調査 ＆ 企画書MD提出（AI ➔ 人間）**
   - 市場調査と社内レビューを経て、`docs/proposals/<game-id>.md` を作成し、GitHub企画Issue（`status:awaiting-approval`）とともに人間へ提出。
2. **Stage 2: 最高責任者（人間）のGoサイン ➔ Milestone ＆ 分割Issue構築**
   - Goサインが出たら、GitHub MilestoneとM1〜M5のTask Issues、および開発台帳 `docs/projects/<game-id>/ROADMAP.md` を自動生成。
3. **Stage 3: マルチセッション・スプリント開発（M1〜M4）**
   - **M1**: コアロジック＆多戦略ボットによるリプレイ性・バランス検証
   - **M2**: プレイアブルUI骨格＆基本コアループ実装
   - **M3**: コンテンツ・ビルド多様性拡張＆ `localStorage` オートセーブ/戦績実装
   - **M4**: ビジュアル演出（Canvas/SVG）＆ Web Audio合成サウンド・UXポリッシュ
4. **Stage 4: 総合QA・録画テスト・PR提出（M5） ➔ 人間承認で自動デプロイ**
   - 全自動テストと初見プレイテストを通過後、Pull Requestを作成。人間がマージすると GitHub Pages へ自動デプロイされます。

---

## 🛠️ プロジェクト管理・開発コマンド

```bash
# 📊 GitHub Milestone / Issue / PR 進捗ダッシュボード確認
npm run gct:status

# 🏷️ GitHub 標準ラベルの同期・整備
npm run gct:labels

# 🚀 開発サーバー起動
npm run dev

# 🔍 TypeScript型チェック
npm run lint

# 🧪 単体テスト ＆ リプレイ性ボットテスト実行 (Vitest)
npm run test

# 📦 本番ビルド検証
npm run build

# 📱 モバイル実ブラウザE2Eテスト (Playwright)
npm run test:e2e
```
