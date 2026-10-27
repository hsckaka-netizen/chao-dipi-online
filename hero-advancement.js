export const HERO_ADVANCEMENTS = Object.freeze([
  { srId: "jiang-zha", ssrId: "jie-jiangzha", tasks: [
    { key: "doglegWins", label: "以狗腿身份获胜", target: 12 },
    { key: "activeDoglegWins", label: "以狗腿身份获胜，且本局至少赢过一轮", target: 6 }
  ] },
  { srId: "deng-huang", ssrId: "jie-denghuang", tasks: [
    { key: "bottomWins", label: "本人赢得最后一轮（保底）", target: 15 },
    { key: "precisionBottomWins", label: "以副牌赢得最后一轮（获得“精”）", target: 5 }
  ] }
]);

export function advancementProgress(definition, counts = {}) {
  const tasks = definition.tasks.map((task) => ({
    ...task, progress: Math.min(task.target, Math.max(0, Number(counts[task.key]) || 0))
  }));
  return { ...definition, tasks, complete: tasks.every((task) => task.progress >= task.target) };
}

export function advancementGameDelta(player, { bottomWinnerRoomPlayerId, wonTrickPlayerIds = [] } = {}) {
  const hero = player?.battleHeroSnapshot;
  if (!hero || Number(hero.stars) !== 5) return null;
  if (hero.heroId === "jiang-zha") {
    const won = player.role === "狗腿" && Number(player.baseGameScore) > 0;
    return { doglegWins: Number(won), activeDoglegWins: Number(won && wonTrickPlayerIds.includes(player.roomPlayerId)) };
  }
  if (hero.heroId === "deng-huang") {
    const bottom = bottomWinnerRoomPlayerId === player.roomPlayerId;
    return { bottomWins: Number(bottom), precisionBottomWins: Number(bottom && (player.tags || []).some((tag) => tag.code === "precision")) };
  }
  return null;
}
