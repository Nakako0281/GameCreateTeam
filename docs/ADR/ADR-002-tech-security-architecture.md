# ADR-002: 技術・セキュリティ・インフラ構成（Astro SSG + Cloudflare Pages + Zero-Transmission）

- **日付**: 2026-11-21
- **ステータス**: 採用（Accepted）

---

## 1. 技術選定と棄却理由

### フレームワーク：Astro (`output: 'static'`) + React Islands + Tailwind CSS v4
- **採用理由**:
  - 旧 Vite SPA は初期HTMLが `<div id="root"></div>` のみとなり、検索エンジンやAdSense自動審査クローラーが中身を空判定するリスクがあった。
  - Astro SSG により、全ツールページの解説・使い方・FAQ・構造化データ（`SoftwareApplication`, `FAQPage`, `BreadcrumbList`）を純粋な静的HTMLとしてビルド時に出力する。
  - ツールの操作UIだけを React Island としてハイドレーションするため、高速なページ表示（Core Web Vitals良好）とリッチなインタラクティブ操作を両立できる。

### ホスティング＆ドメイン：Cloudflare Pages（無料枠）＋ Cloudflare Registrar（独自ドメイン原価）
- **採用理由**:
  - **GitHub Pages (`*.github.io`) 棄却理由**: 無料サブドメインのままではルートドメイン所有権と `ads.txt` 要件によりGoogle AdSense審査に原則合格できない。
  - **Vercel Hobby 棄却理由**: Vercel無料枠（Hobby）は利用規約上「商用利用（広告掲載を含む収益目的サイト）」が制限・違反リスクがある。
  - **Cloudflare Pages 無料枠**: 静的配信の帯域・リクエスト数無制限、商用・AdSense利用可、DDoS耐性、`_headers` による厳格なセキュリティヘッダー配布、GitHub連携自動デプロイがすべて無料。
  - **Cloudflare Registrar**: 更新時値上げなしの原価提供（`.com` 約$11.17/年）かつWHOISプライバシー保護が標準無料。

### リポジトリ継続方針
- 既存 `Nakako0281/GameCreateTeam` をそのまま継続利用する。旧体制コードはタグ `archive/game-create-team-v1` に保全済み。Cloudflare Pages はリポジトリ名と公開ドメインが独立しているため問題ない。

### テスト環境（Staging / Preview）と本番環境の2層運用
- **テスト環境（ドメイン購入前・PR確認用）**: Cloudflare Pages の無料サブドメイン（`*.pages.dev` および PR ごとのプレビューURL `*.<project>.pages.dev`）をそのままテスト・実機確認環境として運用する。`public/_headers` にて `https://:project.pages.dev/*` および `https://:branch.:project.pages.dev/*` に `X-Robots-Tag: noindex, nofollow` を常時強制し、テストURLの検索エンジン誤インデックスと重複コンテンツ事故を防ぐ（加えて `PUBLIC_NOINDEX=true` 設定時はHTML metaとテスト環境バナーも出力可能）。
- **本番環境（独自ドメイン取得後）**: 同一 Cloudflare Pages プロジェクトへ独自ドメイン（カスタムドメイン）を紐づけ、`SITE_URL` 環境変数に本番URLを設定して公開する。テストURLと本番が同一プロジェクトでシームレスに共存し、移行時の作り直しが発生しない。

---

## 2. セキュリティ＆ゼロPII設計方針

1. **サーバーサイド処理ゼロ**: APIサーバー、データベース、認証機構、お問い合わせ送信バックエンドを一切持たない。
2. **外部送信ゼロの機械的検証**:
   - `scripts/audit-security.mjs` でソースコード内の `fetch` / `XMLHttpRequest` / `sendBeacon` / `WebSocket` / 外部`<form>` を自動検出し拒否。
   - Playwright E2E テストで、実際に機密ダミーデータを各ツールへ入力・処理し、その間のブラウザネットワークリクエストが外部へ1件も飛んでいないことを証明する。
3. **厳格なHTTPセキュリティヘッダー (`public/_headers`)**:
   - `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy: camera=(), microphone=(), geolocation=()`、`Strict-Transport-Security`、および最小ドメインのみ許可した `Content-Security-Policy` を設定。
4. **サードパーティスクリプトの環境変数分離**:
   - GA4（`PUBLIC_GA_ID`）と AdSense（`PUBLIC_ADSENSE_CLIENT`）は環境変数が設定された本番ビルドでのみ挿入し、未設定時・審査前のローカル/プレビュー環境では一切ロードしない。
