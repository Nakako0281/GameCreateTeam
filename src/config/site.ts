export const SITE_CONFIG = {
  brandName: 'TemotoBox',
  brandTagline: '機密・AI実務のブラウザ完結ワークベンチ（入力データ送信ゼロ）',
  description:
    '生成AIや社外共有の前に、入力テキスト・PDF・設定ファイル・CSV・画像の内容をサーバーへ一切送信せずブラウザ内だけで下ごしらえできる実務ワークベンチ。PIIマスキング、PDF真の墨消し、.env秘匿化、Markdown整形、LLM料金試算、CSV修復、EXIF削除を提供。',
  defaultUrl: 'https://temotobox.com',
  repoIssuesUrl: 'https://github.com/Nakako0281/GameCreateTeam/issues',
  feedbackIssueUrl:
    'https://github.com/Nakako0281/GameCreateTeam/issues/new?template=user_feedback.md',
  contactEmailLabel: '専用ドメイン公開後にメールアドレスを掲載予定（現在はGitHubフォームにて受付）',
  gaMeasurementId: (import.meta.env.PUBLIC_GA_ID || '').trim(),
  adsenseClientId: (import.meta.env.PUBLIC_ADSENSE_CLIENT || '').trim(),
  isPreviewNoindex:
    (import.meta.env.PUBLIC_NOINDEX || '').trim().toLowerCase() === 'true',
} as const

export const LEGAL_LINKS = [
  { href: '/about/', label: '仕組み・検証' },
  { href: '/privacy/', label: 'プライバシーポリシー' },
  { href: '/terms/', label: '利用規約' },
  { href: '/contact/', label: 'お問い合わせ' },
] as const
