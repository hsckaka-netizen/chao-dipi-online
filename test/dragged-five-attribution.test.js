import test from "node:test";
import assert from "node:assert/strict";

import { draggedTeammateFiveSummary, forcedProtectedFiveIds, teammateProtectedFiveCounts } from "../dragged-five-attribution.js";

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


test("Haohao reduction weights final teammate hearts by two and diamonds by one", () => {
  const tricks = [{
    leaderId: "haohao",
    winnerId: "haohao",
    plays: [
      { playerId: "haohao", cards: [card("own-five", "5", "H")] },
      { playerId: "future-dogleg", cards: [card("ally-red", "5", "H"), card("ally-diamond", "5", "D"), card("ally-black", "5", "S")] },
      { playerId: "idle", cards: [card("enemy-red", "5", "H")] }
    ]
  }];
  assert.deepEqual(draggedTeammateFiveSummary(tricks, "haohao", ["haohao", "future-dogleg"]), {
    redFives: 1, diamondFives: 1, count: 2, penalty: 3
  });
  assert.equal(draggedTeammateFiveSummary(tricks, "haohao", ["haohao"]).penalty, 0);
});

test("Haohao reduction follows forced drag attribution and excludes another actor's drags", () => {
  const tricks = [{
    leaderId: "haohao",
    winnerId: "idle",
    plays: [
      { playerId: "haohao", cards: [card("own-red", "5", "H")], forcedProtectedFiveIds: ["own-red"] },
      { playerId: "ally", cards: [card("forced-red", "5", "H"), card("voluntary-diamond", "5", "D")], forcedProtectedFiveIds: ["forced-red"] },
      { playerId: "idle", cards: [card("winner-diamond", "5", "D")], forcedProtectedFiveIds: ["winner-diamond"] }
    ]
  }];
  assert.deepEqual(draggedTeammateFiveSummary(tricks, "haohao", ["haohao", "ally"]), {
    redFives: 1, diamondFives: 0, count: 1, penalty: 2
  });
  assert.equal(draggedTeammateFiveSummary([], "haohao", ["haohao", "ally"]).penalty, 0);
});
