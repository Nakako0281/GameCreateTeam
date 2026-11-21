# LocalBox — AutoGrowth Studio

**「AIが自律的にマネタイズできるWebサイトを企画・構築・検証・改善し続け、組織自身も進化する」** 自律Webスタジオ（AutoGrowth Studio）と、完全ブラウザ完結・ゼロ送信 実務ツールサイト **LocalBox** のリポジトリです。

> 旧 GameCreateTeam (v1) の全コードおよび履歴はタグ `archive/game-create-team-v1` に保全されています。

---

## 1. ミッションと絶対方針

- **第1目標**: **2027-02-20 までに Google AdSense 月 100 円以上**（以降、週次PDCAと高RPM英語展開により拡大）
- **収益モデル**: Google AdSense のみ（月額サブスク・買い切り決済は禁止）
- **セキュリティ原則**: サーバーDB・会員登録・入力データのサーバー送信を一切持たない（ブラウザローカル完結＋任意設定のみの `localStorage`）
- **役割分担**:
  - **AI（トップリーダー）**: 市場調査・SEO/LLMO設計・UI/セキュリティ監査・実装・自動チェック・KPI分析・PR作成まで自律実行
  - **人間（従業員兼最終責任者）**: PRマージ・独自ドメイン購入・外部管理画面操作・公開記事投稿・方針チェック（すべて GitHub Issue `owner:human` で管理）

---

## 2. 収録ツール（Wave 1 公開中）

| ツール | パス | 特徴 |
| :--- | :--- | :--- |
| **AI入力前・個人情報(PII)自動マスキング＆回答復元** | `/tools/ai-pii-masker/` | メール・電話・APIキー・社名・独自語をブラウザ内で仮名置換し、AI回答をワンクリック復元 |
| **LLMトークン数＆API料金 リアルタイム比較シミュレーター** | `/tools/llm-cost-calculator/` | 日本語/英語のトークン近似計算＋Caching・Batch 50%割引・円換算比較＋CSV出力 |
| **Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング** | `/tools/csv-encoding-fixer/` | 文字コード自動判定＋Excel最適UTF-8 BOM付変換＋列単位マスク/列削除 |
| **画像 EXIF/GPS位置情報 完全削除＆WebP/JPG一括軽量化** | `/tools/image-exif-cleaner/` | 削除前バイナリ診断＋Canvas再描画による物理消去＋削除後0件再検査 |

---

## 3. ローカル起動・機械的チェックコマンド

```bash
# 依存インストール
npm install

# 開発サーバー起動（ローカル実機確認）
npm run dev

# 本番ビルド＆プレビュー
npm run build
npm run preview

# すべての機械チェックを一括実行（型・単体テスト・ビルド・セキュリティ・SEO・組織メモリ・Playwright E2E）
npm run check:all

# GitHub運用ダッシュボード確認
npm run ops:status
```

---

## 4. 永続メモリ・組織ドキュメント

- 最上位憲法: [`AGENTS.md`](AGENTS.md) / [`.agents/rules/AGENTS.md`](.agents/rules/AGENTS.md)
- 現在地ダッシュボード: [`docs/STATE.md`](docs/STATE.md)
- 意思決定記録 (ADR): [`docs/ADR/`](docs/ADR)
- 失敗・教訓・機械化防止台帳: [`docs/POSTMORTEM_AND_LESSONS.md`](docs/POSTMORTEM_AND_LESSONS.md)
- 週次KPIログ: [`docs/METRICS_LOG.md`](docs/METRICS_LOG.md)
- 法務・コンプライアンス整理: [`docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md`](docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md)
- ツールロードマップ: [`docs/TOOLS_ROADMAP.md`](docs/TOOLS_ROADMAP.md)
