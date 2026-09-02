import { performance } from "node:perf_hooks";

import { DEFAULT_BANKER_SCORE_MODE } from "./banker-score-mode.js";
import { createSeededRandom, shuffleWithRandom, stableAiSeed } from "./ai-random.js";
import { __aiPlayTesting } from "./server.js";

const {
  AI_STRATEGY_HEURISTIC,
  AI_STRATEGY_MONTE_CARLO,
  AI_STRATEGY_SAFE_FIVE,
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

function benchmarkCardPoints(cards) {
  return cards.reduce((total, card) => {
    if (card.type !== "normal") return total;
    if (card.rank === "5") return total + 5;
    if (card.rank === "10" || card.rank === "K") return total + 10;
    return total;
  }, 0);
}

function benchmarkProtectedFiveCount(cards) {
  return cards.filter((card) => card.type === "normal" && card.rank === "5"
    && (card.suit === "H" || card.suit === "D")).length;
}

function decisionPhase(handSize) {
  if (handSize > 35) return "early";
  if (handSize > 17) return "middle";
  return "late";
}

function emptyDecisionDiagnostics() {
  return {
    overrides: 0,
    overrideLeads: 0,
    overrideFollows: 0,
    overrideEarly: 0,
    overrideMiddle: 0,
    overrideLate: 0,
    overrideTeamTrickWins: 0,
    overridePointsWon: 0,
    overridePointsLost: 0,
    overrideProtectedFivePlays: 0
  };
}

function emptyStrategyStats() {
  return {
    decisions: 0,
    durationsMs: [],
    throwAttempts: 0,
    throwFailures: 0,
    draggedRedFives: 0,
    draggedDiamondFives: 0,
    protectedFiveLoss: 0,
    decisionDiagnostics: emptyDecisionDiagnostics()
  };
}

export function runAiBenchmarkGame({
  seed,
  playerCount = 5,
  bankerSeat = 0,
  doglegSeat = 1,
  trumpSuit = "S",
  candidateTeam = "banker",
  baselineStrategy = AI_STRATEGY_MONTE_CARLO,
  candidateStrategy = AI_STRATEGY_SAFE_FIVE,
  candidateOptions = {}
} = {}) {
  const room = createAiBenchmarkRoom({ seed, playerCount, bankerSeat, doglegSeat, trumpSuit });
  const strategyByPlayerId = new Map(room.players.map((player) => [
    player.id,
    teamForPlayer(room, player.id) === candidateTeam ? candidateStrategy : baselineStrategy
  ]));
  const strategyStats = {
    [baselineStrategy]: emptyStrategyStats(),
    [candidateStrategy]: emptyStrategyStats()
  };
  const decisionRecords = [];
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
      ...(strategy === candidateStrategy ? candidateOptions : {})
    });
    const durationMs = performance.now() - startedAt;
    const stats = strategyStats[strategy];
    stats.decisions += 1;
    stats.durationsMs.push(durationMs);
    if (strategy === candidateStrategy && decision.overrodeHeuristic) {
      decisionRecords.push({
        trickNumber: room.currentTrick.number,
        playerId: player.id,
        team: teamForPlayer(room, player.id),
        leading: room.currentTrick.plays.length === 0,
        phase: decisionPhase(player.hand.length),
        pointsCommitted: benchmarkCardPoints(decision.cards),
        protectedFivesCommitted: benchmarkProtectedFiveCount(decision.cards)
      });
    }
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
    strategyStats[strategy].draggedRedFives += result.draggedRedFives;
    strategyStats[strategy].draggedDiamondFives += result.draggedDiamondFives;
    strategyStats[strategy].protectedFiveLoss += result.draggedRedFives * 2 + result.draggedDiamondFives;
  });
  const trickByNumber = new Map(room.trickHistory.map((trick) => [trick.number, trick]));
  decisionRecords.forEach((record) => {
    const diagnostics = strategyStats[candidateStrategy].decisionDiagnostics;
    const trick = trickByNumber.get(record.trickNumber);
    const winnerTeam = trick ? teamForPlayer(room, trick.winnerId) : null;
    diagnostics.overrides += 1;
    diagnostics[record.leading ? "overrideLeads" : "overrideFollows"] += 1;
    diagnostics[`override${record.phase[0].toUpperCase()}${record.phase.slice(1)}`] += 1;
    diagnostics.overrideProtectedFivePlays += record.protectedFivesCommitted;
    if (winnerTeam === record.team) {
      diagnostics.overrideTeamTrickWins += 1;
      diagnostics.overridePointsWon += trick?.points || 0;
    } else {
      diagnostics.overridePointsLost += trick?.points || 0;
    }
  });
  const settlementWinnerTeam = room.result.evaluationWinnerTeam;
  const candidateWon = settlementWinnerTeam === candidateTeam;
  const candidateDraw = settlementWinnerTeam === null;
  const candidateSettlementMargin = candidateTeam === "idle"
    ? room.result.idleEachScore
    : -room.result.idleEachScore;
  const candidateCardPointMargin = candidateTeam === "idle"
    ? room.result.idleScore - room.result.threshold
    : room.result.threshold - room.result.idleScore;

  return {
    seed,
    playerCount,
    bankerSeat,
    doglegSeat,
    trumpSuit,
    candidateTeam,
    baselineStrategy,
    candidateStrategy,
    winnerTeam: settlementWinnerTeam,
    cardPointWinnerTeam: room.result.winnerTeam,
    candidateWon,
    candidateDraw,
    candidateScoreMargin: candidateSettlementMargin,
    candidateCardPointMargin,
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
    draggedRedFives: stats.reduce((total, item) => total + item.draggedRedFives, 0),
    draggedDiamondFives: stats.reduce((total, item) => total + item.draggedDiamondFives, 0),
    protectedFiveLoss: stats.reduce((total, item) => total + item.protectedFiveLoss, 0),
    decisionDiagnostics: Object.fromEntries(Object.keys(emptyDecisionDiagnostics()).map((key) => [
      key,
      stats.reduce((total, item) => total + item.decisionDiagnostics[key], 0)
    ]))
  };
}

function mergeStrategySummaries(results, strategy) {
  const summaries = results.map((result) => result.strategyStats[strategy]);
  const decisions = summaries.reduce((total, item) => total + item.decisions, 0);
  return {
    decisions,
    averageDecisionMs: round(summaries.reduce(
      (total, item) => total + item.averageDecisionMs * item.decisions,
      0
    ) / Math.max(1, decisions), 3),
    p95DecisionMs: round(Math.max(0, ...summaries.map((item) => item.p95DecisionMs)), 3),
    maxDecisionMs: round(Math.max(0, ...summaries.map((item) => item.maxDecisionMs)), 3),
    throwAttempts: summaries.reduce((total, item) => total + item.throwAttempts, 0),
    throwFailures: summaries.reduce((total, item) => total + item.throwFailures, 0),
    draggedRedFives: summaries.reduce((total, item) => total + item.draggedRedFives, 0),
    draggedDiamondFives: summaries.reduce((total, item) => total + item.draggedDiamondFives, 0),
    protectedFiveLoss: summaries.reduce((total, item) => total + item.protectedFiveLoss, 0),
    decisionDiagnostics: Object.fromEntries(Object.keys(emptyDecisionDiagnostics()).map((key) => [
      key,
      summaries.reduce((total, item) => total + item.decisionDiagnostics[key], 0)
    ]))
  };
}

export function mergePairedAiBenchmarkResults(results, { seed = "parallel" } = {}) {
  if (!results.length) throw new Error("AI benchmark merge requires at least one result");
  const first = results[0];
  const games = results.reduce((total, result) => total + result.games, 0);
  const deals = results.reduce((total, result) => total + result.deals, 0);
  const candidateWins = results.reduce((total, result) => total + result.candidateWins, 0);
  const draws = results.reduce((total, result) => total + (result.draws || 0), 0);
  return {
    seed: String(seed),
    deals,
    games,
    playerCount: first.playerCount,
    baselineStrategy: first.baselineStrategy,
    candidateStrategy: first.candidateStrategy,
    candidateOptions: first.candidateOptions,
    candidateWins,
    baselineWins: games - candidateWins - draws,
    draws,
    candidateWinRate: round(candidateWins / games, 4),
    averageCandidateScoreMargin: round(results.reduce(
      (total, result) => total + result.averageCandidateScoreMargin * result.games,
      0
    ) / Math.max(1, games), 2),
    averageCandidateCardPointMargin: round(results.reduce(
      (total, result) => total + result.averageCandidateCardPointMargin * result.games,
      0
    ) / Math.max(1, games), 2),
    candidateCardPointWins: results.reduce((total, result) => total + result.candidateCardPointWins, 0),
    strategyStats: {
      [first.baselineStrategy]: mergeStrategySummaries(results, first.baselineStrategy),
      [first.candidateStrategy]: mergeStrategySummaries(results, first.candidateStrategy)
    },
    gameResults: results.flatMap((result) => result.gameResults)
  };
}

export function runPairedAiBenchmark({
  deals = 10,
  seed = "20260901",
  playerCount = 5,
  baselineStrategy = AI_STRATEGY_MONTE_CARLO,
  candidateStrategy = AI_STRATEGY_SAFE_FIVE,
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
      baselineStrategy,
      candidateStrategy,
      candidateOptions
    }));
    games.push(runAiBenchmarkGame({
      seed: dealSeed,
      playerCount,
      bankerSeat,
      doglegSeat,
      trumpSuit,
      candidateTeam: "idle",
      baselineStrategy,
      candidateStrategy,
      candidateOptions
    }));
  }

  const candidateWins = games.filter((game) => game.candidateWon).length;
  const draws = games.filter((game) => game.candidateDraw).length;
  const scoreMargins = games.map((game) => game.candidateScoreMargin);
  const cardPointMargins = games.map((game) => game.candidateCardPointMargin);
  return {
    seed: String(seed),
    deals: normalizedDeals,
    games: games.length,
    playerCount,
    baselineStrategy,
    candidateStrategy,
    candidateOptions,
    candidateWins,
    baselineWins: games.length - candidateWins - draws,
    draws,
    candidateWinRate: round(candidateWins / games.length, 4),
    averageCandidateScoreMargin: round(
      scoreMargins.reduce((total, value) => total + value, 0) / Math.max(1, scoreMargins.length),
      2
    ),
    averageCandidateCardPointMargin: round(
      cardPointMargins.reduce((total, value) => total + value, 0) / Math.max(1, cardPointMargins.length),
      2
    ),
    candidateCardPointWins: games.filter((game) => game.cardPointWinnerTeam === game.candidateTeam).length,
    strategyStats: {
      [baselineStrategy]: mergeStrategyStats(games, baselineStrategy),
      [candidateStrategy]: mergeStrategyStats(games, candidateStrategy)
    },
    gameResults: games.map((game) => ({
      seed: game.seed,
      candidateTeam: game.candidateTeam,
      winnerTeam: game.winnerTeam,
      cardPointWinnerTeam: game.cardPointWinnerTeam,
      candidateWon: game.candidateWon,
      candidateDraw: game.candidateDraw,
      candidateScoreMargin: game.candidateScoreMargin,
      candidateCardPointMargin: game.candidateCardPointMargin
    }))
  };
}
