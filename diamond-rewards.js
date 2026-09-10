export const DIAMOND_REWARD_RULES = Object.freeze({
  version: "2026-09-08-v5",
  baseAmount: 100,
  winBonus: 0,
  titleBonusCap: 50,
  pveRewardRate: 0.5,
  pveWinRequired: true,
  timezone: "Asia/Shanghai",
  titleBonuses: Object.freeze({
    mvp: 30,
    support: 20,
    precision: 10,
    god: 20,
    heaven: 10,
    exhausted: 10,
    pillar: 10
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

export function calculateDiamondReward({ gameScore = 0, tags = [], heroSkillReward = null } = {}) {
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
  const heroBonus = Math.max(0, Math.trunc(Number(heroSkillReward?.amount) || 0));

  return {
    rulesVersion: DIAMOND_REWARD_RULES.version,
    baseAmount: DIAMOND_REWARD_RULES.baseAmount,
    winBonus,
    titleBonus,
    titleBonusBeforeCap,
    titleBonusCap: DIAMOND_REWARD_RULES.titleBonusCap,
    titleRewards,
    heroBonus,
    heroSkillReward: heroSkillReward || null,
    totalAmount: DIAMOND_REWARD_RULES.baseAmount + winBonus + titleBonus + heroBonus,
    won
  };
}

function scaledRewardAmount(amount, rate) {
  return Math.max(0, Math.floor((Number(amount) || 0) * rate));
}

export function calculateGameDiamondReward({
  gameMode = "pvp",
  team = null,
  winnerTeam = null,
  gameScore = 0,
  tags = [],
  heroSkillReward = null
} = {}) {
  const reward = calculateDiamondReward({ gameScore, tags, heroSkillReward });
  if (gameMode !== "pve") return reward;

  const won = Boolean(team && winnerTeam && team === winnerTeam);
  const rate = won ? DIAMOND_REWARD_RULES.pveRewardRate : 0;
  const baseAmount = scaledRewardAmount(reward.baseAmount, rate);
  const winBonus = scaledRewardAmount(reward.winBonus, rate);
  const titleBonusCap = scaledRewardAmount(reward.titleBonusCap, DIAMOND_REWARD_RULES.pveRewardRate);
  const titleRewards = won
    ? reward.titleRewards.map((item) => ({
        ...item,
        amount: scaledRewardAmount(item.amount, DIAMOND_REWARD_RULES.pveRewardRate)
      }))
    : [];
  const titleBonusBeforeCap = titleRewards.reduce((sum, item) => sum + item.amount, 0);
  const titleBonus = Math.min(titleBonusBeforeCap, titleBonusCap);
  const heroBonus = scaledRewardAmount(reward.heroBonus, rate);
  const scaledHeroSkillReward = reward.heroSkillReward
    ? { ...reward.heroSkillReward, amount: heroBonus }
    : null;

  return {
    ...reward,
    baseAmount,
    winBonus,
    titleBonus,
    titleBonusBeforeCap,
    titleBonusCap,
    titleRewards,
    heroBonus,
    heroSkillReward: scaledHeroSkillReward,
    totalAmount: baseAmount + winBonus + titleBonus + heroBonus,
    won,
    rewardRate: DIAMOND_REWARD_RULES.pveRewardRate,
    winRequired: DIAMOND_REWARD_RULES.pveWinRequired,
    noRewardReason: won ? null : "pve-loss"
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
  const humans = room.players.filter((player) => !player.test);
  const accountIds = humans.map((player) => player.accountId).filter(Boolean);
  const humansEligible = humans.length > 0
    && accountIds.length === humans.length
    && new Set(accountIds).size === humans.length;
  if (!humansEligible) return false;
  if (room.gameMode === "pve") {
    const robots = room.players.filter((player) => player.test && player.pveRobot);
    return humans.length >= 2
      && humans.length <= 4
      && robots.length === humans.length
      && room.players.length === humans.length + robots.length
      && room.playMode === "team";
  }
  return room.players.every((player) => !player.test);
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
    && !player.test
    && Boolean(player.accountId)
    && (room.gameMode !== "pve" || player.pveEnergyEligible !== false)
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
    const calculated = calculateGameDiamondReward({
      gameMode: room.gameMode,
      team: playerResult.team,
      winnerTeam: room.result.winnerTeam,
      gameScore: playerResult.baseGameScore ?? playerResult.gameScore,
      tags: playerResult.evaluationTags,
      heroSkillReward: playerEligible ? playerResult.heroSkillReward : null
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
              ? "robot"
              : room.gameMode === "pve" && roomPlayer?.pveEnergyEligible === false
                ? roomPlayer.pveEnergyReason || "insufficient-energy"
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
