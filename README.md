# LocalBox — ブラウザ完結・ゼロ送信 実務ツール集

**LocalBox** は、入力テキストやファイルを 1 バイトもサーバーへ送信せず、お使いの Web ブラウザ内だけで完結して処理する無料の実務向け Web ツール集です。

---

## 1. プライバシーとゼロ送信アーキテクチャ

- **サーバーAPI・データベースなし**: サイトは 100% 静的 HTML（Astro SSG）として配信され、バックエンドの受信サーバーを持ちません。
- **ブラウザ内メモリ・Canvas完結**: 文字列のマスキング、文字コード変換、画像再描画、トークン試算はすべて端末上の JavaScript / HTML5 Canvas のみで実行されます。
- **アカウント登録・拡張機能不要**: ブラウザの強い読み取り権限を要求する拡張機能を使わず、単一タブ内のみで安全に動作します。
- **DevTools でのご自身による検証**: ブラウザの開発者ツール（`F12` → `Network` → `Fetch/XHR`）を開いた状態で操作すれば、入力データの外部通信が 0 件であることをリアルタイムに確認できます（ページ表示後にオフラインにしても動作します）。

---

## 2. 公開中のツール

| ツール | パス | 概要 |
| :--- | :--- | :--- |
| **AI入力前・個人情報(PII)自動マスキング＆回答復元** | `/tools/ai-pii-masker/` | メール・電話番号・APIキー・社名・独自固有名詞をブラウザ内で仮名トークンへ置換し、AIの回答をワンクリック復元 |
| **LLMトークン数＆API料金 リアルタイム比較シミュレーター** | `/tools/llm-cost-calculator/` | 日本語/英語のトークン近似計算、Prompt Caching・Batch 50%割引・円換算比較とCSV出力 |
| **Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング** | `/tools/csv-encoding-fixer/` | 文字コード自動判定、Excel対応UTF-8（BOM付）への変換、列単位のマスク・削除 |
| **画像 EXIF/GPS位置情報 完全削除＆WebP/JPG一括軽量化** | `/tools/image-exif-cleaner/` | 削除前メタデータ診断、HTML5 Canvas再描画による物理消去、削除後0件再検査と軽量化 |

---

## 3. 技術スタック

- **フレームワーク**: Astro（Static Site Generation）+ React 18 Islands
- **言語・UI**: TypeScript（strict）+ Tailwind CSS v4 + Lucide Icons
- **テスト・監査**: Vitest（単体テスト）+ Playwright（PC/モバイル表示＆外部リクエスト0件証明）

---

## 4. ローカル開発・検証コマンド

Node.js の推奨バージョンは [`.node-version`](.node-version) に定義されています。

```bash
# 依存パッケージのクリーンインストール
npm ci

# 開発サーバー起動
npm run dev

# 本番用静的ビルド＆ローカルプレビュー
npm run build
npm run preview

# 型チェック・単体テスト・ビルド・セキュリティ・SEO・E2Eの一括実行
npm run check:all
```

---

## 5. 不具合報告・改善リクエスト

ツールの不具合や機能のご要望は、[フィードバック用 GitHub Issue フォーム](https://github.com/Nakako0281/GameCreateTeam/issues/new?template=user_feedback.md) よりお送りください。  
※ ご報告の際は、実際の顧客データや API キー等の機密情報を貼り付けず、再現用のダミー文字列をご使用ください。
