// ステージデータ（仕様書 v0.2 準拠、4ステージ）
export const stages = [
  {
    id: 'shopping_street',
    name: '商店街',
    description: '和菓子屋、たこ焼き屋、パン屋が並ぶ、にぎやかな商店街。',
    unlockCondition: null,
    enemyMonsterIds: [1, 4, 5, 7, 10, 13],
    bossMonsterId: 4,
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
    enemyMonsterIds: [2, 6, 8, 9, 11, 14, 15, 16, 18],
    bossMonsterId: 15,
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
    enemyMonsterIds: [3, 12, 17, 19],
    bossMonsterId: 19,
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
    enemyMonsterIds: [18, 19, 20],
    bossMonsterId: 20,
    backgroundEmoji: '✨',
    recommendedLevel: 18,
  },
]
