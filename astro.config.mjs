import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

function readPackageVersion() {
  try {
    const raw = fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
    const parsed = JSON.parse(raw)
    return typeof parsed.version === 'string' && parsed.version.trim()
      ? parsed.version.trim()
      : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function resolveShortCommitSha() {
  const envSha =
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    ''
  if (envSha.trim()) {
    const cleaned = envSha.trim().toLowerCase().replace(/[^0-9a-z]/g, '').slice(0, 7)
    if (cleaned) return cleaned
  }
  try {
    const gitSha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const cleaned = gitSha.toLowerCase().replace(/[^0-9a-z]/g, '').slice(0, 7)
    return cleaned || 'local'
  } catch {
    return 'local'
  }
}

const appVersion = readPackageVersion()
const appCommitSha = resolveShortCommitSha()
const appBuiltAt = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`

export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_COMMIT_SHA__: JSON.stringify(appCommitSha),
      __APP_BUILT_AT__: JSON.stringify(appBuiltAt),
    },
  },
})
