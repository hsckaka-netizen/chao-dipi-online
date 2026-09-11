import test from "node:test";
import assert from "node:assert/strict";

import { createSeededRandom } from "../ai-random.js";
import { applyShenBiesanCardRules } from "../public/replacement-rank-rules.js";
import { __aiPlayTesting } from "../server.js";

const {
  AI_STRATEGY_FIXED_TEAM,
  AI_STRATEGY_HEURISTIC,
  AI_STRATEGY_PVE_TEAM,
  AI_STRATEGY_SAFE_FIVE,
  aiDecisionContext,
  aiPveTrumpLeadMemoryAdjustment,
  aiSampleHiddenHands,
  aiSafeThrowPlans,
  aiTeamFiveExposure,
  autoBuryCardIds,
  createDeck,
  legalAutoPlay,
  setupBottomHoldConfidence,
  setupBottomTransferForecast
} = __aiPlayTesting;

function cardById(deck, id) {
  const card = deck.find((item) => item.id === id);
  assert.ok(card, `missing test card ${id}`);
  return card;
}

function player(id, hand = [], score = 0, squad = null) {
  return { id, name: id, hand, score, squad, test: true };
}

function baseRoom({
  players,
  currentTrick,
  trickHistory = [],
  bankerId = "banker",
  doglegPlayerIds = [],
  gameMode = "pvp",
  playMode = "brawl"
}) {
  return {
    id: "ai-test-room",
    status: "dealt",
    stage: "playing",
    gameMode,
    playMode,
    players,
    currentTrick,
    trickHistory,
    trumpSuit: "S",
    removedCards: [],
    boardHeroEffects: {},
    callMode: "score",
    setup: { scoreBid: { current: { playerId: bankerId, score: 200 } } },
    bankerId,
    doglegMode: "traditional",
    doglegNeeded: 1,
    doglegCard: null,
    doglegPlayerIds,
    dynamicDogleg: null,
    hiddenDogleg: null,
    randomOrderDogleg: null
  };
}

function pveRoom(options) {
  return baseRoom({ ...options, gameMode: "pve", playMode: "team", doglegPlayerIds: [] });
}

test("robot decisions do not change when only the hidden banker hand changes", () => {
  const deck = createDeck(5);
  const robotHand = ["1-C-A", "1-C-K", "1-C-Q", "1-C-J", "1-D-4"].map((id) => cardById(deck, id));
  const lowBankerHand = ["2-C-4", "2-C-6", "2-D-7", "2-H-8", "2-D-9"].map((id) => cardById(deck, id));
  const highBankerHand = ["2-H-5", "2-D-5", "2-JOKER-BIG", "2-JOKER-SMALL", "2-S-3"].map((id) => cardById(deck, id));
  const otherPlayers = [player("other-1"), player("other-2"), player("other-3")];

  function decision(bankerHand, strategy) {
    const robot = player("robot", robotHand);
    const room = baseRoom({
      players: [robot, player("banker", bankerHand), ...otherPlayers],
      currentTrick: { number: 1, leaderId: "robot", plays: [] }
    });
    room.doglegCard = cardById(deck, "1-C-A");
    return legalAutoPlay(room, robot, strategy ? { strategy } : {}).cards.map((card) => card.id).sort();
  }

  assert.deepEqual(decision(lowBankerHand), decision(highBankerHand));
  assert.deepEqual(
    decision(lowBankerHand, AI_STRATEGY_FIXED_TEAM),
    decision(highBankerHand, AI_STRATEGY_FIXED_TEAM)
  );
});

test("robot can assemble a throw only from components proven safe by public cards", () => {
  const deck = createDeck(5);
  const robot = player("robot", [
    ...deck.filter((card) => card.joker === "big"),
    ...deck.filter((card) => card.type === "normal" && card.suit === "S" && card.rank === "3")
  ]);
  const players = [robot, player("banker"), player("other-1"), player("other-2"), player("other-3")];
  const exhaustedRanks = [
    deck.filter((card) => card.type === "normal" && card.suit === "H" && card.rank === "5"),
    deck.filter((card) => card.type === "normal" && card.suit === "D" && card.rank === "5"),
    deck.filter((card) => card.joker === "small")
  ];
  const trickHistory = exhaustedRanks.map((cards, index) => ({
    number: index + 1,
    leaderId: players[0].id,
    winnerId: players[0].id,
    points: 0,
    plays: players.map((target, playIndex) => ({
      playerId: target.id,
      turnIndex: playIndex,
      cards: [cards[playIndex]]
    }))
  }));
  const room = baseRoom({
    players,
    bankerId: "robot",
    currentTrick: { number: 4, leaderId: "robot", plays: [] },
    trickHistory
  });
  room.doglegNeeded = 0;

  const plans = aiSafeThrowPlans(room, robot, aiDecisionContext(room, robot));
  const throwPlan = plans.find((plan) => plan.cards.length === 10);
  assert.ok(throwPlan, "expected a public-information-safe ten-card throw");
  assert.equal(throwPlan.throwComponents.length, 2);
  assert.deepEqual(
    new Set(throwPlan.cards.map((card) => card.joker ? card.joker : `${card.suit}-${card.rank}`)),
    new Set(["big", "S-3"])
  );
  assert.equal(legalAutoPlay(room, robot).throwPlay, true);
});

test("robot feeds a safe ally but does not volunteer a protected five", () => {
  const deck = createDeck(5);
  const banker = player("banker");
  const opponents = [player("other-1"), player("other-2"), player("other-3")];
  const robot = player("robot", [cardById(deck, "1-D-5"), cardById(deck, "1-S-4")]);
  const players = [banker, ...opponents, robot];
  const room = baseRoom({
    players,
    bankerId: "banker",
    doglegPlayerIds: ["robot"],
    currentTrick: {
      number: 8,
      leaderId: "banker",
      plays: [
        { playerId: "banker", cards: [cardById(deck, "2-H-5")] },
        { playerId: "other-1", cards: [cardById(deck, "2-S-4")] },
        { playerId: "other-2", cards: [cardById(deck, "3-S-6")] },
        { playerId: "other-3", cards: [cardById(deck, "4-S-7")] }
      ]
    }
  });

  const decision = legalAutoPlay(room, robot);
  const fixedTeamDecision = legalAutoPlay(room, robot, { strategy: AI_STRATEGY_FIXED_TEAM });
  assert.deepEqual(decision.cards.map((card) => card.id), ["1-S-4"]);
  assert.deepEqual(fixedTeamDecision.cards.map((card) => card.id), ["1-S-4"]);
  assert.equal(decision.throwPlay, false);
});

test("default robot safely takes the trick with an unstructured diamond five from last seat", () => {
  const deck = createDeck(5);
  const banker = player("banker");
  const opponents = [player("other-1"), player("other-2"), player("other-3")];
  const robot = player("robot", [cardById(deck, "1-D-5"), cardById(deck, "1-H-4")]);
  const room = baseRoom({
    players: [banker, ...opponents, robot],
    bankerId: "banker",
    doglegPlayerIds: ["robot"],
    currentTrick: {
      number: 8,
      leaderId: "banker",
      plays: [
        { playerId: "banker", cards: [cardById(deck, "1-C-A")] },
        { playerId: "other-1", cards: [cardById(deck, "2-C-K")] },
        { playerId: "other-2", cards: [cardById(deck, "3-C-Q")] },
        { playerId: "other-3", cards: [cardById(deck, "4-C-J")] }
      ]
    }
  });

  const baseline = legalAutoPlay(room, robot, { strategy: AI_STRATEGY_HEURISTIC });
  const decision = legalAutoPlay(room, robot);
  assert.deepEqual(baseline.cards.map((card) => card.id), ["1-H-4"]);
  assert.deepEqual(decision.cards.map((card) => card.id), ["1-D-5"]);
  assert.equal(decision.strategy, AI_STRATEGY_SAFE_FIVE);
});

test("sampled hidden hands honor public void knowledge and public hand counts", () => {
  const deck = createDeck(5);
  const robot = player("robot", [cardById(deck, "1-S-A"), cardById(deck, "1-C-K")]);
  const voidPlayer = player("void-player", [cardById(deck, "2-H-9"), cardById(deck, "2-H-10"), cardById(deck, "2-H-J")]);
  const otherPlayers = [player("banker", [cardById(deck, "3-D-4")]), player("other-1"), player("other-2")];
  const room = baseRoom({
    players: [robot, voidPlayer, ...otherPlayers],
    currentTrick: { number: 2, leaderId: "robot", plays: [] },
    trickHistory: [{
      number: 1,
      leaderId: "robot",
      winnerId: "robot",
      points: 0,
      plays: [
        { playerId: "robot", cards: [cardById(deck, "1-H-6"), cardById(deck, "1-H-7")] },
        { playerId: "void-player", cards: [cardById(deck, "2-H-8"), cardById(deck, "2-C-9")] },
        { playerId: "banker", cards: [cardById(deck, "3-H-6"), cardById(deck, "3-H-7")] },
        { playerId: "other-1", cards: [cardById(deck, "4-H-6"), cardById(deck, "4-H-7")] },
        { playerId: "other-2", cards: [cardById(deck, "5-H-6"), cardById(deck, "5-H-7")] }
      ]
    }]
  });
  const context = aiDecisionContext(room, robot);
  const sample = aiSampleHiddenHands(room, robot, context, createSeededRandom("void-sample"));

  assert.ok(sample);
  assert.equal(sample.hands.get("void-player").length, voidPlayer.hand.length);
  assert.equal(
    sample.hands.get("void-player").some((card) => __aiPlayTesting.playSuit(card, room.trumpSuit) === "H"),
    false
  );
  otherPlayers.forEach((target) => {
    assert.equal(sample.hands.get(target.id).length, target.hand.length);
  });
});

test("one-trick sampling falls back to the fair heuristic in nontraditional dogleg modes", () => {
  const deck = createDeck(5);
  const robot = player("robot", [
    cardById(deck, "1-C-A"),
    cardById(deck, "1-C-K"),
    cardById(deck, "1-D-4")
  ]);
  const room = baseRoom({
    players: [robot, player("banker"), player("other-1"), player("other-2"), player("other-3")],
    currentTrick: { number: 1, leaderId: "robot", plays: [] }
  });
  room.doglegMode = "hidden";
  room.hiddenDogleg = { players: {} };

  const decision = legalAutoPlay(room, robot);
  const baseline = legalAutoPlay(room, robot, { strategy: AI_STRATEGY_HEURISTIC });
  assert.equal(decision.strategy, AI_STRATEGY_HEURISTIC);
  assert.deepEqual(decision.cards.map((card) => card.id), baseline.cards.map((card) => card.id));
});

test("PVE keeps monte-carlo-v4 by default and exposes the new fixed-team strategy for evaluation", () => {
  const deck = createDeck(4);
  const robot = player("robot", [cardById(deck, "1-C-4")], 0, "A");
  const players = [
    robot,
    player("opponent-1", [cardById(deck, "2-D-6")], 0, "B"),
    player("ally", [cardById(deck, "3-C-7")], 0, "A"),
    player("opponent-2", [cardById(deck, "4-D-8")], 0, "B")
  ];
  const room = pveRoom({
    players,
    bankerId: "robot",
    currentTrick: { number: 1, leaderId: "robot", plays: [] }
  });
  const ordinaryRoom = baseRoom({
    players,
    bankerId: "robot",
    currentTrick: { number: 1, leaderId: "robot", plays: [] }
  });

  assert.equal(legalAutoPlay(room, robot).strategy, AI_STRATEGY_SAFE_FIVE);
  assert.equal(legalAutoPlay(room, robot, { strategy: AI_STRATEGY_PVE_TEAM }).strategy, AI_STRATEGY_PVE_TEAM);
  assert.equal(legalAutoPlay(ordinaryRoom, robot).strategy, AI_STRATEGY_SAFE_FIVE);
});

test("PVE robot keeps scattered trump control and sheds a weak side pair when void", () => {
  const deck = createDeck(4);
  const leader = player("opponent-1", [], 0, "B");
  const robot = player("robot", [
    cardById(deck, "1-C-A"),
    cardById(deck, "2-C-A"),
    cardById(deck, "1-S-4"),
    cardById(deck, "2-S-6"),
    cardById(deck, "1-H-5"),
    cardById(deck, "1-D-5")
  ], 0, "A");
  const players = [leader, robot, player("ally", [], 0, "A"), player("opponent-2", [], 0, "B")];
  const room = pveRoom({
    players,
    bankerId: "robot",
    currentTrick: {
      number: 8,
      leaderId: leader.id,
      plays: [{
        playerId: leader.id,
        cards: [cardById(deck, "1-H-9"), cardById(deck, "2-H-9")]
      }]
    }
  });

  const decision = legalAutoPlay(room, robot);
  assert.deepEqual(new Set(decision.cards.map((card) => card.id)), new Set(["1-C-A", "2-C-A"]));
});

test("PVE robot feeds safe points when its teammate is guaranteed to keep the trick", () => {
  const deck = createDeck(4);
  const leader = player("ally", [], 0, "A");
  const robot = player("robot", [
    cardById(deck, "1-C-K"),
    cardById(deck, "1-D-9"),
    cardById(deck, "1-D-5")
  ], 0, "A");
  const players = [leader, player("opponent-1", [], 0, "B"), player("opponent-2", [], 0, "B"), robot];
  const room = pveRoom({
    players,
    bankerId: "ally",
    currentTrick: {
      number: 16,
      leaderId: leader.id,
      plays: [
        { playerId: leader.id, cards: [cardById(deck, "1-H-A")] },
        { playerId: "opponent-1", cards: [cardById(deck, "2-H-K")] },
        { playerId: "opponent-2", cards: [cardById(deck, "3-H-Q")] }
      ]
    }
  });

  const decision = legalAutoPlay(room, robot);
  assert.deepEqual(decision.cards.map((card) => card.id), ["1-C-K"]);
});

test("fixed-team five memory counts every publicly played five, including losing plays", () => {
  const deck = createDeck(4);
  const robot = player("robot", [cardById(deck, "1-C-4")], 0, "A");
  const players = [
    robot,
    player("opponent-1", [], 0, "B"),
    player("ally", [cardById(deck, "1-C-6")], 0, "A"),
    player("opponent-2", [], 0, "B")
  ];
  const room = pveRoom({
    players,
    bankerId: "robot",
    currentTrick: { number: 2, leaderId: "robot", plays: [] },
    trickHistory: [{
      number: 1,
      leaderId: "ally",
      winnerId: "ally",
      points: 15,
      plays: [
        { playerId: "ally", cards: [cardById(deck, "1-H-5")] },
        { playerId: "opponent-1", cards: [cardById(deck, "2-H-5")] },
        { playerId: "opponent-2", cards: [cardById(deck, "3-H-5")] },
        { playerId: "robot", cards: [cardById(deck, "1-D-5")] }
      ]
    }]
  });

  const exposure = aiTeamFiveExposure(room, aiDecisionContext(room, robot));
  assert.equal(exposure.allyRedCount, 1);
  assert.equal(exposure.opponentRedCount, 2);
  assert.equal(exposure.allyDiamondCount, 1);
  assert.equal(exposure.opponentDiamondCount, 0);
  assert.ok(aiPveTrumpLeadMemoryAdjustment(
    room,
    robot,
    [cardById(deck, "1-S-4")],
    aiDecisionContext(room, robot)
  ) < 0);
});

test("PVE banker teammates do not load points or protected fives into the bottom", () => {
  const deck = createDeck(4);
  const banker = player("banker", [], 0, "A");
  const teammate = player("teammate", [
    cardById(deck, "1-C-4"),
    cardById(deck, "2-C-4"),
    cardById(deck, "1-C-K"),
    cardById(deck, "1-D-10"),
    cardById(deck, "1-H-5"),
    cardById(deck, "1-D-5")
  ], 0, "A");
  const room = pveRoom({
    players: [banker, player("opponent-1", [], 0, "B"), teammate, player("opponent-2", [], 0, "B")],
    bankerId: banker.id,
    currentTrick: { number: 1, leaderId: banker.id, plays: [] }
  });

  const buried = new Set(autoBuryCardIds(teammate, 2, room));
  assert.deepEqual(buried, new Set(["1-C-4", "2-C-4"]));
});

test("a weak PVE idle fryer keeps points in hand instead of gambling them on the bottom", () => {
  const deck = createDeck(4);
  const banker = player("banker", [], 0, "A");
  const idle = player("idle", [
    cardById(deck, "1-C-4"),
    cardById(deck, "2-C-4"),
    cardById(deck, "1-C-K"),
    cardById(deck, "1-D-10"),
    cardById(deck, "1-H-5"),
    cardById(deck, "1-D-5")
  ], 0, "B");
  const room = pveRoom({
    players: [banker, idle, player("ally", [], 0, "A"), player("opponent-2", [], 0, "B")],
    bankerId: banker.id,
    currentTrick: { number: 1, leaderId: banker.id, plays: [] }
  });

  assert.ok(setupBottomHoldConfidence(room, idle, room.trumpSuit) < 0.2);
  const buried = new Set(autoBuryCardIds(idle, 2, room));
  assert.deepEqual(buried, new Set(["1-C-4", "2-C-4"]));
});

test("PVE default strategy enables two-trick bottom lookahead only at the endgame", () => {
  const deck = createDeck(4);
  function decision(handIds) {
    const robot = player("robot", handIds.map((id) => cardById(deck, id)), 0, "A");
    const players = [
      robot,
      player("opponent-1", handIds.map((id, index) => cardById(deck, `${index + 1}-D-${id.split("-")[2]}`)), 0, "B"),
      player("ally", handIds.map((id, index) => cardById(deck, `${index + 1}-H-${id.split("-")[2]}`)), 0, "A"),
      player("opponent-2", handIds.map((id, index) => cardById(deck, `${index + 1}-S-${id.split("-")[2]}`)), 0, "B")
    ];
    const room = pveRoom({
      players,
      bankerId: robot.id,
      currentTrick: { number: 20, leaderId: robot.id, plays: [] }
    });
    return legalAutoPlay(room, robot);
  }

  assert.equal(decision(["1-C-4", "2-C-6"]).simulationDepth, 2);
  assert.equal(decision(["1-C-4", "2-C-6", "3-C-8"]).simulationDepth, 1);
});

test("PVE bottom transfer forecast uses suit order, held bid cards, seat teams, and prior passes", () => {
  const deck = createDeck(4);
  const owner = player("owner", deck.filter((card) => {
    return card.type === "normal" && card.rank === "2" && card.suit === "S";
  }), 0, "A");
  const nextOpponent = player("next-opponent", [], 0, "B");
  const downstreamAlly = player("downstream-ally", [], 0, "A");
  const lastOpponent = player("last-opponent", [], 0, "B");
  const room = pveRoom({
    players: [owner, nextOpponent, downstreamAlly, lastOpponent],
    bankerId: owner.id,
    currentTrick: { number: 1, leaderId: owner.id, plays: [] }
  });

  function forecastFor(suit, passHistory = []) {
    const bid = { actionId: `bid-${suit}`, playerId: owner.id, count: 2, suit, cards: [] };
    room.setup.bid = bid;
    room.setup.fry = {
      lastBid: bid,
      pendingBid: null,
      history: [],
      passHistory,
      passIds: [],
      passesSinceLast: 0
    };
    return setupBottomTransferForecast(room, owner);
  }

  const diamond = forecastFor("D");
  const spade = forecastFor("S");
  assert.ok(spade.retainedProbability > diamond.retainedProbability);
  assert.ok(diamond.seats[0].canFryProbability > spade.seats[0].canFryProbability);
  assert.equal(diamond.seats[0].relation, "opponent");
  assert.equal(diamond.seats[1].relation, "ally");

  const afterPass = forecastFor("D", [{
    playerId: nextOpponent.id,
    againstCount: 1,
    againstSuit: "D",
    at: new Date(0).toISOString()
  }]);
  assert.ok(afterPass.seats[0].canFryProbability < afterPass.seats[1].canFryProbability);
  assert.ok(afterPass.seats[1].takeProbability > afterPass.seats[0].takeProbability);
});

test("神瘪三替代点数会作为比牌牌参与 PVE 翻底预测", () => {
  const deck = createDeck(4);
  const owner = player("owner", deck
    .filter((card) => card.type === "normal" && card.rank === "6" && card.suit === "S")
    .map((card) => applyShenBiesanCardRules({ ...card }, "6")), 0, "A");
  const room = pveRoom({
    players: [
      owner,
      player("next-opponent", [], 0, "B"),
      player("downstream-ally", [], 0, "A"),
      player("last-opponent", [], 0, "B")
    ],
    bankerId: owner.id,
    currentTrick: { number: 1, leaderId: owner.id, plays: [] }
  });
  room.boardHeroEffects = { replacementRank: "6" };

  function retainedProbability(suit) {
    const bid = { actionId: `bid-${suit}`, playerId: owner.id, count: 2, suit, cards: [] };
    room.setup.bid = bid;
    room.setup.fry = { lastBid: bid, pendingBid: null, history: [], passHistory: [] };
    return setupBottomTransferForecast(room, owner).retainedProbability;
  }

  assert.ok(retainedProbability("S") > retainedProbability("D"));
});
