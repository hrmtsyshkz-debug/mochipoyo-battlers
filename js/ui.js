// 共通UIユーティリティ
let toastTimer = null;

// XSS対策: 外部由来の文字列(トレーナー名・ニックネーム等)をHTMLに挿入する前に必ず通す
const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

export function showToast(message, duration = 2000) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

export function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.innerHTML = content;
  return node;
}

// 画像素材: species.images の icon・full チェーンから最初に有効な画像パスを解決し、
// 存在しない/読み込み失敗時は master.emoji にフォールバックする。
// 一度失敗したパスは記憶し、再レンダー時に無駄な404リクエストを出さない。
const failedImageSrcs = new Set();

// inline onerror から呼ぶためグローバルに公開
window.__mochipoyoImgError = function (img) {
  failedImageSrcs.add(img.getAttribute("src"));
  img.style.display = "none";
  const fallback = img.nextElementSibling;
  if (fallback) fallback.style.display = "";
};

// kind: "icon" | "full"。species.images直参照のフォールバックチェーンを辿る。
// icon: icon → full → null
// full: full → icon → null
export function resolveMonsterImage(master, kind) {
  const images = (master && master.images) || {};
  const chain = kind === "full" ? [images.full, images.icon] : [images.icon, images.full];
  for (const src of chain) {
    if (src && !failedImageSrcs.has(src)) {
      return src;
    }
  }
  return null;
}

// 画像+絵文字フォールバックの中身HTML（丸カード・肖像などの親要素に入れて使う）
export function monsterImageInnerHtml(master, kind = "icon") {
  if (!master) return "❓";
  const emoji = master.emoji || "❓";
  const src = resolveMonsterImage(master, kind);
  if (!src) return emoji;
  return `<img class="monster-img" src="${src}" alt="${master.name}" onerror="__mochipoyoImgError(this)"><span style="display:none;">${emoji}</span>`;
}

export function monsterAvatarHtml(master, options = {}) {
  const { large = false, silhouette = false } = options;
  const classes = ["monster-avatar"];
  if (large) classes.push("large");
  if (silhouette) classes.push("silhouette");
  const inner = silhouette ? "？" : monsterImageInnerHtml(master, "icon");
  return `<div class="${classes.join(" ")}">${inner}</div>`;
}

// inline onerror から呼ぶためグローバルに公開（縦カード用: 画像失敗時に丸アバター+絵文字へ差し替える）
window.__mochipoyoFullArtError = function (img) {
  failedImageSrcs.add(img.getAttribute("src"));
  const card = img.closest(".monster-full-art");
  const fallback = card && card.nextElementSibling;
  if (card) card.style.display = "none";
  if (fallback) fallback.style.display = "";
};

// full系チェーンで画像が取れれば角丸の縦カード、無ければ従来の丸アバター+絵文字にフォールバック
export function monsterFullArtHtml(master) {
  if (!master) return `<div class="monster-avatar large">❓</div>`;
  const src = resolveMonsterImage(master, "full");
  const emoji = master.emoji || "❓";
  const fallbackAvatar = `<div class="monster-avatar large" style="display:none;">${emoji}</div>`;
  if (!src) {
    return `<div class="monster-avatar large">${emoji}</div>`;
  }
  return `<div class="monster-full-art"><img src="${src}" alt="${master.name}" onerror="__mochipoyoFullArtError(this)"></div>${fallbackAvatar}`;
}

export function rarityLabel(rarity) {
  const map = {
    S: "スタンダード",
    M: "ミドル",
    L: "レア",
    XL: "スーパーレア",
    XXL: "ウルトラレア",
    LEGEND: "レジェンド",
    // TODO: 隠しボス用レア度ラベルは仮置き（チャッピー承認待ち）
    SECRET: "シークレット",
    SECRET_LEGEND: "ひみつのレジェンド",
  };
  return map[rarity] || rarity;
}

export function displayName(instance, master) {
  if (!master) return "？？？";
  return instance && instance.nickname ? instance.nickname : master.name;
}
