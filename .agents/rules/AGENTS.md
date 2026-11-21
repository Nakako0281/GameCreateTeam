# AutoGrowth Studio 運用細則 (`.agents/rules/AGENTS.md`)

本ファイルは [`AGENTS.md`](../../AGENTS.md) を技術・運用レベルへ落とし込んだ実務規範である。

---

## 1. サイト・技術アーキテクチャ規約

- **プラットフォーム名**: `LocalBox`（完全ブラウザ完結・ゼロ送信 実務ツールスタジオ）
- **技術スタック**: Astro（`output: 'static'` SSG）＋ React 18 Islands（`client:load` / `client:idle`）＋ TypeScript（strict）＋ Tailwind CSS v4
- **ホスティング**: Cloudflare Pages（無料枠・商用利用可）＋ 独自ドメイン（Cloudflare Registrar 原価運用）
- **禁止ホスティング・設計**:
  - `*.github.io`, `*.pages.dev`, `*.vercel.app` 等の無料サブドメインでの AdSense 申請（ルートドメイン所有権要件違反）。
  - Vercel Hobby プランでの広告収益運用（商用利用禁止条項リスク）。
  - 初期HTMLが空になる純粋SPA構成（`audit:seo` で機械的に拒否）。

---

## 2. コンテンツ品質・SEO・AdSense規約

- **1ツール1検索意図・充実テキスト**: 各ツールページには最低1,200文字以上の一次情報（仕組み・外部通信ゼロ検証方法・実務例・落とし穴・FAQ 4問以上）を静的HTMLとして含める。
- **プログラム量産スパム防止**: ツールページ間のテキスト 3-gram Jaccard 類似度を `0.55` 未満に保つ（`scripts/audit-seo-adsense.mjs` で強制）。
- **必須法務4ページ**:
  - `/privacy/`（外部送信規律公表・GA4/AdSense明記・Cookie無効化・Google認定CMP記載・`localStorage` 説明）
  - `/terms/`（免責・利用条件・知的財産）
  - `/about/`（運営方針・DevToolsでの通信ゼロ検証方法）
  - `/contact/`（ゼロPII方針に沿った連絡導線）
- **AdSense審査前ルール**:
  - 審査通過前は日本語（`/`）単一言語で品質を完成させ、複数言語混在を避ける。
  - AdSense審査コード・広告スロットは環境変数 `PUBLIC_ADSENSE_CLIENT` 設定時のみ描画し、審査前のダミー広告枠は絶対に出さない。
  - 審査通過後に高RPMな英語圏（`/en/`）展開と `hreflang` / 言語別サイトマップ対応を実施する。

---

## 3. GitHub Issue・ラベル・PR運用規約

- プロジェクト操作は必ず `node scripts/ops_github.mjs`（または `npm run ops:*`）経由で行う。
- **人間へのタスク依頼（`owner:human`）**:
  - 必ずタイトル先頭に `[Human]` を付け、手順・判断根拠・AI推奨案・完了条件チェックボックスを明記して起票する。
  - 定期実行時は `npm run ops:status` の `recently_closed_human_issues` を見て、人間が完了させた依頼を自動検知し、次の `owner:ai` タスクや `docs/STATE.md` 更新へ繋げる。
- **AI自律タスク（`owner:ai`）**:
  - 1回の作業で1つの完結したスライス（例：ツール1〜2本、またはSEO改善群）を実装し、`npm run check:all` を通してから PR を作成する。
  - `main` ブランチへの直接Push・PRの自己マージは厳禁。

---

## 4. 機械的品質ゲート（`npm run check:all`）

以下すべてがエラー0件で通過することを完了条件とする：
1. `npm run typecheck`: `astro check && tsc --noEmit`（型エラー0件）
2. `npm run test`: Vitest 単体テスト全通過（ロジック精度・境界値）
3. `npm run build`: Astro 静的ビルド成功（`dist/` 生成）
4. `npm run audit:security`: 不正通信API・危険構文・絵文字混入・`_headers`・OSSライセンス違反（GPL系等）0件
5. `npm run audit:seo`: 初期HTML文字数・`<title>`/`<meta description>` 重複・JSON-LD・法務ページ・リンク切れ・ページ間類似度全クリア
6. `npm run audit:memory`: 永続メモリファイル整合性・公開ツール台帳とビルド成果物の一致・料金テーブル鮮度（45日以内）確認
7. `npm run test:e2e`: Playwright によるPC/モバイル両幅レイアウト検証・コンソールエラー0件・**全ツールの実操作中外部リクエスト0件証明**

---

## 5. サブエージェント協働ルール

- 単独AIの思い込みを防ぐため、重要設計・新規ツール企画・週次振り返り・AdSense/SEO監査では `define_subagent` / `invoke_subagent` を用いて `.agents/members/01`〜`06` の専門ロール（特に `05_devils_advocate_critic` と `03_security_privacy_officer`）を招集して検証を行うこと。
