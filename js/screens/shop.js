// おみせ画面（簡易ショップ。仕様書の画面リストには無いが経済ループを閉じるために追加）
import { items } from "../../data/items.js";
import { getState, spendGold, addItem, getItemCount, saveGame } from "../state.js";
import { showToast } from "../ui.js";
import { refreshGoldDisplay } from "./home.js";

export function renderShop(navigate) {
  const screen = document.getElementById("screen-shop");
  const state = getState();

  screen.innerHTML = `
    <div class="top-bar">
      <button class="back-btn" id="btn-back">← もどる</button>
      <div class="coin-display">🪙 <span id="shop-gold">${state.player.gold}</span></div>
    </div>
    <h1>おみせ</h1>
    <p>ゴールドで アイテムを かおう。</p>
    <div class="shop-list" id="shop-list"></div>
  `;

  screen.querySelector("#btn-back").addEventListener("click", () => navigate("home"));

  const list = screen.querySelector("#shop-list");
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "shop-row";
    row.dataset.itemId = item.id;
    row.innerHTML = `
      <div class="shop-row-info">
        <div class="shop-row-name">${item.name}<span class="shop-row-type">${shopTypeLabel(item.type)}</span></div>
        <div class="shop-row-desc">${item.description}</div>
        <div class="shop-row-count">もちもの: ${getItemCount(item.id)}こ</div>
      </div>
      <button class="btn btn-yellow shop-buy-btn">🪙${item.price}</button>
    `;
    row.querySelector(".shop-buy-btn").addEventListener("click", () => buyItem(item, row));
    list.appendChild(row);
  });
}

function shopTypeLabel(type) {
  const map = { capture: "捕獲", heal: "回復", food: "ごはん" };
  return map[type] || type;
}

function buyItem(item, row) {
  const success = spendGold(item.price);
  if (!success) {
    showToast("ゴールドが たりないよ！");
    return;
  }
  addItem(item.id, 1);
  saveGame();
  showToast(`${item.name}を かったよ！`);

  // バグ回避: 画面を離れずゴールドが変動したのでヘッダー表示を更新する
  const state = getState();
  const shopGoldEl = document.getElementById("shop-gold");
  if (shopGoldEl) shopGoldEl.textContent = state.player.gold;
  refreshGoldDisplay();

  const countEl = row.querySelector(".shop-row-count");
  if (countEl) countEl.textContent = `もちもの: ${getItemCount(item.id)}こ`;
}
