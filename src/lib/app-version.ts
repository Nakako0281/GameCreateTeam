declare const __APP_VERSION__: string | undefined
declare const __APP_COMMIT_SHA__: string | undefined
declare const __APP_BUILT_AT__: string | undefined

export interface AppVersionInfo {
  version: string
  commitSha: string
  displayLabel: string
  metaContent: string
  builtAt: string
}

/**
 * ビルド時注入値またはフォールバック文字列から正規化されたバージョン表記を生成する。
 */
export function formatAppVersion(
  version: string,
  commitSha: string,
  builtAt = ''
): AppVersionInfo {
  const cleanVer = version.trim().replace(/^v+/i, '') || '0.0.0'
  const cleanSha =
    commitSha
      .trim()
      .toLowerCase()
      .replace(/[^0-9a-z]/g, '')
      .slice(0, 7) || 'local'

  return {
    version: cleanVer,
    commitSha: cleanSha,
    displayLabel: `v${cleanVer} (${cleanSha})`,
    metaContent: `v${cleanVer}+${cleanSha}`,
    builtAt: builtAt.trim(),
  }
}

/**
 * Astro/Vite の build-time define から現在ビルドのバージョン情報を取得する。
 */
export function getAppVersionInfo(): AppVersionInfo {
  const rawVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
  const rawSha = typeof __APP_COMMIT_SHA__ !== 'undefined' ? __APP_COMMIT_SHA__ : 'local'
  const rawBuiltAt = typeof __APP_BUILT_AT__ !== 'undefined' ? __APP_BUILT_AT__ : ''
  return formatAppVersion(rawVersion, rawSha, rawBuiltAt)
}
