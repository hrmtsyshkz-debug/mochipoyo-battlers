// ステージデータ（仕様書 v0.2 準拠、4ステージ）
// enemySpeciesIds / bossSpeciesId は species.speciesId を参照する。
// bossDropItemId: ボス勝利時に毎回1個ドロップするボス進化アイテム。
export const stages = [
  {
    id: 'shopping_street',
    name: '商店街',
    description: '和菓子屋、たこ焼き屋、パン屋が並ぶ、にぎやかな商店街。',
    unlockCondition: null,
    enemySpeciesIds: [1, 10, 12, 14, 17, 20],
    bossSpeciesId: 10,
    bossDropItemId: 'mochi_boss_ribbon',
    backgroundEmoji: '🏮',
    recommendedLevel: 1,
  },
  {
    id: 'food_court',
    name: 'フードコート',
    description:
      'ラーメン、ポテト、アイス、カレーの香りが集まる明るいフードコート。',
    unlockCondition: {
      clearStageId: 'shopping_street',
    },
    enemySpeciesIds: [4, 13, 15, 16, 18, 21, 22, 24, 26],
    bossSpeciesId: 22,
    bossDropItemId: 'sugar_ring',
    backgroundEmoji: '🍽️',
    recommendedLevel: 5,
  },
  {
    id: 'yakiniku_street',
    name: '焼肉街',
    description: '夜のネオンが輝き、香ばしい匂いがただよう焼肉街。',
    unlockCondition: {
      clearStageId: 'food_court',
    },
    enemySpeciesIds: [7, 19, 25, 27],
    bossSpeciesId: 27,
    bossDropItemId: 'kongari_medal',
    backgroundEmoji: '🥩',
    recommendedLevel: 10,
  },
  {
    id: 'legend_buffet',
    name: '伝説のビュッフェ',
    description: 'すべての食の幸せが集まると言われる幻のビュッフェ会場。',
    unlockCondition: {
      clearStageId: 'yakiniku_street',
    },
    enemySpeciesIds: [26, 27, 29],
    bossSpeciesId: 29,
    bossDropItemId: 'fullness_crown',
    backgroundEmoji: '✨',
    recommendedLevel: 18,
  },
]
