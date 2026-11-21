export const SITE_CONFIG = {
  brandName: 'LocalBox',
  brandTagline: '完全ブラウザ完結・ゼロ送信 実務ツールスタジオ',
  description:
    '入力テキスト・CSV・画像を1バイトもサーバーへ送信せず、お使いのブラウザ内だけで安全に処理できる実務Webツール集。AI入力前の個人情報マスキング、LLM料金試算、CSV文字化け修復、EXIF位置情報削除を無料で利用できます。',
  defaultUrl: 'https://example.com',
  repoIssuesUrl: 'https://github.com/Nakako0281/GameCreateTeam/issues',
  contactEmailLabel: '専用ドメイン確定後に公開予定（現在はGitHub Issuesにて受付）',
  gaMeasurementId: (import.meta.env.PUBLIC_GA_ID || '').trim(),
  adsenseClientId: (import.meta.env.PUBLIC_ADSENSE_CLIENT || '').trim(),
} as const

export const LEGAL_LINKS = [
  { href: '/about/', label: 'LocalBoxについて・ゼロ送信検証' },
  { href: '/privacy/', label: 'プライバシーポリシー・外部送信規律' },
  { href: '/terms/', label: '利用規約・免責事項' },
  { href: '/contact/', label: 'お問い合わせ' },
] as const
