function playedKeys(snapshot) {
  if (!snapshot) return new Set();
  const tricks = [...(snapshot.trickHistory || []), ...(snapshot.currentTrick ? [snapshot.currentTrick] : [])];
  return new Set(tricks.flatMap((trick) =>
    (trick.plays || [])
      .filter((play) => play.played)
      .map((play) => `${trick.number}:${play.playerId}:${play.at || ""}`)
  ));
}

export function detectNewLargePlayEffects(previousState, nextState, nowMs = Date.now(), durationMs = 1800) {
  if (!previousState?.roomId || previousState.roomId !== nextState?.roomId) return [];
  const previousKeys = playedKeys(previousState);
  const effectByPlayerId = new Map((nextState.players || []).map((player) => [player.id, player.playEffect || ""]));
  const tricks = [...(nextState.trickHistory || []), ...(nextState.currentTrick ? [nextState.currentTrick] : [])];
  return tricks.flatMap((trick) => (trick.plays || []).flatMap((play) => {
    if (!play.played || play.throwFailed || !play.winning || effectByPlayerId.get(play.playerId) !== "fireworks") return [];
    if ((play.cards?.length || 0) < 8) return [];
    const key = `${trick.number}:${play.playerId}:${play.at || ""}`;
    if (previousKeys.has(key)) return [];
    return [{ key, trickNumber: trick.number, playerId: play.playerId, until: nowMs + durationMs }];
  }));
}
