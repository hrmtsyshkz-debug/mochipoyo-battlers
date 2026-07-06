// バトル画面
import { items } from "../../data/items.js";
import { stages } from "../../data/stages.js";
import { getSkill, getMonsterMaster } from "../state.js";
import {
  getState,
  getPartyWithMaster,
  getItemCount,
  useItem,
  addItem,
  addGold,
  calcExpGain,
  gainExp,
  canEvolve,
  markStageCleared,
  discoverMonster,
  addMonsterToPartyOrBox,
  saveGame,
  getItem,
} from "../state.js";
import {
  createBattleUnit,
  resolveSkillAction,
  resolveGuardAction,
  resetGuard,
  isFainted,
  chooseEnemySkill,
  decideActionOrder,
  tickBuffs,
  attemptCapture,
  attemptFlee,
} from "../battle.js";
import { showToast, displayName, monsterImageInnerHtml, escapeHtml } from "../ui.js";
import { playTimingGame, playMashGame, playJankenGame } from "../minigames.js";
import { playSfx } from "../audio.js";
import {
  MANPUKU_MAX,
  addBossManpuku,
  getManpukuCaptureBonus,
  hasManpukuRewardBonus,
  rollManpukuBonusReward,
} from "../manpuku.js";

let battleState = null; // { playerUnit, enemyUnit, playerInstance, enemyMaster, stage, isBoss, isOver, mode, ... }

export function renderBattle(navigate, params = {}) {
  const screen = document.getElementById("screen-battle");
  const battleMode = params.battleMode === "friend" ? "friend" : "wild";

  if (battleMode === "friend") {
    renderFriendBattleStart(navigate, screen, params);
    return;
  }

  const partyInfo = getPartyWithMaster();

  if (partyInfo.length === 0) {
    screen.innerHTML = `<div class="empty-state">てもちの もちぽよが いないよ</div>`;
    return;
  }

  // 手持ちのHPが残っている先頭のもちぽよで挑む簡易仕様
  const leader = partyInfo.find(({ instance }) => instance.currentHp > 0);
  if (!leader) {
    showToast("たたかえる もちぽよが いないよ。ホームで やすませてあげよう");
    navigate("home");
    return;
  }
  const { enemySpeciesId, enemyLevel, stage, isBoss } = params;
  const enemyMaster = getMonsterMaster(enemySpeciesId);
  if (!enemyMaster) {
    screen.innerHTML = `<div class="empty-state">敵が見つかりませんでした</div>`;
    return;
  }

  discoverMonster(enemyMaster.speciesId, { owned: false });
  saveGame();

  const playerStats = computeBattleStats(leader.instance);
  const playerUnit = createBattleUnit({
    name: displayName(leader.instance, leader.master),
    emoji: leader.master.emoji,
    element: leader.master.element,
    stats: playerStats,
    skillIds: leader.master.skills,
    level: leader.instance.level,
  });
  playerUnit.currentHp = leader.instance.currentHp;

  const enemyStats = computeEnemyStats(enemyMaster, enemyLevel, !!isBoss);
  const enemyUnit = createBattleUnit({
    name: enemyMaster.name,
    emoji: enemyMaster.emoji,
    element: enemyMaster.element,
    stats: enemyStats,
    skillIds: enemyMaster.skills,
    level: enemyLevel,
  });

  battleState = {
    mode: "wild",
    playerUnit,
    enemyUnit,
    playerInstance: leader.instance,
    playerMaster: leader.master,
    enemyMaster,
    enemyLevel,
    stage,
    isBoss: !!isBoss,
    isOver: false,
    turnLocked: false,
    bossJankenUsed: false,
    nextActionMultiplier: 1.0,
  };

  renderBattleUI(screen, navigate);
}

// ---------- フレンドバトル(3vs3勝ち抜き) ----------

// party(HP>0)/challenge.team からバトルユニットの「控えキュー」を作る。
// 各要素: { unit, master, label }。友バトルは instance.currentHp を一切書き換えない（コピーで戦う）。
function buildFriendQueueFromParty() {
  const state = getState();
  return state.party
    .filter((instance) => instance.currentHp > 0)
    .map((instance) => {
      const master = getMonsterMaster(instance.speciesId);
      const unit = createBattleUnit({
        name: displayName(instance, master),
        emoji: master.emoji,
        element: master.element,
        stats: { ...instance.stats },
        skillIds: master.skills,
        level: instance.level,
      });
      unit.currentHp = instance.currentHp;
      return { unit, master, label: displayName(instance, master) };
    });
}

function buildFriendQueueFromChallenge(challenge) {
  return challenge.team.map((entry) => {
    const unit = createBattleUnit({
      name: `${escapeHtml(challenge.trainerName)}さんの ${escapeHtml(entry.nickname)}`,
      emoji: entry.master.emoji,
      element: entry.master.element,
      stats: { ...entry.stats },
      skillIds: entry.master.skills,
      level: entry.level,
    });
    return { unit, master: entry.master, label: unit.name };
  });
}

function renderFriendBattleStart(navigate, screen, params) {
  const challenge = params.friendChallenge;
  if (!challenge || !Array.isArray(challenge.team) || challenge.team.length === 0) {
    screen.innerHTML = `<div class="empty-state">しょうぶの データが みつからなかったよ</div>`;
    return;
  }

  const myQueue = buildFriendQueueFromParty();
  if (myQueue.length === 0) {
    showToast("たたかえる もちぽよが いないよ。ホームで やすませてあげよう");
    navigate("home");
    return;
  }
  const enemyQueue = buildFriendQueueFromChallenge(challenge);

  battleState = {
    mode: "friend",
    trainerName: challenge.trainerName,
    myQueue,
    enemyQueue,
    myIndex: 0,
    enemyIndex: 0,
    playerUnit: myQueue[0].unit,
    enemyUnit: enemyQueue[0].unit,
    playerMaster: myQueue[0].master,
    enemyMaster: enemyQueue[0].master,
    isBoss: false,
    isOver: false,
    turnLocked: false,
    bossJankenUsed: false,
    nextActionMultiplier: 1.0,
  };

  renderBattleUI(screen, navigate);
}

// レベル成長込みのステータス（instance.statsをそのまま使用。party育成状態を反映）
function computeBattleStats(instance) {
  return { ...instance.stats };
}

// 敵のステータス: baseStatsから簡易レベル補正（+成長式と同様の考え方を仮適用）
// 野生（ボス以外）はのんびりしているのでHPとぽよ力が少し低い（序盤バランス調整の仮置き）
function computeEnemyStats(master, level, isBoss) {
  const growth = { hp: 3, poyoPower: 1, mochiDefense: 1, speed: 1, appetite: 1, charm: 1 };
  const stats = { ...master.baseStats };
  const steps = Math.max(0, level - 1);
  for (const key in growth) {
    stats[key] = stats[key] + growth[key] * steps;
  }
  if (!isBoss) {
    stats.hp = Math.max(1, Math.round(stats.hp * 0.85));
    stats.poyoPower = Math.max(1, Math.round(stats.poyoPower * 0.85));
  }
  return stats;
}

function renderBattleUI(screen, navigate) {
  const isFriend = battleState.mode === "friend";
  screen.innerHTML = `
    <div class="top-bar">
      <h1 style="margin:0;">${isFriend ? "フレンドバトル" : "バトル"}</h1>
    </div>
    ${
      isFriend
        ? `<p class="hint-text">${escapeHtml(battleState.trainerName)}さんとの 3vs3 しょうぶ！ (のこり ${
            battleState.myQueue.length - battleState.myIndex
          } vs ${battleState.enemyQueue.length - battleState.enemyIndex})</p>`
        : ""
    }
    <div class="battle-arena">
      <div class="battle-side enemy">
        <div class="battle-portrait" id="enemy-portrait">${monsterImageInnerHtml(battleState.enemyMaster, "icon")}</div>
        <div class="battle-status">
          <div class="battle-name">${battleState.enemyUnit.name}${battleState.isBoss ? " (ボス)" : ""}</div>
          <div class="hp-bar-outer"><div class="hp-bar-inner" id="enemy-hp-bar"></div></div>
          <div class="hp-text" id="enemy-hp-text"></div>
        </div>
      </div>
      <div class="battle-side">
        <div class="battle-portrait" id="player-portrait">${monsterImageInnerHtml(battleState.playerMaster, "icon")}</div>
        <div class="battle-status">
          <div class="battle-name">${battleState.playerUnit.name}</div>
          <div class="hp-bar-outer"><div class="hp-bar-inner" id="player-hp-bar"></div></div>
          <div class="hp-text" id="player-hp-text"></div>
        </div>
      </div>
    </div>
    <div class="battle-log" id="battle-log">たたかいが はじまった！</div>
    <div class="command-grid" id="command-grid"></div>
    <div class="battle-sub-panel" id="battle-sub-panel"></div>
  `;

  updateHpBars();
  renderCommandButtons(navigate);
}

function updateHpBars() {
  const p = battleState.playerUnit;
  const e = battleState.enemyUnit;
  const pBar = document.getElementById("player-hp-bar");
  const eBar = document.getElementById("enemy-hp-bar");
  const pPct = Math.max(0, (p.currentHp / p.maxHp) * 100);
  const ePct = Math.max(0, (e.currentHp / e.maxHp) * 100);
  pBar.style.width = pPct + "%";
  eBar.style.width = ePct + "%";
  pBar.classList.toggle("low", pPct <= 30);
  eBar.classList.toggle("low", ePct <= 30);
  document.getElementById("player-hp-text").textContent = `${Math.max(0, p.currentHp)} / ${p.maxHp}`;
  document.getElementById("enemy-hp-text").textContent = `${Math.max(0, e.currentHp)} / ${e.maxHp}`;
}

function appendLog(lines) {
  const log = document.getElementById("battle-log");
  if (!log) return;
  log.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

// resolveSkillActionの戻り値(skillType/missed拡張フィールド)から再生すべきSEを判定して鳴らす。
// actorが自分のユニットなら攻撃側視点(attack)、相手ユニットなら被弾側視点(damage)で鳴らし分ける。
function playSkillResultSfx(actor, result) {
  if (!result) return;
  const isPlayerActor = actor === battleState.playerUnit;

  if (result.missed) {
    playSfx("miss");
    return;
  }

  switch (result.skillType) {
    case "attack":
    case "special":
      playSfx(isPlayerActor ? "attack" : "damage");
      break;
    case "heal":
      playSfx("heal");
      break;
    case "buff":
      playSfx("buff");
      break;
    case "debuff":
      playSfx("debuff");
      break;
    case "guard":
      playSfx("guard");
      break;
    default:
      break;
  }
}

function renderCommandButtons(navigate) {
  const grid = document.getElementById("command-grid");
  const subPanel = document.getElementById("battle-sub-panel");
  if (!grid) return;
  subPanel.innerHTML = "";
  grid.innerHTML = "";

  const isFriend = battleState.mode === "friend";
  const commands = [
    { id: "skill", label: "スキル" },
    { id: "item", label: "アイテム" },
    ...(isFriend ? [] : [{ id: "capture", label: "捕獲" }]),
    { id: "guard", label: "ふんばる" },
    { id: "flee", label: "にげる" },
  ];

  grid.classList.toggle("command-grid-4", isFriend);

  commands.forEach((cmd) => {
    const btn = document.createElement("button");
    btn.className = "command-btn";
    btn.textContent = cmd.label;
    btn.addEventListener("click", () => handleCommand(cmd.id, navigate));
    grid.appendChild(btn);
  });
}

function disableCommands() {
  document.querySelectorAll("#command-grid .command-btn").forEach((b) => (b.disabled = true));
}

function handleCommand(commandId, navigate) {
  if (battleState.isOver || battleState.turnLocked) return;

  if (commandId === "skill") {
    showSkillPanel(navigate);
  } else if (commandId === "item") {
    showItemPanel(navigate);
  } else if (commandId === "capture") {
    showCapturePanel(navigate);
  } else if (commandId === "guard") {
    doGuard(navigate);
  } else if (commandId === "flee") {
    doFlee(navigate);
  }
}

function showSkillPanel(navigate) {
  const subPanel = document.getElementById("battle-sub-panel");
  subPanel.innerHTML = `<div class="sub-panel-grid" id="skill-panel-grid"></div><button class="btn btn-secondary btn-block" id="sub-cancel">もどる</button>`;
  const grid = subPanel.querySelector("#skill-panel-grid");
  battleState.playerUnit.skillIds.forEach((skillId) => {
    const skill = getSkill(skillId);
    if (!skill) return;
    const btn = document.createElement("button");
    btn.className = "skill-btn";
    const typeLabel = skillTypeLabel(skill.type);
    btn.innerHTML = `${skill.name}<span class="skill-type">${typeLabel}</span>`;
    btn.addEventListener("click", () => {
      doSkill(skillId, navigate);
    });
    grid.appendChild(btn);
  });
  subPanel.querySelector("#sub-cancel").addEventListener("click", () => {
    subPanel.innerHTML = "";
  });
}

function skillTypeLabel(type) {
  const map = {
    attack: "こうげき",
    guard: "ぼうぎょ",
    heal: "かいふく",
    buff: "バフ",
    debuff: "デバフ",
    special: "とくしゅ",
  };
  return map[type] || type;
}

function showItemPanel(navigate) {
  const subPanel = document.getElementById("battle-sub-panel");
  const healItems = items.filter((i) => i.type === "heal" && getItemCount(i.id) > 0);
  if (healItems.length === 0) {
    subPanel.innerHTML = `<p class="hint-text">つかえる かいふくアイテムが ないよ</p><button class="btn btn-secondary btn-block" id="sub-cancel">もどる</button>`;
    subPanel.querySelector("#sub-cancel").addEventListener("click", () => (subPanel.innerHTML = ""));
    return;
  }
  subPanel.innerHTML = `<div class="sub-panel-grid" id="item-panel-grid"></div><button class="btn btn-secondary btn-block" id="sub-cancel">もどる</button>`;
  const grid = subPanel.querySelector("#item-panel-grid");
  healItems.forEach((item) => {
    const count = getItemCount(item.id);
    const btn = document.createElement("button");
    btn.className = "skill-btn";
    btn.innerHTML = `${item.name}<span class="skill-type">HP+${item.healAmount} / のこり${count}</span>`;
    btn.addEventListener("click", () => doItem(item, navigate));
    grid.appendChild(btn);
  });
  subPanel.querySelector("#sub-cancel").addEventListener("click", () => {
    subPanel.innerHTML = "";
  });
}

function showCapturePanel(navigate) {
  const subPanel = document.getElementById("battle-sub-panel");
  const captureItems = items.filter((i) => i.type === "capture" && getItemCount(i.id) > 0);
  if (captureItems.length === 0) {
    subPanel.innerHTML = `<p class="hint-text">つかえる 捕獲アイテムが ないよ</p><button class="btn btn-secondary btn-block" id="sub-cancel">もどる</button>`;
    subPanel.querySelector("#sub-cancel").addEventListener("click", () => (subPanel.innerHTML = ""));
    return;
  }
  subPanel.innerHTML = `<div class="sub-panel-grid" id="capture-panel-grid"></div><button class="btn btn-secondary btn-block" id="sub-cancel">もどる</button>`;
  const grid = subPanel.querySelector("#capture-panel-grid");
  captureItems.forEach((item) => {
    const count = getItemCount(item.id);
    const btn = document.createElement("button");
    btn.className = "skill-btn";
    btn.innerHTML = `${item.name}<span class="skill-type">捕獲力${item.capturePower} / のこり${count}</span>`;
    btn.addEventListener("click", () => doCapture(item, navigate));
    grid.appendChild(btn);
  });
  subPanel.querySelector("#sub-cancel").addEventListener("click", () => {
    subPanel.innerHTML = "";
  });
}

function clearSubPanel() {
  const subPanel = document.getElementById("battle-sub-panel");
  if (subPanel) subPanel.innerHTML = "";
}

function doSkill(skillId, navigate) {
  clearSubPanel();
  battleState.turnLocked = true;
  disableCommands();

  const skill = getSkill(skillId);
  const jankenMultiplier = consumeNextActionMultiplier();

  if (skill && skill.actionType === "mash") {
    playMashGame().then((mashResult) => {
      const totalMultiplier = jankenMultiplier * mashResult.multiplier;
      runPlayerThenEnemyTurn(navigate, (actor, target) => resolveSkillAction(actor, target, skillId, totalMultiplier));
    });
    return;
  }

  runPlayerThenEnemyTurn(navigate, (actor, target) => resolveSkillAction(actor, target, skillId, jankenMultiplier));
}

// ぽよじゃんけんの次行動補正を取り出し、使用後は必ず1.0にリセットする（行動種別を問わず1回だけ消費）
function consumeNextActionMultiplier() {
  const multiplier = battleState.nextActionMultiplier || 1.0;
  battleState.nextActionMultiplier = 1.0;
  return multiplier;
}

function doGuard(navigate) {
  clearSubPanel();
  battleState.turnLocked = true;
  disableCommands();
  consumeNextActionMultiplier(); // ふんばるには数値補正がないため消費のみ行う
  // ふんばるは行動順に関係なく先に構え、このターンの敵の攻撃を必ず軽減する
  resetGuard(battleState.playerUnit);
  const result = resolveGuardAction(battleState.playerUnit);
  appendLog(result.logs);
  playSfx("guard");
  setTimeout(() => enemyTurn(navigate), 900);
}

function doItem(item, navigate) {
  clearSubPanel();
  const success = useItem(item.id);
  if (!success) {
    showToast("アイテムが たりないよ！");
    return;
  }
  battleState.turnLocked = true;
  disableCommands();
  resetGuard(battleState.playerUnit); // 前ターンのふんばるを解除（1ターン限り）
  const multiplier = consumeNextActionMultiplier();
  const healAmount = multiplier !== 1.0 ? Math.max(1, Math.floor(item.healAmount * multiplier)) : item.healAmount;
  battleState.playerUnit.currentHp = Math.min(battleState.playerUnit.maxHp, battleState.playerUnit.currentHp + healAmount);
  appendLog([`${battleState.playerUnit.name}は ${item.name}を つかった！`, `HPが ${healAmount} かいふくした！`]);
  playSfx("heal");
  updateHpBars();
  saveGame();
  setTimeout(() => enemyTurn(navigate), 900);
}

function doCapture(item, navigate) {
  clearSubPanel();
  const success = useItem(item.id);
  if (!success) {
    showToast("アイテムが たりないよ！");
    return;
  }
  battleState.turnLocked = true;
  disableCommands();
  resetGuard(battleState.playerUnit); // 前ターンのふんばるを解除（1ターン限り）
  consumeNextActionMultiplier(); // 捕獲は「行動」扱いのため、じゃんけん補正が残っていれば消費だけしておく
  saveGame();

  playSfx("capture_throw");
  playTimingGame().then(({ grade, captureBonus }) => {
    const manpukuCaptureBonus = battleState.isBoss ? getManpukuCaptureBonus(battleState.enemyMaster.lineId) : 0;
    const totalBonus = captureBonus + manpukuCaptureBonus;
    const captured = attemptCapture(battleState.enemyMaster, battleState.enemyUnit, item, totalBonus);
    if (captured) {
      appendLog([`${item.name}を なげた！`, `やった！ ${battleState.enemyMaster.name}を つかまえた！`]);
      playSfx("capture_success");
      finishBattle("capture", navigate);
      return;
    }

    appendLog([`${item.name}を なげた！`, `しかし ${battleState.enemyMaster.name}は にげようとしている...`]);
    playSfx("capture_fail");
    setTimeout(() => enemyTurn(navigate), 900);
  });
}

function doFlee(navigate) {
  clearSubPanel();
  battleState.turnLocked = true;
  disableCommands();
  resetGuard(battleState.playerUnit); // 前ターンのふんばるを解除（1ターン限り）
  consumeNextActionMultiplier(); // にげるにも数値補正はないため消費のみ行う

  if (battleState.mode === "friend") {
    // フレンドバトルには「にげる」に相当する降参のみ用意する（勝敗はつく）
    appendLog([`${battleState.playerUnit.name}は しょうぶを ちゅうだんした...`]);
    setTimeout(() => finishBattle("friend-lose", navigate), 800);
    return;
  }

  const fled = attemptFlee(battleState.isBoss);
  if (fled) {
    appendLog([`${battleState.playerUnit.name}は うまく にげだした！`]);
    saveInstanceHp();
    saveGame();
    setTimeout(() => {
      navigate("home");
    }, 800);
    return;
  }

  appendLog([`にげられなかった...！`]);
  setTimeout(() => enemyTurn(navigate), 900);
}

// プレイヤーの行動→敵の行動の順に処理（行動順はspeedで決定するが、プレイヤーコマンド選択がある都合上
// スキル/ふんばるはプレイヤー操作直後に解決し、続けて敵ターンを解決する簡易フロー）
function runPlayerThenEnemyTurn(navigate, playerActionFn) {
  const { playerUnit, enemyUnit } = battleState;
  const order = decideActionOrder(playerUnit, enemyUnit);
  const playerFirst = order[0] === playerUnit;

  if (playerFirst) {
    resetGuard(playerUnit);
    const result = playerActionFn(playerUnit, enemyUnit);
    appendLog(result.logs);
    playSkillResultSfx(playerUnit, result);
    flashPortrait("enemy-portrait");
    updateHpBars();
    saveInstanceHp();

    if (isFainted(enemyUnit)) {
      setTimeout(() => handleEnemyFainted(navigate), 700);
      return;
    }
    setTimeout(() => enemyTurn(navigate), 900);
  } else {
    // 敵が先に行動
    resetGuard(enemyUnit);
    const enemySkillId = chooseEnemySkill(enemyUnit);
    const enemyResult = enemySkillId
      ? resolveSkillAction(enemyUnit, playerUnit, enemySkillId)
      : { logs: [`${enemyUnit.name}は ためらっている...`], fainted: false, skillType: null, missed: false };
    appendLog(enemyResult.logs);
    playSkillResultSfx(enemyUnit, enemyResult);
    flashPortrait("player-portrait");
    updateHpBars();
    saveInstanceHp();

    if (isFainted(playerUnit)) {
      setTimeout(() => handlePlayerFainted(navigate), 700);
      return;
    }

    setTimeout(() => {
      resetGuard(playerUnit);
      const result = playerActionFn(playerUnit, enemyUnit);
      appendLog(result.logs);
      playSkillResultSfx(playerUnit, result);
      flashPortrait("enemy-portrait");
      updateHpBars();
      saveInstanceHp();
      if (isFainted(enemyUnit)) {
        setTimeout(() => handleEnemyFainted(navigate), 700);
        return;
      }
      endTurn(navigate);
    }, 900);
  }
}

function enemyTurn(navigate) {
  if (battleState.isOver) return;
  resetGuard(battleState.enemyUnit);
  const enemySkillId = chooseEnemySkill(battleState.enemyUnit);
  const result = enemySkillId
    ? resolveSkillAction(battleState.enemyUnit, battleState.playerUnit, enemySkillId)
    : { logs: [`${battleState.enemyUnit.name}は ためらっている...`], fainted: false, skillType: null, missed: false };
  appendLog(result.logs);
  playSkillResultSfx(battleState.enemyUnit, result);
  flashPortrait("player-portrait");
  updateHpBars();
  saveInstanceHp();

  if (isFainted(battleState.playerUnit)) {
    setTimeout(() => handlePlayerFainted(navigate), 700);
    return;
  }

  endTurn(navigate);
}

// 敵ユニットが倒れた時の分岐: 野生バトルは即勝利。フレンドバトルは相手の次の1体へ交代し、
// 全滅していれば勝利。
function handleEnemyFainted(navigate) {
  if (battleState.mode !== "friend") {
    finishBattle("win", navigate);
    return;
  }
  battleState.enemyIndex += 1;
  if (battleState.enemyIndex >= battleState.enemyQueue.length) {
    finishBattle("friend-win", navigate);
    return;
  }
  const next = battleState.enemyQueue[battleState.enemyIndex];
  battleState.enemyUnit = next.unit;
  battleState.enemyMaster = next.master;
  appendLog([`つぎは ${next.unit.name}に おまかせ！`]);
  battleState.turnLocked = false; // 再描画でコマンドボタンを作り直すため、ロックも解除しておく
  const screen = document.getElementById("screen-battle");
  renderBattleUI(screen, navigate);
}

// 自分のユニットが倒れた時の分岐: 野生バトルは即敗北。フレンドバトルは自分の次の1体へ交代し、
// 全滅していれば敗北。
function handlePlayerFainted(navigate) {
  if (battleState.mode !== "friend") {
    finishBattle("lose", navigate);
    return;
  }
  battleState.myIndex += 1;
  if (battleState.myIndex >= battleState.myQueue.length) {
    finishBattle("friend-lose", navigate);
    return;
  }
  const next = battleState.myQueue[battleState.myIndex];
  battleState.playerUnit = next.unit;
  battleState.playerMaster = next.master;
  appendLog([`つぎは ${next.unit.name}に おまかせ！`]);
  battleState.turnLocked = false; // 再描画でコマンドボタンを作り直すため、ロックも解除しておく
  const screen = document.getElementById("screen-battle");
  renderBattleUI(screen, navigate);
}

function endTurn(navigate) {
  tickBuffs(battleState.playerUnit);
  tickBuffs(battleState.enemyUnit);

  if (shouldTriggerBossJanken()) {
    battleState.bossJankenUsed = true;
    battleState.turnLocked = true;
    disableCommands();
    playJankenGame().then((jankenResult) => {
      battleState.nextActionMultiplier = jankenResult.multiplier;
      unlockCommands();
    });
    return;
  }

  unlockCommands();
}

// ボスHPが50%以下になった次のプレイヤー行動前に1回だけ、ぽよじゃんけんを発生させる
function shouldTriggerBossJanken() {
  if (battleState.mode !== "wild" || !battleState.isBoss) return false;
  if (battleState.bossJankenUsed) return false;
  if (battleState.isOver) return false;
  const enemy = battleState.enemyUnit;
  if (!enemy || enemy.maxHp <= 0) return false;
  return enemy.currentHp / enemy.maxHp <= 0.5;
}

function unlockCommands() {
  battleState.turnLocked = false;
  document.querySelectorAll("#command-grid .command-btn").forEach((b) => (b.disabled = false));
}

function saveInstanceHp() {
  // フレンドバトルはノーダメージ扱い（battleUnitはコピーで戦わせ、instance.currentHpに触れない）
  if (battleState.mode === "friend") return;
  if (battleState.playerInstance) {
    battleState.playerInstance.currentHp = Math.max(0, battleState.playerUnit.currentHp);
  }
}

function flashPortrait(id) {
  const node = document.getElementById(id);
  if (!node) return;
  node.classList.remove("shake");
  void node.offsetWidth;
  node.classList.add("shake");
}

// ボス撃破に伴う共通処理（勝利/捕獲どちらでも呼ばれる）。
// 満福度をamount分加算し、その加算後の満福度に応じて進化アイテムをドロップし、
// 初回撃破ならエリア解放メッセージを出す。戻り値: { manpukuAfter, dropMsg, clearedMsg }
function applyBossDefeatRewards(amount) {
  const lineId = battleState.enemyMaster.lineId;
  const manpukuAfter = addBossManpuku(lineId, amount);

  let clearedMsg = "";
  let dropMsg = "";

  if (battleState.stage) {
    const alreadyCleared = getState().clearedStages.includes(battleState.stage.id);
    markStageCleared(battleState.stage.id);
    if (!alreadyCleared) {
      const newlyUnlocked = stages.filter(
        (s) => s.unlockCondition && s.unlockCondition.clearStageId === battleState.stage.id
      );
      clearedMsg =
        newlyUnlocked.length > 0
          ? `<p>🎊 ${battleState.stage.name}の ボスを たおした！ ${newlyUnlocked
              .map((s) => s.name)
              .join("、")}が かいほうされたよ！</p>`
          : `<p>🎊 ${battleState.stage.name}の ボスを たおした！ すべての エリアを クリアしたよ！ すごい！</p>`;
    }
    if (battleState.stage.bossDropItemId) {
      const dropAmount = manpukuAfter >= 5 ? 2 : 1;
      addItem(battleState.stage.bossDropItemId, dropAmount);
      const dropItem = getItem(battleState.stage.bossDropItemId);
      const dropName = dropItem ? dropItem.name : battleState.stage.bossDropItemId;
      const dropEmoji = dropItem && dropItem.emoji ? dropItem.emoji : "🎁";
      const suffix = dropAmount > 1 ? ` ×${dropAmount}` : "";
      dropMsg = `<p>${dropEmoji} ${dropName}${suffix}を てにいれた！</p>`;
    }
  }

  const manpukuMsg =
    manpukuAfter >= MANPUKU_MAX
      ? `<p>🍡 満福度が あがった！ 満福MAX！</p>`
      : `<p>🍡 満福度が あがった！（${manpukuAfter} / ${MANPUKU_MAX}）</p>`;

  return { manpukuAfter, dropMsg, clearedMsg, manpukuMsg };
}

// 満福ボーナス（満福度30のボス進化キャラで勝利/捕獲した場合の追加報酬枠）。
// フレンド戦は対象外。1回だけ抽選し、表示用HTMLを返す（対象外ならnull）。
function applyManpukuRewardBonusIfEligible() {
  if (battleState.mode !== "wild") return null;
  const master = getMonsterMaster(battleState.playerInstance.speciesId);
  if (!hasManpukuRewardBonus(master)) return null;
  const reward = rollManpukuBonusReward(master.lineId);
  return `<p>🎁 満福ボーナス！ ごほうび枠が増えた！（${reward.emoji} ${reward.label}）</p>`;
}

function finishBattle(result, navigate) {
  battleState.isOver = true;
  disableCommands();
  clearSubPanel();
  const screen = document.getElementById("screen-battle");
  const overlay = document.createElement("div");
  overlay.className = "battle-result-overlay";

  if (result === "win") {
    const expGain = calcExpGain(battleState.enemyMaster, battleState.enemyLevel);
    const goldGain = Math.floor(10 + battleState.enemyLevel * 3 + Math.random() * 20);
    addGold(goldGain);
    const levelUps = gainExp(battleState.playerInstance, expGain);

    // 満福ボーナス判定は「そのボス戦に持ち込んだ時点」の満福度で行う（撃破加算より前に判定）
    const bonusMsg = applyManpukuRewardBonusIfEligible();

    let bossClearedMsg = "";
    let bossDropMsg = "";
    let manpukuMsg = "";
    if (battleState.isBoss) {
      const rewards = applyBossDefeatRewards(1);
      bossClearedMsg = rewards.clearedMsg;
      bossDropMsg = rewards.dropMsg;
      manpukuMsg = rewards.manpukuMsg;
    }

    // 進化は自動では行わない（仕様: 条件を満たすと育成/ホームで「しんかできる」表示→プレイヤーが実行）
    const evolveHint = canEvolve(battleState.playerInstance)
      ? `<p>✨ ${battleState.playerUnit.name}は しんかできそうだ！ いくせいがめんへ いってみよう！</p>`
      : "";
    saveGame();

    overlay.innerHTML = `
      <div class="explore-emoji">🎉</div>
      <h2>かった！</h2>
      <p>${expGain} けいけんちを かくとく</p>
      <p>🪙 ${goldGain} ゴールドを かくとく</p>
      ${levelUps > 0 ? `<p>${battleState.playerUnit.name}は レベルが ${levelUps} あがった！</p>` : ""}
      ${evolveHint}
      ${manpukuMsg}
      ${bossDropMsg}
      ${bossClearedMsg}
      ${bonusMsg || ""}
      <button class="btn btn-block" id="battle-continue-btn">つづける</button>
    `;
    screen.appendChild(overlay);
    playSfx("victory");

    overlay.querySelector("#battle-continue-btn").addEventListener("click", () => {
      screen.removeChild(overlay);
      navigate("home");
    });
  } else if (result === "capture") {
    const wentToBox = getState().party.length >= 3;

    // 満福ボーナス判定は「そのボス戦に持ち込んだ時点」の満福度で行う（撃破加算より前に判定）
    const bonusMsg = battleState.isBoss ? applyManpukuRewardBonusIfEligible() : null;

    let bossClearedMsg = "";
    let bossDropMsg = "";
    let manpukuMsg = "";
    let bondMsg = "";
    if (battleState.isBoss) {
      // 裁定2: ボスを捕獲で倒した場合も撃破処理を行う（撃破+1、捕獲成功ボーナス+4 = 合計+5）
      const rewards = applyBossDefeatRewards(5);
      bossClearedMsg = rewards.clearedMsg;
      bossDropMsg = rewards.dropMsg;
      manpukuMsg =
        rewards.manpukuAfter >= MANPUKU_MAX
          ? `<p>🍡 満福度が +5 あがった！ 満福MAX！</p>`
          : `<p>🍡 満福度が +5 あがった！（${rewards.manpukuAfter} / ${MANPUKU_MAX}）</p>`;
      bondMsg = `<p>${battleState.enemyMaster.name}との 縁が深まった！</p>`;
    }

    addMonsterToPartyOrBox(battleState.enemyMaster.speciesId, battleState.enemyLevel);

    saveGame();
    overlay.innerHTML = `
      <div class="explore-emoji">🎊</div>
      <h2>つかまえた！</h2>
      <p>${battleState.enemyMaster.name}が なかまに なった！</p>
      <p>${wentToBox ? "てもちが いっぱいだったので ボックスに おくられたよ。" : "てもちに くわわったよ！"}</p>
      ${bondMsg}
      ${manpukuMsg}
      ${bossDropMsg}
      ${bossClearedMsg}
      ${bonusMsg || ""}
      <button class="btn btn-block" id="battle-continue-btn">つづける</button>
    `;
    screen.appendChild(overlay);
    overlay.querySelector("#battle-continue-btn").addEventListener("click", () => {
      screen.removeChild(overlay);
      navigate("home");
    });
  } else if (result === "friend-win" || result === "friend-lose") {
    // フレンドバトルは経験値・ゴールド・捕獲なし。HPも保存しない（ノーダメージ扱い）。やさしい結果表示のみ。
    const won = result === "friend-win";
    overlay.innerHTML = `
      <div class="explore-emoji">${won ? "🎉" : "😊"}</div>
      <h2>${won ? "かった！" : "まけちゃった！"}</h2>
      <p>${escapeHtml(battleState.trainerName)}さんとの たのしい しょうぶだった！</p>
      <button class="btn btn-block" id="battle-continue-btn">ホームへもどる</button>
    `;
    screen.appendChild(overlay);
    playSfx(won ? "victory" : "lose");
    overlay.querySelector("#battle-continue-btn").addEventListener("click", () => {
      screen.removeChild(overlay);
      navigate("home");
    });
  } else {
    // lose
    overlay.innerHTML = `
      <div class="explore-emoji">😢</div>
      <h2>まけてしまった...</h2>
      <p>${battleState.playerUnit.name}は ぐったりしてしまった。</p>
      <button class="btn btn-block" id="battle-continue-btn">ホームへもどる</button>
    `;
    screen.appendChild(overlay);
    playSfx("lose");
    if (battleState.playerInstance) {
      battleState.playerInstance.currentHp = 0;
    }
    saveGame();
    overlay.querySelector("#battle-continue-btn").addEventListener("click", () => {
      screen.removeChild(overlay);
      navigate("home");
    });
  }
}
