// 開発おうえん（投げ銭）リンク設定
// url に投げ銭ページのURLを入れると、タイトル画面と設定画面にボタンが表示される。
// null のあいだは何も表示されない（未登録でも安全）。
export const SUPPORT_LINKS = [
  {
    id: "ofuse",
    label: "OFUSEで おうえんする",
    emoji: "💌",
    url: "https://ofuse.me/7f5ac761",
  },
  {
    id: "kofi",
    label: "Ko-fiで おうえんする",
    emoji: "☕",
    url: "https://ko-fi.com/H5R622OAME",
  },
];

// 表示対象（URL設定済み）のリンクだけ返す
export function getActiveSupportLinks() {
  return SUPPORT_LINKS.filter((l) => !!l.url);
}

// おうえんボタン群のHTMLを返す（無ければ空文字）
export function supportButtonsHtml() {
  const links = getActiveSupportLinks();
  if (links.length === 0) return "";
  const buttons = links
    .map(
      (l) =>
        `<a class="support-link" href="${l.url}" target="_blank" rel="noopener noreferrer">${l.emoji} ${l.label}</a>`
    )
    .join("");
  return `
    <div class="support-box">
      <p class="support-note">あそんでくれて ありがとう！</p>
      ${buttons}
    </div>
  `;
}
