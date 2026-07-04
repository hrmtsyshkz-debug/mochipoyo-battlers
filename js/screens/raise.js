// 育成画面
import { items } from "../../data/items.js";
import {
  getState,
  getPartyWithMaster,
  getMonsterMaster,
  getItemCount,
  useItem,
  applyFoodToInstance,
  canEvolve,
  evolveInstance,
  saveGame,
  getFormForInstance,
} from "../state.js";
import { monsterAvatarHtml, monsterFullArtHtml, showToast, displayName } from "../ui.js";
import { showEvolution } from "./evolution.js";

let selectedInstanceId = null;

// パーティ＋ボックスの全所持モンスターを育成対象にする
function getAllOwnedWithMaster() {
  const state = getState();
  const partyInfo = getPartyWithMaster();
  const boxInfo = state.box.map((instance) => ({
    instance,
    master: getMonsterMaster(instance.monsterId),
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
    const form = getFormForInstance(master, instance);
    card.innerHTML = `
      ${monsterAvatarHtml(master, { form })}
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
  const currentForm = getFormForInstance(master, instance);
  const currentStage = instance.evolutionStage || 0;
  const nextForm = Array.isArray(master.forms) ? master.forms.find((f) => f.evolutionStage === currentStage + 1) : null;

  let evolveSectionHtml = "";
  if (nextForm) {
    evolveSectionHtml = evolvable
      ? `<button class="btn btn-yellow btn-block" id="btn-evolve">✨ ${nextForm.name}に しんかする！ ✨</button>`
      : `<p class="hint-text">しんか条件: Lv.${nextForm.conditionLevel}（${nextForm.name}へ）</p>`;
  } else if (Array.isArray(master.forms) && master.forms.length > 1) {
    evolveSectionHtml = `<p class="hint-text">✨ しんかずみ</p>`;
  }

  wrap.innerHTML = `
    <div class="raise-detail">
      ${monsterFullArtHtml(master, currentForm)}
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
  saveGame();
  renderRaise(navigate);
}
