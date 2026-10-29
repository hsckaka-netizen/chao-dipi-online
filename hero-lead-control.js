// A loss is counted after a completed trick, never from temporary winning plays.
export function countLeadLosses(trickHistory = [], uses = [], playerId) {
  if (!playerId) return 0;
  const lostTricks = (trickHistory || []).filter((trick) => trick.leaderId === playerId
    && trick.winnerId && trick.winnerId !== playerId).length;
  const transfers = (uses || []).filter((use) => use.playerId === playerId
    && use.heroId === "shen-jiangwen" && use.effect?.leadTransfer).length;
  return lostTricks + transfers;
}

export function canTransferLead(room, playerId) {
  const trick = room.currentTrick;
  return Boolean(playerId && room.status === "dealt" && room.stage === "playing"
    && trick?.leaderId === playerId && trick.plays?.length === 0
    && !(Date.parse(room.playPauseUntil) > Date.now())
    // Winning one's own lead retains control; only winning another leader's
    // completed trick acquires it (including a banker's regain after losing it).
    && (room.trickHistory || []).some((completed) => completed.leaderId
      && completed.leaderId !== playerId && completed.winnerId === playerId)
    && !(room.boardHeroEffects?.uses || []).some((use) => use.playerId === playerId
      && use.heroId === "shen-jiangwen" && use.effect?.leadTransfer));
}
