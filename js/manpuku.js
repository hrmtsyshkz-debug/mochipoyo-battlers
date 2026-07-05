// ボス満福度システム（仕様書 BOSS_MANPUKU_SPEC_v0.1 準拠）
// 満福度は「同じボスを何度も倒す・仲間にする」ことで得られる周回モチベーション要素。
// ステータスを直接大きく上げず、周回報酬/捕獲補助/見た目報酬/追加報酬枠に恩恵を寄せる。
import { getState, addItem, addGold } from "./state.js";
import { items } from "../data/items.js";

// 将来的に99へ拡張予定（備考欄）。現時点はMVPの30。
export const MANPUKU_MAX = 30; // Future: 99

// 対象4系統のメタ情報。表示名・進化名・専用進化アイテムidをここに集約する。
// 通常モンスターへ拡張する場合もこの配列にlineIdを追加するだけで流用できる設計。
export const MANPUKU_LINES = [
  {
    lineId: "mochina_line",
    bossName: "モチーナ",
    evolutionName: "モチモチーナ",
    itemId: "mochi_boss_ribbon",
    area: "商店街",
  },
  {
    lineId: "donutsun_line",
    bossName: "ドーナツン",
    evolutionName: "ドーナツィア",
    itemId: "sugar_ring",
    area: "フードコート",
  },
  {
    lineId: "yakinikumaru_line",
    bossName: "ヤキニクマル",
    evolutionName: "カルビーナ",
    itemId: "kongari_medal",
    area: "焼肉街",
  },
  {
    lineId: "buffeteria_line",
    bossName: "ビュッフェリア",
    evolutionName: "グランビュッフェリア",
    itemId: "fullness_crown",
    area: "伝説のビュッフェ",
  },
];

export function getManpukuLineMeta(lineId) {
  return MANPUKU_LINES.find((l) => l.lineId === lineId) || null;
}

// ---------- 満福度取得・加算 ----------

export function getBossManpuku(lineId) {
  const state = getState();
  return (state.bossManpuku && state.bossManpuku[lineId]) ?? 0;
}

// 上限で丸めて加算し、加算後の値を返す。
export function addBossManpuku(lineId, amount) {
  const state = getState();
  if (!state.bossManpuku) {
    state.bossManpuku = {};
  }
  const current = state.bossManpuku[lineId] ?? 0;
  const next = Math.min(MANPUKU_MAX, current + amount);
  state.bossManpuku[lineId] = next;
  return next;
}

// ---------- 段階判定 ----------

export function getManpukuMilestones(points) {
  return {
    itemDropBonus: points >= 5,
    captureBonus: points >= 10,
    frameUnlocked: points >= 20,
    rewardSlotBonus: points >= 30,
  };
}

// ---------- 満福ボーナス（満福度30の追加報酬枠） ----------
// 仕様書の重み表そのまま。重すぎる報酬にしないための重み付け。
const MANPUKU_BONUS_REWARDS = [
  { type: "gold", amount: 50, weight: 40 },
  { type: "item", itemId: "mini_sweet", amount: 1, weight: 25 },
  { type: "item", itemId: "poyo_potion", amount: 1, weight: 20 },
  { type: "item", itemId: "premium_cake", amount: 1, weight: 10 },
  { type: "bossEvolutionItem", amount: 1, weight: 5 },
];

function weightedPick(table) {
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}

// 満福ボーナスを1回抽選し、実際に付与する。lineIdはリーダーのlineId
// （bossEvolutionItemが当たった場合、リーダー自身の進化アイテムを渡すため）。
// 戻り値: { type, amount, itemId?, label, emoji } 表示用情報つき。
export function rollManpukuBonusReward(lineId) {
  const picked = weightedPick(MANPUKU_BONUS_REWARDS);

  if (picked.type === "gold") {
    addGold(picked.amount);
    return { type: "gold", amount: picked.amount, label: `${picked.amount} ゴールド`, emoji: "🪙" };
  }

  if (picked.type === "item") {
    addItem(picked.itemId, picked.amount);
    const item = items.find((i) => i.id === picked.itemId);
    const name = item ? item.name : picked.itemId;
    const emoji = item && item.emoji ? item.emoji : "🎁";
    return { type: "item", itemId: picked.itemId, amount: picked.amount, label: `${name} ×${picked.amount}`, emoji };
  }

  // bossEvolutionItem: リーダー自身のlineIdに対応する進化アイテムを渡す
  const meta = getManpukuLineMeta(lineId);
  const itemId = meta ? meta.itemId : null;
  if (!itemId) {
    // 万一lineIdが対象外だった場合はgoldにフォールバック（報酬なし化を避ける）
    addGold(50);
    return { type: "gold", amount: 50, label: "50 ゴールド", emoji: "🪙" };
  }
  addItem(itemId, picked.amount);
  const item = items.find((i) => i.id === itemId);
  const name = item ? item.name : itemId;
  const emoji = item && item.emoji ? item.emoji : "🎁";
  return { type: "bossEvolutionItem", itemId, amount: picked.amount, label: `${name} ×${picked.amount}`, emoji };
}

// ---------- 捕獲率補正 ----------

// 対象ボス系統の満福度が10以上なら+0.05。lineIdはenemyMaster.lineId。
export function getManpukuCaptureBonus(lineId) {
  if (!lineId) return 0;
  const manpuku = getBossManpuku(lineId);
  return manpuku >= 10 ? 0.05 : 0;
}

// ---------- 満福ボーナス判定（勝利時の追加報酬枠） ----------
// speciesはbattleState.playerInstanceが戦い抜いたユニットのspecies masterを渡す。
export function hasManpukuRewardBonus(species) {
  if (!species || !species.isBossEvolution) return false;
  const manpuku = getBossManpuku(species.lineId);
  return manpuku >= MANPUKU_MAX;
}
