---
name: new-tool
description: TemotoBoxへ新しいブラウザ完結・入力データ送信ゼロの実務ツールを追加する標準開発スキル。市場調査・辛口監査・純粋TSロジック・SSG解説・機械チェック・E2E漏洩ゼロ証明までを一気通貫で行う。
---

# 新規ツール開発スキル (`new-tool`)

## 1. 事前調査・辛口監査ゲート
実装前に以下を確認し、通らない企画は採用しない：
1. **検索需要とAI Overviews耐性**: 検索結果のAI要約だけで完結せず、ユーザーがファイルを渡す・コピーする・加工する必要性があるか。
2. **競合実態一次検証と2層位置づけ（`ADR-004`）**: 既存競合（ラッコツールズ・特化サイト等）の実際の処理方式（ブラウザ完結の明記有無・サーバー処理混在有無）を `search_web` 等で一次確認する。「ブラウザ完結」だけで勝てると思い込まず、以下のどちらの役割と明確な差別化を持つかを判定する（単なる劣化模倣は棄却）：
   - **第1層（入口ウェッジ）**: 既存大手に専用機能がない「生成AI前処理×機密実務」の深い解決（単体で検索流入を獲れるか）。
   - **第2層（定着ワークベンチ）**: 日常定番でも「サーバー混在ゼロ×検証可能（ソース公開/E2E）×ツール間連続ワークフローや日本実務特化」で1タブ集約・ブックマーク理由があるか。
3. **公開表現整合（`L-14`）**: 「入力データ送信ゼロ」の表現を使い、無条件の「1バイトも送信しない」「外部通信ゼロ」等を書かない。
4. **非YMYL確認**: 法的助言・医療判断・税額確定の責任を負わない領域か。

## 2. ファイル構成規約
1つのツール（例：`<slug>`）につき、以下をセットで実装する：
1. `src/lib/tools/<slug>.ts`: ブラウザDOM非依存の純粋TypeScript処理ロジック。
2. `src/lib/tools/__tests__/<slug>.test.ts`: Vitest単体テスト（正常系・異常系・日本語文字・境界値）。
3. `src/components/tools/<PascalName>.tsx`: React Island UI（サンプル投入・入力クリア・1クリックコピーまたはダウンロード・外部通信ゼロの視覚的配慮・Unicode絵文字禁止）。
4. `src/pages/tools/<slug>.astro`: `ToolLayout.astro` を使い、以下を静的HTMLとして出力する：
   - ツールの仕組みと技術的安全性（なぜサーバー送信不要か）
   - 実務ユースケースと手順
   - 注意点と免責
   - よくある質問（FAQ 4問以上）
   - 1,500字以上の独自解説テキスト（`audit:seo` の類似度閾値 `< 0.55` と最小1,200字をクリアすること）
5. `src/data/tools.ts`: 該当ツールの `status` を `'published'` にしてメタ情報を登録する。

## 3. E2E実機証明と機械チェック・リモートCI確認
1. `tests/e2e/site.spec.ts` に新規ツールの実操作＆外部ネットワークリクエスト0件証明テストを追加し、あわせて `tests/e2e/ads-leakage.spec.ts`（広告・GA4有効ビルドでのカナリア入力漏洩ゼロ証明）へ新ツールの操作とカナリア検証を追加する。
2. 新規パッケージを追加した場合はローカルで `npm ci` クリーン再現確認を行う。
3. `npm run check:all` を実行し、`audit:ci-parity`, `typecheck`, `test`, `build`, `audit:security`, `audit:seo`, `audit:memory`, `test:e2e`, `test:e2e:ads` のすべてをエラー0件で通過させる。
4. **AI自己受け入れテスト（Issue #55）**: 新規ツールページの初期状態およびサンプル実行後について、Playwright で PC（`1280×800`）とモバイル（`390×844`）のスクリーンショットを撮影して視覚検査し、①スクロール0pxでの主入力枠到達性、②390pxでの文字潰れ・バッジ重なりゼロ、③初見でのラベル理解性を確認してPR本文へ記録する。
5. `docs/STATE.md` と `docs/TOOLS_ROADMAP.md` を更新してコミット＆Pushし、`.github/pull_request_template.md` に沿った Draft PR 作成後に `node scripts/ops_github.mjs ready-pr <pr_number>` でPR本文検証およびリモートCI全通過を確認してから報告する。
   - *クロスOS実装メモ*: `scripts/*.mjs` や Playwright `webServer` から Astro / Playwright CLI を起動する際は、`npx` や `{ ...process.env }` 展開を使わず `process.execPath` / `node node_modules/...` で直接実行する（Windows での `EINVAL` や環境変数大小文字による `webServer` タイムアウト回避のため）。
