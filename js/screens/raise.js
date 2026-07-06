// 育成画面
import { items } from "../../data/items.js";
import {
  getState,
  getPartyWithMaster,
  getMonsterMaster,
  getItem,
  getItemCount,
  useItem,
  applyFoodToInstance,
  canEvolve,
  evolveInstance,
  saveGame,
} from "../state.js";
import { monsterAvatarHtml, monsterFullArtHtml, showToast, displayName } from "../ui.js";
import { showEvolution } from "./evolution.js";
import { playSfx } from "../audio.js";

let selectedInstanceId = null;

// パーティ＋ボックスの全所持モンスターを育成対象にする
function getAllOwnedWithMaster() {
  const state = getState();
  const partyInfo = getPartyWithMaster();
  const boxInfo = state.box.map((instance) => ({
    instance,
    master: getMonsterMaster(instance.speciesId),
    inBox: true,
  }));
  return [...partyInfo, ...boxInfo];
}

export function renderRaise(navigate) {
  const screen = document.getElementById("screen-raise");
  const partyInfo = getAllOwnedWithMaster();

  if (partyInfo.length === 0) {
    screen.innerHTML = `
      <div class="top-bar">
        <button class="back-btn" id="btn-back">← もどる</button>
        <h1 style="margin:0;">いくせい</h1>
      </div>
      <div class="empty-state">てもちの もちぽよが いないよ</div>
    `;
    screen.querySelector("#btn-back").addEventListener("click", () => navigate("home"));
    return;
  }

  if (!selectedInstanceId || !partyInfo.find((p) => p.instance.instanceId === selectedInstanceId)) {
    selectedInstanceId = partyInfo[0].instance.instanceId;
  }

  screen.innerHTML = `
    <div class="top-bar">
      <button class="back-btn" id="btn-back">← もどる</button>
      <h1 style="margin:0;">いくせい</h1>
    </div>
    <p>もちぽよを えらんで ごはんを あげよう。</p>
    <div class="raise-select" id="raise-select"></div>
    <div id="raise-detail-wrap"></div>
  `;

  screen.querySelector("#btn-back").addEventListener("click", () => navigate("home"));

  const selectRow = screen.querySelector("#raise-select");
  partyInfo.forEach(({ instance, master, inBox }) => {
    const card = document.createElement("div");
    card.className = "monster-card" + (instance.instanceId === selectedInstanceId ? " selected" : "");
    card.innerHTML = `
      ${monsterAvatarHtml(master)}
      <div class="monster-name">${displayName(instance, master)}</div>
      <div class="monster-level">Lv.${instance.level}${inBox ? " 📦" : ""}</div>
      ${canEvolve(instance) ? `<div class="evolve-tag">しんか！</div>` : ""}
    `;
    card.addEventListener("click", () => {
      selectedInstanceId = instance.instanceId;
      renderRaise(navigate);
    });
    selectRow.appendChild(card);
  });

  renderDetail(navigate);
}

function renderDetail(navigate) {
  const wrap = document.getElementById("raise-detail-wrap");
  const partyInfo = getAllOwnedWithMaster();
  const found = partyInfo.find((p) => p.instance.instanceId === selectedInstanceId);
  if (!found) return;
  const { instance, master } = found;

  const needed = 20 + instance.level * 10;
  const expPct = Math.min(100, Math.round((instance.exp / needed) * 100));
  const evolvable = canEvolve(instance);
  const nextMaster = master.evolvesTo ? getMonsterMaster(master.evolvesTo) : null;

  let evolveSectionHtml = "";
  if (nextMaster && master.evolveCondition) {
    const isBossEvolution = !!master.evolveCondition.itemId;
    if (isBossEvolution) {
      const evoItem = getItem(master.evolveCondition.itemId);
      const itemName = evoItem ? evoItem.name : master.evolveCondition.itemId;
      const itemEmoji = evoItem && evoItem.emoji ? evoItem.emoji : "🎁";
      const itemCount = getItemCount(master.evolveCondition.itemId);
      evolveSectionHtml = evolvable
        ? `<button class="btn btn-yellow btn-block" id="btn-evolve">✨ ${nextMaster.name}に ボスしんか！（${itemEmoji}${itemName}をつかう）✨</button>`
        : `<p class="hint-text">しんか条件: Lv.${master.evolveCondition.level} + ${itemEmoji}${itemName} が ひつよう（もちもの: ${itemCount}こ）</p>`;
    } else {
      evolveSectionHtml = evolvable
        ? `<button class="btn btn-yellow btn-block" id="btn-evolve">✨ ${nextMaster.name}に しんかする！ ✨</button>`
        : `<p class="hint-text">しんか条件: Lv.${master.evolveCondition.level}（${nextMaster.name}へ）</p>`;
    }
  } else if (master.evolvesFrom) {
    evolveSectionHtml = `<p class="hint-text">✨ しんかずみ</p>`;
  }

  wrap.innerHTML = `
    <div class="raise-detail">
      ${monsterFullArtHtml(master)}
      <h2>${displayName(instance, master)}</h2>
      <p>Lv.${instance.level}　HP ${Math.max(0, instance.currentHp)} / ${instance.stats.hp}</p>
      <div class="exp-bar-outer"><div class="exp-bar-inner" style="width:${expPct}%;"></div></div>
      <p class="hint-text">つぎのレベルまで ${Math.max(0, needed - instance.exp)} EXP</p>
      <div class="stat-list">
        <div class="stat-row"><span>HP</span><span>${instance.stats.hp}</span></div>
        <div class="stat-row"><span>ぽよ力</span><span>${instance.stats.poyoPower}</span></div>
        <div class="stat-row"><span>もち耐性</span><span>${instance.stats.mochiDefense}</span></div>
        <div class="stat-row"><span>すばやさ</span><span>${instance.stats.speed}</span></div>
        <div class="stat-row"><span>食欲</span><span>${instance.stats.appetite}</span></div>
        <div class="stat-row"><span>かわいさ</span><span>${instance.stats.charm}</span></div>
      </div>
      ${evolveSectionHtml}
      <h3>ごはんを あげる</h3>
      <div class="food-grid" id="food-grid"></div>
      <h3>かいふくアイテム</h3>
      <div class="food-grid" id="heal-grid"></div>
    </div>
  `;

  const evolveBtn = wrap.querySelector("#btn-evolve");
  if (evolveBtn) {
    evolveBtn.addEventListener("click", () => {
      const evolvedInfo = evolveInstance(instance);
      saveGame();
      if (evolvedInfo) {
        showEvolution(evolvedInfo, () => renderRaise(navigate));
      }
    });
  }

  const foodGrid = wrap.querySelector("#food-grid");
  const foodItems = items.filter((item) => item.type === "food");
  foodItems.forEach((item) => {
    const count = getItemCount(item.id);
    const btn = document.createElement("button");
    btn.className = "food-btn";
    btn.disabled = count <= 0;
    const changeText = Object.entries(item.statChange)
      .map(([k, v]) => `${statLabel(k)}${v > 0 ? "+" : ""}${v}`)
      .join(" ");
    btn.innerHTML = `
      <span class="food-emoji">🍽️</span>
      <span class="food-info">
        ${item.name}<br/>
        <span class="food-count">${changeText} / のこり${count}こ</span>
      </span>
    `;
    btn.addEventListener("click", () => feedItem(item, instance, navigate));
    foodGrid.appendChild(btn);
  });

  const healGrid = wrap.querySelector("#heal-grid");
  const healItems = items.filter((item) => item.type === "heal");
  const hpFull = instance.currentHp >= instance.stats.hp;
  healItems.forEach((item) => {
    const count = getItemCount(item.id);
    const btn = document.createElement("button");
    btn.className = "food-btn";
    btn.disabled = count <= 0 || hpFull;
    btn.innerHTML = `
      <span class="food-emoji">${item.id === "big_poyo_potion" ? "🧃" : "🥤"}</span>
      <span class="food-info">
        ${item.name}<br/>
        <span class="food-count">HP+${item.healAmount} / のこり${count}こ${hpFull ? "（HPまんたん）" : ""}</span>
      </span>
    `;
    btn.addEventListener("click", () => useHealItem(item, instance, navigate));
    healGrid.appendChild(btn);
  });
}

function useHealItem(item, instance, navigate) {
  if (instance.currentHp >= instance.stats.hp) {
    showToast("HPは まんたんだよ！");
    return;
  }
  const success = useItem(item.id);
  if (!success) {
    showToast("アイテムが たりないよ！");
    return;
  }
  const before = Math.max(0, instance.currentHp);
  instance.currentHp = Math.min(instance.stats.hp, before + item.healAmount);
  showToast(`${instance.nickname}の HPが ${instance.currentHp - before} かいふくした！`);
  saveGame();
  renderRaise(navigate);
}

function statLabel(key) {
  const map = {
    hp: "HP",
    poyoPower: "ぽよ力",
    mochiDefense: "もち耐性",
    speed: "すばやさ",
    appetite: "食欲",
    charm: "かわいさ",
  };
  return map[key] || key;
}

function feedItem(item, instance, navigate) {
  const success = useItem(item.id);
  if (!success) {
    showToast("ごはんが たりないよ！");
    return;
  }

  applyFoodToInstance(instance, item);
  showToast(`${instance.nickname}は おなかいっぱい！`);
  playSfx("levelup");
  saveGame();
  renderRaise(navigate);
}
