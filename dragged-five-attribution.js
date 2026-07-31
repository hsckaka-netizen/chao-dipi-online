function cardColor(card) {
  if (card?.suit === "H" || card?.suit === "D") return "red";
  if (card?.suit === "S" || card?.suit === "C") return "black";
  return "";
}

function isMainPlayCard(card, trumpSuit) {
  if (!card) return false;
  if (card.type === "joker") return true;
  if (card.rank === "2") return true;
  if ((card.suit === "H" || card.suit === "D") && card.rank === "5") return true;
  if (card.rank === "3" && trumpSuit && cardColor(card) === cardColor({ suit: trumpSuit })) return true;
  return Boolean(card.type === "normal" && trumpSuit && card.suit === trumpSuit);
}

function playSuit(card, trumpSuit) {
  if (isMainPlayCard(card, trumpSuit)) return "TRUMP";
  return card?.type === "joker" ? "JOKER" : card?.suit || null;
}

function isProtectedFive(card) {
  return card?.type === "normal"
    && card.rank === "5"
    && (card.suit === "H" || card.suit === "D");
}

export function forcedProtectedFiveIds({
  hand = [],
  selected = [],
  leadCards = [],
  trumpSuit = null
} = {}) {
  if (!leadCards.length || !selected.length) return [];
  const leadSuit = playSuit(leadCards[0], trumpSuit);
  const requiredCount = leadCards.length;
  const sameSuit = hand.filter((card) => playSuit(card, trumpSuit) === leadSuit);
  const otherSuit = hand.filter((card) => playSuit(card, trumpSuit) !== leadSuit);
  const selectedFives = selected.filter(isProtectedFive);
  const forced = [];
  let optionalPool = [];
  let additionalForcedCount = 0;

  if (sameSuit.length < requiredCount) {
    forced.push(...selectedFives.filter((card) => playSuit(card, trumpSuit) === leadSuit));
    const fillerCount = requiredCount - sameSuit.length;
    const nonFiveFillers = otherSuit.filter((card) => !isProtectedFive(card)).length;
    additionalForcedCount = Math.max(0, fillerCount - nonFiveFillers);
    optionalPool = selectedFives.filter((card) => playSuit(card, trumpSuit) !== leadSuit);
  } else {
    const nonFiveSameSuit = sameSuit.filter((card) => !isProtectedFive(card)).length;
    additionalForcedCount = Math.max(0, requiredCount - nonFiveSameSuit);
    optionalPool = selectedFives.filter((card) => playSuit(card, trumpSuit) === leadSuit);
  }

  const alreadyForcedIds = new Set(forced.map((card) => card.id));
  const additionallyForced = optionalPool
    .filter((card) => !alreadyForcedIds.has(card.id))
    .sort((left, right) => {
      const leftValue = left.suit === "H" ? 2 : 1;
      const rightValue = right.suit === "H" ? 2 : 1;
      return leftValue - rightValue || left.id.localeCompare(right.id);
    })
    .slice(0, additionalForcedCount);

  return [...forced, ...additionallyForced].map((card) => card.id);
}

export function annotateForcedProtectedFives(tricks = [], trumpSuit = null) {
  const remainingByPlayerId = new Map();
  tricks.forEach((trick) => {
    (trick?.plays || []).forEach((play) => {
      if (!remainingByPlayerId.has(play.playerId)) remainingByPlayerId.set(play.playerId, []);
      remainingByPlayerId.get(play.playerId).push(...(play.cards || []));
    });
  });

  return tricks.map((trick) => {
    const leadCards = trick?.plays?.[0]?.cards || [];
    return {
      ...trick,
      plays: (trick?.plays || []).map((play, playIndex) => {
        const hand = remainingByPlayerId.get(play.playerId) || [];
        const forcedIds = playIndex === 0
          ? []
          : forcedProtectedFiveIds({
            hand,
            selected: play.cards,
            leadCards,
            trumpSuit
          });
        const playedIds = new Set((play.cards || []).map((card) => card.id));
        remainingByPlayerId.set(
          play.playerId,
          hand.filter((card) => !playedIds.has(card.id))
        );
        return {
          ...play,
          forcedProtectedFiveIds: forcedIds
        };
      })
    };
  });
}

export function draggedFiveActorId(trick, play, card) {
  if (!trick?.winnerId || play?.playerId === trick.winnerId) return null;
  const forcedIds = new Set(play?.forcedProtectedFiveIds || []);
  return forcedIds.has(card?.id) ? trick.leaderId : trick.winnerId;
}
