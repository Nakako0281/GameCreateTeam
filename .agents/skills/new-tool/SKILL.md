---
name: new-tool
description: LocalBoxへ新しいブラウザ完結・ゼロ送信ツールを追加する標準開発スキル。市場調査・辛口監査・純粋TSロジック・SSG解説・機械チェック・E2E実機通信ゼロ証明までを一気通貫で行う。
---

# 新規ツール開発スキル (`new-tool`)

## 1. 事前調査・辛口監査ゲート
実装前に以下を確認し、通らない企画は採用しない：
1. **検索需要とAI Overviews耐性**: 検索結果のAI要約だけで完結せず、ユーザーがファイルを渡す・コピーする・加工する必要性があるか。
2. **ゼロ送信優位性**: 「ブラウザ内で完結し1バイトも外部送信しない」ことが競合（クラウド変換サイト等）に対する明確な差別化になるか。
3. **非YMYL確認**: 法的助言・医療判断・税額確定の責任を負わない領域か。

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

## 3. E2E実機証明と機械チェック
1. `tests/e2e/site.spec.ts` に新規ツールの実操作＆外部ネットワークリクエスト0件証明テストを追加する。
2. `npm run check:all` を実行し、`typecheck`, `test`, `build`, `audit:security`, `audit:seo`, `audit:memory`, `test:e2e` のすべてをエラー0件で通過させる。
3. `docs/STATE.md` と `docs/TOOLS_ROADMAP.md` を更新してPRを作成する。
