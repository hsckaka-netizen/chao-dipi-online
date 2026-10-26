export function doudouPointLabel(value) {
  const number = Number(value);
  return ({ 1: "A（1）", 11: "J（11）", 12: "Q（12）", 13: "K（13）" })[number] || String(number);
}

export function doudouPointNotice(previous, next) {
  const number = Number(next?.viewer?.doudouNumber);
  if (next?.spectator || next?.status !== "dealt" || next?.stage === "finished"
      || next?.viewer?.battleHeroSnapshot?.heroId !== "jie-doudou"
      || !Number.isInteger(number) || number < 1 || number > 13) return "";
  if (previous?.roomId === next.roomId && previous?.startedAt === next.startedAt
      && previous?.viewer?.id === next.viewer.id && previous?.viewer?.doudouNumber === number) return "";
  return `界·豆豆「随机点数」已确定：${doudouPointLabel(number)}。本局将按此点数计算技能奖励。`;
}
