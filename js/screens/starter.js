// スターター選択画面
import { species } from "../../data/monsters.js";
import { addMonsterToPartyOrBox, saveGame } from "../state.js";
import { monsterAvatarHtml, showToast } from "../ui.js";

const STARTER_IDS = [1, 4, 7]; // ポヨリン・ラーメルン・カラアゲポヨ（各系統の初期形態speciesId）

export function renderStarter(navigate) {
  const screen = document.getElementById("screen-starter");
  const starters = STARTER_IDS.map((id) => species.find((s) => s.speciesId === id)).filter(Boolean);

  screen.innerHTML = `
    <h1>さいしょの もちぽよを えらんでね</h1>
    <p>いっしょに ぼうけんする もちぽよを 1たい えらぼう。</p>
    <div class="starter-list" id="starter-list"></div>
  `;

  const list = screen.querySelector("#starter-list");
  starters.forEach((master) => {
    const card = document.createElement("div");
    card.className = "starter-card";
    card.innerHTML = `
      ${monsterAvatarHtml(master, { large: true })}
      <div class="monster-name">${master.name}</div>
      <div class="monster-level">${master.element.join(" / ")}</div>
      <p class="starter-desc">${master.description}</p>
      <button class="btn btn-block starter-pick-btn">この こに きめる！</button>
    `;
    card.querySelector(".starter-pick-btn").addEventListener("click", () => {
      addMonsterToPartyOrBox(master.speciesId, 1);
      saveGame();
      showToast(`${master.name}が なかまに なった！`);
      navigate("home");
    });
    list.appendChild(card);
  });
}
