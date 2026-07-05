// ホーム画面
import { stages } from "../../data/stages.js";
import { getState, getPartyWithMaster, canEvolve, reviveFaintedParty, saveGame } from "../state.js";
import { monsterAvatarHtml, displayName, escapeHtml } from "../ui.js";
import { getPendingChallenge, clearPendingChallenge } from "../main.js";

export function renderHome(navigate) {
  const screen = document.getElementById("screen-home");
  const state = getState();

  // エラーハンドリング: currentHpが0以下のもちぽよはホームで少し回復する（TODO: 仮に全回復）
  const revived = reviveFaintedParty();
  if (revived) saveGame();

  const partyInfo = getPartyWithMaster();
  const unlockedStages = stages.filter((s) => isUnlocked(state, s));
  const evolvable = partyInfo.filter(({ instance }) => canEvolve(instance));
  const challenge = getPendingChallenge();

  screen.innerHTML = `
    <div class="top-bar">
      <h1 style="margin:0;">ホーム</h1>
      <div class="coin-display">🪙 <span id="home-gold">${state.player.gold}</span></div>
    </div>
    <p>きょうも もちぽよたちと げんきに いこう！</p>

    ${
      challenge
        ? `<div class="challenge-banner" id="challenge-banner">⚔️ ${escapeHtml(
            challenge.trainerName
          )}さんから しょうぶの もうしこみ！</div>`
        : ""
    }

    ${
      evolvable.length > 0
        ? `<div class="evolve-banner" id="evolve-banner">✨ しんかできる もちぽよが いるよ！ いくせいがめんへ ✨</div>`
        : ""
    }

    <div class="home-grid">
      <button class="home-card" id="nav-explore">
        <span class="icon">🗺️</span>
        たんさく
      </button>
      <button class="home-card" id="nav-dex">
        <span class="icon">📖</span>
        ずかん
      </button>
      <button class="home-card" id="nav-raise">
        <span class="icon">🍙</span>
        いくせい
      </button>
      <button class="home-card" id="nav-shop">
        <span class="icon">🛒</span>
        おみせ
      </button>
      <button class="home-card" id="nav-settings">
        <span class="icon">⚙️</span>
        せってい
      </button>
      <button class="home-card" id="nav-party">
        <span class="icon">👥</span>
        てもち (${state.party.length})
      </button>
    </div>

    <h2 class="section-title">かいほうエリア</h2>
    <div class="stage-chip-row">
      ${unlockedStages.map((s) => `<span class="stage-chip">${s.backgroundEmoji} ${s.name}</span>`).join("")}
    </div>

    <h2 class="section-title">てもちのもちぽよ</h2>
    <div class="party-preview" id="party-preview"></div>
  `;

  const previewRow = screen.querySelector("#party-preview");
  if (partyInfo.length === 0) {
    previewRow.innerHTML = `<div class="empty-state">まだ もちぽよが いないよ</div>`;
  } else {
    partyInfo.forEach(({ instance, master }) => {
      const card = document.createElement("div");
      card.className = "monster-card";
      card.innerHTML = `
        ${monsterAvatarHtml(master)}
        <div class="monster-name">${displayName(instance, master)}</div>
        <div class="monster-level">Lv.${instance.level}</div>
        ${canEvolve(instance) ? `<div class="evolve-tag">しんか！</div>` : ""}
      `;
      previewRow.appendChild(card);
    });
  }

  screen.querySelector("#nav-explore").addEventListener("click", () => navigate("explore"));
  screen.querySelector("#nav-dex").addEventListener("click", () => navigate("dex"));
  screen.querySelector("#nav-raise").addEventListener("click", () => navigate("raise"));
  screen.querySelector("#nav-shop").addEventListener("click", () => navigate("shop"));
  screen.querySelector("#nav-settings").addEventListener("click", () => navigate("settings"));
  screen.querySelector("#nav-party").addEventListener("click", () => navigate("party"));
  const evolveBanner = screen.querySelector("#evolve-banner");
  if (evolveBanner) {
    evolveBanner.addEventListener("click", () => navigate("raise"));
  }
  const challengeBanner = screen.querySelector("#challenge-banner");
  if (challengeBanner) {
    challengeBanner.addEventListener("click", () => {
      const c = getPendingChallenge();
      if (!c) return;
      clearPendingChallenge();
      navigate("battle", { battleMode: "friend", friendChallenge: c });
    });
  }
}

function isUnlocked(state, stage) {
  if (!stage.unlockCondition) return true;
  return state.clearedStages.includes(stage.unlockCondition.clearStageId);
}

// ヘッダーの所持金表示を更新するヘルパー（画面を離れずゴールドが変動した場合に使用）
export function refreshGoldDisplay() {
  const state = getState();
  const el = document.getElementById("home-gold");
  if (el) el.textContent = state.player.gold;
}
