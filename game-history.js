import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import pg from "pg";
import {
  calculateDiamondReward,
  diamondRewardDate,
  DIAMOND_REWARD_RULES,
  isDiamondEligibleGame
} from "./diamond-rewards.js";
import { buildGameEvaluations } from "./game-evaluations.js";
import { annotateForcedProtectedFives } from "./dragged-five-attribution.js";
import { CONSUMABLE_ITEMS, SHOP_RULES_VERSION, shopProductIdFromPath } from "./shop-and-items.js";
import {
  beijingHeroRefreshKey,
  createHeroTaskDefinition,
  createHeroTaskRequirements,
  createBattleHeroSnapshot,
  drawHeroGachaResult,
  freeHeroPullState,
  heroGachaCharge,
  HERO_HOME_RULES,
  HOME_REGIONS,
  HOME_REGION_BY_ID,
  HOME_UNIT_BY_ID,
  missingDailyHeroTaskSlots,
  paidBoardSkillState,
  previewHomeRegion,
  publicHeroCatalog,
  regionUpgradeCost,
  selectHeroTaskUnits,
  starUpgradeCost
} from "./hero-home.js";

const { Pool } = pg;
const RULES_VERSION = "2026-08-14";
const ADMIN_DIAMOND_GRANT_RULES_VERSION = "2026-07-29-admin-grant-v1";
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
  },
  {
    version: 5,
    path: fileURLToPath(new URL("./db/migrations/005_account_statistics_and_seasons.sql", import.meta.url))
  },
  {
    version: 6,
    path: fileURLToPath(new URL("./db/migrations/006_player_cosmetics.sql", import.meta.url))
  },
  {
    version: 7,
    path: fileURLToPath(new URL("./db/migrations/007_leaderboard_metrics.sql", import.meta.url))
  },
  {
    version: 8,
    path: fileURLToPath(new URL("./db/migrations/008_more_player_cosmetics.sql", import.meta.url))
  },
  {
    version: 9,
    path: fileURLToPath(new URL("./db/migrations/009_integral_wins.sql", import.meta.url))
  },
  {
    version: 10,
    path: fileURLToPath(new URL("./db/migrations/010_fry_and_won_card_statistics.sql", import.meta.url))
  },
  {
    version: 11,
    path: fileURLToPath(new URL("./db/migrations/011_diamond_rewards.sql", import.meta.url))
  },
  {
    version: 12,
    path: fileURLToPath(new URL("./db/migrations/012_taunt_presets.sql", import.meta.url))
  },
  {
    version: 13,
    path: fileURLToPath(new URL("./db/migrations/013_shop_and_consumable_items.sql", import.meta.url))
  },
  {
    version: 14,
    path: fileURLToPath(new URL("./db/migrations/014_dragged_five_attribution.sql", import.meta.url))
  },
  {
    version: 15,
    path: fileURLToPath(new URL("./db/migrations/015_forced_dragged_five_attribution.sql", import.meta.url)),
    apply: recalculateStoredGameEvaluations
  },
  {
    version: 16,
    path: fileURLToPath(new URL("./db/migrations/016_avatar_class_frames.sql", import.meta.url))
  },
  {
    version: 17,
    path: fileURLToPath(new URL("./db/migrations/017_uploaded_avatar_frames.sql", import.meta.url))
  },
  {
    version: 18,
    path: fileURLToPath(new URL("./db/migrations/018_remove_vip_legend_avatar_frame.sql", import.meta.url))
  },
  {
    version: 19,
    path: fileURLToPath(new URL("./db/migrations/019_hero_home_system.sql", import.meta.url))
  },
  {
    version: 20,
    path: fileURLToPath(new URL("./db/migrations/020_rename_boka_heroes.sql", import.meta.url))
  },
  {
    version: 21,
    path: fileURLToPath(new URL("./db/migrations/021_first_and_free_hero_pull.sql", import.meta.url))
  },
  {
    version: 22,
    path: fileURLToPath(new URL("./db/migrations/022_ssr_economy_and_home_progression.sql", import.meta.url))
  },
  {
    version: 23,
    path: fileURLToPath(new URL("./db/migrations/023_hero_economy_rebalance.sql", import.meta.url))
  },
  {
    version: 24,
    path: fileURLToPath(new URL("./db/migrations/024_hero_production_star_curve.sql", import.meta.url))
  },
  {
    version: 25,
    path: fileURLToPath(new URL("./db/migrations/025_ssr_pity_200.sql", import.meta.url))
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
  recordPolicy: "logged-in-human-only-settlement",
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
        if (migration.apply) await migration.apply(client);
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
        avatar_frame, card_skin, play_effect, avatar_updated_at, updated_at
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
      cardSkin: row.card_skin || "",
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
        avatar_frame, card_skin, play_effect, avatar_updated_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (profile_id) DO UPDATE SET
        account_id = excluded.account_id,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        avatar_version = excluded.avatar_version,
        avatar_frame = excluded.avatar_frame,
        card_skin = excluded.card_skin,
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
        profile.cardSkin || "",
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
          avatar_frame, card_skin, play_effect, avatar_updated_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (profile_id) DO UPDATE SET
          account_id = excluded.account_id,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          avatar_version = excluded.avatar_version,
          avatar_frame = excluded.avatar_frame,
          card_skin = excluded.card_skin,
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
          profile.cardSkin || "",
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

function publicStoredTauntPreset(row) {
  return {
    id: row.taunt_id,
    text: row.taunt_text,
    enabled: Boolean(row.enabled),
    availableToAll: Boolean(row.available_to_all),
    availableAccountIds: Array.isArray(row.available_account_ids)
      ? row.available_account_ids.map(String)
      : [],
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function loadStoredTauntPresets() {
  if (!pool || !status.connected || !status.accountStorageReady) return [];
  try {
    const result = await pool.query(`
      SELECT
        preset.taunt_id,
        preset.taunt_text,
        preset.enabled,
        preset.available_to_all,
        preset.sort_order,
        preset.created_at,
        preset.updated_at,
        coalesce(
          array_agg(access.account_id::text ORDER BY access.account_id)
            FILTER (WHERE access.account_id IS NOT NULL),
          ARRAY[]::text[]
        ) AS available_account_ids
      FROM cdp_taunt_presets preset
      LEFT JOIN cdp_taunt_preset_access access ON access.taunt_id = preset.taunt_id
      GROUP BY preset.taunt_id
      ORDER BY preset.sort_order, preset.created_at, preset.taunt_id
    `);
    return result.rows.map(publicStoredTauntPreset);
  } catch (error) {
    rememberError(error);
    console.error("[taunt-presets] load failed", error.message);
    return [];
  }
}

export async function saveStoredTauntPreset(preset, { createdBy = null } = {}) {
  if (!pool || !status.connected || !status.accountStorageReady) return { status: "unavailable" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO cdp_taunt_presets (
        taunt_id, taunt_text, enabled, available_to_all, sort_order, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (taunt_id) DO UPDATE SET
        taunt_text = excluded.taunt_text,
        enabled = excluded.enabled,
        available_to_all = excluded.available_to_all,
        sort_order = excluded.sort_order,
        updated_at = now()
      RETURNING
        taunt_id, taunt_text, enabled, available_to_all, sort_order,
        created_at, updated_at`,
      [
        preset.id,
        preset.text,
        preset.enabled !== false,
        preset.availableToAll !== false,
        Number(preset.sortOrder) || 0,
        createdBy || null
      ]
    );
    await client.query("DELETE FROM cdp_taunt_preset_access WHERE taunt_id = $1", [preset.id]);
    const accountIds = preset.availableToAll
      ? []
      : [...new Set((preset.availableAccountIds || []).map(String).filter(Boolean))];
    if (accountIds.length) {
      await client.query(
        `INSERT INTO cdp_taunt_preset_access (taunt_id, account_id)
         SELECT $1, account_id
         FROM unnest($2::uuid[]) AS account_id`,
        [preset.id, accountIds]
      );
    }
    await client.query("COMMIT");
    return {
      status: "saved",
      preset: publicStoredTauntPreset({
        ...result.rows[0],
        available_account_ids: accountIds
      })
    };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    console.error(`[taunt-presets] save failed for ${preset.id}`, error.message);
    return { status: "failed", code: error.code || "UNKNOWN" };
  } finally {
    client.release();
  }
}

export async function deleteStoredTauntPreset(tauntId) {
  if (!pool || !status.connected || !status.accountStorageReady) return { status: "unavailable" };
  try {
    const result = await pool.query(
      "DELETE FROM cdp_taunt_presets WHERE taunt_id = $1 RETURNING taunt_id",
      [tauntId]
    );
    return result.rows[0] ? { status: "deleted" } : { status: "missing" };
  } catch (error) {
    rememberError(error);
    console.error(`[taunt-presets] delete failed for ${tauntId}`, error.message);
    return { status: "failed" };
  }
}

function commerceError(message, statusCode = 400) {
  const error = new Error(message);
  error.status = statusCode;
  return error;
}

function normalizedRequestId(value) {
  const requestId = String(value || "").trim();
  if (!requestId || requestId.length > 120) throw commerceError("请求编号无效");
  return requestId;
}

function publicShopProduct(row) {
  const currentConsumable = row.product_type === "consumable_item"
    ? CONSUMABLE_ITEMS.find((item) => item.id === row.asset_key)
    : null;
  return {
    id: row.product_id,
    productType: row.product_type,
    assetKey: row.asset_key,
    name: row.name,
    description: currentConsumable?.description || row.description || "",
    assetUrl: row.asset_url || "",
    assetVersion: row.asset_version || "",
    price: Number(row.price) || 0,
    isListed: Boolean(row.is_listed),
    sortOrder: Number(row.sort_order) || 0,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function listShopProducts({ includeUnlisted = false } = {}) {
  const result = await requirePool().query(
    `SELECT product_id, product_type, asset_key, name, description,
            asset_url, asset_version, price, is_listed, sort_order, updated_at
     FROM cdp_shop_products
     WHERE $1::boolean OR is_listed
     ORDER BY sort_order, product_id`,
    [Boolean(includeUnlisted)]
  );
  return result.rows.map(publicShopProduct);
}

export async function getPlayerShopState(accountId, { includeUnlisted = false } = {}) {
  const database = requirePool();
  const [products, entitlementResult, inventoryResult, walletResult] = await Promise.all([
    listShopProducts({ includeUnlisted }),
    database.query(
      `SELECT cosmetic_type, cosmetic_key
       FROM cdp_cosmetic_entitlements
       WHERE account_id = $1::uuid
       ORDER BY cosmetic_type, cosmetic_key`,
      [accountId]
    ),
    database.query(
      `SELECT item_id, available_quantity, reserved_quantity
       FROM cdp_consumable_inventory
       WHERE account_id = $1::uuid
       ORDER BY item_id`,
      [accountId]
    ),
    database.query(
      `SELECT balance FROM cdp_diamond_wallets WHERE account_id = $1::uuid`,
      [accountId]
    )
  ]);
  return {
    rulesVersion: SHOP_RULES_VERSION,
    balance: Number(walletResult.rows[0]?.balance) || 0,
    products,
    entitlements: {
      avatarFrames: entitlementResult.rows.filter((row) => row.cosmetic_type === "avatar_frame").map((row) => row.cosmetic_key),
      cardSkins: entitlementResult.rows.filter((row) => row.cosmetic_type === "card_skin").map((row) => row.cosmetic_key)
    },
    inventory: Object.fromEntries(inventoryResult.rows.map((row) => [row.item_id, {
      available: Number(row.available_quantity) || 0,
      reserved: Number(row.reserved_quantity) || 0
    }]))
  };
}

export async function purchaseShopProduct(accountId, productId, requestIdValue) {
  const database = requirePool();
  const requestId = normalizedRequestId(requestIdValue);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT purchase_id, product_id, price, balance_after, created_at
       FROM cdp_shop_purchases
       WHERE account_id = $1::uuid AND request_id = $2`,
      [accountId, requestId]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { repeated: true, purchase: existing.rows[0] };
    }

    const productResult = await client.query(
      `SELECT product_id, product_type, asset_key, name, price, is_listed
       FROM cdp_shop_products
       WHERE product_id = $1
       FOR UPDATE`,
      [String(productId || "")]
    );
    const product = productResult.rows[0];
    if (!product) throw commerceError("商品不存在", 404);
    if (!product.is_listed) throw commerceError("商品已经下架", 409);

    if (product.product_type !== "consumable_item") {
      const owned = await client.query(
        `SELECT 1 FROM cdp_cosmetic_entitlements
         WHERE account_id = $1::uuid AND cosmetic_type = $2 AND cosmetic_key = $3`,
        [accountId, product.product_type, product.asset_key]
      );
      if (owned.rows[0]) throw commerceError("已经拥有这件皮肤", 409);
    }

    await client.query(
      `INSERT INTO cdp_diamond_wallets (account_id)
       VALUES ($1::uuid)
       ON CONFLICT (account_id) DO NOTHING`,
      [accountId]
    );
    const wallet = await client.query(
      `UPDATE cdp_diamond_wallets
       SET balance = balance - $2, updated_at = now()
       WHERE account_id = $1::uuid AND balance >= $2
       RETURNING balance`,
      [accountId, Number(product.price)]
    );
    if (!wallet.rows[0]) throw commerceError("钻石余额不足", 409);

    const purchaseId = randomUUID();
    const balanceAfter = Number(wallet.rows[0].balance) || 0;
    await client.query(
      `INSERT INTO cdp_shop_purchases (
        purchase_id, account_id, product_id, price, balance_after, request_id
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      [purchaseId, accountId, product.product_id, Number(product.price), balanceAfter, requestId]
    );
    await client.query(
      `INSERT INTO cdp_diamond_ledger (
        account_id, amount, balance_after, reason, rules_version, idempotency_key, detail
      ) VALUES ($1::uuid, $2, $3, 'shop_purchase', $4, $5, $6::jsonb)`,
      [
        accountId,
        -Number(product.price),
        balanceAfter,
        SHOP_RULES_VERSION,
        `shop_purchase:${purchaseId}`,
        JSON.stringify({ purchaseId, productId: product.product_id, productName: product.name })
      ]
    );

    if (product.product_type === "consumable_item") {
      const inventory = await client.query(
        `INSERT INTO cdp_consumable_inventory (
          account_id, item_id, available_quantity, reserved_quantity
        ) VALUES ($1::uuid, $2, 1, 0)
        ON CONFLICT (account_id, item_id) DO UPDATE SET
          available_quantity = cdp_consumable_inventory.available_quantity + 1,
          updated_at = now()
        RETURNING available_quantity, reserved_quantity`,
        [accountId, product.asset_key]
      );
      await client.query(
        `INSERT INTO cdp_consumable_ledger (
          account_id, item_id, available_delta, reserved_delta,
          available_after, reserved_after, reason, purchase_id,
          idempotency_key, detail
        ) VALUES ($1::uuid, $2, 1, 0, $3, $4, 'purchase', $5::uuid, $6, $7::jsonb)`,
        [
          accountId,
          product.asset_key,
          Number(inventory.rows[0].available_quantity),
          Number(inventory.rows[0].reserved_quantity),
          purchaseId,
          `item_purchase:${purchaseId}`,
          JSON.stringify({ productId: product.product_id })
        ]
      );
    } else {
      await client.query(
        `INSERT INTO cdp_cosmetic_entitlements (
          account_id, cosmetic_type, cosmetic_key, source, source_id
        ) VALUES ($1::uuid, $2, $3, 'purchase', $4)`,
        [accountId, product.product_type, product.asset_key, purchaseId]
      );
    }

    await client.query("COMMIT");
    return {
      repeated: false,
      purchase: {
        purchase_id: purchaseId,
        product_id: product.product_id,
        price: Number(product.price),
        balance_after: balanceAfter
      }
    };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

function normalizedShopProductUpdate(update) {
  const productId = shopProductIdFromPath(update?.productId ?? update?.id);
  if (!productId) throw commerceError("商品编号不能为空", 400);
  return {
    productId,
    hasPrice: Object.hasOwn(update || {}, "price"),
    price: update?.price,
    hasIsListed: Object.hasOwn(update || {}, "isListed"),
    isListed: update?.isListed
  };
}

export async function updateShopProducts(updates, administratorId) {
  const normalizedUpdates = (Array.isArray(updates) ? updates : []).map(normalizedShopProductUpdate);
  if (!normalizedUpdates.length) throw commerceError("没有需要保存的商品", 400);
  const duplicatedId = normalizedUpdates.find((update, index) =>
    normalizedUpdates.findIndex((item) => item.productId === update.productId) !== index
  )?.productId;
  if (duplicatedId) throw commerceError("商品不能重复提交", 400);

  const database = requirePool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const updatedProducts = [];
    for (const update of normalizedUpdates) {
      const currentResult = await client.query(
        `SELECT product_id, product_type, asset_key, name, description,
                asset_url, asset_version, price, is_listed, sort_order, updated_at
         FROM cdp_shop_products
         WHERE product_id = $1
         FOR UPDATE`,
        [update.productId]
      );
      const current = currentResult.rows[0];
      if (!current) throw commerceError("商品不存在", 404);
      const price = update.hasPrice ? Number(update.price) : Number(current.price);
      if (!Number.isInteger(price) || price <= 0) throw commerceError("商品价格必须是大于零的整数");
      const isListed = update.hasIsListed ? Boolean(update.isListed) : Boolean(current.is_listed);
      const changed = Number(current.price) !== price || Boolean(current.is_listed) !== isListed;
      if (!changed) {
        updatedProducts.push(publicShopProduct(current));
        continue;
      }
      const updated = await client.query(
        `UPDATE cdp_shop_products
         SET price = $2, is_listed = $3, updated_by = $4::uuid, updated_at = now()
         WHERE product_id = $1
         RETURNING product_id, product_type, asset_key, name, description,
                   asset_url, asset_version, price, is_listed, sort_order, updated_at`,
        [current.product_id, price, isListed, administratorId]
      );
      await client.query(
        `INSERT INTO cdp_shop_product_audit (
          product_id, admin_account_id, before_data, after_data
        ) VALUES ($1, $2::uuid, $3::jsonb, $4::jsonb)`,
        [current.product_id, administratorId, JSON.stringify(current), JSON.stringify(updated.rows[0])]
      );
      updatedProducts.push(publicShopProduct(updated.rows[0]));
    }
    await client.query("COMMIT");
    return updatedProducts;
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShopProduct(productId, body, administratorId) {
  const update = { productId };
  if (Object.hasOwn(body || {}, "price")) update.price = body.price;
  if (Object.hasOwn(body || {}, "isListed")) update.isListed = body.isListed;
  const [updated] = await updateShopProducts([update], administratorId);
  return updated;
}

function normalizeUploadedAvatarFrameProduct(input) {
  const assetKey = String(input?.assetKey || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(assetKey)) {
    throw commerceError("主题编号需为 3-40 位小写字母、数字或连字符，且不能以连字符开头或结尾");
  }
  const name = String(input?.name || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw commerceError("头像框名称需为 1-80 个字符");
  const description = String(input?.description || "").trim();
  if (description.length > 240) throw commerceError("头像框说明不能超过 240 个字符");
  const price = Number(input?.price);
  if (!Number.isInteger(price) || price <= 0 || price > 1_000_000) {
    throw commerceError("头像框价格必须是 1 至 1000000 的整数");
  }
  const assetUrl = String(input?.assetUrl || "").trim();
  const assetVersion = String(input?.assetVersion || "").trim();
  if (!/^https:\/\//.test(assetUrl) || assetUrl.length > 1000 || !/^[a-f0-9]{16}$/.test(assetVersion)) {
    throw commerceError("头像框素材地址或内容版本不正确");
  }
  return {
    productId: `avatar-frame:${assetKey}`,
    assetKey,
    name,
    description: description || "永久解锁，可在我的皮肤中自由装备或卸下。",
    assetUrl,
    assetVersion,
    price,
    isListed: Boolean(input?.isListed)
  };
}

export async function avatarFrameProductExists(assetKeyValue) {
  const assetKey = String(assetKeyValue || "").trim();
  if (!assetKey) return false;
  const result = await requirePool().query(
    `SELECT 1 FROM cdp_shop_products
     WHERE product_type = 'avatar_frame' AND asset_key = $1`,
    [assetKey]
  );
  return Boolean(result.rows[0]);
}

export async function createUploadedAvatarFrameProduct(input, administratorId) {
  const product = normalizeUploadedAvatarFrameProduct(input);
  const database = requirePool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT 1 FROM cdp_shop_products
       WHERE product_type = 'avatar_frame' AND asset_key = $1
       FOR UPDATE`,
      [product.assetKey]
    );
    if (existing.rows[0]) throw commerceError("这个主题编号已经存在，请换一个新的编号", 409);
    const sortResult = await client.query(
      `SELECT coalesce(max(sort_order), 99) + 1 AS next_sort_order
       FROM cdp_shop_products
       WHERE product_type = 'avatar_frame'`
    );
    const inserted = await client.query(
      `INSERT INTO cdp_shop_products (
        product_id, product_type, asset_key, name, description,
        asset_url, asset_version, price, is_listed, sort_order, updated_by
      ) VALUES ($1, 'avatar_frame', $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid)
      RETURNING product_id, product_type, asset_key, name, description,
                asset_url, asset_version, price, is_listed, sort_order, updated_at`,
      [
        product.productId,
        product.assetKey,
        product.name,
        product.description,
        product.assetUrl,
        product.assetVersion,
        product.price,
        product.isListed,
        Number(sortResult.rows[0]?.next_sort_order) || 100,
        administratorId
      ]
    );
    await client.query(
      `INSERT INTO cdp_shop_product_audit (
        product_id, admin_account_id, before_data, after_data
      ) VALUES ($1, $2::uuid, '{}'::jsonb, $3::jsonb)`,
      [product.productId, administratorId, JSON.stringify(inserted.rows[0])]
    );
    await client.query("COMMIT");
    return publicShopProduct(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    if (error.code === "23505") throw commerceError("这个主题编号已经存在，请换一个新的编号", 409);
    throw error;
  } finally {
    client.release();
  }
}

export async function grantDiamondsByAdmin(administratorId, accountId, amountValue, requestIdValue, noteValue = "") {
  const amount = Number(amountValue);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
    throw commerceError("单次发放钻石必须是 1 至 1000000 的整数");
  }
  const note = String(noteValue || "").trim();
  if (note.length > 160) throw commerceError("发放备注不能超过 160 个字符");
  const requestId = normalizedRequestId(requestIdValue);
  const idempotencyKey = `admin_grant:${requestId}`;
  const database = requirePool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [idempotencyKey]);
    const existing = await client.query(
      `SELECT account_id, amount, balance_after, detail, created_at
       FROM cdp_diamond_ledger
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.account_id !== accountId || Number(row.amount) !== amount) {
        throw commerceError("请求编号已用于其他钻石发放", 409);
      }
      await client.query("COMMIT");
      return {
        repeated: true,
        accountId: row.account_id,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        note: row.detail?.note || "",
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
      };
    }

    await client.query(
      `INSERT INTO cdp_diamond_wallets (account_id)
       VALUES ($1::uuid)
       ON CONFLICT (account_id) DO NOTHING`,
      [accountId]
    );
    const wallet = await client.query(
      `UPDATE cdp_diamond_wallets
       SET balance = balance + $2,
           lifetime_earned = lifetime_earned + $2,
           updated_at = now()
       WHERE account_id = $1::uuid
       RETURNING balance`,
      [accountId, amount]
    );
    const balanceAfter = Number(wallet.rows[0]?.balance) || 0;
    const detail = { administratorId, requestId, note };
    const inserted = await client.query(
      `INSERT INTO cdp_diamond_ledger (
        account_id, amount, balance_after, reason,
        rules_version, idempotency_key, detail
      ) VALUES ($1::uuid, $2, $3, 'admin_grant', $4, $5, $6::jsonb)
      RETURNING created_at`,
      [
        accountId,
        amount,
        balanceAfter,
        ADMIN_DIAMOND_GRANT_RULES_VERSION,
        idempotencyKey,
        JSON.stringify(detail)
      ]
    );
    await client.query("COMMIT");
    return {
      repeated: false,
      accountId,
      amount,
      balanceAfter,
      note,
      createdAt: inserted.rows[0]?.created_at
        ? new Date(inserted.rows[0].created_at).toISOString()
        : null
    };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function grantCosmeticEntitlement(administratorId, accountId, productId, requestIdValue, reason = "") {
  const database = requirePool();
  const requestId = normalizedRequestId(requestIdValue);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT grant_id FROM cdp_admin_cosmetic_grants
       WHERE admin_account_id = $1::uuid AND request_id = $2`,
      [administratorId, requestId]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { repeated: true, granted: false };
    }
    const account = await client.query("SELECT role FROM cdp_accounts WHERE account_id = $1::uuid", [accountId]);
    if (!account.rows[0]) throw commerceError("玩家账号不存在", 404);
    if (account.rows[0].role !== "player") throw commerceError("只能向玩家账号发放皮肤", 400);
    const productResult = await client.query(
      `SELECT product_type, asset_key FROM cdp_shop_products
       WHERE product_id = $1 AND product_type IN ('avatar_frame', 'card_skin')`,
      [String(productId || "")]
    );
    const product = productResult.rows[0];
    if (!product) throw commerceError("请选择有效的皮肤商品", 400);
    const grantId = randomUUID();
    const inserted = await client.query(
      `INSERT INTO cdp_cosmetic_entitlements (
        account_id, cosmetic_type, cosmetic_key, source, source_id
      ) VALUES ($1::uuid, $2, $3, 'admin_grant', $4)
      ON CONFLICT DO NOTHING
      RETURNING cosmetic_key`,
      [accountId, product.product_type, product.asset_key, grantId]
    );
    await client.query(
      `INSERT INTO cdp_admin_cosmetic_grants (
        grant_id, admin_account_id, account_id, cosmetic_type,
        cosmetic_key, request_id, reason
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)`,
      [grantId, administratorId, accountId, product.product_type, product.asset_key, requestId, String(reason || "").slice(0, 160)]
    );
    await client.query("COMMIT");
    return { repeated: false, granted: Boolean(inserted.rows[0]) };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveEquippedCosmetics(accountId, profileId, { avatarFrame = "", cardSkin = "" } = {}) {
  const database = requirePool();
  const requested = [
    ["avatar_frame", String(avatarFrame || "")],
    ["card_skin", String(cardSkin || "")]
  ];
  for (const [type, key] of requested) {
    if (!key) continue;
    const owned = await database.query(
      `SELECT 1 FROM cdp_cosmetic_entitlements
       WHERE account_id = $1::uuid AND cosmetic_type = $2 AND cosmetic_key = $3`,
      [accountId, type, key]
    );
    if (!owned.rows[0]) throw commerceError("只能使用已经拥有的皮肤", 403);
  }
  const result = await database.query(
    `UPDATE cdp_player_profiles
     SET avatar_frame = $3, card_skin = $4, updated_at = now()
     WHERE profile_id = $1 AND account_id = $2::uuid
     RETURNING updated_at`,
    [profileId, accountId, avatarFrame, cardSkin]
  );
  if (!result.rows[0]) throw commerceError("玩家资料不存在", 404);
  return { updatedAt: new Date(result.rows[0].updated_at).toISOString() };
}

export async function reserveGameItem(
  accountId,
  roomPlayerId,
  gameId,
  itemId,
  requestIdValue,
  effectData = {},
  options = {}
) {
  const freeUse = options.freeUse === true;
  const database = requirePool();
  const requestId = normalizedRequestId(requestIdValue);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const repeated = await client.query(
      `SELECT use_id, item_id, status, effect_data
       FROM cdp_game_item_uses
       WHERE account_id = $1::uuid AND request_id = $2`,
      [accountId, requestId]
    );
    if (repeated.rows[0]) {
      await client.query("COMMIT");
      return {
        repeated: true,
        freeUse: Boolean(repeated.rows[0].effect_data?.freeUse),
        use: repeated.rows[0]
      };
    }
    const product = await client.query(
      `SELECT 1 FROM cdp_shop_products
       WHERE product_type = 'consumable_item' AND asset_key = $1`,
      [itemId]
    );
    if (!product.rows[0]) throw commerceError("对局道具不存在", 404);
    if (freeUse) {
      const inventory = await client.query(
        `SELECT available_quantity, reserved_quantity
         FROM cdp_consumable_inventory
         WHERE account_id = $1::uuid AND item_id = $2 AND available_quantity > 0
         FOR UPDATE`,
        [accountId, itemId]
      );
      if (!inventory.rows[0]) throw commerceError("背包中没有这个对局道具", 409);
      const useId = randomUUID();
      const use = await client.query(
        `INSERT INTO cdp_game_item_uses (
          use_id, game_id, room_player_id, account_id, item_id,
          status, request_id, effect_data, resolved_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, 'refunded', $6, $7::jsonb, now())
        RETURNING use_id, item_id, status, effect_data`,
        [
          useId,
          gameId,
          roomPlayerId,
          accountId,
          itemId,
          requestId,
          JSON.stringify({ ...effectData, freeUse: true })
        ]
      );
      await client.query("COMMIT");
      return { repeated: false, freeUse: true, use: use.rows[0] };
    }
    const inventory = await client.query(
      `UPDATE cdp_consumable_inventory
       SET available_quantity = available_quantity - 1,
           reserved_quantity = reserved_quantity + 1,
           updated_at = now()
       WHERE account_id = $1::uuid AND item_id = $2 AND available_quantity > 0
       RETURNING available_quantity, reserved_quantity`,
      [accountId, itemId]
    );
    if (!inventory.rows[0]) throw commerceError("背包中没有这个对局道具", 409);
    const useId = randomUUID();
    const use = await client.query(
      `INSERT INTO cdp_game_item_uses (
        use_id, game_id, room_player_id, account_id, item_id,
        status, request_id, effect_data
      ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, 'reserved', $6, $7::jsonb)
      RETURNING use_id, item_id, status, effect_data`,
      [useId, gameId, roomPlayerId, accountId, itemId, requestId, JSON.stringify(effectData)]
    );
    await client.query(
      `INSERT INTO cdp_consumable_ledger (
        account_id, item_id, available_delta, reserved_delta,
        available_after, reserved_after, reason, use_id,
        idempotency_key, detail
      ) VALUES ($1::uuid, $2, -1, 1, $3, $4, 'reserve', $5::uuid, $6, $7::jsonb)`,
      [
        accountId,
        itemId,
        Number(inventory.rows[0].available_quantity),
        Number(inventory.rows[0].reserved_quantity),
        useId,
        `item_reserve:${useId}`,
        JSON.stringify(effectData)
      ]
    );
    await client.query("COMMIT");
    return { repeated: false, freeUse: false, use: use.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    if (error.code === "23505") throw commerceError("本局已经使用过这个对局道具", 409);
    throw error;
  } finally {
    client.release();
  }
}

async function resolveReservedUses(gameId, mode, restartUseId = null) {
  const database = requirePool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const uses = await client.query(
      `SELECT use_id, account_id, item_id
       FROM cdp_game_item_uses
       WHERE game_id = $1::uuid AND status = 'reserved'
       ORDER BY used_at, use_id
       FOR UPDATE`,
      [gameId]
    );
    for (const use of uses.rows) {
      const consume = mode === "consume" || (mode === "restart" && String(use.use_id) === String(restartUseId));
      const inventory = await client.query(
        consume
          ? `UPDATE cdp_consumable_inventory
             SET reserved_quantity = reserved_quantity - 1, updated_at = now()
             WHERE account_id = $1::uuid AND item_id = $2 AND reserved_quantity > 0
             RETURNING available_quantity, reserved_quantity`
          : `UPDATE cdp_consumable_inventory
             SET available_quantity = available_quantity + 1,
                 reserved_quantity = reserved_quantity - 1,
                 updated_at = now()
             WHERE account_id = $1::uuid AND item_id = $2 AND reserved_quantity > 0
             RETURNING available_quantity, reserved_quantity`,
        [use.account_id, use.item_id]
      );
      if (!inventory.rows[0]) continue;
      const statusName = consume ? "consumed" : "refunded";
      await client.query(
        `UPDATE cdp_game_item_uses
         SET status = $2, resolved_at = now()
         WHERE use_id = $1::uuid`,
        [use.use_id, statusName]
      );
      await client.query(
        `INSERT INTO cdp_consumable_ledger (
          account_id, item_id, available_delta, reserved_delta,
          available_after, reserved_after, reason, use_id,
          idempotency_key, detail
        ) VALUES ($1::uuid, $2, $3, -1, $4, $5, $6, $7::uuid, $8, '{}'::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          use.account_id,
          use.item_id,
          consume ? 0 : 1,
          Number(inventory.rows[0].available_quantity),
          Number(inventory.rows[0].reserved_quantity),
          statusName,
          use.use_id,
          `item_${statusName}:${use.use_id}`
        ]
      );
    }
    await client.query("COMMIT");
    return { resolved: uses.rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export function consumeGameItemUses(gameId) {
  return resolveReservedUses(gameId, "consume");
}

export function refundGameItemUses(gameId) {
  return resolveReservedUses(gameId, "refund");
}

export function resolveRestartGameItemUses(gameId, restartUseId) {
  return resolveReservedUses(gameId, "restart", restartUseId);
}

export async function refundOrphanedGameItemUses() {
  const database = requirePool();
  const result = await database.query(
    `SELECT DISTINCT game_id
     FROM cdp_game_item_uses
     WHERE status = 'reserved'
     ORDER BY game_id`
  );
  let resolved = 0;
  for (const row of result.rows) {
    const outcome = await resolveReservedUses(row.game_id, "refund");
    resolved += outcome.resolved;
  }
  return { resolved };
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
    plays: (trick.plays || [])
      .filter((play) => play.played !== false && play.cards?.length)
      .sort((left, right) => {
        const leftIndex = Number.isFinite(left.turnIndex) ? left.turnIndex : Number.MAX_SAFE_INTEGER;
        const rightIndex = Number.isFinite(right.turnIndex) ? right.turnIndex : Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return String(left.at || "").localeCompare(String(right.at || ""));
      })
      .map((play) => ({
        playerId: play.playerId,
        at: play.at || null,
        cards: play.cards.map(compactCardId),
        ...(play.forcedProtectedFiveIds?.length
          ? { forcedProtectedFiveIds: [...play.forcedProtectedFiveIds] }
          : {}),
        throw: compactThrow(play)
      }))
  }));
}

function compactResult(result) {
  const { playerResults: _playerResults, bottomCards: _bottomCards, ...summary } = result || {};
  return jsonValue(summary, {});
}

export function rebuildStoredGameEvaluations({
  players = [],
  trickHistory = [],
  result = {},
  bankerRoomPlayerId = null,
  bottomWinnerRoomPlayerId = null,
  bottomWinnerTeam = null,
  bottomPoints = 0,
  bottomCards = [],
  trumpSuit = null
} = {}) {
  const oldAwards = jsonValue(result?.evaluations, {});
  const hasStoredProvisionalState = players.every((player) =>
    Object.hasOwn(player.evaluation || {}, "wasProvisionalWinner")
  );
  let provisionalWinnerPlayerIds = null;
  if (hasStoredProvisionalState) {
    provisionalWinnerPlayerIds = players
      .filter((player) => player.evaluation?.wasProvisionalWinner)
      .map((player) => player.roomPlayerId);
  } else if (Array.isArray(oldAwards.stiffestPlayerIds)) {
    const stiffestIds = new Set(oldAwards.stiffestPlayerIds);
    provisionalWinnerPlayerIds = players
      .filter((player) => !stiffestIds.has(player.roomPlayerId))
      .map((player) => player.roomPlayerId);
  }

  const evaluationWinnerTeam = result?.evaluationWinnerTeam
    || players.find((player) => Number(player.baseGameScore) > 0)?.team
    || null;
  const expandedBottomCards = (bottomCards || []).map(historyCardFromId);
  const bottomDraggedRedFives = Number(result?.bottomDraggedRedFives)
    || expandedBottomCards.filter((card) => card.type === "normal" && card.rank === "5" && card.suit === "H").length;
  const bottomDraggedDiamondFives = Number(result?.bottomDraggedDiamondFives)
    || expandedBottomCards.filter((card) => card.type === "normal" && card.rank === "5" && card.suit === "D").length;

  return buildGameEvaluations({
    players: players.map((player) => ({
      id: player.roomPlayerId,
      score: Number(player.trickScore) || 0,
      throwFailures: Number(player.throwFailures) || 0
    })),
    tricks: annotateForcedProtectedFives(expandHistoryTricks(trickHistory), trumpSuit),
    bankerTeamIds: players.filter((player) => player.team === "banker").map((player) => player.roomPlayerId),
    winnerTeam: evaluationWinnerTeam,
    provisionalWinnerPlayerIds,
    finalSideSuitBottomWinnerId: oldAwards.precisionPlayerId || null,
    bottom: {
      winnerId: bottomWinnerRoomPlayerId,
      winnerTeam: bottomWinnerTeam,
      bankerId: bankerRoomPlayerId,
      points: Number(bottomPoints) || 0,
      draggedRedFives: bottomDraggedRedFives,
      draggedDiamondFives: bottomDraggedDiamondFives
    }
  });
}

async function recalculateStoredGameEvaluations(client) {
  const storedGames = await client.query(
    `SELECT
       game.game_id,
       game.banker_room_player_id,
       game.bottom_winner_room_player_id,
       game.bottom_winner_team,
       game.bottom_points,
       game.bottom_cards,
       game.trump_suit,
       game.result_data,
       game.trick_history,
       coalesce(jsonb_agg(jsonb_build_object(
         'roomPlayerId', player.room_player_id,
         'seatIndex', player.seat_index,
         'team', player.team,
         'trickScore', player.trick_score,
         'baseGameScore', player.base_game_score,
         'throwFailures', player.throw_failures,
         'evaluation', player.evaluation_data
       ) ORDER BY player.seat_index) FILTER (WHERE player.room_player_id IS NOT NULL), '[]'::jsonb) AS players
     FROM cdp_games game
     LEFT JOIN cdp_game_players player ON player.game_id = game.game_id
     GROUP BY game.game_id
     ORDER BY game.finished_at, game.game_id`
  );

  for (const game of storedGames.rows) {
    const rebuilt = rebuildStoredGameEvaluations({
      players: game.players,
      trickHistory: game.trick_history,
      result: game.result_data,
      bankerRoomPlayerId: game.banker_room_player_id,
      bottomWinnerRoomPlayerId: game.bottom_winner_room_player_id,
      bottomWinnerTeam: game.bottom_winner_team,
      bottomPoints: game.bottom_points,
      bottomCards: game.bottom_cards,
      trumpSuit: game.trump_suit
    });
    const evaluations = game.players.map((player) => ({
      room_player_id: player.roomPlayerId,
      evaluation_data: rebuilt.byPlayerId[player.roomPlayerId] || {}
    }));
    await client.query(
      `UPDATE cdp_game_players player
       SET evaluation_data = evaluation.evaluation_data
       FROM jsonb_to_recordset($2::jsonb) AS evaluation(
         room_player_id text,
         evaluation_data jsonb
       )
       WHERE player.game_id = $1::uuid
         AND player.room_player_id = evaluation.room_player_id`,
      [game.game_id, JSON.stringify(evaluations)]
    );

    await client.query("DELETE FROM cdp_game_tags WHERE game_id = $1::uuid", [game.game_id]);
    const tags = game.players.flatMap((player) =>
      (rebuilt.byPlayerId[player.roomPlayerId]?.tags || []).map((tag) => ({
        room_player_id: player.roomPlayerId,
        tag_code: tag.code,
        tag_label: tag.label,
        tag_title: tag.title
      }))
    );
    if (tags.length) {
      await client.query(
        `INSERT INTO cdp_game_tags (game_id, room_player_id, tag_code, tag_label, tag_title)
         SELECT $1::uuid, tag.room_player_id, tag.tag_code, tag.tag_label, tag.tag_title
         FROM jsonb_to_recordset($2::jsonb) AS tag(
           room_player_id text,
           tag_code text,
           tag_label text,
           tag_title text
         )`,
        [game.game_id, JSON.stringify(tags)]
      );
    }
    await client.query(
      `UPDATE cdp_games
       SET result_data = jsonb_set(result_data, '{evaluations}', $2::jsonb, true)
       WHERE game_id = $1::uuid`,
      [game.game_id, JSON.stringify(rebuilt.awards)]
    );
  }
}

export function buildGameRecord(room) {
  if (!room?.gameRecordId || !room?.result) throw new Error("牌局尚未生成可保存的结算结果");
  const result = room.result;
  const playersById = new Map(room.players.map((player) => [player.id, player]));
  const players = (result.playerResults || []).map((playerResult, seatIndex) => {
    const roomPlayer = playersById.get(playerResult.playerId);
    const tags = jsonValue(playerResult.evaluationTags, []);
    const gameScore = Number(playerResult.gameScore) || 0;
    const baseGameScore = Number(playerResult.baseGameScore ?? playerResult.gameScore) || 0;
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
      won: baseGameScore > 0,
      trickScore: Number(playerResult.trickScore) || 0,
      gameScore,
      baseGameScore,
      itemSelfDelta: Number(playerResult.itemSelfDelta) || 0,
      itemOpponentDelta: Number(playerResult.itemOpponentDelta) || 0,
      itemScoreDelta: Number(playerResult.itemScoreDelta) || 0,
      draggedRedFives: Number(playerResult.draggedRedFives) || 0,
      draggedDiamondFives: Number(playerResult.draggedDiamondFives) || 0,
      throwFailures: Number(playerResult.throwFailures) || 0,
      evaluation: jsonValue(playerResult.evaluation, {}),
      tags,
      battleHeroSnapshot: jsonValue(roomPlayer?.battleHeroSnapshot, null),
      heroSkillReward: jsonValue(playerResult.heroSkillReward, null),
      diamondReward: jsonValue(
        playerResult.diamondReward || calculateDiamondReward({
          gameScore: baseGameScore,
          tags,
          heroSkillReward: playerResult.heroSkillReward
        }),
        {}
      )
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
    setup: {
      ...jsonValue(room.setup, {}),
      bankerScoreMode: room.bankerScoreMode || "banker-remainder",
      doglegMode: room.doglegMode || "traditional",
      dynamicDogleg: jsonValue(room.dynamicDogleg, null),
      hiddenDogleg: jsonValue(room.hiddenDogleg, null),
      events: jsonValue([...(room.events || [])].reverse(), [])
    },
    result: compactResult(result),
    trickHistory: compactTrickHistory(room.settledTrickHistory?.length ? room.settledTrickHistory : room.trickHistory),
    boardHeroEffects: jsonValue(room.boardHeroEffects, {}),
    itemUses: jsonValue(result.itemUses, []),
    itemAdjustments: jsonValue(result.itemAdjustments, []),
    players
  };
}

export function isHumanOnlyGame(room) {
  return isDiamondEligibleGame(room);
}

function diamondRewardOutcome(row) {
  return {
    accountId: row.account_id,
    status: row.status,
    awardedAmount: Number(row.awarded_amount) || 0,
    balanceAfter: Number(row.balance_after) || 0,
    rewardDate: row.reward_date instanceof Date
      ? row.reward_date.toISOString().slice(0, 10)
      : String(row.reward_date)
  };
}

async function saveDiamondRewards(client, record) {
  const outcomes = [];
  const rewardDate = diamondRewardDate(record.finishedAt);
  for (const player of record.players) {
    if (!player.accountId || player.isAi || player.diamondReward?.status === "ineligible") continue;

    await client.query(
      `INSERT INTO cdp_diamond_wallets (account_id)
       VALUES ($1::uuid)
       ON CONFLICT (account_id) DO NOTHING`,
      [player.accountId]
    );
    await client.query(
      `SELECT balance
       FROM cdp_diamond_wallets
       WHERE account_id = $1::uuid
       FOR UPDATE`,
      [player.accountId]
    );

    const existing = await client.query(
      `SELECT account_id, status, awarded_amount, balance_after, reward_date
       FROM cdp_game_diamond_rewards
       WHERE game_id = $1::uuid AND account_id = $2::uuid`,
      [record.gameId, player.accountId]
    );
    if (existing.rows[0]) {
      outcomes.push(diamondRewardOutcome(existing.rows[0]));
      continue;
    }

    const reward = player.diamondReward || calculateDiamondReward({
      gameScore: player.baseGameScore,
      tags: player.tags,
      heroSkillReward: player.heroSkillReward
    });
    const awardedAmount = Number(reward.totalAmount) || 0;
    let balanceAfter = 0;

    if (awardedAmount > 0) {
      const wallet = await client.query(
        `UPDATE cdp_diamond_wallets
         SET balance = balance + $2,
             lifetime_earned = lifetime_earned + $2,
             updated_at = now()
         WHERE account_id = $1::uuid
         RETURNING balance`,
        [player.accountId, awardedAmount]
      );
      balanceAfter = Number(wallet.rows[0]?.balance) || 0;
    } else {
      const wallet = await client.query(
        `SELECT balance
         FROM cdp_diamond_wallets
         WHERE account_id = $1::uuid`,
        [player.accountId]
      );
      balanceAfter = Number(wallet.rows[0]?.balance) || 0;
    }

    const inserted = await client.query(
      `INSERT INTO cdp_game_diamond_rewards (
        game_id, room_player_id, account_id, reward_date, rules_version,
        status, base_amount, win_bonus, title_bonus, hero_bonus, calculated_amount,
        awarded_amount, balance_after, breakdown
      ) VALUES (
        $1::uuid, $2, $3::uuid, $4::date, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14::jsonb
      )
      RETURNING account_id, status, awarded_amount, balance_after, reward_date`,
      [
        record.gameId,
        player.roomPlayerId,
        player.accountId,
        rewardDate,
        reward.rulesVersion || DIAMOND_REWARD_RULES.version,
        "awarded",
        Number(reward.baseAmount) || 0,
        Number(reward.winBonus) || 0,
        Number(reward.titleBonus) || 0,
        Number(reward.heroBonus) || 0,
        Number(reward.totalAmount) || 0,
        awardedAmount,
        balanceAfter,
        JSON.stringify(reward)
      ]
    );

    if (awardedAmount > 0) {
      await client.query(
        `INSERT INTO cdp_diamond_ledger (
          account_id, amount, balance_after, reason, game_id,
          rules_version, idempotency_key, detail
        ) VALUES (
          $1::uuid, $2, $3, 'game_reward', $4::uuid,
          $5, $6, $7::jsonb
        )
        ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          player.accountId,
          awardedAmount,
          balanceAfter,
          record.gameId,
          reward.rulesVersion || DIAMOND_REWARD_RULES.version,
          `game_reward:${record.gameId}:${player.accountId}`,
          JSON.stringify(reward)
        ]
      );
    }
    outcomes.push(diamondRewardOutcome(inserted.rows[0]));
  }
  return outcomes;
}

async function settleBoardHeroHeat(client, record) {
  const uses = Array.isArray(record.boardHeroEffects?.uses) ? record.boardHeroEffects.uses : [];
  for (const player of record.players) {
    const unitId = player.battleHeroSnapshot?.heroId;
    if (!player.accountId || !["shen-biesan", "shen-jiangwen"].includes(unitId)) continue;
    const existing = await client.query(
      `SELECT game_id FROM cdp_hero_heat_settlements
       WHERE game_id = $1::uuid AND account_id = $2::uuid AND unit_id = $3`,
      [record.gameId, player.accountId, unitId]
    );
    if (existing.rows[0]) continue;
    const owned = await client.query(
      `SELECT stars, skill_heat FROM cdp_hero_units
       WHERE account_id = $1::uuid AND unit_id = $2
       FOR UPDATE`,
      [player.accountId, unitId]
    );
    if (!owned.rows[0]) continue;
    const heatBefore = Number(owned.rows[0].skill_heat) || 0;
    const usedInGame = uses.some((use) => use?.accountId === player.accountId && use?.heroId === unitId);
    const cooling = paidBoardSkillState(owned.rows[0].stars, heatBefore).coolingPerUnusedGame;
    const heatAfter = usedInGame ? heatBefore : Math.max(0, Math.round((heatBefore - cooling) * 10) / 10);
    if (heatAfter !== heatBefore) {
      await client.query(
        `UPDATE cdp_hero_units SET skill_heat = $3, updated_at = now()
         WHERE account_id = $1::uuid AND unit_id = $2`,
        [player.accountId, unitId, heatAfter]
      );
    }
    await client.query(
      `INSERT INTO cdp_hero_heat_settlements (
        game_id, account_id, unit_id, heat_before, heat_after, used_in_game
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      [record.gameId, player.accountId, unitId, heatBefore, heatAfter, usedInGame]
    );
  }
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
        removed_cards, setup_data, result_data, trick_history, board_hero_effects, record_format_version
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14::jsonb, $15::jsonb,
        $16, $17, $18, $19, $20,
        $21, $22, $23, $24::jsonb,
        $25::jsonb, $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb, $30
      ) ON CONFLICT (game_id) DO NOTHING`,
      [
        record.gameId, record.roomCode, record.startedAt, record.finishedAt, record.rulesVersion, record.playerCount,
        record.callMode, record.callModeName, record.bankerBidScore, record.totalGamePoints, record.trumpSuit,
        record.bankerRoomPlayerId, record.bankerProfileId, JSON.stringify(record.doglegCard), JSON.stringify(record.doglegProfileIds),
        record.threshold, record.idleScore, record.scoreDiff, record.winnerTeam, record.bottomWinnerRoomPlayerId,
        record.bottomWinnerProfileId, record.bottomWinnerTeam, record.bottomPoints, JSON.stringify(record.bottomCards),
        JSON.stringify(record.removedCards), JSON.stringify(record.setup), JSON.stringify(record.result), JSON.stringify(record.trickHistory),
        JSON.stringify(record.boardHeroEffects || {}), record.recordFormatVersion
      ]
    );

    if (record.players.length) {
      await client.query(
        `INSERT INTO cdp_game_players (
          game_id, room_player_id, profile_id, account_id, seat_index, is_ai,
          name_snapshot, avatar_url_snapshot, role, team, won, trick_score,
          game_score, base_game_score, item_self_delta, item_opponent_delta,
          item_score_delta, dragged_red_fives, dragged_diamond_fives, throw_failures,
          evaluation_data, battle_hero_snapshot, hero_skill_reward
        )
        SELECT
          $1::uuid, player.room_player_id, player.profile_id, player.account_id,
          player.seat_index, player.is_ai, player.name_snapshot, player.avatar_url_snapshot,
          player.role, player.team, player.won, player.trick_score, player.game_score,
          player.base_game_score, player.item_self_delta, player.item_opponent_delta,
          player.item_score_delta, player.dragged_red_fives, player.dragged_diamond_fives, player.throw_failures,
          player.evaluation_data, player.battle_hero_snapshot, player.hero_skill_reward
        FROM jsonb_to_recordset($2::jsonb) AS player(
          room_player_id text, profile_id text, account_id uuid, seat_index smallint,
          is_ai boolean, name_snapshot text, avatar_url_snapshot text, role text,
          team text, won boolean, trick_score integer, game_score numeric,
          base_game_score numeric, item_self_delta numeric, item_opponent_delta numeric,
          item_score_delta numeric,
          dragged_red_fives integer, dragged_diamond_fives integer,
          throw_failures integer, evaluation_data jsonb,
          battle_hero_snapshot jsonb, hero_skill_reward jsonb
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
          base_game_score: player.baseGameScore,
          item_self_delta: player.itemSelfDelta,
          item_opponent_delta: player.itemOpponentDelta,
          item_score_delta: player.itemScoreDelta,
          dragged_red_fives: player.draggedRedFives,
          dragged_diamond_fives: player.draggedDiamondFives,
          throw_failures: player.throwFailures,
          evaluation_data: player.evaluation,
          battle_hero_snapshot: player.battleHeroSnapshot,
          hero_skill_reward: player.heroSkillReward
        })))]
      );
    }

    if (record.itemAdjustments?.length) {
      await client.query(
        `INSERT INTO cdp_game_score_adjustments (
          game_id, source_room_player_id, recipient_room_player_id,
          adjustment_type, delta, detail
        )
        SELECT $1::uuid, adjustment.source_player_id, adjustment.recipient_player_id,
               adjustment.adjustment_type, adjustment.delta, adjustment.detail
        FROM jsonb_to_recordset($2::jsonb) AS adjustment(
          source_player_id text, recipient_player_id text,
          adjustment_type text, delta numeric, detail jsonb
        )
        ON CONFLICT DO NOTHING`,
        [record.gameId, JSON.stringify(record.itemAdjustments.map((adjustment) => ({
          source_player_id: adjustment.sourcePlayerId,
          recipient_player_id: adjustment.recipientPlayerId,
          adjustment_type: adjustment.adjustmentType,
          delta: adjustment.delta,
          detail: adjustment
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
    const diamondRewards = await saveDiamondRewards(client, record);
    await settleBoardHeroHeat(client, record);
    await client.query("COMMIT");
    status.connected = true;
    status.lastSavedAt = new Date().toISOString();
    return { diamondRewards };
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
        const saved = await saveGameRecord(pending.record);
        pendingRecords.delete(gameId);
        pending.onStatus?.({ status: "saved", gameId, ...saved });
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

async function ensureHeroAccount(client, accountId) {
  await client.query(
    `INSERT INTO cdp_hero_profiles (account_id)
     VALUES ($1::uuid)
     ON CONFLICT (account_id) DO NOTHING`,
    [accountId]
  );
  await client.query(
    `INSERT INTO cdp_home_regions (account_id, region_id)
     SELECT $1::uuid, region_id
     FROM unnest($2::text[]) AS region_id
     ON CONFLICT (account_id, region_id) DO NOTHING`,
    [accountId, HOME_REGIONS.map((region) => region.id)]
  );
}

function publicOwnedHeroUnit(row) {
  const unit = HOME_UNIT_BY_ID.get(row.unit_id);
  if (!unit) return null;
  const stars = Number(row.stars) || 1;
  return {
    ...unit,
    stars,
    exclusiveFragments: Number(row.exclusive_fragments) || 0,
    skillHeat: Number(row.skill_heat) || 0,
    upgradeCost: starUpgradeCost(unit.id, stars),
    obtainedAt: row.obtained_at ? new Date(row.obtained_at).toISOString() : null
  };
}

async function heroTasksFromClient(client, accountId, ownedUnits, at = new Date()) {
  const refreshKey = beijingHeroRefreshKey(at);
  if (!refreshKey) return [];
  const ownedHeroIds = ownedUnits.filter((unit) => unit.type === "hero").map((unit) => unit.id);
  await client.query(
    `SELECT account_id FROM cdp_hero_profiles
     WHERE account_id = $1::uuid FOR UPDATE`,
    [accountId]
  );
  await client.query(
    `UPDATE cdp_hero_tasks
     SET status = 'completed', updated_at = now()
     WHERE account_id = $1::uuid AND status = 'running' AND completes_at <= $2`,
    [accountId, at]
  );
  await client.query(
    `DELETE FROM cdp_hero_tasks
     WHERE account_id = $1::uuid AND status = 'available' AND refresh_key <> $2::date`,
    [accountId, refreshKey]
  );
  await client.query(
    `DELETE FROM cdp_hero_tasks
     WHERE task_id IN (
       SELECT task_id
       FROM (
         SELECT task_id, status,
                ROW_NUMBER() OVER (ORDER BY created_at, task_id) AS issued_index
         FROM cdp_hero_tasks
         WHERE account_id = $1::uuid AND refresh_key = $2::date
       ) issued
       WHERE issued_index > 3 AND status = 'available'
     )`,
    [accountId, refreshKey]
  );
  const currentDailyTasks = await client.query(
    `SELECT task_id, slot_index, status, hero_count, requirements FROM cdp_hero_tasks
     WHERE account_id = $1::uuid AND refresh_key = $2::date`,
    [accountId, refreshKey]
  );
  if (ownedHeroIds.length) {
    for (const row of currentDailyTasks.rows.filter((task) => task.status === "available")) {
      const requirements = row.requirements || {};
      const regionTotal = Object.values(requirements.regions || {}).reduce((sum, count) => sum + Number(count), 0);
      const genderTotal = Object.values(requirements.genders || {}).reduce((sum, count) => sum + Number(count), 0);
      if (regionTotal < Number(row.hero_count) || genderTotal < Number(row.hero_count)) continue;
      const relaxedRequirements = createHeroTaskRequirements(ownedHeroIds, row.hero_count);
      if (!relaxedRequirements) continue;
      await client.query(
        `UPDATE cdp_hero_tasks SET requirements = $3::jsonb, updated_at = now()
         WHERE task_id = $1::uuid AND account_id = $2::uuid AND status = 'available'`,
        [row.task_id, accountId, JSON.stringify(relaxedRequirements)]
      );
    }
  }
  if (ownedHeroIds.length) {
    for (const slotIndex of missingDailyHeroTaskSlots(currentDailyTasks.rows)) {
      const definition = createHeroTaskDefinition(ownedHeroIds);
      if (!definition) break;
      await client.query(
        `INSERT INTO cdp_hero_tasks (
          task_id, account_id, refresh_key, slot_index, color, hero_count,
          duration_seconds, reward_materials, requirements
        ) VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          randomUUID(), accountId, refreshKey, slotIndex, definition.color,
          definition.heroCount, definition.durationSeconds, definition.rewardMaterials,
          JSON.stringify(definition.requirements)
        ]
      );
    }
  }
  const result = await client.query(
    `SELECT task_id, refresh_key, slot_index, color, status, hero_count,
            duration_seconds, reward_materials, requirements, assigned_unit_ids,
            started_at, completes_at, collected_at
     FROM cdp_hero_tasks
     WHERE account_id = $1::uuid AND status <> 'collected'
     ORDER BY CASE status WHEN 'completed' THEN 1 WHEN 'running' THEN 2 ELSE 3 END,
              refresh_key, slot_index, created_at`,
    [accountId]
  );
  return result.rows.map((row) => ({
    taskId: row.task_id,
    refreshKey: row.refresh_key instanceof Date ? row.refresh_key.toISOString().slice(0, 10) : String(row.refresh_key),
    slotIndex: Number(row.slot_index),
    color: row.color,
    status: row.status,
    heroCount: Number(row.hero_count),
    durationSeconds: Number(row.duration_seconds),
    rewardMaterials: Number(row.reward_materials),
    requirements: row.requirements || {},
    assignedUnitIds: row.assigned_unit_ids || [],
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completesAt: row.completes_at ? new Date(row.completes_at).toISOString() : null,
    collectedAt: row.collected_at ? new Date(row.collected_at).toISOString() : null
  }));
}

async function heroHomeStateFromClient(client, accountId) {
  const [profileResult, unitResult, regionResult, walletResult] = await Promise.all([
    client.query(
      `SELECT universal_fragments, non_hero_pity_count, non_ssr_pity_count,
              building_materials, first_pull_completed, free_pull_used_at,
              battle_unit_id, updated_at
       FROM cdp_hero_profiles
       WHERE account_id = $1::uuid`,
      [accountId]
    ),
    client.query(
      `SELECT unit_id, stars, exclusive_fragments, skill_heat, obtained_at, updated_at
       FROM cdp_hero_units
       WHERE account_id = $1::uuid
       ORDER BY obtained_at, unit_id`,
      [accountId]
    ),
    client.query(
      `SELECT region.region_id, region.unit_id, region.extra_unit_id, region.level,
              region.production_value, region.production_seconds, region.settled_at, unit.stars
       FROM cdp_home_regions region
       LEFT JOIN cdp_hero_units unit
         ON unit.account_id = region.account_id AND unit.unit_id = region.unit_id
       WHERE region.account_id = $1::uuid
       ORDER BY CASE region.region_id WHEN 'boka' THEN 1 WHEN 'brick' THEN 2 ELSE 3 END`,
      [accountId]
    ),
    client.query(`SELECT balance FROM cdp_diamond_wallets WHERE account_id = $1::uuid`, [accountId])
  ]);
  const profile = profileResult.rows[0] || {};
  const ownedUnits = unitResult.rows.map(publicOwnedHeroUnit).filter(Boolean);
  const ownedById = new Map(ownedUnits.map((unit) => [unit.id, unit]));
  const nowAt = new Date();
  const regions = regionResult.rows.map((row) => {
    const preview = previewHomeRegion({
      regionId: row.region_id,
      unitId: row.unit_id,
      stars: row.stars,
      level: row.level,
      productionValue: row.production_value,
      productionSeconds: row.production_seconds,
      settledAt: row.settled_at
    }, nowAt);
    return {
      ...HOME_REGION_BY_ID.get(row.region_id),
      ...preview,
      ownedUnit: row.unit_id ? ownedById.get(row.unit_id) || null : null,
      extraUnitId: row.extra_unit_id || null,
      extraOwnedUnit: row.extra_unit_id ? ownedById.get(row.extra_unit_id) || null : null
    };
  });
  const pityCount = Number(profile.non_hero_pity_count) || 0;
  const freePull = freeHeroPullState(profile.free_pull_used_at, nowAt);
  const tasks = await heroTasksFromClient(client, accountId, ownedUnits, nowAt);
  return {
    ...publicHeroCatalog(),
    accountId,
    balance: Number(walletResult.rows[0]?.balance) || 0,
    universalFragments: Number(profile.universal_fragments) || 0,
    buildingMaterials: Number(profile.building_materials) || 0,
    pityCount,
    pityRemaining: HERO_HOME_RULES.pityPulls - pityCount,
    ssrPityCount: Number(profile.non_ssr_pity_count) || 0,
    ssrPityRemaining: HERO_HOME_RULES.ssrPityPulls - (Number(profile.non_ssr_pity_count) || 0),
    firstPullGuaranteed: !profile.first_pull_completed,
    freePullAvailable: freePull.available,
    nextFreePullAt: freePull.nextFreePullAt,
    battleUnitId: profile.battle_unit_id || null,
    battleHero: profile.battle_unit_id
      ? createBattleHeroSnapshot(
          profile.battle_unit_id,
          ownedById.get(profile.battle_unit_id)?.stars,
          ownedById.get(profile.battle_unit_id)?.skillHeat
        )
      : null,
    ownedUnits,
    regions,
    tasks,
    updatedAt: profile.updated_at ? new Date(profile.updated_at).toISOString() : null
  };
}

export async function getHeroHomeState(accountId) {
  const database = requirePool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    const state = await heroHomeStateFromClient(client, accountId);
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

async function settleHomeRegion(client, accountId, regionId) {
  const result = await client.query(
    `SELECT region.region_id, region.unit_id, region.level, region.production_value,
            region.production_seconds, region.settled_at, unit.stars
     FROM cdp_home_regions region
     LEFT JOIN cdp_hero_units unit
       ON unit.account_id = region.account_id AND unit.unit_id = region.unit_id
     WHERE region.account_id = $1::uuid AND region.region_id = $2
     FOR UPDATE OF region`,
    [accountId, regionId]
  );
  if (!result.rows[0]) throw commerceError("家园区域不存在", 404);
  const row = result.rows[0];
  const preview = previewHomeRegion({
    regionId: row.region_id,
    unitId: row.unit_id,
    stars: row.stars,
    level: row.level,
    productionValue: row.production_value,
    productionSeconds: row.production_seconds,
    settledAt: row.settled_at
  });
  await client.query(
    `UPDATE cdp_home_regions
     SET production_value = $3, production_seconds = $4,
         settled_at = now(), updated_at = now()
     WHERE account_id = $1::uuid AND region_id = $2`,
    [accountId, regionId, preview.productionValue, preview.productionSeconds]
  );
  return preview;
}

async function creditHomeProduction(client, accountId, amount, requestId, detail) {
  await client.query(
    `INSERT INTO cdp_diamond_wallets (account_id)
     VALUES ($1::uuid)
     ON CONFLICT (account_id) DO NOTHING`,
    [accountId]
  );
  const wallet = amount > 0
    ? await client.query(
        `UPDATE cdp_diamond_wallets
         SET balance = balance + $2, lifetime_earned = lifetime_earned + $2, updated_at = now()
         WHERE account_id = $1::uuid
         RETURNING balance`,
        [accountId, amount]
      )
    : await client.query(`SELECT balance FROM cdp_diamond_wallets WHERE account_id = $1::uuid`, [accountId]);
  const balanceAfter = Number(wallet.rows[0]?.balance) || 0;
  if (amount > 0) {
    await client.query(
      `INSERT INTO cdp_diamond_ledger (
        account_id, amount, balance_after, reason, rules_version, idempotency_key, detail
      ) VALUES ($1::uuid, $2, $3, 'home_production', $4, $5, $6::jsonb)
      ON CONFLICT (idempotency_key) DO NOTHING`,
      [accountId, amount, balanceAfter, HERO_HOME_RULES.version, `home_collect:${accountId}:${requestId}`, JSON.stringify(detail)]
    );
  }
  return balanceAfter;
}

export async function collectHomeProduction(accountId, regionIdValue, requestIdValue) {
  const database = requirePool();
  const requestId = normalizedRequestId(requestIdValue);
  const regionIds = regionIdValue === "all"
    ? HOME_REGIONS.map((region) => region.id)
    : [String(regionIdValue || "")];
  if (regionIds.some((regionId) => !HOME_REGION_BY_ID.has(regionId))) throw commerceError("家园区域不存在", 404);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    const collected = [];
    let amount = 0;
    for (const regionId of regionIds) {
      const preview = await settleHomeRegion(client, accountId, regionId);
      amount += preview.collectableDiamonds;
      collected.push({ regionId, amount: preview.collectableDiamonds, value: preview.productionValue });
      await client.query(
        `UPDATE cdp_home_regions
         SET production_value = $3, production_seconds = 0,
             settled_at = now(), updated_at = now()
         WHERE account_id = $1::uuid AND region_id = $2`,
        [accountId, regionId, preview.fractionalValue]
      );
    }
    const balanceAfter = await creditHomeProduction(client, accountId, amount, requestId, { collected });
    const state = await heroHomeStateFromClient(client, accountId);
    await client.query("COMMIT");
    return { amount, balanceAfter, collected, state };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function assignHomeUnit(accountId, regionIdValue, unitIdValue, requestIdValue, slotValue = "primary") {
  const database = requirePool();
  const regionId = String(regionIdValue || "");
  const unitId = unitIdValue ? String(unitIdValue) : null;
  const slot = slotValue === "extra" ? "extra" : "primary";
  const requestId = normalizedRequestId(requestIdValue);
  const region = HOME_REGION_BY_ID.get(regionId);
  const unit = unitId ? HOME_UNIT_BY_ID.get(unitId) : null;
  if (!region) throw commerceError("家园区域不存在", 404);
  if (unitId && !unit) throw commerceError("角色不存在", 404);
  if (unit && unit.regionId !== regionId) throw commerceError(`${unit.name}只能放入${HOME_REGION_BY_ID.get(unit.regionId).name}`, 409);
  if (slot === "extra" && unit && unit.type !== "hero") throw commerceError("附加栏位只能安排英雄", 409);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    await client.query(
      `SELECT account_id FROM cdp_hero_profiles WHERE account_id = $1::uuid FOR UPDATE`,
      [accountId]
    );
    const regionState = await client.query(
      `SELECT level, unit_id, extra_unit_id
       FROM cdp_home_regions
       WHERE account_id = $1::uuid AND region_id = $2
       FOR UPDATE`,
      [accountId, regionId]
    );
    if (!regionState.rows[0]) throw commerceError("家园区域不存在", 404);
    if (slot === "extra" && Number(regionState.rows[0].level) < HERO_HOME_RULES.extraSlotUnlockLevel) {
      throw commerceError("区域达到100级后才解锁附加英雄栏位", 409);
    }
    if (unit) {
      const owned = await client.query(
        `SELECT stars FROM cdp_hero_units WHERE account_id = $1::uuid AND unit_id = $2 FOR UPDATE`,
        [accountId, unit.id]
      );
      if (!owned.rows[0]) throw commerceError("尚未拥有这个角色", 403);
      const assigned = await client.query(
        `SELECT region_id, unit_id, extra_unit_id FROM cdp_home_regions
         WHERE account_id = $1::uuid AND (unit_id = $2 OR extra_unit_id = $2)
         FOR UPDATE`,
        [accountId, unit.id]
      );
      const alreadyInTarget = assigned.rows[0]
        && assigned.rows[0].region_id === regionId
        && (slot === "primary" ? assigned.rows[0].unit_id === unit.id : assigned.rows[0].extra_unit_id === unit.id);
      if (assigned.rows[0] && !alreadyInTarget) throw commerceError("这个角色已经安排在其他栏位", 409);
    }
    const previousUnitId = slot === "primary" ? regionState.rows[0].unit_id : regionState.rows[0].extra_unit_id;
    const preview = slot === "primary" ? await settleHomeRegion(client, accountId, regionId) : null;
    const balanceAfter = await creditHomeProduction(
      client,
      accountId,
      preview?.collectableDiamonds || 0,
      requestId,
      { reason: "reassign", regionId, slot, previousUnitId }
    );
    if (slot === "primary") {
      await client.query(
        `UPDATE cdp_home_regions
         SET unit_id = $3, production_value = $4, production_seconds = 0,
             settled_at = now(), updated_at = now()
         WHERE account_id = $1::uuid AND region_id = $2`,
        [accountId, regionId, unitId, preview.fractionalValue]
      );
    } else {
      await client.query(
        `UPDATE cdp_home_regions
         SET extra_unit_id = $3, updated_at = now()
         WHERE account_id = $1::uuid AND region_id = $2`,
        [accountId, regionId, unitId]
      );
    }
    if (previousUnitId && previousUnitId !== unitId) {
      await client.query(
        `UPDATE cdp_hero_profiles
         SET battle_unit_id = NULL, updated_at = now()
         WHERE account_id = $1::uuid AND battle_unit_id = $2`,
        [accountId, previousUnitId]
      );
    }
    const state = await heroHomeStateFromClient(client, accountId);
    await client.query("COMMIT");
    return { autoCollectedAmount: preview?.collectableDiamonds || 0, balanceAfter, state };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function upgradeHomeRegion(accountId, regionIdValue, requestIdValue) {
  const database = requirePool();
  const regionId = String(regionIdValue || "");
  const requestId = normalizedRequestId(requestIdValue);
  if (!HOME_REGION_BY_ID.has(regionId)) throw commerceError("家园区域不存在", 404);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    const repeated = await client.query(
      `SELECT result_data FROM cdp_hero_region_upgrade_requests
       WHERE account_id = $1::uuid AND request_id = $2`,
      [accountId, requestId]
    );
    if (repeated.rows[0]) {
      await client.query("COMMIT");
      return { ...repeated.rows[0].result_data, repeated: true };
    }
    const profileResult = await client.query(
      `SELECT building_materials FROM cdp_hero_profiles
       WHERE account_id = $1::uuid FOR UPDATE`,
      [accountId]
    );
    const regionResult = await client.query(
      `SELECT level FROM cdp_home_regions
       WHERE account_id = $1::uuid AND region_id = $2 FOR UPDATE`,
      [accountId, regionId]
    );
    if (!regionResult.rows[0]) throw commerceError("家园区域不存在", 404);
    const previousLevel = Number(regionResult.rows[0].level) || 0;
    const cost = regionUpgradeCost(previousLevel);
    if (!cost) throw commerceError("区域已经达到100级", 409);
    const materialsBefore = Number(profileResult.rows[0]?.building_materials) || 0;
    if (materialsBefore < cost) throw commerceError("建材不足", 409);
    await settleHomeRegion(client, accountId, regionId);
    const level = previousLevel + 1;
    const buildingMaterials = materialsBefore - cost;
    await client.query(
      `UPDATE cdp_home_regions SET level = $3, updated_at = now()
       WHERE account_id = $1::uuid AND region_id = $2`,
      [accountId, regionId, level]
    );
    await client.query(
      `UPDATE cdp_hero_profiles SET building_materials = $2, updated_at = now()
       WHERE account_id = $1::uuid`,
      [accountId, buildingMaterials]
    );
    const response = {
      rulesVersion: HERO_HOME_RULES.version,
      regionId,
      previousLevel,
      level,
      cost,
      buildingMaterials,
      extraSlotUnlocked: level >= HERO_HOME_RULES.extraSlotUnlockLevel
    };
    await client.query(
      `INSERT INTO cdp_hero_region_upgrade_requests (account_id, request_id, region_id, result_data)
       VALUES ($1::uuid, $2, $3, $4::jsonb)`,
      [accountId, requestId, regionId, JSON.stringify(response)]
    );
    const state = await heroHomeStateFromClient(client, accountId);
    await client.query("COMMIT");
    return { ...response, state };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function dispatchHeroTask(accountId, taskIdValue, unitIdsValue, requestIdValue, autoSelectValue = false) {
  const database = requirePool();
  const taskId = String(taskIdValue || "");
  const requestId = normalizedRequestId(requestIdValue);
  let unitIds = [...new Set((Array.isArray(unitIdsValue) ? unitIdsValue : []).map(String).filter(Boolean))];
  const autoSelect = autoSelectValue === true;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    const repeated = await client.query(
      `SELECT result_data FROM cdp_hero_task_requests
       WHERE account_id = $1::uuid AND request_id = $2`,
      [accountId, requestId]
    );
    if (repeated.rows[0]) {
      await client.query("COMMIT");
      return { ...repeated.rows[0].result_data, repeated: true };
    }
    await heroTasksFromClient(client, accountId, [], new Date());
    const taskResult = await client.query(
      `SELECT task_id, status, hero_count, duration_seconds, reward_materials, requirements
       FROM cdp_hero_tasks
       WHERE task_id = $1::uuid AND account_id = $2::uuid
       FOR UPDATE`,
      [taskId, accountId]
    );
    const task = taskResult.rows[0];
    if (!task) throw commerceError("任务不存在或已经刷新", 404);
    if (task.status !== "available") throw commerceError("任务已经开始或结束", 409);
    const runningResult = await client.query(
      `SELECT task_id, assigned_unit_ids FROM cdp_hero_tasks
       WHERE account_id = $1::uuid AND status = 'running'
       FOR UPDATE`,
      [accountId]
    );
    if (runningResult.rows.length >= 3) throw commerceError("同时最多执行3个英雄任务", 409);
    const ownedResult = await client.query(
      `SELECT unit_id FROM cdp_hero_units
       WHERE account_id = $1::uuid
       ORDER BY unit_id
       FOR UPDATE`,
      [accountId]
    );
    const ownedUnitIds = ownedResult.rows.map((row) => row.unit_id);
    const occupiedUnitIds = runningResult.rows.flatMap((row) => row.assigned_unit_ids || []);
    if (autoSelect) {
      unitIds = selectHeroTaskUnits(ownedUnitIds, occupiedUnitIds, task.hero_count, task.requirements);
      if (!unitIds) throw commerceError("当前没有可满足条件的空闲英雄，请等待执行中的英雄返回", 409);
    }
    if (unitIds.length !== Number(task.hero_count)) throw commerceError(`需要派遣${task.hero_count}名英雄`, 409);
    if (unitIds.some((unitId) => !ownedUnitIds.includes(unitId))) throw commerceError("包含尚未拥有的英雄", 403);
    const heroes = unitIds.map((unitId) => HOME_UNIT_BY_ID.get(unitId));
    if (heroes.some((unit) => !unit || unit.type !== "hero")) throw commerceError("任务只能派遣英雄", 409);
    if (!selectHeroTaskUnits(unitIds, [], task.hero_count, task.requirements)) throw commerceError("派遣英雄不满足区域或性别要求", 409);
    if (unitIds.some((unitId) => occupiedUnitIds.includes(unitId))) throw commerceError("部分英雄正在执行其他任务", 409);
    const updated = await client.query(
      `UPDATE cdp_hero_tasks
       SET status = 'running', assigned_unit_ids = $3::text[], started_at = now(),
           completes_at = now() + duration_seconds * interval '1 second', updated_at = now()
       WHERE task_id = $1::uuid AND account_id = $2::uuid
       RETURNING completes_at`,
      [taskId, accountId, unitIds]
    );
    const response = {
      rulesVersion: HERO_HOME_RULES.version,
      taskId,
      status: "running",
      assignedUnitIds: unitIds,
      completesAt: new Date(updated.rows[0].completes_at).toISOString()
    };
    await client.query(
      `INSERT INTO cdp_hero_task_requests (account_id, request_id, action, result_data)
       VALUES ($1::uuid, $2, 'dispatch', $3::jsonb)`,
      [accountId, requestId, JSON.stringify(response)]
    );
    const state = await heroHomeStateFromClient(client, accountId);
    await client.query("COMMIT");
    return { ...response, state };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function collectHeroTask(accountId, taskIdValue, requestIdValue) {
  const database = requirePool();
  const taskId = String(taskIdValue || "");
  const requestId = normalizedRequestId(requestIdValue);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    const repeated = await client.query(
      `SELECT result_data FROM cdp_hero_task_requests
       WHERE account_id = $1::uuid AND request_id = $2`,
      [accountId, requestId]
    );
    if (repeated.rows[0]) {
      await client.query("COMMIT");
      return { ...repeated.rows[0].result_data, repeated: true };
    }
    const taskResult = await client.query(
      `SELECT status, reward_materials, completes_at
       FROM cdp_hero_tasks
       WHERE task_id = $1::uuid AND account_id = $2::uuid
       FOR UPDATE`,
      [taskId, accountId]
    );
    const task = taskResult.rows[0];
    if (!task) throw commerceError("任务不存在", 404);
    const complete = task.status === "completed"
      || (task.status === "running" && task.completes_at && new Date(task.completes_at).getTime() <= Date.now());
    if (!complete) throw commerceError("任务尚未完成", 409);
    const rewardMaterials = Number(task.reward_materials) || 0;
    const profile = await client.query(
      `UPDATE cdp_hero_profiles
       SET building_materials = building_materials + $2, updated_at = now()
       WHERE account_id = $1::uuid
       RETURNING building_materials`,
      [accountId, rewardMaterials]
    );
    await client.query(
      `UPDATE cdp_hero_tasks
       SET status = 'collected', collected_at = now(), updated_at = now()
       WHERE task_id = $1::uuid AND account_id = $2::uuid`,
      [taskId, accountId]
    );
    const response = {
      rulesVersion: HERO_HOME_RULES.version,
      taskId,
      status: "collected",
      rewardMaterials,
      buildingMaterials: Number(profile.rows[0]?.building_materials) || 0
    };
    await client.query(
      `INSERT INTO cdp_hero_task_requests (account_id, request_id, action, result_data)
       VALUES ($1::uuid, $2, 'collect', $3::jsonb)`,
      [accountId, requestId, JSON.stringify(response)]
    );
    const state = await heroHomeStateFromClient(client, accountId);
    await client.query("COMMIT");
    return { ...response, state };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function chargeBoardHeroSkill(accountId, gameIdValue, unitIdValue, requestIdValue, effectData = {}) {
  const database = requirePool();
  const gameId = String(gameIdValue || "");
  const unitId = String(unitIdValue || "");
  const requestId = normalizedRequestId(requestIdValue);
  const unit = HOME_UNIT_BY_ID.get(unitId);
  if (!unit || unit.rarity !== "ssr") throw commerceError("SSR英雄技能不存在", 404);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    const repeated = await client.query(
      `SELECT cost, balance_after, heat_before, heat_after, effect_data
       FROM cdp_game_hero_skill_uses
       WHERE account_id = $1::uuid AND request_id = $2`,
      [accountId, requestId]
    );
    if (repeated.rows[0]) {
      await client.query("COMMIT");
      return {
        rulesVersion: HERO_HOME_RULES.boardSkillVersion,
        unitId,
        cost: Number(repeated.rows[0].cost),
        balanceAfter: Number(repeated.rows[0].balance_after),
        heatBefore: repeated.rows[0].heat_before == null ? null : Number(repeated.rows[0].heat_before),
        heatAfter: repeated.rows[0].heat_after == null ? null : Number(repeated.rows[0].heat_after),
        effectData: repeated.rows[0].effect_data || {},
        repeated: true
      };
    }
    const owned = await client.query(
      `SELECT stars, skill_heat FROM cdp_hero_units
       WHERE account_id = $1::uuid AND unit_id = $2
       FOR UPDATE`,
      [accountId, unitId]
    );
    if (!owned.rows[0]) throw commerceError("尚未拥有这个SSR英雄", 403);
    const stars = Number(owned.rows[0].stars) || 1;
    const paidState = unitId === "yokoyama-yui"
      ? { cost: HERO_HOME_RULES.yokoyamaSkillCost, heat: null }
      : paidBoardSkillState(stars, owned.rows[0].skill_heat);
    await client.query(
      `INSERT INTO cdp_diamond_wallets (account_id) VALUES ($1::uuid)
       ON CONFLICT (account_id) DO NOTHING`,
      [accountId]
    );
    const wallet = await client.query(
      `UPDATE cdp_diamond_wallets
       SET balance = balance - $2, updated_at = now()
       WHERE account_id = $1::uuid AND balance >= $2
       RETURNING balance`,
      [accountId, paidState.cost]
    );
    if (!wallet.rows[0]) throw commerceError("钻石余额不足", 409);
    const heatBefore = paidState.heat;
    const heatAfter = heatBefore == null ? null : Math.min(HERO_HOME_RULES.maxSkillHeat, heatBefore + 1);
    if (heatAfter != null) {
      await client.query(
        `UPDATE cdp_hero_units SET skill_heat = $3, updated_at = now()
         WHERE account_id = $1::uuid AND unit_id = $2`,
        [accountId, unitId, heatAfter]
      );
    }
    const balanceAfter = Number(wallet.rows[0].balance) || 0;
    const useId = randomUUID();
    await client.query(
      `INSERT INTO cdp_game_hero_skill_uses (
        use_id, game_id, account_id, unit_id, request_id, cost, balance_after,
        heat_before, heat_after, effect_data
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [useId, gameId, accountId, unitId, requestId, paidState.cost, balanceAfter, heatBefore, heatAfter, JSON.stringify(effectData)]
    );
    await client.query(
      `INSERT INTO cdp_diamond_ledger (
        account_id, amount, balance_after, reason, rules_version, idempotency_key, detail
      ) VALUES ($1::uuid, $2, $3, 'hero_skill', $4, $5, $6::jsonb)`,
      [accountId, -paidState.cost, balanceAfter, HERO_HOME_RULES.boardSkillVersion, `hero_skill:${accountId}:${requestId}`, JSON.stringify({ gameId, unitId, effectData })]
    );
    await client.query("COMMIT");
    return {
      rulesVersion: HERO_HOME_RULES.boardSkillVersion,
      unitId,
      cost: paidState.cost,
      balanceAfter,
      heatBefore,
      heatAfter,
      effectData
    };
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function selectBattleHero(accountId, unitIdValue) {
  const database = requirePool();
  const unitId = unitIdValue ? String(unitIdValue) : null;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    await client.query(
      `SELECT account_id FROM cdp_hero_profiles WHERE account_id = $1::uuid FOR UPDATE`,
      [accountId]
    );
    if (unitId) {
      const unit = HOME_UNIT_BY_ID.get(unitId);
      if (!unit || unit.type !== "hero") throw commerceError("只有已放置的英雄可以出战", 409);
      const placed = await client.query(
        `SELECT unit.stars
         FROM cdp_home_regions region
         JOIN cdp_hero_units unit
           ON unit.account_id = region.account_id
          AND unit.unit_id = $2
         WHERE region.account_id = $1::uuid
           AND (region.unit_id = $2 OR region.extra_unit_id = $2)
         FOR UPDATE OF region, unit`,
        [accountId, unitId]
      );
      if (!placed.rows[0]) throw commerceError("只有当前放置的英雄可以出战", 409);
    }
    await client.query(
      `UPDATE cdp_hero_profiles
       SET battle_unit_id = $2, updated_at = now()
       WHERE account_id = $1::uuid`,
      [accountId, unitId]
    );
    const state = await heroHomeStateFromClient(client, accountId);
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function pullHeroGacha(accountId, pullCountValue, requestIdValue) {
  const database = requirePool();
  const pullCount = Number(pullCountValue);
  if (pullCount !== 1 && pullCount !== 10) throw commerceError("抽卡次数只能是1次或10次");
  const requestId = normalizedRequestId(requestIdValue);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    const profileResult = await client.query(
      `SELECT universal_fragments, non_hero_pity_count, non_ssr_pity_count,
              building_materials, first_pull_completed, free_pull_used_at
       FROM cdp_hero_profiles WHERE account_id = $1::uuid FOR UPDATE`,
      [accountId]
    );
    const repeated = await client.query(
      `SELECT result_data FROM cdp_hero_gacha_requests
       WHERE account_id = $1::uuid AND request_id = $2`,
      [accountId, requestId]
    );
    if (repeated.rows[0]) {
      await client.query("COMMIT");
      return { ...repeated.rows[0].result_data, repeated: true };
    }
    const freePullBefore = freeHeroPullState(profileResult.rows[0]?.free_pull_used_at);
    const charge = heroGachaCharge(pullCount, freePullBefore.available);
    const { price, freePullUsed } = charge;
    const ownedResult = await client.query(
      `SELECT unit_id, stars, exclusive_fragments
       FROM cdp_hero_units WHERE account_id = $1::uuid FOR UPDATE`,
      [accountId]
    );
    await client.query(
      `INSERT INTO cdp_diamond_wallets (account_id) VALUES ($1::uuid)
       ON CONFLICT (account_id) DO NOTHING`,
      [accountId]
    );
    const wallet = price > 0
      ? await client.query(
          `UPDATE cdp_diamond_wallets
           SET balance = balance - $2, updated_at = now()
           WHERE account_id = $1::uuid AND balance >= $2
           RETURNING balance`,
          [accountId, price]
        )
      : await client.query(
          `SELECT balance FROM cdp_diamond_wallets
           WHERE account_id = $1::uuid
           FOR UPDATE`,
          [accountId]
        );
    if (!wallet.rows[0]) throw commerceError("钻石余额不足", 409);
    const owned = new Map(ownedResult.rows.map((row) => [row.unit_id, {
      stars: Number(row.stars) || 1,
      exclusiveFragments: Number(row.exclusive_fragments) || 0
    }]));
    const ownedHeroIds = new Set([...owned.keys()].filter((unitId) => HOME_UNIT_BY_ID.get(unitId)?.type === "hero"));
    let universalFragments = Number(profileResult.rows[0]?.universal_fragments) || 0;
    let pityCount = Number(profileResult.rows[0]?.non_hero_pity_count) || 0;
    let ssrPityCount = Number(profileResult.rows[0]?.non_ssr_pity_count) || 0;
    const buildingMaterialsBefore = Number(profileResult.rows[0]?.building_materials) || 0;
    let buildingMaterialsAwarded = 0;
    const firstPullGuaranteed = !profileResult.rows[0]?.first_pull_completed;
    const results = [];
    for (let index = 0; index < pullCount; index += 1) {
      const firstPullGuarantee = firstPullGuaranteed && index === 0;
      const pityGuarantee = pityCount >= HERO_HOME_RULES.pityPulls - 1;
      const ssrPityGuarantee = !firstPullGuarantee && ssrPityCount >= HERO_HOME_RULES.ssrPityPulls - 1;
      const preferredUnownedHeroIds = firstPullGuarantee
        ? [...HOME_UNIT_BY_ID.values()].filter((unit) => unit.rarity === "sr" && !ownedHeroIds.has(unit.id)).map((unit) => unit.id)
        : [];
      let forceRarity = null;
      if (firstPullGuarantee) forceRarity = "sr";
      else if (ssrPityGuarantee) forceRarity = "ssr";
      else if (pityGuarantee) forceRarity = Math.random() < HERO_HOME_RULES.ssrChance ? "ssr" : "sr";
      const draw = drawHeroGachaResult({ forceRarity, preferredUnownedHeroIds });
      if (draw.type === "materials") {
        buildingMaterialsAwarded += draw.amount;
        pityCount += 1;
        ssrPityCount += 1;
        results.push({
          index: index + 1,
          type: "materials",
          amount: draw.amount,
          guaranteed: null
        });
        continue;
      }
      const unit = draw.unit;
      const current = owned.get(unit.id);
      let conversion;
      if (!current) {
        await client.query(
          `INSERT INTO cdp_hero_units (account_id, unit_id) VALUES ($1::uuid, $2)`,
          [accountId, unit.id]
        );
        owned.set(unit.id, { stars: 1, exclusiveFragments: 0 });
        if (unit.type === "hero") ownedHeroIds.add(unit.id);
        conversion = { type: "new", amount: 1, label: "首次获得，解锁1星" };
      } else if (current.stars < 5) {
        const amount = unit.rarity === "ssr"
          ? HERO_HOME_RULES.ssrDuplicateFragments
          : unit.type === "hero"
            ? HERO_HOME_RULES.heroDuplicateFragments
          : HERO_HOME_RULES.minionDuplicateFragments;
        current.exclusiveFragments += amount;
        await client.query(
          `UPDATE cdp_hero_units
           SET exclusive_fragments = exclusive_fragments + $3, updated_at = now()
           WHERE account_id = $1::uuid AND unit_id = $2`,
          [accountId, unit.id, amount]
        );
        conversion = { type: "exclusive-fragments", amount, label: `转为${amount}专属碎片` };
      } else {
        const amount = unit.rarity === "ssr"
          ? HERO_HOME_RULES.maxSsrDuplicateUniversalFragments
          : unit.type === "hero"
            ? HERO_HOME_RULES.maxHeroDuplicateUniversalFragments
          : HERO_HOME_RULES.maxMinionDuplicateUniversalFragments;
        universalFragments += amount;
        conversion = { type: "universal-fragments", amount, label: `转为${amount}通用碎片` };
      }
      pityCount = unit.type === "hero" ? 0 : pityCount + 1;
      ssrPityCount = unit.rarity === "ssr" ? 0 : ssrPityCount + 1;
      results.push({
        index: index + 1,
        type: "unit",
        unit: { ...unit },
        stars: owned.get(unit.id)?.stars || 1,
        guaranteed: firstPullGuarantee
          ? "first-sr"
          : ssrPityGuarantee
            ? "ssr-pity"
            : pityGuarantee
              ? "hero-pity"
              : null,
        conversion
      });
    }
    const buildingMaterials = buildingMaterialsBefore + buildingMaterialsAwarded;
    const updatedProfile = await client.query(
      `UPDATE cdp_hero_profiles
       SET universal_fragments = $2, non_hero_pity_count = $3,
           non_ssr_pity_count = $4, building_materials = $5,
           first_pull_completed = true,
           free_pull_used_at = CASE WHEN $6 THEN now() ELSE free_pull_used_at END,
           updated_at = now()
       WHERE account_id = $1::uuid
       RETURNING free_pull_used_at`,
      [accountId, universalFragments, pityCount, ssrPityCount, buildingMaterials, freePullUsed]
    );
    const balanceAfter = Number(wallet.rows[0].balance) || 0;
    const freePullAfter = freeHeroPullState(updatedProfile.rows[0]?.free_pull_used_at);
    const response = {
      rulesVersion: HERO_HOME_RULES.version,
      pullCount,
      price,
      balanceAfter,
      pityCount,
      pityRemaining: HERO_HOME_RULES.pityPulls - pityCount,
      ssrPityCount,
      ssrPityRemaining: HERO_HOME_RULES.ssrPityPulls - ssrPityCount,
      buildingMaterialsAwarded,
      buildingMaterials,
      firstPullGuaranteeUsed: firstPullGuaranteed,
      freePullUsed,
      nextFreePullAt: freePullAfter.nextFreePullAt,
      results
    };
    await client.query(
      `INSERT INTO cdp_hero_gacha_requests (
        account_id, request_id, pull_count, price, balance_after, result_data
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
      [accountId, requestId, pullCount, price, balanceAfter, JSON.stringify(response)]
    );
    if (price > 0) {
      await client.query(
        `INSERT INTO cdp_diamond_ledger (
          account_id, amount, balance_after, reason, rules_version, idempotency_key, detail
        ) VALUES ($1::uuid, $2, $3, 'hero_gacha', $4, $5, $6::jsonb)`,
        [accountId, -price, balanceAfter, HERO_HOME_RULES.version, `hero_gacha:${accountId}:${requestId}`, JSON.stringify({ pullCount, results })]
      );
    }
    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function upgradeHeroUnit(accountId, unitIdValue, requestIdValue) {
  const database = requirePool();
  const unitId = String(unitIdValue || "");
  const unit = HOME_UNIT_BY_ID.get(unitId);
  if (!unit) throw commerceError("角色不存在", 404);
  const requestId = normalizedRequestId(requestIdValue);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await ensureHeroAccount(client, accountId);
    const profileResult = await client.query(
      `SELECT universal_fragments FROM cdp_hero_profiles
       WHERE account_id = $1::uuid FOR UPDATE`,
      [accountId]
    );
    const repeated = await client.query(
      `SELECT result_data FROM cdp_hero_upgrade_requests
       WHERE account_id = $1::uuid AND request_id = $2`,
      [accountId, requestId]
    );
    if (repeated.rows[0]) {
      await client.query("COMMIT");
      return { ...repeated.rows[0].result_data, repeated: true };
    }
    const unitResult = await client.query(
      `SELECT stars, exclusive_fragments FROM cdp_hero_units
       WHERE account_id = $1::uuid AND unit_id = $2 FOR UPDATE`,
      [accountId, unitId]
    );
    if (!unitResult.rows[0]) throw commerceError("尚未拥有这个角色", 403);
    const currentStars = Number(unitResult.rows[0].stars) || 1;
    const cost = starUpgradeCost(unitId, currentStars);
    if (!cost) throw commerceError("角色已经达到5星", 409);
    const placed = await client.query(
      `SELECT region_id FROM cdp_home_regions
       WHERE account_id = $1::uuid AND unit_id = $2`,
      [accountId, unitId]
    );
    if (placed.rows[0]) await settleHomeRegion(client, accountId, placed.rows[0].region_id);
    const exclusiveBefore = Number(unitResult.rows[0].exclusive_fragments) || 0;
    const universalBefore = Number(profileResult.rows[0]?.universal_fragments) || 0;
    const exclusiveUsed = Math.min(exclusiveBefore, cost);
    const missingExclusive = cost - exclusiveUsed;
    const universalUsed = unit.rarity === "ssr"
      ? missingExclusive * HERO_HOME_RULES.ssrUniversalFragmentRatio
      : missingExclusive;
    if (unit.type === "minion" && universalUsed > 0) throw commerceError("小兵升星只能使用专属碎片", 409);
    if (universalUsed > universalBefore) throw commerceError("碎片不足", 409);
    const nextStars = currentStars + 1;
    let exclusiveAfter = exclusiveBefore - exclusiveUsed;
    let convertedUniversal = 0;
    if (nextStars === 5 && exclusiveAfter > 0) {
      if (unit.rarity === "ssr") {
        convertedUniversal = exclusiveAfter * HERO_HOME_RULES.ssrLeftoverUniversalPerFragment;
        exclusiveAfter = 0;
      } else {
        const ratio = unit.type === "hero" ? 2 : 10;
        convertedUniversal = Math.floor(exclusiveAfter / ratio);
        exclusiveAfter %= ratio;
      }
    }
    const universalAfter = universalBefore - universalUsed + convertedUniversal;
    await client.query(
      `UPDATE cdp_hero_units
       SET stars = $3, exclusive_fragments = $4, updated_at = now()
       WHERE account_id = $1::uuid AND unit_id = $2`,
      [accountId, unitId, nextStars, exclusiveAfter]
    );
    await client.query(
      `UPDATE cdp_hero_profiles
       SET universal_fragments = $2, updated_at = now()
       WHERE account_id = $1::uuid`,
      [accountId, universalAfter]
    );
    const response = {
      rulesVersion: HERO_HOME_RULES.version,
      unit: { ...unit },
      previousStars: currentStars,
      stars: nextStars,
      cost,
      exclusiveUsed,
      universalUsed,
      convertedUniversal,
      exclusiveFragments: exclusiveAfter,
      universalFragments: universalAfter
    };
    await client.query(
      `INSERT INTO cdp_hero_upgrade_requests (account_id, request_id, unit_id, result_data)
       VALUES ($1::uuid, $2, $3, $4::jsonb)`,
      [accountId, requestId, unitId, JSON.stringify(response)]
    );
    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    rememberError(error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getBattleHeroSnapshots(accountIds = []) {
  const uniqueIds = [...new Set(accountIds.filter(Boolean).map(String))];
  if (!uniqueIds.length) return {};
  const result = await requirePool().query(
    `SELECT profile.account_id, profile.battle_unit_id, unit.stars, unit.skill_heat
     FROM cdp_hero_profiles profile
     JOIN cdp_hero_units unit
       ON unit.account_id = profile.account_id AND unit.unit_id = profile.battle_unit_id
     JOIN cdp_home_regions region
       ON region.account_id = profile.account_id
      AND (region.unit_id = profile.battle_unit_id OR region.extra_unit_id = profile.battle_unit_id)
     WHERE profile.account_id = ANY($1::uuid[])`,
    [uniqueIds]
  );
  return Object.fromEntries(result.rows.map((row) => [
    row.account_id,
    createBattleHeroSnapshot(row.battle_unit_id, row.stars, row.skill_heat)
  ]));
}

export async function getDiamondWallet(accountId, limit = 20) {
  const database = requirePool();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const [walletResult, rewardResult] = await Promise.all([
    database.query(
      `SELECT balance, lifetime_earned, updated_at
       FROM cdp_diamond_wallets
       WHERE account_id = $1::uuid`,
      [accountId]
    ),
    database.query(
      `SELECT
        reward.game_id, reward.reward_date, reward.status,
        reward.base_amount, reward.win_bonus, reward.title_bonus, reward.hero_bonus,
        reward.calculated_amount, reward.awarded_amount,
        reward.balance_after, reward.rules_version, reward.breakdown,
        game.finished_at
       FROM cdp_game_diamond_rewards reward
       JOIN cdp_games game ON game.game_id = reward.game_id
       WHERE reward.account_id = $1::uuid
       ORDER BY game.finished_at DESC, reward.game_id DESC
       LIMIT $2`,
      [accountId, safeLimit]
    )
  ]);
  const wallet = walletResult.rows[0];
  return {
    balance: Number(wallet?.balance) || 0,
    lifetimeEarned: Number(wallet?.lifetime_earned) || 0,
    updatedAt: wallet?.updated_at ? new Date(wallet.updated_at).toISOString() : null,
    rulesVersion: DIAMOND_REWARD_RULES.version,
    recentRewards: rewardResult.rows.map((row) => ({
      gameId: row.game_id,
      rewardDate: String(row.reward_date),
      status: row.status,
      baseAmount: Number(row.base_amount) || 0,
      winBonus: Number(row.win_bonus) || 0,
      titleBonus: Number(row.title_bonus) || 0,
      heroBonus: Number(row.hero_bonus) || 0,
      calculatedAmount: Number(row.calculated_amount) || 0,
      awardedAmount: Number(row.awarded_amount) || 0,
      balanceAfter: Number(row.balance_after) || 0,
      rulesVersion: row.rules_version,
      breakdown: row.breakdown || {},
      finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null
    }))
  };
}

function seasonError(message, statusCode = 400) {
  const error = new Error(message);
  error.status = statusCode;
  return error;
}

function normalizedSeasonId(value) {
  if (value === undefined || value === null || value === "" || value === "all") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw seasonError("赛季编号无效");
  return text;
}

function seasonValues(body = {}, current = null) {
  const name = Object.hasOwn(body, "name") ? String(body.name || "").trim() : String(current?.name || "").trim();
  const startsAtRaw = Object.hasOwn(body, "startsAt") ? body.startsAt : current?.starts_at;
  const endsAtRaw = Object.hasOwn(body, "endsAt") ? body.endsAt : current?.ends_at;
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (!name) throw seasonError("请输入赛季名称");
  if (name.length > 64) throw seasonError("赛季名称最多 64 个字");
  if (!startsAt || Number.isNaN(startsAt.getTime())) throw seasonError("请输入有效的赛季开始时间");
  if (endsAtRaw && (!endsAt || Number.isNaN(endsAt.getTime()))) throw seasonError("请输入有效的赛季结束时间");
  if (endsAt && endsAt <= startsAt) throw seasonError("赛季结束时间必须晚于开始时间");
  return {
    name,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null
  };
}

export async function listSeasons() {
  const result = await requirePool().query(`
    WITH current_season AS (
      SELECT season_id
      FROM cdp_seasons
      WHERE starts_at <= now()
        AND (ends_at IS NULL OR now() < ends_at)
      ORDER BY starts_at DESC, season_id DESC
      LIMIT 1
    )
    SELECT
      season.season_id, season.name, season.starts_at, season.ends_at,
      (season.season_id = current_season.season_id) AS is_active,
      season.created_at, season.updated_at
    FROM cdp_seasons season
    LEFT JOIN current_season ON true
    ORDER BY is_active DESC, starts_at DESC, season_id DESC
  `);
  return result.rows;
}

export async function saveSeason(seasonId, body, administratorId) {
  const database = requirePool();
  const normalizedId = normalizedSeasonId(seasonId);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    let current = null;
    if (normalizedId) {
      const currentResult = await client.query(
        "SELECT * FROM cdp_seasons WHERE season_id = $1::bigint FOR UPDATE",
        [normalizedId]
      );
      current = currentResult.rows[0] || null;
      if (!current) throw seasonError("赛季不存在", 404);
    }
    const values = seasonValues(body, current);
    const result = normalizedId
      ? await client.query(
        `UPDATE cdp_seasons
         SET name = $2, starts_at = $3::timestamptz, ends_at = $4::timestamptz,
             is_active = false, updated_at = now()
         WHERE season_id = $1::bigint
         RETURNING season_id, name, starts_at, ends_at, is_active, created_at, updated_at`,
        [normalizedId, values.name, values.startsAt, values.endsAt]
      )
      : await client.query(
        `INSERT INTO cdp_seasons(name, starts_at, ends_at, is_active, created_by)
         VALUES ($1, $2::timestamptz, $3::timestamptz, false, $4::uuid)
         RETURNING season_id, name, starts_at, ends_at, is_active, created_at, updated_at`,
        [values.name, values.startsAt, values.endsAt, administratorId]
      );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw seasonError("赛季名称已经存在", 409);
    throw error;
  } finally {
    client.release();
  }
}

async function seasonPeriod(database, seasonId) {
  const normalizedId = normalizedSeasonId(seasonId);
  if (!normalizedId) return null;
  const result = await database.query(
    "SELECT season_id, name, starts_at, ends_at, is_active FROM cdp_seasons WHERE season_id = $1::bigint",
    [normalizedId]
  );
  if (!result.rows[0]) throw seasonError("赛季不存在", 404);
  return result.rows[0];
}

const PERIOD_STATISTICS_SQL = `
  WITH identified_players AS (
    SELECT
      player.*,
      game.finished_at,
      jsonb_array_length(game.trick_history) AS game_tricks,
      coalesce(player.account_id::text, 'profile:' || player.profile_id) AS identity_key
    FROM cdp_game_players player
    JOIN cdp_games game ON game.game_id = player.game_id
    WHERE NOT player.is_ai
      AND (player.account_id IS NOT NULL OR player.profile_id IS NOT NULL)
      AND game.finished_at >= $1::timestamptz
      AND ($2::timestamptz IS NULL OR game.finished_at < $2::timestamptz)
      AND ($3::uuid IS NULL OR player.account_id = $3::uuid)
  ),
  latest_identity AS (
    SELECT DISTINCT ON (player.identity_key)
      player.identity_key,
      player.account_id,
      player.profile_id,
      player.name_snapshot,
      player.avatar_url_snapshot
    FROM identified_players player
    ORDER BY player.identity_key, player.finished_at DESC, player.game_id DESC
  ),
  base AS (
    SELECT
      player.identity_key,
      count(*)::integer AS games_played,
      count(*) FILTER (WHERE player.won)::integer AS wins,
      count(*) FILTER (WHERE NOT player.won)::integer AS losses,
      coalesce(sum(player.game_score), 0)::numeric(12, 2) AS total_score,
      coalesce(avg(player.game_score), 0)::numeric(12, 2) AS average_score,
      coalesce(sum(player.trick_score), 0)::integer AS total_trick_score,
      count(*) FILTER (WHERE player.role = '庄家')::integer AS banker_games,
      count(*) FILTER (WHERE player.role = '庄家' AND player.won)::integer AS banker_wins,
      coalesce(sum(player.game_score) FILTER (WHERE player.role = '庄家'), 0)::numeric(12, 2) AS banker_score,
      count(*) FILTER (WHERE player.role = '狗腿')::integer AS dogleg_games,
      count(*) FILTER (WHERE player.role = '狗腿' AND player.won)::integer AS dogleg_wins,
      coalesce(sum(player.game_score) FILTER (WHERE player.role = '狗腿'), 0)::numeric(12, 2) AS dogleg_score,
      count(*) FILTER (WHERE player.role = '闲家')::integer AS idle_games,
      count(*) FILTER (WHERE player.role = '闲家' AND player.won)::integer AS idle_wins,
      coalesce(sum(player.game_score) FILTER (WHERE player.role = '闲家'), 0)::numeric(12, 2) AS idle_score,
      coalesce(sum(player.dragged_red_fives), 0)::integer AS dragged_red_fives,
      coalesce(sum(player.dragged_diamond_fives), 0)::integer AS dragged_diamond_fives,
      coalesce(sum(player.throw_failures), 0)::integer AS throw_failures,
      coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'enemyDraggedRedFives', '')::numeric, 0)), 0)::integer AS opponent_dragged_red_fives,
      coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'enemyDraggedDiamondFives', '')::numeric, 0)), 0)::integer AS opponent_dragged_diamond_fives,
      coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'teammateDraggedRedFives', '')::numeric, 0)), 0)::integer AS teammate_dragged_red_fives,
      coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'teammateDraggedDiamondFives', '')::numeric, 0)), 0)::integer AS teammate_dragged_diamond_fives,
      coalesce(sum(coalesce(nullif(player.evaluation_data ->> 'wonTricks', '')::numeric, 0)), 0)::integer AS won_tricks,
      coalesce(sum(player.game_tricks), 0)::integer AS total_tricks,
      coalesce(sum((
        SELECT count(*)::integer
        FROM jsonb_array_elements(coalesce(game.setup_data #> '{fry,history}', '[]'::jsonb)) AS fry(action)
        WHERE fry.action ->> 'playerId' = player.room_player_id
      )), 0)::integer AS fry_count,
      coalesce(sum((
        SELECT coalesce(sum(jsonb_array_length(coalesce(play.action -> 'cards', '[]'::jsonb))), 0)::integer
        FROM jsonb_array_elements(coalesce(game.trick_history, '[]'::jsonb)) AS trick(action)
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(trick.action -> 'plays', '[]'::jsonb)) AS play(action)
        WHERE trick.action ->> 'winnerId' = player.room_player_id
          AND play.action ->> 'playerId' = player.room_player_id
      )), 0)::integer AS won_trick_cards,
      (count(*) * 53)::integer AS total_hand_cards,
      count(*) FILTER (WHERE game.bottom_winner_room_player_id = player.room_player_id)::integer AS bottom_wins
    FROM identified_players player
    JOIN cdp_games game ON game.game_id = player.game_id
    GROUP BY player.identity_key
  ),
  tag_totals AS (
    SELECT
      player.identity_key,
      count(*) FILTER (WHERE tag.tag_code = 'mvp')::integer AS mvp_count,
      count(*) FILTER (WHERE tag.tag_code = 'couch')::integer AS couch_count,
      count(*) FILTER (WHERE tag.tag_code = 'pit')::integer AS pit_count,
      count(*) FILTER (WHERE tag.tag_code = 'support')::integer AS support_count,
      count(*) FILTER (WHERE tag.tag_code = 'stiff')::integer AS stiff_count,
      count(*) FILTER (WHERE tag.tag_code = 'stiffest')::integer AS stiffest_count,
      count(*) FILTER (WHERE tag.tag_code = 'thunder')::integer AS thunder_count,
      count(*) FILTER (WHERE tag.tag_code = 'precision')::integer AS precision_count,
      count(*) FILTER (WHERE tag.tag_code = 'god')::integer AS god_count,
      count(*) FILTER (WHERE tag.tag_code = 'heaven')::integer AS heaven_count,
      count(*) FILTER (WHERE tag.tag_code = 'god-pit')::integer AS god_pit_count,
      count(*) FILTER (WHERE tag.tag_code = 'exhausted')::integer AS exhausted_count,
      count(*) FILTER (WHERE tag.tag_code = 'pillar')::integer AS pillar_count
    FROM cdp_game_tags tag
    JOIN identified_players player
      ON player.game_id = tag.game_id AND player.room_player_id = tag.room_player_id
    GROUP BY player.identity_key
  )
  SELECT
    latest.account_id,
    latest.profile_id,
    account.username,
    latest.name_snapshot AS latest_name,
    latest.avatar_url_snapshot AS latest_avatar_url,
    profile.avatar_frame,
    base.games_played,
    base.wins,
    base.losses,
    CASE WHEN base.games_played > 0 THEN round(base.wins::numeric * 100 / base.games_played, 2) ELSE 0 END AS win_rate,
    base.total_score,
    base.average_score,
    base.total_trick_score,
    base.banker_games,
    base.banker_wins,
    base.banker_score,
    base.dogleg_games,
    base.dogleg_wins,
    base.dogleg_score,
    base.idle_games,
    base.idle_wins,
    base.idle_score,
    base.dragged_red_fives,
    base.dragged_diamond_fives,
    base.throw_failures,
    base.opponent_dragged_red_fives,
    base.opponent_dragged_diamond_fives,
    base.teammate_dragged_red_fives,
    base.teammate_dragged_diamond_fives,
    base.won_tricks,
    base.total_tricks,
    base.fry_count,
    base.won_trick_cards,
    base.total_hand_cards,
    base.bottom_wins,
    coalesce(tags.mvp_count, 0) AS mvp_count,
    coalesce(tags.couch_count, 0) AS couch_count,
    coalesce(tags.pit_count, 0) AS pit_count,
    coalesce(tags.support_count, 0) AS support_count,
    coalesce(tags.stiff_count, 0) AS stiff_count,
    coalesce(tags.stiffest_count, 0) AS stiffest_count,
    coalesce(tags.thunder_count, 0) AS thunder_count,
    coalesce(tags.precision_count, 0) AS precision_count,
    coalesce(tags.god_count, 0) AS god_count,
    coalesce(tags.heaven_count, 0) AS heaven_count,
    coalesce(tags.god_pit_count, 0) AS god_pit_count,
    coalesce(tags.exhausted_count, 0) AS exhausted_count,
    coalesce(tags.pillar_count, 0) AS pillar_count
  FROM base
  JOIN latest_identity latest ON latest.identity_key = base.identity_key
  LEFT JOIN cdp_accounts account ON account.account_id = latest.account_id
  LEFT JOIN cdp_player_profiles profile ON profile.profile_id = latest.profile_id
  LEFT JOIN tag_totals tags ON tags.identity_key = base.identity_key
`;

export async function listPlayerStatistics(seasonId = null) {
  const database = requirePool();
  const period = await seasonPeriod(database, seasonId);
  const result = period
    ? await database.query(
      `${PERIOD_STATISTICS_SQL} ORDER BY total_score DESC, wins DESC, games_played DESC, latest_name ASC`,
      [period.starts_at, period.ends_at, null]
    )
    : await database.query(`
    SELECT * FROM cdp_player_statistics
    ORDER BY total_score DESC, wins DESC, games_played DESC, latest_name ASC
  `);
  return result.rows;
}

async function getPlayerRelationships(database, accountId, period) {
  const result = await database.query(
    `WITH target_games AS (
      SELECT
        target.game_id,
        target.room_player_id,
        target.team,
        target.game_score
      FROM cdp_game_players target
      JOIN cdp_games game ON game.game_id = target.game_id
      WHERE target.account_id = $1::uuid
        AND ($2::timestamptz IS NULL OR game.finished_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR game.finished_at < $3::timestamptz)
    ), paired_games AS (
      SELECT
        coalesce(other.account_id::text, 'profile:' || other.profile_id) AS identity_key,
        other.account_id,
        other.profile_id,
        other.name_snapshot,
        other.avatar_url_snapshot,
        game.finished_at,
        target.team = other.team AS same_team,
        target.game_score AS own_score
      FROM target_games target
      JOIN cdp_game_players other ON other.game_id = target.game_id
      JOIN cdp_games game ON game.game_id = target.game_id
      WHERE other.room_player_id <> target.room_player_id
        AND NOT other.is_ai
        AND (other.account_id IS NOT NULL OR other.profile_id IS NOT NULL)
    ), latest_identity AS (
      SELECT DISTINCT ON (paired.identity_key)
        paired.identity_key,
        paired.account_id,
        paired.profile_id,
        paired.name_snapshot,
        paired.avatar_url_snapshot
      FROM paired_games paired
      ORDER BY paired.identity_key, paired.finished_at DESC
    ), totals AS (
      SELECT
        paired.identity_key,
        paired.same_team,
        count(*)::integer AS games_played,
        coalesce(sum(paired.own_score), 0)::numeric(12, 2) AS own_score
      FROM paired_games paired
      GROUP BY paired.identity_key, paired.same_team
    )
    SELECT
      latest.account_id,
      latest.profile_id,
      account.username,
      latest.name_snapshot AS latest_name,
      latest.avatar_url_snapshot AS latest_avatar_url,
      profile.avatar_frame,
      totals.same_team,
      totals.games_played,
      totals.own_score
    FROM totals
    JOIN latest_identity latest ON latest.identity_key = totals.identity_key
    LEFT JOIN cdp_accounts account ON account.account_id = latest.account_id
    LEFT JOIN cdp_player_profiles profile ON profile.profile_id = latest.profile_id
    ORDER BY totals.same_team DESC, totals.games_played DESC, totals.own_score DESC, latest.name_snapshot ASC`,
    [accountId, period?.starts_at || null, period?.ends_at || null]
  );
  return {
    bonds: result.rows.filter((row) => row.same_team),
    opponents: result.rows.filter((row) => !row.same_team)
  };
}

export async function getPlayerStatistics(accountId, seasonId = null) {
  const database = requirePool();
  const period = await seasonPeriod(database, seasonId);
  const statisticsResult = period
    ? await database.query(PERIOD_STATISTICS_SQL, [period.starts_at, period.ends_at, accountId])
    : await database.query(
      "SELECT * FROM cdp_player_statistics WHERE account_id = $1::uuid",
      [accountId]
    );
  const player = statisticsResult.rows[0] || null;
  if (!player) return null;
  const [trendResult, relationships] = await Promise.all([
    database.query(
      `WITH scored_games AS (
        SELECT
          game.game_id,
          game.finished_at,
          player.game_score,
          sum(player.game_score) OVER (
            ORDER BY game.finished_at, game.game_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running_score
        FROM cdp_game_players player
        JOIN cdp_games game ON game.game_id = player.game_id
        WHERE player.account_id = $1::uuid
          AND ($2::timestamptz IS NULL OR game.finished_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR game.finished_at < $3::timestamptz)
      ), recent_games AS (
        SELECT * FROM scored_games
        ORDER BY finished_at DESC, game_id DESC
        LIMIT 100
      )
      SELECT game_id, finished_at, game_score, running_score
      FROM recent_games
      ORDER BY finished_at, game_id`,
      [accountId, period?.starts_at || null, period?.ends_at || null]
    ),
    getPlayerRelationships(database, accountId, period)
  ]);
  return { player, trend: trendResult.rows, relationships };
}

function historyTimestamp(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw seasonError(`${label}无效`);
  return date.toISOString();
}

function intersectHistoryPeriod(period, from, to) {
  const periodStart = period?.starts_at ? new Date(period.starts_at).getTime() : -Infinity;
  const periodEnd = period?.ends_at ? new Date(period.ends_at).getTime() : Infinity;
  const requestedStart = from ? new Date(from).getTime() : -Infinity;
  const requestedEnd = to ? new Date(to).getTime() : Infinity;
  const start = Math.max(periodStart, requestedStart);
  const end = Math.min(periodEnd, requestedEnd);
  return {
    from: Number.isFinite(start) ? new Date(start).toISOString() : null,
    to: Number.isFinite(end) ? new Date(end).toISOString() : null,
    empty: start >= end
  };
}

export async function listPlayerGames(accountId, options = {}) {
  const database = requirePool();
  const period = await seasonPeriod(database, options.seasonId);
  const range = intersectHistoryPeriod(
    period,
    historyTimestamp(options.from, "开始时间"),
    historyTimestamp(options.to, "结束时间")
  );
  if (range.empty) return [];
  const safeLimit = Math.max(1, Math.min(100, Number(options.limit) || 50));
  const result = await database.query(
    `SELECT
      game.game_id, game.room_code, game.started_at, game.finished_at,
      game.player_count, game.call_mode_name, game.trump_suit,
      game.threshold, game.idle_score, game.winner_team,
      target.role, target.team, target.won, target.trick_score, target.game_score,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'accountId', participant.account_id,
          'profileId', participant.profile_id,
          'name', participant.name_snapshot,
          'avatarUrl', participant.avatar_url_snapshot,
          'role', participant.role,
          'team', participant.team,
          'won', participant.won,
          'trickScore', participant.trick_score,
          'gameScore', participant.game_score
        ) ORDER BY participant.seat_index)
        FROM cdp_game_players participant
        WHERE participant.game_id = game.game_id
      ), '[]'::jsonb) AS players
    FROM cdp_game_players target
    JOIN cdp_games game ON game.game_id = target.game_id
    WHERE target.account_id = $1::uuid
      AND ($2::timestamptz IS NULL OR game.finished_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR game.finished_at < $3::timestamptz)
    ORDER BY game.finished_at DESC, game.game_id DESC
    LIMIT $4`,
    [accountId, range.from, range.to, safeLimit]
  );
  return result.rows;
}

const HISTORY_SUIT_DETAILS = {
  S: { name: "黑桃", symbol: "♠", color: "black" },
  H: { name: "红桃", symbol: "♥", color: "red" },
  C: { name: "草花", symbol: "♣", color: "green" },
  D: { name: "方块", symbol: "♦", color: "red" }
};

export function historyCardFromId(cardId) {
  if (cardId && typeof cardId === "object") return jsonValue(cardId, {});
  const id = String(cardId || "");
  const parts = id.split("-");
  const deck = Number(parts[0]) || 0;
  if (parts[1] === "JOKER") {
    const joker = String(parts[2] || "").toLowerCase();
    return {
      id,
      deck,
      type: "joker",
      joker,
      color: joker === "big" ? "red" : "black",
      rank: "JOKER",
      label: joker === "big" ? "大王" : "小王"
    };
  }
  const suit = parts[1] || "";
  const rank = parts.slice(2).join("-") || "";
  const detail = HISTORY_SUIT_DETAILS[suit] || { name: "", symbol: "", color: "" };
  return {
    id,
    deck,
    type: "normal",
    suit,
    suitName: detail.name,
    symbol: detail.symbol,
    color: detail.color,
    rank,
    label: `${detail.symbol}${rank}`
  };
}

function expandHistoryThrow(throwData) {
  if (!throwData) return null;
  return {
    ...throwData,
    attempt: (throwData.attempt || []).map(historyCardFromId),
    components: (throwData.components || []).map((component) => ({
      ...component,
      cards: (component.cards || []).map(historyCardFromId)
    }))
  };
}

function expandHistoryTricks(tricks) {
  return (tricks || []).map((trick) => ({
    ...trick,
    plays: [...(trick.plays || [])]
      .sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")))
      .map((play, turnIndex) => ({
        ...play,
        turnIndex,
        cards: (play.cards || []).map(historyCardFromId),
        throw: expandHistoryThrow(play.throw)
      }))
  }));
}

export async function getGameHistory(gameId) {
  const result = await requirePool().query(
    `SELECT
      game.game_id, game.room_code, game.started_at, game.finished_at,
      game.player_count, game.call_mode, game.call_mode_name,
      game.banker_bid_score, game.total_game_points, game.trump_suit,
      game.banker_room_player_id, game.dogleg_card,
      game.threshold, game.idle_score, game.score_diff, game.winner_team,
      game.bottom_winner_room_player_id, game.bottom_winner_team,
      game.bottom_points, game.bottom_cards, game.removed_cards,
      game.setup_data, game.result_data, game.trick_history,
      coalesce(jsonb_agg(jsonb_build_object(
        'roomPlayerId', player.room_player_id,
        'accountId', player.account_id,
        'profileId', player.profile_id,
        'name', player.name_snapshot,
        'avatarUrl', player.avatar_url_snapshot,
        'seatIndex', player.seat_index,
        'role', player.role,
        'team', player.team,
        'won', player.won,
        'trickScore', player.trick_score,
        'gameScore', player.game_score,
        'baseGameScore', player.base_game_score,
        'itemSelfDelta', player.item_self_delta,
        'itemOpponentDelta', player.item_opponent_delta,
        'itemScoreDelta', player.item_score_delta,
        'draggedRedFives', player.dragged_red_fives,
        'draggedDiamondFives', player.dragged_diamond_fives,
        'throwFailures', player.throw_failures,
        'evaluation', player.evaluation_data
      ) ORDER BY player.seat_index) FILTER (WHERE player.room_player_id IS NOT NULL), '[]'::jsonb) AS players
    FROM cdp_games game
    LEFT JOIN cdp_game_players player ON player.game_id = game.game_id
    WHERE game.game_id = $1::uuid
    GROUP BY game.game_id`,
    [gameId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    dogleg_card: row.dogleg_card ? historyCardFromId(row.dogleg_card) : null,
    bottom_cards: (row.bottom_cards || []).map(historyCardFromId),
    removed_cards: (row.removed_cards || []).map(historyCardFromId),
    trick_history: expandHistoryTricks(row.trick_history)
  };
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
        'gameScore', player.game_score,
        'baseGameScore', player.base_game_score,
        'itemScoreDelta', player.item_score_delta
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
