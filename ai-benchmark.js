import { performance } from "node:perf_hooks";

import { DEFAULT_BANKER_SCORE_MODE } from "./banker-score-mode.js";
import { createSeededRandom, shuffleWithRandom, stableAiSeed } from "./ai-random.js";
import { __aiPlayTesting } from "./server.js";

const {
  AI_STRATEGY_HEURISTIC,
  AI_STRATEGY_MONTE_CARLO,
  createDeck,
  expectedPlayerId,
  legalAutoPlay,
  playCards
} = __aiPlayTesting;

const HAND_SIZE = 53;
const TRUMP_SUITS = ["S", "H", "C", "D"];

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1);
  return sorted[Math.max(0, index)];
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function deterministicBenchmarkDeck(playerCount, random) {
  const deck = createDeck(playerCount);
  const removedCards = [];
  const removeCount = Math.max(0, playerCount - 6);
  const removedSuits = shuffleWithRandom(TRUMP_SUITS, random).slice(0, removeCount);
  removedSuits.forEach((suit) => {
    const candidates = deck.filter((card) => card.type === "normal" && card.rank === "4" && card.suit === suit);
    const selected = candidates[Math.floor(random() * candidates.length)];
    const index = deck.findIndex((card) => card.id === selected.id);
    removedCards.push(deck.splice(index, 1)[0]);
  });
  return { deck: shuffleWithRandom(deck, random), removedCards };
}

function benchmarkPlayer(index, hand, host = false) {
  return {
    id: `seat-${index}`,
    name: `机器人${index + 1}`,
    hand: [...hand].sort((left, right) => left.id.localeCompare(right.id)),
    score: 0,
    draggedRedFives: 0,
    draggedDiamondFives: 0,
    throwFailures: 0,
    test: true,
    host,
    ready: true,
    nextRoundEntered: true,
    autoPlayEnabled: false,
    connected: true,
    battleHeroSnapshot: null,
    avatarUrl: "",
    avatarFrame: "",
    cardSkin: "",
    playEffect: ""
  };
}

export function createAiBenchmarkRoom({
  seed = "ai-benchmark",
  playerCount = 5,
  bankerSeat = 0,
  doglegSeat = 1,
  trumpSuit = "S"
} = {}) {
  if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > 9) {
    throw new Error("AI benchmark playerCount must be an integer from 5 to 9");
  }
  if (bankerSeat === doglegSeat) throw new Error("AI benchmark banker and dogleg seats must differ");
  const random = createSeededRandom(seed);
  const prepared = deterministicBenchmarkDeck(playerCount, random);
  const players = Array.from({ length: playerCount }, (_, index) => benchmarkPlayer(
    index,
    prepared.deck.slice(index * HAND_SIZE, (index + 1) * HAND_SIZE),
    index === 0
  ));
  const banker = players[bankerSeat];
  const dogleg = players[doglegSeat];
  const kitty = prepared.deck.slice(playerCount * HAND_SIZE);
  const startedAt = new Date(0).toISOString();

  return {
    id: `AI-${stableAiSeed(seed).toString(16)}`,
    status: "dealt",
    stage: "playing",
    phase: "AI 对战评测",
    createdAt: startedAt,
    startedAt,
    gameRecordId: null,
    callMode: "score",
    openingBidPercent: 40,
    bankerScoreMode: DEFAULT_BANKER_SCORE_MODE,
    hostId: players[0].id,
    players,
    kitty,
    removedCards: prepared.removedCards,
    kittySize: kitty.length,
    bankerId: banker.id,
    trumpSuit,
    doglegMode: "traditional",
    doglegCard: null,
    doglegPlayerIds: [dogleg.id],
    dynamicDogleg: null,
    hiddenDogleg: null,
    randomOrderDogleg: null,
    doglegNeeded: 1,
    doglegConfigured: true,
    result: null,
    setup: {
      bid: null,
      bidHistory: [],
      biddingTurnPlayerId: null,
      passIds: [],
      scoreBid: {
        minimum: playerCount * 40,
        current: {
          playerId: banker.id,
          score: playerCount * 50,
          at: startedAt
        },
        history: [],
        passIds: [],
        deadlineAt: null,
        openedAt: startedAt
      },
      fry: null
    },
    currentTrick: {
      number: 1,
      leaderId: banker.id,
      winnerId: null,
      winnerName: null,
      points: 0,
      winningPlayIndex: null,
      plays: []
    },
    trickHistory: [],
    settledTrickHistory: [],
    provisionalWinnerPlayerIds: [],
    playPauseUntil: null,
    aiSetupTimer: null,
    aiPlayTimer: null,
    scoreBidTimer: null,
    fryTimer: null,
    gameItemStageTimer: null,
    boardHeroSkillTimer: null,
    notice: null,
    events: [],
    clients: new Set(),
    spectators: new Map(),
    taunts: new Map(),
    tauntTimers: new Map(),
    tauntLastSentAt: new Map(),
    gameItems: {
      uses: [],
      frySuitOrder: null,
      luckyPlayerIds: [],
      stage: null
    },
    boardHeroSkills: {},
    boardHeroEffects: {
      uses: [],
      replacementRank: null,
      seatSwaps: []
    },
    restartCardUsedPlayerIds: [],
    itemUseInFlight: false,
    boardHeroSkillUseInFlight: false,
    snapshotVersion: 0
  };
}

function teamForPlayer(room, playerId) {
  return playerId === room.bankerId || room.doglegPlayerIds.includes(playerId) ? "banker" : "idle";
}

function emptyStrategyStats() {
  return {
    decisions: 0,
    durationsMs: [],
    throwAttempts: 0,
    throwFailures: 0,
    protectedFiveLoss: 0
  };
}

export function runAiBenchmarkGame({
  seed,
  playerCount = 5,
  bankerSeat = 0,
  doglegSeat = 1,
  trumpSuit = "S",
  candidateTeam = "banker",
  candidateOptions = {}
} = {}) {
  const room = createAiBenchmarkRoom({ seed, playerCount, bankerSeat, doglegSeat, trumpSuit });
  const strategyByPlayerId = new Map(room.players.map((player) => [
    player.id,
    teamForPlayer(room, player.id) === candidateTeam ? AI_STRATEGY_MONTE_CARLO : AI_STRATEGY_HEURISTIC
  ]));
  const strategyStats = {
    [AI_STRATEGY_HEURISTIC]: emptyStrategyStats(),
    [AI_STRATEGY_MONTE_CARLO]: emptyStrategyStats()
  };
  let guard = 0;

  while (room.stage === "playing") {
    guard += 1;
    if (guard > playerCount * HAND_SIZE * 3) throw new Error("AI benchmark exceeded its play guard");
    const playerId = expectedPlayerId(room);
    const player = room.players.find((target) => target.id === playerId);
    if (!player) throw new Error("AI benchmark could not resolve the next player");
    const strategy = strategyByPlayerId.get(player.id);
    const startedAt = performance.now();
    const decision = legalAutoPlay(room, player, {
      strategy,
      ...(strategy === AI_STRATEGY_MONTE_CARLO ? candidateOptions : {})
    });
    const durationMs = performance.now() - startedAt;
    const stats = strategyStats[strategy];
    stats.decisions += 1;
    stats.durationsMs.push(durationMs);
    if (decision.throwPlay) stats.throwAttempts += 1;
    if (!decision.cards.length) throw new Error(`AI benchmark strategy ${strategy} returned no cards`);
    const result = playCards(room, player, decision.cards.map((card) => card.id), {
      throwPlay: Boolean(decision.throwPlay),
      throwComponents: decision.throwComponents
    });
    if (result.error) throw new Error(`AI benchmark illegal play: ${result.error}`);
    if (result.resumeAt) {
      stats.throwFailures += 1;
      player.throwFailures = (player.throwFailures || 0) + 1;
      room.playPauseUntil = null;
    }
  }

  if (!room.result) throw new Error("AI benchmark game did not settle");
  room.result.playerResults.forEach((result) => {
    const strategy = strategyByPlayerId.get(result.playerId);
    strategyStats[strategy].protectedFiveLoss += result.draggedRedFives * 2 + result.draggedDiamondFives;
  });
  const candidateWon = room.result.winnerTeam === candidateTeam;
  const candidateScoreMargin = candidateTeam === "idle"
    ? room.result.idleScore - room.result.threshold
    : room.result.threshold - room.result.idleScore;

  return {
    seed,
    playerCount,
    bankerSeat,
    doglegSeat,
    trumpSuit,
    candidateTeam,
    winnerTeam: room.result.winnerTeam,
    candidateWon,
    candidateScoreMargin,
    idleScore: room.result.idleScore,
    threshold: room.result.threshold,
    bottomWinnerTeam: room.result.bottomWinnerTeam,
    strategyStats
  };
}

function mergeStrategyStats(games, strategy) {
  const stats = games.map((game) => game.strategyStats[strategy]);
  const durations = stats.flatMap((item) => item.durationsMs);
  const decisions = stats.reduce((total, item) => total + item.decisions, 0);
  return {
    decisions,
    averageDecisionMs: round(durations.reduce((total, value) => total + value, 0) / Math.max(1, durations.length), 3),
    p95DecisionMs: round(percentile(durations, 0.95), 3),
    maxDecisionMs: round(Math.max(0, ...durations), 3),
    throwAttempts: stats.reduce((total, item) => total + item.throwAttempts, 0),
    throwFailures: stats.reduce((total, item) => total + item.throwFailures, 0),
    protectedFiveLoss: stats.reduce((total, item) => total + item.protectedFiveLoss, 0)
  };
}

export function runPairedAiBenchmark({
  deals = 10,
  seed = "20260901",
  playerCount = 5,
  candidateOptions = {}
} = {}) {
  const normalizedDeals = Math.max(1, Math.floor(Number(deals) || 1));
  const games = [];
  for (let index = 0; index < normalizedDeals; index += 1) {
    const dealSeed = `${seed}:${index}`;
    const bankerSeat = index % playerCount;
    const doglegOffset = 1 + stableAiSeed(`${dealSeed}:dogleg`) % (playerCount - 1);
    const doglegSeat = (bankerSeat + doglegOffset) % playerCount;
    const trumpSuit = TRUMP_SUITS[index % TRUMP_SUITS.length];
    games.push(runAiBenchmarkGame({
      seed: dealSeed,
      playerCount,
      bankerSeat,
      doglegSeat,
      trumpSuit,
      candidateTeam: "banker",
      candidateOptions
    }));
    games.push(runAiBenchmarkGame({
      seed: dealSeed,
      playerCount,
      bankerSeat,
      doglegSeat,
      trumpSuit,
      candidateTeam: "idle",
      candidateOptions
    }));
  }

  const candidateWins = games.filter((game) => game.candidateWon).length;
  const scoreMargins = games.map((game) => game.candidateScoreMargin);
  return {
    seed: String(seed),
    deals: normalizedDeals,
    games: games.length,
    playerCount,
    baselineStrategy: AI_STRATEGY_HEURISTIC,
    candidateStrategy: AI_STRATEGY_MONTE_CARLO,
    candidateOptions,
    candidateWins,
    baselineWins: games.length - candidateWins,
    candidateWinRate: round(candidateWins / games.length, 4),
    averageCandidateScoreMargin: round(
      scoreMargins.reduce((total, value) => total + value, 0) / Math.max(1, scoreMargins.length),
      2
    ),
    strategyStats: {
      [AI_STRATEGY_HEURISTIC]: mergeStrategyStats(games, AI_STRATEGY_HEURISTIC),
      [AI_STRATEGY_MONTE_CARLO]: mergeStrategyStats(games, AI_STRATEGY_MONTE_CARLO)
    },
    gameResults: games.map((game) => ({
      seed: game.seed,
      candidateTeam: game.candidateTeam,
      winnerTeam: game.winnerTeam,
      candidateWon: game.candidateWon,
      candidateScoreMargin: game.candidateScoreMargin
    }))
  };
}
