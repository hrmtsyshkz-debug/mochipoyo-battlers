// バトルロジック（ターン制、仕様書 v0.2 準拠）
import { getSkill } from "./state.js";

// ---------- ダメージ計算 ----------
// baseDamage = skill.power + attacker.stats.poyoPower - floor(defender.stats.mochiDefense / 2)
// finalDamage = max(1, floor(baseDamage))
// 属性一致なら1.1倍
// ガード中は最終ダメージに必ず0.5を掛ける（ダメージを増やす方向には絶対に効かせない）
export function calcDamage(attackerUnit, defenderUnit, skill) {
  const baseDamage = skill.power + attackerUnit.stats.poyoPower - Math.floor(defenderUnit.stats.mochiDefense / 2);
  let finalDamage = Math.max(1, Math.floor(baseDamage));

  if (attackerUnit.element && attackerUnit.element.includes(skill.element)) {
    finalDamage = Math.floor(finalDamage * 1.1);
  }

  if (defenderUnit.isGuarding) {
    // バグ回避: ガードは必ずダメージを減らす方向にのみ効く
    finalDamage = Math.max(1, Math.floor(finalDamage * 0.5));
  }

  return Math.max(1, finalDamage);
}

// ---------- 命中判定 ----------
export function rollHit(skill) {
  return Math.random() * 100 < skill.accuracy;
}

// ---------- 行動順 ----------
// speedが高い方から。同値はランダム。
export function decideActionOrder(unitA, unitB) {
  const speedA = effectiveStat(unitA, "speed");
  const speedB = effectiveStat(unitB, "speed");
  if (speedA === speedB) {
    return Math.random() < 0.5 ? [unitA, unitB] : [unitB, unitA];
  }
  return speedA > speedB ? [unitA, unitB] : [unitB, unitA];
}

// ---------- バフ/デバフ ----------
// unit.buffs: [{ stat, amount, duration }]
// 一時的なステータス修正はターン単位で管理し、durationターン後に消える。
export function addBuff(unit, statKey, amount, duration) {
  if (!unit.buffs) unit.buffs = [];
  unit.buffs.push({ stat: statKey, amount, duration });
}

export function effectiveStat(unit, statKey) {
  const base = unit.stats[statKey] || 0;
  if (!unit.buffs || unit.buffs.length === 0) return base;
  const bonus = unit.buffs
    .filter((b) => b.stat === statKey)
    .reduce((sum, b) => sum + b.amount, 0);
  return Math.max(0, base + bonus);
}

// ターン終了時にdurationを減らし、0以下になったバフを消す
export function tickBuffs(unit) {
  if (!unit.buffs) return;
  unit.buffs = unit.buffs
    .map((b) => ({ ...b, duration: b.duration - 1 }))
    .filter((b) => b.duration > 0);
}

// effectiveStatを反映した見せかけのstatsオブジェクトを作る（ダメージ計算に使う）
export function withEffectiveStats(unit) {
  const stats = { ...unit.stats };
  for (const key of Object.keys(stats)) {
    stats[key] = effectiveStat(unit, key);
  }
  return { ...unit, stats };
}

// ---------- バトルユニット ----------
export function createBattleUnit({ name, emoji, element, stats, skillIds, level }) {
  return {
    name,
    emoji,
    element: element || [],
    level: level || 1,
    stats: { ...stats },
    maxHp: stats.hp,
    currentHp: stats.hp,
    isGuarding: false,
    buffs: [],
    skillIds: skillIds || [],
  };
}

export function isFainted(unit) {
  return unit.currentHp <= 0;
}

// ---------- 1ターン行動解決 ----------
// actor, target: battleUnit。skillId: 使用スキルid。
// multiplier: ミニゲーム補正（連打・ぽよじゃんけん等）。攻撃/特殊のダメージ計算後に乗算する。デフォルト1.0。
// 戻り値: { logs: string[], fainted: boolean }
export function resolveSkillAction(actor, target, skillId, multiplier = 1.0) {
  const skill = getSkill(skillId);
  const logs = [];
  if (!skill) return { logs, fainted: false };

  logs.push(`${actor.name}の ${skill.name}！`);

  if (skill.type === "attack" || skill.type === "special") {
    const hit = rollHit(skill);
    if (!hit) {
      logs.push(`しかし ${target.name}には あたらなかった...`);
      return { logs, fainted: false };
    }
    const attackerView = withEffectiveStats(actor);
    const defenderView = withEffectiveStats(target);
    defenderView.isGuarding = target.isGuarding;
    let dmg = calcDamage(attackerView, defenderView, skill);
    if (multiplier !== 1.0) {
      dmg = Math.max(1, Math.floor(dmg * multiplier));
    }
    target.currentHp = Math.max(0, target.currentHp - dmg);
    logs.push(`${target.name}に ${dmg} のダメージ！`);
    if (target.isGuarding) {
      logs.push(`${target.name}は ふんばって いる！`);
    }
    if (skill.effect && skill.effect.healSelf) {
      const healAmount = skill.effect.healSelf;
      actor.currentHp = Math.min(actor.maxHp, actor.currentHp + healAmount);
      logs.push(`${actor.name}は ${healAmount} かいふくした！`);
    }
    if (isFainted(target)) {
      return { logs, fainted: true };
    }
  } else if (skill.type === "guard") {
    // guardタイプのスキルは防御バフのみ。isGuarding（ふんばる=受けるダメージ50%）は
    // 「ふんばる」コマンド専用なのでここでは立てない。
    logs.push(`${actor.name}の まもりが かたくなった！`);
    if (skill.effect) {
      const duration = skill.effect.duration || 1;
      if (skill.effect.defenseUp) addBuff(actor, "mochiDefense", skill.effect.defenseUp, duration);
      if (skill.effect.charmUp) addBuff(actor, "charm", skill.effect.charmUp, duration);
      if (skill.effect.speedDown) addBuff(actor, "speed", -skill.effect.speedDown, duration);
    }
  } else if (skill.type === "heal") {
    const healAmount = multiplier !== 1.0 ? Math.max(1, Math.floor(skill.power * multiplier)) : skill.power;
    actor.currentHp = Math.min(actor.maxHp, actor.currentHp + healAmount);
    logs.push(`${actor.name}は ${healAmount} かいふくした！`);
  } else if (skill.type === "buff") {
    const duration = 3; // TODO: 仕様書にbuff系skillのdurationが無いため仮置き
    if (skill.effect) {
      if (skill.effect.attackUp) addBuff(actor, "poyoPower", skill.effect.attackUp, duration);
      if (skill.effect.speedUp) addBuff(actor, "speed", skill.effect.speedUp, duration);
      if (skill.effect.appetiteUp) addBuff(actor, "appetite", skill.effect.appetiteUp, duration);
      if (skill.effect.charmUp) addBuff(actor, "charm", skill.effect.charmUp, duration);
      if (skill.effect.speedDown) addBuff(actor, "speed", -skill.effect.speedDown, duration);
    }
    logs.push(`${actor.name}は ちからが みなぎった！`);
  } else if (skill.type === "debuff") {
    const hit = rollHit(skill);
    if (!hit) {
      logs.push(`しかし ${target.name}には きかなかった...`);
      return { logs, fainted: false };
    }
    const duration = 3; // TODO: 仕様書にdebuff系skillのdurationが無いため仮置き
    if (skill.effect) {
      if (skill.effect.attackDown) addBuff(target, "poyoPower", -skill.effect.attackDown, duration);
      if (skill.effect.defenseDown) addBuff(target, "mochiDefense", -skill.effect.defenseDown, duration);
      if (skill.effect.speedDown) addBuff(target, "speed", -skill.effect.speedDown, duration);
    }
    logs.push(`${target.name}の ようすが かわった！`);
  }

  return { logs, fainted: isFainted(target) };
}

// 「ふんばる」コマンド: 1ターンだけ受けるダメージを50%にする
export function resolveGuardAction(actor) {
  actor.isGuarding = true;
  return { logs: [`${actor.name}は ぐっと ふんばった！`], fainted: false };
}

export function resetGuard(unit) {
  unit.isGuarding = false;
}

// ---------- 捕獲 ----------
// captureRate = enemy.baseCaptureRate + hpBonus + item.capturePower * 0.1 + timingBonus
// 最終的に 0.02〜0.95 の範囲にクランプする（ミニゲーム仕様 v0.5）
export function calcCaptureRate(enemyMaster, enemyUnit, item, timingBonus = 0) {
  const hpRatio = enemyUnit.currentHp / enemyUnit.maxHp;
  let hpBonus = 0;
  if (hpRatio <= 0.25) {
    hpBonus = 0.35;
  } else if (hpRatio <= 0.5) {
    hpBonus = 0.2;
  } else if (hpRatio <= 0.75) {
    hpBonus = 0.1;
  }
  const rate = enemyMaster.baseCaptureRate + hpBonus + item.capturePower * 0.1 + timingBonus;
  return Math.min(0.95, Math.max(0.02, rate));
}

export function attemptCapture(enemyMaster, enemyUnit, item, timingBonus = 0) {
  const rate = calcCaptureRate(enemyMaster, enemyUnit, item, timingBonus);
  return Math.random() < rate;
}

// ---------- 敵AI ----------
// シンプルな敵AI: HPが低ければheal優先、それ以外はattack系からランダム
export function chooseEnemySkill(unit) {
  const skillObjs = unit.skillIds.map((id) => getSkill(id)).filter(Boolean);
  const healSkill = skillObjs.find((s) => s.type === "heal");
  if (healSkill && unit.currentHp < unit.maxHp * 0.3 && Math.random() < 0.35) {
    return healSkill.id;
  }
  const attackSkills = skillObjs.filter((s) => s.type === "attack" || s.type === "special");
  const pool = attackSkills.length > 0 ? attackSkills : skillObjs;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ---------- にげる ----------
// 通常敵からは逃げられる。ボスからは逃げにくくする。
export function attemptFlee(isBoss) {
  if (!isBoss) return true;
  return Math.random() < 0.5; // TODO: ボス戦の逃走成功率は仮に50%とする
}
