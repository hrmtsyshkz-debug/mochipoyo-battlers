// 共通UIユーティリティ
let toastTimer = null;

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

// 画像素材: form/master の icon・full チェーンから最初に有効な画像パスを解決し、
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

// kind: "icon" | "full"。発注元指定の優先順位でフォールバックチェーンを辿る。
// icon: form.icon → form.full → master.icon → master.full → null
// full: form.full → master.full → form.icon → master.icon → null
// master.images はトップレベルに存在しない場合もあるため安全に読む。
export function resolveMonsterImage(master, form, kind) {
  const formImages = (form && form.images) || {};
  const masterImages = (master && master.images) || {};
  const chain =
    kind === "full"
      ? [formImages.full, masterImages.full, formImages.icon, masterImages.icon]
      : [formImages.icon, formImages.full, masterImages.icon, masterImages.full];
  for (const src of chain) {
    if (src && !failedImageSrcs.has(src)) {
      return src;
    }
  }
  return null;
}

// 画像+絵文字フォールバックの中身HTML（丸カード・肖像などの親要素に入れて使う）
export function monsterImageInnerHtml(master, form = null, kind = "icon") {
  if (!master) return "❓";
  const emoji = master.emoji || "❓";
  const src = resolveMonsterImage(master, form, kind);
  if (!src) return emoji;
  return `<img class="monster-img" src="${src}" alt="${master.name}" onerror="__mochipoyoImgError(this)"><span style="display:none;">${emoji}</span>`;
}

export function monsterAvatarHtml(master, options = {}) {
  const { large = false, silhouette = false, form = null } = options;
  const classes = ["monster-avatar"];
  if (large) classes.push("large");
  if (silhouette) classes.push("silhouette");
  const resolvedForm = form || (master && Array.isArray(master.forms) ? master.forms.find((f) => f.evolutionStage === 0) : null);
  const inner = silhouette ? "？" : monsterImageInnerHtml(master, resolvedForm, "icon");
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
export function monsterFullArtHtml(master, form = null) {
  if (!master) return `<div class="monster-avatar large">❓</div>`;
  const resolvedForm = form || (Array.isArray(master.forms) ? master.forms.find((f) => f.evolutionStage === 0) : null);
  const src = resolveMonsterImage(master, resolvedForm, "full");
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
  };
  return map[rarity] || rarity;
}

export function displayName(instance, master) {
  if (!master) return "？？？";
  return instance && instance.nickname ? instance.nickname : master.name;
}
