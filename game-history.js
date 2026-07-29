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
import { SHOP_RULES_VERSION } from "./shop-and-items.js";

const { Pool } = pg;
const RULES_VERSION = "2026-07-29";
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
  return {
    id: row.product_id,
    productType: row.product_type,
    assetKey: row.asset_key,
    name: row.name,
    description: row.description || "",
    price: Number(row.price) || 0,
    isListed: Boolean(row.is_listed),
    sortOrder: Number(row.sort_order) || 0,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function listShopProducts({ includeUnlisted = false } = {}) {
  const result = await requirePool().query(
    `SELECT product_id, product_type, asset_key, name, description,
            price, is_listed, sort_order, updated_at
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

export async function updateShopProduct(productId, body, administratorId) {
  const database = requirePool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT product_id, product_type, asset_key, name, description,
              price, is_listed, sort_order, updated_at
       FROM cdp_shop_products
       WHERE product_id = $1
       FOR UPDATE`,
      [String(productId || "")]
    );
    const current = currentResult.rows[0];
    if (!current) throw commerceError("商品不存在", 404);
    const price = Object.hasOwn(body || {}, "price") ? Number(body.price) : Number(current.price);
    if (!Number.isInteger(price) || price <= 0) throw commerceError("商品价格必须是大于零的整数");
    const isListed = Object.hasOwn(body || {}, "isListed") ? Boolean(body.isListed) : Boolean(current.is_listed);
    const updated = await client.query(
      `UPDATE cdp_shop_products
       SET price = $2, is_listed = $3, updated_by = $4::uuid, updated_at = now()
       WHERE product_id = $1
       RETURNING product_id, product_type, asset_key, name, description,
                 price, is_listed, sort_order, updated_at`,
      [current.product_id, price, isListed, administratorId]
    );
    await client.query(
      `INSERT INTO cdp_shop_product_audit (
        product_id, admin_account_id, before_data, after_data
      ) VALUES ($1, $2::uuid, $3::jsonb, $4::jsonb)`,
      [current.product_id, administratorId, JSON.stringify(current), JSON.stringify(updated.rows[0])]
    );
    await client.query("COMMIT");
    return publicShopProduct(updated.rows[0]);
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

export async function reserveGameItem(accountId, roomPlayerId, gameId, itemId, requestIdValue, effectData = {}) {
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
      return { repeated: true, use: repeated.rows[0] };
    }
    const product = await client.query(
      `SELECT 1 FROM cdp_shop_products
       WHERE product_type = 'consumable_item' AND asset_key = $1`,
      [itemId]
    );
    if (!product.rows[0]) throw commerceError("对局道具不存在", 404);
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
    return { repeated: false, use: use.rows[0] };
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
      diamondReward: jsonValue(
        playerResult.diamondReward || calculateDiamondReward({ gameScore: baseGameScore, tags }),
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
      events: jsonValue([...(room.events || [])].reverse(), [])
    },
    result: compactResult(result),
    trickHistory: compactTrickHistory(room.settledTrickHistory?.length ? room.settledTrickHistory : room.trickHistory),
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

    const rewardedGames = await client.query(
      `SELECT count(*)::integer AS count
       FROM cdp_game_diamond_rewards
       WHERE account_id = $1::uuid
         AND reward_date = $2::date
         AND status = 'awarded'`,
      [player.accountId, rewardDate]
    );
    const dailyCapped = Number(rewardedGames.rows[0]?.count || 0) >= DIAMOND_REWARD_RULES.dailyRewardGameLimit;
    const reward = player.diamondReward || calculateDiamondReward({
      gameScore: player.baseGameScore,
      tags: player.tags
    });
    const awardedAmount = dailyCapped ? 0 : Number(reward.totalAmount) || 0;
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

    const statusName = dailyCapped ? "daily-capped" : "awarded";
    const inserted = await client.query(
      `INSERT INTO cdp_game_diamond_rewards (
        game_id, room_player_id, account_id, reward_date, rules_version,
        status, base_amount, win_bonus, title_bonus, calculated_amount,
        awarded_amount, balance_after, breakdown
      ) VALUES (
        $1::uuid, $2, $3::uuid, $4::date, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13::jsonb
      )
      RETURNING account_id, status, awarded_amount, balance_after, reward_date`,
      [
        record.gameId,
        player.roomPlayerId,
        player.accountId,
        rewardDate,
        reward.rulesVersion || DIAMOND_REWARD_RULES.version,
        statusName,
        Number(reward.baseAmount) || 0,
        Number(reward.winBonus) || 0,
        Number(reward.titleBonus) || 0,
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
          game_score, base_game_score, item_self_delta, item_opponent_delta,
          item_score_delta, dragged_red_fives, dragged_diamond_fives, throw_failures,
          evaluation_data
        )
        SELECT
          $1::uuid, player.room_player_id, player.profile_id, player.account_id,
          player.seat_index, player.is_ai, player.name_snapshot, player.avatar_url_snapshot,
          player.role, player.team, player.won, player.trick_score, player.game_score,
          player.base_game_score, player.item_self_delta, player.item_opponent_delta,
          player.item_score_delta, player.dragged_red_fives, player.dragged_diamond_fives, player.throw_failures,
          player.evaluation_data
        FROM jsonb_to_recordset($2::jsonb) AS player(
          room_player_id text, profile_id text, account_id uuid, seat_index smallint,
          is_ai boolean, name_snapshot text, avatar_url_snapshot text, role text,
          team text, won boolean, trick_score integer, game_score numeric,
          base_game_score numeric, item_self_delta numeric, item_opponent_delta numeric,
          item_score_delta numeric,
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
          base_game_score: player.baseGameScore,
          item_self_delta: player.itemSelfDelta,
          item_opponent_delta: player.itemOpponentDelta,
          item_score_delta: player.itemScoreDelta,
          dragged_red_fives: player.draggedRedFives,
          dragged_diamond_fives: player.draggedDiamondFives,
          throw_failures: player.throwFailures,
          evaluation_data: player.evaluation
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

export async function getDiamondWallet(accountId, limit = 20) {
  const database = requirePool();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const rewardDate = diamondRewardDate(new Date().toISOString());
  const [walletResult, dailyResult, rewardResult] = await Promise.all([
    database.query(
      `SELECT balance, lifetime_earned, updated_at
       FROM cdp_diamond_wallets
       WHERE account_id = $1::uuid`,
      [accountId]
    ),
    database.query(
      `SELECT count(*)::integer AS rewarded_games
       FROM cdp_game_diamond_rewards
       WHERE account_id = $1::uuid
         AND reward_date = $2::date
         AND status = 'awarded'`,
      [accountId, rewardDate]
    ),
    database.query(
      `SELECT
        reward.game_id, reward.reward_date, reward.status,
        reward.base_amount, reward.win_bonus, reward.title_bonus,
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
    rewardDate,
    rewardedGamesToday: Number(dailyResult.rows[0]?.rewarded_games) || 0,
    dailyRewardGameLimit: DIAMOND_REWARD_RULES.dailyRewardGameLimit,
    rulesVersion: DIAMOND_REWARD_RULES.version,
    recentRewards: rewardResult.rows.map((row) => ({
      gameId: row.game_id,
      rewardDate: String(row.reward_date),
      status: row.status,
      baseAmount: Number(row.base_amount) || 0,
      winBonus: Number(row.win_bonus) || 0,
      titleBonus: Number(row.title_bonus) || 0,
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
  const isActive = Object.hasOwn(body, "isActive") ? Boolean(body.isActive) : Boolean(current?.is_active);
  if (!name) throw seasonError("请输入赛季名称");
  if (name.length > 64) throw seasonError("赛季名称最多 64 个字");
  if (!startsAt || Number.isNaN(startsAt.getTime())) throw seasonError("请输入有效的赛季开始时间");
  if (endsAtRaw && (!endsAt || Number.isNaN(endsAt.getTime()))) throw seasonError("请输入有效的赛季结束时间");
  if (endsAt && endsAt <= startsAt) throw seasonError("赛季结束时间必须晚于开始时间");
  return {
    name,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null,
    isActive
  };
}

export async function listSeasons() {
  const result = await requirePool().query(`
    SELECT season_id, name, starts_at, ends_at, is_active, created_at, updated_at
    FROM cdp_seasons
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
    if (values.isActive) {
      await client.query(
        "UPDATE cdp_seasons SET is_active = false, updated_at = now() WHERE is_active AND ($1::bigint IS NULL OR season_id <> $1::bigint)",
        [normalizedId]
      );
    }
    const result = normalizedId
      ? await client.query(
        `UPDATE cdp_seasons
         SET name = $2, starts_at = $3::timestamptz, ends_at = $4::timestamptz,
             is_active = $5, updated_at = now()
         WHERE season_id = $1::bigint
         RETURNING season_id, name, starts_at, ends_at, is_active, created_at, updated_at`,
        [normalizedId, values.name, values.startsAt, values.endsAt, values.isActive]
      )
      : await client.query(
        `INSERT INTO cdp_seasons(name, starts_at, ends_at, is_active, created_by)
         VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5::uuid)
         RETURNING season_id, name, starts_at, ends_at, is_active, created_at, updated_at`,
        [values.name, values.startsAt, values.endsAt, values.isActive, administratorId]
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
        'itemScoreDelta', player.item_score_delta
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
