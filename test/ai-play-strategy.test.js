import test from "node:test";
import { readFileSync } from "node:fs";
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

test("PVE default strategy bounds small-hand lookahead and preserves the explicit baseline option", () => {
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

function reviewThrow(cards, sizes) {
  let offset = 0;
  return sizes.map((count) => {
    const group = cards.slice(offset, offset += count);
    return {
      cards: group,
      count,
      pattern: count === 1 ? { type: "single", count } : { type: "multi", count, width: count },
      signature: count === 1 ? "single:1:1:1" : `multi:${count}:1:${count}`
    };
  });
}

test("PVE follow candidates can ruff a pair plus singles or a triple plus a single", () => {
  const deck = createDeck(4);
  for (const fixture of [
    { lead: ["1-D-K", "2-D-K", "1-D-9", "1-D-8"], sizes: [2, 1, 1], main: ["1-S-K", "1-S-Q", "2-S-Q", "1-S-4"] },
    { lead: ["1-D-K", "1-D-J", "2-D-J", "3-D-J"], sizes: [1, 3], main: ["1-S-K", "2-S-K", "3-S-K", "1-S-J"] },
    { lead: ["1-D-K", "2-D-K", "1-D-9", "2-D-9"], sizes: [2, 2], main: ["1-S-K", "2-S-K", "1-S-Q", "2-S-Q"] }
  ]) {
    const leadCards = fixture.lead.map((id) => cardById(deck, id));
    const robot = player("robot", [...fixture.main, "1-C-A", "1-H-A"].map((id) => cardById(deck, id)), 0, "b");
    const room = pveRoom({
      players: [player("banker", [], 0, "a"), robot, player("ally", [], 0, "b"), player("opponent", [], 0, "a")],
      currentTrick: { number: 4, leaderId: "banker", plays: [{ playerId: "banker", cards: leadCards, throwPlay: true, throwComponents: reviewThrow(leadCards, fixture.sizes) }] }
    });
    const info = __aiPlayTesting.leadInfo(room.currentTrick, room.trumpSuit);
    const winning = __aiPlayTesting.currentWinningState(room);
    const responses = __aiPlayTesting.legalFollowCandidates(room, robot, info);
    assert.ok(responses.some((cards) => __aiPlayTesting.candidateBeatsCurrent(room, info, cards, winning).beats));
    assert.ok(responses.every((cards) => new Set(cards.map((card) => card.id)).size === cards.length));
    robot.hand.push(cardById(deck, "1-D-4"));
    const mustFollow = __aiPlayTesting.legalFollowCandidates(room, robot, info);
    assert.ok(mustFollow.every((cards) => cards.some((card) => card.id === "1-D-4")), "partial void still follows the remaining side card");
  }
});

test("PVE lead control keeps long tractors when opponents cannot match their trump shape", () => {
  const deck = createDeck(4);
  const hand = ["1-C-A", "2-C-A", "1-C-K", "2-C-K", "1-C-Q", "2-C-Q", "1-C-J", "2-C-J"].map((id) => cardById(deck, id));
  const robot = player("robot", hand, 0, "a");
  const room = pveRoom({
    bankerId: "robot",
    players: [robot, player("enemy", [], 0, "b"), player("ally", [], 0, "a"), player("other", [], 0, "b")],
    currentTrick: { number: 2, leaderId: "robot", plays: [] }
  });
  const context = aiDecisionContext(room, robot);
  context.knowledge.voidRoutesByPlayerId.get("enemy").add("C");
  const smallMain = ["1-S-K", "1-S-Q", "1-S-J", "1-S-10", "1-S-9", "1-S-8", "1-S-7", "1-S-6"].map((id) => cardById(deck, id));
  context.pveLeadWorlds = [{ hands: new Map([["enemy", smallMain], ["ally", []], ["other", []]]) }];
  assert.equal(__aiPlayTesting.aiPveLeadControlAdjustment(room, robot, hand, context), 0);
  const smallThrow = [hand[0], hand[2]];
  assert.ok(__aiPlayTesting.aiPveLeadControlAdjustment(room, robot, smallThrow, context, reviewThrow(smallThrow, [1, 1])) < 0);
  context.pveLeadWorlds[0].hands.set("enemy", ["1-S-K", "2-S-K", "1-S-Q", "2-S-Q", "1-S-J", "2-S-J", "1-S-10", "2-S-10"].map((id) => cardById(deck, id)));
  assert.ok(__aiPlayTesting.aiPveLeadControlAdjustment(room, robot, hand, context) < 0, "a matching long trump tractor remains a threat");
});

test("PVE transfer evaluation accounts for an opponent acting after the receiving teammate", () => {
  const deck = createDeck(4);
  const robot = player("robot", [cardById(deck, "1-C-A")], 0, "a");
  const room = pveRoom({ bankerId: "robot", players: [robot, player("enemy", [], 0, "b"), player("ally", [], 0, "a"), player("last", [], 0, "b")], currentTrick: { number: 2, leaderId: "robot", plays: [] } });
  const context = aiDecisionContext(room, robot);
  context.knowledge.voidRoutesByPlayerId.get("ally").add("C");
  context.pveLeadWorlds = [{ hands: new Map([["enemy", [cardById(deck, "1-S-4")]], ["ally", [cardById(deck, "1-D-5")]], ["last", []]]) }];
  assert.ok(__aiPlayTesting.aiPveLeadControlAdjustment(room, robot, robot.hand, context) > 0);
  context.pveLeadWorlds[0].hands.set("last", [cardById(deck, "1-H-5")]);
  assert.ok(__aiPlayTesting.aiPveLeadControlAdjustment(room, robot, robot.hand, context) < 0);
});

test("PVE lead risk does not read real hidden hands or bottom cards", () => {
  const deck = createDeck(4);
  const robot = player("robot", ["1-C-A", "1-C-K"].map((id) => cardById(deck, id)), 0, "a");
  const room = pveRoom({ bankerId: "robot", players: [robot, player("enemy", [cardById(deck, "1-H-5")], 0, "b"), player("ally", [cardById(deck, "1-D-5")], 0, "a"), player("last", [cardById(deck, "1-JOKER-BIG")], 0, "b")], currentTrick: { number: 2, leaderId: "robot", plays: [] }, trickHistory: [{ number: 1, leaderId: "robot", winnerId: "enemy", points: 0, plays: [{ playerId: "robot", cards: [cardById(deck, "1-C-4")] }, { playerId: "enemy", cards: [cardById(deck, "1-S-4")] }] }] });
  function risk() { return __aiPlayTesting.aiPveLeadControlAdjustment(room, robot, robot.hand, aiDecisionContext(room, robot), reviewThrow(robot.hand, [1, 1])); }
  const first = risk();
  room.players[1].hand = [cardById(deck, "1-D-4")];
  room.players[2].hand = [cardById(deck, "1-C-9")];
  room.kitty = [cardById(deck, "2-H-5")];
  assert.equal(risk(), first);
  room.gameMode = "pvp";
  assert.equal(risk(), 0);
});


test("PVE uses another controlling route instead of the recorded small throw into known voids", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/pve-known-void-small-throw.json", import.meta.url), "utf8"));
  const deck = createDeck(4);
  const players = fixture.players.map((entry) => player(entry.id, entry.handIds.map((id) => cardById(deck, id)), 0, entry.squad));
  const trickHistory = fixture.trickHistory.map((trick) => ({ ...trick, plays: trick.plays.map((play) => ({ playerId: play.playerId, cards: play.cardIds.map((id) => cardById(deck, id)) })) }));
  for (const trick of trickHistory) players.find((p) => p.id === trick.winnerId).score += trick.points;
  const room = pveRoom({ players, bankerId: fixture.bankerId, trickHistory, currentTrick: { number: 8, leaderId: fixture.leaderId, plays: [] } });
  room.trumpSuit = fixture.trumpSuit;
  const robot = players.find((p) => p.id === fixture.leaderId);
  const decision = legalAutoPlay(room, robot);
  assert.notEqual(__aiPlayTesting.playSuit(decision.cards[0], room.trumpSuit), "D");
});

test("PVE discards the whole weak pair instead of a strong single plus half the pair", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/pve-discard-keep-strong-single.json", import.meta.url), "utf8"));
  const deck = createDeck(4);
  function expand(play) {
    return { playerId: play.playerId, cards: play.cardIds.map((id) => cardById(deck, id)), throwPlay: Boolean(play.throwComponents.length), throwComponents: play.throwComponents.map((component) => ({ ...component, cards: component.cardIds.map((id) => cardById(deck, id)) })) };
  }
  const players = fixture.players.map((entry) => player(entry.id, entry.handIds.map((id) => cardById(deck, id)), 0, entry.squad));
  const trickHistory = fixture.trickHistory.map((trick) => ({ ...trick, plays: trick.plays.map(expand) }));
  for (const trick of trickHistory) players.find((p) => p.id === trick.winnerId).score += trick.points;
  const room = pveRoom({ players, bankerId: fixture.bankerId, trickHistory, currentTrick: { ...fixture.currentTrick, plays: fixture.currentTrick.plays.map(expand) } });
  room.trumpSuit = fixture.trumpSuit;
  const robot = players.find((p) => p.id === fixture.actorId);
  const decision = legalAutoPlay(room, robot);
  assert.equal(decision.cards.filter((card) => card.suit === "S" && card.rank === "6").length, 2);
  assert.ok(!decision.cards.some((card) => card.joker === "small"));
  assert.equal(decision.cards.filter((card) => card.suit === "D").length, 3, "all three remaining diamonds must still be followed");
  assert.equal(decision.cards.length, 6);
});

function opportunityRoom() {
  const deck = createDeck(4);
  const robot = player("robot", ["1-S-A", "1-S-K", "1-S-Q", "1-S-J", "1-S-9", "1-S-8", "1-S-7", "1-H-5", "1-C-8", "1-C-9", "1-D-8", "1-D-9"].map((id) => cardById(deck, id)), 0, "A");
  const peers = [player("opponent-1", [], 0, "B"), player("ally", [], 0, "A"), player("opponent-2", [], 0, "B")];
  const ownIds = new Set(robot.hand.map((card) => card.id));
  const pool = deck.filter((card) => !ownIds.has(card.id));
  peers.forEach((target, index) => { target.hand = pool.slice(index * 12, index * 12 + 12); });
  return { deck, robot, room: pveRoom({ players: [robot, ...peers], bankerId: robot.id,
    currentTrick: { number: 12, leaderId: robot.id, plays: [] } }) };
}

function losingTrumpHistory(deck) {
  // An unmatched trump cannot beat this side pair; this is a discard, not a winning ruff.
  return { number: 11, leaderId: "ally", winnerId: "ally", plays: [
    { playerId: "ally", cards: [cardById(deck, "2-C-A"), cardById(deck, "3-C-A")] },
    { playerId: "opponent-1", cards: [cardById(deck, "2-S-9"), cardById(deck, "2-S-8")] }
  ] };
}

test("losing off-suit trump activates PVE opportunity planning above eight cards without asserting other voids", () => {
  const { deck, room, robot } = opportunityRoom();
  const before = __aiPlayTesting.aiPveOpportunityContext(room, robot, aiDecisionContext(room, robot));
  assert.equal(before.active, false);
  room.trickHistory = [losingTrumpHistory(deck)];
  const context = aiDecisionContext(room, robot);
  const signal = __aiPlayTesting.aiPveOpportunityContext(room, robot, context);
  assert.equal(signal.active, true);
  assert.equal(signal.suspectedAllTrump, true);
  assert.ok(signal.beliefs.get("opponent-1") >= 0.7 && signal.beliefs.get("opponent-1") < 1);
  assert.deepEqual([...context.knowledge.voidRoutesByPlayerId.get("opponent-1")], ["C"]);
  const decision = legalAutoPlay(room, robot);
  assert.equal(decision.opportunityPlanning, true);
  assert.equal(decision.simulationDepth, 2);
  assert.equal(legalAutoPlay(room, robot, { pveOpportunityPlanning: false }).opportunityPlanning, undefined);
});

test("winning ruffs and later side-card disclosures do not become hard all-trump assumptions", () => {
  const { deck, room, robot } = opportunityRoom();
  room.trickHistory = [{ number: 10, leaderId: "ally", winnerId: "opponent-1", plays: [
    { playerId: "ally", cards: [cardById(deck, "2-C-A")] },
    { playerId: "opponent-1", cards: [cardById(deck, "2-S-9")] }
  ] }];
  let signal = __aiPlayTesting.aiPveOpportunityContext(room, robot, aiDecisionContext(room, robot));
  assert.equal(signal.suspectedAllTrump, false);
  room.trickHistory.push(losingTrumpHistory(deck));
  room.trickHistory.push({ number: 12, leaderId: "opponent-1", plays: [
    { playerId: "opponent-1", cards: [cardById(deck, "2-D-A")] }
  ] });
  signal = __aiPlayTesting.aiPveOpportunityContext(room, robot, aiDecisionContext(room, robot));
  assert.equal(signal.beliefs.get("opponent-1"), 0);
});

test("a shortage of trump triggers planning early, independent of actual hidden hands and kitty", () => {
  const { deck, room, robot } = opportunityRoom();
  robot.hand = deck.filter((card) => __aiPlayTesting.playSuit(card, "S") !== "TRUMP").slice(0, 16);
  room.players.slice(1).forEach((target) => { target.hand = deck.slice(0, 16); });
  const first = legalAutoPlay(room, robot);
  assert.equal(first.opportunitySignals.shortTrump, true);
  room.players.slice(1).forEach((target) => { target.hand = deck.slice(-16); });
  Object.defineProperty(room, "kitty", { enumerable: false, get() { throw new Error("real hidden kitty read"); } });
  const second = legalAutoPlay(room, robot);
  assert.deepEqual(second.cards.map((card) => card.id), first.cards.map((card) => card.id));
  assert.equal(second.selectedScoreAdvantage, first.selectedScoreAdvantage);
});

test("all-trump sampling is a mixture, retaining public voids and a possible side-card branch", () => {
  const { deck, room, robot } = opportunityRoom();
  room.trickHistory = [losingTrumpHistory(deck)];
  const context = aiDecisionContext(room, robot);
  context.pveOpportunity = __aiPlayTesting.aiPveOpportunityContext(room, robot, context);
  const random = createSeededRandom("all-trump-mixture");
  let allTrump = 0, sideCards = 0;
  for (let i = 0; i < 80; i += 1) {
    const world = aiSampleHiddenHands(room, robot, context, random);
    assert.ok(world);
    const hand = world.hands.get("opponent-1");
    assert.equal(hand.length, 12);
    assert.ok(hand.every((card) => __aiPlayTesting.playSuit(card, "S") !== "C"));
    if (hand.every((card) => __aiPlayTesting.playSuit(card, "S") === "TRUMP")) allTrump += 1;
    else sideCards += 1;
  }
  assert.ok(allTrump > 40 && sideCards > 0);
});

test("terminal opportunity value uses actual bottom points and doubled bottom five loss", () => {
  const { deck, room, robot } = opportunityRoom();
  room.players.forEach((target) => { target.hand = []; });
  const context = aiDecisionContext(room, robot);
  const outcome = { winnerId: "opponent-1", points: 0 };
  const losses = { own: 0, ally: 0, opponent: 0 };
  room.kitty = [];
  const empty = __aiPlayTesting.aiPveForecastValue(room, context, outcome, losses);
  room.kitty = [cardById(deck, "1-H-5"), cardById(deck, "1-C-K"), cardById(deck, "1-D-K"), cardById(deck, "1-H-K")];
  const loaded = __aiPlayTesting.aiPveForecastValue(room, context, outcome, losses);
  assert.ok(loaded < empty - 280, "losing a loaded bottom must cost more than losing an empty bottom");
  assert.equal(__aiPlayTesting.aiPveForecastValue(room, context, { winnerId: "robot", points: 0 }, losses),
    (() => { room.kitty = []; return __aiPlayTesting.aiPveForecastValue(room, context, { winnerId: "robot", points: 0 }, losses); })());
});

test("recorded nine-card all-trump hand considers keeping the top pair instead of spending it to run red five", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/pve-bottom-save-control.json", import.meta.url), "utf8"));
  const deck = createDeck(4);
  const players = fixture.players.map((entry) => player(entry.id,
    entry.handIds ? entry.handIds.map((id) => cardById(deck, id)) : deck.slice(0, entry.handCount), entry.score, entry.squad));
  const trickHistory = fixture.trickHistory.map((trick) => ({ ...trick, plays: trick.plays.map((play) => ({
    playerId: play.playerId, cards: play.cardIds.map((id) => cardById(deck, id)),
    throwPlay: Boolean(play.throwComponents),
    throwComponents: play.throwComponents?.map((component) => ({ ...component, cards: component.cardIds.map((id) => cardById(deck, id)) }))
  })) }));
  const room = pveRoom({ players, bankerId: fixture.bankerId, trickHistory,
    currentTrick: { number: 16, leaderId: fixture.actorId, plays: [] } });
  room.trumpSuit = fixture.trumpSuit;
  const robot = players.find((target) => target.id === fixture.actorId);
  const old = legalAutoPlay(room, robot, { pveOpportunityPlanning: false });
  assert.equal(old.cards.filter((card) => card.suit === "S" && card.rank === "3").length, 2);
  assert.ok(old.cards.some((card) => card.suit === "H" && card.rank === "5"));
  const revised = legalAutoPlay(room, robot);
  assert.equal(revised.opportunitySignals.ownAllTrump, true);
  assert.equal(revised.cards.filter((card) => card.suit === "S" && card.rank === "3").length, 0);
});

test("a weak all-trump hand runs its red five while it still has the lead", () => {
  const deck = createDeck(4);
  const robot = player("robot", ["1-H-5", "1-S-4", "1-S-6"].map((id) => cardById(deck, id)), 0, "A");
  const room = pveRoom({ players: [robot,
    player("opponent-1", ["2-S-A", "3-S-A", "4-S-A"].map((id) => cardById(deck, id)), 0, "B"),
    player("ally", ["2-S-4", "2-S-6", "2-S-7"].map((id) => cardById(deck, id)), 0, "A"),
    player("opponent-2", ["2-S-K", "3-S-K", "4-S-K"].map((id) => cardById(deck, id)), 0, "B")
  ], bankerId: robot.id, currentTrick: { number: 20, leaderId: robot.id, plays: [] } });
  const decision = legalAutoPlay(room, robot);
  assert.deepEqual(decision.cards.map((card) => card.id), ["1-H-5"]);
});
