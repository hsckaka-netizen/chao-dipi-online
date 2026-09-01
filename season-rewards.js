export const SEASON_REWARD_RULES = Object.freeze({
  version: "2026-09-01-season-v1",
  firstEligibleSeasonNumber: 2,
  championAmount: 15_000,
  runnerUpAmount: 12_000,
  thirdPlaceAmount: 10_000,
  otherTopTenAmount: 5_000,
  remainingRankedAmount: 2_000,
  positiveScoreBonus: 2_000
});

export function seasonRankAmount(rankValue) {
  const rank = Number(rankValue);
  if (!Number.isInteger(rank) || rank < 1) {
    throw new TypeError("赛季名次必须是大于零的整数");
  }
  if (rank === 1) return SEASON_REWARD_RULES.championAmount;
  if (rank === 2) return SEASON_REWARD_RULES.runnerUpAmount;
  if (rank === 3) return SEASON_REWARD_RULES.thirdPlaceAmount;
  if (rank <= 10) return SEASON_REWARD_RULES.otherTopTenAmount;
  return SEASON_REWARD_RULES.remainingRankedAmount;
}

export function calculateSeasonReward({ rank, totalScore }) {
  const rankAmount = seasonRankAmount(rank);
  const positiveScoreBonus = Number(totalScore) > 0
    ? SEASON_REWARD_RULES.positiveScoreBonus
    : 0;
  return {
    rankAmount,
    positiveScoreBonus,
    totalAmount: rankAmount + positiveScoreBonus
  };
}
