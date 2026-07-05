// 探索画面
import { stages } from "../../data/stages.js";
import { species } from "../../data/monsters.js";
import { getState, isStageUnlocked, saveGame } from "../state.js";
import { showToast, monsterImageInnerHtml } from "../ui.js";

let selectedStageId = null;

export function renderExplore(navigate) {
  const screen = document.getElementById("screen-explore");
  const state = getState();

  if (!selectedStageId || !stages.find((s) => s.id === selectedStageId)) {
    selectedStageId = state.player.currentStageId || stages[0].id;
  }

  screen.innerHTML = `
    <div class="top-bar">
      <button class="back-btn" id="btn-back">← もどる</button>
      <div class="coin-display">🪙 <span>${state.player.gold}</span></div>
    </div>
    <h1>たんさく</h1>
    <p>ステージを えらんで もちぽよを さがそう。</p>
    <div class="stage-list" id="stage-list"></div>
    <div class="explore-actions" id="explore-actions"></div>
    <div class="explore-log" id="explore-log">
      <div class="explore-emoji">🔍</div>
      <p>ステージを えらんでね</p>
    </div>
  `;

  screen.querySelector("#btn-back").addEventListener("click", () => navigate("home"));

  const stageList = screen.querySelector("#stage-list");
  stages.forEach((stage) => {
    const unlocked = isStageUnlocked(stage);
    const card = document.createElement("div");
    card.className = "stage-card" + (unlocked ? "" : " locked") + (stage.id === selectedStageId ? " selected" : "");
    card.innerHTML = `
      <div class="icon">${unlocked ? stage.backgroundEmoji : "🔒"}</div>
      <div class="stage-info">
        <div class="stage-name">${unlocked ? stage.name : "？？？"}</div>
        <div class="stage-desc">${unlocked ? stage.description : "まだ かいほうされていない エリア"}</div>
      </div>
    `;
    if (unlocked) {
      card.addEventListener("click", () => {
        selectedStageId = stage.id;
        state.player.currentStageId = stage.id;
        saveGame();
        renderExplore(navigate);
      });
    }
    stageList.appendChild(card);
  });

  renderActions(navigate);
}

function renderActions(navigate) {
  const actionsEl = document.getElementById("explore-actions");
  const stage = stages.find((s) => s.id === selectedStageId);
  if (!stage || !isStageUnlocked(stage)) {
    actionsEl.innerHTML = "";
    return;
  }
  const state = getState();
  const bossDefeated = state.clearedStages.includes(stage.id);

  actionsEl.innerHTML = `
    <button class="btn btn-block" id="btn-explore-start">${stage.name}を たんさくする</button>
    <button class="btn btn-yellow btn-block" id="btn-boss-challenge">${bossDefeated ? "ボスに もういちど いどむ" : "ボスに いどむ！"}</button>
  `;

  actionsEl.querySelector("#btn-explore-start").addEventListener("click", () => startExploration(stage, navigate, false));
  actionsEl.querySelector("#btn-boss-challenge").addEventListener("click", () => startExploration(stage, navigate, true));
}

function pickEnemyMonster(stage, isBoss) {
  if (isBoss) {
    return species.find((s) => s.speciesId === stage.bossSpeciesId) || null;
  }
  const candidates = stage.enemySpeciesIds.map((id) => species.find((s) => s.speciesId === id)).filter(Boolean);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function randomLevelAround(recommendedLevel) {
  // 野生敵はrecommendedLevel-1〜recommendedLevelで出現（TODO: 敵レベルバランスは仕様書に明記が無いため仮実装）
  // 推奨レベル超えの野生敵は序盤の連敗要因になるため出さない
  const level = recommendedLevel - Math.floor(Math.random() * 2);
  return Math.max(1, level);
}

function startExploration(stage, navigate, isBoss) {
  const log = document.getElementById("explore-log");
  log.innerHTML = `
    <div class="explore-emoji">${stage.backgroundEmoji}</div>
    <p>${stage.name}を たんさくちゅう...</p>
  `;

  setTimeout(() => {
    const state = getState();
    if (state.party.length === 0) {
      showToast("てもちの もちぽよが いないよ！");
      log.innerHTML = `<div class="explore-emoji">😥</div><p>たたかえる もちぽよが いないよ</p>`;
      return;
    }

    const enemyMaster = pickEnemyMonster(stage, isBoss);
    if (!enemyMaster) {
      log.innerHTML = `<div class="explore-emoji">😴</div><p>きょうは だれとも であわなかった...</p>`;
      return;
    }

    const level = isBoss ? Math.max(1, stage.recommendedLevel) : randomLevelAround(stage.recommendedLevel);

    log.innerHTML = `
      <div class="explore-emoji">${monsterImageInnerHtml(enemyMaster, "icon")}</div>
      <p>${isBoss ? "ボスの " : "やせいの "}${enemyMaster.name}が あらわれた！</p>
    `;

    setTimeout(() => {
      navigate("battle", { enemySpeciesId: enemyMaster.speciesId, enemyLevel: level, stage, isBoss });
    }, 900);
  }, 700);
}
