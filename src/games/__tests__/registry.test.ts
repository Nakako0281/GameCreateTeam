import { describe, it, expect } from 'vitest'
import { GAME_REGISTRY } from '../registry'

describe('GAME_REGISTRY 整合性テスト', () => {
  it('少なくとも1つ以上のゲームが登録されていること', () => {
    expect(GAME_REGISTRY.length).toBeGreaterThan(0)
  })

  it('すべてのゲームIDが一意（重複なし）かつURLセーフであること', () => {
    const ids = GAME_REGISTRY.map((g) => g.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)

    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('すべてのゲームに必須メタデータ（タイトル・紹介文・遊び方・タグ・日付）が設定されていること', () => {
    for (const game of GAME_REGISTRY) {
      expect(game.title.trim().length).toBeGreaterThan(0)
      expect(game.shortDescription.trim().length).toBeGreaterThan(0)
      expect(game.howToPlay.trim().length).toBeGreaterThan(0)
      expect(game.tags.length).toBeGreaterThan(0)
      expect(game.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(game.component).toBeDefined()
    }
  })
})
