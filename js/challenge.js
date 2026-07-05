// QRチーム共有・フレンドバトル用チャレンジデータのエンコード/デコード
// ペイロード仕様 v2: {v:2, tn: トレーナー名, team: [{sp: speciesId, l: level, n: nickname}, ...]}
// v2以外（旧v1含む）は安全に拒否する（forms/evolutionStage概念の廃止に伴い後方互換は取らない）。
import { species } from "../data/monsters.js";
import { computeStatsForMasterAtLevel } from "./state.js";

const CHALLENGE_VERSION = 2;
export const DEFAULT_TRAINER_NAME = "もちぽよトレーナー";

// UTF-8対応base64url。btoa(unescape(encodeURIComponent(json))) してから -_ 置換、= 除去。
export function encodeChallengePayload(payload) {
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// 逆変換。壊れたデータはthrowする（呼び出し側でtry/catchすること）。
export function decodeChallengePayloadRaw(base64url) {
  let b64 = String(base64url).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad !== 0) throw new Error("invalid base64url length");
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json);
}

export function buildSharePayload(trainerName, party) {
  return {
    v: CHALLENGE_VERSION,
    tn: trainerName && String(trainerName).trim() ? String(trainerName).trim() : DEFAULT_TRAINER_NAME,
    team: party.map((instance) => ({
      sp: instance.speciesId,
      l: instance.level,
      n: instance.nickname,
    })),
  };
}

function clamp(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// 受信ペイロードを検証・クランプし、安全なチャレンジオブジェクトを返す。
// 不正な場合はnullを返す（例外は投げない。呼び出し側でtry/catchしてparse失敗と区別する必要はない）。
// v2以外(旧v1含む)のペイロードは無条件でnullを返す。
export function validateAndNormalizeChallenge(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  if (rawPayload.v !== CHALLENGE_VERSION) return null;
  if (!Array.isArray(rawPayload.team) || rawPayload.team.length === 0) return null;

  const trainerName = String(rawPayload.tn == null ? "" : rawPayload.tn).slice(0, 12).trim() || DEFAULT_TRAINER_NAME;

  const team = rawPayload.team
    .slice(0, 3)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const master = species.find((s) => s.speciesId === entry.sp);
      if (!master) return null;
      const level = clamp(entry.l, 1, 100);
      const nickname = String(entry.n == null ? master.name : entry.n).slice(0, 12) || master.name;
      const stats = computeStatsForMasterAtLevel(master, level);
      return { speciesId: master.speciesId, master, level, nickname, stats };
    })
    .filter(Boolean);

  if (team.length === 0) return null;

  return { trainerName, team };
}

// URLのクエリパラメータからチャレンジをデコード・検証する。失敗時はnull。
export function parseChallengeFromSearch(search) {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get("challenge");
    if (!raw) return null;
    const payload = decodeChallengePayloadRaw(raw);
    return validateAndNormalizeChallenge(payload);
  } catch (e) {
    return null;
  }
}
