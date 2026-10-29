export const HERO_ADVANCEMENTS = Object.freeze([
  { srId: "jiang-zha", ssrId: "jie-jiangzha", tasks: [
    { key: "doglegWins", label: "以狗腿身份获胜", target: 10 }
  ] },
  { srId: "deng-huang", ssrId: "jie-denghuang", tasks: [
    { key: "bottomWins", label: "本人赢得最后一轮（保底）", target: 10 }
  ] },
  { srId: "gelu", ssrId: "shen-gelu", tasks: [
    { key: "wonTrickPoints", label: "累计获得牌分（不含底牌）", target: 5000 }
  ] }
]);

export function advancementProgress(definition, counts = {}) {
  const tasks = definition.tasks.map((task) => ({
    ...task, progress: Math.min(task.target, Math.max(0, Number(counts[task.key]) || 0))
  }));
  return { ...definition, tasks, complete: tasks.every((task) => task.progress >= task.target) };
}

export function advancementGameDelta(player, { bottomWinnerRoomPlayerId } = {}) {
  const eligible = new Set(player?.advancementSrIds || []);
  return Object.fromEntries(HERO_ADVANCEMENTS.filter(({ srId }) => eligible.has(srId)).map(({ srId }) => [
    srId, srId === "jiang-zha"
      ? { doglegWins: Number(player.role === "狗腿" && Number(player.baseGameScore) > 0) }
      : srId === "deng-huang"
        ? { bottomWins: Number(bottomWinnerRoomPlayerId === player.roomPlayerId) }
        : { wonTrickPoints: Math.max(0, Number(player.wonTrickPoints) || 0) }
  ]));
}

export function eligibleAdvancementSrIds(inventory = {}) {
  return HERO_ADVANCEMENTS.filter(({ srId }) => Number(inventory[srId]?.stars) === 5).map(({ srId }) => srId);
}
