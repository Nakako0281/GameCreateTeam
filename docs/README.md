# 📚 GCT ドキュメント ＆ プロジェクト管理ハブ (`docs/`)

このディレクトリは、**GameCreateTeam (GCT)** における市場調査、ゲーム企画書（人間によるGoサイン決裁対象）、およびマルチセッション開発ロードマップ（5時間枠／日次スケジュール・引き継ぎ記録）を一元管理する場所です。

---

## 🏛️ 組織構造と意思決定ルール

| 役割 | 担当 | 権限・責務 |
| :--- | :--- | :--- |
| **最高責任者（Executive Producer / Owner）** | **人間（ユーザー）** | ① ゲーム企画書（MD）の審査・修正指示・**最終Goサイン**<br>② 完成したゲームの最終確認・**Pull Requestのマージ** |
| **AIゲーム開発組織（GCT Agents）** | **AIチーム（00〜06）** | 市場調査、企画立案、企画書MD作成、GitHub Milestone/Issue設計、5時間枠・日次スケジュール管理、段階的実装、ボット検証、QA/E2Eテスト、PR作成まで**その他すべての業務** |

> [!IMPORTANT]
> **絶対原則**: AIチームは、人間（最高責任者）が企画書（`docs/proposals/<game-id>.md`）に対して **Goサイン** を出す前に、本実装へ進んではいけません。

---

## 📂 ディレクトリ構成

```text
docs/
├── README.md                                  # 本ファイル（プロジェクト一覧＆運用ガイド）
├── templates/                                 # 各種標準テンプレート
│   ├── MARKET_RESEARCH_TEMPLATE.md            # ① 市場調査・リプレイ性構造分析テンプレート
│   ├── GAME_PROPOSAL_TEMPLATE.md              # ② ゲーム企画書（人間への提出・決裁用）テンプレート
│   └── DEVELOPMENT_ROADMAP_TEMPLATE.md        # ③ 開発スケジュール＆セッション引き継ぎ台帳テンプレート
├── proposals/                                 # 提出済み・審査中のゲーム企画書（MDファイル）
│   └── <game-id>.md                           # 企画書本体（市場調査サマリー・企画詳細・スプリント計画）
└── projects/                                  # Goサイン承認後の進行中・完了プロジェクト管理
    └── <game-id>/
        └── ROADMAP.md                         # マイルストーン進捗・5時間枠/日次スケジュール・引き継ぎログ
```

---

## 📊 プロジェクト一覧（企画・開発ステータス）

| Project ID | タイトル | 想定1プレイ時間 | ステータス | 企画書 (MD) | ロードマップ | GitHub Milestone / Issue |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `dice-forge-dungeon` | **ダイス・フォージ・ダンジョン：魔導刻印と運命の塔** | 15〜25分 (自動セーブ有) | `🟡 企画書レビュー・Goサイン待ち` | [企画書](./proposals/dice-forge-dungeon.md) / [市場調査](./proposals/dice-forge-dungeon-research.md) | *(Goサイン後に作成)* | [Issue #12](https://github.com/Nakako0281/GameCreateTeam/issues/12) |

---

## 🔄 運用フロー（企画からリリースまで）

### Step 1: 市場調査 ＆ 企画書作成（AI） ➔ 企画書提出
1. AIチームが市場調査を実施し、**「何度も繰り返し遊べる（高いリトライ性を持つ）」** ゲームを企画します。
2. 1プレイの時間（1分〜1時間以上まで自由）は、そのゲームのコアループが最も輝く長さを議論して決定します。
3. [GAME_PROPOSAL_TEMPLATE.md](./templates/GAME_PROPOSAL_TEMPLATE.md) に基づき、`docs/proposals/<game-id>.md` を作成し、GitHubにも企画Issue（`status:awaiting-approval`）を起票して人間に提出します。

### Step 2: 最高責任者（人間）によるレビュー・Goサイン
- 人間が企画書（`docs/proposals/<game-id>.md`）を確認し、以下のいずれかを指示します：
  - **✅ Go（承認）**: 開発計画＆実装フェーズへ進む。
  - **🔄 修正指示**: 指摘事項を反映して企画書を改訂し、再提出する。
  - **❌ 却下**: 別テーマで再調査・再企画する。

### Step 3: マイルストーン・Issue分解 ＆ マルチセッション開発（AI）
- Goが出たら、AIは [DEVELOPMENT_ROADMAP_TEMPLATE.md](./templates/DEVELOPMENT_ROADMAP_TEMPLATE.md) から `docs/projects/<game-id>/ROADMAP.md` を作成し、GitHub上に **Milestone** と分割された **Task Issues（M1〜M5）** を自動構築します。
- **Google One Proの利用枠（5時間ごとのリセット枠、または日次スケジュール）** に収まるよう、1回のセッションでは「今日できる範囲（1〜2 Issue）」だけを確実に進め、コミット・Push・進捗記録・次回スケジュール設定を行ってクリーンに引き継ぎます。

### Step 4: 総合QA ＆ Pull Request 提出（AI ➔ 人間）
- 全マイルストーンのIssueが完了し、すべての自動テスト（単体・リプレイ性ボット・ビルド・E2E）をパスしたら、Pull Requestを作成して人間へ最終報告します。
