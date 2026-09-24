import test from "node:test";
import assert from "node:assert/strict";

import { forcedProtectedFiveIds, teammateProtectedFiveCounts } from "../dragged-five-attribution.js";

function card(id, rank, suit) {
  return { id, type: "normal", rank, suit };
}

test("a protected five is voluntary when another legal same-suit card can replace it", () => {
  const diamondFive = card("diamond-five", "5", "D");
  const spareTrump = card("spare-trump", "2", "C");
  assert.deepEqual(forcedProtectedFiveIds({
    hand: [diamondFive, spareTrump],
    selected: [diamondFive],
    leadCards: [card("lead-trump", "2", "S")]
  }), []);
});

test("a protected five is forced when the follow count cannot be met without it", () => {
  const diamondFive = card("diamond-five", "5", "D");
  assert.deepEqual(forcedProtectedFiveIds({
    hand: [diamondFive],
    selected: [diamondFive],
    leadCards: [card("lead-trump", "2", "S")]
  }), ["diamond-five"]);
});

test("only the lower protected five is forced when one of two fives can be preserved", () => {
  const diamondFive = card("diamond-five", "5", "D");
  const redFive = card("red-five", "5", "H");
  const spareTrump = card("spare-trump", "2", "C");
  assert.deepEqual(forcedProtectedFiveIds({
    hand: [diamondFive, redFive, spareTrump],
    selected: [diamondFive, redFive],
    leadCards: [
      card("lead-trump-1", "2", "S"),
      card("lead-trump-2", "2", "S")
    ]
  }), ["diamond-five"]);
});

test("teammate protection applies only when the final teammate drag actor activated the skill", () => {
  const result = teammateProtectedFiveCounts([{
    leaderId: "banker",
    winnerId: "banker",
    plays: [
      { playerId: "banker", cards: [card("banker-ace", "A", "H")] },
      { playerId: "future-dogleg", cards: [card("ally-red", "5", "H")] },
      { playerId: "idle", cards: [card("enemy-diamond", "5", "D")] }
    ]
  }, {
    leaderId: "future-dogleg",
    winnerId: "future-dogleg",
    plays: [
      { playerId: "future-dogleg", cards: [card("dogleg-ace", "A", "D")] },
      { playerId: "banker", cards: [card("ally-diamond", "5", "D")] },
      { playerId: "idle", cards: [card("idle-four", "4", "D")] }
    ]
  }], {
    banker: "banker",
    "future-dogleg": "banker",
    idle: "idle"
  }, ["banker"]);

  assert.deepEqual(result, {
    redFives: 1,
    diamondFives: 0,
    byPlayerId: {
      "future-dogleg": { redFives: 1, diamondFives: 0 }
    }
  });
});
