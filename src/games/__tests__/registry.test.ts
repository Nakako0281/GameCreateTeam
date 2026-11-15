import { describe, it, expect } from 'vitest'
import { GAME_REGISTRY } from '../registry'
import {
  STARTER_CLASSES,
  ENGRAVINGS,
  RELICS,
  ENEMY_TEMPLATES,
} from '../dice-forge-dungeon/data'

const EMOJI_REGEX =
  /[\p{Extended_Pictographic}\u2600-\u26FF\u2700-\u27BF\u{1F300}-\u{1FAFF}]/u

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

  it('【R-09 絵文字完全禁止】レジストリおよびゲームデータ定義にUnicode絵文字が1文字も含まれていないこと', () => {
    for (const game of GAME_REGISTRY) {
      expect(EMOJI_REGEX.test(game.title)).toBe(false)
      expect(EMOJI_REGEX.test(game.shortDescription)).toBe(false)
      expect(EMOJI_REGEX.test(game.howToPlay)).toBe(false)
      expect(EMOJI_REGEX.test(game.thumbnailEmoji ?? '')).toBe(false)
    }

    const serializedData = JSON.stringify({
      STARTER_CLASSES,
      ENGRAVINGS,
      RELICS,
      ENEMY_TEMPLATES,
    })
    expect(EMOJI_REGEX.test(serializedData)).toBe(false)
  })
})
