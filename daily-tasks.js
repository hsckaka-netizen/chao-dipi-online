const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DAILY_TASK_RULES = Object.freeze({
  version: "2026-08-27-v1",
  refreshHourBeijing: 6,
  tasks: Object.freeze([
    Object.freeze({
      id: "complete-game-1",
      name: "完成一局对局",
      metric: "gamesCompleted",
      target: 1,
      rewardDiamonds: 300,
      rewardMaterials: 100
    }),
    Object.freeze({
      id: "complete-game-3",
      name: "完成3局对局",
      metric: "gamesCompleted",
      target: 3,
      rewardDiamonds: 200,
      rewardMaterials: 50
    }),
    Object.freeze({
      id: "win-game-1",
      name: "获得一次牌局胜利",
      metric: "gamesWon",
      target: 1,
      rewardDiamonds: 200,
      rewardMaterials: 50
    }),
    Object.freeze({
      id: "become-banker-1",
      name: "成为一次庄家",
      metric: "bankerGames",
      target: 1,
      rewardDiamonds: 200,
      rewardMaterials: 50
    }),
    Object.freeze({
      id: "win-bottom-1",
      name: "拿到一次底牌",
      metric: "bottomWins",
      target: 1,
      rewardDiamonds: 200,
      rewardMaterials: 50
    }),
    Object.freeze({
      id: "earn-trick-score-500",
      name: "累计获得500牌分",
      metric: "trickScore",
      target: 500,
      rewardDiamonds: 200,
      rewardMaterials: 50
    })
  ])
});

export const DAILY_TASK_BY_ID = new Map(DAILY_TASK_RULES.tasks.map((task) => [task.id, task]));

export function beijingDailyTaskWindow(at = new Date()) {
  const nowAt = new Date(at);
  if (Number.isNaN(nowAt.getTime())) return null;
  const shifted = new Date(
    nowAt.getTime() + BEIJING_OFFSET_MS - DAILY_TASK_RULES.refreshHourBeijing * 60 * 60 * 1000
  );
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const startAt = Date.UTC(year, month, day, DAILY_TASK_RULES.refreshHourBeijing) - BEIJING_OFFSET_MS;
  return {
    refreshKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    startAt: new Date(startAt).toISOString(),
    nextRefreshAt: new Date(startAt + DAY_MS).toISOString()
  };
}

export function buildDailyTaskState(summary = {}, claimedTaskIds = [], at = new Date()) {
  const window = beijingDailyTaskWindow(at);
  if (!window) return null;
  const claimed = new Set(claimedTaskIds);
  return {
    rulesVersion: DAILY_TASK_RULES.version,
    refreshHourBeijing: DAILY_TASK_RULES.refreshHourBeijing,
    ...window,
    tasks: DAILY_TASK_RULES.tasks.map((task) => {
      const progress = Math.max(0, Math.trunc(Number(summary[task.metric]) || 0));
      return {
        ...task,
        progress,
        completed: progress >= task.target,
        claimed: claimed.has(task.id)
      };
    })
  };
}
