export const HERO_HOME_RULES = Object.freeze({
  version: "2026-08-27-v1",
  skillVersion: "2026-08-24-skill-v6",
  boardSkillVersion: "2026-08-26-board-skill-v3",
  maxProductionHours: 6,
  singlePullPrice: 300,
  tenPullPrice: 2700,
  freePullRefreshHourBeijing: 6,
  minionChance: 0.5,
  srChance: 0.09,
  ssrChance: 0.01,
  materialChance: 0.4,
  heroChance: 0.1,
  pityPulls: 50,
  ssrPityPulls: 200,
  buildingMaterialDrop: 50,
  heroDuplicateFragments: 40,
  ssrDuplicateFragments: 40,
  minionDuplicateFragments: 10,
  maxHeroDuplicateUniversalFragments: 20,
  maxSsrDuplicateUniversalFragments: 200,
  maxMinionDuplicateUniversalFragments: 1,
  ssrUniversalFragmentRatio: 10,
  ssrLeftoverUniversalPerFragment: 5,
  heroStarCosts: Object.freeze({ 2: 40, 3: 80, 4: 120, 5: 200 }),
  minionStarCosts: Object.freeze({ 2: 10, 3: 20, 4: 30, 5: 40 }),
  heroProduction: Object.freeze([16, 22, 28, 34, 40]),
  srProduction: Object.freeze([16, 22, 28, 34, 40]),
  ssrProduction: Object.freeze([24, 33, 42, 51, 60]),
  minionProduction: Object.freeze([8, 10, 12, 14, 16]),
  maxRegionLevel: 100,
  productionBonusPerLevel: 0.005,
  maxHoursPerTenLevels: 0.5,
  extraSlotUnlockLevel: 100,
  maxSkillHeat: 3,
  paidSkillBaseCosts: Object.freeze([0, 0, 0, 0, 0]),
  paidSkillHeatCosts: Object.freeze([1500, 1500, 1200, 1200, 1000]),
  paidSkillCooling: Object.freeze([0.2, 0.3, 0.3, 0.4, 0.5]),
  shenBiesanCandidateCounts: Object.freeze([1, 1, 2, 2, 2]),
  shenBiesanRequiredPairedCounts: Object.freeze([0, 1, 1, 2, 2]),
  shenJiangwenHeatCosts: Object.freeze([500, 400, 400, 300, 200]),
  shenJiangwenCooling: Object.freeze([1, 1, 2, 2, 3]),
  shenJiangwenHeatPerUse: 3,
  yokoyamaSkillCost: 100
});

const REGION_UPGRADE_COSTS = Object.freeze([60, 70, 80, 100, 130, 160, 190, 230, 280, 350]);

export const HOME_REGIONS = Object.freeze([
  Object.freeze({ id: "boka", name: "博卡区", icon: "🏇" }),
  Object.freeze({ id: "brick", name: "搬砖区", icon: "🧱" }),
  Object.freeze({ id: "stage", name: "公演区", icon: "🎤" })
]);

export const HOME_UNITS = Object.freeze([
  Object.freeze({
    id: "jiang-zha", name: "蒋渣", shortName: "渣", type: "hero", rarity: "sr", gender: "male", regionId: "boka", color: "#285b93",
    cardImage: "/assets/heroes/jiang-zha-card-v2.png",
    skillName: "渣代思维", skillDescription: "最终身份为狗腿且原始最终积分为正时触发；1～5星分别额外获得150/185/220/255/290钻石。"
  }),
  Object.freeze({
    id: "deng-huang", name: "灯皇", shortName: "灯", type: "hero", rarity: "sr", gender: "male", regionId: "boka", color: "#16858a",
    cardImage: "/assets/heroes/deng-huang-card-v2.png",
    skillName: "倒买倒卖", skillDescription: "本人赢得最后一轮时触发；1～5星分别额外获得120/150/180/210/240钻石。"
  }),
  Object.freeze({
    id: "shen-biesan", name: "神 · 瘪三", namePrefix: "神", baseName: "瘪三", shortName: "瘪", type: "hero", rarity: "ssr", gender: "male", regionId: "boka", color: "#9f742c",
    cardImage: "/assets/heroes/shen-biesan-card-v2.png",
    skillName: "玉面雷神", skillDescription: "叫庄前按星级随机生成替代2的持有牌候选：1星1张、2星1张成对牌、3星2张且至少1张成对、4星2张成对牌；5星沿用4星候选并取消2成对限制。"
  }),
  Object.freeze({ id: "boka-youth", name: "博卡青年", shortName: "博", type: "minion", rarity: "minion", gender: null, regionId: "boka", color: "#d6a936" }),
  Object.freeze({
    id: "xiaoxu", name: "小旭", shortName: "旭", type: "hero", rarity: "sr", gender: "male", regionId: "brick", color: "#c45e51",
    cardImage: "/assets/heroes/xiaoxu-card-v2.png",
    skillName: "八方来财", skillDescription: "每从1名不同其他玩家打出的计分牌中赢得过牌分，1～5星分别额外获得7/9/11/12/14钻石，不另设上限。"
  }),
  Object.freeze({
    id: "gelu", name: "格鲁", shortName: "格", type: "hero", rarity: "sr", gender: "male", regionId: "brick", color: "#7958a5",
    cardImage: "/assets/heroes/gelu-card-v2.png",
    skillName: "多劳多得", skillDescription: "1～5星时，个人赢墩牌分每满100/90/80/70/60分额外获得32钻石，触发次数和单局奖励均无上限；不计底牌与团队加分。"
  }),
  Object.freeze({
    id: "shen-jiangwen", name: "神 · 姜文", namePrefix: "神", baseName: "姜文", shortName: "姜", type: "hero", rarity: "ssr", gender: "male", regionId: "brick", color: "#4f5e52",
    cardImage: "/assets/heroes/shen-jiangwen-card-v2.png",
    skillName: "排骨之王", skillDescription: "首次轮到本人炒底时可以直接拿底并贴底，不提高炒底门槛；按当前热度消耗钻石。"
  }),
  Object.freeze({ id: "brick-worker", name: "搬砖工", shortName: "砖", type: "minion", rarity: "minion", gender: null, regionId: "brick", color: "#a67445" }),
  Object.freeze({
    id: "maeda-atsuko", name: "前田敦子", shortName: "敦", type: "hero", rarity: "sr", gender: "female", regionId: "stage", color: "#d25d86",
    cardImage: "/assets/heroes/maeda-atsuko-card-v2.png",
    skillName: "中心光芒", skillDescription: "本人是庄家且原始最终积分为正时触发；1～5星分别额外获得185/230/280/325/370钻石。"
  }),
  Object.freeze({
    id: "watanabe-mayu", name: "渡边麻友", shortName: "麻", type: "hero", rarity: "sr", gender: "female", regionId: "stage", color: "#d879b4",
    cardImage: "/assets/heroes/watanabe-mayu-card-v2.png",
    skillName: "荣誉舞台", skillDescription: "每获得1个正向称号（MVP、辅、精、神、天之上、尽、擎），1～5星分别额外获得55/70/85/100/115钻石，不设总上限。"
  }),
  Object.freeze({
    id: "yokoyama-yui", name: "横山由依", shortName: "横", type: "hero", rarity: "ssr", gender: "female", regionId: "stage", color: "#bd4d83",
    cardImage: "/assets/heroes/yokoyama-yui-card-v2.png",
    skillName: "全能偶像", skillDescription: "叫庄结束后随机展示最多1/2/3/4/5名其他玩家，可选择其中一人交换座位；每次消耗100钻石。"
  }),
  Object.freeze({ id: "trainee", name: "练习生", shortName: "练", type: "minion", rarity: "minion", gender: null, regionId: "stage", color: "#7197bd" })
]);

export const HERO_UNITS = Object.freeze(HOME_UNITS.filter((unit) => unit.type === "hero"));
export const SR_HERO_UNITS = Object.freeze(HERO_UNITS.filter((unit) => unit.rarity === "sr"));
export const SSR_HERO_UNITS = Object.freeze(HERO_UNITS.filter((unit) => unit.rarity === "ssr"));
export const MINION_UNITS = Object.freeze(HOME_UNITS.filter((unit) => unit.type === "minion"));
export const HOME_REGION_BY_ID = new Map(HOME_REGIONS.map((region) => [region.id, region]));
export const HOME_UNIT_BY_ID = new Map(HOME_UNITS.map((unit) => [unit.id, unit]));

export const HERO_TASK_TIERS = Object.freeze([
  Object.freeze({ color: "white", weight: 40, heroCount: 1, durationSeconds: 3600, rewardMaterials: 20 }),
  Object.freeze({ color: "green", weight: 30, heroCount: 2, durationSeconds: 7200, rewardMaterials: 40 }),
  Object.freeze({ color: "blue", weight: 18, heroCount: 3, durationSeconds: 14400, rewardMaterials: 80 }),
  Object.freeze({ color: "purple", weight: 9, heroCount: 4, durationSeconds: 28800, rewardMaterials: 160 }),
  Object.freeze({ color: "orange", weight: 3, heroCount: 5, durationSeconds: 43200, rewardMaterials: 320 })
]);

const POSITIVE_TITLE_CODES = new Set(["mvp", "support", "precision", "god", "heaven", "exhausted", "pillar"]);
const DIRECT_SKILL_REWARDS = Object.freeze({
  "jiang-zha": Object.freeze([150, 185, 220, 255, 290]),
  "deng-huang": Object.freeze([120, 150, 180, 210, 240]),
  "maeda-atsuko": Object.freeze([185, 230, 280, 325, 370])
});
const XIAOXU_DIAMONDS_PER_SOURCE = Object.freeze([7, 9, 11, 12, 14]);
const GELU_POINTS_PER_TRIGGER = Object.freeze([100, 90, 80, 70, 60]);
const GELU_DIAMONDS_PER_TRIGGER = 32;
const WATANABE_DIAMONDS_PER_TITLE = Object.freeze([55, 70, 85, 100, 115]);
const DAY_MS = 24 * 3600 * 1000;
const BEIJING_OFFSET_MS = 8 * 3600 * 1000;

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
  const rates = unit.rarity === "ssr"
    ? HERO_HOME_RULES.ssrProduction
    : unit.type === "hero"
      ? HERO_HOME_RULES.srProduction
      : HERO_HOME_RULES.minionProduction;
  return rates[normalizedStars(stars) - 1];
}

export function normalizedRegionLevel(value) {
  return Math.max(0, Math.min(HERO_HOME_RULES.maxRegionLevel, Math.trunc(Number(value) || 0)));
}

export function homeRegionMaxHours(level = 0) {
  const normalizedLevel = normalizedRegionLevel(level);
  return HERO_HOME_RULES.maxProductionHours
    + Math.floor(normalizedLevel / 10) * HERO_HOME_RULES.maxHoursPerTenLevels;
}

export function regionUpgradeCost(currentLevel = 0) {
  const normalizedLevel = normalizedRegionLevel(currentLevel);
  if (normalizedLevel >= HERO_HOME_RULES.maxRegionLevel) return null;
  return REGION_UPGRADE_COSTS[Math.floor(normalizedLevel / 10)];
}

export function missingDailyHeroTaskSlots(existingTasks = []) {
  const occupiedSlots = new Set((existingTasks || []).map((task) => Number(task.slot_index ?? task.slotIndex)));
  return [1, 2, 3].filter((slotIndex) => !occupiedSlots.has(slotIndex));
}

export function paidBoardSkillState(stars = 1, heatValue = 0, unitId = "shen-biesan") {
  const normalizedStarValue = normalizedStars(stars);
  const heat = Math.max(0, Math.min(HERO_HOME_RULES.maxSkillHeat, Math.round((Number(heatValue) || 0) * 10) / 10));
  const baseCost = HERO_HOME_RULES.paidSkillBaseCosts[normalizedStarValue - 1];
  const isShenJiangwen = unitId === "shen-jiangwen";
  const heatCost = (isShenJiangwen ? HERO_HOME_RULES.shenJiangwenHeatCosts : HERO_HOME_RULES.paidSkillHeatCosts)[normalizedStarValue - 1];
  return {
    stars: normalizedStarValue,
    heat,
    maxHeat: HERO_HOME_RULES.maxSkillHeat,
    baseCost,
    heatCost,
    cost: Math.round(baseCost + heat * heatCost),
    coolingPerUnusedGame: (isShenJiangwen ? HERO_HOME_RULES.shenJiangwenCooling : HERO_HOME_RULES.paidSkillCooling)[normalizedStarValue - 1],
    heatPerUse: isShenJiangwen ? HERO_HOME_RULES.shenJiangwenHeatPerUse : 1
  };
}

export function previewHomeRegion(region = {}, at = new Date()) {
  const unit = HOME_UNIT_BY_ID.get(String(region.unitId || region.unit_id || "")) || null;
  const stars = normalizedStars(region.stars);
  const storedValue = Math.max(0, Number(region.productionValue ?? region.production_value) || 0);
  const storedSeconds = Math.max(0, Number(region.productionSeconds ?? region.production_seconds) || 0);
  const level = normalizedRegionLevel(region.level ?? region.region_level);
  const settledAt = new Date(region.settledAt || region.settled_at || at);
  const nowAt = new Date(at);
  const elapsedSeconds = unit && !Number.isNaN(settledAt.getTime()) && !Number.isNaN(nowAt.getTime())
    ? Math.max(0, Math.floor((nowAt.getTime() - settledAt.getTime()) / 1000))
    : 0;
  const maxHours = homeRegionMaxHours(level);
  const maxSeconds = maxHours * 3600;
  const newlyProducedSeconds = unit ? Math.min(elapsedSeconds, Math.max(0, maxSeconds - storedSeconds)) : 0;
  const productionSeconds = Math.min(maxSeconds, storedSeconds + newlyProducedSeconds);
  const baseRatePerHour = unit ? unitProductionRate(unit.id, stars) : 0;
  const productionMultiplier = 1 + level * HERO_HOME_RULES.productionBonusPerLevel;
  const ratePerHour = baseRatePerHour * productionMultiplier;
  const productionValue = storedValue + newlyProducedSeconds / 3600 * ratePerHour;
  const collectableDiamonds = Math.max(0, Math.floor(productionValue + 1e-9));
  return {
    regionId: String(region.regionId || region.region_id || ""),
    unitId: unit?.id || null,
    unit: unit ? publicHomeUnit(unit.id) : null,
    stars: unit ? stars : null,
    level,
    upgradeCost: regionUpgradeCost(level),
    productionMultiplier,
    baseRatePerHour,
    ratePerHour,
    maxProductionHours: maxHours,
    extraSlotUnlocked: level >= HERO_HOME_RULES.extraSlotUnlockLevel,
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
  const nowAt = new Date(at);
  if (Number.isNaN(nowAt.getTime())) return { available: true, nextFreePullAt: null };

  const beijingNow = new Date(nowAt.getTime() + BEIJING_OFFSET_MS);
  const todayRefreshAt = Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate(),
    HERO_HOME_RULES.freePullRefreshHourBeijing
  ) - BEIJING_OFFSET_MS;
  const currentRefreshAt = nowAt.getTime() >= todayRefreshAt ? todayRefreshAt : todayRefreshAt - DAY_MS;
  const nextRefreshAt = currentRefreshAt + DAY_MS;
  const usedAt = lastUsedAt ? new Date(lastUsedAt) : null;
  const available = !usedAt || Number.isNaN(usedAt.getTime()) || usedAt.getTime() < currentRefreshAt;
  return { available, nextFreePullAt: new Date(nextRefreshAt).toISOString() };
}

export function beijingHeroRefreshKey(at = new Date()) {
  const nowAt = new Date(at);
  if (Number.isNaN(nowAt.getTime())) return null;
  const shifted = new Date(nowAt.getTime() + BEIJING_OFFSET_MS - HERO_HOME_RULES.freePullRefreshHourBeijing * 3600 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function shuffled(values, randomFloat) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, randomFloat);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createHeroTaskRequirements(ownedHeroIds = [], heroCountValue = 0, randomFloat = Math.random) {
  const heroes = [...new Set(ownedHeroIds)]
    .map((unitId) => HOME_UNIT_BY_ID.get(String(unitId)))
    .filter((unit) => unit?.type === "hero");
  const heroCount = Math.trunc(Number(heroCountValue) || 0);
  if (heroCount < 1 || heroes.length < heroCount) return null;
  const selected = shuffled(heroes, randomFloat).slice(0, heroCount);
  const regionHero = selected[randomIndex(selected.length, randomFloat)];
  const regions = { [regionHero.regionId]: 1 };
  const genders = {};
  if (heroCount >= 3) {
    const genderCount = heroCount >= 5 ? 2 : 1;
    const selectableGenders = [...new Set(selected.map((hero) => hero.gender))]
      .filter((gender) => selected.filter((hero) => hero.gender === gender).length >= genderCount);
    const gender = selectableGenders[randomIndex(selectableGenders.length, randomFloat)];
    genders[gender] = genderCount;
  }
  return { regions, genders };
}

export function createHeroTaskDefinition(ownedHeroIds = [], randomFloat = Math.random) {
  const heroes = [...new Set(ownedHeroIds)]
    .map((unitId) => HOME_UNIT_BY_ID.get(String(unitId)))
    .filter((unit) => unit?.type === "hero");
  if (!heroes.length) return null;
  const tiers = HERO_TASK_TIERS.filter((tier) => tier.heroCount <= heroes.length);
  const totalWeight = tiers.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = randomFloat() * totalWeight;
  const tier = tiers.find((candidate) => {
    roll -= candidate.weight;
    return roll < 0;
  }) || tiers.at(-1);
  return {
    ...tier,
    requirements: createHeroTaskRequirements(heroes.map((hero) => hero.id), tier.heroCount, randomFloat)
  };
}

function taskRequirementSatisfied(requirements, heroes) {
  const regionCounts = {};
  const genderCounts = {};
  heroes.forEach((hero) => {
    regionCounts[hero.regionId] = (regionCounts[hero.regionId] || 0) + 1;
    genderCounts[hero.gender] = (genderCounts[hero.gender] || 0) + 1;
  });
  return Object.entries(requirements?.regions || {}).every(([key, count]) => regionCounts[key] >= Number(count))
    && Object.entries(requirements?.genders || {}).every(([key, count]) => genderCounts[key] >= Number(count));
}

function taskRequirementExcess(requirements, heroes) {
  const entries = [
    ...Object.entries(requirements?.regions || {}).map(([key, count]) => ["regionId", key, Number(count)]),
    ...Object.entries(requirements?.genders || {}).map(([key, count]) => ["gender", key, Number(count)])
  ];
  return entries.reduce((sum, [field, key, count]) => {
    const actual = heroes.filter((hero) => hero[field] === key).length;
    return sum + Math.max(0, actual - count);
  }, 0);
}

export function selectHeroTaskUnits(ownedHeroIds = [], occupiedHeroIds = [], heroCountValue = 0, requirements = {}) {
  const occupied = new Set((occupiedHeroIds || []).map(String));
  const heroes = [...new Set((ownedHeroIds || []).map(String))]
    .filter((unitId) => !occupied.has(unitId))
    .map((unitId) => HOME_UNIT_BY_ID.get(unitId))
    .filter((unit) => unit?.type === "hero");
  const heroCount = Math.trunc(Number(heroCountValue) || 0);
  if (heroCount < 1 || heroes.length < heroCount) return null;

  let best = null;
  let bestExcess = Infinity;
  const selected = [];
  function visit(startIndex) {
    if (selected.length === heroCount) {
      if (!taskRequirementSatisfied(requirements, selected)) return;
      const excess = taskRequirementExcess(requirements, selected);
      if (excess < bestExcess) {
        best = selected.map((hero) => hero.id);
        bestExcess = excess;
      }
      return;
    }
    const remaining = heroCount - selected.length;
    for (let index = startIndex; index <= heroes.length - remaining; index += 1) {
      selected.push(heroes[index]);
      visit(index + 1);
      selected.pop();
    }
  }
  visit(0);
  return best;
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

export function createBattleHeroSnapshot(unitId, stars = 1, heatValue = 0) {
  const unit = HOME_UNIT_BY_ID.get(String(unitId || ""));
  if (!unit || unit.type !== "hero") return null;
  const snapshot = {
    heroId: unit.id,
    name: unit.name,
    namePrefix: unit.namePrefix || null,
    baseName: unit.baseName || unit.name,
    shortName: unit.shortName,
    rarity: unit.rarity,
    gender: unit.gender,
    color: unit.color,
    cardImage: unit.cardImage || null,
    skillName: unit.skillName,
    skillDescription: unit.skillDescription,
    stars: normalizedStars(stars),
    skillVersion: unit.rarity === "ssr" ? HERO_HOME_RULES.boardSkillVersion : HERO_HOME_RULES.skillVersion
  };
  if (unit.id === "shen-biesan" || unit.id === "shen-jiangwen") snapshot.paidSkill = paidBoardSkillState(stars, heatValue, unit.id);
  if (unit.id === "yokoyama-yui") snapshot.paidSkill = { cost: HERO_HOME_RULES.yokoyamaSkillCost, heat: null, maxHeat: null };
  return snapshot;
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
    cap: cap == null ? null : Math.max(0, Number(cap) || 0),
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
    const diamondsPerSource = XIAOXU_DIAMONDS_PER_SOURCE[stars - 1];
    const amount = sources.size * diamondsPerSource;
    return baseSkillResult(snapshot, sources.size, null, amount, `从${sources.size}名其他玩家的计分牌中赢得过牌分，每名奖励${diamondsPerSource}钻，不另设上限`);
  }

  if (snapshot.heroId === "gelu") {
    const wonPoints = history
      .filter((trick) => trick?.winnerId === playerId)
      .reduce((sum, trick) => sum + (Number(trick.points) || 0), 0);
    const pointsPerTrigger = GELU_POINTS_PER_TRIGGER[stars - 1];
    const matched = Math.floor(wonPoints / pointsPerTrigger);
    const amount = matched * GELU_DIAMONDS_PER_TRIGGER;
    return baseSkillResult(snapshot, matched, null, amount, `个人赢墩牌分${wonPoints}分，每满${pointsPerTrigger}分奖励${GELU_DIAMONDS_PER_TRIGGER}钻，共触发${matched}次，无次数和奖励上限`);
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
    const diamondsPerTitle = WATANABE_DIAMONDS_PER_TITLE[stars - 1];
    const amount = codes.size * diamondsPerTitle;
    return baseSkillResult(snapshot, codes.size, null, amount, `获得${codes.size}个白名单正向称号，每个奖励${diamondsPerTitle}钻，不设总上限`);
  }

  return null;
}

function randomIndex(length, randomFloat) {
  return Math.max(0, Math.min(length - 1, Math.floor(randomFloat() * length)));
}

export function drawHomeUnit({
  forceHero = false,
  forceRarity = null,
  preferredUnownedHeroIds = [],
  randomFloat = Math.random
} = {}) {
  let rarity = forceRarity;
  if (!rarity && forceHero) rarity = "sr";
  if (!rarity) {
    const roll = randomFloat();
    rarity = roll < HERO_HOME_RULES.ssrChance
      ? "ssr"
      : roll < HERO_HOME_RULES.ssrChance + HERO_HOME_RULES.srChance
        ? "sr"
        : "minion";
  }
  if (rarity === "ssr") return SSR_HERO_UNITS[randomIndex(SSR_HERO_UNITS.length, randomFloat)];
  if (rarity === "sr") {
    const preferred = SR_HERO_UNITS.filter((unit) => preferredUnownedHeroIds.includes(unit.id));
    const pool = preferred.length ? preferred : SR_HERO_UNITS;
    return pool[randomIndex(pool.length, randomFloat)];
  }
  return MINION_UNITS[randomIndex(MINION_UNITS.length, randomFloat)];
}

export function drawHeroGachaResult({
  forceHero = false,
  forceRarity = null,
  preferredUnownedHeroIds = [],
  randomFloat = Math.random
} = {}) {
  if (forceHero || forceRarity) {
    return {
      type: "unit",
      unit: drawHomeUnit({ forceHero, forceRarity, preferredUnownedHeroIds, randomFloat })
    };
  }
  const roll = randomFloat();
  if (roll < HERO_HOME_RULES.ssrChance) {
    return { type: "unit", unit: drawHomeUnit({ forceRarity: "ssr", randomFloat }) };
  }
  if (roll < HERO_HOME_RULES.ssrChance + HERO_HOME_RULES.srChance) {
    return { type: "unit", unit: drawHomeUnit({ forceRarity: "sr", preferredUnownedHeroIds, randomFloat }) };
  }
  if (roll < HERO_HOME_RULES.ssrChance + HERO_HOME_RULES.srChance + HERO_HOME_RULES.materialChance) {
    return { type: "materials", amount: HERO_HOME_RULES.buildingMaterialDrop };
  }
  return { type: "unit", unit: drawHomeUnit({ forceRarity: "minion", randomFloat }) };
}

export function publicHeroCatalog() {
  return {
    rules: HERO_HOME_RULES,
    regions: HOME_REGIONS.map((region) => ({ ...region })),
    units: HOME_UNITS.map((unit) => ({ ...unit }))
  };
}
