export const HERO_ADVANCEMENTS = Object.freeze([
  { srId: "jiang-zha", ssrId: "jie-jiangzha", tasks: [
    { key: "doglegWins", label: "以狗腿身份获胜", target: 10 }
  ] },
  { srId: "deng-huang", ssrId: "jie-denghuang", tasks: [
    { key: "bottomWins", label: "本人赢得最后一轮（保底）", target: 10 }
  ] }
]);

export function advancementProgress(definition, counts = {}) {
  const tasks = definition.tasks.map((task) => ({
    ...task, progress: Math.min(task.target, Math.max(0, Number(counts[task.key]) || 0))
  }));
  return { ...definition, tasks, complete: tasks.every((task) => task.progress >= task.target) };
}

export function advancementGameDelta(player, { bottomWinnerRoomPlayerId } = {}) {
  const hero = player?.battleHeroSnapshot;
  if (!hero || Number(hero.stars) !== 5) return null;
  if (hero.heroId === "jiang-zha") {
    const won = player.role === "狗腿" && Number(player.baseGameScore) > 0;
    return { doglegWins: Number(won) };
  }
  if (hero.heroId === "deng-huang") {
    const bottom = bottomWinnerRoomPlayerId === player.roomPlayerId;
    return { bottomWins: Number(bottom) };
  }
  return null;
}
