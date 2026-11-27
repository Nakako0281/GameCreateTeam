# TemotoBox — 生成AI・社外共有前の下ごしらえ特化型 ブラウザ完結実務ワークベンチ（入力データ送信ゼロ）

**TemotoBox** は、生成AIや社外共有の前に、入力したテキスト・PDF・設定ファイル・CSV・画像の内容をサーバーへ一切送信せず、お使いの Web ブラウザ内だけで安全に下ごしらえできるソース公開・検証可能な実務ワークベンチです（本番環境でアクセス解析や広告配信を導入する場合の外部送信内訳は、サイト内の `/privacy/` に公表します）。

---

## 1. プライバシーと入力データ非送信アーキテクチャ

- **サーバーAPI・データベースなし（混在ゼロ）**: 全ツール・全ページが 100% 静的 HTML（Astro SSG）として配信され、サーバー処理型ツールとの混在やバックエンドの受信サーバーを持ちません。
- **ブラウザ内メモリ・Canvas完結**: 文字列のマスキング、PDFのラスタライズ墨消し、`.env` / YAML 秘匿化、文字コード変換、画像再描画、トークン試算はすべて端末上の JavaScript / HTML5 Canvas のみで実行されます。
- **アカウント登録・拡張機能不要**: ブラウザの強い読み取り権限を要求する拡張機能を使わず、単一タブ内のみで安全に動作します。
- **ソース公開 ＆ DevTools でのご自身による検証**: 「運営を信じる」のではなくご自身で確かめられるようコードと自動テストを公開しています。ブラウザの開発者ツール（`F12` → `Network`）を開いた状態で操作すれば、入力テキストやファイル内容を含む外部リクエストが一切発生しないことを確認できます（ページ読み込み後はオフライン状態にしても全ツールが動作します。なお、本番環境でアクセス解析や広告配信を有効にしている場合は、それらに伴う通信が発生し得ますが、ツールの入力データ処理とは完全に分離されています）。

---

## 2. 公開中のツール

| ツール | パス | 概要 |
| :--- | :--- | :--- |
| **AI入力前・個人情報(PII)自動マスキング＆回答復元** | `/tools/ai-pii-masker/` | メール・電話番号・APIキー・社名・独自固有名詞をブラウザ内で仮名トークンへ置換し、AIの回答をワンクリック復元 |
| **LLMトークン数＆API料金・性能比較シミュレーター** | `/tools/llm-cost-calculator/` | 日本語/英語のトークン近似計算、Prompt Caching・Batch 50%割引・円換算比較、性能ベンチマーク（コスパ散布図・棒グラフ）とCSV出力 |
| **Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング** | `/tools/csv-encoding-fixer/` | 文字コード自動判定、Excel対応UTF-8（BOM付）への変換、列単位のマスク・削除 |
| **画像 EXIF/GPS位置情報 完全削除＆WebP/JPG一括軽量化** | `/tools/image-exif-cleaner/` | 削除前メタデータ診断、HTML5 Canvas再描画による物理消去、削除後0件再検査と軽量化 |
| **PDF「真の墨消し（黒塗り）」＆メタデータ完全削除** | `/tools/pdf-redactor/` | 全ページ画像化焼付けによる下層テキスト抽出不能化、PII候補1クリック提案、Info/XMP削除と0文字/0件再検査 |
| **PDF 完全ローカル結合・分割・ページ並べ替え** | `/tools/pdf-organizer/` | 複数PDFの無劣化結合・範囲分割・ZIP一括保存・90度回転・A4縦統一・ページ単位注釈/メタデータ除去と再スキャン検証 |
| **AI出力（Markdown・表）➔ Word / Excel / Slack 整形** | `/tools/ai-markdown-formatter/` | 書式付きHTMLコピー、複数Markdown表のExcel用TSV/BOM付CSV抽出、Slack mrkdwn・平文整形 |
| **`.env` / JSON / YAML / ログ 秘匿値サニタイズ＆変換** | `/tools/config-sanitizer/` | APIキー・DBパスワード・秘密鍵・K8s Secretの非破壊マスク、`.env.example`生成、`.env`⇔JSON⇔YAML相互変換 |

---

## 3. 技術スタック

- **フレームワーク**: Astro（Static Site Generation）+ React 18 Islands
- **言語・UI**: TypeScript（strict）+ Tailwind CSS v4 + Lucide Icons
- **テスト・監査**: Vitest（単体テスト）+ Playwright（PC/モバイル表示、解析・広告未設定ビルドでの入力データ送信ゼロ証明、および解析・広告有効ビルドでの入力漏洩ゼロ証明）

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
