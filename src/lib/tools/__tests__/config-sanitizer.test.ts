import { describe, expect, it } from 'vitest'
import {
  buildSanitizedFilename,
  MAX_INPUT_BYTES,
  SAMPLES,
  sanitizeConfig,
  validateRawInput,
} from '../config-sanitizer'

// GitHub Secret Scanning / audit-security.mjs の生シークレット誤認を避けるため、正規長トークンはテスト実行時に合成生成する
const makeToken = (...parts: string[]) => parts.join('')

describe('config-sanitizer', () => {
  describe('.env parsing, shell safety, and .env.example generation', () => {
    it('preserves comments, export prefix, inline comments, quotes with #, template vars, and public keys', () => {
      const result = sanitizeConfig(SAMPLES.env.content, {
        placeholderStyle: 'redacted',
      })

      expect(result.error).toBeNull()
      expect(result.detectedFormat).toBe('env')
      expect(result.canConvert).toBe(true)

      // 公開設定・テンプレート参照・Stripe公開鍵は保持
      expect(result.output).toContain('NODE_ENV=production')
      expect(result.output).toContain('PORT=8080')
      expect(result.output).toContain('LOG_LEVEL=info')
      expect(result.output).toContain('NEXT_PUBLIC_APP_URL=https://app.example.com')
      expect(result.output).toContain(
        'NEXT_PUBLIC_STRIPE_KEY=pk_live_sample_public_key_2026'
      )
      expect(result.output).toContain(
        'TEMPLATE_DSN=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/app'
      )

      // シェルリダイレクト事故を防ぐため無クォートの <REDACTED> は自動ダブルクォートされる
      expect(result.output).toContain('export API_KEY="<REDACTED>"')
      expect(result.output).toContain(
        'DB_PASS="<REDACTED>" # クォート内の#は維持しコメントは保持'
      )
      expect(result.output).toContain(
        'DATABASE_URL="postgres://appuser:<REDACTED>@db.internal:5432/appdb"'
      )
      expect(result.output).toContain(
        'REDIS_URL="redis://:<REDACTED>@cache.internal:6379/0"'
      )
      expect(result.output).toContain('PRIVATE_KEY="<REDACTED>"')

      // 生シークレットが残っていないこと
      expect(result.output).not.toContain('demo_api_key_sample_99112233')
      expect(result.output).not.toContain('p@ss#word123')
      expect(result.output).not.toContain('p@ss:w/rd')
      expect(result.output).not.toContain('redis_sample_pw_99')
      expect(result.output).not.toContain('MIIEvQIBADANBgkqhkiG9w0')
    })

    it('handles multi-line quoted PEM values inside .env without breaking format detection', () => {
      const envWithMultilinePem = [
        'APP_NAME=localbox-api',
        'PRIVATE_KEY="-----BEGIN PRIVATE KEY-----',
        'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC00000',
        '1111222233334444555566667777888899990000aaaabbbbccccdddd',
        '-----END PRIVATE KEY-----"',
      ].join('\n')

      const result = sanitizeConfig(envWithMultilinePem)
      expect(result.detectedFormat).toBe('env')
      expect(result.output).toContain('APP_NAME=localbox-api')
      expect(result.output).toContain('PRIVATE_KEY="<REDACTED>"')
      expect(result.output).not.toContain('MIIEvQIBADANBgkqhkiG9w0')
    })

    it('generates shell-safe .env.example placeholders and empty values', () => {
      const placeholderResult = sanitizeConfig(SAMPLES.env.content, {
        placeholderStyle: 'example',
        exampleEmptyValue: false,
      })
      expect(placeholderResult.output).toContain('export API_KEY=YOUR_API_KEY')
      expect(placeholderResult.output).toContain('DB_PASS="YOUR_DB_PASS"')
      expect(placeholderResult.output).toContain('JWT_SECRET=YOUR_JWT_SECRET')
      expect(placeholderResult.output).toContain(
        'DATABASE_URL=postgres://appuser:YOUR_DATABASE_URL_PASSWORD@db.internal:5432/appdb'
      )

      const emptyResult = sanitizeConfig(SAMPLES.env.content, {
        placeholderStyle: 'example',
        exampleEmptyValue: true,
      })
      expect(emptyResult.output).toContain('export API_KEY=')
      expect(emptyResult.output).toContain('JWT_SECRET=')
      expect(emptyResult.output).not.toContain('sample_jwt_signing_secret')
    })

    it('masks secrets even inside public-prefixed keys and comments when value contains high-confidence tokens', () => {
      const fakeAws = makeToken('AKIA', '0000', 'EXAMPLE', '00001')
      const envInput = [
        `NEXT_PUBLIC_LEAKED_KEY=${fakeAws}`,
        `# old key backup: ${makeToken('ghp_', 'aB12cD34eF56gH78iJ90kL12mN34oP56qR78')}`,
      ].join('\n')

      const result = sanitizeConfig(envInput)
      expect(result.output).not.toContain(fakeAws)
      expect(result.output).not.toContain('aB12cD34eF56gH78iJ90kL12mN34oP56qR78')
      expect(result.totalMasked).toBe(2)
    })
  })

  describe('JSON, JSONC, and JSONL handling', () => {
    it('always outputs valid JSON.parse()-able output and protects benign keys', () => {
      const result = sanitizeConfig(SAMPLES.json.content, {
        placeholderStyle: 'indexed',
      })
      expect(result.error).toBeNull()
      expect(result.detectedFormat).toBe('json')

      const parsed = JSON.parse(result.output) as Record<string, any>
      expect(parsed.app.env).toBe('production')
      expect(parsed.app.port).toBe(3000)
      expect(parsed.app.region).toBe('ap-northeast-1')
      expect(parsed.stripe.publishableKey).toBe('pk_live_sample_public_key_2026')
      expect(parsed.stripe.webhookSecret).toMatch(/^<SECRET_\d+>$/)
      expect(parsed.database.url).toMatch(
        /^postgresql:\/\/svc_user:<SECRET_\d+>@10\.0\.2\.15:5432\/orders\?sslmode=require$/
      )
      expect(parsed.database.password).toMatch(/^<SECRET_\d+>$/)
      expect(parsed.env[0].value).toMatch(/^<SECRET_\d+>$/)
      expect(parsed.env[1].value).toBe('warn')
    })

    it('supports JSONC with // comments, /* */ comments, and trailing commas', () => {
      const jsonc = `{
        // Cloudflare / TypeScript style config
        "name": "worker-app",
        /* secret below */
        "apiToken": "jsonc_secret_token_9999",
      }`
      const result = sanitizeConfig(jsonc)
      expect(result.error).toBeNull()
      expect(result.detectedFormat).toBe('json')
      expect(result.usedJsoncFallback).toBe(true)
      const parsed = JSON.parse(result.output) as Record<string, string>
      expect(parsed.name).toBe('worker-app')
      expect(parsed.apiToken).toBe('<REDACTED>')
    })

    it('detects JSONL and sanitizes mixed JSON + plain log lines safely', () => {
      const mixedJsonl = [
        '{"level":"info","requestId":"550e8400-e29b-41d4-a716-446655440000","apiKey":"secret_line_1"}',
        '{"level":"error","dbPassword":"secret_line_2","commit":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"}',
        '2026-11-22 WARN plain fallback authorization: Bearer plain_line_token_3',
      ].join('\n')

      const result = sanitizeConfig(mixedJsonl)
      expect(result.error).toBeNull()
      expect(result.detectedFormat).toBe('jsonl')
      expect(result.canConvert).toBe(false)

      const lines = result.output.split('\n')
      expect(JSON.parse(lines[0]).requestId).toBe(
        '550e8400-e29b-41d4-a716-446655440000'
      )
      expect(JSON.parse(lines[0]).apiKey).toBe('<REDACTED>')
      expect(JSON.parse(lines[1]).commit).toBe(
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
      )
      expect(JSON.parse(lines[1]).dbPassword).toBe('<REDACTED>')
      expect(lines[2]).toContain('authorization: Bearer <REDACTED>')
    })
  })

  describe('YAML multi-document, K8s Secret, anchors, and block scalars', () => {
    it('masks multi-document K8s Secret data, stringData, last-applied-configuration, and normalizes block PEM', () => {
      const result = sanitizeConfig(SAMPLES.yaml.content)
      expect(result.error).toBeNull()
      expect(result.detectedFormat).toBe('yaml')
      expect(result.output).toContain('# Kubernetes Deployment + Secret')
      expect(result.output).toContain('value: production')
      expect(result.output).toContain('value: "8080"')
      expect(result.output).toContain('value: <REDACTED>')
      expect(result.output).toContain('app.conf: <REDACTED>')
      expect(result.output).toContain('tls.key: <REDACTED>')
      expect(result.output).not.toContain('---\n---')

      // 生Base64や生パスワード・アノテーションJSON内のシークレットもすべて消去されていること
      expect(result.output).not.toContain('k8s_demo_db_password_2026')
      expect(result.output).not.toContain('YXBpX2tleT1kZW1vX3NlY3JldF92YWx1ZV8yMDI2Cg==')
      expect(result.output).not.toContain('c2FtcGxlX2s4c190b2tlbl8yMDI2')
      expect(result.output).not.toContain('MIIEowIBAAKCAQEAsampleDemo')
      // ブロック記号 | が残って壊れていないこと
      expect(result.output).not.toMatch(/tls\.key:\s*\|/)
    })

    it('sanitizes YAML anchor targets when referenced by a secret key or K8s Secret', () => {
      const anchoredYaml = [
        'defaults:',
        '  shared: &shared_secret super_secret_anchor_value',
        'service:',
        '  api_key: *shared_secret',
        '  name: demo-service',
      ].join('\n')

      const result = sanitizeConfig(anchoredYaml)
      expect(result.error).toBeNull()
      expect(result.detectedFormat).toBe('yaml')
      expect(result.output).toContain('name: demo-service')
      expect(result.output).not.toContain('super_secret_anchor_value')
    })
  })

  describe('Log sanitization, false-positive guard, and token coverage', () => {
    it('masks HTTP/2 headers, cookies, curl -u, query params, URL credentials with @/:, and cloud tokens while keeping UUID/SHA/pk_live', () => {
      const fakeAws = makeToken('AKIA', '9988', 'TESTKEY', '12345')
      const fakeAsia = makeToken('ASIA', '7766', 'TEMPKEY', '54321')
      const fakeGhp = makeToken('ghp_', 'Zz12Yy34Xx56Ww78Vv90Uu12Tt34Ss56Rr78')
      const fakeGhPat = makeToken('github_pat_', '11ABCDE', '_0123456789abcdefABCDEF')
      const fakeAnt = makeToken('sk-ant-', 'api03-samplekey0000111122223333')
      const fakeStripeSecret = makeToken('sk_live_', '51SampleSecretKeyMaterial0000')
      const fakeSlack = makeToken('xoxb-', '111122223333-', '444455556666-', 'SampleSlackTok')

      const logInput = [
        SAMPLES.log.content,
        `url=postgres://admin:p@ss:w/rd@db.internal:5432/prod?sslmode=require&token=query_tok_123`,
        `redis=redis://:redis_pw_only@cache.internal:6379/0`,
        `public_url=https://medium.com/@author/article?page=2`,
        `stripe_pub=pk_live_public_1234567890abcdef`,
        `sha256_digest=sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
        `tokens=${fakeAws} ${fakeAsia} ${fakeGhp} ${fakeGhPat} ${fakeAnt} ${fakeStripeSecret} ${fakeSlack}`,
        `x-api-key: header_api_key_999`,
        `set-cookie: sid=secret_cookie_val; Path=/; HttpOnly; Secure`,
      ].join('\n')

      const result = sanitizeConfig(logInput)
      expect(result.error).toBeNull()

      // 非機密の保持確認
      expect(result.output).toContain('550e8400-e29b-41d4-a716-446655440000')
      expect(result.output).toContain('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')
      expect(result.output).toContain('https://medium.com/@author/article?page=2')
      expect(result.output).toContain('pk_live_public_1234567890abcdef')
      expect(result.output).toContain(
        'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      )
      expect(result.output).toContain('sslmode=require')
      expect(result.output).toContain('Path=/; HttpOnly; Secure')

      // 機密のマスク確認
      expect(result.output).toContain('postgres://admin:<REDACTED>@db.internal:5432/prod?sslmode=require&token=<REDACTED>')
      expect(result.output).toContain('redis://:<REDACTED>@cache.internal:6379/0')
      expect(result.output).toContain('proxy-authorization: Basic <REDACTED>')
      expect(result.output).toContain('cookie: session_id=<REDACTED>; Path=/; HttpOnly; Secure')
      expect(result.output).toContain('set-cookie: sid=<REDACTED>; Path=/; HttpOnly; Secure')
      expect(result.output).toContain('curl -u deploy_bot:<REDACTED>')
      expect(result.output).toContain('x-api-key: <REDACTED>')

      for (const secret of [
        fakeAws,
        fakeAsia,
        fakeGhp,
        fakeGhPat,
        fakeAnt,
        fakeStripeSecret,
        fakeSlack,
        'p@ss:w/rd',
        'redis_pw_only',
        'curl_demo_pw_123',
        'demo_session_cookie_val_7788',
        'header_api_key_999',
        'query_tok_123',
      ]) {
        expect(result.output).not.toContain(secret)
      }
    })
  })

  describe('Format conversions (.env <-> JSON <-> YAML)', () => {
    it('converts sanitized JSON to .env (flattened UPPER_SNAKE_CASE) and YAML without leaking secrets', () => {
      const toEnv = sanitizeConfig(SAMPLES.json.content, { outputFormat: 'env' })
      expect(toEnv.error).toBeNull()
      expect(toEnv.effectiveOutputFormat).toBe('env')
      expect(toEnv.output).toContain('APP_ENV=production')
      expect(toEnv.output).toContain('APP_PORT=3000')
      expect(toEnv.output).toContain('STRIPE_WEBHOOK_SECRET="<REDACTED>"')
      expect(toEnv.output).not.toContain('json_db_password_2026')
      expect(toEnv.output).not.toContain('json_redis_secret_2026')

      const toYaml = sanitizeConfig(SAMPLES.json.content, { outputFormat: 'yaml' })
      expect(toYaml.error).toBeNull()
      expect(toYaml.effectiveOutputFormat).toBe('yaml')
      expect(toYaml.output).toContain('webhookSecret: <REDACTED>')
      expect(toYaml.output).not.toContain('json_db_password_2026')
    })

    it('converts sanitized .env to JSON and YAML, and disables conversion for log inputs', () => {
      const envToJson = sanitizeConfig(SAMPLES.env.content, { outputFormat: 'json' })
      expect(envToJson.error).toBeNull()
      const parsed = JSON.parse(envToJson.output) as Record<string, string>
      expect(parsed.NODE_ENV).toBe('production')
      expect(parsed.API_KEY).toBe('<REDACTED>')

      const logAttempt = sanitizeConfig(SAMPLES.log.content, { outputFormat: 'yaml' })
      expect(logAttempt.canConvert).toBe(false)
      expect(logAttempt.effectiveOutputFormat).toBe('log')
      expect(logAttempt.output).not.toContain('log_inline_password_2026')
      expect(logAttempt.output).not.toContain('sample_bearer_access_token_2026')
    })
  })

  describe('Security, DoS, Prototype Pollution, and Shoulder-Surfing protections', () => {
    it('rejects YAML Billion Laughs alias bomb safely in both auto and yaml modes', () => {
      const billionLaughs = [
        'a: &a ["x","x","x","x","x","x","x","x","x"]',
        'b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]',
        'c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]',
        'd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]',
        'e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d]',
      ].join('\n')

      const autoRes = sanitizeConfig(billionLaughs)
      expect(autoRes.error).toBeTruthy()
      expect(autoRes.output).toBe('')

      const yamlRes = sanitizeConfig(billionLaughs, { inputFormat: 'yaml' })
      expect(yamlRes.error).toBeTruthy()
      expect(yamlRes.output).toBe('')
    })

    it('handles large truncated PEM payloads without END markers in linear time (< 500ms)', () => {
      const unterminatedChunks = Array.from(
        { length: 400 },
        (_, i) => `-----BEGIN PRIVATE KEY-----\nMIIE_CHUNK_${i}_` + 'A'.repeat(200)
      ).join('\n\n')

      const start = Date.now()
      const res = sanitizeConfig(unterminatedChunks, { inputFormat: 'log' })
      const elapsed = Date.now() - start

      expect(res.error).toBeNull()
      expect(elapsed).toBeLessThan(500)
      expect(res.output).not.toContain('MIIE_CHUNK_0_')
    })

    it('prevents prototype pollution across __proto__, constructor, and prototype keys while masking secrets inside them', () => {
      const evilJson =
        '{"__proto__":{"polluted":"yes","apiKey":"proto_secret_1"},"constructor":{"prototype":{"password":"proto_secret_2"}},"safe":"ok"}'

      const jsonRes = sanitizeConfig(evilJson)
      expect(jsonRes.error).toBeNull()
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      expect(jsonRes.output).not.toContain('proto_secret_1')
      expect(jsonRes.output).not.toContain('proto_secret_2')
      expect(jsonRes.output).toContain('"safe": "ok"')

      const evilYaml = [
        '__proto__:',
        '  polluted: yes',
        '  apiKey: yaml_proto_secret',
        'constructor:',
        '  prototype:',
        '    password: yaml_proto_password',
        'safe: ok',
      ].join('\n')

      const yamlToJson = sanitizeConfig(evilYaml, { outputFormat: 'json' })
      expect(yamlToJson.error).toBeNull()
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      expect(yamlToJson.output).not.toContain('yaml_proto_secret')
      expect(yamlToJson.output).not.toContain('yaml_proto_password')
    })

    it('rejects oversized (> 2MB) input and NUL-byte binary files fail-closed', () => {
      const binaryErr = validateRawInput('API_KEY=123\u0000binary')
      expect(binaryErr).toBeTruthy()

      const bigPayload = 'A'.repeat(MAX_INPUT_BYTES + 10)
      const sizeRes = sanitizeConfig(bigPayload)
      expect(sizeRes.error).toBeTruthy()
      expect(sizeRes.output).toBe('')
    })

    it('masks short secrets completely in audit findings and supports custom/ignore keys', () => {
      const input = [
        'SHORT_PIN=abcd12',
        'INTERNAL_CODE=my_custom_val_999',
        'TOKEN_NAME=bearer_label_public',
      ].join('\n')

      const res = sanitizeConfig(input, {
        customSecretKeys: ['INTERNAL_CODE'],
        ignoreKeys: ['TOKEN_NAME'],
      })

      expect(res.output).toContain('SHORT_PIN="<REDACTED>"')
      expect(res.output).toContain('INTERNAL_CODE="<REDACTED>"')
      expect(res.output).toContain('TOKEN_NAME=bearer_label_public')

      // findings に生のシークレット文字列が露出しないこと
      const findingsSerialized = JSON.stringify(res.findings)
      expect(findingsSerialized).not.toContain('abcd12')
      expect(findingsSerialized).not.toContain('my_custom_val_999')
      const pinFinding = res.findings.find((f) => f.location === 'SHORT_PIN')
      expect(pinFinding?.maskedPreview).toBe('••••••••')
    })

    it('builds safe sanitized filenames stripping traversal and control characters', () => {
      expect(buildSanitizedFilename('../../etc/.env.prod', 'env')).toBe(
        'sanitized-env.env'
      )
      expect(buildSanitizedFilename('..\\secret\\app.yaml', 'json')).toBe(
        'sanitized-app.json'
      )
      expect(buildSanitizedFilename(null, 'yaml')).toBe('sanitized-config.yaml')
    })
  })
})
