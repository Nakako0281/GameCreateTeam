import {
  isAlias,
  isMap,
  isPair,
  isScalar,
  isSeq,
  parseAllDocuments,
  Scalar,
  stringify as yamlStringify,
  type Document,
  type Node,
  type ParsedNode,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml'

export type InputFormat = 'auto' | 'env' | 'json' | 'yaml' | 'log'
export type DetectedFormat = 'env' | 'json' | 'jsonl' | 'yaml' | 'log'
export type OutputFormat = 'same' | 'env' | 'json' | 'yaml'
export type PlaceholderStyle = 'redacted' | 'example' | 'indexed'
export type SampleKind = 'env' | 'yaml' | 'json' | 'log'

export type FindingReason =
  | 'pem-key'
  | 'k8s-secret'
  | 'env-pair'
  | 'connection-url'
  | 'http-header'
  | 'query-secret'
  | 'secret-token'
  | 'secret-key'
  | 'custom-key'
  | 'high-entropy'
  | 'email'
  | 'ipv4'

export interface SanitizeOptions {
  inputFormat: InputFormat
  outputFormat: OutputFormat
  placeholderStyle: PlaceholderStyle
  exampleEmptyValue: boolean
  maskEmails: boolean
  maskIpv4: boolean
  maskHighEntropy: boolean
  protectPublicKeys: boolean
  customSecretKeys: string[]
  ignoreKeys: string[]
}

export const DEFAULT_SANITIZE_OPTIONS: SanitizeOptions = {
  inputFormat: 'auto',
  outputFormat: 'same',
  placeholderStyle: 'redacted',
  exampleEmptyValue: false,
  maskEmails: true,
  maskIpv4: false,
  maskHighEntropy: true,
  protectPublicKeys: true,
  customSecretKeys: [],
  ignoreKeys: [],
}

/**
 * 肩越し覗き見防止のため、生のシークレット文字列（original）は型・結果に一切保持しない。
 */
export interface SanitizeFinding {
  id: number
  reason: FindingReason
  location: string
  maskedPreview: string
  replacement: string
  count: number
}

export interface SanitizeResult {
  output: string
  detectedFormat: DetectedFormat
  effectiveOutputFormat: DetectedFormat
  usedJsoncFallback: boolean
  findings: SanitizeFinding[]
  totalMasked: number
  countsByReason: Record<FindingReason, number>
  error: string | null
  warning: string | null
  canConvert: boolean
}

export const MAX_INPUT_BYTES = 2 * 1024 * 1024 // 2 MB
export const MAX_INPUT_LINES = 50_000
export const MAX_OUTPUT_BYTES = 5 * 1024 * 1024 // 5 MB
export const MAX_DEPTH = 64
export const MAX_NODES = 50_000
export const MAX_YAML_DOCS = 50
export const MAX_YAML_ALIASES = 50
export const MAX_PEM_BLOCK_LEN = 32_768

export const REASON_LABELS: Record<FindingReason, string> = {
  'pem-key': '秘密鍵 (PEM)',
  'k8s-secret': 'K8s Secret',
  'env-pair': '配列Key-Value',
  'connection-url': 'URL資格情報',
  'http-header': 'HTTP認証/Cookie',
  'query-secret': 'URLクエリ秘匿値',
  'secret-token': 'API/クラウドトークン',
  'secret-key': '秘匿キー名',
  'custom-key': 'カスタム秘匿キー',
  'high-entropy': '高エントロピー文字列',
  email: 'メールアドレス',
  ipv4: 'IPv4アドレス',
}

export const SAMPLES: Record<
  SampleKind,
  { label: string; filename: string; content: string }
> = {
  env: {
    label: '.env（本番設定・PEM・変数参照）',
    filename: '.env.production',
    content: `# 本番環境設定サンプル（すべて架空の検証データです）
NODE_ENV=production
PORT=8080
LOG_LEVEL=info
NEXT_PUBLIC_APP_URL=https://app.example.com
NEXT_PUBLIC_STRIPE_KEY=pk_live_sample_public_key_2026

export API_KEY=demo_api_key_sample_99112233
DB_PASS="p@ss#word123" # クォート内の#は維持しコメントは保持
DATABASE_URL=postgres://appuser:p@ss:w/rd@db.internal:5432/appdb
REDIS_URL=redis://:redis_sample_pw_99@cache.internal:6379/0
TEMPLATE_DSN=postgres://\${DB_USER}:\${DB_PASS}@\${DB_HOST}:5432/app
JWT_SECRET=sample_jwt_signing_secret_value_2026
SLACK_WEBHOOK_URL=https://hooks.example.com/services/T00000/B00000/sample
PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0SAMPLEKEYDATA0000111122223333\\n-----END PRIVATE KEY-----"
`,
  },
  yaml: {
    label: 'YAML（K8s マルチドキュメント＋Secret）',
    filename: 'k8s-deployment.yaml',
    content: `# Kubernetes Deployment + Secret マルチドキュメント例
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: web
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "8080"
            - name: DB_PASSWORD
              value: k8s_demo_db_password_2026
---
apiVersion: v1
kind: Secret
metadata:
  name: api-runtime-secrets
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: '{"apiVersion":"v1","kind":"Secret","data":{"token":"c2FtcGxlX2s4c190b2tlbl8yMDI2"}}'
type: Opaque
data:
  app.conf: YXBpX2tleT1kZW1vX3NlY3JldF92YWx1ZV8yMDI2Cg==
stringData:
  tls.key: |
    -----BEGIN RSA PRIVATE KEY-----
    MIIEowIBAAKCAQEAsampleDemoKeyMaterialOnly000011112222
    -----END RSA PRIVATE KEY-----
`,
  },
  json: {
    label: 'JSON（設定・K8s env配列）',
    filename: 'appsettings.json',
    content: `{
  "app": {
    "env": "production",
    "port": 3000,
    "region": "ap-northeast-1",
    "timeoutMs": 5000
  },
  "stripe": {
    "publishableKey": "pk_live_sample_public_key_2026",
    "webhookSecret": "sample_webhook_signing_secret_98765"
  },
  "database": {
    "url": "postgresql://svc_user:s3cr3t@10.0.2.15:5432/orders?sslmode=require",
    "password": "json_db_password_2026"
  },
  "env": [
    { "name": "REDIS_PASSWORD", "value": "json_redis_secret_2026" },
    { "name": "LOG_LEVEL", "value": "warn" }
  ]
}`,
  },
  log: {
    label: 'ログ（JSONL＋HTTPヘッダ＋curl＋URL）',
    filename: 'incident-error.log',
    content: `{"ts":"2026-11-22T10:00:01Z","level":"info","requestId":"550e8400-e29b-41d4-a716-446655440000","commit":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2","authorization":"Bearer sample_bearer_access_token_2026"}
{"ts":"2026-11-22T10:00:02Z","level":"error","message":"Upstream call failed","url":"https://api.example.com/v1/export?api_key=demo_query_key_9988&X-Amz-Signature=abcdef0123456789fedcba","dbPassword":"log_inline_password_2026"}
2026-11-22T10:00:03Z WARN proxy-authorization: Basic dXNlcjpzYW1wbGVfcGFzc3dvcmQ=
2026-11-22T10:00:04Z DEBUG cookie: session_id=demo_session_cookie_val_7788; Path=/; HttpOnly; Secure
2026-11-22T10:00:05Z ERROR exec failed: curl -u deploy_bot:curl_demo_pw_123 https://registry.example.com/v2/
`,
  },
}

const PEM_LABELS = new Set([
  'PRIVATE KEY',
  'RSA PRIVATE KEY',
  'EC PRIVATE KEY',
  'DSA PRIVATE KEY',
  'OPENSSH PRIVATE KEY',
  'ENCRYPTED PRIVATE KEY',
  'PGP PRIVATE KEY BLOCK',
])

const PUBLIC_EXACT_KEYS = new Set([
  'node_env',
  'app_env',
  'rails_env',
  'flask_env',
  'env',
  'environment',
  'stage',
  'port',
  'app_port',
  'server_port',
  'host',
  'hostname',
  'app_host',
  'log_level',
  'tz',
  'lang',
  'locale',
  'region',
  'aws_region',
  'aws_default_region',
  'gcp_region',
  'azure_region',
  'public_key',
  'publishable_key',
  'stripe_publishable_key',
  'next_public_stripe_publishable_key',
  'primary_key',
  'foreign_key',
  'sort_key',
  'partition_key',
  'cache_key',
  'routing_key',
  'group_key',
  'idempotency_key',
  'key_name',
  'key_type',
  'key_id',
  'algorithm',
  'auth_mode',
  'token_type',
  'version',
  'app_version',
  'build_id',
  'commit_sha',
  'git_sha',
  'type',
  'kind',
  'apiversion',
  'name',
  'namespace',
  'replicas',
])

const PUBLIC_PREFIXES = [
  'next_public_',
  'vite_',
  'public_',
  'react_app_public_',
  'nuxt_public_',
]

const PUBLIC_SUFFIXES = [
  '_timeout',
  '_timeout_ms',
  '_enabled',
  '_disable',
  '_disabled',
  '_port',
  '_host',
  '_hostname',
  '_region',
  '_zone',
  '_mode',
  '_level',
  '_count',
  '_size',
  '_ttl',
  '_limit',
  '_length',
  '_expiry',
  '_expires_in',
  '_duration',
  '_interval',
  '_name',
  '_label',
  '_arn',
  '_prefix',
  '_suffix',
  '_path',
  '_dir',
  '_format',
  '_base_url',
  '_url_base',
]

const BOOLEAN_PREFIXES = ['is_', 'has_', 'enable_', 'use_', 'allow_', 'disable_']

const SECRET_EXACT_OR_TOKEN_RE =
  /(?:^|_)(?:password|passwd|passphrase|pass|pwd|pin|pin_code|passcode|otp|totp|secret|private_key|priv_key|signing_key|encryption_key|master_key|api_key|apikey|access_key|access_key_id|secret_key|auth_key|client_secret|webhook_secret|bearer_token|access_token|refresh_token|id_token|auth_token|api_token|jwt|jwt_secret|pat|token|credential|credentials|dsn|connection_string|connection_url|cookie|set_cookie|authorization|webhook_url|slack_webhook|discord_webhook|salt|hmac|tls_key|ssl_key)(?:_|$)/

const SENSITIVE_QUERY_PARAMS = new Set([
  'api_key',
  'apikey',
  'access_token',
  'accesstoken',
  'auth_token',
  'authtoken',
  'refresh_token',
  'id_token',
  'token',
  'secret',
  'client_secret',
  'password',
  'passwd',
  'pwd',
  'sig',
  'signature',
  'key',
  'auth',
  'session_id',
  'sessionid',
  'sas',
  'x-amz-signature',
  'x-amz-security-token',
  'x-amz-credential',
  'x-goog-signature',
  'x-goog-credential',
  'private_key',
])

const COOKIE_ATTRIBUTES = new Set([
  'path',
  'domain',
  'expires',
  'max-age',
  'samesite',
  'secure',
  'httponly',
  'partitioned',
  'priority',
])

const URL_SCHEME_RE =
  /((?:postgres|postgresql|mysql|mariadb|mongodb|mongodb\+srv|redis|rediss|amqp|amqps|https?|s?ftp|smtps?|ldaps?):\/\/)([^\s"'`<>\]})]+)/gi

const QUERY_PARAM_RE = /([?&])([A-Za-z0-9_.-]+)=([^&\s"'`<>#)]*)/g

const AUTH_HEADER_RE =
  /\b(authorization|proxy-authorization)\s*:\s*(bearer|basic|token|apikey|api-key|digest|aws4-hmac-sha256)\s+([^\r\n"'`,}]+)/gi

const SIMPLE_HEADER_RE =
  /\b(x-api-key|x-auth-token|x-access-token|x-functions-key|x-secret-key|api-key)\s*:\s*([^\s\r\n"';,}]+)/gi

const COOKIE_HEADER_RE = /\b(cookie|set-cookie)\s*:\s*([^\r\n"']+)/gi

const CURL_USER_RE =
  /(^|[\s;|&])(-u|--user)(\s+|=)(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s"'`\r\n]+))/g

const HIGH_CONFIDENCE_TOKEN_RE =
  /(?<![A-Za-z0-9_-])(?:eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|(?:sk-ant-|sk-proj-|sk-live-|sk-)[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9+/=_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{12,}|SG\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}|npm_[A-Za-z0-9]{20,}|pypi-[A-Za-z0-9_-]{20,}|https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+|https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+)(?![A-Za-z0-9_-])/g

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

const IPV4_RE =
  /(?<![0-9.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![0-9.])/g

const HIGH_ENTROPY_CANDIDATE_RE =
  /(?<![A-Za-z0-9_+./=-])([A-Za-z0-9_+-]{24,}={0,2})(?![A-Za-z0-9_+./=-])/g

function createEmptyCounts(): Record<FindingReason, number> {
  return {
    'pem-key': 0,
    'k8s-secret': 0,
    'env-pair': 0,
    'connection-url': 0,
    'http-header': 0,
    'query-secret': 0,
    'secret-token': 0,
    'secret-key': 0,
    'custom-key': 0,
    'high-entropy': 0,
    email: 0,
    ipv4: 0,
  }
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

export function validateRawInput(text: string): string | null {
  if (text.includes('\u0000')) {
    return 'NULバイトを含むバイナリファイルは処理できません。UTF-8テキストファイル（.env / .json / .yaml / .log）を指定してください。'
  }
  const bytes = utf8ByteLength(text)
  if (bytes > MAX_INPUT_BYTES) {
    return `入力サイズが上限（2MB）を超えています（現在 ${(bytes / (1024 * 1024)).toFixed(2)} MB）。分割して処理してください。`
  }
  let lineCount = 1
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lineCount += 1
      if (lineCount > MAX_INPUT_LINES) {
        return `入力行数が上限（${MAX_INPUT_LINES.toLocaleString()}行）を超えています。分割して処理してください。`
      }
    }
  }
  return null
}

export function createMaskedPreview(raw: string): string {
  const singleLine = raw.replace(/[\r\n\t]+/g, ' ').trim()
  if (singleLine.length <= 8) {
    return '••••••••'
  }
  if (singleLine.length <= 16) {
    return `${singleLine.slice(0, 2)}••••••`
  }
  return `${singleLine.slice(0, 3)}••••••${singleLine.slice(-2)}`
}

function normalizeKeyTokens(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function toEnvConstName(key: string): string {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  return normalized || 'SECRET'
}

export function isAlreadyPlaceholder(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (/^<(?:REDACTED|SECRET_\d+)>$/.test(trimmed)) return true
  if (/^YOUR_[A-Z0-9_]+$/.test(trimmed)) return true
  return false
}

export function isTemplateReferenceOnly(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^(?:\$\{[A-Za-z_][A-Za-z0-9_:-]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\{\{\s*[A-Za-z0-9_.-]+\s*\}\})$/.test(trimmed)) {
    return true
  }
  if (!trimmed.includes('${') && !trimmed.includes('{{')) return false
  const stripped = trimmed
    .replace(/\$\{[A-Za-z_][A-Za-z0-9_.:-]*\}/g, '')
    .replace(/\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/g, '')
  // テンプレート除去後にプロトコル/区切り/ホスト/ポート以外の英数字が残らなければ変数合成テンプレート
  return /^[a-zA-Z+.-]*:\/\/[:/@\d._-]*[a-zA-Z0-9._:-]*(?:\/[a-zA-Z0-9._/-]*)?(?:\?[A-Za-z0-9_=&.-]*)?$/.test(
    stripped
  ) || /^[:/@,._\s-]*$/.test(stripped)
}

function safeSetProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

function getSafeOwnKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj)
}

function getSafeOwnProp(obj: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined
  const desc = Object.getOwnPropertyDescriptor(obj, key)
  return desc ? desc.value : undefined
}

class FindingTracker {
  private readonly options: SanitizeOptions
  private readonly customKeySet: Set<string>
  private readonly ignoreKeySet: Set<string>
  private readonly secretToIndex = new Map<string, string>()
  private readonly findingsMap = new Map<string, SanitizeFinding>()
  private readonly counts = createEmptyCounts()
  private nextSecretId = 1
  private nextFindingId = 1
  private totalMasked = 0

  constructor(options: SanitizeOptions) {
    this.options = options
    this.customKeySet = new Set(
      options.customSecretKeys.map((k) => k.trim().toLowerCase()).filter(Boolean)
    )
    this.ignoreKeySet = new Set(
      options.ignoreKeys.map((k) => k.trim().toLowerCase()).filter(Boolean)
    )
  }

  isIgnoredKey(keyName: string, fullPath = ''): boolean {
    if (!keyName && !fullPath) return false
    const leaf = keyName.trim().toLowerCase()
    const pathLower = fullPath.trim().toLowerCase()
    const leafNorm = normalizeKeyTokens(keyName)
    return (
      this.ignoreKeySet.has(leaf) ||
      this.ignoreKeySet.has(leafNorm) ||
      (pathLower !== '' && this.ignoreKeySet.has(pathLower))
    )
  }

  isCustomKey(keyName: string, fullPath = ''): boolean {
    if (!keyName && !fullPath) return false
    const leaf = keyName.trim().toLowerCase()
    const pathLower = fullPath.trim().toLowerCase()
    const leafNorm = normalizeKeyTokens(keyName)
    return (
      this.customKeySet.has(leaf) ||
      this.customKeySet.has(leafNorm) ||
      (pathLower !== '' && this.customKeySet.has(pathLower))
    )
  }

  classifyKey(
    keyName: string,
    fullPath = ''
  ): 'ignore' | 'custom-key' | 'secret-key' | 'public' | 'neutral' {
    if (this.isIgnoredKey(keyName, fullPath)) return 'ignore'
    if (this.isCustomKey(keyName, fullPath)) return 'custom-key'

    const norm = normalizeKeyTokens(keyName)
    if (!norm) return 'neutral'

    if (this.options.protectPublicKeys) {
      if (PUBLIC_EXACT_KEYS.has(norm)) return 'public'
      if (PUBLIC_PREFIXES.some((p) => norm.startsWith(p))) return 'public'
      if (PUBLIC_SUFFIXES.some((s) => norm.endsWith(s))) return 'public'
      if (BOOLEAN_PREFIXES.some((p) => norm.startsWith(p))) return 'public'
      if (
        (norm.endsWith('_url') || norm.endsWith('_uri') || norm.endsWith('_endpoint')) &&
        !norm.includes('webhook') &&
        !norm.includes('connection') &&
        !norm.includes('database') &&
        !norm.includes('postgres') &&
        !norm.includes('redis') &&
        !norm.includes('mongo')
      ) {
        return 'public'
      }
    }

    if (SECRET_EXACT_OR_TOKEN_RE.test(norm)) {
      return 'secret-key'
    }

    return 'neutral'
  }

  allocateReplacement(raw: string, hintKey?: string): string {
    if (this.options.placeholderStyle === 'example') {
      if (this.options.exampleEmptyValue) {
        return ''
      }
      if (hintKey) {
        return `YOUR_${toEnvConstName(hintKey)}`
      }
      return 'YOUR_SECRET'
    }
    if (this.options.placeholderStyle === 'indexed') {
      let existing = this.secretToIndex.get(raw)
      if (!existing) {
        existing = `<SECRET_${this.nextSecretId++}>`
        this.secretToIndex.set(raw, existing)
      }
      return existing
    }
    return '<REDACTED>'
  }

  record(
    raw: string,
    reason: FindingReason,
    location: string,
    hintKey?: string
  ): string {
    const replacement = this.allocateReplacement(raw, hintKey)
    const maskedPreview = createMaskedPreview(raw)
    const mapKey = `${reason}::${location}::${replacement}::${maskedPreview}`
    const existing = this.findingsMap.get(mapKey)
    if (existing) {
      existing.count += 1
    } else {
      this.findingsMap.set(mapKey, {
        id: this.nextFindingId++,
        reason,
        location,
        maskedPreview,
        replacement: replacement === '' ? '(空値)' : replacement,
        count: 1,
      })
    }
    this.counts[reason] += 1
    this.totalMasked += 1
    return replacement
  }

  getSummary(): {
    findings: SanitizeFinding[]
    totalMasked: number
    countsByReason: Record<FindingReason, number>
  } {
    return {
      findings: Array.from(this.findingsMap.values()),
      totalMasked: this.totalMasked,
      countsByReason: { ...this.counts },
    }
  }
}

/**
 * 終端欠落・1行エスケープ・複数行を含むPEM秘密鍵を線形時間 O(n) で置換する
 */
function replacePemBlocks(
  text: string,
  tracker: FindingTracker,
  location: string,
  hintKey?: string
): string {
  const BEGIN_PREFIX = '-----BEGIN '
  let cursor = 0
  let out = ''

  while (cursor < text.length) {
    const idx = text.indexOf(BEGIN_PREFIX, cursor)
    if (idx === -1) {
      out += text.slice(cursor)
      break
    }

    const headerSearchEnd = Math.min(text.length, idx + 80)
    const headerEnd = text.indexOf('-----', idx + BEGIN_PREFIX.length)
    if (headerEnd === -1 || headerEnd > headerSearchEnd) {
      out += text.slice(cursor, idx + BEGIN_PREFIX.length)
      cursor = idx + BEGIN_PREFIX.length
      continue
    }

    const label = text.slice(idx + BEGIN_PREFIX.length, headerEnd)
    if (!PEM_LABELS.has(label)) {
      out += text.slice(cursor, headerEnd + 5)
      cursor = headerEnd + 5
      continue
    }

    out += text.slice(cursor, idx)
    const bodyStart = headerEnd + 5
    const endMarker = `-----END ${label}-----`
    const nextBegin = text.indexOf(BEGIN_PREFIX, bodyStart)
    const endIdx = text.indexOf(endMarker, bodyStart)

    let blockEnd = -1
    if (
      endIdx !== -1 &&
      endIdx - idx <= MAX_PEM_BLOCK_LEN &&
      (nextBegin === -1 || endIdx < nextBegin)
    ) {
      blockEnd = endIdx + endMarker.length
    } else {
      // 終端が途切れた不完全PEM（ログ切り詰め等）を線形走査で安全終端まで隔離
      const limit = Math.min(
        text.length,
        idx + MAX_PEM_BLOCK_LEN,
        nextBegin !== -1 ? nextBegin : text.length
      )
      const isEscapedSingleLine =
        text.slice(bodyStart, Math.min(limit, bodyStart + 64)).includes('\\n') &&
        !text.slice(bodyStart, Math.min(limit, bodyStart + 64)).includes('\n')

      let pos = bodyStart
      if (isEscapedSingleLine) {
        while (pos < limit) {
          const ch = text[pos]
          if (ch === '"' || ch === "'" || ch === '\n' || ch === '\r') {
            break
          }
          pos += 1
        }
      } else {
        while (pos < limit) {
          const ch = text[pos]
          if (ch === '"' || ch === "'") break
          if (
            ch === '\n' &&
            pos + 1 < limit &&
            (text[pos + 1] === '\n' || text[pos + 1] === '\r')
          ) {
            break
          }
          pos += 1
        }
      }
      blockEnd = Math.max(bodyStart, pos)
    }

    const rawPem = text.slice(idx, blockEnd)
    const rep = tracker.record(rawPem, 'pem-key', location, hintKey || 'PRIVATE_KEY')
    out += rep
    cursor = blockEnd
  }

  return out
}

function isHostnamePortBeforeSlash(segment: string): boolean {
  return /^[A-Za-z0-9.-]+:\d+$/.test(segment)
}

function looksLikeHostAuthorityTail(tail: string): boolean {
  return /^(?:[A-Za-z0-9._-]+|\[[0-9a-fA-F:]+\])(?::\d+)?(?:\/|$|\?|#)/.test(tail)
}

function maskConnectionUrls(
  text: string,
  tracker: FindingTracker,
  location: string,
  hintKey?: string
): string {
  URL_SCHEME_RE.lastIndex = 0
  return text.replace(URL_SCHEME_RE, (fullMatch, scheme: string, rest: string) => {
    const queryIdx = rest.search(/[?#]/)
    const preQuery = queryIdx >= 0 ? rest.slice(0, queryIdx) : rest
    const querySuffix = queryIdx >= 0 ? rest.slice(queryIdx) : ''

    const firstSlash = preQuery.indexOf('/')
    const firstAt = preQuery.indexOf('@')
    if (firstAt === -1) return fullMatch

    const beforeFirstSlash =
      firstSlash >= 0 ? preQuery.slice(0, firstSlash) : preQuery
    const hasAtBeforeSlash = firstAt < (firstSlash >= 0 ? firstSlash : preQuery.length)
    const hasColonBeforeSlash =
      beforeFirstSlash.includes(':') && !isHostnamePortBeforeSlash(beforeFirstSlash)

    if (!hasAtBeforeSlash && !hasColonBeforeSlash) {
      return fullMatch
    }

    const lastAt = preQuery.lastIndexOf('@')
    if (lastAt <= 0) return fullMatch

    const userinfo = preQuery.slice(0, lastAt)
    const hostAndPath = preQuery.slice(lastAt + 1)
    if (!looksLikeHostAuthorityTail(hostAndPath)) {
      return fullMatch
    }

    const colonIdx = userinfo.indexOf(':')
    if (colonIdx >= 0) {
      const user = userinfo.slice(0, colonIdx)
      const pass = userinfo.slice(colonIdx + 1)
      if (!pass || isAlreadyPlaceholder(pass) || isTemplateReferenceOnly(pass)) {
        return fullMatch
      }
      const rep = tracker.record(
        pass,
        'connection-url',
        location,
        hintKey ? `${hintKey}_PASSWORD` : 'DB_PASSWORD'
      )
      return `${scheme}${user}:${rep}@${hostAndPath}${querySuffix}`
    }

    if (isAlreadyPlaceholder(userinfo) || isTemplateReferenceOnly(userinfo)) {
      return fullMatch
    }
    const rep = tracker.record(
      userinfo,
      'connection-url',
      location,
      hintKey ? `${hintKey}_TOKEN` : 'URL_TOKEN'
    )
    return `${scheme}${rep}@${hostAndPath}${querySuffix}`
  })
}

function maskHttpHeadersAndCurl(
  text: string,
  tracker: FindingTracker,
  location: string,
  hintKey?: string
): string {
  let out = text

  AUTH_HEADER_RE.lastIndex = 0
  out = out.replace(
    AUTH_HEADER_RE,
    (full, headerName: string, scheme: string, secretVal: string) => {
      const trimmed = secretVal.trim()
      if (!trimmed || isAlreadyPlaceholder(trimmed) || isTemplateReferenceOnly(trimmed)) {
        return full
      }
      const rep = tracker.record(
        trimmed,
        'http-header',
        location,
        hintKey || headerName
      )
      return `${headerName}: ${scheme} ${rep}`
    }
  )

  SIMPLE_HEADER_RE.lastIndex = 0
  out = out.replace(
    SIMPLE_HEADER_RE,
    (full, headerName: string, secretVal: string) => {
      const trimmed = secretVal.trim()
      if (!trimmed || isAlreadyPlaceholder(trimmed) || isTemplateReferenceOnly(trimmed)) {
        return full
      }
      const rep = tracker.record(
        trimmed,
        'http-header',
        location,
        hintKey || headerName
      )
      return `${headerName}: ${rep}`
    }
  )

  COOKIE_HEADER_RE.lastIndex = 0
  out = out.replace(
    COOKIE_HEADER_RE,
    (_full, headerName: string, cookieBody: string) => {
      const maskedParts = cookieBody.split(';').map((part) => {
        const eqIdx = part.indexOf('=')
        if (eqIdx < 0) return part
        const rawKey = part.slice(0, eqIdx)
        const keyTrimmed = rawKey.trim().toLowerCase()
        const rawVal = part.slice(eqIdx + 1)
        const valTrimmed = rawVal.trim()
        if (
          COOKIE_ATTRIBUTES.has(keyTrimmed) ||
          !valTrimmed ||
          isAlreadyPlaceholder(valTrimmed) ||
          isTemplateReferenceOnly(valTrimmed)
        ) {
          return part
        }
        const rep = tracker.record(
          valTrimmed,
          'http-header',
          location,
          rawKey.trim() || 'COOKIE'
        )
        return `${rawKey}=${rep}`
      })
      return `${headerName}: ${maskedParts.join(';')}`
    }
  )

  CURL_USER_RE.lastIndex = 0
  out = out.replace(
    CURL_USER_RE,
    (
      full,
      lead: string,
      flag: string,
      sep: string,
      dqVal: string | undefined,
      sqVal: string | undefined,
      bareVal: string | undefined
    ) => {
      const quote = dqVal !== undefined ? '"' : sqVal !== undefined ? "'" : ''
      const val = dqVal ?? sqVal ?? bareVal ?? ''
      if (!val || isAlreadyPlaceholder(val) || isTemplateReferenceOnly(val)) {
        return full
      }
      const colonIdx = val.indexOf(':')
      if (colonIdx >= 0) {
        const user = val.slice(0, colonIdx)
        const pass = val.slice(colonIdx + 1)
        if (!pass || isAlreadyPlaceholder(pass) || isTemplateReferenceOnly(pass)) {
          return full
        }
        const rep = tracker.record(pass, 'http-header', location, 'CURL_PASSWORD')
        return `${lead}${flag}${sep}${quote}${user}:${rep}${quote}`
      }
      const rep = tracker.record(val, 'http-header', location, 'CURL_AUTH')
      return `${lead}${flag}${sep}${quote}${rep}${quote}`
    }
  )

  return out
}

function maskQuerySecrets(
  text: string,
  tracker: FindingTracker,
  location: string
): string {
  QUERY_PARAM_RE.lastIndex = 0
  return text.replace(
    QUERY_PARAM_RE,
    (full, prefix: string, paramName: string, paramValue: string) => {
      if (!SENSITIVE_QUERY_PARAMS.has(paramName.toLowerCase())) {
        return full
      }
      if (
        !paramValue ||
        isAlreadyPlaceholder(paramValue) ||
        isTemplateReferenceOnly(paramValue)
      ) {
        return full
      }
      const rep = tracker.record(paramValue, 'query-secret', location, paramName)
      return `${prefix}${paramName}=${rep}`
    }
  )
}

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>()
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  let entropy = 0
  for (const c of counts.values()) {
    const p = c / value.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

function isLikelyBenignHighEntropy(token: string): boolean {
  if (/^(?:pk_live_|pk_test_)/.test(token)) return true
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
  ) {
    return true
  }
  if (/^[0-9a-f]{32,128}$/i.test(token)) return true
  if (/^\d{4}-\d{2}-\d{2}/.test(token)) return true
  if (/^sha(?:256|384|512)[-_:]?[0-9a-f]+$/i.test(token)) return true
  if (/^(?:https?|localhost|production|development)/i.test(token)) return true
  return false
}

function countCharClasses(token: string): number {
  let classes = 0
  if (/[a-z]/.test(token)) classes += 1
  if (/[A-Z]/.test(token)) classes += 1
  if (/\d/.test(token)) classes += 1
  if (/[_+/=-]/.test(token)) classes += 1
  return classes
}

function isPrecededByUrlUserinfoContext(text: string, matchStart: number): boolean {
  const lineStart = text.lastIndexOf('\n', matchStart - 1) + 1
  const prefix = text.slice(lineStart, matchStart)
  return /:\/\/(?:[^\s/]*:)?$/.test(prefix)
}

function sanitizeStringValue(
  text: string,
  tracker: FindingTracker,
  options: SanitizeOptions,
  location: string,
  hintKey?: string
): string {
  if (!text || isAlreadyPlaceholder(text) || isTemplateReferenceOnly(text)) {
    return text
  }

  let out = replacePemBlocks(text, tracker, location, hintKey)
  out = maskConnectionUrls(out, tracker, location, hintKey)
  out = maskHttpHeadersAndCurl(out, tracker, location, hintKey)
  out = maskQuerySecrets(out, tracker, location)

  HIGH_CONFIDENCE_TOKEN_RE.lastIndex = 0
  out = out.replace(HIGH_CONFIDENCE_TOKEN_RE, (matched) => {
    return tracker.record(matched, 'secret-token', location, hintKey)
  })

  if (options.maskEmails) {
    EMAIL_RE.lastIndex = 0
    out = out.replace(EMAIL_RE, (matched, offset: number, fullStr: string) => {
      if (isPrecededByUrlUserinfoContext(fullStr, offset)) {
        return matched
      }
      return tracker.record(matched, 'email', location, hintKey || 'EMAIL')
    })
  }

  if (options.maskIpv4) {
    IPV4_RE.lastIndex = 0
    out = out.replace(IPV4_RE, (matched) => {
      if (
        matched === '127.0.0.1' ||
        matched === '0.0.0.0' ||
        matched === '255.255.255.255'
      ) {
        return matched
      }
      return tracker.record(matched, 'ipv4', location, hintKey || 'IP_ADDR')
    })
  }

  if (options.maskHighEntropy) {
    HIGH_ENTROPY_CANDIDATE_RE.lastIndex = 0
    out = out.replace(HIGH_ENTROPY_CANDIDATE_RE, (matched, _g, offset: number, fullStr: string) => {
      if (matched.startsWith('YOUR_') || isAlreadyPlaceholder(matched)) {
        return matched
      }
      if (offset > 0 && fullStr[offset - 1] === '<') {
        return matched
      }
      if (isLikelyBenignHighEntropy(matched)) {
        return matched
      }
      if (countCharClasses(matched) < 3) {
        return matched
      }
      if (shannonEntropy(matched) < 4.2) {
        return matched
      }
      return tracker.record(matched, 'high-entropy', location, hintKey)
    })
  }

  return out
}

function shouldMaskWholeValueAsSecret(
  valueStr: string,
  keyKind: 'ignore' | 'custom-key' | 'secret-key' | 'public' | 'neutral',
  tracker: FindingTracker,
  options: SanitizeOptions,
  location: string,
  hintKey: string
): { handled: boolean; result: string } {
  const trimmed = valueStr.trim()
  if (!trimmed || isAlreadyPlaceholder(trimmed) || isTemplateReferenceOnly(trimmed)) {
    return { handled: true, result: valueStr }
  }

  if (keyKind === 'ignore') {
    return { handled: true, result: valueStr }
  }

  if (keyKind === 'custom-key' || keyKind === 'secret-key') {
    // 接続URLやK8s/PEM等の構造を保った方がデバッグに有用な場合は部分マスクを優先
    URL_SCHEME_RE.lastIndex = 0
    if (URL_SCHEME_RE.test(trimmed)) {
      const before = tracker.getSummary().totalMasked
      const maskedUrl = sanitizeStringValue(
        valueStr,
        tracker,
        options,
        location,
        hintKey
      )
      if (tracker.getSummary().totalMasked > before) {
        return { handled: true, result: maskedUrl }
      }
    }

    if (trimmed.includes('-----BEGIN ')) {
      const before = tracker.getSummary().totalMasked
      const maskedPem = replacePemBlocks(valueStr, tracker, location, hintKey)
      if (tracker.getSummary().totalMasked > before) {
        return { handled: true, result: maskedPem }
      }
    }

    const reason: FindingReason =
      keyKind === 'custom-key' ? 'custom-key' : 'secret-key'
    const rep = tracker.record(trimmed, reason, location, hintKey)
    return { handled: true, result: rep }
  }

  return { handled: false, result: valueStr }
}

/**
 * JSONC (//・/* *\/ コメント、末尾カンマ) を文字列リテラル外でのみ安全除去する
 */
function stripJsoncCommentsAndTrailingCommas(source: string): string {
  let noComments = ''
  let inString = false
  let escaped = false
  let i = 0

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (inString) {
      noComments += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      i += 1
      continue
    }

    if (ch === '"') {
      inString = true
      noComments += ch
      i += 1
      continue
    }

    if (ch === '/' && next === '/') {
      i += 2
      while (i < source.length && source[i] !== '\n') {
        i += 1
      }
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (
        i < source.length &&
        !(source[i] === '*' && source[i + 1] === '/')
      ) {
        i += 1
      }
      i = Math.min(source.length, i + 2)
      continue
    }

    noComments += ch
    i += 1
  }

  // 文字列リテラル外の末尾カンマを除去
  let result = ''
  inString = false
  escaped = false
  for (let idx = 0; idx < noComments.length; idx++) {
    const ch = noComments[idx]
    if (inString) {
      result += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
      continue
    }
    if (ch === ',') {
      let look = idx + 1
      while (look < noComments.length && /\s/.test(noComments[look])) {
        look += 1
      }
      if (noComments[look] === '}' || noComments[look] === ']') {
        continue
      }
    }
    result += ch
  }

  return result
}

function tryParseJson(source: string): {
  ok: boolean
  value: unknown
  usedJsonc: boolean
} {
  try {
    const parsed = JSON.parse(source)
    if (parsed !== null && typeof parsed === 'object') {
      return { ok: true, value: parsed, usedJsonc: false }
    }
  } catch {
    // fallback to JSONC
  }
  try {
    const stripped = stripJsoncCommentsAndTrailingCommas(source)
    const parsed = JSON.parse(stripped)
    if (parsed !== null && typeof parsed === 'object') {
      return { ok: true, value: parsed, usedJsonc: true }
    }
  } catch {
    // ignore
  }
  return { ok: false, value: null, usedJsonc: false }
}

function looksLikeJsonl(source: string): boolean {
  const lines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) return false
  let jsonLineCount = 0
  for (const line of lines.slice(0, 100)) {
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          jsonLineCount += 1
        }
      } catch {
        // non-JSON line allowed in mixed logs
      }
    }
  }
  return jsonLineCount >= 2 && jsonLineCount * 2 >= Math.min(lines.length, 100)
}

function looksLikeEnv(source: string): boolean {
  if (/^\s*---(?:\s|$)/m.test(source)) return false
  const entries = parseEnvEntries(source)
  let kvLines = 0
  let rawLines = 0
  for (const entry of entries) {
    if (entry.kind === 'kv') {
      kvLines += 1
    } else if (entry.kind === 'raw') {
      if (/^[A-Za-z0-9._-]+\s*:\s+/.test(entry.rawLine.trim())) {
        return false
      }
      rawLines += 1
    }
  }
  return kvLines >= 1 && kvLines >= rawLines
}

function tryParseYamlDocuments(source: string): {
  ok: boolean
  docs: Document.Parsed[]
  errorMsg: string | null
  resourceExhausted?: boolean
} {
  try {
    const docs = parseAllDocuments(source, {
      schema: 'core',
      strict: true,
      prettyErrors: true,
    })
    if (docs.length === 0 || ('empty' in docs && docs.empty)) {
      return { ok: false, docs: [], errorMsg: 'YAMLドキュメントが空です。' }
    }
    if (docs.length > MAX_YAML_DOCS) {
      return {
        ok: false,
        docs: [],
        errorMsg: `YAMLドキュメント数が上限（${MAX_YAML_DOCS}件）を超えています。`,
        resourceExhausted: true,
      }
    }
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      if (doc.errors.length > 0) {
        const first = doc.errors[0]
        const pos = first.linePos?.[0]
        const loc = pos ? `（${pos.line}行目 ${pos.col}列目付近）` : ''
        return {
          ok: false,
          docs: [],
          errorMsg: `YAML構文エラー${loc}: ${first.code}`,
        }
      }
      // Billion Laughs / Alias Bomb を YAML->YAML 含め全パスで事前遮断
      doc.toJS({ maxAliasCount: MAX_YAML_ALIASES, mapAsMap: true })
    }
    return { ok: true, docs, errorMsg: null }
  } catch (err) {
    const isAliasAttack = err instanceof Error && /alias/i.test(err.message)
    const message = isAliasAttack
      ? `YAMLエイリアス展開が安全上限（${MAX_YAML_ALIASES}）を超えたため処理を中断しました。`
      : 'YAMLの解析中にエラーが発生しました。'
    return {
      ok: false,
      docs: [],
      errorMsg: message,
      resourceExhausted: isAliasAttack,
    }
  }
}

export function detectFormat(source: string): {
  format: DetectedFormat
  usedJsonc: boolean
  error?: string
} {
  const trimmed = source.trim()
  if (!trimmed) return { format: 'log', usedJsonc: false }

  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('/*') || trimmed.startsWith('//')) {
    const jsonCheck = tryParseJson(trimmed)
    if (jsonCheck.ok) {
      return { format: 'json', usedJsonc: jsonCheck.usedJsonc }
    }
  }

  if (looksLikeJsonl(trimmed)) {
    return { format: 'jsonl', usedJsonc: false }
  }

  if (looksLikeEnv(trimmed)) {
    return { format: 'env', usedJsonc: false }
  }

  const yamlCheck = tryParseYamlDocuments(trimmed)
  if (yamlCheck.resourceExhausted && yamlCheck.errorMsg) {
    return { format: 'yaml', usedJsonc: false, error: yamlCheck.errorMsg }
  }
  if (yamlCheck.ok) {
    const hasStructuredDoc = yamlCheck.docs.some(
      (doc) => isMap(doc.contents) || isSeq(doc.contents)
    )
    if (hasStructuredDoc) {
      return { format: 'yaml', usedJsonc: false }
    }
  }

  return { format: 'log', usedJsonc: false }
}

interface EnvEntry {
  kind: 'blank' | 'comment' | 'kv' | 'raw'
  rawLine: string
  prefix?: string
  key?: string
  quote?: 'none' | 'double' | 'single'
  value?: string
  inlineComment?: string
}

function parseEnvEntries(source: string): EnvEntry[] {
  const lines = source.split(/\r?\n/)
  const entries: EnvEntry[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      entries.push({ kind: 'blank', rawLine: line })
      i += 1
      continue
    }
    if (trimmed.startsWith('#')) {
      entries.push({ kind: 'comment', rawLine: line })
      i += 1
      continue
    }

    const kvMatch = line.match(
      /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)(.*)$/
    )
    if (!kvMatch) {
      entries.push({ kind: 'raw', rawLine: line })
      i += 1
      continue
    }

    const [, leadPrefix, key, eqPart, rest] = kvMatch
    const firstNonSpace = rest.trimStart()

    if (firstNonSpace.startsWith('"') || firstNonSpace.startsWith("'")) {
      const quoteChar = firstNonSpace[0] as '"' | "'"
      const quoteKind = quoteChar === '"' ? 'double' : 'single'
      let buffer = firstNonSpace.slice(1)
      let val = ''
      let closed = false
      let inlineComment = ''

      const scanQuoted = (chunk: string): { done: boolean; after: string } => {
        let escaped = false
        for (let pos = 0; pos < chunk.length; pos++) {
          const ch = chunk[pos]
          if (quoteKind === 'double') {
            if (escaped) {
              val += '\\' + ch
              escaped = false
              continue
            }
            if (ch === '\\') {
              escaped = true
              continue
            }
          }
          if (ch === quoteChar) {
            return { done: true, after: chunk.slice(pos + 1) }
          }
          val += ch
        }
        if (escaped) {
          val += '\\'
        }
        return { done: false, after: '' }
      }

      const firstScan = scanQuoted(buffer)
      if (firstScan.done) {
        closed = true
        inlineComment = firstScan.after
      } else {
        while (!closed && i + 1 < lines.length) {
          i += 1
          val += '\n'
          const nextScan = scanQuoted(lines[i])
          if (nextScan.done) {
            closed = true
            inlineComment = nextScan.after
          }
        }
      }

      entries.push({
        kind: 'kv',
        rawLine: line,
        prefix: `${leadPrefix}${key}${eqPart}`,
        key,
        quote: quoteKind,
        value: val,
        inlineComment,
      })
      i += 1
      continue
    }

    // 無クォート値：空白＋# でインラインコメント分離（DB_PASS=abc#123 の途中の#は保護）
    let value = rest
    let inlineComment = ''
    const commentIdx = rest.search(/\s+#/)
    if (commentIdx >= 0) {
      value = rest.slice(0, commentIdx)
      inlineComment = rest.slice(commentIdx)
    }

    entries.push({
      kind: 'kv',
      rawLine: line,
      prefix: `${leadPrefix}${key}${eqPart}`,
      key,
      quote: 'none',
      value: value.trimEnd(),
      inlineComment,
    })
    i += 1
  }

  return entries
}

function formatEnvValueSafely(
  value: string,
  originalQuote: 'none' | 'double' | 'single'
): string {
  if (value === '') {
    return originalQuote === 'double' ? '""' : originalQuote === 'single' ? "''" : ''
  }
  if (originalQuote === 'double') {
    const escaped = value.replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')
    return `"${escaped}"`
  }
  if (originalQuote === 'single') {
    if (!value.includes("'") && !value.includes('\n')) {
      return `'${value}'`
    }
    const escaped = value.replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')
    return `"${escaped}"`
  }
  // 無クォート時でも <REDACTED> や空白・# を含む場合はシェルリダイレクト防止のためクォートする
  if (/[<>\s#"'`$&;|\\]/.test(value)) {
    const escaped = value.replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')
    return `"${escaped}"`
  }
  return value
}

function sanitizeEnvEntries(
  source: string,
  tracker: FindingTracker,
  options: SanitizeOptions
): {
  lines: string[]
  flatRecords: Array<{ key: string; value: string }>
} {
  const entries = parseEnvEntries(source)
  const lines: string[] = []
  const flatRecords: Array<{ key: string; value: string }> = []

  entries.forEach((entry, idx) => {
    const lineNum = idx + 1
    if (entry.kind === 'blank') {
      lines.push(entry.rawLine)
      return
    }
    if (entry.kind === 'comment' || entry.kind === 'raw') {
      lines.push(
        sanitizeStringValue(entry.rawLine, tracker, options, `L${lineNum}`)
      )
      return
    }

    const key = entry.key || ''
    const rawVal = entry.value ?? ''
    const quote = entry.quote || 'none'
    const keyKind = tracker.classifyKey(key, key)

    const wholeCheck = shouldMaskWholeValueAsSecret(
      rawVal,
      keyKind,
      tracker,
      options,
      key,
      key
    )
    let sanitizedVal: string
    if (wholeCheck.handled) {
      sanitizedVal = wholeCheck.result
    } else {
      sanitizedVal = sanitizeStringValue(rawVal, tracker, options, key, key)
    }

    let sanitizedComment = entry.inlineComment || ''
    if (sanitizedComment) {
      sanitizedComment = sanitizeStringValue(
        sanitizedComment,
        tracker,
        options,
        `${key} (コメント)`
      )
    }

    const outLineVal =
      sanitizedVal === rawVal && quote === 'none' && sanitizedComment === (entry.inlineComment || '')
        ? rawVal
        : formatEnvValueSafely(sanitizedVal, quote)
    lines.push(`${entry.prefix}${outLineVal}${sanitizedComment}`)
    flatRecords.push({ key, value: sanitizedVal })
  })

  return { lines, flatRecords }
}

function sanitizeJsonValue(
  node: unknown,
  tracker: FindingTracker,
  options: SanitizeOptions,
  path: string,
  leafKey: string,
  depth: number,
  nodeCounter: { count: number },
  forceMaskAll = false
): unknown {
  nodeCounter.count += 1
  if (nodeCounter.count > MAX_NODES) {
    throw new Error(`ノード数が上限（${MAX_NODES.toLocaleString()}件）を超えました。`)
  }
  if (depth > MAX_DEPTH) {
    throw new Error(`ネスト深度が上限（${MAX_DEPTH}階層）を超えました。`)
  }

  if (node === null || node === undefined) {
    return node
  }

  if (typeof node === 'string') {
    if (forceMaskAll) {
      if (isAlreadyPlaceholder(node) || isTemplateReferenceOnly(node)) {
        return node
      }
      return tracker.record(node, 'k8s-secret', path, leafKey)
    }

    // 埋め込み JSON 文字列（例: last-applied-configuration）
    const trimmed = node.trim()
    if (
      depth + 1 < MAX_DEPTH &&
      ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')))
    ) {
      try {
        const embedded = JSON.parse(trimmed)
        if (embedded !== null && typeof embedded === 'object') {
          const sanitizedEmbedded = sanitizeJsonValue(
            embedded,
            tracker,
            options,
            `${path}(JSON)`,
            leafKey,
            depth + 1,
            nodeCounter,
            false
          )
          return JSON.stringify(sanitizedEmbedded)
        }
      } catch {
        // treat as plain string
      }
    }

    const keyKind = tracker.classifyKey(leafKey, path)
    const whole = shouldMaskWholeValueAsSecret(
      node,
      keyKind,
      tracker,
      options,
      path,
      leafKey
    )
    if (whole.handled) {
      return whole.result
    }
    return sanitizeStringValue(node, tracker, options, path, leafKey)
  }

  if (typeof node === 'number' || typeof node === 'boolean') {
    if (forceMaskAll) {
      return tracker.record(String(node), 'k8s-secret', path, leafKey)
    }
    const keyKind = tracker.classifyKey(leafKey, path)
    if (
      typeof node === 'number' &&
      (keyKind === 'secret-key' || keyKind === 'custom-key')
    ) {
      return tracker.record(
        String(node),
        keyKind === 'custom-key' ? 'custom-key' : 'secret-key',
        path,
        leafKey
      )
    }
    return node
  }

  if (Array.isArray(node)) {
    return node.map((item, idx) =>
      sanitizeJsonValue(
        item,
        tracker,
        options,
        `${path}[${idx}]`,
        leafKey,
        depth + 1,
        nodeCounter,
        forceMaskAll
      )
    )
  }

  if (typeof node === 'object') {
    const rec = node as Record<string, unknown>
    const keys = getSafeOwnKeys(rec)
    const isK8sSecretObj = getSafeOwnProp(rec, 'kind') === 'Secret'

    // { name/key: "DB_PASSWORD", value: "..." } パターン検出
    const pairNameVal =
      getSafeOwnProp(rec, 'name') ?? getSafeOwnProp(rec, 'key')
    const hasPairValue = Object.prototype.hasOwnProperty.call(rec, 'value')
    let pairNameKind: 'ignore' | 'custom-key' | 'secret-key' | 'public' | 'neutral' | null =
      null
    let pairNameStr = ''
    if (hasPairValue && typeof pairNameVal === 'string') {
      pairNameStr = pairNameVal
      pairNameKind = tracker.classifyKey(pairNameStr, `${path}.${pairNameStr}`)
    }

    const out: Record<string, unknown> = {}
    for (const k of keys) {
      const rawVal = getSafeOwnProp(rec, k)
      const childPath = path ? `${path}.${k}` : k

      if (
        k === 'value' &&
        pairNameKind !== null &&
        (pairNameKind === 'secret-key' || pairNameKind === 'custom-key') &&
        rawVal !== null &&
        rawVal !== undefined &&
        typeof rawVal !== 'object'
      ) {
        const strVal = String(rawVal)
        if (!isAlreadyPlaceholder(strVal) && !isTemplateReferenceOnly(strVal)) {
          URL_SCHEME_RE.lastIndex = 0
          if (URL_SCHEME_RE.test(strVal)) {
            const masked = sanitizeStringValue(
              strVal,
              tracker,
              options,
              `${path}.${pairNameStr}`,
              pairNameStr
            )
            safeSetProperty(out, k, masked)
            continue
          }
          const rep = tracker.record(
            strVal,
            'env-pair',
            `${path}.${pairNameStr}`,
            pairNameStr
          )
          safeSetProperty(out, k, rep)
          continue
        }
      }

      const childForceMask =
        forceMaskAll || (isK8sSecretObj && (k === 'data' || k === 'stringData'))
      const sanitizedChild = sanitizeJsonValue(
        rawVal,
        tracker,
        options,
        childPath,
        k,
        depth + 1,
        nodeCounter,
        childForceMask
      )
      safeSetProperty(out, k, sanitizedChild)
    }
    return out
  }

  return node
}

function getScalarText(node: unknown): string | null {
  if (!isScalar(node)) return null
  if (node.value === null || node.value === undefined) return null
  return String(node.value)
}

function updateYamlScalar(scalar: Scalar, replacement: string): void {
  if (
    scalar.type === Scalar.BLOCK_LITERAL ||
    scalar.type === Scalar.BLOCK_FOLDED
  ) {
    scalar.type = replacement === '' ? Scalar.QUOTE_DOUBLE : Scalar.PLAIN
  } else if (replacement === '') {
    scalar.type = Scalar.QUOTE_DOUBLE
  }
  scalar.value = replacement
}

function sanitizeYamlAstNode(
  doc: Document.Parsed,
  node: Node | null | undefined,
  tracker: FindingTracker,
  options: SanitizeOptions,
  path: string,
  leafKey: string,
  depth: number,
  nodeCounter: { count: number },
  forceMaskAll: boolean,
  secretAliasTargets: Map<Node, { reason: FindingReason; path: string; hint: string }>
): void {
  if (!node) return
  nodeCounter.count += 1
  if (nodeCounter.count > MAX_NODES) {
    throw new Error(`YAMLノード数が上限（${MAX_NODES.toLocaleString()}件）を超えました。`)
  }
  if (depth > MAX_DEPTH) {
    throw new Error(`YAMLネスト深度が上限（${MAX_DEPTH}階層）を超えました。`)
  }

  if (node.commentBefore) {
    node.commentBefore = sanitizeStringValue(
      node.commentBefore,
      tracker,
      options,
      `${path} (コメント)`
    )
  }
  if (node.comment) {
    node.comment = sanitizeStringValue(
      node.comment,
      tracker,
      options,
      `${path} (コメント)`
    )
  }

  if (isAlias(node)) {
    const resolved = node.resolve(doc)
    if (resolved) {
      const keyKind = tracker.classifyKey(leafKey, path)
      if (forceMaskAll) {
        secretAliasTargets.set(resolved, {
          reason: 'k8s-secret',
          path,
          hint: leafKey,
        })
      } else if (keyKind === 'secret-key' || keyKind === 'custom-key') {
        secretAliasTargets.set(resolved, {
          reason: keyKind === 'custom-key' ? 'custom-key' : 'secret-key',
          path,
          hint: leafKey,
        })
      }
    }
    return
  }

  if (isScalar(node)) {
    const val = node.value
    if (val === null || val === undefined) return
    const strVal = String(val)

    if (forceMaskAll) {
      if (!isAlreadyPlaceholder(strVal) && !isTemplateReferenceOnly(strVal)) {
        const rep = tracker.record(strVal, 'k8s-secret', path, leafKey)
        updateYamlScalar(node, rep)
      }
      return
    }

    // 埋め込み JSON（K8s last-applied-configuration 等）
    const trimmed = strVal.trim()
    if (
      depth + 1 < MAX_DEPTH &&
      ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')))
    ) {
      try {
        const embedded = JSON.parse(trimmed)
        if (embedded !== null && typeof embedded === 'object') {
          const sanitized = sanitizeJsonValue(
            embedded,
            tracker,
            options,
            `${path}(JSON)`,
            leafKey,
            depth + 1,
            nodeCounter,
            false
          )
          updateYamlScalar(node, JSON.stringify(sanitized))
          return
        }
      } catch {
        // fallback to normal scalar handling
      }
    }

    if (typeof val === 'string') {
      const keyKind = tracker.classifyKey(leafKey, path)
      const whole = shouldMaskWholeValueAsSecret(
        strVal,
        keyKind,
        tracker,
        options,
        path,
        leafKey
      )
      if (whole.handled) {
        if (whole.result !== strVal) {
          updateYamlScalar(node, whole.result)
        }
        return
      }
      const cleaned = sanitizeStringValue(strVal, tracker, options, path, leafKey)
      if (cleaned !== strVal) {
        updateYamlScalar(node, cleaned)
      }
    } else if (typeof val === 'number') {
      const keyKind = tracker.classifyKey(leafKey, path)
      if (keyKind === 'secret-key' || keyKind === 'custom-key') {
        const rep = tracker.record(
          strVal,
          keyKind === 'custom-key' ? 'custom-key' : 'secret-key',
          path,
          leafKey
        )
        updateYamlScalar(node, rep)
      }
    }
    return
  }

  if (isSeq(node)) {
    const seq = node as YAMLSeq<ParsedNode>
    seq.items.forEach((item, idx) => {
      sanitizeYamlAstNode(
        doc,
        item,
        tracker,
        options,
        `${path}[${idx}]`,
        leafKey,
        depth + 1,
        nodeCounter,
        forceMaskAll,
        secretAliasTargets
      )
    })
    return
  }

  if (isMap(node)) {
    const map = node as YAMLMap<ParsedNode, ParsedNode | null>
    let isK8sSecretMap = false
    let pairNameStr = ''
    let valuePair: (typeof map.items)[number] | null = null

    for (const pair of map.items) {
      if (!isPair(pair)) continue
      const kStr = getScalarText(pair.key)
      if (kStr === 'kind' && getScalarText(pair.value) === 'Secret') {
        isK8sSecretMap = true
      }
      if ((kStr === 'name' || kStr === 'key') && isScalar(pair.value)) {
        pairNameStr = getScalarText(pair.value) || ''
      }
      if (kStr === 'value') {
        valuePair = pair
      }
    }

    const pairNameKind = pairNameStr
      ? tracker.classifyKey(pairNameStr, `${path}.${pairNameStr}`)
      : null

    for (const pair of map.items) {
      if (!isPair(pair)) continue
      const kStr = getScalarText(pair.key) || ''
      const childPath = path ? `${path}.${kStr}` : kStr

      if (
        valuePair === pair &&
        pairNameKind !== null &&
        (pairNameKind === 'secret-key' || pairNameKind === 'custom-key') &&
        pair.value
      ) {
        if (isAlias(pair.value)) {
          const target = pair.value.resolve(doc)
          if (target) {
            secretAliasTargets.set(target, {
              reason: 'env-pair',
              path: `${path}.${pairNameStr}`,
              hint: pairNameStr,
            })
          }
          continue
        }
        if (isScalar(pair.value) && pair.value.value !== null && pair.value.value !== undefined) {
          const rawStr = String(pair.value.value)
          if (!isAlreadyPlaceholder(rawStr) && !isTemplateReferenceOnly(rawStr)) {
            URL_SCHEME_RE.lastIndex = 0
            if (URL_SCHEME_RE.test(rawStr)) {
              const maskedUrl = sanitizeStringValue(
                rawStr,
                tracker,
                options,
                `${path}.${pairNameStr}`,
                pairNameStr
              )
              updateYamlScalar(pair.value, maskedUrl)
            } else {
              const rep = tracker.record(
                rawStr,
                'env-pair',
                `${path}.${pairNameStr}`,
                pairNameStr
              )
              updateYamlScalar(pair.value, rep)
            }
            continue
          }
        }
      }

      const childForceMask =
        forceMaskAll ||
        (isK8sSecretMap && (kStr === 'data' || kStr === 'stringData'))

      sanitizeYamlAstNode(
        doc,
        pair.value,
        tracker,
        options,
        childPath,
        kStr,
        depth + 1,
        nodeCounter,
        childForceMask,
        secretAliasTargets
      )
    }
  }
}

function enforceSecretAliasTargets(
  doc: Document.Parsed,
  secretAliasTargets: Map<Node, { reason: FindingReason; path: string; hint: string }>,
  tracker: FindingTracker
): void {
  for (const [targetNode, meta] of secretAliasTargets.entries()) {
    if (isScalar(targetNode)) {
      const val = targetNode.value
      if (val === null || val === undefined) continue
      const strVal = String(val)
      if (!isAlreadyPlaceholder(strVal) && !isTemplateReferenceOnly(strVal)) {
        const rep = tracker.record(strVal, meta.reason, meta.path, meta.hint)
        updateYamlScalar(targetNode, rep)
      }
    } else if (isMap(targetNode) || isSeq(targetNode)) {
      const fakeSet = new Map<Node, { reason: FindingReason; path: string; hint: string }>()
      sanitizeYamlAstNode(
        doc,
        targetNode,
        tracker,
        DEFAULT_SANITIZE_OPTIONS,
        meta.path,
        meta.hint,
        0,
        { count: 0 },
        true,
        fakeSet
      )
    }
  }
}

/**
 * `Map`（YAML `mapAsMap: true` の出力）や配列・プリミティブを安全に通常JS構造へ変換（プロトタイプ汚染ゼロ）
 */
function mapTreeToSafeObject(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    throw new Error(`データ変換深度が上限（${MAX_DEPTH}階層）を超えました。`)
  }
  if (value instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of value.entries()) {
      safeSetProperty(out, String(k), mapTreeToSafeObject(v, depth + 1))
    }
    return out
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapTreeToSafeObject(item, depth + 1))
  }
  if (value !== null && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of getSafeOwnKeys(rec)) {
      safeSetProperty(
        out,
        k,
        mapTreeToSafeObject(getSafeOwnProp(rec, k), depth + 1)
      )
    }
    return out
  }
  return value
}

function flattenToEnvLines(
  value: unknown,
  prefix: string,
  outLines: string[],
  depth = 0
): void {
  if (depth > MAX_DEPTH) {
    throw new Error(`フラット化深度が上限（${MAX_DEPTH}階層）を超えました。`)
  }
  if (value === null || value === undefined) {
    if (prefix) outLines.push(`${prefix}=`)
    return
  }
  if (typeof value !== 'object') {
    const str = String(value)
    outLines.push(`${prefix || 'VALUE'}=${formatEnvValueSafely(str, 'none')}`)
    return
  }
  if (Array.isArray(value)) {
    const serialized = JSON.stringify(value)
    outLines.push(`${prefix || 'ITEMS'}=${formatEnvValueSafely(serialized, 'double')}`)
    return
  }
  const rec = value as Record<string, unknown>
  const keys = getSafeOwnKeys(rec)
  if (keys.length === 0 && prefix) {
    outLines.push(`${prefix}={}`)
    return
  }
  for (const k of keys) {
    const childVal = getSafeOwnProp(rec, k)
    const seg = toEnvConstName(k)
    const nextPrefix = prefix ? `${prefix}_${seg}` : seg
    if (childVal !== null && typeof childVal === 'object' && !Array.isArray(childVal)) {
      flattenToEnvLines(childVal, nextPrefix, outLines, depth + 1)
    } else {
      flattenToEnvLines(childVal, nextPrefix, outLines, depth + 1)
    }
  }
}

export function sanitizeConfig(
  input: string,
  partialOptions: Partial<SanitizeOptions> = {}
): SanitizeResult {
  const options: SanitizeOptions = {
    ...DEFAULT_SANITIZE_OPTIONS,
    ...partialOptions,
  }

  const baseEmpty = (
    detected: DetectedFormat = 'log',
    error: string | null = null
  ): SanitizeResult => ({
    output: '',
    detectedFormat: detected,
    effectiveOutputFormat: detected,
    usedJsoncFallback: false,
    findings: [],
    totalMasked: 0,
    countsByReason: createEmptyCounts(),
    error,
    warning: null,
    canConvert: detected !== 'log' && detected !== 'jsonl',
  })

  if (!input.trim()) {
    return baseEmpty('log', null)
  }

  const validationError = validateRawInput(input)
  if (validationError) {
    return baseEmpty('log', validationError)
  }

  let detectedFormat: DetectedFormat = 'log'
  let usedJsoncFallback = false

  if (options.inputFormat === 'auto') {
    const det = detectFormat(input)
    if (det.error) {
      return baseEmpty(det.format, det.error)
    }
    detectedFormat = det.format
    usedJsoncFallback = det.usedJsonc
  } else {
    detectedFormat = options.inputFormat
  }

  const tracker = new FindingTracker(options)
  const canConvert = detectedFormat !== 'log' && detectedFormat !== 'jsonl'
  const effectiveOutputFormat: DetectedFormat =
    !canConvert || options.outputFormat === 'same'
      ? detectedFormat
      : options.outputFormat

  try {
    let output = ''
    let warning: string | null = null

    if (detectedFormat === 'env') {
      const { lines, flatRecords } = sanitizeEnvEntries(input, tracker, options)
      if (effectiveOutputFormat === 'env') {
        output = lines.join('\n')
      } else if (effectiveOutputFormat === 'json') {
        const obj: Record<string, string> = {}
        for (const rec of flatRecords) {
          safeSetProperty(obj, rec.key, rec.value)
        }
        output = JSON.stringify(obj, null, 2)
        warning =
          'JSON変換時は .env のコメント行や空行は保持されません。'
      } else {
        const obj: Record<string, string> = {}
        for (const rec of flatRecords) {
          safeSetProperty(obj, rec.key, rec.value)
        }
        output = yamlStringify(obj)
        warning =
          'YAML変換時は .env のコメント行や空行は保持されません。'
      }
    } else if (detectedFormat === 'json') {
      const parsed = tryParseJson(input)
      if (!parsed.ok) {
        return baseEmpty(
          'json',
          'JSONとして解析できませんでした（構文エラー）。ログ形式に切り替えると行単位で強制サニタイズできます。'
        )
      }
      usedJsoncFallback = parsed.usedJsonc
      const sanitizedObj = sanitizeJsonValue(
        parsed.value,
        tracker,
        options,
        '',
        '',
        0,
        { count: 0 },
        false
      )
      if (effectiveOutputFormat === 'json') {
        output = JSON.stringify(sanitizedObj, null, 2)
      } else if (effectiveOutputFormat === 'yaml') {
        output = yamlStringify(sanitizedObj)
      } else {
        const envLines: string[] = []
        flattenToEnvLines(sanitizedObj, '', envLines)
        output = envLines.join('\n')
        warning =
          'ネストしたJSONキーは UPPER_SNAKE_CASE にフラット化され、配列はJSON文字列として出力されます。'
      }
    } else if (detectedFormat === 'yaml') {
      const yamlCheck = tryParseYamlDocuments(input)
      if (!yamlCheck.ok) {
        return baseEmpty(
          'yaml',
          `${yamlCheck.errorMsg || 'YAML解析エラー'} ログ形式に切り替えると行単位で強制サニタイズできます。`
        )
      }
      const nodeCounter = { count: 0 }
      for (let dIdx = 0; dIdx < yamlCheck.docs.length; dIdx++) {
        const doc = yamlCheck.docs[dIdx]
        const docPrefix = yamlCheck.docs.length > 1 ? `doc[${dIdx + 1}]` : ''
        if (doc.commentBefore) {
          doc.commentBefore = sanitizeStringValue(
            doc.commentBefore,
            tracker,
            options,
            `${docPrefix || 'doc'} (コメント)`
          )
        }
        if (doc.comment) {
          doc.comment = sanitizeStringValue(
            doc.comment,
            tracker,
            options,
            `${docPrefix || 'doc'} (コメント)`
          )
        }
        const secretAliasTargets = new Map<
          Node,
          { reason: FindingReason; path: string; hint: string }
        >()
        sanitizeYamlAstNode(
          doc,
          doc.contents,
          tracker,
          options,
          docPrefix,
          '',
          0,
          nodeCounter,
          false,
          secretAliasTargets
        )
        enforceSecretAliasTargets(doc, secretAliasTargets, tracker)
      }

      if (effectiveOutputFormat === 'yaml') {
        output = yamlCheck.docs
          .map((doc, idx) => {
            const rendered = doc.toString().trimEnd()
            if (idx > 0 && !/^---(?:\s|$)/.test(rendered)) {
              return `---\n${rendered}`
            }
            return rendered
          })
          .join('\n')
      } else {
        const safeDocs = yamlCheck.docs.map((doc) =>
          mapTreeToSafeObject(
            doc.toJS({ maxAliasCount: MAX_YAML_ALIASES, mapAsMap: true })
          )
        )
        if (effectiveOutputFormat === 'json') {
          output = JSON.stringify(
            safeDocs.length === 1 ? safeDocs[0] : safeDocs,
            null,
            2
          )
          warning =
            'JSON変換時はYAMLのコメントが削除され、複数ドキュメントはJSON配列へまとめられます。'
        } else {
          const envLines: string[] = []
          safeDocs.forEach((docVal, dIdx) => {
            if (safeDocs.length > 1) {
              if (dIdx > 0) envLines.push('')
              envLines.push(`# --- Document ${dIdx + 1} ---`)
            }
            flattenToEnvLines(docVal, '', envLines)
          })
          output = envLines.join('\n')
          warning =
            'ネストしたYAMLキーは UPPER_SNAKE_CASE にフラット化され、配列はJSON文字列として出力されます。'
        }
      }
    } else if (detectedFormat === 'jsonl') {
      const lines = input.split(/\r?\n/)
      const nodeCounter = { count: 0 }
      const outLines = lines.map((line, idx) => {
        const lineNum = idx + 1
        const trimmed = line.trim()
        if (!trimmed) return line
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed !== null && typeof parsed === 'object') {
              const sanitized = sanitizeJsonValue(
                parsed,
                tracker,
                options,
                `L${lineNum}`,
                '',
                0,
                nodeCounter,
                false
              )
              return JSON.stringify(sanitized)
            }
          } catch {
            // 非JSON行はログスキャンへ安全フォールバック
          }
        }
        return sanitizeStringValue(line, tracker, options, `L${lineNum}`)
      })
      output = outLines.join('\n')
    } else {
      // log（プレーンエラーログ・HTTPリクエスト・スタックトレース）
      // 複数行PEMがログ内にまたがる場合にも対応するため、まず全文でPEMブロックを線形置換してから行別（JSON行またはKey=Value・ヘッダ）も走査
      const pemCleaned = replacePemBlocks(input, tracker, 'log')
      const nodeCounter = { count: 0 }
      const cleanedLines = pemCleaned.split(/\r?\n/).map((line, idx) => {
        const lineNum = idx + 1
        const trimmed = line.trim()
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed !== null && typeof parsed === 'object') {
              const sanitized = sanitizeJsonValue(
                parsed,
                tracker,
                options,
                `L${lineNum}`,
                '',
                0,
                nodeCounter,
                false
              )
              return JSON.stringify(sanitized)
            }
          } catch {
            // 非JSON行として通常のログスキャンへ継続
          }
        }
        let cur = sanitizeStringValue(line, tracker, options, `L${lineNum}`)
        // ログ中の key=value / key: value 形式も安全にマスク（直前がハイフン等の識別子続きにならないよう境界確認）
        cur = cur.replace(
          /(?<![A-Za-z0-9_.-])([A-Za-z_][A-Za-z0-9_.-]{1,40})(\s*(?:=|:)\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]\r\n]+)/g,
          (full, kName: string, sep: string, rawV: string, offset: number, fullLine: string) => {
            const keyKind = tracker.classifyKey(kName, `L${lineNum}.${kName}`)
            if (keyKind !== 'secret-key' && keyKind !== 'custom-key') {
              return full
            }
            // 直後に既にマスクされたプレースホルダが続く HTTP 認証ヘッダ（Authorization: Basic <REDACTED> 等）は二重置換しない
            if (/^(?:bearer|basic|token|apikey|api-key|digest)$/i.test(rawV)) {
              const afterMatch = fullLine.slice(offset + full.length).trimStart()
              const firstTokenAfter = afterMatch.split(/\s/)[0] || ''
              if (isAlreadyPlaceholder(firstTokenAfter)) {
                return full
              }
            }
            if (
              rawV.includes('<REDACTED>') ||
              /<SECRET_\d+>/.test(rawV) ||
              rawV.includes('YOUR_')
            ) {
              return full
            }
            const quote =
              (rawV.startsWith('"') && rawV.endsWith('"')) ||
              (rawV.startsWith("'") && rawV.endsWith("'"))
                ? rawV[0]
                : ''
            const inner = quote ? rawV.slice(1, -1) : rawV
            if (
              !inner ||
              isAlreadyPlaceholder(inner) ||
              isTemplateReferenceOnly(inner)
            ) {
              return full
            }
            const whole = shouldMaskWholeValueAsSecret(
              inner,
              keyKind,
              tracker,
              options,
              `L${lineNum}.${kName}`,
              kName
            )
            return `${kName}${sep}${quote}${whole.result}${quote}`
          }
        )
        return cur
      })
      output = cleanedLines.join('\n')
    }

    if (utf8ByteLength(output) > MAX_OUTPUT_BYTES) {
      return baseEmpty(
        detectedFormat,
        '変換後の出力サイズが安全上限（5MB）を超えたため中断しました。入力を分割してください。'
      )
    }

    if (usedJsoncFallback && !warning) {
      warning =
        'コメント・末尾カンマ付きJSON（JSONC）として読み込み、標準JSON形式で整形しました。'
    }

    const summary = tracker.getSummary()
    return {
      output,
      detectedFormat,
      effectiveOutputFormat,
      usedJsoncFallback,
      findings: summary.findings,
      totalMasked: summary.totalMasked,
      countsByReason: summary.countsByReason,
      error: null,
      warning,
      canConvert,
    }
  } catch (err) {
    return baseEmpty(
      detectedFormat,
      err instanceof Error ? err.message : '処理中に予期しないエラーが発生しました。'
    )
  }
}

export function buildSanitizedFilename(
  originalName: string | null,
  outputFormat: DetectedFormat
): string {
  const extMap: Record<DetectedFormat, string> = {
    env: 'env',
    json: 'json',
    jsonl: 'jsonl',
    yaml: 'yaml',
    log: 'log',
  }
  const ext = extMap[outputFormat]
  const rawBase = (originalName || 'config')
    .split(/[/\\]/)
    .pop() || 'config'
  const stripped = rawBase
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
    .replace(/\.[^/.]+$/, '')
    .replace(/^\.+/, '')
    .trim()
  const safeBase = stripped ? stripped.slice(0, 64) : 'config'
  if (outputFormat === 'env') {
    return `sanitized-${safeBase}.env`
  }
  return `sanitized-${safeBase}.${ext}`
}
