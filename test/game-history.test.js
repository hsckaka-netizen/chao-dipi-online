import test from "node:test";
import assert from "node:assert/strict";

import { buildGameRecord, gameHistoryStatus, queueGameRecord } from "../game-history.js";

function settledRoom() {
  return {
    id: "ABC123",
    gameRecordId: "5a3692ab-35fb-4890-a7bf-3cebe8758916",
    startedAt: "2026-07-20T10:00:00.000Z",
    callMode: "score",
    trumpSuit: "H",
    bankerId: "room-banker",
    doglegPlayerIds: ["room-dogleg"],
    doglegCard: { type: "normal", suit: "C", rank: "A" },
    removedCards: [{ type: "normal", suit: "D", rank: "4" }],
    setup: { currentTrumpSuit: "H" },
    settledTrickHistory: [
      {
        number: 1,
        winnerId: "room-idle",
        points: 10,
        plays: []
      }
    ],
    trickHistory: [],
    players: [
      {
        id: "room-banker",
        profileId: "player-benlei",
        name: "奔雷",
        avatarUrl: "/assets/avatars/benlei.png",
        test: false
      },
      {
        id: "room-dogleg",
        profileId: "player-biesan",
        name: "瘪三",
        avatarUrl: "/assets/avatars/biesan.png",
        test: false
      },
      {
        id: "room-idle",
        profileId: "player-chenran",
        name: "陈然",
        avatarUrl: "/assets/avatars/chenran.png",
        test: false
      },
      {
        id: "room-ai",
        profileId: null,
        name: "测试（AI）",
        avatarUrl: "",
        test: true
      }
    ],
    result: {
      finishedAt: "2026-07-20T11:00:00.000Z",
      playerCount: 4,
      callMode: "score",
      callModeName: "叫分抢庄",
      bankerBidScore: 240,
      totalGamePoints: 400,
      threshold: 160,
      idleScore: 200,
      scoreDiff: 40,
      winnerTeam: "idle",
      bottomWinnerId: "room-idle",
      bottomWinnerTeam: "idle",
      bottomPoints: 10,
      bottomCards: [{ type: "normal", suit: "H", rank: "10" }],
      playerResults: [
        {
          playerId: "room-banker",
          name: "奔雷",
          role: "庄家",
          team: "banker",
          trickScore: 0,
          gameScore: -4.5,
          draggedRedFives: 1,
          draggedDiamondFives: 0,
          throwFailures: 0,
          evaluation: { capturedPoints: 0 },
          evaluationTags: [{ code: "pit", label: "坑", title: "负面贡献较高" }]
        },
        {
          playerId: "room-dogleg",
          name: "瘪三",
          role: "狗腿",
          team: "banker",
          trickScore: 20,
          gameScore: -4.5,
          evaluationTags: []
        },
        {
          playerId: "room-idle",
          name: "陈然",
          role: "闲家",
          team: "idle",
          trickScore: 200,
          gameScore: 4.5,
          evaluationTags: [{ code: "mvp", label: "MVP", title: "胜方核心" }]
        },
        {
          playerId: "room-ai",
          name: "测试（AI）",
          role: "闲家",
          team: "idle",
          trickScore: 0,
          gameScore: 4.5,
          evaluationTags: []
        }
      ]
    }
  };
}

test("settled game is converted to an immutable history record", () => {
  const room = settledRoom();
  const record = buildGameRecord(room);

  assert.equal(record.gameId, room.gameRecordId);
  assert.equal(record.bankerProfileId, "player-benlei");
  assert.deepEqual(record.doglegProfileIds, ["player-biesan"]);
  assert.equal(record.players[0].gameScore, -4.5);
  assert.equal(record.players[2].won, true);
  assert.equal(record.players[2].tags[0].code, "mvp");
  assert.equal(record.players[3].profileId, null);
  assert.equal(record.players[3].isAi, true);
  assert.notEqual(record.result, room.result);

  room.result.playerResults[2].name = "已修改";
  assert.equal(record.players[2].name, "陈然");
});

test("history queue remains a no-op when the feature flag is disabled", () => {
  assert.equal(gameHistoryStatus().enabled, false);
  assert.deepEqual(queueGameRecord(settledRoom()), { status: "disabled" });
});
