export const HERO_HOME_RULES = Object.freeze({
  version: "2026-10-29-v12",
  skillVersion: "2026-09-24-skill-v9",
  boardSkillVersion: "2026-10-29-board-skill-v12",
  shenJiangwenScorePerLoss: Object.freeze([0.1, 0.12, 0.15, 0.2, 0.25]),
  shenJiangwenDiamondsPerLoss: Object.freeze([10, 12, 15, 20, 25]),
  shenJiangwenLossCap: 5,
  advancedScoreBonus: Object.freeze([1, 1.2, 1.5, 2, 3]),
  denghuangExchangeCount: Object.freeze([1, 1, 1, 1, 2]),
  judgmentVersion: "2026-10-28-judgment-v2",
  shenYingwuEntryFee: 200,
  shenYingwuReductionRates: Object.freeze([0.2, 0.3, 0.4, 0.5, 0.6]),
  shenYingwuSuccessDiamonds: Object.freeze([100, 120, 140, 160, 200]),
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
  heroProduction: Object.freeze([16, 22, 28, 34, 46]),
  srProduction: Object.freeze([16, 22, 28, 34, 46]),
  ssrProduction: Object.freeze([30, 40, 50, 60, 80]),
  minionProduction: Object.freeze([8, 10, 12, 14, 16]),
  maxRegionLevel: 100,
  productionBonusPerLevel: 0.005,
  maxHoursPerTenLevels: 0.5,
  extraSlotUnlockLevel: 100,
  extraSlotProductionEfficiency: 0.5,
  boardSkillCooldowns: Object.freeze([0, 0, 0, 0, 0]),
  boardSkillResetCostPerRound: 0,
  yokoyamaUsesPerGame: Object.freeze([1, 1, 2, 2, 3]),
  shenBenleiScoreBonus: Object.freeze([0.1, 0.2, 0.3, 0.4, 0.5]),
  shenBenleiDiamonds: Object.freeze([20, 40, 60, 80, 100]),
  shenHaohaoFiveScoreReductionCap: Object.freeze([2, 4, 6, 8, 10]),
  shenHaohaoUndraggedTeammateDiamonds: Object.freeze([10, 15, 20, 25, 40]),
  jieDoudouDiamondsPerMatchingCard: Object.freeze([10, 15, 20, 25, 35]),
  jieDoudouBottomScoreBonus: Object.freeze([1, 1.5, 2, 2.5, 3.5]),
  jieDoudouJiangwenUseDiamonds: 30,
  jieRanchenInvestmentOptions: Object.freeze([100, 200, 300]),
  jieRanchenWinMultipliers: Object.freeze([2.1, 2.3, 2.6, 3, 3.5])
});

const REGION_UPGRADE_COSTS = Object.freeze([60, 70, 80, 100, 130, 160, 190, 230, 280, 350]);
const CARD_RANK_TO_NUMBER = Object.freeze({ A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 });

export function cardRankNumber(card) {
  return CARD_RANK_TO_NUMBER[String(card?.rank || "").toUpperCase()] || null;
}

export const HOME_REGIONS = Object.freeze([
  Object.freeze({ id: "boka", name: "博卡区", icon: "🏇" }),
  Object.freeze({ id: "brick", name: "搬砖区", icon: "🧱" }),
  Object.freeze({ id: "stage", name: "公演区", icon: "🎤" })
]);

export const HOME_UNITS = Object.freeze([
  Object.freeze({
    id: "jiang-zha", name: "蒋渣", shortName: "渣", type: "hero", rarity: "sr", gender: "male", regionId: "boka", color: "#285b93",
    cardImage: "/assets/heroes/jiang-zha-card-v2.png",
    skillName: "渣代思维", skillDescription: "结算时，若最终身份为狗腿且原始积分大于0，按1～5星额外获得150/185/220/255/290钻石。"
  }),
  Object.freeze({
    id: "deng-huang", name: "灯皇", shortName: "灯", type: "hero", rarity: "sr", gender: "male", regionId: "boka", color: "#16858a",
    cardImage: "/assets/heroes/deng-huang-card-v2.png",
    skillName: "倒买倒卖", skillDescription: "本人赢得最后一轮时，按1～5星额外获得120/150/180/210/240钻石；不要求本局获胜。"
  }),
  Object.freeze({
    id: "jie-jiangzha", name: "界 · 蒋渣", namePrefix: "界", baseName: "蒋渣", shortName: "渣", type: "hero", rarity: "ssr", gender: "male", regionId: "boka", color: "#285b93", advancementFrom: "jiang-zha",
    cardImage: "/assets/heroes/jie-jiangzha-card-v3.png",
    skillName: "择木而栖", skillDescription: "主动：传统狗腿模式确定公共狗腿牌后，若本人不是庄家且未锁定身份，可选择手中一张非比牌，替换仅对本人生效的狗腿牌；每局一次，不保证获得狗腿名额。被动：以狗腿身份且原始积分大于0结束本局时，按1～5星额外获得150/185/220/255/290钻石；若本人还赢得过至少一轮，再额外获得1/1.2/1.5/2/3积分。"
  }),
  Object.freeze({
    id: "jie-denghuang", name: "界 · 灯皇", namePrefix: "界", baseName: "灯皇", shortName: "灯", type: "hero", rarity: "ssr", gender: "male", regionId: "boka", color: "#16858a", advancementFrom: "deng-huang",
    cardImage: "/assets/heroes/jie-denghuang-card-v3.png",
    skillName: "探囊取物", skillDescription: "主动：炒底结束后，可随机拿取1/1/1/1/2张底牌，再选择等量手牌扣回；数量按1～5星对应，每局一次。被动：本人赢得最后一轮时，按1～5星额外获得120/150/180/210/240钻石和1/1.2/1.5/2/3积分，不要求本局获胜。"
  }),
  Object.freeze({
    id: "shen-biesan", name: "神 · 瘪三", namePrefix: "神", baseName: "瘪三", shortName: "瘪", type: "hero", rarity: "ssr", gender: "male", regionId: "boka", color: "#9f742c",
    cardImage: "/assets/heroes/shen-biesan-card-v2.png",
    skillName: "偷梁换柱", skillDescription: "主动：叫庄前，若手中没有同花色的一对2，可申请随机选取本人持有的一个合法点数，替代2成为本局全场比牌；每局一次、免费，多人申请时随机选一人生效。被动：对方阵营每被拖1点红五或方五积分，按1～5星额外获得5/7/9/12/15钻石；红五计2点、方五计1点，底牌沿用双倍规则。"
  }),
  Object.freeze({
    id: "shen-benlei", name: "神 · 奔雷", namePrefix: "神", baseName: "奔雷", shortName: "雷", type: "hero", rarity: "ssr", gender: "male", regionId: "boka", color: "#5968b0",
    cardImage: "/assets/heroes/shen-benlei-card-v1.png",
    skillName: "雷动九天", skillDescription: "牌力：当6不是本局比牌时，与主花色同色的另一花色6，仅对本人视为最小主牌，并可参与拖拉机。奖励：本人至少有一轮用含6的牌获胜时，按1～5星额外获得0.1/0.2/0.3/0.4/0.5积分和20/40/60/80/100钻石；每局只奖励一次，不要求整局获胜。"
  }),
  Object.freeze({
    id: "shen-yingwu", name: "神 · 鹦鹉", namePrefix: "神", baseName: "鹦鹉", shortName: "鹦", type: "hero", rarity: "ssr", gender: "male", regionId: "stage", color: "#16845b",
    cardImage: "/assets/heroes/shen-yingwu-card-v2.png",
    skillName: "战犯审判", skillDescription: "仅限有效PVP真人局。本队落败后，可花费200钻石审判另一名玩家，每局一次。除本人和被审判者外，其余有资格玩家投票，30秒未投视为弃权；支持票达到有资格人数的50%即成立。成立时返还200钻石，按1～5星减免本人本局扣分的20%/30%/40%/50%/60%，再获得100/120/140/160/200钻石；不成立不返还。支持或反对票数较多一方的投票者，每人另获50钻石，平票不奖励。"
  }),
  Object.freeze({ id: "boka-youth", name: "博卡青年", shortName: "博", type: "minion", rarity: "minion", gender: null, regionId: "boka", color: "#d6a936" }),
  Object.freeze({
    id: "xiaoxu", name: "小旭", shortName: "旭", type: "hero", rarity: "sr", gender: "male", regionId: "brick", color: "#c45e51",
    cardImage: "/assets/heroes/xiaoxu-card-v2.png",
    skillName: "八方来财", skillDescription: "本人赢得一轮时，统计该轮其他玩家打出的计分牌（5、10、K）。每名不同的来源玩家整局只计一次，按1～5星额外获得7/9/11/12/14钻石；不计本人和底牌。"
  }),
  Object.freeze({
    id: "gelu", name: "格鲁", shortName: "格", type: "hero", rarity: "sr", gender: "male", regionId: "brick", color: "#7958a5",
    cardImage: "/assets/heroes/gelu-card-v2.png",
    skillName: "多劳多得", skillDescription: "累计本人赢得各轮的牌分，按1～5星每满100/90/80/70/60分，额外获得32钻石；不足一次的余分不奖励，次数和奖励无上限，不计底牌与团队加分。"
  }),
  Object.freeze({
    id: "shen-gelu", name: "神 · 格鲁", namePrefix: "神", baseName: "格鲁", shortName: "格", type: "hero", rarity: "ssr", gender: "male", regionId: "brick", color: "#7958a5", advancementFrom: "gelu",
    cardImage: "/assets/heroes/gelu-card-v2.png",
    skillName: "釜底抽薪", skillDescription: "被动：本人每完成一次普通炒底或技能炒底，按1～5星额外获得15/20/25/30/40钻石，次数不限。主动：首次轮到本人炒底时，可免费直接拿底并扣回等量手牌；每局一次，不提高炒底门槛。"
  }),
  Object.freeze({
    id: "shen-jiangwen", name: "神 · 姜文", namePrefix: "神", baseName: "姜文", shortName: "姜", type: "hero", rarity: "ssr", gender: "male", regionId: "brick", color: "#4f5e52",
    cardImage: "/assets/heroes/shen-jiangwen-card-v2.png",
    skillName: "推贤让能", skillDescription: "主动：本局至少赢得过一轮后，在你领出新一轮牌之前，可将本轮首出权移交给一名其他玩家；每局一次、免费。被动：本局原始积分大于0时，每丢失一次首出权（领出一轮后未赢得该轮，或主动移交），按1～5星额外获得0.1/0.12/0.15/0.2/0.25积分和10/12/15/20/25钻石，最多计5次。庄家开局自带的首出权不满足主动发动条件。"
  }),
  Object.freeze({
    id: "shen-haohao", name: "神 · 浩浩", namePrefix: "神", baseName: "浩浩", shortName: "浩", type: "hero", rarity: "ssr", gender: "male", regionId: "boka", color: "#557b9c",
    cardImage: "/assets/heroes/shen-haohao-card-v1.png",
    skillName: "丹书铁券", skillDescription: "积分：本人拖下最终队友的红五或方五时，红五每张计2分、方五每张计1分；按1～5星整局累计最多免除2/4/6/8/10分扣分，实际不超过命中扣分，并按本局闲家每人、庄队分配规则恢复积分。钻石：最终本队每有一名玩家未被拖红五或方五（包括本人），按1～5星额外获得10/15/20/25/40钻石；积分减免不改变被拖记录。"
  }),
  Object.freeze({
    id: "jie-doudou", name: "界 · 豆豆", namePrefix: "界", baseName: "豆豆", shortName: "豆", type: "hero", rarity: "ssr", gender: "male", regionId: "brick", color: "#8b6a9f",
    cardImage: "/assets/heroes/jie-doudou-card-v2.png",
    skillName: "守株待兔", skillDescription: "发牌后随机锁定1～13点数（A=1，J=11，Q=12，K=13）。本局原始积分大于0时，发牌手牌每有一张同点数牌，按1～5星额外获得10/15/20/25/35钻石。最终底牌含该点数时，额外获得1/1.5/2/2.5/3.5积分，不要求获胜。本局每有一次神·姜文成功移交首出权，另获30钻石。"
  }),
  Object.freeze({ id: "brick-worker", name: "搬砖工", shortName: "砖", type: "minion", rarity: "minion", gender: null, regionId: "brick", color: "#a67445" }),
  Object.freeze({
    id: "maeda-atsuko", name: "前田敦子", shortName: "敦", type: "hero", rarity: "sr", gender: "female", regionId: "stage", color: "#d25d86",
    cardImage: "/assets/heroes/maeda-atsuko-card-v2.png",
    skillName: "中心光芒", skillDescription: "结算时，若最终身份为庄家且原始积分大于0，按1～5星额外获得185/230/280/325/370钻石。"
  }),
  Object.freeze({
    id: "watanabe-mayu", name: "渡边麻友", shortName: "麻", type: "hero", rarity: "sr", gender: "female", regionId: "stage", color: "#d879b4",
    cardImage: "/assets/heroes/watanabe-mayu-card-v2.png",
    skillName: "荣誉舞台", skillDescription: "本局每获得一个正向称号（MVP、辅、精、神、天之上、尽、擎），按1～5星额外获得55/70/85/100/115钻石；相同称号只计一次，奖励无上限。"
  }),
  Object.freeze({
    id: "yokoyama-yui", name: "横山由依", shortName: "横", type: "hero", rarity: "ssr", gender: "female", regionId: "stage", color: "#bd4d83",
    cardImage: "/assets/heroes/yokoyama-yui-card-v2.png",
    skillName: "斗转星移", skillDescription: "主动：叫庄结束后，可免费生成全桌随机座位候选，按1～5星每局可生成1/1/2/2/3次；确认后参与最终随机抽取，全桌只执行一名申请者的候选。被动：按最终阵营回看全局，本人打出的计分牌被其他队友赢得时计为贴分；每满40分，按1～5星额外获得15/20/25/30/40钻石。"
  }),
  Object.freeze({
    id: "jie-ranchen", name: "界 · 然陈", namePrefix: "界", baseName: "然陈", shortName: "然", type: "hero", rarity: "ssr", gender: "female", regionId: "stage", color: "#b75078",
    cardImage: "/assets/heroes/jie-ranchen-card-v2.png",
    skillName: "奇货可居", skillDescription: "主动：仅限PVP乱斗且设有狗腿的牌局，叫庄前可投资100、200或300钻石，随机公开锁定狗腿或闲家身份，并跳过本人叫庄；每局一次，身份名额已满时不可发动。结算：本局原始积分大于0时，按1～5星额外获得投资额的2.1/2.3/2.6/3/3.5倍钻石；未获胜则无投资奖励。"
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
const SHEN_GELU_DIAMONDS_PER_FRY = Object.freeze([15, 20, 25, 30, 40]);
const SHEN_BIESAN_DIAMONDS_PER_DRAG_POINT = Object.freeze([5, 7, 9, 12, 15]);
const SHEN_HAOHAO_DIAMONDS_PER_PROTECTED_ALLY = Object.freeze([5, 7, 9, 12, 15]);
const YOKOYAMA_DIAMONDS_PER_ASSIST = Object.freeze([15, 20, 25, 30, 40]);
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

export function boardHeroSkillState(stars = 1, cooldownValue = 0, unitId = "shen-biesan") {
  const normalizedStarValue = normalizedStars(stars);
  // Legacy cooldown values never block a current SSR skill.
  const cooldown = 0;
  const isYokoyama = unitId === "yokoyama-yui";
  const cooldownAfterUse = isYokoyama ? 0 : HERO_HOME_RULES.boardSkillCooldowns[normalizedStarValue - 1];
  const resetCost = cooldown * HERO_HOME_RULES.boardSkillResetCostPerRound;
  return {
    stars: normalizedStarValue,
    cooldown,
    cooldownAfterUse,
    resetCostPerRound: HERO_HOME_RULES.boardSkillResetCostPerRound,
    resetCost,
    cost: resetCost,
    maxUsesPerGame: isYokoyama ? HERO_HOME_RULES.yokoyamaUsesPerGame[normalizedStarValue - 1] : 1
  };
}

export function previewHomeRegion(region = {}, at = new Date()) {
  const unit = HOME_UNIT_BY_ID.get(String(region.unitId || region.unit_id || "")) || null;
  const extraUnit = HOME_UNIT_BY_ID.get(String(region.extraUnitId || region.extra_unit_id || "")) || null;
  const stars = normalizedStars(region.stars);
  const extraStars = normalizedStars(region.extraStars ?? region.extra_stars);
  const storedValue = Math.max(0, Number(region.productionValue ?? region.production_value) || 0);
  const storedSeconds = Math.max(0, Number(region.productionSeconds ?? region.production_seconds) || 0);
  const level = normalizedRegionLevel(region.level ?? region.region_level);
  const extraSlotUnlocked = level >= HERO_HOME_RULES.extraSlotUnlockLevel;
  const productiveExtraUnit = extraSlotUnlocked ? extraUnit : null;
  const settledAt = new Date(region.settledAt || region.settled_at || at);
  const nowAt = new Date(at);
  const hasProduction = Boolean(unit || productiveExtraUnit);
  const elapsedSeconds = hasProduction && !Number.isNaN(settledAt.getTime()) && !Number.isNaN(nowAt.getTime())
    ? Math.max(0, Math.floor((nowAt.getTime() - settledAt.getTime()) / 1000))
    : 0;
  const maxHours = homeRegionMaxHours(level);
  const maxSeconds = maxHours * 3600;
  const newlyProducedSeconds = hasProduction ? Math.min(elapsedSeconds, Math.max(0, maxSeconds - storedSeconds)) : 0;
  const productionSeconds = Math.min(maxSeconds, storedSeconds + newlyProducedSeconds);
  const primaryBaseRatePerHour = unit ? unitProductionRate(unit.id, stars) : 0;
  const extraBaseRatePerHour = productiveExtraUnit
    ? unitProductionRate(productiveExtraUnit.id, extraStars) * HERO_HOME_RULES.extraSlotProductionEfficiency
    : 0;
  const baseRatePerHour = primaryBaseRatePerHour + extraBaseRatePerHour;
  const productionMultiplier = 1 + level * HERO_HOME_RULES.productionBonusPerLevel;
  const primaryRatePerHour = primaryBaseRatePerHour * productionMultiplier;
  const extraRatePerHour = extraBaseRatePerHour * productionMultiplier;
  const ratePerHour = baseRatePerHour * productionMultiplier;
  const productionValue = storedValue + newlyProducedSeconds / 3600 * ratePerHour;
  const collectableDiamonds = Math.max(0, Math.floor(productionValue + 1e-9));
  return {
    regionId: String(region.regionId || region.region_id || ""),
    unitId: unit?.id || null,
    unit: unit ? publicHomeUnit(unit.id) : null,
    stars: unit ? stars : null,
    extraUnitId: productiveExtraUnit?.id || null,
    extraUnit: productiveExtraUnit ? publicHomeUnit(productiveExtraUnit.id) : null,
    extraStars: productiveExtraUnit ? extraStars : null,
    level,
    upgradeCost: regionUpgradeCost(level),
    productionMultiplier,
    primaryBaseRatePerHour,
    primaryRatePerHour,
    extraBaseRatePerHour,
    extraRatePerHour,
    baseRatePerHour,
    ratePerHour,
    maxProductionHours: maxHours,
    extraSlotUnlocked,
    productionSeconds,
    productionHours: productionSeconds / 3600,
    productionValue,
    collectableDiamonds,
    fractionalValue: productionValue - collectableDiamonds,
    isFull: Boolean(hasProduction && productionSeconds >= maxSeconds),
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

export function createBattleHeroSnapshot(unitId, stars = 1, cooldownValue = 0) {
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
  if (unit.rarity === "ssr" && unit.id !== "jie-doudou" && unit.id !== "shen-haohao" && unit.id !== "jie-ranchen" && unit.id !== "shen-benlei" && !unit.advancementFrom) {
    snapshot.paidSkill = boardHeroSkillState(stars, cooldownValue, unit.id);
  }
  return snapshot;
}

function cardHasPoints(card) {
  return card?.type === "normal" && (card.rank === "5" || card.rank === "10" || card.rank === "K");
}

function cardPoints(card) {
  if (card?.type !== "normal") return 0;
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

function finalTeamAssistPoints(playerId, playerResult, playerResults, trickHistory) {
  const finalResults = Array.isArray(playerResults) ? playerResults : [];
  const ownTeam = playerResult?.team;
  const teamByPlayerId = new Map(finalResults
    .filter((result) => result?.playerId && result?.team)
    .map((result) => [result.playerId, result.team]));
  if (!ownTeam || teamByPlayerId.get(playerId) !== ownTeam) return null;
  return (Array.isArray(trickHistory) ? trickHistory : []).reduce((total, trick) => {
    if (!trick?.winnerId || trick.winnerId === playerId || teamByPlayerId.get(trick.winnerId) !== ownTeam) return total;
    const ownPlay = (trick.plays || []).find((play) => play?.playerId === playerId);
    return total + (ownPlay?.cards || []).reduce((points, card) => points + cardPoints(card), 0);
  }, 0);
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

export function calculateHeroSkillReward({
  snapshot,
  playerId,
  playerResult,
  playerResults = [],
  gameResult = null,
  trickHistory = [],
  fryHistory = [],
  boardHeroUses = [],
  doudouNumber = null,
  doudouMatchingCards = 0,
  doudouBottomMatches = false,
  shenJiangwenUseCount = 0,
  shenJiangwenLeadLosses = 0,
  haohaoDraggedTeammateFives = 0,
  haohaoDraggedTeammateFivePenalty = 0,
  haohaoUndraggedTeammates = 0
} = {}) {
  if (!snapshot?.heroId || !playerId || !playerResult) return null;
  const stars = normalizedStars(snapshot.stars);
  const history = Array.isArray(trickHistory) ? trickHistory : [];

  if (snapshot.heroId === "shen-benlei") {
    const matched = history.some((trick) => trick?.winnerId === playerId
      && (trick.plays || []).some((play) => play?.playerId === playerId
        && (play.cards || []).some((card) => card?.type === "normal" && card.rank === "6")));
    const amount = matched ? HERO_HOME_RULES.shenBenleiDiamonds[stars - 1] : 0;
    const scoreBonus = matched ? HERO_HOME_RULES.shenBenleiScoreBonus[stars - 1] : 0;
    return {
      ...baseSkillResult(snapshot, Number(matched), 1, amount,
        `${matched ? "本人用含6的牌赢过一轮" : "本人未用含6的牌赢过一轮"}；额外${scoreBonus}积分、${amount}钻石，整局最多一次`),
      rulesVersion: HERO_HOME_RULES.boardSkillVersion,
      scoreBonus
    };
  }

  if (snapshot.heroId === "jie-ranchen") {
    const use = (Array.isArray(boardHeroUses) ? boardHeroUses : []).find((item) => item.playerId === playerId && item.heroId === "jie-ranchen");
    const investment = Number(use?.effect?.investment) || 0;
    const validInvestment = HERO_HOME_RULES.jieRanchenInvestmentOptions.includes(investment);
    const won = Number(playerResult.baseGameScore ?? playerResult.gameScore) > 0;
    const multiplier = HERO_HOME_RULES.jieRanchenWinMultipliers[stars - 1];
    const amount = validInvestment && won ? Math.round(investment * multiplier) : 0;
    return {
      ...baseSkillResult(snapshot, validInvestment && won, 1, amount,
        validInvestment
          ? `投资${investment}钻石，${won ? `获胜按${multiplier}倍获得${amount}钻石` : "本局未获胜，无投资奖励"}`
          : "本局未发动奇货可居"),
      investment: validInvestment ? investment : 0,
      multiplier,
      exemptFromIdleRate: true
    };
  }

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

  if (snapshot.heroId === "jie-jiangzha" || snapshot.heroId === "jie-denghuang") {
    const isJiang = snapshot.heroId === "jie-jiangzha";
    const matched = isJiang
      ? playerResult.role === "狗腿" && Number(playerResult.baseGameScore ?? playerResult.gameScore) > 0
      : history.at(-1)?.winnerId === playerId;
    const scoreMatched = matched && (!isJiang || history.some((trick) => trick?.winnerId === playerId));
    const srId = isJiang ? "jiang-zha" : "deng-huang";
    const amount = matched ? DIRECT_SKILL_REWARDS[srId][stars - 1] : 0;
    const scoreBonus = scoreMatched ? HERO_HOME_RULES.advancedScoreBonus[stars - 1] : 0;
    return {
      ...baseSkillResult(snapshot, Number(matched), 1, amount,
        `${matched ? (isJiang ? "狗腿身份获胜" : "本人赢得最后一轮") : "未满足奖励条件"}；额外${amount}钻石、${scoreBonus}积分`),
      rulesVersion: HERO_HOME_RULES.boardSkillVersion,
      scoreBonus
    };
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

  if (snapshot.heroId === "shen-jiangwen") {
    const losses = Math.max(0, Math.trunc(Number(shenJiangwenLeadLosses) || 0));
    const won = Number(playerResult.baseGameScore ?? playerResult.gameScore) > 0;
    const matched = won ? Math.min(losses, HERO_HOME_RULES.shenJiangwenLossCap) : 0;
    const scoreBonus = Math.round(matched * HERO_HOME_RULES.shenJiangwenScorePerLoss[stars - 1] * 100) / 100;
    const amount = matched * HERO_HOME_RULES.shenJiangwenDiamondsPerLoss[stars - 1];
    return {
      ...baseSkillResult(snapshot, matched, HERO_HOME_RULES.shenJiangwenLossCap, amount,
        `本局丢失首出权${losses}次（含主动移交）；${won ? `获胜计入${matched}次，额外${scoreBonus}积分、${amount}钻石` : "未获胜，不追加奖励"}`),
      rulesVersion: HERO_HOME_RULES.boardSkillVersion,
      scoreBonus
    };
  }

  if (snapshot.heroId === "shen-gelu") {
    const normalFryCount = (Array.isArray(fryHistory) ? fryHistory : [])
      .filter((fry) => fry?.playerId === playerId).length;
    const forcedFryCount = (Array.isArray(boardHeroUses) ? boardHeroUses : [])
      .filter((use) => use?.playerId === playerId && use?.heroId === "shen-gelu").length;
    const fryCount = normalFryCount + forcedFryCount;
    const diamondsPerFry = SHEN_GELU_DIAMONDS_PER_FRY[stars - 1];
    return baseSkillResult(snapshot, fryCount, null, fryCount * diamondsPerFry, `本局炒底${fryCount}次，每次奖励${diamondsPerFry}钻`);
  }

  if (snapshot.heroId === "shen-biesan") {
    const opponents = (Array.isArray(playerResults) ? playerResults : [])
      .filter((result) => result?.team && result.team !== playerResult.team);
    const redFives = opponents.reduce((sum, result) => sum + (Number(result.draggedRedFives) || 0), 0);
    const diamondFives = opponents.reduce((sum, result) => sum + (Number(result.draggedDiamondFives) || 0), 0);
    const bottomExtra = playerResult.team === "idle" && gameResult?.bottomWinnerTeam === "idle"
      ? (Number(gameResult.bottomDraggedRedFives) || 0) * 2 + (Number(gameResult.bottomDraggedDiamondFives) || 0)
      : 0;
    const dragPoints = redFives * 2 + diamondFives + bottomExtra;
    const diamondsPerPoint = SHEN_BIESAN_DIAMONDS_PER_DRAG_POINT[stars - 1];
    return baseSkillResult(snapshot, dragPoints, null, dragPoints * diamondsPerPoint, `对方阵营被拖红五${redFives}张、方五${diamondFives}张${bottomExtra ? `，含保底翻倍追加${bottomExtra}点` : ""}，共${dragPoints}点被拖积分，每点奖励${diamondsPerPoint}钻`);
  }

  if (snapshot.heroId === "jie-doudou") {
    const diamondsPerCard = HERO_HOME_RULES.jieDoudouDiamondsPerMatchingCard[stars - 1];
    const won = Number(playerResult.baseGameScore ?? playerResult.gameScore) > 0;
    const handReward = won ? Math.max(0, Math.trunc(Number(doudouMatchingCards) || 0)) * diamondsPerCard : 0;
    const fatherReward = Math.max(0, Math.trunc(Number(shenJiangwenUseCount) || 0))
      * HERO_HOME_RULES.jieDoudouJiangwenUseDiamonds;
    const bottomScoreBonus = doudouBottomMatches ? HERO_HOME_RULES.jieDoudouBottomScoreBonus[stars - 1] : 0;
    const amount = handReward + fatherReward;
    const detail = `随机点数${doudouNumber ?? "未记录"}；${won ? `持有${doudouMatchingCards}张同点数牌，奖励${handReward}钻` : "本局未获胜，手牌奖励为0钻"}；神·姜文成功发动${shenJiangwenUseCount}次，奖励${fatherReward}钻；${doudouBottomMatches ? `底牌命中，追加${bottomScoreBonus}积分` : "底牌未命中，不追加积分"}`;
    return {
      ...baseSkillResult(snapshot, (won ? doudouMatchingCards : 0) + shenJiangwenUseCount, null, amount, detail),
      rulesVersion: HERO_HOME_RULES.boardSkillVersion,
      scoreBonus: bottomScoreBonus
    };
  }

  if (snapshot.heroId === "shen-haohao") {
    const diamonds = Math.max(0, Math.trunc(Number(haohaoUndraggedTeammates) || 0))
      * HERO_HOME_RULES.shenHaohaoUndraggedTeammateDiamonds[stars - 1];
    const reductionCap = HERO_HOME_RULES.shenHaohaoFiveScoreReductionCap[stars - 1];
    const penalty = Math.max(0, Math.trunc(Number(haohaoDraggedTeammateFivePenalty) || 0));
    const reduced = Math.min(penalty, reductionCap);
    return {
      ...baseSkillResult(snapshot, haohaoUndraggedTeammates, null, diamonds,
        `本队${haohaoUndraggedTeammates}名玩家未被拖红方五，奖励${diamonds}钻；本人拖下队友${haohaoDraggedTeammateFives}张红方五，实际扣分${penalty}分，本局最多免除${reductionCap}分，按原拖五结算口径减免${reduced}分（闲家每人、庄队按本局分配规则折算）`),
      rulesVersion: HERO_HOME_RULES.boardSkillVersion,
      scoreBonus: reduced
    };
  }

  if (snapshot.heroId === "yokoyama-yui") {
    const finalAssistPoints = finalTeamAssistPoints(playerId, playerResult, playerResults, history);
    const assistPoints = Math.max(0, finalAssistPoints == null
      ? Number(playerResult.evaluation?.teammateAssistPoints) || 0
      : finalAssistPoints);
    const matched = Math.floor(assistPoints / 40);
    const diamondsPerAssist = YOKOYAMA_DIAMONDS_PER_ASSIST[stars - 1];
    return baseSkillResult(snapshot, matched, null, matched * diamondsPerAssist, `按最终身份回看全局出牌记录，本局为友方贴出${assistPoints}分，每满40分奖励${diamondsPerAssist}钻，共触发${matched}次`);
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
  unlockedSsrIds = [],
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
  if (rarity === "ssr") {
    const pool = SSR_HERO_UNITS.filter((unit) => !unit.advancementFrom || unlockedSsrIds.includes(unit.id));
    return pool[randomIndex(pool.length, randomFloat)];
  }
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
  unlockedSsrIds = [],
  randomFloat = Math.random
} = {}) {
  if (forceHero || forceRarity) {
    return {
      type: "unit",
      unit: drawHomeUnit({ forceHero, forceRarity, preferredUnownedHeroIds, unlockedSsrIds, randomFloat })
    };
  }
  const roll = randomFloat();
  if (roll < HERO_HOME_RULES.ssrChance) {
    return { type: "unit", unit: drawHomeUnit({ forceRarity: "ssr", unlockedSsrIds, randomFloat }) };
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
