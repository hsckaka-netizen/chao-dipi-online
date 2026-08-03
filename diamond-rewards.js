export const DIAMOND_REWARD_RULES = Object.freeze({
  version: "2026-08-03-v1",
  baseAmount: 10,
  winBonus: 0,
  titleBonusCap: 5,
  timezone: "Asia/Shanghai",
  titleBonuses: Object.freeze({
    mvp: 3,
    support: 2,
    precision: 1,
    god: 2,
    heaven: 1,
    exhausted: 1,
    pillar: 1
  })
});

function uniqueTags(tags) {
  const seen = new Set();
  return (Array.isArray(tags) ? tags : []).filter((tag) => {
    const code = String(tag?.code || "");
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

export function calculateDiamondReward({ gameScore = 0, tags = [] } = {}) {
  const won = Number(gameScore) > 0;
  const titleRewards = uniqueTags(tags)
    .map((tag) => ({
      code: String(tag.code),
      label: String(tag.label || tag.code),
      amount: DIAMOND_REWARD_RULES.titleBonuses[tag.code] || 0
    }))
    .filter((item) => item.amount > 0);
  const titleBonusBeforeCap = titleRewards.reduce((sum, item) => sum + item.amount, 0);
  const titleBonus = Math.min(titleBonusBeforeCap, DIAMOND_REWARD_RULES.titleBonusCap);
  const winBonus = won ? DIAMOND_REWARD_RULES.winBonus : 0;

  return {
    rulesVersion: DIAMOND_REWARD_RULES.version,
    baseAmount: DIAMOND_REWARD_RULES.baseAmount,
    winBonus,
    titleBonus,
    titleBonusBeforeCap,
    titleBonusCap: DIAMOND_REWARD_RULES.titleBonusCap,
    titleRewards,
    totalAmount: DIAMOND_REWARD_RULES.baseAmount + winBonus + titleBonus,
    won
  };
}

export function diamondRewardDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("牌局完成时间无效");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DIAMOND_REWARD_RULES.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isDiamondEligibleGame(room) {
  if (!room?.players?.length) return false;
  const accountIds = room.players.map((player) => player.accountId).filter(Boolean);
  return room.players.every((player) => !player.test && Boolean(player.accountId))
    && new Set(accountIds).size === room.players.length;
}

function spectatorAccountIds(room) {
  const spectators = room?.spectators instanceof Map
    ? [...room.spectators.values()]
    : Array.isArray(room?.spectators)
      ? room.spectators
      : [];
  return new Set(spectators.map((spectator) => spectator?.accountId).filter(Boolean));
}

export function isDiamondEligiblePlayer(room, player) {
  return isDiamondEligibleGame(room)
    && Boolean(player)
    && !spectatorAccountIds(room).has(player.accountId);
}

export function attachDiamondRewards(room) {
  if (!room?.result?.playerResults) return null;
  const eligible = isDiamondEligibleGame(room);
  const roomPlayers = new Map((room.players || []).map((player) => [player.id, player]));

  room.result.diamondRewardRulesVersion = DIAMOND_REWARD_RULES.version;
  room.result.diamondRewardsEligible = eligible;
  room.result.playerResults.forEach((playerResult) => {
    const roomPlayer = roomPlayers.get(playerResult.playerId);
    const playerEligible = isDiamondEligiblePlayer(room, roomPlayer);
    const calculated = calculateDiamondReward({
      gameScore: playerResult.baseGameScore ?? playerResult.gameScore,
      tags: playerResult.evaluationTags
    });
    playerResult.diamondReward = playerEligible
      ? {
          ...calculated,
          status: "pending",
          awardedAmount: null,
          balanceAfter: null
        }
      : {
          ...calculated,
          status: "ineligible",
          awardedAmount: 0,
          balanceAfter: null,
          totalAmount: 0,
          reason: spectatorAccountIds(room).has(roomPlayer?.accountId)
            ? "spectator"
            : roomPlayer?.test
              ? "robot-game"
              : "login-required"
        };
  });
  return room.result;
}

export function applyDiamondRewardPersistence(room, persistence = {}) {
  if (!room?.result?.playerResults) return;
  const outcomes = new Map((persistence.diamondRewards || []).map((item) => [item.accountId, item]));
  const roomPlayers = new Map((room.players || []).map((player) => [player.id, player]));

  room.result.playerResults.forEach((playerResult) => {
    const reward = playerResult.diamondReward;
    if (!reward || reward.status === "ineligible") return;
    const accountId = roomPlayers.get(playerResult.playerId)?.accountId;
    const outcome = outcomes.get(accountId);
    if (outcome) {
      Object.assign(reward, {
        status: outcome.status,
        awardedAmount: outcome.awardedAmount,
        balanceAfter: outcome.balanceAfter,
        rewardDate: outcome.rewardDate
      });
      return;
    }
    if (persistence.status === "pending") return;
    reward.status = persistence.status === "saved" ? "failed" : persistence.status;
    reward.awardedAmount = 0;
  });
}
