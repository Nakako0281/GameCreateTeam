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
| **L-06** | PR #36 でローカルの `npm run check:all` のみを確認して完了報告・レビュー依頼を出したが、GitHub Actions CI（Run `44854890611`）が `npm ci` の `Missing: esbuild@0.28.2 from lock file` で失敗していた | ① 旧Vite 6の `package-lock.json` 残存のまま `npm install` し、`npm ci` 検証もNodeバージョン統一（ローカル24 vs CI 22）もしなかった。<br>② ローカル通過だけで完了と判断でき、リモートCI未通過のまま非Draft PRを出して報告できてしまう組織手順・CLI・リリースゲート欠落 | ① `.node-version` 導入＋`scripts/audit-ci-parity.mjs` 新設で Nodeバージョン一致・ロックファイル整合・ネスト `vite`/`esbuild` 乖離ゼロを `check:all` で機械強制。<br>② `scripts/ops_github.mjs` の `create-pr` をデフォルト `draft: true` 化し、`wait-ci` ＆ `ready-pr` コマンドを新設（GitHub Actions 全ジョブ `success` 確認前の Ready 昇格・人間報告を物理ブロック、さらにクローズ済みPRおよび `head.sha` 不一致時の強制エラー停止を搭載）。<br>③ Global Rule (`GEMINI.md`)・`AGENTS.md`・`.agents/members/00,05,06`・全4スキル・定例自動化をリモートCI通過必須体制へ刷新 |
