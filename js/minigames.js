// バトルミニゲーム共通モジュール（仕様書 BATTLE_MINIGAME_SPEC_v0.5 準拠）
// 捕獲タイミング「スイーツ投げゲージ」「ぷにゲージ（連打）」「ぽよじゃんけんカード」を提供する。
// Canvasは使わず、オーバーレイDOM + CSSアニメーションで実装する。
import { getState } from "./state.js";
import { playSfx } from "./audio.js";

const GRADE_MULTIPLIER = { MISS: 0.9, OK: 1.0, GOOD: 1.1, PERFECT: 1.25 };
const CAPTURE_BONUS = { PERFECT: 0.2, GOOD: 0.1, OK: 0, MISS: -0.05 };

function isEasyMode() {
  const state = getState();
  return !!(state.settings && state.settings.easyMiniGames);
}

function getOverlay() {
  return document.getElementById("minigame-overlay");
}

function openOverlay() {
  const overlay = getOverlay();
  overlay.classList.remove("hidden");
  overlay.innerHTML = "";
  return overlay;
}

function closeOverlay() {
  const overlay = getOverlay();
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
}

// ---------- 1. 捕獲タイミング「スイーツ投げゲージ」 ----------
// 戻り値: Promise<{ grade, captureBonus }>
export function playTimingGame() {
  if (isEasyMode()) {
    return Promise.resolve({ grade: "OK", captureBonus: CAPTURE_BONUS.OK });
  }

  return new Promise((resolve) => {
    const overlay = openOverlay();
    overlay.innerHTML = `
      <div class="minigame-panel">
        <p class="minigame-title">タイミングよく スイーツを 投げよう！</p>
        <div class="timing-track" id="timing-track">
          <div class="timing-zone-miss-l"></div>
          <div class="timing-zone-good-l"></div>
          <div class="timing-zone-perfect"></div>
          <div class="timing-zone-good-r"></div>
          <div class="timing-zone-miss-r"></div>
          <div class="timing-cursor" id="timing-cursor">🍰</div>
        </div>
        <p class="minigame-hint">タップ / クリック / Space で とめる！</p>
      </div>
    `;

    const cursor = overlay.querySelector("#timing-cursor");
    const track = overlay.querySelector("#timing-track");
    let settled = false;

    const autoTimer = setTimeout(() => settle("OK"), 2500);

    function settle(forcedGrade) {
      if (settled) return;
      settled = true;
      clearTimeout(autoTimer);
      cleanup();

      let grade = forcedGrade;
      if (!grade) {
        grade = judgeTimingPosition(cursor, track);
      }
      playSfx("minigame_result", grade);
      showResultAndClose(gradeMessageTiming(grade), () => {
        resolve({ grade, captureBonus: CAPTURE_BONUS[grade] });
      });
    }

    function onInput(e) {
      if (e.type === "keydown" && e.code !== "Space") return;
      e.preventDefault();
      settle(null);
    }

    function cleanup() {
      overlay.removeEventListener("click", onInput);
      window.removeEventListener("keydown", onInput);
    }

    overlay.addEventListener("click", onInput);
    window.addEventListener("keydown", onInput);
  });
}

// カーソル要素の現在位置をトラック内の相対位置(0=左端,1=右端,0.5=中央)として読み取り、ゾーン判定する
function judgeTimingPosition(cursor, track) {
  const trackRect = track.getBoundingClientRect();
  const cursorRect = cursor.getBoundingClientRect();
  const cursorCenter = cursorRect.left + cursorRect.width / 2;
  const ratio = (cursorCenter - trackRect.left) / trackRect.width;
  const distFromCenter = Math.abs(ratio - 0.5); // 0(中央)〜0.5(端)

  if (distFromCenter >= 0.42) return "MISS"; // 端16%
  if (distFromCenter <= 0.08) return "PERFECT"; // 中央±8%
  if (distFromCenter <= 0.2) return "GOOD"; // ±20%
  return "OK";
}

function gradeMessageTiming(grade) {
  const map = {
    PERFECT: "PERFECT! とっておきの甘さ！",
    GOOD: "GOOD! いい感じ！",
    OK: "OK! ふつうに届いた！",
    MISS: "MISS... ちょっとズレた！",
  };
  return map[grade];
}

// ---------- 2. ぽよじゃんけんカード ----------
const JANKEN_HANDS = ["ぽよアタック", "もちガード", "きゅんフェイント"];
// ぽよアタック > きゅんフェイント > もちガード > ぽよアタック
function jankenBeats(a, b) {
  return (
    (a === "ぽよアタック" && b === "きゅんフェイント") ||
    (a === "きゅんフェイント" && b === "もちガード") ||
    (a === "もちガード" && b === "ぽよアタック")
  );
}

// 戻り値: Promise<{ result: "win"|"draw"|"lose", multiplier }>
export function playJankenGame() {
  if (isEasyMode()) {
    return Promise.resolve({ result: "draw", multiplier: 1.0 });
  }

  return new Promise((resolve) => {
    const overlay = openOverlay();
    overlay.innerHTML = `
      <div class="minigame-panel">
        <p class="minigame-title">ボスが 本気になった！</p>
        <p class="minigame-hint">次の一手を 読もう！</p>
        <div class="janken-cards" id="janken-cards">
          ${JANKEN_HANDS.map(
            (hand, i) => `<button class="janken-card" data-hand="${hand}">${jankenEmoji(i)}<span>${hand}</span></button>`
          ).join("")}
        </div>
      </div>
    `;

    const cardsWrap = overlay.querySelector("#janken-cards");

    function onClick(e) {
      const btn = e.target.closest(".janken-card");
      if (!btn) return;
      cardsWrap.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      const playerHand = btn.getAttribute("data-hand");
      resolveJanken(playerHand);
    }

    function onKey(e) {
      if (e.code !== "Space") return;
      e.preventDefault();
      cardsWrap.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      const randomHand = JANKEN_HANDS[Math.floor(Math.random() * JANKEN_HANDS.length)];
      resolveJanken(randomHand);
    }

    function resolveJanken(playerHand) {
      const bossHand = JANKEN_HANDS[Math.floor(Math.random() * JANKEN_HANDS.length)];
      let result;
      if (playerHand === bossHand) {
        result = "draw";
      } else if (jankenBeats(playerHand, bossHand)) {
        result = "win";
      } else {
        result = "lose";
      }
      const multiplier = { win: 1.25, draw: 1.0, lose: 0.8 }[result];
      playSfx(`janken_${result}`);
      showResultAndClose(gradeMessageJanken(result), () => {
        resolve({ result, multiplier });
      });
    }

    cardsWrap.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
  });
}

function jankenEmoji(i) {
  return ["👊", "🛡️", "😉"][i] || "🎴";
}

function gradeMessageJanken(result) {
  const map = {
    win: "読み勝ち！ 次の行動が強くなる！",
    draw: "あいこ！ そのまま勝負！",
    lose: "読み負け... 次の行動が少し弱くなる！",
  };
  return map[result];
}

// ---------- 3. 連打「ぷにゲージ」 ----------
// 戻り値: Promise<{ grade, multiplier }>
export function playMashGame() {
  if (isEasyMode()) {
    return Promise.resolve({ grade: "OK", multiplier: GRADE_MULTIPLIER.OK });
  }

  return new Promise((resolve) => {
    const overlay = openOverlay();
    overlay.innerHTML = `
      <div class="minigame-panel">
        <p class="minigame-title">ぷにぷに連打で パワーをためよう！</p>
        <div class="mash-track">
          <div class="mash-gauge-outer">
            <div class="mash-gauge-inner" id="mash-gauge"></div>
          </div>
          <div class="mash-puni" id="mash-puni">🍡</div>
        </div>
        <p class="minigame-hint" id="mash-timer">のこり 3.0びょう</p>
      </div>
    `;

    const gauge = overlay.querySelector("#mash-gauge");
    const puni = overlay.querySelector("#mash-puni");
    const timerText = overlay.querySelector("#mash-timer");

    let tapCount = 0;
    let settled = false;
    const duration = 3000;
    const startTime = performance.now();

    const tickInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const remaining = Math.max(0, (duration - elapsed) / 1000);
      timerText.textContent = `のこり ${remaining.toFixed(1)}びょう`;
    }, 100);

    const endTimer = setTimeout(() => settle(), duration);

    function onInput(e) {
      if (e.type === "keydown" && e.code !== "Space") return;
      if (e.repeat) return; // キー押しっぱなしのオートリピートで連打できないようにする
      e.preventDefault();
      if (settled) return;
      tapCount += 1;
      playSfx("mash_tap");
      const pct = Math.min(100, (tapCount / 15) * 100);
      gauge.style.width = pct + "%";
      puni.classList.remove("puni-pop");
      void puni.offsetWidth;
      puni.classList.add("puni-pop");
    }

    function settle() {
      if (settled) return;
      settled = true;
      clearInterval(tickInterval);
      clearTimeout(endTimer);
      cleanup();

      const grade = judgeMashCount(tapCount);
      playSfx("minigame_result", grade);
      showResultAndClose(gradeMessageMash(grade), () => {
        resolve({ grade, multiplier: GRADE_MULTIPLIER[grade] });
      });
    }

    function cleanup() {
      overlay.removeEventListener("click", onInput);
      window.removeEventListener("keydown", onInput);
    }

    overlay.addEventListener("click", onInput);
    window.addEventListener("keydown", onInput);
  });
}

function judgeMashCount(count) {
  if (count >= 15) return "PERFECT";
  if (count >= 10) return "GOOD";
  if (count >= 6) return "OK";
  return "MISS";
}

function gradeMessageMash(grade) {
  const map = {
    PERFECT: "PERFECT! 満腹パワー全開！",
    GOOD: "GOOD! ぽよ力アップ！",
    OK: "OK! いい感じにたまった！",
    MISS: "MISS... ちょっと足りない！",
  };
  return map[grade];
}

// ---------- 共通: 結果表示して自動クローズ ----------
function showResultAndClose(message, onDone, delayMs = 800) {
  const overlay = getOverlay();
  overlay.innerHTML = `
    <div class="minigame-panel minigame-result">
      <p class="minigame-result-text">${message}</p>
    </div>
  `;
  setTimeout(() => {
    closeOverlay();
    onDone();
  }, delayMs);
}
