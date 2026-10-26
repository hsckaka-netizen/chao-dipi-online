export const WAR_EFFORT_RULES = Object.freeze({
  version: "2026-10-war-effort-v2",
  completionContribution: 1500,
  campaignId: "2026-season-4-war-effort",
  name: "黑石关全服筹备",
  startsAt: "2026-09-30T19:00:00.000Z",
  endsAt: "2026-10-28T19:00:00.000Z",
  resources: Object.freeze({
    red_cloth: Object.freeze({ name: "红纹布", target: 6000, contributionNumerator: 1, contributionDenominator: 1 }),
    bounty_order: Object.freeze({ name: "悬赏令", target: 1500, contributionNumerator: 4, contributionDenominator: 1 }),
    dreamleaf: Object.freeze({ name: "梦叶草", target: 1300, contributionNumerator: 5, contributionDenominator: 1 }),
    dark_iron: Object.freeze({ name: "黑铁矿石", target: 1500, contributionNumerator: 4, contributionDenominator: 1 }),
    diamonds: Object.freeze({ name: "钻石", target: 120000, contributionNumerator: 1, contributionDenominator: 20, donationStep: 20 }),
    universal_fragments: Object.freeze({ name: "通用碎片", target: 1000, contributionNumerator: 6, contributionDenominator: 1 }),
    building_materials: Object.freeze({ name: "建材", target: 80000, contributionNumerator: 2, contributionDenominator: 25, donationStep: 25 })
  })
});

// Freeze this campaign's selection; later progression-only SSRs are not unlocked here.
export const WAR_EFFORT_SSR_IDS = Object.freeze([
  "shen-biesan", "shen-jiangwen", "shen-haohao", "jie-doudou", "yokoyama-yui", "jie-ranchen"
]);

export const WAR_EFFORT_SHOP = Object.freeze([
  Object.freeze({ id: "ssr-choice", name: "SSR 自选卡", price: 1000, limit: 6, type: "hero" }),
  Object.freeze({ id: "restart-card", name: "重开卡", price: 100, limit: null, type: "item" }),
  Object.freeze({ id: "war-god-card", name: "战神卡", price: 70, limit: null, type: "item" }),
  Object.freeze({ id: "colorful-card", name: "缤纷卡", price: 50, limit: null, type: "item" }),
  Object.freeze({ id: "blackstone-vanguard", name: "黑石关·远征先锋头像框", price: 500, limit: 1, type: "frame" })
]);

export function warEffortBalance(player = {}) {
  return Number(player.contribution || 0)
    + Number(player.reward_contribution || 0)
    - Number(player.spent_contribution || 0);
}

export function validateWarEffortExchange({ campaign, player, productId, quantity, heroId, heroes, frameOwned }) {
  if (!campaign?.completed_at) throw Object.assign(new Error("七项目标全部完成后开放贡献兑换"), { status: 409 });
  const product = WAR_EFFORT_SHOP.find((item) => item.id === productId);
  if (!product) throw Object.assign(new Error("兑换商品不存在"), { status: 400 });
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) {
    throw Object.assign(new Error("兑换数量必须为有效正整数"), { status: 400 });
  }
  if (product.type === "hero") {
    if (!WAR_EFFORT_SSR_IDS.includes(heroId) || !heroes.some((hero) => hero.id === heroId && hero.rarity === "ssr")) {
      throw Object.assign(new Error("请选择可兑换的 SSR 英雄"), { status: 400 });
    }
    if (Number(player.ssr_exchange_count || 0) + quantity > product.limit) {
      throw Object.assign(new Error("本期 SSR 自选卡每人合计最多兑换 6 张"), { status: 409 });
    }
  }
  if (product.type === "frame" && (quantity !== 1 || frameOwned)) {
    throw Object.assign(new Error(frameOwned ? "已经拥有此头像框" : "头像框只能兑换一次"), { status: 409 });
  }
  const cost = product.price * quantity;
  if (!Number.isSafeInteger(cost) || cost > warEffortBalance(player)) {
    throw Object.assign(new Error("可用贡献不足"), { status: 409 });
  }
  return { product, cost };
}

export const WAR_EFFORT_EVENT_ITEMS = Object.freeze([
  "red_cloth",
  "bounty_order",
  "dreamleaf",
  "dark_iron"
]);

export function warEffortContribution(resourceType, amountValue) {
  const definition = WAR_EFFORT_RULES.resources[resourceType];
  const amount = Math.max(0, Math.trunc(Number(amountValue) || 0));
  if (!definition || !amount) return 0;
  return Math.floor(amount * definition.contributionNumerator / definition.contributionDenominator);
}

function leadPlayCardCount(trick, playerId) {
  if (trick?.leaderId !== playerId || trick?.winnerId !== playerId) return 0;
  const lead = (trick.plays || []).find((play) => play?.playerId === playerId);
  return Array.isArray(lead?.cards) ? lead.cards.length : 0;
}

export function calculateWarEffortDrops(record, player) {
  if (!player?.accountId || player.isAi) return null;
  if (record?.gameMode === "pve" && player.pveEnergyEligible === false) return null;
  const evaluation = player.evaluation || {};
  const trickScore = Math.max(0, Number(player.trickScore) || 0);
  const fryActions = (record?.setup?.fry?.history || [])
    .filter((action) => action?.playerId === player.roomPlayerId)
    .length;
  const dreamleaf = (record?.trickHistory || [])
    .filter((trick) => leadPlayCardCount(trick, player.roomPlayerId) >= 6)
    .length;
  return {
    red_cloth: Math.min(5, Math.floor(trickScore / 40)),
    bounty_order: Math.min(5,
      Math.max(0, Number(evaluation.enemyDraggedRedFives) || 0) * 2
      + Math.max(0, Number(evaluation.enemyDraggedDiamondFives) || 0)
    ),
    dreamleaf: Math.min(2, dreamleaf),
    dark_iron: Math.min(2, fryActions)
  };
}

export function warEffortCampaignStatus(campaign, at = new Date()) {
  if (!campaign) return "unavailable";
  if (campaign.completed_at) return "completed";
  const timestamp = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (timestamp < new Date(campaign.starts_at).getTime()) return "upcoming";
  if (timestamp >= new Date(campaign.ends_at).getTime()) return "ended";
  return "active";
}
