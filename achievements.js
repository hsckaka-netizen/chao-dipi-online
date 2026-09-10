export const ACHIEVEMENT_RULES = Object.freeze({
  version: "2026-09-10-v1"
});

export const ACHIEVEMENT_CATEGORIES = Object.freeze([
  { id: "career", name: "生涯" },
  { id: "victory", name: "胜负" },
  { id: "performance", name: "高光表现" },
  { id: "identity", name: "身份与收藏" }
]);

export const ACHIEVEMENTS = Object.freeze([
  { id: "career-1", category: "career", name: "初登牌桌", description: "完成 1 局牌局", metric: "gamesPlayed", target: 1, rewardDiamonds: 100, title: { id: "rookie", name: "初出茅庐" } },
  { id: "career-10", category: "career", name: "渐入佳境", description: "累计完成 10 局牌局", metric: "gamesPlayed", target: 10, rewardDiamonds: 200 },
  { id: "career-50", category: "career", name: "久经牌桌", description: "累计完成 50 局牌局", metric: "gamesPlayed", target: 50, rewardDiamonds: 500, title: { id: "seasoned", name: "久经沙场" } },
  { id: "career-200", category: "career", name: "百战名将", description: "累计完成 200 局牌局", metric: "gamesPlayed", target: 200, rewardDiamonds: 1200, title: { id: "veteran", name: "百战名将" } },
  { id: "win-1", category: "victory", name: "首胜", description: "赢得 1 局牌局", metric: "wins", target: 1, rewardDiamonds: 100 },
  { id: "win-10", category: "victory", name: "胜者之路", description: "累计赢得 10 局牌局", metric: "wins", target: 10, rewardDiamonds: 300 },
  { id: "win-50", category: "victory", name: "常胜将军", description: "累计赢得 50 局牌局", metric: "wins", target: 50, rewardDiamonds: 800, title: { id: "winner", name: "常胜将军" } },
  { id: "win-streak-3", category: "victory", name: "三连捷", description: "生涯最高连胜达到 3 局", metric: "maxWinStreak", target: 3, rewardDiamonds: 300 },
  { id: "win-streak-5", category: "victory", name: "势如破竹", description: "生涯最高连胜达到 5 局", metric: "maxWinStreak", target: 5, rewardDiamonds: 600, title: { id: "streak", name: "连战连捷" } },
  { id: "loss-streak-5", category: "victory", name: "愈挫愈勇", description: "经历 5 局连败仍继续征战", metric: "maxLossStreak", target: 5, rewardDiamonds: 0, title: { id: "resilient", name: "越挫越勇" } },
  { id: "red-five-1", category: "performance", name: "初猎红五", description: "单局拖下 1 张对方红五", metric: "maxEnemyRedFives", target: 1, rewardDiamonds: 150 },
  { id: "red-five-2", category: "performance", name: "红五猎手", description: "单局拖下 2 张对方红五", metric: "maxEnemyRedFives", target: 2, rewardDiamonds: 400, title: { id: "red-five-hunter", name: "红五猎手" } },
  { id: "red-five-3", category: "performance", name: "五魁首", description: "单局拖下 3 张对方红五", metric: "maxEnemyRedFives", target: 3, rewardDiamonds: 800, title: { id: "five-chief", name: "五魁首" } },
  { id: "bottom-1", category: "performance", name: "第一次保底", description: "赢得 1 次最后一轮并获得底牌", metric: "bottomWins", target: 1, rewardDiamonds: 100 },
  { id: "bottom-20", category: "performance", name: "守底大师", description: "累计保底 20 次", metric: "bottomWins", target: 20, rewardDiamonds: 500, title: { id: "bottom-master", name: "守底大师" } },
  { id: "mvp-1", category: "performance", name: "全场核心", description: "获得 1 次 MVP", metric: "mvpCount", target: 1, rewardDiamonds: 100 },
  { id: "mvp-20", category: "performance", name: "核心中的核心", description: "累计获得 20 次 MVP", metric: "mvpCount", target: 20, rewardDiamonds: 600, title: { id: "core", name: "全场核心" } },
  { id: "support-10", category: "performance", name: "最佳拍档", description: "累计获得 10 次“辅”", metric: "supportCount", target: 10, rewardDiamonds: 300, title: { id: "partner", name: "最佳拍档" } },
  { id: "banker-20", category: "identity", name: "稳坐庄位", description: "累计以庄家身份完成 20 局", metric: "bankerGames", target: 20, rewardDiamonds: 300, title: { id: "banker", name: "坐庄专家" } },
  { id: "pve-win-10", category: "identity", name: "破阵先锋", description: "累计赢得 10 局 PVE", metric: "pveWins", target: 10, rewardDiamonds: 300, title: { id: "pve-vanguard", name: "破阵先锋" } },
  { id: "evaluation-10", category: "identity", name: "称号初收集", description: "累计获得 10 次牌局表现称号", metric: "evaluationTitleCount", target: 10, rewardDiamonds: 100 },
  { id: "evaluation-distinct-8", category: "identity", name: "百变牌手", description: "生涯获得过 8 种不同牌局表现称号", metric: "distinctEvaluationTitles", target: 8, rewardDiamonds: 400, title: { id: "versatile", name: "百变牌手" } }
]);

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));
export const ACHIEVEMENT_TITLE_BY_ID = new Map(
  ACHIEVEMENTS.filter((item) => item.title).map((item) => [item.title.id, item.title])
);

export function calculateStreaks(results = []) {
  let currentWin = 0;
  let currentLoss = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  results.forEach((won) => {
    if (won) {
      currentWin += 1;
      currentLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, currentWin);
    } else {
      currentLoss += 1;
      currentWin = 0;
      maxLossStreak = Math.max(maxLossStreak, currentLoss);
    }
  });
  return { maxWinStreak, maxLossStreak };
}

export function buildAchievementState(metrics = {}, claimedRows = [], equippedTitleId = "") {
  const claimedById = new Map(claimedRows.map((row) => [row.achievementId, row]));
  const achievements = ACHIEVEMENTS.map((definition) => {
    const progress = Math.max(0, Math.trunc(Number(metrics[definition.metric]) || 0));
    const claimed = claimedById.get(definition.id) || null;
    return {
      ...definition,
      progress,
      completed: progress >= definition.target,
      claimed: Boolean(claimed),
      claimedAt: claimed?.claimedAt || null
    };
  });
  const ownedTitles = achievements
    .filter((item) => item.claimed && item.title)
    .map((item) => item.title);
  const validEquipped = ownedTitles.some((title) => title.id === equippedTitleId) ? equippedTitleId : "";
  return {
    rulesVersion: ACHIEVEMENT_RULES.version,
    categories: ACHIEVEMENT_CATEGORIES,
    achievements,
    ownedTitles,
    equippedTitleId: validEquipped,
    equippedTitle: validEquipped ? ACHIEVEMENT_TITLE_BY_ID.get(validEquipped) || null : null,
    totalCount: achievements.length,
    claimedCount: achievements.filter((item) => item.claimed).length,
    claimableCount: achievements.filter((item) => item.completed && !item.claimed).length
  };
}
