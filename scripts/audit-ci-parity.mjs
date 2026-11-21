#!/usr/bin/env node
/**
 * CI環境・Nodeバージョン・package-lock.json 整合性監査
 * ローカル環境とGitHub Actions CIの環境乖離およびロックファイル不整合による npm ci 失敗を未然に防ぐ。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const errors = []

// 1. .node-version と実行中Nodeメジャーバージョン一致確認
const nodeVersionFile = path.join(ROOT, '.node-version')
if (!fs.existsSync(nodeVersionFile)) {
  errors.push('[CI Parity] .node-version is missing at repository root')
} else {
  const expectedMajor = fs.readFileSync(nodeVersionFile, 'utf-8').trim().split('.')[0]
  const currentMajor = process.versions.node.split('.')[0]
  if (!/^\d+$/.test(expectedMajor)) {
    errors.push(`[CI Parity] Invalid .node-version content: "${expectedMajor}"`)
  } else if (expectedMajor !== currentMajor) {
    errors.push(
      `[CI Parity] Local Node major v${currentMajor} does not match .node-version v${expectedMajor}`
    )
  }
}

// 2. GitHub Actions ワークフローが .node-version を単一ソースとして参照しているか確認
const workflowsDir = path.join(ROOT, '.github', 'workflows')
if (fs.existsSync(workflowsDir)) {
  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  for (const wf of workflowFiles) {
    const wfPath = path.join(workflowsDir, wf)
    const content = fs.readFileSync(wfPath, 'utf-8')
    if (content.includes('actions/setup-node')) {
      if (!/node-version-file:\s*['"]?\.node-version['"]?/.test(content)) {
        errors.push(
          `[CI Parity] .github/workflows/${wf} must use node-version-file: '.node-version'`
        )
      }
      if (/^\s*node-version\s*:/m.test(content)) {
        errors.push(
          `[CI Parity] .github/workflows/${wf} has hardcoded node-version: instead of .node-version`
        )
      }
    }
  }
}

// 3. package.json と package-lock.json の整合確認
const pkgPath = path.join(ROOT, 'package.json')
const lockPath = path.join(ROOT, 'package-lock.json')

if (!fs.existsSync(lockPath)) {
  errors.push('[Lockfile] package-lock.json is missing')
} else {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
  const lockRoot = lock.packages?.['']

  if (!lock.lockfileVersion || lock.lockfileVersion < 3) {
    errors.push(
      `[Lockfile] Expected lockfileVersion >= 3, got ${lock.lockfileVersion}`
    )
  }
  if (!lockRoot) {
    errors.push('[Lockfile] Root entry "" missing in package-lock.json')
  } else {
    for (const section of ['dependencies', 'devDependencies']) {
      const pkgDeps = pkg[section] || {}
      const lockDeps = lockRoot[section] || {}
      const pkgKeys = Object.keys(pkgDeps).sort()
      const lockKeys = Object.keys(lockDeps).sort()

      if (JSON.stringify(pkgKeys) !== JSON.stringify(lockKeys)) {
        errors.push(
          `[Lockfile] ${section} keys differ between package.json and package-lock.json`
        )
      } else {
        for (const k of pkgKeys) {
          if (pkgDeps[k] !== lockDeps[k]) {
            errors.push(
              `[Lockfile] ${section}.${k} range differs (${pkgDeps[k]} vs ${lockDeps[k]})`
            )
          }
        }
      }
    }
  }

  // 4. ロックファイル内の esbuild / vite 解決整合性と optional platform パッケージ網羅検査
  const lockPackages = lock.packages || {}

  function resolveLockPackage(fromPkgKey, depName) {
    let prefix = fromPkgKey ? `${fromPkgKey}/` : ''
    while (true) {
      const candidate = `${prefix}node_modules/${depName}`
      if (lockPackages[candidate]) {
        return { key: candidate, entry: lockPackages[candidate] }
      }
      if (!prefix) break
      const trimmed = prefix.slice(0, -1)
      const idx = trimmed.lastIndexOf('/node_modules/')
      prefix = idx >= 0 ? `${trimmed.slice(0, idx)}/` : ''
    }
    return null
  }

  function parseSemver(v) {
    const m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)/)
    if (!m) return null
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
  }

  function satisfiesSimpleCaretOrOr(version, range) {
    const parsed = parseSemver(version)
    if (!parsed) return true
    const branches = String(range)
      .split('||')
      .map((s) => s.trim())
      .filter(Boolean)
    return branches.some((branch) => {
      const m = branch.match(/^\^?(\d+)\.(\d+)\.(\d+)/)
      if (!m) return true
      const reqMajor = Number(m[1])
      const reqMinor = Number(m[2])
      const reqPatch = Number(m[3])
      if (reqMajor === 0) {
        return (
          parsed.major === 0 &&
          parsed.minor === reqMinor &&
          parsed.patch >= reqPatch
        )
      }
      return (
        parsed.major === reqMajor &&
        (parsed.minor > reqMinor ||
          (parsed.minor === reqMinor && parsed.patch >= reqPatch))
      )
    })
  }

  for (const [pkgKey, meta] of Object.entries(lockPackages)) {
    const reqDeps = meta.dependencies || {}
    const reqPeers = meta.peerDependencies || {}
    const peerMeta = meta.peerDependenciesMeta || {}

    for (const criticalDep of ['esbuild', 'vite']) {
      if (reqDeps[criticalDep]) {
        const resolved = resolveLockPackage(pkgKey, criticalDep)
        if (!resolved) {
          errors.push(
            `[Lockfile] ${pkgKey || '(root)'} requires ${criticalDep}@${reqDeps[criticalDep]} but no resolved entry exists in package-lock.json`
          )
        } else if (
          !satisfiesSimpleCaretOrOr(resolved.entry.version, reqDeps[criticalDep])
        ) {
          errors.push(
            `[Lockfile] Version mismatch for ${pkgKey || '(root)'} -> ${criticalDep}@${reqDeps[criticalDep]} resolved to ${resolved.key}@${resolved.entry.version}`
          )
        }
      }

      if (reqPeers[criticalDep]) {
        const resolvedPeer = resolveLockPackage(pkgKey, criticalDep)
        const isOptional = Boolean(peerMeta[criticalDep]?.optional)
        if (!resolvedPeer && !isOptional) {
          errors.push(
            `[Lockfile] ${pkgKey || '(root)'} requires non-optional peer ${criticalDep}@${reqPeers[criticalDep]} but none exists in package-lock.json`
          )
        } else if (
          resolvedPeer &&
          !satisfiesSimpleCaretOrOr(resolvedPeer.entry.version, reqPeers[criticalDep])
        ) {
          errors.push(
            `[Lockfile] Peer conflict for ${pkgKey || '(root)'} -> peer ${criticalDep}@${reqPeers[criticalDep]} resolved to incompatible ${resolvedPeer.key}@${resolvedPeer.entry.version}`
          )
        }
      }
    }

    if (pkgKey.endsWith('/esbuild') && meta.optionalDependencies) {
      for (const [optName, optVer] of Object.entries(meta.optionalDependencies)) {
        const resolvedOpt = resolveLockPackage(pkgKey, optName)
        if (!resolvedOpt) {
          errors.push(
            `[Lockfile] Missing optional binary ${optName}@${optVer} required by ${pkgKey}`
          )
        } else if (resolvedOpt.entry.version !== optVer) {
          errors.push(
            `[Lockfile] Optional binary version drift for ${optName}: expected ${optVer}, got ${resolvedOpt.entry.version}`
          )
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error('audit:ci-parity FAILED:')
  for (const err of errors) {
    console.error(`  - ${err}`)
  }
  process.exit(1)
}

console.log(
  `audit:ci-parity PASSED (Node v${process.versions.node.split('.')[0]}, workflows, and package-lock.json integrity verified).`
)
