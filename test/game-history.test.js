import test from "node:test";
import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  buildGameRecord,
  createStoredAccount,
  gameHistoryStatus,
  isHumanOnlyGame,
  loadStoredAccounts,
  loadStoredPlayerProfiles,
  queueGameRecord,
  saveStoredPlayerProfile,
  updateStoredAccount
} from "../game-history.js";

function settledRoom() {
  return {
    id: "ABC123",
    gameRecordId: "5a3692ab-35fb-4890-a7bf-3cebe8758916",
    startedAt: "2026-07-20T10:00:00.000Z",
    callMode: "score",
    trumpSuit: "H",
    bankerId: "room-banker",
    doglegPlayerIds: ["room-dogleg"],
    doglegCard: { id: "1-C-A", type: "normal", suit: "C", rank: "A" },
    removedCards: [{ id: "1-D-4", type: "normal", suit: "D", rank: "4" }],
    setup: { currentTrumpSuit: "H" },
    settledTrickHistory: [
      {
        number: 1,
        leaderId: "room-banker",
        winnerId: "room-idle",
        points: 10,
        plays: [
          {
            playerId: "room-banker",
            playerName: "奔雷",
            avatarUrl: "/assets/avatars/benlei.png",
            played: true,
            at: "2026-07-20T10:15:00.000Z",
            cards: [{ id: "1-H-10", type: "normal", suit: "H", rank: "10" }]
          },
          {
            playerId: "room-idle",
            playerName: "陈然",
            played: true,
            at: "2026-07-20T10:15:05.000Z",
            cards: [{ id: "2-H-A", type: "normal", suit: "H", rank: "A" }]
          }
        ]
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
      bottomCards: [{ id: "3-H-10", type: "normal", suit: "H", rank: "10" }],
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
  assert.equal(record.recordFormatVersion, 2);
  assert.equal(record.doglegCard, "1-C-A");
  assert.deepEqual(record.bottomCards, ["3-H-10"]);
  assert.deepEqual(record.removedCards, ["1-D-4"]);
  assert.deepEqual(record.trickHistory[0].plays[0], {
    playerId: "room-banker",
    at: "2026-07-20T10:15:00.000Z",
    cards: ["1-H-10"],
    throw: null
  });
  assert.equal(record.trickHistory[0].plays[0].playerName, undefined);
  assert.equal(record.result.playerResults, undefined);
  assert.equal(record.result.bottomCards, undefined);
  assert.notEqual(record.result, room.result);

  room.result.playerResults[2].name = "已修改";
  assert.equal(record.players[2].name, "陈然");
});

test("history queue remains a no-op when the feature flag is disabled", () => {
  assert.equal(gameHistoryStatus().enabled, false);
  assert.equal(gameHistoryStatus().recordPolicy, "logged-in-human-only-settlement");
  assert.deepEqual(queueGameRecord(settledRoom()), { status: "disabled" });
});

test("only all-human games are eligible for history persistence", () => {
  const room = settledRoom();
  assert.equal(isHumanOnlyGame(room), false);

  room.players.forEach((player, index) => {
    player.test = false;
    player.accountId = `3d173ad8-a44f-44f6-8896-4139b7de${String(9600 + index)}`;
  });
  assert.equal(isHumanOnlyGame(room), true);
});

test("player profile persistence remains optional when no database is configured", async () => {
  assert.deepEqual(await loadStoredPlayerProfiles(), []);
  assert.deepEqual(await saveStoredPlayerProfile({
    id: "player-benlei",
    name: "奔雷",
    avatarFrame: "vip",
    playEffect: "fireworks"
  }), { status: "unavailable" });
  assert.deepEqual(await loadStoredAccounts(), []);
  assert.deepEqual(await createStoredAccount({
    id: "3d173ad8-a44f-44f6-8896-4139b7de9611",
    username: "benlei",
    authEmail: "cdp.benlei@example.invalid",
    role: "player",
    profileId: "player-benlei"
  }), { status: "unavailable" });
  assert.deepEqual(await updateStoredAccount("3d173ad8-a44f-44f6-8896-4139b7de9611", {
    username: "benlei-new"
  }), { status: "unavailable" });
});

test("profile migration reserves account and avatar version fields", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/002_player_profiles.sql", import.meta.url));
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_player_profiles/);
  assert.match(migration, /account_id uuid UNIQUE/);
  assert.match(migration, /avatar_version integer NOT NULL DEFAULT 0/);
  assert.match(migration, /play_effect varchar\(32\)/);
});

test("history compaction has its own forward-only migration", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/003_history_compaction.sql", import.meta.url));
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /ALTER TABLE cdp_games/);
  assert.match(migration, /record_format_version smallint NOT NULL DEFAULT 1/);
});

test("account migration adds login identities and avatar cooldown timestamps", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/004_accounts.sql", import.meta.url));
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /avatar_updated_at timestamptz/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_accounts/);
  assert.match(migration, /account_id uuid PRIMARY KEY/);
  assert.match(migration, /profile_id text UNIQUE REFERENCES cdp_player_profiles/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});

test("account statistics migration adds seasons and account-based aggregation", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/005_account_statistics_and_seasons.sql", import.meta.url));
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_seasons/);
  assert.match(migration, /UPDATE cdp_game_players player/);
  assert.match(migration, /player\.account_id/);
  assert.match(migration, /CREATE VIEW cdp_player_statistics/);
});
