import test from "node:test";
import assert from "node:assert/strict";

import { buildGameEvaluations } from "../game-evaluations.js";

function card(rank, suit = "C") {
  return { type: "normal", rank, suit };
}

test("evaluation separates opponent drags from teammate drags", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "a", score: 100 },
      { id: "b", score: 20 },
      { id: "c", score: 0 },
      { id: "d", score: 0 }
    ],
    bankerTeamIds: ["c", "d"],
    winnerTeam: "idle",
    tricks: [
      {
        leaderId: "a",
        winnerId: "a",
        plays: [
          { playerId: "a", cards: [card("A")] },
          { playerId: "b", cards: [card("10"), card("K")] },
          { playerId: "c", cards: [card("5", "H"), card("5", "D")] },
          { playerId: "d", cards: [card("10")] }
        ]
      },
      {
        leaderId: "a",
        winnerId: "a",
        plays: [
          { playerId: "a", cards: [card("A")] },
          { playerId: "b", cards: [card("5", "H")] },
          { playerId: "c", cards: [card("4")] },
          { playerId: "d", cards: [card("4")] }
        ]
      }
    ]
  });

  const a = result.byPlayerId.a;
  const b = result.byPlayerId.b;
  const c = result.byPlayerId.c;

  assert.equal(a.enemyDragBenefit, 3);
  assert.equal(a.teammateDraggedRedFives, 1);
  assert.equal(b.enemyDragLoss, 0);
  assert.equal(c.enemyDragLoss, 3);
  assert.equal(b.teammateAssistPoints, 25);
  assert.equal(c.opponentPointsFed, 10);
  assert.equal(result.awards.mvpPlayerId, "a");
  assert.equal(result.awards.couchPlayerId, "b");
  assert.equal(result.awards.pitPlayerId, "c");
  assert.equal(result.awards.supportPlayerId, "b");
  assert.deepEqual(result.awards.stiffPlayerIds, ["b", "c", "d"]);
  assert.deepEqual(a.tags.map((tag) => tag.label), ["MVP"]);
  assert.deepEqual(b.tags.map((tag) => tag.label), ["躺", "辅", "僵"]);
  assert.deepEqual(c.tags.map((tag) => tag.label), ["坑", "僵"]);
});

test("bottom dragged fives count as doubled opponent benefit and loss", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "idle-winner", score: 80 },
      { id: "idle-other", score: 10 },
      { id: "banker", score: 0 }
    ],
    bankerTeamIds: ["banker"],
    winnerTeam: "idle",
    tricks: [],
    bottom: {
      winnerId: "idle-winner",
      winnerTeam: "idle",
      bankerId: "banker",
      draggedRedFives: 1,
      draggedDiamondFives: 1
    }
  });

  assert.equal(result.byPlayerId["idle-winner"].enemyDragBenefit, 6);
  assert.equal(result.byPlayerId["idle-winner"].bottomDragBenefit, 6);
  assert.equal(result.byPlayerId.banker.enemyDragLoss, 6);
  assert.equal(result.byPlayerId.banker.bottomDragLoss, 6);
  assert.equal(result.byPlayerId["idle-winner"].mvpValue, 320);
  assert.equal(result.awards.mvpPlayerId, "idle-winner");
  assert.equal(result.awards.pitPlayerId, "banker");
});
