// クリア後コンテンツ（EX探索・隠しボス・気配ゲージ・熟練度）
// POSTGAME_SECRET_BOSS_SPEC_v0.1 準拠。UIを持たず、状態操作とロジックのみを提供する。
import { getState, getMonsterMaster, getDexEntry } from "./state.js";
import { getBossManpuku } from "./manpuku.js";
import { species } from "../data/monsters.js";

// ---------- 気配ゲージ定数 ----------
export const SECRET_BOSS_PITY_MAX = 100;
export const SECRET_BOSS_PITY_GAIN = 10;

// ---------- 隠しボス出現率テーブル（仕様書の表をそのまま定数化） ----------
// bonus関数はsaveData/contextを受け取り、加算値を返す。
// context: { partyLeadMaster, dexOwnedCount, anyBossManpukuMax }
const SECRET_BOSS_CONFIGS = {
  "031": {
    speciesId: 31,
    baseRate: 0.05,
    cap: 0.2,
    bonuses: [
      (saveData, ctx) => (getStageMastery(saveData, ctx.exStage.id) >= 5 ? 0.02 : 0),
      (saveData, ctx) => (getStageMastery(saveData, ctx.exStage.id) >= 10 ? 0.03 : 0),
      (saveData, ctx) => (ctx.partyLeadMaster && ctx.partyLeadMaster.lineId === "mochina_line" ? 0.05 : 0),
      (saveData, ctx) => (isSpeciesOwned(10) || isSpeciesOwned(11) ? 0.03 : 0),
    ],
  },
  "032": {
    speciesId: 32,
    baseRate: 0.04,
    cap: 0.2,
    bonuses: [
      (saveData, ctx) => (getStageMastery(saveData, ctx.exStage.id) >= 5 ? 0.02 : 0),
      (saveData, ctx) => (getStageMastery(saveData, ctx.exStage.id) >= 10 ? 0.03 : 0),
      (saveData, ctx) =>
        ctx.partyLeadMaster &&
        ctx.partyLeadMaster.element &&
        (ctx.partyLeadMaster.element.includes("甘味") || ctx.partyLeadMaster.element.includes("乳製"))
          ? 0.04
          : 0,
      () => (isSpeciesOwned(26) ? 0.04 : 0),
    ],
  },
  "033": {
    speciesId: 33,
    baseRate: 0.04,
    cap: 0.2,
    bonuses: [
      (saveData, ctx) => (getStageMastery(saveData, ctx.exStage.id) >= 5 ? 0.02 : 0),
      (saveData, ctx) => (getStageMastery(saveData, ctx.exStage.id) >= 10 ? 0.03 : 0),
      (saveData, ctx) => (ctx.partyLeadMaster && ctx.partyLeadMaster.lineId === "yakinikumaru_line" ? 0.05 : 0),
      () => (isSpeciesOwned(27) || isSpeciesOwned(28) ? 0.03 : 0),
    ],
  },
  "034": {
    speciesId: 34,
    baseRate: 0.03,
    cap: 0.18,
    bonuses: [
      (saveData, ctx) => (getStageMastery(saveData, ctx.exStage.id) >= 5 ? 0.02 : 0),
      (saveData, ctx) => (getStageMastery(saveData, ctx.exStage.id) >= 10 ? 0.03 : 0),
      (saveData, ctx) => (getDexOwnedCount() >= 30 ? 0.05 : 0),
      (saveData, ctx) => (getAnyBossManpukuMax(saveData) >= 30 ? 0.05 : 0),
    ],
  },
};

// speciesId(数値) or dexNo文字列のどちらを渡してもdexNo文字列("031"等)に正規化してから引く。
// 気配ゲージ等のキーは仕様書どおりdexNo文字列で統一するため（裁定10）。
export function toDexNoString(idOrSpeciesId) {
  const n = Number(idOrSpeciesId);
  if (!Number.isFinite(n)) return String(idOrSpeciesId);
  return String(n).padStart(3, "0");
}

export function getSecretBossConfig(secretId) {
  return SECRET_BOSS_CONFIGS[toDexNoString(secretId)] || null;
}

// ---------- 熟練度 ----------

// ステージをクリアするたびに、そのステージIDの熟練度を+1する。通常/EXは別IDで管理する。
// saveData引数は state（セーブデータ全体。saveData.postGameを内部で参照する）を渡す。
export function addStageMastery(saveData, stageId, amount = 1) {
  const postGame = saveData.postGame;
  if (!postGame.stageMastery) postGame.stageMastery = {};
  postGame.stageMastery[stageId] ??= 0;
  postGame.stageMastery[stageId] += amount;
  return postGame.stageMastery[stageId];
}

export function getStageMastery(saveData, stageId) {
  const postGame = saveData && saveData.postGame;
  return (postGame && postGame.stageMastery && postGame.stageMastery[stageId]) || 0;
}

// ---------- 出現率計算に使う補助情報 ----------

function isSpeciesOwned(speciesId) {
  return getDexEntry(speciesId).owned === true;
}

function getDexOwnedCount() {
  return species.filter((s) => getDexEntry(s.speciesId).owned).length;
}

// 4系統のボス満福度のうち最大値（034の「any bossManpuku >= 30」用）
function getAnyBossManpukuMax(saveData) {
  const lineIds = ["mochina_line", "donutsun_line", "yakinikumaru_line", "buffeteria_line"];
  return Math.max(0, ...lineIds.map((lineId) => getBossManpuku(lineId)));
}

// 実際にバトルへ出る個体（パーティ先頭の生存個体）のspeciesを返す（裁定8）
export function getPartyLeadMaster(saveData) {
  const leader = saveData.party.find((m) => m.currentHp > 0);
  if (!leader) return null;
  return getMonsterMaster(leader.speciesId);
}

// ---------- 出現率計算 ----------

export function calculateSecretBossRate(saveData, config, context) {
  let rate = config.baseRate;
  for (const bonusFn of config.bonuses) {
    rate += bonusFn(saveData, context);
  }
  return Math.min(config.cap, rate);
}

// ---------- 034専用の追加条件 ----------
// 条件を満たしていない場合、気配ゲージも増やさない（isSecretBossEligibleの戻り値がfalseならtrySecretBossEncounterは何もしない）。
function isSecretBossEligible(saveData, config, context) {
  if (config.speciesId !== 34) return true;
  const clearedLegendBuffet = saveData.clearedStages.includes("legend_buffet");
  const dexOwnedCount = getDexOwnedCount();
  const anyBossManpukuMax = getAnyBossManpukuMax(saveData);
  return clearedLegendBuffet && dexOwnedCount >= 20 && anyBossManpukuMax >= 10;
}

// ---------- 隠しボス遭遇判定 ----------
// context: { exStage, partyLeadMaster }（partyLeadMasterは呼び出し側で省略可、内部でも再計算する）
// 戻り値: 出現した隠しボスのspeciesId、または遭遇なしならnull
export function trySecretBossEncounter(saveData, exStage) {
  const secretId = toDexNoString(exStage.secretBossSpeciesId);
  const config = getSecretBossConfig(secretId);
  if (!config) return null;

  const context = { exStage, partyLeadMaster: getPartyLeadMaster(saveData) };

  if (!isSecretBossEligible(saveData, config, context)) return null;

  const pity = saveData.postGame.secretBossPity[secretId] ?? 0;

  if (pity >= SECRET_BOSS_PITY_MAX) {
    saveData.postGame.secretBossPity[secretId] = 0;
    saveData.postGame.secretBossSeen[secretId] = true;
    return config.speciesId;
  }

  const rate = calculateSecretBossRate(saveData, config, context);
  const appeared = Math.random() < rate;

  if (appeared) {
    saveData.postGame.secretBossPity[secretId] = 0;
    saveData.postGame.secretBossSeen[secretId] = true;
    return config.speciesId;
  }

  saveData.postGame.secretBossPity[secretId] = Math.min(SECRET_BOSS_PITY_MAX, pity + SECRET_BOSS_PITY_GAIN);
  return null;
}

// ---------- EX報酬計算 ----------

// バトル勝利ゴールド×rewardMultiplier（floor）
export function applyExRewardMultiplier(baseGold, exStage) {
  const multiplier = (exStage && exStage.rewardMultiplier) || 1;
  return Math.floor(baseGold * multiplier);
}

// EX勝利時25%で追加アイテムドロップ（mini_sweet/poyo_potionからランダム1個）
const EX_BONUS_DROP_ITEM_IDS = ["mini_sweet", "poyo_potion"];
const EX_BONUS_DROP_RATE = 0.25;

export function rollExBonusDrop() {
  if (Math.random() >= EX_BONUS_DROP_RATE) return null;
  const itemId = EX_BONUS_DROP_ITEM_IDS[Math.floor(Math.random() * EX_BONUS_DROP_ITEM_IDS.length)];
  return { itemId, amount: 1 };
}

// ---------- 隠しボス撃破報酬 ----------
// ゴールド = 通常計算 × rewardMultiplier × 2、fruit_parfait×1確定、20%でrainbow_parfait×1
export function calculateSecretBossGold(baseGold, exStage) {
  const multiplier = (exStage && exStage.rewardMultiplier) || 1;
  return Math.floor(baseGold * multiplier * 2);
}

const SECRET_BOSS_RAINBOW_PARFAIT_RATE = 0.2;

export function rollSecretBossBonusDrop() {
  return Math.random() < SECRET_BOSS_RAINBOW_PARFAIT_RATE;
}

// ---------- EXステージ解放 ----------

export function isExStageUnlocked(saveData, exStage) {
  if (!exStage.unlockCondition) return true;
  return saveData.clearedStages.includes(exStage.unlockCondition.clearStageId);
}

// ---------- 気配文言（エリア別） ----------
export const SECRET_BOSS_HINT_TEXT = {
  "031": "もちもちした気配がする……",
  "032": "きらきら甘い気配がする……",
  "033": "香ばしい気配がする……",
  "034": "ただならぬ満腹の気配がする……",
};

// ---------- 図鑑ミッション土台（UIなし。データ構造のみ） ----------
export const postGameMissions = [
  {
    id: "clear_ex_1",
    title: "EX探索デビュー",
    description: "いずれかのEXステージを1回クリアする。",
    reward: { gold: 300 },
  },
  {
    id: "find_secret_1",
    title: "ひみつの気配",
    description: "隠しボスに1回遭遇する。",
    reward: { itemId: "premium_cake", amount: 2 },
  },
  {
    id: "capture_secret_1",
    title: "ひみつの仲間",
    description: "隠しボスを1体捕獲する。",
    reward: { itemId: "rainbow_parfait", amount: 1 },
  },
  {
    id: "mastery_10",
    title: "通い慣れたぽよ道",
    description: "いずれかのEXステージ熟練度を10にする。",
    reward: { gold: 1000 },
  },
];
