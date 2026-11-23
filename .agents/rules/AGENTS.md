# AutoGrowth Studio 運用細則 (`.agents/rules/AGENTS.md`)

本ファイルは [`AGENTS.md`](../../AGENTS.md) を技術・運用レベルへ落とし込んだ実務規範である。

---

## 1. サイト・技術アーキテクチャ規約

- **プラットフォーム名**: `TemotoBox`（入力データ送信ゼロ・ブラウザ完結の実務ワークベンチ）
- **技術スタック**: Astro（`output: 'static'` SSG）＋ React 18 Islands（`client:load` / `client:idle`）＋ TypeScript（strict）＋ Tailwind CSS v4
- **ホスティング**: Cloudflare Pages（商用利用可・無料枠）＋ 独自ドメイン（Cloudflare Registrar 原価運用）
- **禁止構成**: `*.github.io` / `*.pages.dev` / `*.vercel.app` での AdSense 申請、Vercel Hobby での広告収益運用、初期HTMLが空になる純粋SPA。

---

## 2. コンテンツ品質・SEO・AdSense規約

- **1ツール1検索意図・充実テキスト**: 各ツールページへ 1,200 文字以上の静的解説・検証手順・FAQ 4問以上を含める。
- **量産スパム防止**: ツールページ間の 3-gram Jaccard 類似度を `0.55` 未満、`<title>`/`<meta description>` 重複 0 件を `audit:seo` で強制。
- **必須法務4ページ**: `/privacy/`（外部送信規律・GA4/AdSense分離・CMP・`localStorage`）、`/terms/`（免責・規約）、`/about/`（非送信設計・DevTools検証）、`/contact/`（ゼロPII窓口）。
- **AdSense審査前ルール**: 審査通過前は日本語（`/`）単一言語を維持し、ダミー広告枠は出さない（`PUBLIC_ADSENSE_CLIENT` 設定時のみ描画）。合格後に `/en/` 展開を実施する。

---

## 3. GitHub Issue・ラベル・PR運用規約

- GitHub 操作は必ず `node scripts/ops_github.mjs`（`npm run ops:*`）経由で行う。
- **`owner:human` Issue**: 先頭に `[Human]` を付け、手順・判断根拠・AI推奨案・完了条件チェックボックスを明記する。Close 済み課題とコメントは `ops:status` で検知し後続へ繋ぐ。
- **`owner:ai` トリアージと一次検証**: `unlabeled_trusted_issues` を最優先トリアージし（L-12 信頼境界）、変化の速い事実（LLM料金・法令等）は必ず当日の公式一次ソースを検証する（`llm-pricing.ts` 更新時は検証日・URL・確認者を記録）。
- **作業粒度（Adaptive Batching / 目安 3〜4pt）**:
  - **Size S（1pt）**: ドキュメント・文言・軽微設定/バグ修正 ➔ 関連件を 1 PR へ統合（2〜4件/回）。
  - **Size M（2pt）**: 既存ツール刷新・横断UI改修 ➔ 関連 S と統合し `M 1 + S 1〜2`（または `M 2`）。
  - **Size L（3〜4pt）**: 新規ツール1本（`new-tool`）・大規模構成変更 ➔ 専用 PR（1件）で完遂。
- **2層ブランチ運用と3層ハーネス強制**:
  - 通常作業は最新 `dev` から作業ブランチを切り `dev` 宛て Draft PR を作成する。
  - `origin/main` が `origin/dev` より先行・競合時は、変則リリースPRや未マージ `main` を混ぜた連鎖PRを禁止し、`AGENTS.md` §3-2（Tier 2）に従い `main ➔ dev` 同期または事前相談を先行する（`.agents/hooks.json`・`ops_github.mjs`・`ci.yml` で物理拘束）。
  - ドキュメント・ルール専用PR（`docs/**`, `.agents/**`, `.github/ISSUE_TEMPLATE/**`, `README.md`, `AGENTS.md` のみ）は軽量検証のみ実行する。`ready-pr` 全通過前の Ready 昇格、`main`/`dev` 直Push、自己マージは厳禁。

---

## 4. 機械的品質ゲート（`npm run check:all` ＆ リモートCI）

コード変更PRは下記 1〜10 すべて、ドキュメント専用PRは `audit:ci-parity && node scripts/audit-org-memory.mjs --docs-only`＋リモート軽量CI全通過を完了条件とする（`llm-pricing.ts` 変更PRは `audit:memory:freshness` も必須）：
1. `npm run typecheck` (`astro check && tsc --noEmit`)
2. `npm run test` (Vitest 単体・ベンチマーク・property test・ハーネス単体テスト)
3. `npm run build` (Astro 静的ビルド)
4. `npm run audit:security` (禁止通信・危険構文・絵文字禁止・`_headers`・OSSライセンス)
5. `npm run audit:seo` (文字数・重複・JSON-LD・リンク・類似度・無条件ゼロ送信禁止 L-14)
6. `npm run audit:memory` (永続メモリ・ツール/テスト整合・料金構造・L-12信頼境界・ハーネス設定・ルール予算警告)
7. `npm run audit:ci-parity` (`.node-version` 統一・ロックファイル整合)
8. `npm run test:e2e` ＆ `npm run test:e2e:ads` (PC/モバイル・外部送信0件・広告有効時入力漏洩0件)
9. 依存変更時のクリーン `npm ci` 通過確認
10. `node scripts/ops_github.mjs ready-pr <pr_number>` によるリモートCI全ジョブ `success` 確認

---

## 5. サブエージェント協働ルール

- 重要設計・新規ツール企画・セキュリティ境界変更・戦略見直し・リリース前監査・週次振り返り、および **ルール例外や人間指摘による方針反転を検討する際** は、`.agents/members/01`〜`06`（特に `05` と `03`）を招集して協議する（親AIの推し案へ偏らせないフラットな材料を渡し、アンカリングを防止する）。
- 一方、通常フロー内の Size S ドキュメント・軽微修正では不要な会議を省き効率化する。
