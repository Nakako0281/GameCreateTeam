export type ToolStatus = 'published' | 'planned'

export type ToolCategory = 'ai-security' | 'file-utility' | 'daily-dev'

export interface ToolDefinition {
  slug: string
  name: string
  shortTitle: string
  titleSegments: string[]
  shortSummary: string
  summary: string
  category: ToolCategory
  categoryLabel: string
  status: ToolStatus
  wave: 1 | 2 | 3
  keywords: string[]
  iconKey:
    | 'shield'
    | 'calculator'
    | 'table'
    | 'image'
    | 'file-lock'
    | 'files'
    | 'sparkles'
    | 'braces'
    | 'calendar'
    | 'regex'
    | 'type'
    | 'qr-code'
}

export const TOOLS: ToolDefinition[] = [
  {
    slug: 'ai-pii-masker',
    name: 'AI入力前・個人情報（PII）自動マスキング＆回答復元',
    shortTitle: 'AI PII マスカー',
    titleSegments: ['AI入力前・', '個人情報(PII)', '自動マスキング', '＆回答復元'],
    shortSummary:
      'メール・社名・APIキーを仮名置換し、AIの回答をワンクリックで復元します。',
    summary:
      'メール・電話番号・住所・APIキー・独自固有名詞をブラウザ内だけで仮名トークンへ置換し、AIの回答を貼り戻すとワンクリックで自動復元します。',
    category: 'ai-security',
    categoryLabel: 'AI安全利用',
    status: 'published',
    wave: 1,
    keywords: ['ChatGPT 個人情報 マスキング', 'AI 機密情報 匿名化', 'PII マスク ブラウザ'],
    iconKey: 'shield',
  },
  {
    slug: 'llm-cost-calculator',
    name: 'LLMトークン数＆API料金 リアルタイム比較シミュレーター',
    shortTitle: 'LLM料金シミュレーター',
    titleSegments: ['LLMトークン＆', 'API料金', '比較シミュレーター'],
    shortSummary:
      'プロンプトのトークン数を推定し、主要15モデルの月額API料金を円換算で比較します。',
    summary:
      '日本語テキストやコードを即時トークン推定し、主要モデルのAPI月額費用・Prompt Caching・Batch割引を円換算で一括比較します。',
    category: 'ai-security',
    categoryLabel: 'AIコスト試算',
    status: 'published',
    wave: 1,
    keywords: ['LLM API 料金比較', 'トークン数 計算 日本語', 'GPT Claude Gemini コスト試算'],
    iconKey: 'calculator',
  },
  {
    slug: 'csv-encoding-fixer',
    name: 'Excel CSV文字化け修復（Shift-JIS ⇔ UTF-8 BOM付）＆列マスキング',
    shortTitle: 'CSV文字化け修復',
    titleSegments: ['Excel CSV', '文字化け修復', '＆列マスキング'],
    shortSummary:
      '文字化けCSVをExcel対応UTF-8へ変換。不要列の削除やマスクも同時に行えます。',
    summary:
      'サーバーへ一切アップロードせず、文字化けしたCSVの文字コードを自動判定してExcel対応UTF-8（BOM付）等へ変換。列ごとのマスク・削除も可能です。',
    category: 'file-utility',
    categoryLabel: 'ファイル実務',
    status: 'published',
    wave: 1,
    keywords: ['CSV 文字化け 修復 ブラウザ', 'UTF-8 BOM付 変換', 'CSV 個人情報 マスク'],
    iconKey: 'table',
  },
  {
    slug: 'image-exif-cleaner',
    name: '画像 EXIF/GPS位置情報 完全削除＆WebP/JPG一括軽量化',
    shortTitle: '画像EXIF削除＆圧縮',
    titleSegments: ['画像EXIF・GPS', '位置情報削除', '＆一括軽量化'],
    shortSummary:
      '写真のGPS位置情報やEXIFをCanvas再描画で完全削除し、WebP等へ一括圧縮します。',
    summary:
      'JPEG/PNG内の撮影日時やGPS位置情報・メタデータチャンクをローカル解析し、Canvas再描画で物理消去しつつWebP/JPEG/PNGへ一括軽量化します。',
    category: 'file-utility',
    categoryLabel: '画像プライバシー',
    status: 'published',
    wave: 1,
    keywords: ['画像 EXIF 削除 ローカル', 'GPS 位置情報 消す', 'WebP 一括変換 ブラウザ'],
    iconKey: 'image',
  },
  {
    slug: 'pdf-redactor',
    name: 'PDF「真の墨消し（黒塗り）」＆メタデータ完全削除',
    shortTitle: 'PDF真の墨消し',
    titleSegments: ['PDF 真の墨消し', '（黒塗り）＆', 'メタデータ', '完全削除'],
    shortSummary: 'PDFを画像化して黒塗りを焼き付け、下層のテキスト抽出とメタデータを不能・消去します。',
    summary:
      '黒塗りの下にテキストデータが残る事故を防ぐため、ブラウザ上でラスタライズ焼付けを行い文字抽出を不能にし、Info/XMPメタデータも完全削除します。',
    category: 'file-utility',
    categoryLabel: 'ファイル実務',
    status: 'published',
    wave: 2,
    keywords: [
      'PDF 墨消し ブラウザ',
      'PDF 黒塗り 安全 ファイル送信なし',
      'PDF 黒塗り 文字 消す',
      'PDF メタデータ 削除 ブラウザ',
    ],
    iconKey: 'file-lock',
  },
  {
    slug: 'pdf-organizer',
    name: 'PDF 完全ローカル結合・分割・ページ並べ替え',
    shortTitle: 'PDFローカル結合・分割',
    titleSegments: ['PDFローカル', '結合・分割', '・並べ替え'],
    shortSummary: '社外秘PDFを外部へ送らず、ページの結合・分割・回転をブラウザ内で完結します。',
    summary:
      '社外秘資料を外部クラウドへ上げずに、ページ単位の分割・結合・回転・抽出をブラウザ内だけで完結します。',
    category: 'file-utility',
    categoryLabel: 'ファイル実務',
    status: 'planned',
    wave: 2,
    keywords: ['PDF 結合 サーバー送信なし', 'PDF 分割 ローカル'],
    iconKey: 'files',
  },
  {
    slug: 'ai-markdown-formatter',
    name: 'AI出力（Markdown・表）➔ Word / Excel / Slack 整形',
    shortTitle: 'AI Markdown整形',
    titleSegments: ['AI Markdown', '表・書式整形'],
    shortSummary: '生成AIの太字記号や表崩れを、チャットや社内文書向けの綺麗な書式へ変換します。',
    summary:
      '生成AI特有の太字記号や表崩れを、メール・Slack・社内ドキュメントへそのまま貼れる綺麗な書式へワンクリック変換します。',
    category: 'ai-security',
    categoryLabel: 'AI実務整形',
    status: 'published',
    wave: 2,
    keywords: [
      'ChatGPT コピペ 崩れ 直す',
      'Markdown 表 Excel 変換',
      'Markdown Word 貼り付け',
      'Markdown Slack mrkdwn 変換',
    ],
    iconKey: 'sparkles',
  },
  {
    slug: 'config-sanitizer',
    name: '.env / JSON / YAML / ログ 秘匿値サニタイズ＆変換',
    shortTitle: '設定ファイル秘匿化',
    titleSegments: ['.env・JSON・YAML', '・ログ秘匿化', '＆相互変換'],
    shortSummary: 'エラーログや設定ファイル内のトークン・パスワードを自動マスクして整形します。',
    summary:
      '.env・JSON・YAML・サーバーログに含まれるAPIキーやDB接続パスワード、Kubernetes Secretを構文を保ったままブラウザ内でマスクし、.env.example生成や形式変換を行います。',
    category: 'ai-security',
    categoryLabel: '開発セキュリティ',
    status: 'published',
    wave: 2,
    keywords: [
      '.env マスキング .env.example 生成',
      'YAML JSON 秘匿値 サニタイズ',
      'Kubernetes Secret マスク ブラウザ',
      'エラーログ トークン 削除 共有前',
    ],
    iconKey: 'braces',
  },
  {
    slug: 'jp-business-days',
    name: '日本の営業日・祝日・納期逆算シミュレーター',
    shortTitle: '営業日・納期計算',
    titleSegments: ['日本の営業日', '・納期逆算'],
    shortSummary: '日本の祝日・土日・独自休業日を考慮し、営業日や締切逆算を即時計算します。',
    summary:
      '日本の祝日・土日・独自休業日を考慮し、「N営業日後」「締切からN営業日前」を即時算出します。',
    category: 'daily-dev',
    categoryLabel: '業務計算',
    status: 'planned',
    wave: 3,
    keywords: ['営業日 計算 祝日対応', '納期 逆算 ツール'],
    iconKey: 'calendar',
  },
  {
    slug: 'regex-tester-jp',
    name: '日本語実務向け 正規表現ビジュアルテスター',
    shortTitle: '日本語正規表現テスター',
    titleSegments: ['日本語実務', '正規表現テスター'],
    shortSummary: 'インボイス番号・法人番号・郵便番号等のプリセット付きで正規表現を検証します。',
    summary:
      'インボイス番号・法人番号・郵便番号・全角半角などの実用プリセット付きで、安全にパターン一致を検証できます。',
    category: 'daily-dev',
    categoryLabel: '開発支援',
    status: 'planned',
    wave: 3,
    keywords: ['正規表現 テスト 日本語', 'インボイス番号 正規表現'],
    iconKey: 'regex',
  },
  {
    slug: 'text-cleaner',
    name: '文字数カウント・全角半角・機種依存文字クレンザー',
    shortTitle: '文字クレンザー',
    titleSegments: ['全角半角・', '機種依存文字', 'クレンザー'],
    shortSummary: 'ゼロ幅スペースや丸数字などシステム取込でエラーになりやすい文字を整形します。',
    summary:
      'ゼロ幅スペースや丸数字・旧字体など、システム取込でエラーになりやすい文字を一括検出・自動整形します。',
    category: 'daily-dev',
    categoryLabel: 'テキスト実務',
    status: 'planned',
    wave: 3,
    keywords: ['機種依存文字 チェック', 'ゼロ幅スペース 削除'],
    iconKey: 'type',
  },
  {
    slug: 'offline-qr-password',
    name: 'オフラインQRコード生成＆パスワード強度診断',
    shortTitle: 'オフラインQR・強度診断',
    titleSegments: ['オフラインQR', '＆強度診断'],
    shortSummary: '社内Wi-Fi情報やURLを外部送信せずQR生成し、パスワード強度を診断します。',
    summary:
      '社内Wi-Fi情報や限定URLを外部APIへ送らずSVG/PNG形式のQRコードを生成し、パスワードのエントロピーもローカル診断します。',
    category: 'daily-dev',
    categoryLabel: 'セキュリティ補助',
    status: 'planned',
    wave: 3,
    keywords: ['QRコード 作成 サーバー送信なし', 'パスワード 強度 チェック 安全'],
    iconKey: 'qr-code',
  },
]

export const PUBLISHED_TOOLS = TOOLS.filter((t) => t.status === 'published')
export const PLANNED_TOOLS = TOOLS.filter((t) => t.status === 'planned')

export function getToolBySlug(slug: string): ToolDefinition {
  const found = TOOLS.find((t) => t.slug === slug)
  if (!found) {
    throw new Error(`Unknown tool slug: ${slug}`)
  }
  return found
}

export function getRelatedPublishedTools(currentSlug: string): ToolDefinition[] {
  return PUBLISHED_TOOLS.filter((t) => t.slug !== currentSlug)
}
