function activePlays(trick) {
  return [...(trick?.plays || [])]
    .filter((play) => play?.played !== false && play?.cards?.length)
    .sort((left, right) => {
      const leftIndex = Number.isFinite(left.turnIndex) ? left.turnIndex : Number.MAX_SAFE_INTEGER;
      const rightIndex = Number.isFinite(right.turnIndex) ? right.turnIndex : Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return String(left.at || "").localeCompare(String(right.at || ""));
    });
}

function playerStats(playerIds) {
  return new Map((playerIds || []).map((playerId) => [playerId, {
    cardsPlayed: 0,
    pointsPlayed: 0,
    protectedFivesPlayed: 0,
    tricksWon: 0,
    pointsCaptured: 0,
    leads: 0
  }]));
}

function statsFor(statsByPlayerId, playerId) {
  if (!statsByPlayerId.has(playerId)) {
    statsByPlayerId.set(playerId, {
      cardsPlayed: 0,
      pointsPlayed: 0,
      protectedFivesPlayed: 0,
      tricksWon: 0,
      pointsCaptured: 0,
      leads: 0
    });
  }
  return statsByPlayerId.get(playerId);
}

/**
 * Builds only knowledge that every player could derive from public plays.
 * Callers intentionally provide no opponent hands or hidden bottom cards.
 */
export function buildAiPublicKnowledge({
  playerIds = [],
  trickHistory = [],
  currentTrick = null,
  trumpSuit = null,
  routeOfCard,
  pointsOfCards,
  isProtectedFive
} = {}) {
  const seenCardIds = new Set();
  const voidRoutesByPlayerId = new Map(playerIds.map((playerId) => [playerId, new Set()]));
  const statsByPlayerId = playerStats(playerIds);
  const completed = [...(trickHistory || [])];
  const tricks = currentTrick?.plays?.length ? [...completed, currentTrick] : completed;

  tricks.forEach((trick, trickIndex) => {
    const plays = activePlays(trick);
    if (!plays.length) return;
    const lead = plays[0];
    const leadRoute = routeOfCard(lead.cards[0], trumpSuit);
    const leadCount = lead.cards.length;
    statsFor(statsByPlayerId, lead.playerId).leads += 1;

    plays.forEach((play, playIndex) => {
      const stats = statsFor(statsByPlayerId, play.playerId);
      stats.cardsPlayed += play.cards.length;
      stats.pointsPlayed += pointsOfCards(play.cards);
      stats.protectedFivesPlayed += play.cards.filter(isProtectedFive).length;
      play.cards.forEach((card) => seenCardIds.add(card.id));
      if (playIndex === 0 || !leadRoute) return;

      const followedCount = play.cards.filter((card) => routeOfCard(card, trumpSuit) === leadRoute).length;
      if (followedCount < leadCount) {
        if (!voidRoutesByPlayerId.has(play.playerId)) voidRoutesByPlayerId.set(play.playerId, new Set());
        voidRoutesByPlayerId.get(play.playerId).add(leadRoute);
      }
    });

    const isCompleted = trickIndex < completed.length || plays.length === playerIds.length;
    if (!isCompleted || !trick.winnerId) return;
    const winnerStats = statsFor(statsByPlayerId, trick.winnerId);
    winnerStats.tricksWon += 1;
    winnerStats.pointsCaptured += Number(trick.points) || pointsOfCards(plays.flatMap((play) => play.cards));
  });

  return {
    completedTrickCount: completed.length,
    seenCardIds,
    voidRoutesByPlayerId,
    statsByPlayerId
  };
}

export function aiKnowsPlayerVoid(knowledge, playerId, route) {
  return Boolean(route && knowledge?.voidRoutesByPlayerId?.get(playerId)?.has(route));
}

export function aiPublicPlayerStats(knowledge, playerId) {
  return knowledge?.statsByPlayerId?.get(playerId) || {
    cardsPlayed: 0,
    pointsPlayed: 0,
    protectedFivesPlayed: 0,
    tricksWon: 0,
    pointsCaptured: 0,
    leads: 0
  };
}
