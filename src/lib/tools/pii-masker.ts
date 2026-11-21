export type PiiCategory =
  | 'apiKey'
  | 'email'
  | 'phone'
  | 'postalCode'
  | 'ipv4'
  | 'creditCard'
  | 'myNumber'
  | 'organization'
  | 'personName'
  | 'custom'

export interface MaskOptions {
  apiKey: boolean
  email: boolean
  phone: boolean
  postalCode: boolean
  ipv4: boolean
  creditCard: boolean
  myNumber: boolean
  organization: boolean
  personName: boolean
  customTerms: string[]
}

export interface MaskEntry {
  token: string
  original: string
  category: PiiCategory
  count: number
}

export interface MaskResult {
  maskedText: string
  entries: MaskEntry[]
  totalReplacements: number
  countsByCategory: Record<PiiCategory, number>
}

export const DEFAULT_MASK_OPTIONS: MaskOptions = {
  apiKey: true,
  email: true,
  phone: true,
  postalCode: true,
  ipv4: true,
  creditCard: true,
  myNumber: true,
  organization: true,
  personName: true,
  customTerms: [],
}

const TOKEN_PREFIX: Record<PiiCategory, string> = {
  apiKey: 'SECRET',
  email: 'EMAIL',
  phone: 'TEL',
  postalCode: 'ZIP',
  ipv4: 'IP',
  creditCard: 'CARD',
  myNumber: 'ID12',
  organization: 'ORG',
  personName: 'PERSON',
  custom: 'CUSTOM',
}

const PERSON_STOPWORDS = new Set([
  'お客',
  'お客様',
  '皆様',
  '皆',
  '担当',
  'ご担当',
  '関係',
  '先方',
  '相手',
  '本人',
  'ユーザー',
  'クライアント',
  'スタッフ',
  'メンバー',
  '社員',
  '開発者',
  '誰',
  'どなた',
])

export function passesLuhnCheck(digitsOnly: string): boolean {
  if (!/^\d{13,19}$/.test(digitsOnly)) return false
  let sum = 0
  let doubleDigit = false
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = Number(digitsOnly[i])
    if (doubleDigit) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    doubleDigit = !doubleDigit
  }
  return sum % 10 === 0
}

interface CandidateMatch {
  start: number
  end: number
  original: string
  category: PiiCategory
  priority: number
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectPatternMatches(
  text: string,
  regex: RegExp,
  category: PiiCategory,
  priority: number,
  predicate?: (matched: string) => boolean
): CandidateMatch[] {
  const matches: CandidateMatch[] = []
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  const re = new RegExp(regex.source, flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const matched = m[0]
    if (!matched) {
      re.lastIndex += 1
      continue
    }
    if (!predicate || predicate(matched)) {
      matches.push({
        start: m.index,
        end: m.index + matched.length,
        original: matched,
        category,
        priority,
      })
    }
  }
  return matches
}

export function maskPiiText(
  text: string,
  options: MaskOptions = DEFAULT_MASK_OPTIONS,
  existingEntries: MaskEntry[] = []
): MaskResult {
  const countsByCategory: Record<PiiCategory, number> = {
    apiKey: 0,
    email: 0,
    phone: 0,
    postalCode: 0,
    ipv4: 0,
    creditCard: 0,
    myNumber: 0,
    organization: 0,
    personName: 0,
    custom: 0,
  }

  if (!text) {
    return {
      maskedText: '',
      entries: existingEntries.map((e) => ({ ...e, count: 0 })),
      totalReplacements: 0,
      countsByCategory,
    }
  }

  const candidates: CandidateMatch[] = []

  // 1. ユーザー任意カスタム辞書（最優先）
  const customTerms = Array.from(
    new Set(
      (options.customTerms || [])
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  ).sort((a, b) => b.length - a.length)

  for (const term of customTerms) {
    const re = new RegExp(escapeRegExp(term), 'g')
    candidates.push(...collectPatternMatches(text, re, 'custom', 100))
  }

  // 2. 秘密鍵・APIキー・トークン
  if (options.apiKey) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]+PRIVATE KEY-----/g,
        'apiKey',
        95
      ),
      ...collectPatternMatches(
        text,
        /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
        'apiKey',
        94
      ),
      ...collectPatternMatches(
        text,
        /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g,
        'apiKey',
        93
      ),
      ...collectPatternMatches(
        text,
        /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
        'apiKey',
        92
      )
    )
  }

  // 3. メールアドレス
  if (options.email) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
        'email',
        85
      )
    )
  }

  // 4. クレジットカード番号候補（Luhn検証付きで誤検知抑制）
  if (options.creditCard) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /(?<![0-9A-Za-z-])(?:\d{4}[-\s]?){3}\d{1,7}(?![0-9A-Za-z-])/g,
        'creditCard',
        82,
        (matched) => passesLuhnCheck(matched.replace(/[-\s]/g, ''))
      )
    )
  }

  // 5. 電話番号（国内固定・携帯・フリーダイヤル）
  if (options.phone) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /(?<![0-9A-Za-z-])(?:0\d{1,4}-\d{1,4}-\d{3,4}|\(0\d{1,4}\)\s?\d{1,4}-\d{3,4}|0[789]0\d{8}|0120\d{6}|0800\d{7})(?![0-9A-Za-z-])/g,
        'phone',
        80
      )
    )
  }

  // 6. 12桁番号候補（マイナンバー等）
  if (options.myNumber) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /(?<![0-9A-Za-z-])\d{4}[-\s]?\d{4}[-\s]?\d{4}(?![0-9A-Za-z-])/g,
        'myNumber',
        78
      )
    )
  }

  // 7. 郵便番号
  if (options.postalCode) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /(?<![0-9-])(?:〒\s*)?\d{3}-\d{4}(?![0-9-])/g,
        'postalCode',
        75
      )
    )
  }

  // 8. IPv4アドレス
  if (options.ipv4) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /(?<![0-9.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![0-9.])/g,
        'ipv4',
        72
      )
    )
  }

  // 9. 法人名パターン
  if (options.organization) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /(?:株式会社|有限会社|合同会社|合資会社|一般社団法人|特定非営利活動法人)[A-Za-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・]{1,24}|[A-Za-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・]{1,24}(?:株式会社|有限会社|合同会社)/gu,
        'organization',
        68
      )
    )
  }

  // 10. 日本語氏名＋敬称パターン（ストップワード除外）
  if (options.personName) {
    candidates.push(
      ...collectPatternMatches(
        text,
        /(?<![A-Za-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])([\p{Script=Han}\p{Script=Katakana}]{1,6}(?:\s?[\p{Script=Han}\p{Script=Katakana}]{1,6})?)(?:様|さん|氏|殿|部長|課長|社長|専務)/gu,
        'personName',
        60,
        (matched) => {
          const core = matched.replace(/(?:様|さん|氏|殿|部長|課長|社長|専務)$/, '').trim()
          return core.length >= 1 && !PERSON_STOPWORDS.has(core)
        }
      )
    )
  }

  // 優先度高・開始位置順・長い一致優先で非重複選択
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    if (a.start !== b.start) return a.start - b.start
    return b.end - b.start - (a.end - a.start)
  })

  const accepted: CandidateMatch[] = []
  for (const cand of candidates) {
    const overlaps = accepted.some(
      (ex) => !(cand.end <= ex.start || cand.start >= ex.end)
    )
    if (!overlaps) {
      accepted.push(cand)
    }
  }
  accepted.sort((a, b) => a.start - b.start)

  // 既存辞書を引き継ぎつつ決定論的にトークン採番
  const entriesMap = new Map<string, MaskEntry>()
  const nextIndexByCategory: Record<PiiCategory, number> = {
    apiKey: 1,
    email: 1,
    phone: 1,
    postalCode: 1,
    ipv4: 1,
    creditCard: 1,
    myNumber: 1,
    organization: 1,
    personName: 1,
    custom: 1,
  }

  for (const ex of existingEntries) {
    entriesMap.set(`${ex.category}::${ex.original}`, { ...ex, count: 0 })
    const matchNum = ex.token.match(/_(\d+)\]$/)
    if (matchNum) {
      nextIndexByCategory[ex.category] = Math.max(
        nextIndexByCategory[ex.category],
        Number(matchNum[1]) + 1
      )
    }
  }

  let cursor = 0
  const chunks: string[] = []
  let totalReplacements = 0

  for (const match of accepted) {
    chunks.push(text.slice(cursor, match.start))
    const key = `${match.category}::${match.original}`
    let entry = entriesMap.get(key)
    if (!entry) {
      const idx = nextIndexByCategory[match.category]++
      const token = `[${TOKEN_PREFIX[match.category]}_${idx}]`
      entry = {
        token,
        original: match.original,
        category: match.category,
        count: 0,
      }
      entriesMap.set(key, entry)
    }
    entry.count += 1
    countsByCategory[match.category] += 1
    totalReplacements += 1
    chunks.push(entry.token)
    cursor = match.end
  }
  chunks.push(text.slice(cursor))

  return {
    maskedText: chunks.join(''),
    entries: Array.from(entriesMap.values()),
    totalReplacements,
    countsByCategory,
  }
}

export function restoreMaskedText(
  aiResponseText: string,
  entries: MaskEntry[]
): { restoredText: string; restoredCount: number } {
  if (!aiResponseText || entries.length === 0) {
    return { restoredText: aiResponseText, restoredCount: 0 }
  }

  const tokenToOriginal = new Map<string, string>()
  for (const entry of entries) {
    tokenToOriginal.set(entry.token, entry.original)
  }

  const tokens = Array.from(tokenToOriginal.keys()).sort(
    (a, b) => b.length - a.length
  )
  if (tokens.length === 0) {
    return { restoredText: aiResponseText, restoredCount: 0 }
  }

  const pattern = new RegExp(tokens.map(escapeRegExp).join('|'), 'g')
  let restoredCount = 0
  const restoredText = aiResponseText.replace(pattern, (matched) => {
    const original = tokenToOriginal.get(matched)
    if (original !== undefined) {
      restoredCount += 1
      return original
    }
    return matched
  })

  return { restoredText, restoredCount }
}
