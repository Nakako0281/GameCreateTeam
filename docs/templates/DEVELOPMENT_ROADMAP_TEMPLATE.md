# 🗺️ 開発ロードマップ ＆ セッション引き継ぎ台帳：`<ゲームタイトル>` (`<game-id>`)

- **ゲーム企画書**: [docs/proposals/<game-id>.md](../../proposals/<game-id>.md)
- **GitHub Milestone**: `#<milestone_number>` (`Game: <ゲームタイトル>`)
- **親Issue (Epic)**: `#<epic_issue_number>`
- **作業ブランチ**: `feat/game-<game-id>`
- **Draft / Release PR**: `#<pr_number>` (作成後に記載)
- **現在のフェーズ**: `M1 / M2 / M3 / M4 / M5 / Completed`

---

## 1. スプリント＆Issue進捗一覧

> 1セッション（Google One Proの5時間枠、または1日の作業枠）で **1〜2 Issue** を目安に進めます。無理に1回で終わらせず、区切りの良いところでコミット＆引き継ぎを行ってください。

| Phase | Issue # | タスク内容 | ステータス | 担当セッション / 完了日 |
| :--- | :--- | :--- | :--- | :--- |
| **M1** | `#--` | コアロジック (`logic.ts`) ＆ リプレイ性・多戦略ボットテスト (`fun-metrics.test.ts`) | `⬜ Todo` | - |
| **M2** | `#--` | プレイアブルUI骨格 (`index.tsx`) ＆ 基本コアループ実装 | `⬜ Todo` | - |
| **M3** | `#--` | コンテンツ・ビルド要素拡充 ＆ `localStorage` オートセーブ/戦績機能 | `⬜ Todo` | - |
| **M4** | `#--` | ビジュアル演出 (Canvas/SVG) ＆ Web Audio API サウンド・手触りポリッシュ | `⬜ Todo` | - |
| **M5** | `#--` | 総合QA (`lint` / `test` / `build` / `test:e2e`)・録画検証・最終PR作成 | `⬜ Todo` | - |

---

## 2. 次回セッションへの引き継ぎ（Current Handover State）

> [!WARNING]
> **次回セッション開始時のAIエージェントへ**：
> 作業を開始する前に必ずこのセクションと `npm run gct:status` を確認し、**「Next Action」** から作業を再開してください。

- **最終更新日時**: YYYY-MM-DD HH:mm
- **現在のブランチ状態**: `feat/game-<game-id>` （最新コミット: `xxxxxxx` / Clean working tree）
- **直近で完了したこと**:
  - ...
- **現在進行中・未完了の箇所**:
  - ...
- **🎯 次回セッションの目標（Next Action）**:
  1. `git checkout feat/game-<game-id> && git pull`
  2. Issue `#--` （タスク名）の実装に着手する
  3. ...
- **⏰ 推奨次回スケジュール（枠リセット目安）**:
  - 5時間枠リセット目安：`YYYY-MM-DD HH:mm` 以降（または翌日スケジュール）

---

## 3. セッション実行ログ（Sprint History）

### Session 1 (YYYY-MM-DD HH:mm)
- **対象Issue**: `#--`
- **実施内容**:
  - ...
- **テスト・検証結果**:
  - `npm run lint`: PASS / `npm run test`: PASS
- **コミット / Issue更新**:
  - Commit: `xxxxxxx`
  - Issue `#--` を Close（またはコメント更新）
