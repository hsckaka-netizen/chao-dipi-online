export const BANKER_SCORE_MODE_REMAINDER = "banker-remainder";
export const BANKER_SCORE_MODE_AVERAGE = "team-average";
export const DEFAULT_BANKER_SCORE_MODE = BANKER_SCORE_MODE_REMAINDER;

function roundScore(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function normalizeBankerScoreMode(value) {
  return value === BANKER_SCORE_MODE_AVERAGE
    ? BANKER_SCORE_MODE_AVERAGE
    : DEFAULT_BANKER_SCORE_MODE;
}

export function bankerScoreModeName(value) {
  return normalizeBankerScoreMode(value) === BANKER_SCORE_MODE_AVERAGE
    ? "庄队均摊"
    : "庄家承余";
}

export function allocateBankerTeamScores({
  idleEachScore = 0,
  idleCount = 0,
  doglegCount = 0,
  mode = DEFAULT_BANKER_SCORE_MODE
} = {}) {
  const normalizedMode = normalizeBankerScoreMode(mode);
  const normalizedIdleScore = roundScore(idleEachScore);
  const normalizedIdleCount = Math.max(0, Math.round(Number(idleCount) || 0));
  const normalizedDoglegCount = Math.max(0, Math.round(Number(doglegCount) || 0));
  const bankerTeamTotal = roundScore(-normalizedIdleScore * normalizedIdleCount);

  if (normalizedMode === BANKER_SCORE_MODE_AVERAGE) {
    const bankerTeamCount = normalizedDoglegCount + 1;
    const sharedScore = bankerTeamCount ? roundScore(bankerTeamTotal / bankerTeamCount) : 0;
    return {
      mode: normalizedMode,
      bankerTeamTotal,
      bankerScore: sharedScore,
      doglegEachScore: sharedScore
    };
  }

  const doglegEachScore = roundScore(-normalizedIdleScore);
  return {
    mode: normalizedMode,
    bankerTeamTotal,
    bankerScore: roundScore(bankerTeamTotal - doglegEachScore * normalizedDoglegCount),
    doglegEachScore
  };
}

// Restore the original dragged-five unit before applying role allocation. A unit
// changes each idle player's score, rather than representing one team-total point.
export function draggedFiveReductionTransfers(playerResults, { idleEachScore, bankerId, mode } = {}) {
  let currentIdleScore = Number(idleEachScore) || 0;
  const idleCount = playerResults.filter((player) => player.team === "idle").length;
  const doglegCount = playerResults.filter((player) => player.team === "banker").length - 1;
  return playerResults.flatMap((source) => {
    if (source.heroSkillReward?.hero?.heroId !== "shen-haohao") return [];
    const reduction = Math.max(0, Number(source.heroSkillReward.scoreBonus) || 0);
    if (!reduction) return [];
    const previous = allocateBankerTeamScores({ idleEachScore: currentIdleScore, idleCount, doglegCount, mode });
    const idleDelta = source.team === "idle" ? reduction : -reduction;
    const next = allocateBankerTeamScores({ idleEachScore: currentIdleScore + idleDelta, idleCount, doglegCount, mode });
    const playerScoreDeltas = playerResults.map((player) => ({
      recipientId: player.playerId,
      cents: Math.round((player.team === "idle" ? idleDelta
        : player.playerId === bankerId ? next.bankerScore - previous.bankerScore
          : next.doglegEachScore - previous.doglegEachScore) * 100)
    }));
    currentIdleScore = roundScore(currentIdleScore + idleDelta);
    return [{ sourcePlayerId: source.playerId, sourceTeam: source.team, amount: reduction, playerScoreDeltas }];
  });
}
