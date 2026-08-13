export const DOGLEG_MODE_TRADITIONAL = "traditional";
export const DOGLEG_MODE_DYNAMIC = "dynamic";
export const DOGLEG_MODE_HIDDEN = "hidden";

export function normalizeDoglegMode(value) {
  if (value === DOGLEG_MODE_DYNAMIC) return DOGLEG_MODE_DYNAMIC;
  if (value === DOGLEG_MODE_HIDDEN) return DOGLEG_MODE_HIDDEN;
  return DOGLEG_MODE_TRADITIONAL;
}

export function doglegModeName(value) {
  const mode = normalizeDoglegMode(value);
  if (mode === DOGLEG_MODE_DYNAMIC) return "动态狗腿";
  if (mode === DOGLEG_MODE_HIDDEN) return "暗狗腿";
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
