# 失敗・教訓・機械化再発防止台帳 (`docs/POSTMORTEM_AND_LESSONS.md`)

> **絶対原則**: 本台帳に記録した教訓に対し「次回から気をつけます」と書いて終わることを禁止する。必ず **「どの自動チェック（スクリプト / テスト）を追加・強化して再発を物理的に封じたか」** をセットで記録する。

---

## 初期設計で封じた失敗パターン（L-01 〜 L-05）

| ID | 発生し得る失敗・過去の教訓 | 根本原因 | 機械的再発防止策（実装済みゲート） |
| :--- | :--- | :--- | :--- |
| **L-01** | 純粋なReact SPA（CSR）でサイトを構築し、AdSense審査やSEOクローラーに「空ページ・低価値コンテンツ」として落とされる | クローラー初回取得時のHTMLに本体テキストが含まれないため | Astro SSG採用 ＋ `scripts/audit-seo-adsense.mjs` が `dist/**/*.html` の初期HTML可視テキスト文字数（ツール1,200字以上・法務500字以上）を検査し、不足時はビルドチェックをFAILさせる |
| **L-02** | サーバーへ無断通信するコードや危険なDOM挿入が紛れ込み、「ゼロ送信」の約束とセキュリティを毀損する | AI・人間のコードレビュー漏れ | `scripts/audit-security.mjs` による静的禁止API検査 ＋ `tests/e2e/site.spec.ts` によるPlaywright実機リクエスト0件検証で自動FAILさせる |
| **L-03** | 解説を自動コピー・言い換えで量産し、Googleの「量産スパム（Scaled Content Abuse）」やAdSense重複判定を受ける | テンプレートに頼ったコンテンツ作成 | `scripts/audit-seo-adsense.mjs` が全ツールページ間の 3-gram Jaccard 類似度を計測し、`0.55` 以上で即FAIL、かつ `<title>`・`<meta description>` 重複も0件強制 |
| **L-04** | ビルドに混入したリンク切れ、法務ページ欠落、UI上のUnicode絵文字混入に気づかずPRを出してしまう | 目視確認への依存 | `scripts/audit-seo-adsense.mjs`（内部リンク切れゼロ・法務4ページ存在チェック）＋ `scripts/audit-security.mjs`（`\p{Extended_Pictographic}` 禁止検査）で自動FAIL |
| **L-05** | GPL等の感染性ライセンスのOSSライブラリを導入したり、料金比較ツールのモデル価格が数ヶ月古いままで放置される | 依存関係・データ鮮度の監視不在 | `scripts/audit-security.mjs` が全直接依存ライセンスを監査 ＋ `scripts/audit-org-memory.mjs` が `PRICING_LAST_VERIFIED` の45日超えを自動エラー化 ＋ GitHub Actions 週次監査 |
