// 進化演出オーバーレイ
import { monsterFullArtHtml } from "../ui.js";

// evolvedInfo: { evolvedName, master, form } (master = 図鑑マスタ, form = 進化後のform)
export function showEvolution(evolvedInfo, onDone) {
  const { evolvedName, master, form } = evolvedInfo;
  const overlay = document.getElementById("evolution-overlay");
  overlay.innerHTML = `
    ${monsterFullArtHtml(master, form)}
    <h1>おや...？ようすが...</h1>
    <h2>${evolvedName}に しんかした！</h2>
    <p>${master.description}</p>
    <button class="btn btn-block" id="evolution-close-btn">やったね！</button>
  `;
  overlay.classList.remove("hidden");

  overlay.querySelector("#evolution-close-btn").addEventListener("click", () => {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    if (onDone) onDone();
  });
}
