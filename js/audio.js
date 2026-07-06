// 効果音（SE）: Web Audio APIによるプログラム生成。音源ファイルは一切使用しない。
// - AudioContextは初回のユーザー操作(click/keydown)まで生成しない（自動再生ポリシー対応）
// - state.settings.sound === false のときは何もしない（AudioContext生成もスキップ）
// - すべての処理はtry/catchで囲み、失敗してもゲーム進行に影響しない
import { getState } from "./state.js";

let audioCtx = null;
let masterGain = null;
let initStarted = false;

const MASTER_VOLUME = 0.18;

// ---------- 初期化 ----------

function isSoundEnabled() {
  try {
    const state = getState();
    return !!(state && state.settings && state.settings.sound !== false);
  } catch (e) {
    return false;
  }
}

// 初回のユーザー操作(click/keydown)でAudioContextを生成する。
// ブラウザの自動再生ポリシーにより、ユーザー操作なしのAudioContextはsuspended状態になるため。
// サウンドOFFのときはAudioContext自体を作らずに済ませたいので、ここでは判定せず
// 実際の生成は常にplaySfx経由（isSoundEnabledチェック後）に限定する。
// このリスナーは「OFFのままだったら何もしない」ように、都度sound設定を見てから生成する。
function ensureAudioContextArmed() {
  if (initStarted) return;
  initStarted = true;
  const armOnce = () => {
    if (!isSoundEnabled()) return; // OFF設定ならAudioContextを作らない
    createAudioContextIfNeeded();
    resumeAudioContext();
  };
  try {
    window.addEventListener("click", armOnce, { once: true });
    window.addEventListener("keydown", armOnce, { once: true });
    window.addEventListener("touchstart", armOnce, { once: true });
  } catch (e) {
    // 何もできる対処がないため無音フォールバック
  }
}

function createAudioContextIfNeeded() {
  if (audioCtx) return audioCtx;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = MASTER_VOLUME;
    masterGain.connect(audioCtx.destination);
  } catch (e) {
    audioCtx = null;
    masterGain = null;
  }
  return audioCtx;
}

function resumeAudioContext() {
  try {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  } catch (e) {
    // 無視: 再生できないだけでゲームは継続する
  }
}

// モジュール読み込み時にリスナーだけ仕込んでおく（AudioContext自体はまだ作らない）
ensureAudioContextArmed();

// ---------- 基本ヘルパー ----------

// 1つのオシレーターブリップを鳴らす。
// opts: { freq, endFreq, type, start(秒後), duration(秒), gain, gainEnd }
function playTone(opts) {
  if (!audioCtx || !masterGain) return;
  const {
    freq = 440,
    endFreq = null,
    type = "sine",
    start = 0,
    duration = 0.15,
    gain = 0.5,
    gainEnd = 0.0001,
  } = opts;

  const t0 = audioCtx.currentTime + Math.max(0, start);
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, freq), t0);
  if (endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
  }

  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + Math.min(0.02, duration / 4));
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainEnd), t0 + duration);

  osc.connect(gainNode);
  gainNode.connect(masterGain);

  osc.start(t0);
  osc.stop(t0 + duration + 0.02);

  // 使い捨てノードの後始末（メモリリーク防止。GCに任せず明示的にdisconnect）
  osc.onended = () => {
    try {
      osc.disconnect();
      gainNode.disconnect();
    } catch (e) {
      // 無視
    }
  };
}

// ノイズバースト（打撃・被弾用）。durationごとに使い捨てのAudioBufferSourceNodeを生成する。
function playNoise({ start = 0, duration = 0.12, gain = 0.4, filterFreq = 1200 } = {}) {
  if (!audioCtx || !masterGain) return;
  const t0 = audioCtx.currentTime + Math.max(0, start);
  const sampleCount = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, sampleCount, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    // 末尾に向けて減衰させるノイズ
    const decay = 1 - i / sampleCount;
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(Math.max(0.001, gain), t0);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  noiseSource.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(masterGain);

  noiseSource.start(t0);
  noiseSource.stop(t0 + duration + 0.02);

  noiseSource.onended = () => {
    try {
      noiseSource.disconnect();
      filter.disconnect();
      gainNode.disconnect();
    } catch (e) {
      // 無視
    }
  };
}

// 周波数列を宣言的に鳴らす小さなノートシーケンサー。
// notes: [{ freq, endFreq, type, duration, gain, gap }]  gap = 次のノートまでの追加待ち時間(秒、省略時0)
function playSequence(notes, { type = "square", gain = 0.5 } = {}) {
  if (!audioCtx || !masterGain) return;
  let cursor = 0;
  notes.forEach((note) => {
    const duration = note.duration != null ? note.duration : 0.12;
    playTone({
      freq: note.freq,
      endFreq: note.endFreq != null ? note.endFreq : null,
      type: note.type || type,
      start: cursor,
      duration,
      gain: note.gain != null ? note.gain : gain,
    });
    cursor += duration + (note.gap != null ? note.gap : 0.02);
  });
}

// ---------- SE定義 ----------
// 各SEは (ctx未生成 or サウンドOFFなら何もしない) playTone/playNoise/playSequence の組み合わせで表現する。

const sfxDefs = {
  // ぽよんとした打撃: ノイズバースト + 下降スイープ
  attack() {
    playNoise({ duration: 0.08, gain: 0.35, filterFreq: 1800 });
    playTone({ freq: 520, endFreq: 220, type: "triangle", duration: 0.16, gain: 0.4, start: 0.02 });
  },

  // スカした感じの短い下降音
  miss() {
    playTone({ freq: 300, endFreq: 150, type: "sine", duration: 0.18, gain: 0.3 });
  },

  // 被弾: attackより低め・鈍め
  damage() {
    playNoise({ duration: 0.1, gain: 0.32, filterFreq: 900 });
    playTone({ freq: 260, endFreq: 110, type: "sawtooth", duration: 0.22, gain: 0.35, start: 0.02 });
  },

  // ぽむっとした防御音
  guard() {
    playTone({ freq: 200, endFreq: 260, type: "sine", duration: 0.14, gain: 0.4 });
    playNoise({ duration: 0.05, gain: 0.15, filterFreq: 700, start: 0.01 });
  },

  // 上昇アルペジオ(3音)
  heal() {
    playSequence(
      [
        { freq: 523.25, duration: 0.1 }, // C5
        { freq: 659.25, duration: 0.1 }, // E5
        { freq: 783.99, duration: 0.18 }, // G5
      ],
      { type: "triangle", gain: 0.32 }
    );
  },

  // 上昇の短いワブル
  buff() {
    playTone({ freq: 400, endFreq: 700, type: "square", duration: 0.16, gain: 0.28 });
    playTone({ freq: 700, endFreq: 900, type: "square", duration: 0.12, gain: 0.22, start: 0.1 });
  },

  // 下降の短いワブル
  debuff() {
    playTone({ freq: 500, endFreq: 280, type: "square", duration: 0.16, gain: 0.28 });
    playTone({ freq: 280, endFreq: 180, type: "square", duration: 0.12, gain: 0.22, start: 0.1 });
  },

  // ひゅっと投げる上昇スイープ
  capture_throw() {
    playTone({ freq: 300, endFreq: 900, type: "sine", duration: 0.22, gain: 0.3 });
  },

  // 3〜4音のハッピージングル
  capture_success() {
    playSequence(
      [
        { freq: 523.25, duration: 0.1 }, // C5
        { freq: 659.25, duration: 0.1 }, // E5
        { freq: 783.99, duration: 0.1 }, // G5
        { freq: 1046.5, duration: 0.22 }, // C6
      ],
      { type: "triangle", gain: 0.34 }
    );
  },

  // 残念だけど暗すぎない2音
  capture_fail() {
    playSequence(
      [
        { freq: 440, duration: 0.14 },
        { freq: 349.23, duration: 0.22 }, // F4
      ],
      { type: "sine", gain: 0.3 }
    );
  },

  // 短いファンファーレ(4〜5音)
  victory() {
    playSequence(
      [
        { freq: 523.25, duration: 0.11 }, // C5
        { freq: 659.25, duration: 0.11 }, // E5
        { freq: 783.99, duration: 0.11 }, // G5
        { freq: 1046.5, duration: 0.11 }, // C6
        { freq: 1318.51, duration: 0.26 }, // E6
      ],
      { type: "square", gain: 0.3 }
    );
  },

  // やわらかい下降2音（悲壮にしない）
  lose() {
    playSequence(
      [
        { freq: 392.0, duration: 0.2 }, // G4
        { freq: 293.66, duration: 0.32 }, // D4
      ],
      { type: "triangle", gain: 0.28 }
    );
  },

  // キラキラアルペジオ(5〜6音、少し長め)
  evolve() {
    playSequence(
      [
        { freq: 523.25, duration: 0.11 }, // C5
        { freq: 659.25, duration: 0.11 }, // E5
        { freq: 783.99, duration: 0.11 }, // G5
        { freq: 1046.5, duration: 0.11 }, // C6
        { freq: 1318.51, duration: 0.11 }, // E6
        { freq: 1567.98, duration: 0.24 }, // G6
      ],
      { type: "triangle", gain: 0.3 }
    );
  },

  // 明るい2〜3音
  levelup() {
    playSequence(
      [
        { freq: 659.25, duration: 0.1 }, // E5
        { freq: 880.0, duration: 0.1 }, // A5
        { freq: 1046.5, duration: 0.18 }, // C6
      ],
      { type: "square", gain: 0.3 }
    );
  },

  // 連打1回ごとの短いぽよ音（重なっても割れないよう音量小さめ）
  mash_tap() {
    playTone({ freq: 700, endFreq: 900, type: "sine", duration: 0.05, gain: 0.16 });
  },

  // ミニゲーム結果表示音。grade: "PERFECT"|"GOOD"|"OK"|"MISS" などを引数で受ける。
  minigame_result(grade) {
    if (grade === "PERFECT" || grade === "GOOD") {
      playSequence(
        [
          { freq: 659.25, duration: 0.09 },
          { freq: 987.77, duration: 0.16 },
        ],
        { type: "triangle", gain: 0.32 }
      );
    } else {
      playSequence(
        [
          { freq: 392.0, duration: 0.12 },
          { freq: 329.63, duration: 0.16 },
        ],
        { type: "sine", gain: 0.26 }
      );
    }
  },

  // じゃんけん勝ち
  janken_win() {
    playSequence(
      [
        { freq: 587.33, duration: 0.09 },
        { freq: 880.0, duration: 0.16 },
      ],
      { type: "square", gain: 0.3 }
    );
  },

  // じゃんけん負け
  janken_lose() {
    playTone({ freq: 320, endFreq: 180, type: "sawtooth", duration: 0.2, gain: 0.26 });
  },

  // じゃんけんあいこ
  janken_draw() {
    playTone({ freq: 440, endFreq: 440, type: "sine", duration: 0.12, gain: 0.24 });
    playTone({ freq: 440, endFreq: 440, type: "sine", duration: 0.12, gain: 0.2, start: 0.1 });
  },
};

// ---------- 公開API ----------

// name: sfxDefsのキー。arg: minigame_resultのgradeなど、SEによっては追加引数を取る。
export function playSfx(name, arg) {
  try {
    if (!isSoundEnabled()) return;
    const def = sfxDefs[name];
    if (!def) return;

    // ユーザー操作前でも呼ばれ得るため、まだAudioContextが無ければここで生成を試みる。
    // （すでに armOnce 経由で作られていれば何もしない）
    if (!audioCtx) {
      createAudioContextIfNeeded();
    }
    if (!audioCtx) return; // AudioContext未対応環境などは無音フォールバック
    resumeAudioContext();

    def(arg);
  } catch (e) {
    // SE再生の失敗でゲームを止めない
  }
}
