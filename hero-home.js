export const HERO_HOME_RULES = Object.freeze({
  version: "2026-08-14-v3",
  skillVersion: "2026-08-14-skill-v2",
  maxProductionHours: 6,
  singlePullPrice: 30,
  tenPullPrice: 300,
  freePullIntervalHours: 24,
  heroChance: 0.1,
  pityPulls: 50,
  heroDuplicateFragments: 40,
  minionDuplicateFragments: 10,
  maxHeroDuplicateUniversalFragments: 20,
  maxMinionDuplicateUniversalFragments: 1,
  heroStarCosts: Object.freeze({ 2: 20, 3: 40, 4: 60, 5: 80 }),
  minionStarCosts: Object.freeze({ 2: 10, 3: 20, 4: 30, 5: 40 }),
  heroProduction: Object.freeze([3, 4, 5, 6, 7]),
  minionProduction: Object.freeze([1, 1.25, 1.5, 1.75, 2])
});

export const HOME_REGIONS = Object.freeze([
  Object.freeze({ id: "boka", name: "博卡区", icon: "🏇" }),
  Object.freeze({ id: "brick", name: "搬砖区", icon: "🧱" }),
  Object.freeze({ id: "stage", name: "公演区", icon: "🎤" })
]);

export const HOME_UNITS = Object.freeze([
  Object.freeze({
    id: "jiang-zha", name: "蒋渣", shortName: "渣", type: "hero", regionId: "boka", color: "#285b93",
    cardImage: "/assets/heroes/jiang-zha-card.jpg",
    skillName: "渣代思维", skillDescription: "最终身份为狗腿且原始最终积分为正时，按星级追加钻石。"
  }),
  Object.freeze({
    id: "deng-huang", name: "灯皇", shortName: "灯", type: "hero", regionId: "boka", color: "#16858a",
    cardImage: "/assets/heroes/deng-huang-card.jpg",
    skillName: "倒买倒卖", skillDescription: "本人赢得最后一轮时，按星级追加钻石。"
  }),
  Object.freeze({ id: "boka-youth", name: "博卡青年", shortName: "博", type: "minion", regionId: "boka", color: "#d6a936" }),
  Object.freeze({
    id: "xiaoxu", name: "小旭", shortName: "旭", type: "hero", regionId: "brick", color: "#c45e51",
    cardImage: "/assets/heroes/xiaoxu-card.jpg",
    skillName: "八方来财", skillDescription: "从不同其他玩家打出的计分牌中赢得牌分时，每个来源追加1钻。"
  }),
  Object.freeze({
    id: "gelu", name: "格鲁", shortName: "格", type: "hero", regionId: "brick", color: "#7958a5",
    cardImage: "/assets/heroes/gelu-card.jpg",
    skillName: "多劳多得", skillDescription: "个人赢墩牌分每满50分追加1钻。"
  }),
  Object.freeze({ id: "brick-worker", name: "搬砖工", shortName: "砖", type: "minion", regionId: "brick", color: "#a67445" }),
  Object.freeze({
    id: "maeda-atsuko", name: "前田敦子", shortName: "敦", type: "hero", regionId: "stage", color: "#d25d86",
    cardImage: "/assets/heroes/maeda-atsuko-card.jpg",
    skillName: "中心光芒", skillDescription: "本人是庄家且原始最终积分为正时，按星级追加钻石。"
  }),
  Object.freeze({
    id: "watanabe-mayu", name: "渡边麻友", shortName: "麻", type: "hero", regionId: "stage", color: "#d879b4",
    cardImage: "/assets/heroes/watanabe-mayu-card.jpg",
    skillName: "荣誉舞台", skillDescription: "每个白名单正向称号追加1钻，按星级封顶。"
  }),
  Object.freeze({ id: "trainee", name: "练习生", shortName: "练", type: "minion", regionId: "stage", color: "#7197bd" })
]);

export const HERO_UNITS = Object.freeze(HOME_UNITS.filter((unit) => unit.type === "hero"));
export const MINION_UNITS = Object.freeze(HOME_UNITS.filter((unit) => unit.type === "minion"));
export const HOME_REGION_BY_ID = new Map(HOME_REGIONS.map((region) => [region.id, region]));
export const HOME_UNIT_BY_ID = new Map(HOME_UNITS.map((unit) => [unit.id, unit]));

const POSITIVE_TITLE_CODES = new Set(["mvp", "support", "precision", "god", "heaven", "exhausted", "pillar"]);
const DIRECT_SKILL_REWARDS = Object.freeze({
  "jiang-zha": Object.freeze([2, 3, 4, 5, 6]),
  "deng-huang": Object.freeze([1, 2, 3, 4, 5]),
  "maeda-atsuko": Object.freeze([2, 3, 4, 5, 6])
});

function normalizedStars(value) {
  return Math.max(1, Math.min(5, Math.trunc(Number(value) || 1)));
}

export function publicHomeUnit(unitId) {
  const unit = HOME_UNIT_BY_ID.get(String(unitId || ""));
  return unit ? { ...unit } : null;
}

export function unitProductionRate(unitId, stars = 1) {
  const unit = HOME_UNIT_BY_ID.get(String(unitId || ""));
  if (!unit) return 0;
  const rates = unit.type === "hero" ? HERO_HOME_RULES.heroProduction : HERO_HOME_RULES.minionProduction;
  return rates[normalizedStars(stars) - 1];
}

export function previewHomeRegion(region = {}, at = new Date()) {
  const unit = HOME_UNIT_BY_ID.get(String(region.unitId || region.unit_id || "")) || null;
  const stars = normalizedStars(region.stars);
  const storedValue = Math.max(0, Number(region.productionValue ?? region.production_value) || 0);
  const storedSeconds = Math.max(0, Number(region.productionSeconds ?? region.production_seconds) || 0);
  const settledAt = new Date(region.settledAt || region.settled_at || at);
  const nowAt = new Date(at);
  const elapsedSeconds = unit && !Number.isNaN(settledAt.getTime()) && !Number.isNaN(nowAt.getTime())
    ? Math.max(0, Math.floor((nowAt.getTime() - settledAt.getTime()) / 1000))
    : 0;
  const maxSeconds = HERO_HOME_RULES.maxProductionHours * 3600;
  const newlyProducedSeconds = unit ? Math.min(elapsedSeconds, Math.max(0, maxSeconds - storedSeconds)) : 0;
  const productionSeconds = Math.min(maxSeconds, storedSeconds + newlyProducedSeconds);
  const productionValue = storedValue + newlyProducedSeconds / 3600 * unitProductionRate(unit?.id, stars);
  const collectableDiamonds = Math.max(0, Math.floor(productionValue + 1e-9));
  return {
    regionId: String(region.regionId || region.region_id || ""),
    unitId: unit?.id || null,
    unit: unit ? publicHomeUnit(unit.id) : null,
    stars: unit ? stars : null,
    ratePerHour: unit ? unitProductionRate(unit.id, stars) : 0,
    productionSeconds,
    productionHours: productionSeconds / 3600,
    productionValue,
    collectableDiamonds,
    fractionalValue: productionValue - collectableDiamonds,
    isFull: Boolean(unit && productionSeconds >= maxSeconds),
    settledAt: Number.isNaN(nowAt.getTime()) ? new Date().toISOString() : nowAt.toISOString()
  };
}

export function starUpgradeCost(unitId, currentStars) {
  const unit = HOME_UNIT_BY_ID.get(String(unitId || ""));
  const nextStars = normalizedStars(currentStars) + 1;
  if (!unit || nextStars > 5) return null;
  return unit.type === "hero"
    ? HERO_HOME_RULES.heroStarCosts[nextStars]
    : HERO_HOME_RULES.minionStarCosts[nextStars];
}

export function freeHeroPullState(lastUsedAt, at = new Date()) {
  const usedAt = lastUsedAt ? new Date(lastUsedAt) : null;
  const nowAt = new Date(at);
  if (!usedAt || Number.isNaN(usedAt.getTime()) || Number.isNaN(nowAt.getTime())) {
    return { available: true, nextFreePullAt: null };
  }
  const nextAt = new Date(usedAt.getTime() + HERO_HOME_RULES.freePullIntervalHours * 3600 * 1000);
  if (nowAt.getTime() >= nextAt.getTime()) return { available: true, nextFreePullAt: null };
  return { available: false, nextFreePullAt: nextAt.toISOString() };
}

export function heroGachaCharge(pullCount, freePullAvailable = false) {
  if (Number(pullCount) === 1) {
    return freePullAvailable
      ? { price: 0, freePullUsed: true }
      : { price: HERO_HOME_RULES.singlePullPrice, freePullUsed: false };
  }
  if (Number(pullCount) === 10) {
    return { price: HERO_HOME_RULES.tenPullPrice, freePullUsed: false };
  }
  return null;
}

export function createBattleHeroSnapshot(unitId, stars = 1) {
  const unit = HOME_UNIT_BY_ID.get(String(unitId || ""));
  if (!unit || unit.type !== "hero") return null;
  return {
    heroId: unit.id,
    name: unit.name,
    shortName: unit.shortName,
    color: unit.color,
    cardImage: unit.cardImage,
    skillName: unit.skillName,
    stars: normalizedStars(stars),
    skillVersion: HERO_HOME_RULES.skillVersion
  };
}

function cardHasPoints(card) {
  return card?.type === "normal" && (card.rank === "5" || card.rank === "10" || card.rank === "K");
}

function baseSkillResult(snapshot, matched, cap, amount, detail) {
  return {
    rulesVersion: HERO_HOME_RULES.skillVersion,
    hero: snapshot,
    skillName: snapshot.skillName,
    matched: Boolean(matched),
    matchedCount: Math.max(0, Number(matched) || 0),
    cap: Math.max(0, Number(cap) || 0),
    amount: Math.max(0, Number(amount) || 0),
    detail: String(detail || "")
  };
}

export function calculateHeroSkillReward({ snapshot, playerId, playerResult, trickHistory = [] } = {}) {
  if (!snapshot?.heroId || !playerId || !playerResult) return null;
  const stars = normalizedStars(snapshot.stars);
  const history = Array.isArray(trickHistory) ? trickHistory : [];

  if (snapshot.heroId === "xiaoxu") {
    const sources = new Set();
    history.filter((trick) => trick?.winnerId === playerId).forEach((trick) => {
      (trick.plays || []).forEach((play) => {
        if (play?.playerId !== playerId && (play.cards || []).some(cardHasPoints)) sources.add(play.playerId);
      });
    });
    const amount = Math.min(sources.size, stars);
    return baseSkillResult(snapshot, sources.size, stars, amount, `从${sources.size}名其他玩家的计分牌中赢得过牌分，按${stars}星最多计${stars}人`);
  }

  if (snapshot.heroId === "gelu") {
    const wonPoints = history
      .filter((trick) => trick?.winnerId === playerId)
      .reduce((sum, trick) => sum + (Number(trick.points) || 0), 0);
    const matched = Math.floor(wonPoints / 50);
    const amount = Math.min(matched, stars);
    return baseSkillResult(snapshot, matched, stars, amount, `个人赢墩牌分${wonPoints}分，每满50分计1次，按${stars}星最多${stars}次`);
  }

  if (snapshot.heroId === "jiang-zha") {
    const matched = playerResult.role === "狗腿" && Number(playerResult.baseGameScore ?? playerResult.gameScore) > 0;
    const amount = matched ? DIRECT_SKILL_REWARDS[snapshot.heroId][stars - 1] : 0;
    return baseSkillResult(snapshot, matched ? 1 : 0, 1, amount, matched ? "最终身份为狗腿且原始最终积分为正" : "未同时满足狗腿身份与原始正积分");
  }

  if (snapshot.heroId === "deng-huang") {
    const matched = history.at(-1)?.winnerId === playerId;
    const amount = matched ? DIRECT_SKILL_REWARDS[snapshot.heroId][stars - 1] : 0;
    return baseSkillResult(snapshot, matched ? 1 : 0, 1, amount, matched ? "本人赢得最后一轮" : "本人未赢得最后一轮");
  }

  if (snapshot.heroId === "maeda-atsuko") {
    const matched = playerResult.role === "庄家" && Number(playerResult.baseGameScore ?? playerResult.gameScore) > 0;
    const amount = matched ? DIRECT_SKILL_REWARDS[snapshot.heroId][stars - 1] : 0;
    return baseSkillResult(snapshot, matched ? 1 : 0, 1, amount, matched ? "本人是庄家且原始最终积分为正" : "未同时满足庄家身份与原始正积分");
  }

  if (snapshot.heroId === "watanabe-mayu") {
    const codes = new Set((playerResult.evaluationTags || [])
      .map((tag) => String(tag?.code || ""))
      .filter((code) => POSITIVE_TITLE_CODES.has(code)));
    const amount = Math.min(codes.size, stars);
    return baseSkillResult(snapshot, codes.size, stars, amount, `获得${codes.size}个白名单正向称号，按${stars}星最多计${stars}个`);
  }

  return null;
}

function randomIndex(length, randomFloat) {
  return Math.max(0, Math.min(length - 1, Math.floor(randomFloat() * length)));
}

export function drawHomeUnit({ forceHero = false, preferredUnownedHeroIds = [], randomFloat = Math.random } = {}) {
  const hero = forceHero || randomFloat() < HERO_HOME_RULES.heroChance;
  if (hero) {
    const preferred = HERO_UNITS.filter((unit) => preferredUnownedHeroIds.includes(unit.id));
    const pool = preferred.length ? preferred : HERO_UNITS;
    return pool[randomIndex(pool.length, randomFloat)];
  }
  return MINION_UNITS[randomIndex(MINION_UNITS.length, randomFloat)];
}

export function publicHeroCatalog() {
  return {
    rules: HERO_HOME_RULES,
    regions: HOME_REGIONS.map((region) => ({ ...region })),
    units: HOME_UNITS.map((unit) => ({ ...unit }))
  };
}
