import test from "node:test";
import assert from "node:assert/strict";

import { createSeededRandom } from "../ai-random.js";
import { __aiPlayTesting } from "../server.js";

const {
  AI_STRATEGY_FIXED_TEAM,
  AI_STRATEGY_HEURISTIC,
  AI_STRATEGY_SAFE_FIVE,
  aiDecisionContext,
  aiSampleHiddenHands,
  aiSafeThrowPlans,
  createDeck,
  legalAutoPlay
} = __aiPlayTesting;

function cardById(deck, id) {
  const card = deck.find((item) => item.id === id);
  assert.ok(card, `missing test card ${id}`);
  return card;
}

function player(id, hand = [], score = 0) {
  return { id, name: id, hand, score, test: true };
}

function baseRoom({ players, currentTrick, trickHistory = [], bankerId = "banker", doglegPlayerIds = [] }) {
  return {
    id: "ai-test-room",
    status: "dealt",
    stage: "playing",
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
