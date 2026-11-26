import { describe, expect, it } from 'vitest'
import { buildSessionStartOutput } from '../../scripts/hooks/session-start.mjs'
import {
  evaluatePreToolGuard,
  isProtectedFilePath,
} from '../../scripts/hooks/pre-tool-guard.mjs'

describe('Antigravity harness hooks (Layer 1)', () => {
  describe('session-start hook', () => {
    it('stays silent on clean work branch with synchronized main/dev', () => {
      expect(
        buildSessionStartOutput({
          currentBranch: 'feat/example-tool',
          mainAheadBy: 0,
          devAheadBy: 5,
        })
      ).toEqual({})
    })

    it('injects systemMessage alert when origin/main is ahead of origin/dev or on protected branch', () => {
      const ahead = buildSessionStartOutput({
        currentBranch: 'dev',
        mainAheadBy: 2,
        devAheadBy: 12,
      })
      const msg = ahead.injectSteps?.[0]?.systemMessage?.systemMessage || ''
      expect(msg).toContain('origin/main is ahead of origin/dev by 2 commit(s)')
      expect(msg).toContain('protected branch "dev"')
    })
  })

  describe('pre-tool-guard hook', () => {
    const repoRoot = 'C:\\Users\\example\\repo'

    it('identifies protected constitutional, harness, CI, and legal files across OS path formats', () => {
      expect(isProtectedFilePath(`${repoRoot}\\AGENTS.md`, repoRoot)).toBe(true)
      expect(
        isProtectedFilePath('c:/users/example/repo/.agents/hooks.json', repoRoot)
      ).toBe(true)
      expect(
        isProtectedFilePath('scripts\\hooks\\pre-tool-guard.mjs', repoRoot)
      ).toBe(true)
      expect(isProtectedFilePath('.github/workflows/ci.yml', repoRoot)).toBe(true)
      expect(isProtectedFilePath('public/_headers', repoRoot)).toBe(true)
      expect(isProtectedFilePath('src/pages/privacy.astro', repoRoot)).toBe(true)
      expect(isProtectedFilePath('src/pages/terms.astro', repoRoot)).toBe(true)
      expect(isProtectedFilePath('C:\\Users\\example\\.gemini\\GEMINI.md', repoRoot)).toBe(true)

      expect(isProtectedFilePath(`${repoRoot}\\src\\pages\\index.astro`, repoRoot)).toBe(false)
      expect(isProtectedFilePath('docs/STATE.md', repoRoot)).toBe(false)
      expect(isProtectedFilePath('scripts/ops_github.mjs', repoRoot)).toBe(false)
    })

    it('forces human approval on protected file writes and allows normal files', () => {
      const protectedEdit = evaluatePreToolGuard(
        {
          toolCall: {
            name: 'edit_file',
            args: { Path: `${repoRoot}\\.agents\\hooks.json` },
          },
        },
        { currentBranch: 'feat/x', repoRoot }
      )
      expect(protectedEdit.decision).toBe('force_ask')

      const normalWrite = evaluatePreToolGuard(
        {
          toolCall: {
            name: 'write_file',
            args: { Path: `${repoRoot}\\src\\lib\\tools\\sample.ts` },
          },
        },
        { currentBranch: 'feat/x', repoRoot }
      )
      expect(normalWrite.decision).toBe('allow')
    })

    it('denies direct pushes/commits to main/dev and self-merging PRs', () => {
      const denyCommands = [
        { cmd: 'git push origin main', branch: 'feat/x' },
        { cmd: 'git push --force origin dev', branch: 'feat/x' },
        { cmd: 'git push origin HEAD:refs/heads/main', branch: 'feat/x' },
        { cmd: 'git push', branch: 'dev' },
        { cmd: 'git push origin HEAD', branch: 'main' },
        { cmd: 'git commit -m "oops"', branch: 'main' },
        { cmd: 'git commit -m "oops"', branch: 'dev' },
        { cmd: 'gh pr merge 64 --squash', branch: 'feat/x' },
        {
          cmd: 'node -e "fetch(\'https://api.github.com/repos/o/r/pulls/64/merge\')"',
          branch: 'feat/x',
        },
      ]

      for (const { cmd, branch } of denyCommands) {
        const res = evaluatePreToolGuard(
          { toolCall: { name: 'run_command', args: { CommandLine: cmd } } },
          { currentBranch: branch, repoRoot }
        )
        expect(res.decision, `Expected deny for: ${cmd} (branch=${branch})`).toBe('deny')
      }
    })

    it('requires force_ask for main merges, main PRs, exception flags, and shell mutations of protected files', () => {
      const forceAskCommands = [
        'git merge origin/main',
        'git rebase main',
        'node scripts/ops_github.mjs create-pr release/v1 "release" body.md main',
        'node scripts/ops_github.mjs create-pr feat/x "release" body.md --base main',
        'gh pr create --base main --title "release"',
        'node scripts/ops_github.mjs create-pr dev "release" body.md dev --allow-exception --reason "approved"',
        'Set-Content -Path .agents/hooks.json -Value "{}"',
        'rm -rf /tmp/unsafe-dir',
      ]

      for (const cmd of forceAskCommands) {
        const res = evaluatePreToolGuard(
          { toolCall: { name: 'run_command', args: { CommandLine: cmd } } },
          { currentBranch: 'feat/x', repoRoot }
        )
        expect(res.decision, `Expected force_ask for: ${cmd}`).toBe('force_ask')
      }
    })

    it('allows normal development commands including sync-main branch pushes and read-only checks', () => {
      const allowCommands = [
        'git push -u origin chore/sync-main-to-dev',
        'git push -u origin feat/governance-harness-and-rule-budget',
        'git commit -m "docs: explain merge main policy"',
        'Get-Content AGENTS.md',
        'node scripts/ops_github.mjs create-pr feat/x "feat: add tool" body.md dev',
        'npm run check:all',
        'rm -rf dist dist-ads',
      ]

      for (const cmd of allowCommands) {
        const res = evaluatePreToolGuard(
          { toolCall: { name: 'run_command', args: { CommandLine: cmd } } },
          { currentBranch: 'feat/x', repoRoot }
        )
        expect(res.decision, `Expected allow for: ${cmd}`).toBe('allow')
      }
    })
  })
})
