# 🗺️ 開発ロードマップ ＆ セッション引き継ぎ台帳：『ダイス・フォージ・ダンジョン：魔導刻印と運命の塔』 (`dice-forge-dungeon`)

- **ゲーム企画書**: [docs/proposals/dice-forge-dungeon.md](../../proposals/dice-forge-dungeon.md)
- **GitHub Milestone**: `#1` (`Game: ダイス・フォージ・ダンジョン (dice-forge-dungeon)`)
- **親Issue (Epic)**: [`#12`](https://github.com/Nakako0281/GameCreateTeam/issues/12)
- **作業ブランチ**: `feat/game-dice-forge-dungeon`
- **フリー音声素材配置フォルダ**: [`public/assets/games/dice-forge-dungeon/audio/`](../../../public/assets/games/dice-forge-dungeon/audio/README.md)
- **現在のフェーズ**: `✅ M1〜M5 全工程完了・PR提出済み`

---

## 1. スプリント＆Issue進捗一覧

> **M1〜M5の進行ペースについて**:
> 「1日1M」といった固定制限ではなく、**Google One Proの利用枠（5時間ごとのリセット枠＝1クォーター）の中で進められるだけ連続で進め、枠の上限が近づいた場合は区切りの良いMの完了時点でコミット＆引き継ぎを行う** 方式で運用しています。今作は1セッションの利用枠内で M1〜M5（PR提出）まで一気通貫で完走しました。

| Phase | Issue # | タスク内容 | ステータス | 完了日 |
| :--- | :--- | :--- | :--- | :--- |
| **M1** | [`#13`](https://github.com/Nakako0281/GameCreateTeam/issues/13) | コアロジック (`types.ts`, `data.ts`, `logic.ts`) ＆ 6種ボット×240ランのリプレイ性テスト (`fun-metrics.test.ts`) | `✅ Done` | 2026-11-15 |
| **M2** | [`#14`](https://github.com/Nakako0281/GameCreateTeam/issues/14) | プレイアブルUI骨格 (`index.tsx`)・2タップ配置・リアルタイム予測表示・`registry.ts` 登録 | `✅ Done` | 2026-11-15 |
| **M3** | [`#15`](https://github.com/Nakako0281/GameCreateTeam/issues/15) | 6面十字展開鍛造UI・クラス3種＆Ascension難度・`localStorage` オートセーブ/戦績/図鑑 (`storage.ts`) | `✅ Done` | 2026-11-15 |
| **M4** | [`#16`](https://github.com/Nakako0281/GameCreateTeam/issues/16) | フリー音声素材ローダー＋ピッチ制御＋Web Audioフォールバック (`audio.ts`) ＆ シナジー連鎖演出 | `✅ Done` | 2026-11-15 |
| **M5** | [`#17`](https://github.com/Nakako0281/GameCreateTeam/issues/17) | 総合QA (`lint` / `test` / `build` / `test:e2e`)・録画検証・初見プレイテスト・最終PR作成 | `✅ Done` | 2026-11-15 |

---

## 2. リプレイ性ボット計測結果（`fun-metrics.test.ts` 実測値）

| ボット種別 | 平均スコア | 全12階層クリア率 | ニアミス率 (残HP30%以下) | 平均到達フロア | 中央値プレイ時間 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `randomBot` | 2,654 pt | 0.0% | 50.8% | Floor 2.1 | 196秒 |
| `monotoneBot` | 4,475 pt | 0.0% | 66.7% | Floor 3.6 | 208秒 |
| `proBot (noise 0.0)` | 20,908 pt | 90.0% | 9.2% | Floor 11.4 | 492秒 |
| `goodBot (noise 0.3)` | 11,539 pt | 22.5% | 58.3% | Floor 7.4 | 508秒 |
| `roughBot (noise 0.65)` | 6,388 pt | 5.0% | 54.2% | Floor 4.7 | 344秒 |
| `strategyABot (小目連撃×猛毒)` | 15,727 pt | 67.5% | 30.0% | Floor 9.5 | 572秒 |
| `strategyBBot (偶数装甲×盾反撃)` | 17,279 pt | 65.0% | 23.3% | Floor 10.1 | 632秒 |
| `strategyCBot (高出目×マナ操作)` | 16,781 pt | 60.8% | 31.7% | Floor 9.8 | 532秒 |

---

## 3. 次回セッションへの引き継ぎ（Current Handover State）

- **最終更新日時**: 2026-11-15 14:38
- **現在のブランチ状態**: `feat/game-dice-forge-dungeon`（全自動テスト通過・PR提出済み）
- **🎯 次のアクション（Next Action）**:
  - 最高責任者（人間）による Pull Request の最終確認・マージ待ち。
  - フリー音声素材（`.mp3`）はいつでも `public/assets/games/dice-forge-dungeon/audio/` に追加配置可能です（未配置のファイルは自動でWeb Audio合成音にフォールバックします）。
