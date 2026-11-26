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

export interface RestoreResult {
  restoredText: string
  restoredCount: number
  unresolvedTokens: string[]
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
  '客',
  '皆',
  '皆様',
  '担当',
  '担当者',
  'ご担当',
  'ご担当者',
  '関係',
  '関係者',
  '先方',
  '相手',
  '本人',
  '取引先',
  '顧客',
  '会員',
  '各位',
  'ユーザー',
  'クライアント',
  'スタッフ',
  'メンバー',
  '社員',
  '開発者',
  '誰',
  'どなた',
  '同',
  '仕',
  '模',
  '有',
  '態',
  '多',
  '一',
  '異',
  '左',
  '右',
  '文',
  '図',
  '貴',
  '神',
  '仏',
  '王',
  '殿',
  '姫',
  '何',
  '奥',
  '旦那',
  '主人',
  '子',
  '陰',
  '兄',
  '姉',
  '父',
  '母',
  '嬢',
  '坊',
  '苦労',
  '馳走',
  '愁傷',
  '世話',
  '家族',
  '弊社',
  '貴社',
  '御社',
  '当社',
  '自社',
  '他社',
  '各社',
  '営業',
  '開発',
  '人事',
  '総務',
  '経理',
  '企画',
  '広報',
  '法務',
  '財務',
  '管理',
  '制作',
  '技術',
  '販売',
  '事業',
  '統括',
  '副',
  '前',
  '現',
  '新',
  '元',
  '次期',
  '部長',
  '課長',
  '社長',
  '専務',
  '両',
  '諸',
  '彼',
  '源',
  '平',
  '本',
])

const ORG_PREFIX_RE =
  /(?:株式会社|有限会社|合同会社|合資会社|一般社団法人|公益社団法人|一般財団法人|公益財団法人|特定非営利活動法人|NPO法人)/gu
const ORG_HIRA_STOP_PREFIX_RE =
  /^(?:から|より|まで|にて|では|には|とは|への|での|との|など|について|に関して|です|ます|でした|ません|または|および|ならびに|もしくは|あるいは|という|といった|宛て?)/
const ORG_HIRA_STOP_PARTICLE_RE =
  /(?:から|より|まで|にて|では|には|とは|への|での|との|など|について|に関して|です|ます|でした|ません|または|および|ならびに|もしくは|あるいは|という|といった|宛て?)/
const ORG_NON_HIRA_BODY_RE =
  /^[A-Za-z0-9\p{Script=Han}\p{Script=Katakana}ー・々ヶ&._-]{1,24}/u
const ORG_HIRA_RUN_RE = /^[\p{Script=Hiragana}ー]{1,10}/u
const ORG_TRAILING_SINGLE_PARTICLE_RE = /[のはがをにへとでやも]$/
const ORG_CONTINUATION_SUFFIX_RE =
  /^(?:工務店|設計|製作所|製造所|研究所|総合研究所|総研|商店|商事|産業|工業|建設|不動産|運輸|物流|企画|開発|出版|印刷|薬局|医院|クリニック|銀行|証券|保険|電機|電子|食品|通信|放送|新聞|サービス|システム|ソフト|ソリューション|ソリューションズ|テクノロジー|テクノロジーズ|テック|ラボ|スタジオ|ワークス|グループ|センター|ハウス|ホーム|ホールディングス|メディア|デザイン|クラフト|ベース|フロンティア|ネット|クラウド)/
const ORG_SUFFIX_HIRA_RE =
  /(?<=^|[\s、。,.「『（(\[:：/／・のはがをにへとでやも])([\p{Script=Hiragana}ー]{2,8})([A-Za-z0-9\p{Script=Han}\p{Script=Katakana}ー・々ヶ&_-]{0,16})[ \u3000]?(?:株式会社|有限会社|合同会社|合資会社)/gu
const ORG_SUFFIX_NON_HIRA_RE =
  /[A-Za-z0-9\p{Script=Han}\p{Script=Katakana}ー・々ヶ&_-]{1,24}[ \u3000]?(?:株式会社|有限会社|合同会社|合資会社)/gu
const ORG_GENERIC_BODY_RE =
  /^(?:新規|既存|該当|対象|上記|下記|以下|弊社|貴社|御社|当社|自社|他社|各社|取引先|関連|子会社|親会社|グループ)$/
const ORG_HIRA_NON_ORG_PREFIX_RE =
  /(?:[のはがをにへとでやも]|から|より|まで|にて|など|これ|それ|あれ|この|その|あの|また|およ|なら)$/

const PERSON_PATTERN_RE =
  /(?<![A-Za-z0-9\p{Script=Han}\p{Script=Katakana}ー々ヶおご])(?:[\p{Script=Han}々ヶ]{1,5}(?:[ \t\u3000]?[\p{Script=Han}々ヶ]{1,5})?|[\p{Script=Katakana}ー]{2,10}(?:[ \t\u3000・][\p{Script=Katakana}ー]{2,10})?)(?:様(?![式子々相態変替])|さん|氏(?![名族神])|殿(?![堂下様])|部長|課長|社長|専務)/gu
const PERSON_HONORIFIC_RE = /(?:様|さん|氏|殿|部長|課長|社長|専務)$/
const PERSON_CORE_SUFFIX_STOP_RE =
  /(?:者|取引先|顧客|会員|各位|皆様|先方|相手|本人|担当|関係|家族|お客)$/
const PERSON_ROLE_PREFIX_STOP_RE =
  /(?:営業|開発|人事|総務|経理|企画|広報|法務|財務|管理|制作|技術|販売|事業|統括|本部|支店|支社|工場|店舗|弊社|貴社|御社|当社|自社|他社|各社|開発本|営業本|事業本|管理本|統括本)$/

const TOKEN_EXACT_RE = /^\[([A-Z0-9]+)_(\d+)\]$/
const UNRESOLVED_TOKEN_RE =
  /(?:\\\[(?:SECRET|EMAIL|TEL|ZIP|IP|CARD|ID12|ORG|PERSON|CUSTOM)\\?_\d+\\\]|\[(?:SECRET|EMAIL|TEL|ZIP|IP|CARD|ID12|ORG|PERSON|CUSTOM)\\?_\d+\]|［(?:SECRET|EMAIL|TEL|ZIP|IP|CARD|ID12|ORG|PERSON|CUSTOM)_\d+］)/g

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

function trimOrgSuffixDecorations(value: string, afterText = ''): string {
  let trimmed = value.replace(/(?:御中|様|殿)+$/, '').replace(/[._・-]+$/, '')
  if (
    trimmed.length >= 3 &&
    /(?:(?<![時空間人世])間|[側宛])$/.test(trimmed) &&
    (!afterText || /^[のはがをにへとでやも、。,.）)\s]/.test(afterText))
  ) {
    trimmed = trimmed.slice(0, -1).replace(/[._・-]+$/, '')
  }
  return trimmed
}

function collectOrganizationMatches(text: string): CandidateMatch[] {
  const matches: CandidateMatch[] = []
  let m: RegExpExecArray | null

  // 接頭型（例: 株式会社サンプル商事 / 株式会社はてな / 株式会社みずほ銀行）
  const prefixRe = new RegExp(ORG_PREFIX_RE.source, ORG_PREFIX_RE.flags)
  while ((m = prefixRe.exec(text)) !== null) {
    const pos = m.index + m[0].length
    const afterPrefix = text.slice(pos)
    const spaceMatch = afterPrefix.match(/^[ \u3000]/)
    const bodyStart = pos + (spaceMatch ? 1 : 0)
    const rest = text.slice(bodyStart)
    if (!rest) continue

    let body = ''
    const nonHira = rest.match(ORG_NON_HIRA_BODY_RE)
    if (nonHira) {
      body = trimOrgSuffixDecorations(nonHira[0], rest.slice(nonHira[0].length))
    } else if (/^[\p{Script=Hiragana}]/u.test(rest)) {
      if (ORG_HIRA_STOP_PREFIX_RE.test(rest)) continue
      if (/^[のはがをにへとでやも](?=$|[^\p{Script=Hiragana}])/u.test(rest)) {
        continue
      }
      const hiraMatch = rest.match(ORG_HIRA_RUN_RE)
      if (hiraMatch) {
        let hira = hiraMatch[0]
        let hitBoundary = false
        const stopIdx = hira.search(ORG_HIRA_STOP_PARTICLE_RE)
        if (stopIdx >= 0) {
          hira = hira.slice(0, stopIdx)
          hitBoundary = true
        }
        if (hira.length >= 2 && ORG_TRAILING_SINGLE_PARTICLE_RE.test(hira)) {
          const afterHira = rest.slice(hira.length)
          const keepsNoConnector =
            hira.endsWith('の') && ORG_CONTINUATION_SUFFIX_RE.test(afterHira)
          if (!keepsNoConnector) {
            hira = hira.slice(0, -1)
            hitBoundary = true
          }
        }
        if (!hitBoundary && hira.length > 0) {
          const afterHira = rest.slice(hira.length)
          const cont = afterHira.match(
            /^[A-Za-z0-9\p{Script=Han}\p{Script=Katakana}ー・々ヶ&._-]{1,16}/u
          )
          body = cont
            ? trimOrgSuffixDecorations(
                hira + cont[0],
                afterHira.slice(cont[0].length)
              )
            : hira
        } else {
          body = hira
        }
        if (/^[\p{Script=Hiragana}ー]+$/u.test(body) && body.length < 2) {
          body = ''
        }
      }
    }

    if (body.length >= 1) {
      const end = bodyStart + body.length
      matches.push({
        start: m.index,
        end,
        original: text.slice(m.index, end),
        category: 'organization',
        priority: 69,
      })
    }
  }

  // 接尾型（ひらがな始まり: みずほ銀行株式会社 / はてな株式会社）
  const suffixHiraRe = new RegExp(
    ORG_SUFFIX_HIRA_RE.source,
    ORG_SUFFIX_HIRA_RE.flags
  )
  while ((m = suffixHiraRe.exec(text)) !== null) {
    const matched = m[0]
    if (!matched) {
      suffixHiraRe.lastIndex += 1
      continue
    }
    const hiraLead = m[1] || ''
    if (
      ORG_HIRA_NON_ORG_PREFIX_RE.test(hiraLead) ||
      ORG_HIRA_STOP_PREFIX_RE.test(hiraLead)
    ) {
      continue
    }
    const body = matched
      .replace(/[ \u3000]?(?:株式会社|有限会社|合同会社|合資会社)$/, '')
      .trim()
    if (!body || ORG_GENERIC_BODY_RE.test(body)) continue
    matches.push({
      start: m.index,
      end: m.index + matched.length,
      original: matched,
      category: 'organization',
      priority: 68,
    })
  }

  // 接尾型（漢字・英数字・カタカナ始まり: サンプル商事株式会社）
  const suffixNonHiraRe = new RegExp(
    ORG_SUFFIX_NON_HIRA_RE.source,
    ORG_SUFFIX_NON_HIRA_RE.flags
  )
  while ((m = suffixNonHiraRe.exec(text)) !== null) {
    const matched = m[0]
    if (!matched) {
      suffixNonHiraRe.lastIndex += 1
      continue
    }
    const body = matched
      .replace(/[ \u3000]?(?:株式会社|有限会社|合同会社|合資会社)$/, '')
      .trim()
    if (!body || ORG_GENERIC_BODY_RE.test(body)) continue
    matches.push({
      start: m.index,
      end: m.index + matched.length,
      original: matched,
      category: 'organization',
      priority: 67,
    })
  }

  return matches
}

function isLikelyPersonNameMatch(matched: string): boolean {
  const honorific = matched.match(PERSON_HONORIFIC_RE)?.[0] || ''
  const core = matched.slice(0, matched.length - honorific.length).trim()
  if (!core || PERSON_STOPWORDS.has(core)) return false
  if (PERSON_CORE_SUFFIX_STOP_RE.test(core)) return false
  if (
    honorific === '様' &&
    (/(?:前回|従来|上記|下記|今回|毎年|例年|普段|通常|他)同$/.test(core) ||
      /(?:基本|詳細|外部|内部|設計|製品|要件|機能|標準|現行|新規|旧|新|別|特|本|各)仕$/.test(
        core
      ) ||
      /(?:花|縞|水玉|空|雨|雪|星|格子|迷彩|唐草)模$/.test(core))
  ) {
    return false
  }
  if (
    /^(?:部長|課長|社長|専務)$/.test(honorific) &&
    PERSON_ROLE_PREFIX_STOP_RE.test(core)
  ) {
    return false
  }
  return true
}

function normalizeToken(raw: string): string {
  return raw.replace(/［/g, '[').replace(/］/g, ']').replace(/\\/g, '')
}

function findUnresolvedTokens(text: string): string[] {
  if (!text) return []
  const found = new Set<string>()
  const re = new RegExp(UNRESOLVED_TOKEN_RE.source, UNRESOLVED_TOKEN_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    found.add(normalizeToken(m[0]))
  }
  return Array.from(found)
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
        /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
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

  // 9. 法人名パターン（日本語助詞境界・接頭/接尾対応）
  if (options.organization) {
    candidates.push(...collectOrganizationMatches(text))
  }

  // 10. 日本語氏名＋敬称パターン（助詞直後対応・誤爆ストップワード除外）
  if (options.personName) {
    candidates.push(
      ...collectPatternMatches(
        text,
        PERSON_PATTERN_RE,
        'personName',
        60,
        isLikelyPersonNameMatch
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

  // 既存辞書を引き継ぎつつ決定論的にトークン採番（元テキストに既存の仮名トークンがあれば衝突回避）
  const existingTokensInText = new Set(findUnresolvedTokens(text))
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
      let idx = nextIndexByCategory[match.category]
      let token = `[${TOKEN_PREFIX[match.category]}_${idx}]`
      while (existingTokensInText.has(token)) {
        idx += 1
        token = `[${TOKEN_PREFIX[match.category]}_${idx}]`
      }
      nextIndexByCategory[match.category] = idx + 1
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
): RestoreResult {
  if (!aiResponseText) {
    return {
      restoredText: aiResponseText,
      restoredCount: 0,
      unresolvedTokens: [],
    }
  }
  if (entries.length === 0) {
    return {
      restoredText: aiResponseText,
      restoredCount: 0,
      unresolvedTokens: findUnresolvedTokens(aiResponseText),
    }
  }

  const tokenToOriginal = new Map<string, string>()
  for (const entry of entries) {
    tokenToOriginal.set(entry.token, entry.original)
  }

  const tokens = Array.from(tokenToOriginal.keys()).sort(
    (a, b) => b.length - a.length
  )
  if (tokens.length === 0) {
    return {
      restoredText: aiResponseText,
      restoredCount: 0,
      unresolvedTokens: findUnresolvedTokens(aiResponseText),
    }
  }

  // 全角括弧やMarkdownエスケープ（\[PERSON\_1\]）がAI出力に含まれても復元できるようにする
  // 開閉括弧がペアでエスケープされた場合のみ先頭バックスラッシュを消費し、元文の単独バックスラッシュ（\[TOKEN_1]）は保護する
  const tokenPatterns = tokens.map((token) => {
    const exact = token.match(TOKEN_EXACT_RE)
    if (exact) {
      const [, prefix, num] = exact
      const escPrefix = escapeRegExp(prefix)
      return `(?:\\\\\\[${escPrefix}\\\\?_${num}\\\\\\]|\\[${escPrefix}\\\\?_${num}\\]|［${escPrefix}_${num}］)`
    }
    return escapeRegExp(token)
  })

  const pattern = new RegExp(tokenPatterns.join('|'), 'g')
  let restoredCount = 0
  const restoredText = aiResponseText.replace(pattern, (matched) => {
    const normalized = normalizeToken(matched)
    const original = tokenToOriginal.get(matched) ?? tokenToOriginal.get(normalized)
    if (original !== undefined) {
      restoredCount += 1
      return original
    }
    return matched
  })

  return {
    restoredText,
    restoredCount,
    unresolvedTokens: findUnresolvedTokens(restoredText),
  }
}
