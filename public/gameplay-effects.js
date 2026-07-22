function playedKeys(snapshot) {
  if (!snapshot) return new Set();
  const tricks = [...(snapshot.trickHistory || []), ...(snapshot.currentTrick ? [snapshot.currentTrick] : [])];
  return new Set(tricks.flatMap((trick) =>
    (trick.plays || [])
      .filter((play) => play.played)
      .map((play) => `${trick.number}:${play.playerId}:${play.at || ""}`)
  ));
}

function snapshotTricks(snapshot) {
  if (!snapshot) return [];
  const byNumber = new Map();
  (snapshot.trickHistory || []).forEach((trick) => byNumber.set(trick.number, trick));
  if (snapshot.currentTrick) byNumber.set(snapshot.currentTrick.number, snapshot.currentTrick);
  return [...byNumber.values()];
}

function draggedFiveEntries(snapshot) {
  return snapshotTricks(snapshot).flatMap((trick) => (trick.plays || []).flatMap((play) => {
    if (!play.played || play.winning) return [];
    return (play.cards || [])
      .filter((card) => card.type === "normal" && card.rank === "5" && (card.suit === "H" || card.suit === "D"))
      .map((card) => ({
        key: `${trick.number}:${play.playerId}:${card.id}`,
        trickNumber: trick.number,
        playerId: play.playerId,
        cardId: card.id,
        suit: card.suit
      }));
  }));
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

export function detectNewDraggedFiveEffects(previousState, nextState, nowMs = Date.now(), durationMs = 900) {
  if (!previousState?.roomId || previousState.roomId !== nextState?.roomId) return [];
  const previousKeys = new Set(draggedFiveEntries(previousState).map((entry) => entry.key));
  return draggedFiveEntries(nextState)
    .filter((entry) => !previousKeys.has(entry.key))
    .map((entry) => ({ ...entry, until: nowMs + durationMs }));
}
