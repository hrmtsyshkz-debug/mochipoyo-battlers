// 画面遷移・初期化
import { hasSaveData, newGame, loadGame, saveGame, deleteSaveData, getState } from "./state.js";
import { renderStarter } from "./screens/starter.js";
import { renderHome } from "./screens/home.js";
import { renderExplore } from "./screens/explore.js";
import { renderBattle } from "./screens/battle.js";
import { renderDex } from "./screens/dex.js";
import { renderRaise } from "./screens/raise.js";
import { renderShop } from "./screens/shop.js";
import { renderSettings } from "./screens/settings.js";
import { renderParty } from "./screens/party.js";
import { showToast } from "./ui.js";
import { parseChallengeFromSearch } from "./challenge.js";

const screenRenderers = {
  starter: renderStarter,
  home: renderHome,
  explore: renderExplore,
  battle: renderBattle,
  dex: renderDex,
  raise: renderRaise,
  shop: renderShop,
  settings: renderSettings,
  party: renderParty,
};

// URLの ?challenge= から受け取ったフレンド対戦チャレンジ（検証済み・保持のみ。使用後にクリアする）
let pendingChallenge = null;

export function getPendingChallenge() {
  return pendingChallenge;
}

export function clearPendingChallenge() {
  pendingChallenge = null;
}

export function navigate(screenName, params = {}) {
  const state = getState();

  // エラーハンドリング: partyが空の場合はスターター選択へ戻す（スターター選択画面自体は除く）
  if (screenName !== "starter" && screenName !== "title" && state.party.length === 0) {
    screenName = "starter";
  }

  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.remove("active");
    // 非アクティブ画面の古いDOMを掃除する（重複IDによる誤参照を防ぐ）。
    // タイトル画面は静的HTML＋初期化時のリスナーを保持するためクリアしない。
    if (s.id !== "screen-title" && s.id !== `screen-${screenName}`) {
      s.innerHTML = "";
    }
  });
  const target = document.getElementById(`screen-${screenName}`);
  if (!target) {
    console.error("不明な画面:", screenName);
    return;
  }
  target.classList.add("active");

  applyReducedMotion();

  const renderer = screenRenderers[screenName];
  if (renderer) {
    renderer(navigate, params);
  }
  saveGame();
}

function applyReducedMotion() {
  const state = getState();
  document.body.classList.toggle("reduced-motion", !!(state.settings && state.settings.reducedMotion));
}

function initTitleScreen() {
  const btnNew = document.getElementById("btn-new-game");
  const btnContinue = document.getElementById("btn-continue");
  const btnDelete = document.getElementById("btn-delete-save");

  if (!hasSaveData()) {
    btnContinue.disabled = true;
  }

  btnNew.addEventListener("click", () => {
    if (hasSaveData() && !confirm("セーブデータが あるよ。あたらしく はじめると まえのデータは きえちゃうけど いい？")) {
      return;
    }
    newGame();
    navigate("starter");
  });

  btnContinue.addEventListener("click", () => {
    const loaded = loadGame();
    if (loaded) {
      const state = getState();
      if (state.party.length === 0) {
        navigate("starter");
      } else {
        navigate("home");
      }
    } else {
      btnContinue.disabled = true;
      showToast("セーブデータが みつからなかったよ");
    }
  });

  btnDelete.addEventListener("click", () => {
    if (!hasSaveData()) {
      showToast("セーブデータは ないよ");
      return;
    }
    if (!confirm("ほんとうに セーブデータを けしてもいい？")) {
      return;
    }
    deleteSaveData();
    btnContinue.disabled = true;
    showToast("セーブデータを けしたよ");
  });
}

// 起動時に ?challenge=... を検出し、保持してURLからクエリを消す。
// 復号・検証に失敗した場合はトーストで無視する（クラッシュさせない）。
function detectChallengeFromUrl() {
  const search = window.location.search;
  if (!search || search.indexOf("challenge=") === -1) return;

  const hadChallengeParam = new URLSearchParams(search).has("challenge");
  const challenge = parseChallengeFromSearch(search);

  // クエリは結果に関わらず消す（再読み込みで同じ問題を繰り返さないため）
  const url = new URL(window.location.href);
  url.search = "";
  history.replaceState({}, "", url.toString());

  if (!challenge && hadChallengeParam) {
    showToast("チャレンジデータが よめなかったよ");
    return;
  }
  pendingChallenge = challenge;
}

function init() {
  detectChallengeFromUrl();

  if (pendingChallenge) {
    // セーブ/パーティの有無に応じて通常フローを経由しつつ、最終的にホームでバナーを出す
    const loaded = loadGame();
    const state = getState();
    if (loaded && state.party.length > 0) {
      navigate("home");
      return;
    }
    if (loaded && state.party.length === 0) {
      navigate("starter");
      return;
    }
  }

  document.getElementById("screen-title").classList.add("active");
  initTitleScreen();
}

init();
