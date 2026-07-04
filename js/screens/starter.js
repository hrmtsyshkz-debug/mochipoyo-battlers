// スターター選択画面
import { monsters } from "../../data/monsters.js";
import { addMonsterToPartyOrBox, saveGame } from "../state.js";
import { monsterAvatarHtml, showToast } from "../ui.js";

const STARTER_IDS = [1, 2, 3]; // ポヨリン・ラーメルン・カラアゲポヨ

export function renderStarter(navigate) {
  const screen = document.getElementById("screen-starter");
  const starters = STARTER_IDS.map((id) => monsters.find((m) => m.id === id)).filter(Boolean);

  screen.innerHTML = `
    <h1>さいしょの もちぽよを えらんでね</h1>
    <p>いっしょに ぼうけんする もちぽよを 1たい えらぼう。</p>
    <div class="starter-list" id="starter-list"></div>
  `;

  const list = screen.querySelector("#starter-list");
  starters.forEach((master) => {
    const card = document.createElement("div");
    card.className = "starter-card";
    const baseForm = Array.isArray(master.forms) ? master.forms.find((f) => f.evolutionStage === 0) : null;
    card.innerHTML = `
      ${monsterAvatarHtml(master, { large: true, form: baseForm })}
      <div class="monster-name">${master.name}</div>
      <div class="monster-level">${master.element.join(" / ")}</div>
      <p class="starter-desc">${master.description}</p>
      <button class="btn btn-block starter-pick-btn">この こに きめる！</button>
    `;
    card.querySelector(".starter-pick-btn").addEventListener("click", () => {
      addMonsterToPartyOrBox(master.id, 1);
      saveGame();
      showToast(`${master.name}が なかまに なった！`);
      navigate("home");
    });
    list.appendChild(card);
  });
}
