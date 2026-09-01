import test from "node:test";
import assert from "node:assert/strict";

import {
  aiKnowsPlayerVoid,
  aiPublicPlayerStats,
  buildAiPublicKnowledge
} from "../ai-public-knowledge.js";

function card(id, route, points = 0, protectedFive = false) {
  return { id, route, points, protectedFive };
}

const routeOfCard = (item) => item.route;
const pointsOfCards = (cards) => cards.reduce((total, item) => total + item.points, 0);
const isProtectedFive = (item) => item.protectedFive;

test("AI public memory records exhausted routes from forced follow plays", () => {
  const knowledge = buildAiPublicKnowledge({
    playerIds: ["a", "b", "c"],
    trickHistory: [{
      winnerId: "a",
      points: 15,
      plays: [
        { playerId: "a", cards: [card("a-h-1", "H"), card("a-h-2", "H")] },
        { playerId: "b", cards: [card("b-h-1", "H"), card("b-c-1", "C", 10)] },
        { playerId: "c", cards: [card("c-h-1", "H"), card("c-h-2", "H", 5, true)] }
      ]
    }],
    trumpSuit: "S",
    routeOfCard,
    pointsOfCards,
    isProtectedFive
  });

  assert.equal(aiKnowsPlayerVoid(knowledge, "b", "H"), true);
  assert.equal(aiKnowsPlayerVoid(knowledge, "c", "H"), false);
  assert.equal(knowledge.seenCardIds.size, 6);
  assert.deepEqual(aiPublicPlayerStats(knowledge, "a"), {
    cardsPlayed: 2,
    pointsPlayed: 0,
    protectedFivesPlayed: 0,
    tricksWon: 1,
    pointsCaptured: 15,
    leads: 1
  });
  assert.equal(aiPublicPlayerStats(knowledge, "c").protectedFivesPlayed, 1);
});

test("an unfinished current trick contributes public cards but not a completed win", () => {
  const knowledge = buildAiPublicKnowledge({
    playerIds: ["a", "b", "c"],
    currentTrick: {
      winnerId: "a",
      points: 10,
      plays: [
        { playerId: "a", cards: [card("a-s", "S")] },
        { playerId: "b", cards: [card("b-d", "D", 10)] }
      ]
    },
    trumpSuit: "H",
    routeOfCard,
    pointsOfCards,
    isProtectedFive
  });

  assert.equal(aiKnowsPlayerVoid(knowledge, "b", "S"), true);
  assert.equal(aiPublicPlayerStats(knowledge, "a").tricksWon, 0);
  assert.equal(knowledge.seenCardIds.size, 2);
});
