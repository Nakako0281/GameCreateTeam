import { describe, expect, it } from 'vitest'
import { formatAppVersion } from '../app-version'

describe('formatAppVersion', () => {
  it('formats standard semver and 7-char commit SHA', () => {
    const info = formatAppVersion('0.2.0', 'abcdef1234567', '2026-11-22 06:50 UTC')
    expect(info).toEqual({
      version: '0.2.0',
      commitSha: 'abcdef1',
      displayLabel: 'v0.2.0 (abcdef1)',
      metaContent: 'v0.2.0+abcdef1',
      builtAt: '2026-11-22 06:50 UTC',
    })
  })

  it('strips leading v from version and normalizes uppercase SHA', () => {
    const info = formatAppVersion('v1.3.4', 'A1B2C3D999')
    expect(info.displayLabel).toBe('v1.3.4 (a1b2c3d)')
    expect(info.metaContent).toBe('v1.3.4+a1b2c3d')
  })

  it('falls back safely when version or SHA is empty or invalid', () => {
    const info = formatAppVersion('', '---invalid---')
    expect(info.version).toBe('0.0.0')
    expect(info.commitSha).toBe('invalid')
    expect(info.displayLabel).toBe('v0.0.0 (invalid)')

    const emptySha = formatAppVersion('  ', '!!!')
    expect(emptySha.displayLabel).toBe('v0.0.0 (local)')
    expect(emptySha.metaContent).toBe('v0.0.0+local')
  })
})
