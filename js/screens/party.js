// パーティへんせい画面
import {
  getState,
  getMonsterMaster,
  movePartyMemberUp,
  moveToBox,
  moveToParty,
  releaseFromBox,
  getItem,
  saveGame,
  getFormForInstance,
} from "../state.js";
import { monsterAvatarHtml, showToast, displayName, escapeHtml } from "../ui.js";
import { openShareOverlay } from "./share.js";

export function renderParty(navigate) {
  const screen = document.getElementById("screen-party");
  const state = getState();

  screen.innerHTML = `
    <div class="top-bar">
      <button class="back-btn" id="btn-back">← もどる</button>
      <h1 style="margin:0;">パーティへんせい</h1>
    </div>

    <h2 class="section-title">パーティ (${state.party.length}/3)</h2>
    <p class="hint-text">せんとうの こが バトルに でるよ</p>
    <div class="party-slot-list" id="party-slot-list"></div>

    <button class="btn btn-secondary btn-block" id="btn-share-team" style="margin-top:18px;">🔗 チームを きょうゆう</button>

    <h2 class="section-title">ボックス (${state.box.length})</h2>
    <div class="box-list" id="box-list"></div>
  `;

  screen.querySelector("#btn-back").addEventListener("click", () => navigate("home"));
  screen.querySelector("#btn-share-team").addEventListener("click", () => openShareOverlay());

  renderPartyList(navigate);
  renderBoxList(navigate);
}

function renderPartyList(navigate) {
  const listEl = document.getElementById("party-slot-list");
  const state = getState();
  if (state.party.length === 0) {
    listEl.innerHTML = `<div class="empty-state">パーティに もちぽよが いないよ</div>`;
    return;
  }

  listEl.innerHTML = "";
  state.party.forEach((instance, idx) => {
    const master = getMonsterMaster(instance.monsterId);
    const form = getFormForInstance(master, instance);
    const card = document.createElement("div");
    card.className = "party-slot-card";
    card.innerHTML = `
      ${monsterAvatarHtml(master, { form })}
      <div class="party-slot-info">
        <div class="monster-name">${escapeHtml(displayName(instance, master))}</div>
        <div class="monster-level">Lv.${instance.level}　HP ${Math.max(0, instance.currentHp)}/${instance.stats.hp}</div>
      </div>
      <div class="party-slot-actions">
        <button class="btn-mini" id="up-${instance.instanceId}" ${idx === 0 ? "disabled" : ""}>▲ まえへ</button>
        <button class="btn-mini" id="box-${instance.instanceId}">📦 ボックスへ</button>
      </div>
    `;
    listEl.appendChild(card);

    const upBtn = card.querySelector(`#up-${cssEscape(instance.instanceId)}`);
    if (upBtn) {
      upBtn.addEventListener("click", () => {
        if (movePartyMemberUp(instance.instanceId)) {
          saveGame();
          renderPartyList(navigate);
        }
      });
    }
    const boxBtn = card.querySelector(`#box-${cssEscape(instance.instanceId)}`);
    if (boxBtn) {
      if (state.party.length <= 1) {
        boxBtn.disabled = true;
      }
      boxBtn.addEventListener("click", () => {
        if (state.party.length <= 1) {
          showToast("さいごのひとりだよ！");
          return;
        }
        const ok = moveToBox(instance.instanceId);
        if (ok) {
          saveGame();
          refreshCounts();
          renderPartyList(navigate);
          renderBoxList(navigate);
        }
      });
    }
  });
}

function renderBoxList(navigate) {
  const listEl = document.getElementById("box-list");
  const state = getState();
  if (state.box.length === 0) {
    listEl.innerHTML = `<div class="empty-state">ボックスは からっぽだよ</div>`;
    return;
  }

  listEl.innerHTML = "";
  state.box.forEach((instance) => {
    const master = getMonsterMaster(instance.monsterId);
    const form = getFormForInstance(master, instance);
    const card = document.createElement("div");
    card.className = "party-slot-card";
    const partyFull = state.party.length >= 3;
    card.innerHTML = `
      ${monsterAvatarHtml(master, { form })}
      <div class="party-slot-info">
        <div class="monster-name">${escapeHtml(displayName(instance, master))}</div>
        <div class="monster-level">Lv.${instance.level}　HP ${Math.max(0, instance.currentHp)}/${instance.stats.hp}</div>
        ${partyFull ? `<div class="hint-text" style="margin:2px 0 0;">パーティがいっぱいだよ</div>` : ""}
      </div>
      <div class="party-slot-actions">
        <button class="btn-mini" id="in-${instance.instanceId}" ${partyFull ? "disabled" : ""}>✨ パーティにいれる</button>
        <button class="btn-mini btn-mini-danger" id="release-${instance.instanceId}">👋 おわかれする</button>
      </div>
    `;
    listEl.appendChild(card);

    const inBtn = card.querySelector(`#in-${cssEscape(instance.instanceId)}`);
    if (inBtn) {
      inBtn.addEventListener("click", () => {
        if (state.party.length >= 3) {
          showToast("パーティがいっぱいだよ");
          return;
        }
        const ok = moveToParty(instance.instanceId);
        if (ok) {
          saveGame();
          refreshCounts();
          renderPartyList(navigate);
          renderBoxList(navigate);
        }
      });
    }
    const releaseBtn = card.querySelector(`#release-${cssEscape(instance.instanceId)}`);
    if (releaseBtn) {
      releaseBtn.addEventListener("click", () => {
        const name = displayName(instance, master);
        if (!confirm(`ほんとうに ${name}と おわかれする？`)) return;
        const result = releaseFromBox(instance.instanceId);
        if (!result) return;
        saveGame();
        const giftText = result.giftItem ? `${getItem(result.giftItem.id)?.name || result.giftItem.name}` : "";
        showToast(
          `${result.name}は おみやげを のこして たびだった。またね！ (🪙+${result.goldGain}${
            giftText ? ` / ${giftText}×1` : ""
          })`,
          2600
        );
        refreshCounts();
        renderBoxList(navigate);
      });
    }
  });
}

function refreshCounts() {
  const state = getState();
  // 見出し2つ（パーティ/ボックス）を再取得して件数を更新する
  const titles = document.querySelectorAll("#screen-party .section-title");
  if (titles[0]) titles[0].textContent = `パーティ (${state.party.length}/3)`;
  if (titles[1]) titles[1].textContent = `ボックス (${state.box.length})`;
}

// instanceIdはmakeInstanceIdの形式（英数字・アンダースコアのみ）なのでCSS特殊文字の心配は無いが、念のため簡易エスケープする
function cssEscape(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
