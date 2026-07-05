// 図鑑画面（ポケモン方式: 1species = 1枠。進化で入手した種も通常の1枠として表示）
import { species } from "../../data/monsters.js";
import { getDexEntry } from "../state.js";
import { monsterAvatarHtml, monsterFullArtHtml, rarityLabel } from "../ui.js";

// 図鑑番号はデータのdexNoを正とする（未定義ならspeciesIdから生成）
function dexNoOf(master) {
  return master.dexNo || String(master.speciesId).padStart(3, "0");
}

export function renderDex(navigate) {
  const screen = document.getElementById("screen-dex");

  // バグ回避: 発見数カウントは図鑑に表示される対象（species配列全体）だけを数える
  const seenCount = species.filter((s) => getDexEntry(s.speciesId).seen).length;
  const ownedCount = species.filter((s) => getDexEntry(s.speciesId).owned).length;

  screen.innerHTML = `
    <div class="top-bar">
      <button class="back-btn" id="btn-back">← もどる</button>
      <h1 style="margin:0;">ずかん</h1>
    </div>
    <p>はっけん: ${seenCount} / ${species.length}　（つかまえた: ${ownedCount}）</p>
    <div class="dex-grid" id="dex-grid"></div>
    <div id="dex-detail"></div>
  `;

  screen.querySelector("#btn-back").addEventListener("click", () => navigate("home"));

  const grid = screen.querySelector("#dex-grid");
  species.forEach((m) => {
    const entry = getDexEntry(m.speciesId);
    const cell = document.createElement("div");
    cell.className = "dex-cell";
    cell.innerHTML = `
      ${monsterAvatarHtml(m, { silhouette: !entry.seen })}
      <div class="monster-name">${entry.seen ? m.name : "？？？"}</div>
      <div class="monster-level">${entry.seen ? `No.${dexNoOf(m)}` : "No.???"}</div>
    `;
    cell.addEventListener("click", () => showDetail(m, entry));
    grid.appendChild(cell);
  });
}

function showDetail(master, entry) {
  const detail = document.getElementById("dex-detail");

  if (!entry.seen) {
    detail.innerHTML = `
      <div class="raise-detail" style="margin-top:16px;">
        <div style="font-size:60px;">？</div>
        <h2>No.??? ？？？</h2>
        <p>まだ みつけていない もちぽよだよ。たんさくで であってみよう！</p>
      </div>
    `;
    return;
  }

  if (!entry.owned) {
    detail.innerHTML = `
      <div class="raise-detail" style="margin-top:16px;">
        ${monsterAvatarHtml(master)}
        <h2>No.${dexNoOf(master)} ${master.name}</h2>
        <p>くわしい じょうほうは つかまえると とうろくされるよ。</p>
      </div>
    `;
    return;
  }

  detail.innerHTML = `
    <div class="raise-detail" style="margin-top:16px;">
      ${monsterFullArtHtml(master)}
      <h2>No.${dexNoOf(master)} ${master.name}</h2>
      <p>属性: ${master.element.join(" / ")}　分類: ${master.classification}</p>
      <p>レア度: ${rarityLabel(master.rarity)}　好物: ${master.favoriteFood}</p>
      <p>生息地: ${master.habitat.join(" / ")}</p>
      <p>${master.description}</p>
      <div class="stat-list">
        <div class="stat-row"><span>HP</span><span>${master.baseStats.hp}</span></div>
        <div class="stat-row"><span>ぽよ力</span><span>${master.baseStats.poyoPower}</span></div>
        <div class="stat-row"><span>もち耐性</span><span>${master.baseStats.mochiDefense}</span></div>
        <div class="stat-row"><span>すばやさ</span><span>${master.baseStats.speed}</span></div>
        <div class="stat-row"><span>食欲</span><span>${master.baseStats.appetite}</span></div>
        <div class="stat-row"><span>かわいさ</span><span>${master.baseStats.charm}</span></div>
      </div>
      <p class="hint-text">であった回数: ${entry.seenCount}　さいこうレベル: ${entry.maxLevel}</p>
    </div>
  `;
}
