export const DOGLEG_MODE_TRADITIONAL = "traditional";
export const DOGLEG_MODE_DYNAMIC = "dynamic";
export const DOGLEG_MODE_HIDDEN = "hidden";
export const DOGLEG_MODE_RANDOM_ORDER = "random-order";

export function normalizeDoglegMode(value) {
  if (value === DOGLEG_MODE_DYNAMIC) return DOGLEG_MODE_DYNAMIC;
  if (value === DOGLEG_MODE_HIDDEN) return DOGLEG_MODE_HIDDEN;
  if (value === DOGLEG_MODE_RANDOM_ORDER) return DOGLEG_MODE_RANDOM_ORDER;
  return DOGLEG_MODE_TRADITIONAL;
}

export function doglegModeName(value) {
  const mode = normalizeDoglegMode(value);
  if (mode === DOGLEG_MODE_DYNAMIC) return "动态狗腿";
  if (mode === DOGLEG_MODE_HIDDEN) return "暗狗腿";
  if (mode === DOGLEG_MODE_RANDOM_ORDER) return "顺位狗腿";
  return "传统狗腿";
}

function randomCardId(hand, random = Math.random) {
  if (!Array.isArray(hand) || !hand.length) return null;
  const value = Number(random());
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999999, value)) : 0;
  return hand[Math.floor(normalized * hand.length)]?.id || null;
}

export function createDynamicDoglegState(players, bankerId, random = Math.random) {
  const playerStates = {};
  (players || []).forEach((player) => {
    if (!player?.id || player.id === bankerId) return;
    playerStates[player.id] = {
      count: 0,
      lastHitSequence: 0,
      currentCardId: randomCardId(player.hand, random)
    };
  });
  return {
    hitSequence: 0,
    lastHit: null,
    hits: [],
    players: playerStates
  };
}

export function dynamicDoglegMarkCount(state, playerId) {
  return Math.max(0, Number(state?.players?.[playerId]?.count) || 0);
}

export function dynamicDoglegCardId(state, playerId) {
  return state?.players?.[playerId]?.currentCardId || null;
}

export function rankDynamicDoglegs(state, needed) {
  const limit = Math.max(0, Math.round(Number(needed) || 0));
  if (!limit) return [];
  return Object.entries(state?.players || {})
    .filter(([, item]) => Math.max(0, Number(item?.count) || 0) > 0)
    .sort(([, a], [, b]) => {
      return (Number(b.count) || 0) - (Number(a.count) || 0)
        || (Number(b.lastHitSequence) || 0) - (Number(a.lastHitSequence) || 0);
    })
    .slice(0, limit)
    .map(([playerId]) => playerId);
}

export function applyDynamicDoglegPlay(state, options = {}) {
  const playerId = options.playerId;
  const current = state?.players?.[playerId];
  const playedCardIds = new Set((options.playedCards || []).map((card) => typeof card === "string" ? card : card?.id).filter(Boolean));
  if (!current?.currentCardId || !playedCardIds.has(current.currentCardId)) {
    return {
      hit: null,
      state,
      doglegPlayerIds: rankDynamicDoglegs(state, options.needed)
    };
  }

  const sequence = Math.max(0, Number(state.hitSequence) || 0) + 1;
  const hitCardId = current.currentCardId;
  current.count = dynamicDoglegMarkCount(state, playerId) + 1;
  current.lastHitSequence = sequence;
  current.currentCardId = randomCardId(options.remainingHand, options.random);
  state.hitSequence = sequence;
  state.lastHit = {
    sequence,
    playerId,
    cardId: hitCardId,
    count: current.count
  };
  if (!Array.isArray(state.hits)) state.hits = [];
  state.hits.push(state.lastHit);

  return {
    hit: state.lastHit,
    state,
    doglegPlayerIds: rankDynamicDoglegs(state, options.needed)
  };
}

function randomIndex(length, random = Math.random) {
  if (!length) return -1;
  const value = Number(random());
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999999, value)) : 0;
  return Math.floor(normalized * length);
}

function normalCardColor(card) {
  if (card?.color === "red" || card?.color === "black") return card.color;
  if (card?.suit === "H" || card?.suit === "D") return "red";
  if (card?.suit === "S" || card?.suit === "C") return "black";
  return "";
}

const COLOR_SUIT_IDS = Object.freeze({
  black: Object.freeze(["S", "C"]),
  red: Object.freeze(["H", "D"])
});

const SUIT_SYMBOLS = Object.freeze({ S: "♠", H: "♥", C: "♣", D: "♦" });

export function sameRandomOrderDoglegCard(card, doglegCard) {
  if (doglegCard?.type === "joker") {
    return card?.type === "joker" && (card.joker === "big" || card.joker === "small");
  }
  if (card?.type !== "normal" || doglegCard?.type !== "normal") return false;
  return Boolean(card.rank && card.rank === doglegCard.rank
    && normalCardColor(card) === normalCardColor(doglegCard));
}

function randomOrderDoglegCard(card) {
  if (card?.type === "joker") {
    return {
      type: "joker",
      color: "",
      rank: "JOKER",
      jokers: ["big", "small"],
      label: "正皇 / 副皇"
    };
  }
  if (card?.type !== "normal" || !card.rank) return null;
  const color = normalCardColor(card);
  const suits = COLOR_SUIT_IDS[color];
  if (!suits) return null;
  return {
    type: "normal",
    color,
    suit: card.suit,
    suitName: card.suitName,
    symbol: card.symbol,
    rank: card.rank,
    suits: [...suits],
    label: suits.map((suit) => `${SUIT_SYMBOLS[suit]}${card.rank}`).join(" / ")
  };
}

export function createRandomOrderDoglegState(players, bankerId, needed, random = Math.random) {
  const nonBankers = (players || []).filter((player) => player?.id && player.id !== bankerId);
  const eligibleCards = nonBankers.flatMap((player) => (player.hand || [])
    .filter((card) => card?.type === "normal" || card?.type === "joker"));
  const selectedCard = eligibleCards[randomIndex(eligibleCards.length, random)] || null;
  const doglegCard = randomOrderDoglegCard(selectedCard);
  const candidateCount = doglegCard
    ? nonBankers.filter((player) => (player.hand || []).some((card) => sameRandomOrderDoglegCard(card, doglegCard))).length
    : 0;
  const limit = Math.max(0, Math.min(candidateCount, Math.round(Number(needed) || 0)));
  const availablePositions = Array.from({ length: candidateCount }, (_, index) => index + 1);
  const targetPositions = [];
  while (targetPositions.length < limit && availablePositions.length) {
    targetPositions.push(availablePositions.splice(randomIndex(availablePositions.length, random), 1)[0]);
  }
  targetPositions.sort((a, b) => a - b);

  return {
    card: doglegCard,
    targetPositions,
    playSequence: 0,
    lastPlay: null,
    plays: [],
    playerIds: []
  };
}

export function applyRandomOrderDoglegPlay(state, options = {}) {
  const playerId = options.playerId;
  const doglegPlayerIds = Array.isArray(state?.playerIds) ? state.playerIds : [];
  const targetPositions = Array.isArray(state?.targetPositions) ? state.targetPositions : [];
  const hitCard = (options.playedCards || []).find((card) => sameRandomOrderDoglegCard(card, state?.card));
  if (!playerId || !hitCard || doglegPlayerIds.includes(playerId) || doglegPlayerIds.length >= targetPositions.length) {
    return { hit: null, state, doglegPlayerIds: [...doglegPlayerIds] };
  }

  const sequence = Math.max(0, Number(state.playSequence) || 0) + 1;
  const becameDogleg = targetPositions.includes(sequence);
  if (becameDogleg) doglegPlayerIds.push(playerId);
  const hit = {
    sequence,
    playerId,
    cardId: hitCard.id || null,
    becameDogleg,
    doglegNumber: becameDogleg ? doglegPlayerIds.length : null
  };
  state.playSequence = sequence;
  state.lastPlay = hit;
  state.playerIds = doglegPlayerIds;
  if (!Array.isArray(state.plays)) state.plays = [];
  state.plays.push(hit);

  return { hit, state, doglegPlayerIds: [...doglegPlayerIds] };
}

export function createHiddenDoglegState(players, bankerId, needed, random = Math.random) {
  const candidates = (players || []).filter((player) => player?.id && player.id !== bankerId && player.hand?.length);
  const limit = Math.max(0, Math.min(candidates.length, Math.round(Number(needed) || 0)));
  const selected = [];
  while (selected.length < limit && candidates.length) {
    selected.push(candidates.splice(randomIndex(candidates.length, random), 1)[0]);
  }

  const playerStates = {};
  selected.forEach((player) => {
    playerStates[player.id] = {
      cardId: randomCardId(player.hand, random),
      revealed: false
    };
  });

  return {
    revealSequence: 0,
    reveals: [],
    playerIds: selected.map((player) => player.id),
    players: playerStates
  };
}

export function hiddenDoglegPlayerIds(state) {
  return Array.isArray(state?.playerIds) ? [...state.playerIds] : [];
}

export function hiddenDoglegCardId(state, playerId) {
  return state?.players?.[playerId]?.cardId || null;
}

export function hiddenDoglegIsRevealed(state, playerId) {
  return Boolean(state?.players?.[playerId]?.revealed);
}

export function hiddenDoglegRevealedPlayerIds(state) {
  return hiddenDoglegPlayerIds(state).filter((playerId) => hiddenDoglegIsRevealed(state, playerId));
}

export function applyHiddenDoglegPlay(state, options = {}) {
  const playerId = options.playerId;
  const current = state?.players?.[playerId];
  const playedCardIds = new Set((options.playedCards || [])
    .map((card) => typeof card === "string" ? card : card?.id)
    .filter(Boolean));
  if (!current?.cardId || current.revealed || !playedCardIds.has(current.cardId)) {
    return {
      hit: null,
      state,
      doglegPlayerIds: hiddenDoglegRevealedPlayerIds(state)
    };
  }

  const sequence = Math.max(0, Number(state.revealSequence) || 0) + 1;
  current.revealed = true;
  const hit = {
    sequence,
    playerId,
    cardId: current.cardId,
    count: 1
  };
  state.revealSequence = sequence;
  if (!Array.isArray(state.reveals)) state.reveals = [];
  state.reveals.push(hit);

  return {
    hit,
    state,
    doglegPlayerIds: hiddenDoglegRevealedPlayerIds(state)
  };
}
