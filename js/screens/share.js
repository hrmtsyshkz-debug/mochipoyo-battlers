// チーム共有(QR)オーバーレイ
import { getState } from "../state.js";
import { buildSharePayload, encodeChallengePayload } from "../challenge.js";
import { showToast, escapeHtml } from "../ui.js";

export function openShareOverlay() {
  const state = getState();
  if (!state.party || state.party.length === 0) {
    showToast("きょうゆうする もちぽよが いないよ");
    return;
  }

  const payload = buildSharePayload(state.player.name, state.party);
  const encoded = encodeChallengePayload(payload);
  const url = `${location.origin}${location.pathname}?challenge=${encoded}`;

  const overlay = document.getElementById("share-overlay");
  overlay.innerHTML = `
    <div class="share-card">
      <h2>🔗 チームを きょうゆう</h2>
      <p class="hint-text">このQRや URLを ともだちに おくって しょうぶしよう！</p>
      <div class="share-qr-wrap" id="share-qr-wrap">
        <p class="hint-text">QRコードを つくっているよ...</p>
      </div>
      <div class="share-url-box" id="share-url-box">${escapeHtml(url)}</div>
      <button class="btn btn-block" id="share-copy-btn">URLをコピー</button>
      <button class="btn btn-secondary btn-block" id="share-close-btn">とじる</button>
    </div>
  `;
  overlay.classList.remove("hidden");

  generateQr(url);

  overlay.querySelector("#share-copy-btn").addEventListener("click", () => {
    copyUrl(url);
  });
  overlay.querySelector("#share-close-btn").addEventListener("click", () => {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  });
}

function generateQr(url) {
  const wrap = document.getElementById("share-qr-wrap");
  if (!wrap) return;
  // js/vendor/qrcode-generator.js（グローバル qrcode）を使用。読み込めない環境でもURL共有だけで成立させる
  if (typeof window.qrcode !== "function") {
    wrap.innerHTML = `<p class="hint-text">QRコードは つかえなかったけど、URLで きょうゆうできるよ</p>`;
    return;
  }
  try {
    const qr = window.qrcode(0, "M"); // 0 = 自動タイプ選択
    qr.addData(url);
    qr.make();
    const cellSize = 5;
    const margin = 10;
    const dataUrl = qr.createDataURL(cellSize, margin);
    wrap.innerHTML = `<img src="${dataUrl}" alt="チャレンジQRコード" width="240" height="240" />`;
  } catch (e) {
    wrap.innerHTML = `<p class="hint-text">QRコードは つかえなかったけど、URLで きょうゆうできるよ</p>`;
  }
}

function copyUrl(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(url)
      .then(() => showToast("URLをコピーしたよ！"))
      .catch(() => fallbackCopy(url));
  } else {
    fallbackCopy(url);
  }
}

function fallbackCopy(url) {
  try {
    const box = document.getElementById("share-url-box");
    if (box) {
      const range = document.createRange();
      range.selectNodeContents(box);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand && document.execCommand("copy");
      if (ok) {
        showToast("URLをコピーしたよ！");
        return;
      }
    }
    showToast("URLを えらんで コピーしてね");
  } catch (e) {
    showToast("URLを えらんで コピーしてね");
  }
}
