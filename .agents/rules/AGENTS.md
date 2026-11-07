# GameCreateTeam プロジェクト共通ルール (AGENTS.md)

このリポジトリは、AIゲーム制作チーム（**GameCreateTeam**）が自律的にモバイルファーストのWebゲームを企画・設計・製造・テスト・リリースするプラットフォーム **「AI Game Lab」** です。

## 1. プラットフォーム技術仕様・制約

- **フレームワーク**: Vite + React 18 + TypeScript + Tailwind CSS v4 + Lucide Icons
- **モバイルファースト画面枠**:
  - ゲームプレイ画面（`src/pages/GamePlayPage.tsx`）は、スマートフォンではフル画面（`100dvh`）、PCでは中央固定の**スマホ縦画面フレーム（最大幅 `430px`）**内で動作します。
  - 各ゲームコンポーネント（`src/games/<game-id>/index.tsx`）は、共通スリムヘッダーを除いた残り領域（`h-full w-full`）の中に収まるように設計・実装してください。
  - **横スクロールのはみ出し厳禁**: `375px〜430px` 幅のスマホ縦画面で要素が横にはみ出さないこと。
- **コード分割（遅延読み込み）**:
  - すべてのゲームは `src/games/<game-id>/index.tsx` に `export default` で実装し、`src/games/registry.ts` の `GAME_REGISTRY` に `React.lazy(() => import('./<game-id>'))` で登録します。
- **デザインテイスト**:
  - プラットフォーム全体は「カジュアル・ポップ風（明るい背景＋カラフルなアクセント、Nintendo Switchやカジュアルアプリのような親しみやすいUI）」で統一します。

## 2. ドキュメント・記録のルール

- **リポジトリ内に企画書や議事録のMarkdownファイルを残さないこと**。
- 市場調査・企画会議（4人の議論ログ）・要件定義・基本設計・レビュー記録はすべて **対象の GitHub Issue のコメント欄** に投稿して記録します。

## 3. 品質・エラーゼロの絶対原則

- 以下の検証をすべてパスしない限り、PR作成や完了報告を行うことは厳禁です：
  1. `npm run lint`（TypeScriptの型エラー0件）
  2. `npm run test`（Vitestによるゲームロジックの単体テスト＋レジストリ整合性テスト全通過）
  3. `npm run build`（Vite本番ビルド成功）
  4. `npm run test:e2e`（Playwrightによるモバイル実ブラウザ起動・コンソールエラー0件・画面はみ出しなし検証）
- ゲーム制作の依頼（GitHub Issueの指定、または新規お題の提示）を受けた場合は、必ず `.agents/skills/game-create-team/SKILL.md` スキルを起動し、AI社員7名のチーム体制で進めてください。
