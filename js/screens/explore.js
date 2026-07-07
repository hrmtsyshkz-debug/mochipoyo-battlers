// 探索画面
import { stages, exStages } from "../../data/stages.js";
import { species } from "../../data/monsters.js";
import { getState, isStageUnlocked, saveGame } from "../state.js";
import { showToast, monsterImageInnerHtml } from "../ui.js";
import {
  isExStageUnlocked,
  getStageMastery,
  trySecretBossEncounter,
  SECRET_BOSS_PITY_MAX,
  SECRET_BOSS_HINT_TEXT,
  toDexNoString,
} from "../postgame.js";

let selectedStageId = null;
let selectedExStageId = null; // 選択中のEXステージid（通常ステージと排他）

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
    card.className =
      "stage-card" + (unlocked ? "" : " locked") + (!selectedExStageId && stage.id === selectedStageId ? " selected" : "");
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
        selectedExStageId = null;
        state.player.currentStageId = stage.id;
        saveGame();
        renderExplore(navigate);
      });
    }
    stageList.appendChild(card);

    // このステージに対応する、解放済みEXステージのカードを直下に表示
    const exStage = exStages.find((ex) => ex.baseStageId === stage.id);
    if (exStage && isExStageUnlocked(state, exStage)) {
      stageList.appendChild(buildExStageCard(exStage, navigate));
    }
  });

  renderActions(navigate);
}

function buildExStageCard(exStage, navigate) {
  const state = getState();
  const mastery = getStageMastery(state, exStage.id);
  const secretDexNo = toDexNoString(exStage.secretBossSpeciesId);
  const pity = state.postGame.secretBossPity[secretDexNo] ?? 0;
  const seen = state.postGame.secretBossSeen[secretDexNo];
  const hintText = SECRET_BOSS_HINT_TEXT[secretDexNo] || "ただならぬ気配がする……";

  const card = document.createElement("div");
  card.className = "stage-card ex-stage-card" + (selectedExStageId === exStage.id ? " selected" : "");
  card.innerHTML = `
    <div class="icon">${exStage.backgroundEmoji}</div>
    <div class="stage-info">
      <div class="stage-name">${exStage.name} EX ${seen ? "👀" : ""}</div>
      <div class="stage-desc">${exStage.description}</div>
      <div class="ex-stage-meta">推奨Lv ${exStage.recommendedLevel}　熟練度 ${mastery}</div>
      <div class="ex-stage-meta">${hintText}（${pity} / ${SECRET_BOSS_PITY_MAX}）</div>
    </div>
  `;
  card.addEventListener("click", () => {
    selectedExStageId = exStage.id;
    renderExplore(navigate);
  });
  return card;
}

function renderActions(navigate) {
  const actionsEl = document.getElementById("explore-actions");

  if (selectedExStageId) {
    const exStage = exStages.find((s) => s.id === selectedExStageId);
    const state = getState();
    if (!exStage || !isExStageUnlocked(state, exStage)) {
      actionsEl.innerHTML = "";
      return;
    }
    const bossDefeated = state.postGame.exStagesCleared.includes(exStage.id);
    actionsEl.innerHTML = `
      <button class="btn btn-block" id="btn-ex-explore-start">${exStage.name}を たんさくする</button>
      <button class="btn btn-yellow btn-block" id="btn-ex-boss-challenge">${
        bossDefeated ? "EXボスに もういちど いどむ" : "EXボスに いどむ！"
      }</button>
    `;
    actionsEl.querySelector("#btn-ex-explore-start").addEventListener("click", () => startExExploration(exStage, navigate));
    actionsEl
      .querySelector("#btn-ex-boss-challenge")
      .addEventListener("click", () => startExBossChallenge(exStage, navigate));
    return;
  }

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

// EXステージの敵レベルはminEnemyLevel〜maxEnemyLevelの範囲でランダム
function randomLevelInExRange(exStage) {
  const min = exStage.minEnemyLevel;
  const max = exStage.maxEnemyLevel;
  return min + Math.floor(Math.random() * (max - min + 1));
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

// EX探索: 通常敵を選ぶ前に隠しボス判定を行う（仕様書の基本フロー準拠）
function startExExploration(exStage, navigate) {
  const log = document.getElementById("explore-log");
  log.innerHTML = `
    <div class="explore-emoji">${exStage.backgroundEmoji}</div>
    <p>${exStage.name}を たんさくちゅう...</p>
  `;

  setTimeout(() => {
    const state = getState();
    if (state.party.length === 0) {
      showToast("てもちの もちぽよが いないよ！");
      log.innerHTML = `<div class="explore-emoji">😥</div><p>たたかえる もちぽよが いないよ</p>`;
      return;
    }

    const secretSpeciesId = trySecretBossEncounter(state, exStage);
    saveGame();

    if (secretSpeciesId) {
      const secretMaster = species.find((s) => s.speciesId === secretSpeciesId);
      log.innerHTML = `
        <div class="explore-emoji">${monsterImageInnerHtml(secretMaster, "icon")}</div>
        <p>特別な気配があふれだした！</p>
        <p>${secretMaster ? secretMaster.name : "？？？"}があらわれた！</p>
      `;
      setTimeout(() => {
        navigate("battle", {
          enemySpeciesId: secretSpeciesId,
          exStage,
          isSecretBoss: true,
        });
      }, 1100);
      return;
    }

    const enemyMaster = pickEnemyMonster(exStage, false);
    if (!enemyMaster) {
      log.innerHTML = `<div class="explore-emoji">😴</div><p>きょうは だれとも であわなかった...</p>`;
      return;
    }
    const level = randomLevelInExRange(exStage);

    log.innerHTML = `
      <div class="explore-emoji">${monsterImageInnerHtml(enemyMaster, "icon")}</div>
      <p>やせいの ${enemyMaster.name}が あらわれた！</p>
    `;

    setTimeout(() => {
      navigate("battle", { enemySpeciesId: enemyMaster.speciesId, enemyLevel: level, exStage, isBoss: false });
    }, 900);
  }, 700);
}

function startExBossChallenge(exStage, navigate) {
  const log = document.getElementById("explore-log");
  log.innerHTML = `
    <div class="explore-emoji">${exStage.backgroundEmoji}</div>
    <p>${exStage.name}の ボスに ちょうせんちゅう...</p>
  `;

  setTimeout(() => {
    const state = getState();
    if (state.party.length === 0) {
      showToast("てもちの もちぽよが いないよ！");
      log.innerHTML = `<div class="explore-emoji">😥</div><p>たたかえる もちぽよが いないよ</p>`;
      return;
    }

    const bossMaster = species.find((s) => s.speciesId === exStage.bossSpeciesId);
    if (!bossMaster) {
      log.innerHTML = `<div class="explore-emoji">😴</div><p>ボスが みつからなかった...</p>`;
      return;
    }
    const level = Math.max(1, exStage.maxEnemyLevel);

    log.innerHTML = `
      <div class="explore-emoji">${monsterImageInnerHtml(bossMaster, "icon")}</div>
      <p>EXボスの ${bossMaster.name}が あらわれた！</p>
    `;

    setTimeout(() => {
      navigate("battle", { enemySpeciesId: bossMaster.speciesId, enemyLevel: level, exStage, isBoss: true });
    }, 900);
  }, 700);
}
