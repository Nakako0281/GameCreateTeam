# AI Game Lab

AIで作ったWebゲームを並べて遊べる、モバイルファーストのゲームプラットフォームです。

## 技術スタック

- **Vite + React + TypeScript**
- **React Router (`react-router-dom`) + `React.lazy`**：ゲーム単位で自動コード分割（チャンク分割）されるため、Three.js等を使ったゲームが増えてもホーム画面は常に軽量です。
- **Tailwind CSS v4 + Lucide Icons**：カジュアル・ポップなUIデザイン

## 開発サーバーの起動

```bash
npm run dev
```

## 新しいゲームの追加方法（2ステップ）

1. **`src/games/<ゲームID>/index.tsx` を作成する**
   - ゲーム画面のコンポーネントを `export default` で実装します。
   - 親コンテナ（スマホ縦画面フレーム）の残り領域100%に配置されるため、`h-full w-full` を基準にレイアウトできます。

2. **`src/games/registry.ts` の `GAME_REGISTRY` に登録する**
   - タイトル、紹介文、遊び方、タグ、追加日、`lazy(() => import('./<ゲームID>'))` を1つ追記するだけで、ホーム画面のカード一覧・タグ絞り込み・ルーティング（`/games/<ゲームID>`）に自動反映されます。
