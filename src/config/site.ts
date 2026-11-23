export const SITE_CONFIG = {
  brandName: 'LocalBox',
  brandTagline: 'ブラウザ完結・入力データ送信ゼロ 実務ツール集',
  description:
    '入力したテキスト・CSV・画像の内容をサーバーへ一切送信せず、ブラウザ内だけで安全に処理できる実務Webツール集。AI入力前の個人情報マスキング、設定ファイル秘匿化、Markdown整形、LLM料金試算、CSV修復、画像EXIF削除を無料で提供。',
  defaultUrl: 'https://example.com',
  repoIssuesUrl: 'https://github.com/Nakako0281/GameCreateTeam/issues',
  feedbackIssueUrl:
    'https://github.com/Nakako0281/GameCreateTeam/issues/new?template=user_feedback.md',
  contactEmailLabel: '専用ドメイン公開後にメールアドレスを掲載予定（現在はGitHubフォームにて受付）',
  gaMeasurementId: (import.meta.env.PUBLIC_GA_ID || '').trim(),
  adsenseClientId: (import.meta.env.PUBLIC_ADSENSE_CLIENT || '').trim(),
} as const

export const LEGAL_LINKS = [
  { href: '/about/', label: '仕組み・検証' },
  { href: '/privacy/', label: 'プライバシーポリシー' },
  { href: '/terms/', label: '利用規約' },
  { href: '/contact/', label: 'お問い合わせ' },
] as const
