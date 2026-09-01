import test from "node:test";
import assert from "node:assert/strict";

import { __aiPlayTesting } from "../server.js";

const {
  aiDecisionContext,
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

  function decision(bankerHand) {
    const robot = player("robot", robotHand);
    const room = baseRoom({
      players: [robot, player("banker", bankerHand), ...otherPlayers],
      currentTrick: { number: 1, leaderId: "robot", plays: [] }
    });
    room.doglegCard = cardById(deck, "1-C-A");
    return legalAutoPlay(room, robot).cards.map((card) => card.id).sort();
  }

  assert.deepEqual(decision(lowBankerHand), decision(highBankerHand));
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
  assert.deepEqual(decision.cards.map((card) => card.id), ["1-S-4"]);
  assert.equal(decision.throwPlay, false);
});
