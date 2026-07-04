// ゲーム状態管理 + LocalStorage セーブ/ロード（仕様書 v0.2 準拠）
import { monsters } from "../data/monsters.js";
import { items } from "../data/items.js";
import { skills } from "../data/skills.js";
import { stages } from "../data/stages.js";

export const SAVE_KEY = "mochipoyo_battlers_save_v1";
const SAVE_VERSION = 1;

function createInitialSaveData() {
  return {
    version: SAVE_VERSION,
    player: {
      name: "プレイヤー",
      gold: 300,
      currentStageId: "shopping_street",
    },
    party: [],
    box: [],
    inventory: {
      mini_sweet: 5,
      poyo_potion: 3,
      strawberry_shortcake: 1,
    },
    dex: {},
    clearedStages: [],
    settings: {
      sound: true,
      reducedMotion: false,
    },
  };
}

let state = createInitialSaveData();

// ---------- 基本参照 ----------

export function getState() {
  return state;
}

export function getMonsterMaster(monsterId) {
  return monsters.find((m) => m.id === monsterId) || null;
}

export function getSkill(skillId) {
  return skills.find((s) => s.id === skillId) || null;
}

export function getItem(itemId) {
  return items.find((i) => i.id === itemId) || null;
}

export function getStage(stageId) {
  return stages.find((s) => s.id === stageId) || null;
}

// ---------- セーブ / ロード ----------

export function hasSaveData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return !!raw;
  } catch (e) {
    return false;
  }
}

// 新規ゲーム開始（セーブ枠だけ初期化。スターターはまだ選ばれていない状態）
export function newGame() {
  state = createInitialSaveData();
  saveGame();
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      console.warn("セーブデータの形式が不正です。新規データを使用します。");
      return false;
    }
    // 壊れたセーブへの防御的補完（エラーハンドリング仕様）
    state = normalizeSaveData(parsed);
    return true;
  } catch (e) {
    console.error("セーブデータの読み込みに失敗しました。新規データを使用します。", e);
    return false;
  }
}

// 欠けているフィールドを補い、壊れたセーブでも遊べるようにする
function normalizeSaveData(parsed) {
  const base = createInitialSaveData();
  const normalized = {
    version: SAVE_VERSION,
    player: {
      ...base.player,
      ...(parsed.player || {}),
    },
    party: Array.isArray(parsed.party) ? parsed.party.map(normalizeMonsterInstance) : [],
    box: Array.isArray(parsed.box) ? parsed.box.map(normalizeMonsterInstance) : [],
    inventory:
      parsed.inventory && typeof parsed.inventory === "object" ? parsed.inventory : { ...base.inventory },
    dex: parsed.dex && typeof parsed.dex === "object" ? parsed.dex : {},
    clearedStages: Array.isArray(parsed.clearedStages) ? parsed.clearedStages : [],
    settings: {
      ...base.settings,
      ...(parsed.settings || {}),
    },
  };
  return normalized;
}

// 旧セーブ互換: evolutionStage が無いインスタンスは evolved フラグから補完する（旧形式は単一進化のみ）
function normalizeMonsterInstance(instance) {
  if (!instance || typeof instance !== "object") return instance;
  if (typeof instance.evolutionStage !== "number") {
    instance.evolutionStage = instance.evolved ? 1 : 0;
  }
  instance.evolved = instance.evolutionStage > 0;
  return instance;
}

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("セーブに失敗しました", e);
  }
}

export function deleteSaveData() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    console.error("セーブの削除に失敗しました", e);
  }
  state = createInitialSaveData();
}

// ---------- モンスターインスタンス ----------

function makeInstanceId(monsterId) {
  return `poyo_${String(monsterId).padStart(3, "0")}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export function createMonsterInstance(monsterId, level = 1) {
  const master = getMonsterMaster(monsterId);
  if (!master) return null;
  const stats = computeStatsAtLevel(master, level);
  return {
    instanceId: makeInstanceId(monsterId),
    monsterId,
    nickname: master.name,
    level,
    exp: 0,
    currentHp: stats.hp,
    evolved: false,
    evolutionStage: 0,
    stats,
  };
}

// インスタンスの現在の進化形態(form)を返す。stage が forms の範囲外なら最後のformにクランプする。
export function getFormForInstance(master, instance) {
  if (!master || !Array.isArray(master.forms) || master.forms.length === 0) return null;
  const stage = instance && typeof instance.evolutionStage === "number" ? instance.evolutionStage : 0;
  const clampedStage = Math.max(0, Math.min(stage, master.forms.length - 1));
  return (
    master.forms.find((f) => f.evolutionStage === clampedStage) || master.forms[clampedStage] || master.forms[0]
  );
}

// レベル成長: +3/+1/+1/+1/+1/+1 (hp/poyoPower/mochiDefense/speed/appetite/charm) を (level-1) 回加算
function computeStatsAtLevel(master, level) {
  const growth = { hp: 3, poyoPower: 1, mochiDefense: 1, speed: 1, appetite: 1, charm: 1 };
  const stats = { ...master.baseStats };
  const steps = Math.max(0, level - 1);
  for (const key in growth) {
    stats[key] = stats[key] + growth[key] * steps;
  }
  return stats;
}

// パーティに追加。3体以上ならボックスへ。戻り値: { instance, wentToBox }
export function addMonsterToPartyOrBox(monsterId, level = 1) {
  const instance = createMonsterInstance(monsterId, level);
  if (!instance) return null;
  if (state.party.length < 3) {
    state.party.push(instance);
  } else {
    state.box.push(instance);
  }
  discoverMonster(monsterId, { captured: true });
  updateDexMaxLevel(monsterId, level);
  return instance;
}

export function findInstanceById(instanceId) {
  return (
    state.party.find((m) => m.instanceId === instanceId) ||
    state.box.find((m) => m.instanceId === instanceId) ||
    null
  );
}

// ---------- 図鑑 ----------

export function discoverMonster(monsterId, { captured = false } = {}) {
  // dexに存在しないモンスターIDは無視（存在しないモンスター定義は登録しない）
  if (!getMonsterMaster(monsterId)) return;
  const key = String(monsterId);
  const entry = state.dex[key] || {
    seen: false,
    captured: false,
    seenCount: 0,
    capturedCount: 0,
    maxLevel: 0,
  };
  entry.seen = true;
  if (captured) {
    // 捕獲時は遭遇時に既にseenCountを加算済みなので二重カウントしない
    entry.captured = true;
    entry.capturedCount = (entry.capturedCount || 0) + 1;
  } else {
    entry.seenCount = (entry.seenCount || 0) + 1;
  }
  state.dex[key] = entry;
}

export function updateDexMaxLevel(monsterId, level) {
  const key = String(monsterId);
  const entry = state.dex[key];
  if (!entry) return;
  entry.maxLevel = Math.max(entry.maxLevel || 0, level);
}

export function getDexEntry(monsterId) {
  const key = String(monsterId);
  return (
    state.dex[key] || {
      seen: false,
      captured: false,
      seenCount: 0,
      capturedCount: 0,
      maxLevel: 0,
    }
  );
}

// ---------- ゴールド ----------

export function addGold(amount) {
  state.player.gold = Math.max(0, state.player.gold + amount);
}

export function spendGold(amount) {
  if (state.player.gold < amount) return false;
  state.player.gold -= amount;
  return true;
}

// ---------- インベントリ ----------

export function getItemCount(itemId) {
  // inventoryに存在しないアイテムは0扱い
  return state.inventory[itemId] || 0;
}

export function useItem(itemId) {
  const count = getItemCount(itemId);
  if (count <= 0) return false;
  state.inventory[itemId] = count - 1;
  return true;
}

export function addItem(itemId, count = 1) {
  state.inventory[itemId] = getItemCount(itemId) + count;
}

// ---------- 経験値・レベルアップ ----------

const RARITY_BONUS = { S: 0, M: 3, L: 6, XL: 10, XXL: 15, LEGEND: 30 };

export function calcExpGain(enemyMaster, enemyLevel) {
  const bonus = RARITY_BONUS[enemyMaster.rarity] || 0;
  return enemyLevel * 10 + bonus;
}

export function expToNextLevel(level) {
  return 20 + level * 10;
}

// 経験値を加算し、レベルアップ回数を返す。HP最大値上昇分はcurrentHpにも加算する。
export function gainExp(instance, expAmount) {
  let levelUps = 0;
  instance.exp += expAmount;
  let needed = expToNextLevel(instance.level);
  while (instance.exp >= needed && instance.level < 100) {
    instance.exp -= needed;
    instance.level += 1;
    levelUps += 1;
    const prevMaxHp = instance.stats.hp;
    instance.stats.hp += 3;
    instance.stats.poyoPower += 1;
    instance.stats.mochiDefense += 1;
    instance.stats.speed += 1;
    instance.stats.appetite += 1;
    instance.stats.charm += 1;
    const hpDiff = instance.stats.hp - prevMaxHp;
    instance.currentHp += hpDiff;
    needed = expToNextLevel(instance.level);
  }
  if (levelUps > 0) {
    updateDexMaxLevel(instance.monsterId, instance.level);
  }
  return levelUps;
}

// ---------- 進化（forms対応・多段進化サポート） ----------

// 現在のformの次(stage+1)が存在し、そのconditionLevelをlevelが満たしていればtrue
export function canEvolve(instance) {
  const master = getMonsterMaster(instance.monsterId);
  if (!master || !Array.isArray(master.forms)) return false;
  const currentStage = instance.evolutionStage || 0;
  const nextForm = master.forms.find((f) => f.evolutionStage === currentStage + 1);
  if (!nextForm) return false;
  return instance.level >= nextForm.conditionLevel;
}

// 進化実行: ニックネームを次formの名前に変更し、ステータスを+15%程度底上げ、evolutionStageを進める
export function evolveInstance(instance) {
  const master = getMonsterMaster(instance.monsterId);
  if (!master || !Array.isArray(master.forms)) return null;
  const currentStage = instance.evolutionStage || 0;
  const nextForm = master.forms.find((f) => f.evolutionStage === currentStage + 1);
  if (!nextForm) return null;

  const evolvedName = nextForm.name;
  const hpRatio = instance.stats.hp > 0 ? instance.currentHp / instance.stats.hp : 1;

  const EVOLUTION_BOOST = 1.15; // TODO: 仮置きの進化ステータス倍率（仕様書は「少し上げる」の目安のみ規定）
  for (const key of ["hp", "poyoPower", "mochiDefense", "speed", "appetite", "charm"]) {
    instance.stats[key] = Math.round(instance.stats[key] * EVOLUTION_BOOST);
  }
  instance.currentHp = Math.max(1, Math.round(instance.stats.hp * hpRatio));
  instance.nickname = evolvedName;
  instance.evolutionStage = nextForm.evolutionStage;
  instance.evolved = instance.evolutionStage > 0;

  // 図鑑に進化情報を記録（進化済みであることをdexエントリにも残す）
  const key = String(instance.monsterId);
  const entry = state.dex[key];
  if (entry) {
    entry.evolved = true;
    entry.evolvedName = evolvedName;
    entry.evolvedStage = nextForm.evolutionStage;
  }

  return { evolvedName, master, form: nextForm };
}

// ---------- ステージ解放 ----------

export function isStageUnlocked(stage) {
  if (!stage.unlockCondition) return true;
  return state.clearedStages.includes(stage.unlockCondition.clearStageId);
}

export function markStageCleared(stageId) {
  if (!state.clearedStages.includes(stageId)) {
    state.clearedStages.push(stageId);
  }
}

// ---------- 育成（food） ----------

// statChangeを恒久加算。最低1未満にならないようにする。HP最大値増加時はcurrentHpも増加。
export function applyFoodToInstance(instance, item) {
  if (!item || item.type !== "food" || !item.statChange) return;
  const prevMaxHp = instance.stats.hp;
  for (const key in item.statChange) {
    const delta = item.statChange[key];
    const next = (instance.stats[key] || 0) + delta;
    instance.stats[key] = Math.max(1, next);
  }
  if (instance.stats.hp > prevMaxHp) {
    instance.currentHp += instance.stats.hp - prevMaxHp;
  } else if (instance.currentHp > instance.stats.hp) {
    instance.currentHp = instance.stats.hp;
  }
}

// ---------- パーティヘルパー ----------

export function getPartyWithMaster() {
  return state.party.map((instance) => ({
    instance,
    master: getMonsterMaster(instance.monsterId),
  }));
}

// currentHpが0以下のパーティモンスターを全回復する（ホームで少し回復、TODO: 「少し」の割合は仮に全回復とする）
export function reviveFaintedParty() {
  let revived = false;
  state.party.forEach((instance) => {
    if (instance.currentHp <= 0) {
      instance.currentHp = instance.stats.hp;
      revived = true;
    }
  });
  return revived;
}
