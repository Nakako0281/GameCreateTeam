# AI Game Lab (GameCreateTeam)

AIゲーム制作チーム（**GameCreateTeam**）が、市場調査・企画会議・要件定義・設計・製造・自動テスト・レビュー・リリースまでを自律的に行い、モバイルファーストで遊べるWebゲームをどんどん追加していくプラットフォームです。

---

## 🤖 AIゲーム制作チーム（`.agents/`）の構成

このリポジトリには、以下の7名のAI社員（サブエージェント定義）と自律開発ワークフロー（[SKILL.md](.agents/skills/game-create-team/SKILL.md)）が組み込まれています。

| 役割 | 定義ファイル | 担当フェーズ・専門視点 |
| :--- | :--- | :--- |
| **🎬 進行プロデューサー** | [00_producer.md](.agents/members/00_producer.md) | 企画会議のファシリテート、要件定義・基本設計書の策定、Issue/PR管理 |
| **🔍 トレンドリサーチャー** | [01_trend_researcher.md](.agents/members/01_trend_researcher.md) | Web検索による競合・人気ブラウザ/スマホゲームの市場調査 |
| **🛡️ 王道・ルール番人** | [02_classic_guardian.md](.agents/members/02_classic_guardian.md) | 【企画＆レビュー兼任】基礎ルールの完成度・直感性・CPU対戦バランス |
| **⚡ バズ・中毒性プランナー** | [03_buzz_planner.md](.agents/members/03_buzz_planner.md) | 【企画＆レビュー兼任】爽快演出（Juiciness）・独自の遊び心・リプレイ性 |
| **📱 モバイルUXデザイナー** | [04_mobile_ux_designer.md](.agents/members/04_mobile_ux_designer.md) | 【企画＆レビュー兼任】スマホ縦画面（最大幅430px）の片手操作性・ポップUI |
| **💻 リードゲームエンジニア** | [05_game_developer.md](.agents/members/05_game_developer.md) | React / TypeScript / Canvas / Three.js 実装・Vitest単体テスト作成 |
| **🧪 QA自動検証エンジニア** | [06_qa_engineer.md](.agents/members/06_qa_engineer.md) | 型チェック・単体テスト・ビルド検証・Playwright実ブラウザモバイルE2E検証 |

---

## 🔄 ゲームができるまでの自律フロー

1. **きっかけを作る（人間）**
   - GitHubのIssue（テンプレート「🎮 新規ゲーム制作リクエスト」）に「オセロを作ってほしい」などを投稿し、AIに「Issueのゲームを作って」と伝える（または直接チャットで伝える）。
2. **市場調査 ＆ 4人の企画会議（AIチーム）**
   - リサーチャー・王道番人・バズ企画・モバイルUXの4名が調査＆初期提案を行い、さらにお互いの案にツッコミを入れて議論。議事録は **GitHub Issueのコメント** に自動投稿されます。
3. **要件定義 ＆ 基本設計（AIチーム）**
   - プロデューサーが議論をまとめ、仕様書・UI設計書を **GitHub Issueのコメント** に投稿します。
4. **製造 ＆ 単体テスト実装（AIチーム）**
   - `feat/game-<id>` ブランチを切り、`src/games/<id>/` にゲーム本体とVitest単体テストを実装します。
5. **QA実ブラウザ検証 ＆ 企画3名の記憶引き継ぎレビュー（AIチーム）**
   - QAエンジニアが `lint` / `test` / `build` / `test:e2e`（Playwrightスマホ画面検証）を実行。
   - さらに企画会議に参加した3名（王道番人・バズ企画・モバイルUX）が **企画時の記憶を引き継いだまま** コードを検収。全員の `✅ LGTM` が出るまで修正ループを回します。
6. **Pull Request作成 ➔ マージで自動Web公開（人間はマージボタンを押すだけ）**
   - AIチームがPRを作成します。人間がPRをマージすると、GitHub Actions（[deploy.yml](.github/workflows/deploy.yml)）によって **GitHub Pages** へ自動デプロイされます。

---

## 🛠️ 開発・テストコマンド

```bash
# 開発サーバー起動
npm run dev

# TypeScript型チェック
npm run lint

# 単体テスト実行 (Vitest)
npm run test

# 本番ビルド検証
npm run build

# モバイル実ブラウザE2Eテスト (Playwright)
npm run test:e2e
```
