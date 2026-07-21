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
  },
  {
    version: 3,
    path: fileURLToPath(new URL("./db/migrations/003_history_compaction.sql", import.meta.url))
  },
  {
    version: 4,
    path: fileURLToPath(new URL("./db/migrations/004_accounts.sql", import.meta.url))
  }
];
const HISTORY_ENABLED = String(process.env.GAME_HISTORY_ENABLED || "").toLowerCase() === "true";
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

let pool = null;
let retryTimer = null;
let flushInFlight = false;
const storedProfileIds = new Set();
const pendingRecords = new Map();
const status = {
  configured: Boolean(DATABASE_URL),
  enabled: HISTORY_ENABLED,
  recordPolicy: "human-only-settlement",
  connected: false,
  migrationVersion: 0,
  profileStorageReady: false,
  accountStorageReady: false,
  storedProfileCount: 0,
  storedAccountCount: 0,
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
    status.profileStorageReady = true;
    status.accountStorageReady = true;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [2026072001]);
  }
}

export async function initializeGameHistory() {
  if (!DATABASE_URL) return safeStatus();
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 15_000,
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
        avatar_frame, play_effect, avatar_updated_at, updated_at
      FROM cdp_player_profiles
      ORDER BY profile_id
    `);
    storedProfileIds.clear();
    result.rows.forEach((row) => storedProfileIds.add(row.profile_id));
    status.storedProfileCount = storedProfileIds.size;
    return result.rows.map((row) => ({
      id: row.profile_id,
      accountId: row.account_id || null,
      name: row.display_name,
      avatarUrl: row.avatar_url || "",
      avatarVersion: Number(row.avatar_version) || 0,
      avatarFrame: row.avatar_frame || "",
      playEffect: row.play_effect || "",
      avatarUpdatedAt: row.avatar_updated_at ? new Date(row.avatar_updated_at).toISOString() : null,
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
        avatar_frame, play_effect, avatar_updated_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (profile_id) DO UPDATE SET
        account_id = excluded.account_id,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        avatar_version = excluded.avatar_version,
        avatar_frame = excluded.avatar_frame,
        play_effect = excluded.play_effect,
        avatar_updated_at = excluded.avatar_updated_at,
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
        profile.avatarUpdatedAt || null,
        profile.updatedAt || new Date().toISOString()
      ]
    );
    storedProfileIds.add(profile.id);
    status.storedProfileCount = storedProfileIds.size;
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

function publicStoredAccount(row) {
  return {
    id: row.account_id,
    username: row.username,
    authEmail: row.auth_email,
    role: row.role,
    profileId: row.profile_id || null,
    enabled: Boolean(row.enabled),
    createdBy: row.created_by || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
  };
}

export async function loadStoredAccounts() {
  if (!pool || !status.connected || !status.accountStorageReady) return [];
  try {
    const result = await pool.query(`
      SELECT
        account_id, username, auth_email, role, profile_id, enabled,
        created_by, created_at, updated_at, last_login_at
      FROM cdp_accounts
      ORDER BY role, lower(username)
    `);
    status.storedAccountCount = result.rows.length;
    return result.rows.map(publicStoredAccount);
  } catch (error) {
    rememberError(error);
    console.error("[accounts] load failed", error.message);
    return [];
  }
}

export async function createStoredAccount(account, profile = null) {
  if (!pool || !status.connected || !status.accountStorageReady) return { status: "unavailable" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (profile) {
      await client.query(
        `INSERT INTO cdp_player_profiles (
          profile_id, account_id, display_name, avatar_url, avatar_version,
          avatar_frame, play_effect, avatar_updated_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (profile_id) DO UPDATE SET
          account_id = excluded.account_id,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          avatar_version = excluded.avatar_version,
          avatar_frame = excluded.avatar_frame,
          play_effect = excluded.play_effect,
          avatar_updated_at = excluded.avatar_updated_at,
          updated_at = excluded.updated_at`,
        [
          profile.id,
          account.id,
          profile.name,
          profile.avatarUrl || "",
          Number(profile.avatarVersion) || 0,
          profile.avatarFrame || "",
          profile.playEffect || "",
          profile.avatarUpdatedAt || null,
          profile.updatedAt || new Date().toISOString()
        ]
      );
    }
    const result = await client.query(
      `INSERT INTO cdp_accounts (
        account_id, username, auth_email, role, profile_id, enabled, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING account_id, username, auth_email, role, profile_id, enabled,
        created_by, created_at, updated_at, last_login_at`,
      [
        account.id,
        account.username,
        account.authEmail,
        account.role,
        account.profileId || null,
        account.enabled !== false,
        account.createdBy || null
      ]
    );
    await client.query("COMMIT");
    status.storedAccountCount += 1;
    if (profile) {
      storedProfileIds.add(profile.id);
      status.storedProfileCount = storedProfileIds.size;
    }
    return { status: "saved", account: publicStoredAccount(result.rows[0]) };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    console.error(`[accounts] create failed for ${account.username}`, error.message);
    return { status: "failed", code: error.code || "UNKNOWN" };
  } finally {
    client.release();
  }
}

export async function updateStoredAccount(accountId, { enabled, username } = {}) {
  if (!pool || !status.connected || !status.accountStorageReady) return { status: "unavailable" };
  try {
    const result = await pool.query(
      `UPDATE cdp_accounts
       SET
         enabled = coalesce($2, enabled),
         username = coalesce($3, username),
         updated_at = now()
       WHERE account_id = $1
       RETURNING account_id, username, auth_email, role, profile_id, enabled,
         created_by, created_at, updated_at, last_login_at`,
      [
        accountId,
        typeof enabled === "boolean" ? enabled : null,
        username || null
      ]
    );
    return result.rows[0]
      ? { status: "saved", account: publicStoredAccount(result.rows[0]) }
      : { status: "missing" };
  } catch (error) {
    rememberError(error);
    console.error(`[accounts] update failed for ${accountId}`, error.message);
    return { status: "failed" };
  }
}

export async function recordStoredAccountLogin(accountId) {
  if (!pool || !status.connected || !status.accountStorageReady) return;
  try {
    await pool.query(
      `UPDATE cdp_accounts SET last_login_at = now() WHERE account_id = $1`,
      [accountId]
    );
  } catch (error) {
    rememberError(error);
    console.error(`[accounts] login timestamp failed for ${accountId}`, error.message);
  }
}

function compactCardId(card) {
  if (card?.id) return card.id;
  if (card?.type === "joker") return `${card.deck || 0}-JOKER-${String(card.joker || "").toUpperCase()}`;
  return `${card?.deck || 0}-${card?.suit || "?"}-${card?.rank || "?"}`;
}

function compactThrow(play) {
  if (!play?.throwPlay && !play?.throwFailed) return null;
  return {
    result: play.throwFailed ? "failed" : "success",
    attempt: (play.throwAttemptCards || []).map(compactCardId),
    components: (play.throwComponents || []).map((component) => ({
      signature: component.signature || "",
      pattern: jsonValue(component.pattern, null),
      cards: (component.cards || []).map(compactCardId)
    }))
  };
}

function compactTrickHistory(tricks) {
  return (tricks || []).map((trick) => ({
    number: trick.number,
    leaderId: trick.leaderId || null,
    winnerId: trick.winnerId || null,
    points: Number(trick.points) || 0,
    plays: (trick.plays || []).filter((play) => play.played !== false && play.cards?.length).map((play) => ({
      playerId: play.playerId,
      at: play.at || null,
      cards: play.cards.map(compactCardId),
      throw: compactThrow(play)
    }))
  }));
}

function compactResult(result) {
  const { playerResults: _playerResults, bottomCards: _bottomCards, ...summary } = result || {};
  return jsonValue(summary, {});
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
    recordFormatVersion: 2,
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
    doglegCard: room.doglegCard ? compactCardId(room.doglegCard) : null,
    doglegProfileIds: (room.doglegPlayerIds || []).map((playerId) => profileIdForRoomPlayer(room, playerId)).filter(Boolean),
    threshold: Number(result.threshold) || 0,
    idleScore: Number(result.idleScore) || 0,
    scoreDiff: Number(result.scoreDiff) || 0,
    winnerTeam: result.winnerTeam,
    bottomWinnerRoomPlayerId: result.bottomWinnerId || null,
    bottomWinnerProfileId: profileIdForRoomPlayer(room, result.bottomWinnerId),
    bottomWinnerTeam: result.bottomWinnerTeam || null,
    bottomPoints: Number(result.bottomPoints) || 0,
    bottomCards: (result.bottomCards || []).map(compactCardId),
    removedCards: (room.removedCards || []).map(compactCardId),
    setup: jsonValue(room.setup, {}),
    result: compactResult(result),
    trickHistory: compactTrickHistory(room.settledTrickHistory?.length ? room.settledTrickHistory : room.trickHistory),
    players
  };
}

export function isHumanOnlyGame(room) {
  return Boolean(room?.players?.length) && room.players.every((player) => !player.test);
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
        removed_cards, setup_data, result_data, trick_history, record_format_version
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14::jsonb, $15::jsonb,
        $16, $17, $18, $19, $20,
        $21, $22, $23, $24::jsonb,
        $25::jsonb, $26::jsonb, $27::jsonb, $28::jsonb, $29
      ) ON CONFLICT (game_id) DO NOTHING`,
      [
        record.gameId, record.roomCode, record.startedAt, record.finishedAt, record.rulesVersion, record.playerCount,
        record.callMode, record.callModeName, record.bankerBidScore, record.totalGamePoints, record.trumpSuit,
        record.bankerRoomPlayerId, record.bankerProfileId, JSON.stringify(record.doglegCard), JSON.stringify(record.doglegProfileIds),
        record.threshold, record.idleScore, record.scoreDiff, record.winnerTeam, record.bottomWinnerRoomPlayerId,
        record.bottomWinnerProfileId, record.bottomWinnerTeam, record.bottomPoints, JSON.stringify(record.bottomCards),
        JSON.stringify(record.removedCards), JSON.stringify(record.setup), JSON.stringify(record.result), JSON.stringify(record.trickHistory),
        record.recordFormatVersion
      ]
    );

    if (record.players.length) {
      await client.query(
        `INSERT INTO cdp_game_players (
          game_id, room_player_id, profile_id, account_id, seat_index, is_ai,
          name_snapshot, avatar_url_snapshot, role, team, won, trick_score,
          game_score, dragged_red_fives, dragged_diamond_fives, throw_failures,
          evaluation_data
        )
        SELECT
          $1::uuid, player.room_player_id, player.profile_id, player.account_id,
          player.seat_index, player.is_ai, player.name_snapshot, player.avatar_url_snapshot,
          player.role, player.team, player.won, player.trick_score, player.game_score,
          player.dragged_red_fives, player.dragged_diamond_fives, player.throw_failures,
          player.evaluation_data
        FROM jsonb_to_recordset($2::jsonb) AS player(
          room_player_id text, profile_id text, account_id uuid, seat_index smallint,
          is_ai boolean, name_snapshot text, avatar_url_snapshot text, role text,
          team text, won boolean, trick_score integer, game_score numeric,
          dragged_red_fives integer, dragged_diamond_fives integer,
          throw_failures integer, evaluation_data jsonb
        )
        WHERE true
        ON CONFLICT (game_id, room_player_id) DO NOTHING`,
        [record.gameId, JSON.stringify(record.players.map((player) => ({
          room_player_id: player.roomPlayerId,
          profile_id: player.profileId,
          account_id: player.accountId,
          seat_index: player.seatIndex,
          is_ai: player.isAi,
          name_snapshot: player.name,
          avatar_url_snapshot: player.avatarUrl,
          role: player.role,
          team: player.team,
          won: player.won,
          trick_score: player.trickScore,
          game_score: player.gameScore,
          dragged_red_fives: player.draggedRedFives,
          dragged_diamond_fives: player.draggedDiamondFives,
          throw_failures: player.throwFailures,
          evaluation_data: player.evaluation
        })))]
      );
    }

    const tags = record.players.flatMap((player) => player.tags.map((tag) => ({
      room_player_id: player.roomPlayerId,
      tag_code: tag.code || "default",
      tag_label: tag.label || "",
      tag_title: tag.title || ""
    })));
    if (tags.length) {
      await client.query(
        `INSERT INTO cdp_game_tags (game_id, room_player_id, tag_code, tag_label, tag_title)
         SELECT $1::uuid, tag.room_player_id, tag.tag_code, tag.tag_label, tag.tag_title
         FROM jsonb_to_recordset($2::jsonb) AS tag(
           room_player_id text, tag_code text, tag_label text, tag_title text
         )
         WHERE true
         ON CONFLICT (game_id, room_player_id, tag_code) DO NOTHING`,
        [record.gameId, JSON.stringify(tags)]
      );
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
  if (!isHumanOnlyGame(room)) return { status: "skipped-ai" };
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
