import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Pool } = pg;
const RULES_VERSION = "2026-07-20";
const MIGRATIONS = [
  {
    version: 1,
    path: fileURLToPath(new URL("./db/migrations/001_game_history.sql", import.meta.url))
  },
  {
    version: 2,
    path: fileURLToPath(new URL("./db/migrations/002_player_profiles.sql", import.meta.url))
  }
];
const HISTORY_ENABLED = String(process.env.GAME_HISTORY_ENABLED || "").toLowerCase() === "true";
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

let pool = null;
let retryTimer = null;
let flushInFlight = false;
const pendingRecords = new Map();
const status = {
  configured: Boolean(DATABASE_URL),
  enabled: HISTORY_ENABLED,
  connected: false,
  migrationVersion: 0,
  profileStorageReady: false,
  storedProfileCount: 0,
  lastProfileSavedAt: null,
  pendingCount: 0,
  lastSavedAt: null,
  lastErrorAt: null,
  lastErrorCode: null,
  lastErrorMessage: null
};

function rememberError(error) {
  const rawMessage = String(error?.message || "数据库操作失败");
  status.lastErrorAt = new Date().toISOString();
  status.lastErrorCode = String(error?.code || "UNKNOWN").slice(0, 32);
  status.lastErrorMessage = rawMessage
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[secret-key]")
    .slice(0, 240);
}

function jsonValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function profileIdForRoomPlayer(room, roomPlayerId) {
  return room.players.find((player) => player.id === roomPlayerId)?.profileId || null;
}

function safeStatus() {
  return {
    ...status,
    pendingCount: pendingRecords.size
  };
}

async function applyMigrations(client) {
  await client.query("SELECT pg_advisory_lock($1)", [2026072001]);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS cdp_schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = new Set((await client.query("SELECT version FROM cdp_schema_migrations")).rows.map((row) => Number(row.version)));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      const sql = await readFile(migration.path, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO cdp_schema_migrations(version) VALUES ($1)", [migration.version]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const versionResult = await client.query("SELECT coalesce(max(version), 0) AS version FROM cdp_schema_migrations");
    status.migrationVersion = Number(versionResult.rows[0]?.version || 0);
    const profileCountResult = await client.query("SELECT count(*)::integer AS count FROM cdp_player_profiles");
    status.profileStorageReady = true;
    status.storedProfileCount = Number(profileCountResult.rows[0]?.count || 0);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [2026072001]);
  }
}

export async function initializeGameHistory() {
  if (!DATABASE_URL) return safeStatus();
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false }
  });
  pool.on("error", (error) => {
    status.connected = false;
    rememberError(error);
    console.error("[game-history] database pool error", error.message);
  });

  let client;
  try {
    client = await pool.connect();
    await client.query("SELECT 1");
    await applyMigrations(client);
    status.connected = true;
    status.lastErrorAt = null;
    status.lastErrorCode = null;
    status.lastErrorMessage = null;
    console.log(`[game-history] database ready; writes ${HISTORY_ENABLED ? "enabled" : "disabled"}; migration ${status.migrationVersion}`);
  } catch (error) {
    status.connected = false;
    rememberError(error);
    console.error("[game-history] database initialization failed", error.message);
  } finally {
    client?.release();
  }
  return safeStatus();
}

export function gameHistoryStatus() {
  return safeStatus();
}

export async function loadStoredPlayerProfiles() {
  if (!pool || !status.connected || !status.profileStorageReady) return [];
  try {
    const result = await pool.query(`
      SELECT
        profile_id, account_id, display_name, avatar_url, avatar_version,
        avatar_frame, play_effect, updated_at
      FROM cdp_player_profiles
      ORDER BY profile_id
    `);
    status.storedProfileCount = result.rows.length;
    return result.rows.map((row) => ({
      id: row.profile_id,
      accountId: row.account_id || null,
      name: row.display_name,
      avatarUrl: row.avatar_url || "",
      avatarVersion: Number(row.avatar_version) || 0,
      avatarFrame: row.avatar_frame || "",
      playEffect: row.play_effect || "",
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    }));
  } catch (error) {
    rememberError(error);
    console.error("[player-profiles] load failed", error.message);
    return [];
  }
}

export async function saveStoredPlayerProfile(profile) {
  if (!pool || !status.connected || !status.profileStorageReady) return { status: "unavailable" };
  try {
    const result = await pool.query(
      `INSERT INTO cdp_player_profiles (
        profile_id, account_id, display_name, avatar_url, avatar_version,
        avatar_frame, play_effect, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (profile_id) DO UPDATE SET
        account_id = excluded.account_id,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        avatar_version = excluded.avatar_version,
        avatar_frame = excluded.avatar_frame,
        play_effect = excluded.play_effect,
        updated_at = excluded.updated_at
      RETURNING updated_at`,
      [
        profile.id,
        profile.accountId || null,
        profile.name,
        profile.avatarUrl || "",
        Number(profile.avatarVersion) || 0,
        profile.avatarFrame || "",
        profile.playEffect || "",
        profile.updatedAt || new Date().toISOString()
      ]
    );
    const countResult = await pool.query("SELECT count(*)::integer AS count FROM cdp_player_profiles");
    status.storedProfileCount = Number(countResult.rows[0]?.count || 0);
    status.lastProfileSavedAt = new Date().toISOString();
    return {
      status: "saved",
      updatedAt: result.rows[0]?.updated_at ? new Date(result.rows[0].updated_at).toISOString() : profile.updatedAt
    };
  } catch (error) {
    rememberError(error);
    console.error(`[player-profiles] save failed for ${profile.id}`, error.message);
    return { status: "failed" };
  }
}

export function buildGameRecord(room) {
  if (!room?.gameRecordId || !room?.result) throw new Error("牌局尚未生成可保存的结算结果");
  const result = room.result;
  const playersById = new Map(room.players.map((player) => [player.id, player]));
  const players = (result.playerResults || []).map((playerResult, seatIndex) => {
    const roomPlayer = playersById.get(playerResult.playerId);
    const tags = jsonValue(playerResult.evaluationTags, []);
    return {
      roomPlayerId: playerResult.playerId,
      profileId: roomPlayer?.profileId || null,
      accountId: roomPlayer?.accountId || null,
      seatIndex,
      isAi: Boolean(roomPlayer?.test),
      name: playerResult.name || roomPlayer?.name || "未知玩家",
      avatarUrl: roomPlayer?.avatarUrl || "",
      role: playerResult.role || "",
      team: playerResult.team,
      won: playerResult.team === result.winnerTeam,
      trickScore: Number(playerResult.trickScore) || 0,
      gameScore: Number(playerResult.gameScore) || 0,
      draggedRedFives: Number(playerResult.draggedRedFives) || 0,
      draggedDiamondFives: Number(playerResult.draggedDiamondFives) || 0,
      throwFailures: Number(playerResult.throwFailures) || 0,
      evaluation: jsonValue(playerResult.evaluation, {}),
      tags
    };
  });

  return {
    gameId: room.gameRecordId,
    roomCode: room.id,
    startedAt: room.startedAt,
    finishedAt: result.finishedAt,
    rulesVersion: RULES_VERSION,
    playerCount: Number(result.playerCount) || room.players.length,
    callMode: result.callMode || room.callMode || "two",
    callModeName: result.callModeName || "",
    bankerBidScore: result.bankerBidScore ?? null,
    totalGamePoints: Number(result.totalGamePoints) || 0,
    trumpSuit: room.trumpSuit || null,
    bankerRoomPlayerId: room.bankerId || null,
    bankerProfileId: profileIdForRoomPlayer(room, room.bankerId),
    doglegCard: jsonValue(room.doglegCard, null),
    doglegProfileIds: (room.doglegPlayerIds || []).map((playerId) => profileIdForRoomPlayer(room, playerId)).filter(Boolean),
    threshold: Number(result.threshold) || 0,
    idleScore: Number(result.idleScore) || 0,
    scoreDiff: Number(result.scoreDiff) || 0,
    winnerTeam: result.winnerTeam,
    bottomWinnerRoomPlayerId: result.bottomWinnerId || null,
    bottomWinnerProfileId: profileIdForRoomPlayer(room, result.bottomWinnerId),
    bottomWinnerTeam: result.bottomWinnerTeam || null,
    bottomPoints: Number(result.bottomPoints) || 0,
    bottomCards: jsonValue(result.bottomCards, []),
    removedCards: jsonValue(room.removedCards, []),
    setup: jsonValue(room.setup, {}),
    result: jsonValue(result, {}),
    trickHistory: jsonValue(room.settledTrickHistory?.length ? room.settledTrickHistory : room.trickHistory, []),
    players
  };
}

async function saveGameRecord(record) {
  if (!pool) throw new Error("数据库尚未连接");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO cdp_games (
        game_id, room_code, started_at, finished_at, rules_version, player_count,
        call_mode, call_mode_name, banker_bid_score, total_game_points, trump_suit,
        banker_room_player_id, banker_profile_id, dogleg_card, dogleg_profile_ids,
        threshold, idle_score, score_diff, winner_team, bottom_winner_room_player_id,
        bottom_winner_profile_id, bottom_winner_team, bottom_points, bottom_cards,
        removed_cards, setup_data, result_data, trick_history
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14::jsonb, $15::jsonb,
        $16, $17, $18, $19, $20,
        $21, $22, $23, $24::jsonb,
        $25::jsonb, $26::jsonb, $27::jsonb, $28::jsonb
      ) ON CONFLICT (game_id) DO NOTHING`,
      [
        record.gameId, record.roomCode, record.startedAt, record.finishedAt, record.rulesVersion, record.playerCount,
        record.callMode, record.callModeName, record.bankerBidScore, record.totalGamePoints, record.trumpSuit,
        record.bankerRoomPlayerId, record.bankerProfileId, JSON.stringify(record.doglegCard), JSON.stringify(record.doglegProfileIds),
        record.threshold, record.idleScore, record.scoreDiff, record.winnerTeam, record.bottomWinnerRoomPlayerId,
        record.bottomWinnerProfileId, record.bottomWinnerTeam, record.bottomPoints, JSON.stringify(record.bottomCards),
        JSON.stringify(record.removedCards), JSON.stringify(record.setup), JSON.stringify(record.result), JSON.stringify(record.trickHistory)
      ]
    );

    for (const player of record.players) {
      await client.query(
        `INSERT INTO cdp_game_players (
          game_id, room_player_id, profile_id, account_id, seat_index, is_ai,
          name_snapshot, avatar_url_snapshot, role, team, won, trick_score,
          game_score, dragged_red_fives, dragged_diamond_fives, throw_failures,
          evaluation_data
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17::jsonb
        ) ON CONFLICT (game_id, room_player_id) DO NOTHING`,
        [
          record.gameId, player.roomPlayerId, player.profileId, player.accountId, player.seatIndex, player.isAi,
          player.name, player.avatarUrl, player.role, player.team, player.won, player.trickScore,
          player.gameScore, player.draggedRedFives, player.draggedDiamondFives, player.throwFailures,
          JSON.stringify(player.evaluation)
        ]
      );
      for (const tag of player.tags) {
        await client.query(
          `INSERT INTO cdp_game_tags (game_id, room_player_id, tag_code, tag_label, tag_title)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (game_id, room_player_id, tag_code) DO NOTHING`,
          [record.gameId, player.roomPlayerId, tag.code || "default", tag.label || "", tag.title || ""]
        );
      }
    }
    await client.query("COMMIT");
    status.connected = true;
    status.lastSavedAt = new Date().toISOString();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function scheduleRetry() {
  if (retryTimer || !pendingRecords.size) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    flushPendingGameRecords();
  }, 5_000);
  retryTimer.unref?.();
}

async function flushPendingGameRecords() {
  if (!HISTORY_ENABLED || !pool || flushInFlight) return;
  flushInFlight = true;
  try {
    for (const [gameId, pending] of pendingRecords) {
      try {
        await saveGameRecord(pending.record);
        pendingRecords.delete(gameId);
        pending.onStatus?.({ status: "saved", gameId });
      } catch (error) {
        pending.attempts += 1;
        status.connected = false;
        rememberError(error);
        console.error(`[game-history] save failed for ${gameId} (attempt ${pending.attempts})`, error.message);
        if (pending.attempts >= 3) {
          pendingRecords.delete(gameId);
          pending.onStatus?.({ status: "failed", gameId });
        }
      }
    }
  } finally {
    flushInFlight = false;
    status.pendingCount = pendingRecords.size;
    if (pendingRecords.size) scheduleRetry();
  }
}

export function queueGameRecord(room, onStatus) {
  if (!HISTORY_ENABLED) return { status: "disabled" };
  if (!pool) return { status: "unavailable" };
  let record;
  try {
    record = buildGameRecord(room);
  } catch (error) {
    rememberError(error);
    console.error("[game-history] could not build game record", error.message);
    return { status: "failed" };
  }
  if (!pendingRecords.has(record.gameId)) {
    pendingRecords.set(record.gameId, { record, attempts: 0, onStatus });
    status.pendingCount = pendingRecords.size;
    queueMicrotask(() => void flushPendingGameRecords());
  }
  return { status: "pending", gameId: record.gameId };
}

function requirePool() {
  if (!pool || !status.connected) {
    const error = new Error("历史数据库尚未连接");
    error.status = 503;
    throw error;
  }
  return pool;
}

export async function listPlayerStatistics() {
  const result = await requirePool().query(`
    SELECT * FROM cdp_player_statistics
    ORDER BY total_score DESC, wins DESC, games_played DESC, latest_name ASC
  `);
  return result.rows;
}

export async function listRecentGames(limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  const result = await requirePool().query(
    `SELECT
      game.game_id, game.room_code, game.started_at, game.finished_at,
      game.rules_version, game.player_count, game.call_mode_name,
      game.trump_suit, game.threshold, game.idle_score, game.winner_team,
      coalesce(jsonb_agg(jsonb_build_object(
        'profileId', player.profile_id,
        'name', player.name_snapshot,
        'avatarUrl', player.avatar_url_snapshot,
        'role', player.role,
        'team', player.team,
        'won', player.won,
        'trickScore', player.trick_score,
        'gameScore', player.game_score
      ) ORDER BY player.seat_index), '[]'::jsonb) AS players
    FROM cdp_games game
    LEFT JOIN cdp_game_players player ON player.game_id = game.game_id
    GROUP BY game.game_id
    ORDER BY game.finished_at DESC
    LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}
