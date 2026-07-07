// ゲーム状態管理 + LocalStorage セーブ/ロード（ポケモン方式: species直参照、ボス進化対応）
import { species } from "../data/monsters.js";
import { items } from "../data/items.js";
import { skills } from "../data/skills.js";
import { stages, exStages } from "../data/stages.js";

export const SAVE_KEY = "mochipoyo_battlers_save_v2";
// SAVE_KEYは変更しない（絶対条件）。postGame追加に伴いversionのみ内部的に3へ上げる。
const SAVE_VERSION = 3;

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
    bossManpuku: {
      mochina_line: 0,
      donutsun_line: 0,
      yakinikumaru_line: 0,
      buffeteria_line: 0,
    },
    settings: {
      sound: true,
      reducedMotion: false,
      easyMiniGames: false,
    },
    postGame: createInitialPostGame(),
  };
}

// クリア後コンテンツ用フィールド（POSTGAME_SECRET_BOSS_SPEC_v0.1 準拠）
function createInitialPostGame() {
  return {
    version: 1,
    unlocked: false,
    exStagesCleared: [],
    stageMastery: {},
    secretBossPity: { "031": 0, "032": 0, "033": 0, "034": 0 },
    secretBossSeen: { "031": false, "032": false, "033": false, "034": false },
    secretBossDefeated: { "031": 0, "032": 0, "033": 0, "034": 0 },
    secretBossCaptured: { "031": 0, "032": 0, "033": 0, "034": 0 },
    missionsClaimed: {},
    titlesUnlocked: [],
  };
}

let state = createInitialSaveData();

// ---------- 基本参照 ----------

export function getState() {
  return state;
}

export function getMonsterMaster(speciesId) {
  return species.find((s) => s.speciesId === speciesId) || null;
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

export function getExStage(exStageId) {
  return exStages.find((s) => s.id === exStageId) || null;
}

// ---------- セーブ / ロード ----------

// v1(旧forms内包型)セーブは移行しない。v2キーが無ければ「セーブなし」として扱う。
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
    party: Array.isArray(parsed.party) ? parsed.party.map(normalizeMonsterInstance).filter(Boolean) : [],
    box: Array.isArray(parsed.box) ? parsed.box.map(normalizeMonsterInstance).filter(Boolean) : [],
    inventory:
      parsed.inventory && typeof parsed.inventory === "object" ? parsed.inventory : { ...base.inventory },
    dex: parsed.dex && typeof parsed.dex === "object" ? parsed.dex : {},
    clearedStages: Array.isArray(parsed.clearedStages) ? parsed.clearedStages : [],
    // 旧v2セーブ（bossManpukuなし）はベースの初期値で自動補完する（v3への移行は行わない）
    bossManpuku: {
      ...base.bossManpuku,
      ...(parsed.bossManpuku && typeof parsed.bossManpuku === "object" ? parsed.bossManpuku : {}),
    },
    settings: {
      ...base.settings,
      ...(parsed.settings || {}),
    },
  };
  return migratePostGame(normalized, parsed);
}

// クリア後コンテンツのマイグレーション（POSTGAME_SECRET_BOSS_SPEC_v0.1のmigratePostGame相当）。
// postGameフィールドの欠損を補完し、legend_buffetクリア済みなら unlocked=true にする。
// SAVE_KEYは変更せず、既存フィールド(player/party/box/inventory/dex/clearedStages/bossManpuku/settings)には一切触れない。
function migratePostGame(normalized, parsed) {
  const rawPostGame = parsed && typeof parsed.postGame === "object" && parsed.postGame !== null ? parsed.postGame : {};

  const postGame = {
    version: rawPostGame.version ?? 1,
    unlocked: rawPostGame.unlocked ?? false,
    exStagesCleared: Array.isArray(rawPostGame.exStagesCleared) ? rawPostGame.exStagesCleared : [],
    stageMastery: rawPostGame.stageMastery && typeof rawPostGame.stageMastery === "object" ? rawPostGame.stageMastery : {},
    secretBossPity:
      rawPostGame.secretBossPity && typeof rawPostGame.secretBossPity === "object" ? { ...rawPostGame.secretBossPity } : {},
    secretBossSeen:
      rawPostGame.secretBossSeen && typeof rawPostGame.secretBossSeen === "object" ? { ...rawPostGame.secretBossSeen } : {},
    secretBossDefeated:
      rawPostGame.secretBossDefeated && typeof rawPostGame.secretBossDefeated === "object"
        ? { ...rawPostGame.secretBossDefeated }
        : {},
    secretBossCaptured:
      rawPostGame.secretBossCaptured && typeof rawPostGame.secretBossCaptured === "object"
        ? { ...rawPostGame.secretBossCaptured }
        : {},
    missionsClaimed:
      rawPostGame.missionsClaimed && typeof rawPostGame.missionsClaimed === "object" ? rawPostGame.missionsClaimed : {},
    titlesUnlocked: Array.isArray(rawPostGame.titlesUnlocked) ? rawPostGame.titlesUnlocked : [],
  };

  for (const id of ["031", "032", "033", "034"]) {
    postGame.secretBossPity[id] ??= 0;
    postGame.secretBossSeen[id] ??= false;
    postGame.secretBossDefeated[id] ??= 0;
    postGame.secretBossCaptured[id] ??= 0;
  }

  if (normalized.clearedStages.includes("legend_buffet")) {
    postGame.unlocked = true;
  }

  normalized.postGame = postGame;
  return normalized;
}

// 不正/存在しないspeciesIdのインスタンスはnullを返し、呼び出し側でフィルタする
function normalizeMonsterInstance(instance) {
  if (!instance || typeof instance !== "object") return null;
  if (!getMonsterMaster(instance.speciesId)) return null;
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

function makeInstanceId(speciesId) {
  return `poyo_${String(speciesId).padStart(3, "0")}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export function createMonsterInstance(speciesId, level = 1) {
  const master = getMonsterMaster(speciesId);
  if (!master) return null;
  const stats = computeStatsAtLevel(master, level);
  return {
    instanceId: makeInstanceId(speciesId),
    speciesId,
    nickname: master.name,
    level,
    exp: 0,
    currentHp: stats.hp,
    stats,
  };
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

// masterのbaseStatsからlevel成長分のみを計算する（進化差分計算・チャレンジ再計算などに使用）
export function computeStatsForMasterAtLevel(master, level) {
  return computeStatsAtLevel(master, level);
}

// 後方互換名: フレンドバトル等で「species + level」からステータスを導出する用途
export function computeStatsForMasterAtLevelAndStage(master, level) {
  return computeStatsAtLevel(master, level);
}

// パーティに追加。3体以上ならボックスへ。戻り値: { instance, wentToBox }
export function addMonsterToPartyOrBox(speciesId, level = 1) {
  const instance = createMonsterInstance(speciesId, level);
  if (!instance) return null;
  if (state.party.length < 3) {
    state.party.push(instance);
  } else {
    state.box.push(instance);
  }
  discoverMonster(speciesId, { owned: true });
  updateDexMaxLevel(speciesId, level);
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

export function discoverMonster(speciesId, { owned = false } = {}) {
  // dexに存在しないspeciesIdは無視（存在しない種の定義は登録しない）
  if (!getMonsterMaster(speciesId)) return;
  const key = String(speciesId);
  const entry = state.dex[key] || {
    seen: false,
    owned: false,
    seenCount: 0,
    ownedCount: 0,
    maxLevel: 0,
  };
  entry.seen = true;
  if (owned) {
    // 捕獲/進化時は遭遇時に既にseenCountを加算済みなので二重カウントしない
    entry.owned = true;
    entry.ownedCount = (entry.ownedCount || 0) + 1;
  } else {
    entry.seenCount = (entry.seenCount || 0) + 1;
  }
  state.dex[key] = entry;
}

export function updateDexMaxLevel(speciesId, level) {
  const key = String(speciesId);
  const entry = state.dex[key];
  if (!entry) return;
  entry.maxLevel = Math.max(entry.maxLevel || 0, level);
}

export function getDexEntry(speciesId) {
  const key = String(speciesId);
  return (
    state.dex[key] || {
      seen: false,
      owned: false,
      seenCount: 0,
      ownedCount: 0,
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

// SECRET/SECRET_LEGENDは隠しボス用レア度（TODO: 数値は仮置き、チャッピー承認待ち）
const RARITY_BONUS = { S: 0, M: 3, L: 6, XL: 10, XXL: 15, LEGEND: 30, SECRET: 20, SECRET_LEGEND: 40 };

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
    updateDexMaxLevel(instance.speciesId, instance.level);
  }
  return levelUps;
}

// ---------- 進化（species方式・通常/ボス両対応） ----------

// 現在のspeciesに evolvesTo があり、evolveCondition.level をlevelが満たしていればtrue。
// ボス進化(itemId指定あり)はさらにアイテム所持数が1以上必要。
export function canEvolve(instance) {
  const master = getMonsterMaster(instance.speciesId);
  if (!master || !master.evolvesTo || !master.evolveCondition) return false;
  if (instance.level < master.evolveCondition.level) return false;
  if (master.evolveCondition.itemId && getItemCount(master.evolveCondition.itemId) <= 0) return false;
  return true;
}

// 進化実行: instance.speciesIdをevolvesToに変更し、nicknameが旧種名のままなら新種名に更新。
// ステータスは「現在stats - 旧speciesのレベル成長理論値」の差分（ごはん育成分）を保持し、
// 新speciesのレベル成長理論値に差分を加算して再計算する。currentHpは最大HPまで回復（確定仕様v0.4）。
// ボス進化はさらにevolveCondition.itemIdのアイテムを1個消費する。
export function evolveInstance(instance) {
  const fromMaster = getMonsterMaster(instance.speciesId);
  if (!fromMaster || !fromMaster.evolvesTo || !fromMaster.evolveCondition) return null;
  const toMaster = getMonsterMaster(fromMaster.evolvesTo);
  if (!toMaster) return null;

  if (instance.level < fromMaster.evolveCondition.level) return null;
  const itemId = fromMaster.evolveCondition.itemId;
  if (itemId) {
    if (getItemCount(itemId) <= 0) return null;
    useItem(itemId);
  }

  // ごはん育成分の差分を維持したまま新speciesの理論値に載せ替える
  const fromTheoretical = computeStatsAtLevel(fromMaster, instance.level);
  const toTheoretical = computeStatsAtLevel(toMaster, instance.level);
  const newStats = {};
  for (const key of ["hp", "poyoPower", "mochiDefense", "speed", "appetite", "charm"]) {
    const grownDiff = (instance.stats[key] || 0) - (fromTheoretical[key] || 0);
    newStats[key] = Math.max(1, Math.round((toTheoretical[key] || 0) + grownDiff));
  }

  const wasDefaultName = instance.nickname === fromMaster.name;
  instance.stats = newStats;
  instance.currentHp = newStats.hp; // 確定仕様v0.4: 進化時は最大HPまで回復する
  instance.speciesId = toMaster.speciesId;
  if (wasDefaultName || !instance.nickname) {
    instance.nickname = toMaster.name;
  }

  // 進化先speciesを図鑑に登録（seen + owned）
  discoverMonster(toMaster.speciesId, { owned: true });
  updateDexMaxLevel(toMaster.speciesId, instance.level);

  return { evolvedName: toMaster.name, master: toMaster };
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
    master: getMonsterMaster(instance.speciesId),
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

// ---------- パーティ編成（並び替え・ボックス移動） ----------

// パーティ内で1つ前（先頭側）に順序を上げる。既に先頭ならfalse。
export function movePartyMemberUp(instanceId) {
  const idx = state.party.findIndex((m) => m.instanceId === instanceId);
  if (idx <= 0) return false;
  const tmp = state.party[idx - 1];
  state.party[idx - 1] = state.party[idx];
  state.party[idx] = tmp;
  return true;
}

// パーティの個体をボックスへ移動する。最後の1体は移動できない。
export function moveToBox(instanceId) {
  if (state.party.length <= 1) return false;
  const idx = state.party.findIndex((m) => m.instanceId === instanceId);
  if (idx === -1) return false;
  const [instance] = state.party.splice(idx, 1);
  state.box.push(instance);
  return true;
}

// ボックスの個体をパーティへ移動する。パーティが3体のときは失敗する。
export function moveToParty(instanceId) {
  if (state.party.length >= 3) return false;
  const idx = state.box.findIndex((m) => m.instanceId === instanceId);
  if (idx === -1) return false;
  const [instance] = state.box.splice(idx, 1);
  state.party.push(instance);
  return true;
}

// ---------- にがす（おわかれ） ----------

const RELEASE_RARITY_BONUS = { S: 0, M: 10, L: 25, XL: 50, XXL: 80, LEGEND: 150 };

// ボックスの個体を「にがす」。ゴールドとおみやげ(food)アイテムを1個獲得して除去する。
// 戻り値: { goldGain, giftItem, name } または失敗時 null
export function releaseFromBox(instanceId) {
  const idx = state.box.findIndex((m) => m.instanceId === instanceId);
  if (idx === -1) return null;
  const instance = state.box[idx];
  const master = getMonsterMaster(instance.speciesId);
  const rarityBonus = master ? RELEASE_RARITY_BONUS[master.rarity] || 0 : 0;
  const goldGain = 20 + instance.level * 8 + rarityBonus;

  const foodItems = items.filter((i) => i.type === "food");
  const giftItem =
    foodItems.length > 0 ? foodItems[Math.floor(Math.random() * foodItems.length)] : null;

  const name = instance.nickname || (master ? master.name : "？？？");

  state.box.splice(idx, 1);
  addGold(goldGain);
  if (giftItem) {
    addItem(giftItem.id, 1);
  }

  return { goldGain, giftItem, name };
}
