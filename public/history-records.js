export function orderedTrickPlays(trick) {
  return (trick?.plays || [])
    .filter((play) => play.cards?.length && play.played !== false)
    .sort((left, right) => {
      const leftIndex = Number.isFinite(left.turnIndex) ? left.turnIndex : Number.MAX_SAFE_INTEGER;
      const rightIndex = Number.isFinite(right.turnIndex) ? right.turnIndex : Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return String(left.at || "").localeCompare(String(right.at || ""));
    });
}

export function createHistoryTrickEntry(trick, options = {}) {
  const plays = orderedTrickPlays(trick).map((play, index) => {
    const suits = options.playSuits?.(play.cards || []) || [];
    return {
      ...play,
      playerName: play.playerName || options.playerName?.(play.playerId) || "玩家",
      role: play.role || options.playerRole?.(play.playerId) || "",
      suits,
      lead: index === 0 || play.lead,
      winning: play.playerId === trick.winnerId || play.winning,
      throwPlay: play.throwPlay || play.throw?.result === "success",
      throwFailed: play.throwFailed || play.throw?.result === "failed",
      order: index + 1
    };
  });

  return {
    kind: "trick",
    label: `第 ${trick.number} 轮`,
    number: trick.number,
    at: plays[0]?.at || null,
    sequence: options.sequence || 0,
    points: Number(trick.points) || 0,
    winnerId: trick.winnerId || null,
    plays,
    suits: [...new Set(plays.flatMap((play) => play.suits || []))]
  };
}

export function filterHistoryTimelineEntries(entries, filter) {
  if (filter === "all") return entries;
  if (filter === "fry") return entries.filter((entry) => entry.kind === "fry");
  if (filter.startsWith("suit:")) {
    const suit = filter.slice("suit:".length);
    return entries.filter((entry) => entry.kind === "trick" && entry.suits?.includes(suit));
  }
  return entries;
}
