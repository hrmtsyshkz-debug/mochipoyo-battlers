// 設定画面
import { getState, deleteSaveData, saveGame } from "../state.js";
import { showToast } from "../ui.js";
import { DEFAULT_TRAINER_NAME } from "../challenge.js";
import { supportButtonsHtml } from "../support.js";
import { playSfx } from "../audio.js";

export function renderSettings(navigate) {
  const screen = document.getElementById("screen-settings");
  const state = getState();

  screen.innerHTML = `
    <div class="top-bar">
      <button class="back-btn" id="btn-back">← もどる</button>
      <h1 style="margin:0;">せってい</h1>
    </div>

    <div class="settings-row">
      <div class="settings-label">
        <div>トレーナーめい</div>
        <div class="hint-text">チームきょうゆう時に あいてに 表示されるよ</div>
      </div>
      <input
        type="text"
        id="input-trainer-name"
        class="text-input"
        maxlength="12"
        placeholder="${DEFAULT_TRAINER_NAME}"
        value="${(state.player.name || "").replace(/"/g, "&quot;")}"
      />
    </div>

    <div class="settings-row">
      <div class="settings-label">
        <div>サウンド</div>
        <div class="hint-text">たたかいの こうかおんを ならすよ</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="toggle-sound" ${state.settings.sound ? "checked" : ""} />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="settings-row">
      <div class="settings-label">
        <div>演出をひかえめにする</div>
        <div class="hint-text">ONにすると ふわふわ・ぽよんとした アニメーションを へらします</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="toggle-reduced-motion" ${state.settings.reducedMotion ? "checked" : ""} />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="settings-row">
      <div class="settings-label">
        <div>ミニゲームかんたんモード</div>
        <div class="hint-text">ONにすると ミニゲームが じどうで OKあつかいになるよ</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="toggle-easy-minigames" ${state.settings.easyMiniGames ? "checked" : ""} />
        <span class="toggle-slider"></span>
      </label>
    </div>

    ${supportButtonsHtml()}

    <button class="btn btn-danger btn-block" id="btn-delete-save" style="margin-top:24px;">セーブデータを けす</button>
  `;

  screen.querySelector("#btn-back").addEventListener("click", () => navigate("home"));

  screen.querySelector("#input-trainer-name").addEventListener("change", (e) => {
    const value = e.target.value.slice(0, 12).trim();
    state.player.name = value || DEFAULT_TRAINER_NAME;
    e.target.value = state.player.name;
    saveGame();
  });

  screen.querySelector("#toggle-sound").addEventListener("change", (e) => {
    state.settings.sound = e.target.checked;
    saveGame();
    if (state.settings.sound) {
      playSfx("levelup"); // ONにした瞬間に確認用の短いSEを1回鳴らす
    }
  });

  screen.querySelector("#toggle-reduced-motion").addEventListener("change", (e) => {
    state.settings.reducedMotion = e.target.checked;
    document.body.classList.toggle("reduced-motion", state.settings.reducedMotion);
    saveGame();
  });

  screen.querySelector("#toggle-easy-minigames").addEventListener("change", (e) => {
    state.settings.easyMiniGames = e.target.checked;
    saveGame();
  });

  screen.querySelector("#btn-delete-save").addEventListener("click", () => {
    if (!confirm("ほんとうに セーブデータを けしてもいい？")) {
      return;
    }
    deleteSaveData();
    showToast("セーブデータを けしたよ");
    setTimeout(() => {
      location.reload();
    }, 600);
  });
}
