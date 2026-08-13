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
