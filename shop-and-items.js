export const SHOP_RULES_VERSION = "2026-08-24-v5";

export const RESTART_CARD_STAGE = "restart-card-using";
export const OTHER_CARDS_STAGE = "other-cards-using";

export const CONSUMABLE_ITEMS = Object.freeze([
  {
    id: "restart-card",
    name: "重开卡",
    description: "发牌后的重开卡阶段使用，作废当前牌局并立即重新洗牌发牌。",
    defaultPrice: 3000,
    sortOrder: 10
  },
  {
    id: "war-god-card",
    name: "战神卡",
    description: "其他卡牌阶段使用，原始积分翻倍，额外积分由最终对方阵营承担。",
    defaultPrice: 2000,
    sortOrder: 20
  },
  {
    id: "colorful-card",
    name: "缤纷卡",
    description: "其他卡牌阶段使用，随机改变本局炒底阶段四种花色 2 的压制顺序，最后一次使用结果生效。",
    defaultPrice: 1500,
    sortOrder: 30
  },
  {
    id: "luck-card",
    name: "牌运卡",
    description: "其他卡牌阶段使用，本局头像展示牌运之神的庇佑效果。",
    defaultPrice: 150,
    sortOrder: 40
  }
]);

export const CONSUMABLE_ITEM_IDS = Object.freeze(new Set(CONSUMABLE_ITEMS.map((item) => item.id)));

const COSMETIC_THEME_LABELS = Object.freeze({
  vip: "经典 VIP",
  emerald: "翡翠",
  violet: "紫晶",
  champion: "冠军",
  stormwind: "皇家蓝城邦",
  idol: "剧场偶像",
  hellfire: "暗黑地狱",
  "blood-elf": "血精灵奥术",
  "endless-winter": "无尽冬日",
  cr7: "7号传奇",
  paladin: "圣光骑士",
  "vip-legend": "至尊星耀 VIP",
  warrior: "魔兽战士",
  mage: "魔兽法师",
  warlock: "魔兽术士",
  rogue: "魔兽盗贼",
  druid: "魔兽德鲁伊",
  shaman: "魔兽萨满祭司",
  "death-knight": "魔兽死亡骑士",
  minions: "小黄人工坊",
  usagi: "乌萨奇萌兔",
  "toy-story": "玩具总动员"
});

export const AVATAR_FRAME_KEYS = Object.freeze([
  "stormwind",
  "idol",
  "hellfire",
  "blood-elf",
  "endless-winter",
  "cr7",
  "paladin",
  "warrior",
  "mage",
  "warlock",
  "rogue",
  "druid",
  "shaman",
  "death-knight",
  "minions",
  "usagi",
  "toy-story"
]);

const AVATAR_FRAME_DEFAULT_PRICES = Object.freeze({
  stormwind: 8000,
  idol: 6000,
  hellfire: 6000,
  "blood-elf": 8000,
  "endless-winter": 6000,
  cr7: 6000,
  paladin: 8000,
  warrior: 10000,
  mage: 8000,
  warlock: 6000,
  rogue: 6000,
  druid: 6000,
  shaman: 10000,
  "death-knight": 8000,
  minions: 6000,
  usagi: 6000,
  "toy-story": 6000
});

export const CARD_SKIN_KEYS = Object.freeze([
  "emerald",
  "violet",
  "champion",
  "stormwind",
  "idol",
  "hellfire",
  "blood-elf",
  "endless-winter",
  "cr7",
  "paladin",
  "vip-legend"
]);

export const DEFAULT_SHOP_PRODUCTS = Object.freeze([
  ...AVATAR_FRAME_KEYS.map((assetKey, index) => ({
    id: `avatar-frame:${assetKey}`,
    productType: "avatar_frame",
    assetKey,
    name: `${COSMETIC_THEME_LABELS[assetKey]}头像框`,
    description: "永久解锁，可在我的皮肤中自由装备或卸下。",
    defaultPrice: AVATAR_FRAME_DEFAULT_PRICES[assetKey],
    sortOrder: 100 + index
  })),
  ...CARD_SKIN_KEYS.map((assetKey, index) => ({
    id: `card-skin:${assetKey}`,
    productType: "card_skin",
    assetKey,
    name: `${COSMETIC_THEME_LABELS[assetKey]}牌面边框`,
    description: "永久解锁，只改变牌面边框，不改变点数、花色或牌力。",
    defaultPrice: assetKey === "vip-legend" ? 4500 : 1500,
    sortOrder: 200 + index
  })),
  ...CONSUMABLE_ITEMS.map((item) => ({
    id: `consumable:${item.id}`,
    productType: "consumable_item",
    assetKey: item.id,
    name: item.name,
    description: item.description,
    defaultPrice: item.defaultPrice,
    sortOrder: 300 + item.sortOrder
  }))
]);

export const DEFAULT_FRY_SUIT_ORDER = Object.freeze(["S", "H", "C", "D"]);

export function isConsumableItemId(value) {
  return CONSUMABLE_ITEM_IDS.has(String(value || ""));
}

export function shopProductIdFromPath(value) {
  const rawValue = String(value || "");
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function isItemUseStage(stage) {
  return stage === RESTART_CARD_STAGE || stage === OTHER_CARDS_STAGE;
}

export function itemAllowedInStage(stage, itemId) {
  if (stage === RESTART_CARD_STAGE) return itemId === "restart-card";
  if (stage === OTHER_CARDS_STAGE) return itemId !== "restart-card" && isConsumableItemId(itemId);
  return false;
}

export function gameItemAccess(room) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const humanPlayers = players.filter((player) => !player?.test);
  const accountIds = humanPlayers.map((player) => player?.accountId).filter(Boolean);
  const eligible = humanPlayers.length > 0
    && accountIds.length === humanPlayers.length
    && new Set(accountIds).size === humanPlayers.length;
  return {
    eligible,
    freeUse: eligible && players.some((player) => Boolean(player?.test))
  };
}

export function randomFrySuitOrder(randomIndex) {
  const permutations = [];
  const visit = (prefix, remaining) => {
    if (!remaining.length) {
      if (prefix.join("") !== DEFAULT_FRY_SUIT_ORDER.join("")) permutations.push(prefix);
      return;
    }
    remaining.forEach((suit, index) => {
      visit([...prefix, suit], [...remaining.slice(0, index), ...remaining.slice(index + 1)]);
    });
  };
  visit([], [...DEFAULT_FRY_SUIT_ORDER]);
  const index = Math.max(0, Math.min(permutations.length - 1, Number(randomIndex) || 0));
  return [...permutations[index]];
}

export function frySuitStrength(order = DEFAULT_FRY_SUIT_ORDER) {
  return new Map(order.map((suit, index) => [suit, order.length - index - 1]));
}

function distributeCents(totalCents, recipientIds) {
  if (!recipientIds.length || !totalCents) return [];
  const each = Math.trunc(totalCents / recipientIds.length);
  let remainder = totalCents - each * recipientIds.length;
  return recipientIds.map((recipientId) => {
    const extra = remainder === 0 ? 0 : remainder > 0 ? 1 : -1;
    remainder -= extra;
    return { recipientId, cents: each + extra };
  });
}

export function applyWarGodAdjustments(playerResults, warGodPlayerIds = []) {
  const normalized = (playerResults || []).map((player, seatIndex) => ({
    ...player,
    seatIndex,
    baseGameScore: Math.round((Number(player.baseGameScore ?? player.gameScore) || 0) * 100) / 100,
    itemSelfDelta: 0,
    itemOpponentDelta: 0,
    itemScoreDelta: 0
  }));
  const byId = new Map(normalized.map((player) => [player.playerId, player]));
  const adjustments = [];

  [...new Set((warGodPlayerIds || []).map(String))].forEach((sourceId) => {
    const source = byId.get(sourceId);
    if (!source) return;
    const baseCents = Math.round(source.baseGameScore * 100);
    source.itemSelfDelta += baseCents / 100;
    adjustments.push({
      sourcePlayerId: sourceId,
      recipientPlayerId: sourceId,
      adjustmentType: "war-god-self",
      delta: baseCents / 100
    });
    const opponentIds = normalized
      .filter((player) => player.team !== source.team)
      .sort((left, right) => left.seatIndex - right.seatIndex)
      .map((player) => player.playerId);
    distributeCents(-baseCents, opponentIds).forEach(({ recipientId, cents }) => {
      const recipient = byId.get(recipientId);
      recipient.itemOpponentDelta += cents / 100;
      adjustments.push({
        sourcePlayerId: sourceId,
        recipientPlayerId: recipientId,
        adjustmentType: "war-god-opponent",
        delta: cents / 100
      });
    });
  });

  normalized.forEach((player) => {
    player.itemSelfDelta = Math.round(player.itemSelfDelta * 100) / 100;
    player.itemOpponentDelta = Math.round(player.itemOpponentDelta * 100) / 100;
    player.itemScoreDelta = Math.round((player.itemSelfDelta + player.itemOpponentDelta) * 100) / 100;
    player.gameScore = Math.round((player.baseGameScore + player.itemScoreDelta) * 100) / 100;
    delete player.seatIndex;
  });

  return { playerResults: normalized, adjustments };
}
