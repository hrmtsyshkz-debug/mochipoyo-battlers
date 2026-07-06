// 進化演出オーバーレイ
import { monsterFullArtHtml } from "../ui.js";
import { playSfx } from "../audio.js";

// evolvedInfo: { evolvedName, master }（master = 進化先speciesのマスタデータ）
export function showEvolution(evolvedInfo, onDone) {
  const { evolvedName, master } = evolvedInfo;
  const overlay = document.getElementById("evolution-overlay");
  overlay.innerHTML = `
    ${monsterFullArtHtml(master)}
    <h1>おや...？ようすが...</h1>
    <h2>${evolvedName}に しんかした！</h2>
    <p>${master.description}</p>
    <button class="btn btn-block" id="evolution-close-btn">やったね！</button>
  `;
  overlay.classList.remove("hidden");
  playSfx("evolve");

  overlay.querySelector("#evolution-close-btn").addEventListener("click", () => {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    if (onDone) onDone();
  });
}
