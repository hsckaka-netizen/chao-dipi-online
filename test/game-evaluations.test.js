import test from "node:test";
import assert from "node:assert/strict";

import { buildGameEvaluations, finalScoreWinnerTeam } from "../game-evaluations.js";

function card(rank, suit = "C") {
  return { type: "normal", rank, suit };
}

test("evaluation separates opponent drags from teammate drags", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "a", score: 100 },
      { id: "b", score: 0 },
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
          { playerId: "c", cards: [card("5", "H"), card("5", "H"), card("5", "D")] },
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

  assert.equal(a.enemyDragBenefit, 5);
  assert.equal(a.teammateDraggedRedFives, 1);
  assert.equal(a.contributionValue, 5.5);
  assert.equal(b.enemyDragLoss, 0);
  assert.equal(c.enemyDragLoss, 5);
  assert.equal(c.opponentContributionValue, 5.38);
  assert.equal(b.teammateAssistPoints, 25);
  assert.equal(c.opponentPointsFed, 15);
  assert.equal(result.awards.mvpPlayerId, "a");
  assert.equal(result.awards.couchPlayerId, "b");
  assert.equal(result.awards.pitPlayerId, "c");
  assert.equal(result.awards.supportPlayerId, "b");
  assert.deepEqual(result.awards.couchPlayerIds, ["b"]);
  assert.deepEqual(result.awards.stiffPlayerIds, ["b", "c", "d"]);
  assert.deepEqual(a.tags.map((tag) => tag.label), ["MVP"]);
  assert.deepEqual(b.tags.map((tag) => tag.label), ["辅", "躺", "僵"]);
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
      points: 0,
      draggedRedFives: 1,
      draggedDiamondFives: 1
    }
  });

  assert.equal(result.byPlayerId["idle-winner"].enemyDragBenefit, 6);
  assert.equal(result.byPlayerId["idle-winner"].bottomDragBenefit, 6);
  assert.equal(result.byPlayerId.banker.enemyDragLoss, 6);
  assert.equal(result.byPlayerId.banker.bottomDragLoss, 6);
  assert.equal(result.byPlayerId["idle-winner"].mvpValue, 9);
  assert.equal(result.byPlayerId.banker.opponentContributionValue, 7);
  assert.equal(result.awards.mvpPlayerId, "idle-winner");
  assert.equal(result.awards.pitPlayerId, "banker");
});

test("banker bottom contribution includes denied doubled bottom points", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "idle", score: 0 },
      { id: "banker", score: 0 }
    ],
    bankerTeamIds: ["banker"],
    winnerTeam: "banker",
    tricks: [],
    bottom: {
      winnerId: "banker",
      winnerTeam: "banker",
      bankerId: "banker",
      points: 80,
      draggedRedFives: 0,
      draggedDiamondFives: 0
    }
  });

  assert.equal(result.byPlayerId.banker.bottomPointValue, 4);
  assert.equal(result.byPlayerId.banker.contributionValue, 5);
  assert.equal(result.awards.mvpPlayerId, "banker");
});

test("evaluation awards stiffest, thunder, and precision labels", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "a", score: 400 },
      { id: "b", score: 0 },
      { id: "c", score: 0 },
      { id: "d", score: 0 }
    ],
    bankerTeamIds: ["c", "d"],
    winnerTeam: "idle",
    provisionalWinnerPlayerIds: ["a", "c"],
    finalSideSuitBottomWinnerId: "a",
    tricks: [
      {
        leaderId: "c",
        winnerId: "a",
        plays: [
          { playerId: "c", cards: [card("4")] },
          { playerId: "d", cards: [card("4")] },
          { playerId: "a", cards: [card("A")] },
          { playerId: "b", cards: [card("5", "H"), card("5", "H")] }
        ]
      }
    ]
  });

  assert.equal(result.byPlayerId.a.teammateDragHarmValue, 4);
  assert.equal(result.byPlayerId.a.thunderValue, 4);
  assert.equal(result.byPlayerId.a.wasProvisionalWinner, true);
  assert.equal(result.byPlayerId.b.wasProvisionalWinner, false);
  assert.deepEqual(result.awards.stiffestPlayerIds, ["b", "d"]);
  assert.deepEqual(result.awards.thunderPlayerIds, ["a"]);
  assert.equal(result.awards.precisionPlayerId, "a");
  assert.deepEqual(result.byPlayerId.a.tags.map((tag) => tag.label), ["MVP", "雷", "精"]);
  assert.deepEqual(result.byPlayerId.b.tags.map((tag) => tag.label), ["辅", "躺", "僵", "僵中僵"]);
});

test("final score winner follows the settled game score sign", () => {
  assert.equal(finalScoreWinnerTeam(1.5), "idle");
  assert.equal(finalScoreWinnerTeam(-0.5), "banker");
  assert.equal(finalScoreWinnerTeam(0), null);
});

test("every non-positive contributor on the winning side receives couch", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "a", score: 0 },
      { id: "b", score: 0 },
      { id: "c", score: 0 }
    ],
    bankerTeamIds: ["c"],
    winnerTeam: "idle",
    tricks: []
  });

  assert.deepEqual(result.awards.couchPlayerIds, ["a", "b"]);
  assert.ok(result.byPlayerId.a.tags.some((tag) => tag.label === "躺"));
  assert.ok(result.byPlayerId.b.tags.some((tag) => tag.label === "躺"));
});

test("god, heaven, pit, and god-pit titles can stack", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "a", score: 320 },
      { id: "b", score: 0 },
      { id: "c", score: 0 },
      { id: "d", score: 0 }
    ],
    bankerTeamIds: ["c", "d"],
    winnerTeam: "idle",
    tricks: [{
      leaderId: "a",
      winnerId: "a",
      plays: [
        { playerId: "a", cards: [card("A")] },
        { playerId: "b", cards: [card("4")] },
        { playerId: "c", cards: Array.from({ length: 6 }, () => card("5", "H")) },
        { playerId: "d", cards: [card("4")] }
      ]
    }],
    bottom: {
      winnerId: "a",
      winnerTeam: "idle",
      bankerId: "c",
      points: 40,
      draggedRedFives: 0,
      draggedDiamondFives: 0
    }
  });

  assert.equal(result.byPlayerId.a.contributionValue, 21);
  assert.equal(result.byPlayerId.c.opponentContributionValue, 15.75);
  assert.deepEqual(result.awards.godPlayerIds, ["a"]);
  assert.deepEqual(result.awards.heavenPlayerIds, ["a"]);
  assert.equal(result.awards.pitPlayerId, "c");
  assert.deepEqual(result.awards.godPitPlayerIds, ["c"]);
  assert.deepEqual(result.byPlayerId.a.tags.map((tag) => tag.label), ["MVP", "神", "天之上"]);
  assert.deepEqual(result.byPlayerId.c.tags.map((tag) => tag.label), ["坑", "僵", "神坑"]);
});

test("a losing global contribution leader receives both exhausted and pillar titles", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "a", score: 400 },
      { id: "b", score: 0 },
      { id: "c", score: 600 },
      { id: "d", score: 0 }
    ],
    bankerTeamIds: ["c", "d"],
    winnerTeam: "idle",
    tricks: []
  });

  assert.equal(result.byPlayerId.c.contributionValue, 15);
  assert.equal(result.awards.exhaustedPlayerId, "c");
  assert.equal(result.awards.pillarPlayerId, "c");
  assert.deepEqual(result.byPlayerId.c.tags.map((tag) => tag.label), ["僵", "神", "尽", "擎"]);
});

test("thunder subtracts opponent five gains from teammate five harm", () => {
  const result = buildGameEvaluations({
    players: [
      { id: "a", score: 0 },
      { id: "b", score: 0 },
      { id: "c", score: 0 }
    ],
    bankerTeamIds: ["c"],
    winnerTeam: "idle",
    tricks: [{
      leaderId: "a",
      winnerId: "a",
      plays: [
        { playerId: "a", cards: [card("A")] },
        { playerId: "b", cards: [card("5", "H"), card("5", "H"), card("5", "H")] },
        { playerId: "c", cards: [card("5", "H")] }
      ]
    }]
  });

  assert.equal(result.byPlayerId.a.teammateDragHarmValue, 6);
  assert.equal(result.byPlayerId.a.enemyDragBenefit, 2);
  assert.equal(result.byPlayerId.a.thunderValue, 4);
  assert.deepEqual(result.awards.thunderPlayerIds, ["a"]);
});
