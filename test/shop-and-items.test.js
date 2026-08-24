import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  AVATAR_FRAME_KEYS,
  applyWarGodAdjustments,
  CARD_SKIN_KEYS,
  DEFAULT_FRY_SUIT_ORDER,
  DEFAULT_SHOP_PRODUCTS,
  frySuitStrength,
  gameItemAccess,
  itemAllowedInStage,
  isItemUseStage,
  OTHER_CARDS_STAGE,
  randomFrySuitOrder,
  RESTART_CARD_STAGE,
  shopProductIdFromPath
} from "../shop-and-items.js";

test("hero cards and consumable items have an independent fixed shop catalog", () => {
  assert.ok(DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "consumable:restart-card"));
  assert.ok(DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "avatar-frame:warrior"));
  assert.ok(DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "avatar-frame:minions"));
  assert.ok(DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "avatar-frame:usagi"));
  assert.ok(DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "avatar-frame:toy-story"));
  assert.ok(!DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "avatar-frame:emerald"));
  assert.ok(!DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "avatar-frame:vip"));
  assert.ok(DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "card-skin:emerald"));
  assert.ok(!DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "card-skin:warrior"));
  assert.ok(!DEFAULT_SHOP_PRODUCTS.some((product) => product.id === "card-skin:minions"));
  assert.ok(AVATAR_FRAME_KEYS.includes("death-knight"));
  assert.ok(!AVATAR_FRAME_KEYS.includes("champion"));
  assert.ok(CARD_SKIN_KEYS.includes("champion"));
  const avatarFrameProducts = DEFAULT_SHOP_PRODUCTS.filter((product) => product.productType === "avatar_frame");
  assert.equal(avatarFrameProducts.length, AVATAR_FRAME_KEYS.length);
  assert.ok(avatarFrameProducts.every((product) => product.defaultPrice >= 6000 && product.defaultPrice <= 10000));
  assert.ok(!AVATAR_FRAME_KEYS.includes("vip-legend"));
  assert.ok(!avatarFrameProducts.some((product) => product.assetKey === "vip-legend"));
  assert.ok(CARD_SKIN_KEYS.includes("vip-legend"));
  assert.equal(avatarFrameProducts.find((product) => product.assetKey === "minions")?.defaultPrice, 6000);
  assert.equal(DEFAULT_SHOP_PRODUCTS.find((product) => product.id === "consumable:restart-card")?.defaultPrice, 3000);
  assert.equal(DEFAULT_SHOP_PRODUCTS.find((product) => product.id === "consumable:war-god-card")?.defaultPrice, 2000);
  assert.equal(DEFAULT_SHOP_PRODUCTS.find((product) => product.id === "consumable:colorful-card")?.defaultPrice, 1500);
  assert.equal(DEFAULT_SHOP_PRODUCTS.find((product) => product.id === "consumable:luck-card")?.defaultPrice, 150);
  assert.equal(DEFAULT_SHOP_PRODUCTS.find((product) => product.id === "card-skin:emerald")?.defaultPrice, 1500);
  assert.equal(DEFAULT_SHOP_PRODUCTS.find((product) => product.id === "card-skin:vip-legend")?.defaultPrice, 4500);
  assert.equal(isItemUseStage(RESTART_CARD_STAGE), true);
  assert.equal(isItemUseStage(OTHER_CARDS_STAGE), true);
  assert.equal(isItemUseStage("score-bidding"), false);
  assert.equal(isItemUseStage("burying"), false);
  assert.equal(itemAllowedInStage(RESTART_CARD_STAGE, "restart-card"), true);
  assert.equal(itemAllowedInStage(RESTART_CARD_STAGE, "colorful-card"), false);
  assert.equal(itemAllowedInStage(OTHER_CARDS_STAGE, "restart-card"), false);
  assert.equal(itemAllowedInStage(OTHER_CARDS_STAGE, "war-god-card"), true);
  assert.equal(itemAllowedInStage(OTHER_CARDS_STAGE, "colorful-card"), true);
  assert.equal(itemAllowedInStage(OTHER_CARDS_STAGE, "luck-card"), true);
});

test("avatar frame migration unlists retired themes and keeps audit rows", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/016_avatar_class_frames.sql", import.meta.url));
  const gameHistoryPath = fileURLToPath(new URL("../game-history.js", import.meta.url));
  const [migration, gameHistorySource] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(gameHistoryPath, "utf8")
  ]);

  assert.match(migration, /SET avatar_frame = ''[\s\S]*'vip'[\s\S]*'emerald'[\s\S]*'violet'[\s\S]*'champion'/);
  assert.match(migration, /SET is_listed = false[\s\S]*avatar-frame:vip[\s\S]*avatar-frame:champion/);
  assert.match(migration, /avatar_frame IN \([\s\S]*'warrior'[\s\S]*'death-knight'[\s\S]*'minions'[\s\S]*'usagi'[\s\S]*'toy-story'/);
  assert.match(migration, /'avatar-frame:vip-legend'[\s\S]*?, 500, true, 107\)/);
  assert.match(migration, /'avatar-frame:minions'[\s\S]*?, 300, true, 115\)/);
  assert.doesNotMatch(migration, /DELETE FROM cdp_cosmetic_entitlements/);
  assert.match(gameHistorySource, /version: 16,[\s\S]*016_avatar_class_frames\.sql/);
});

test("uploaded avatar frames use a validated storage asset and normal product catalog", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/017_uploaded_avatar_frames.sql", import.meta.url));
  const serverPath = fileURLToPath(new URL("../server.js", import.meta.url));
  const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));
  const [migration, gameHistorySource, serverSource, appSource] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(fileURLToPath(new URL("../game-history.js", import.meta.url)), "utf8"),
    readFile(serverPath, "utf8"),
    readFile(appPath, "utf8")
  ]);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS asset_url/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS asset_version/);
  assert.match(migration, /avatar_frame ~ '\^\[a-z0-9\]/);
  assert.match(gameHistorySource, /version: 17,[\s\S]*017_uploaded_avatar_frames\.sql/);
  assert.match(gameHistorySource, /createUploadedAvatarFrameProduct/);
  assert.match(serverSource, /pathParts\[2\] === "avatar-frames"[\s\S]*req\.method === "POST"/);
  assert.match(serverSource, /decodeAvatarFrameDataUrl/);
  assert.match(serverSource, /uploadSupabaseAvatarFrame/);
  assert.match(serverSource, /body\.specConfirmed !== true/);
  assert.match(serverSource, /pathParts\[1\] === "avatar-frames"[\s\S]*req\.method === "GET"/);
  assert.match(appSource, /data-form="upload-avatar-frame"/);
  assert.match(appSource, /function prepareAvatarFrameDataUrl/);
  assert.match(appSource, /specConfirmed: Boolean\(form\.get\("specConfirmed"\)\)/);
  assert.match(appSource, /function ensureAvatarFrameAssets/);
});

test("retired VIP legend avatar frame is unequipped and unlisted while its card skin remains", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/018_remove_vip_legend_avatar_frame.sql", import.meta.url));
  const gameHistoryPath = fileURLToPath(new URL("../game-history.js", import.meta.url));
  const [migration, gameHistorySource] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(gameHistoryPath, "utf8")
  ]);

  assert.match(migration, /SET avatar_frame = ''[\s\S]*avatar_frame = 'vip-legend'/);
  assert.match(migration, /SET is_listed = false[\s\S]*avatar-frame:vip-legend/);
  assert.doesNotMatch(migration, /card-skin:vip-legend/);
  assert.match(gameHistorySource, /version: 18,[\s\S]*018_remove_vip_legend_avatar_frame\.sql/);
});

test("game items allow AI games without charging inventory", () => {
  assert.deepEqual(gameItemAccess({
    players: [
      { accountId: "account-a", test: false },
      { accountId: "account-b", test: false }
    ]
  }), { eligible: true, freeUse: false });
  assert.deepEqual(gameItemAccess({
    players: [
      { accountId: "account-a", test: false },
      { accountId: null, test: true }
    ]
  }), { eligible: true, freeUse: true });
  assert.deepEqual(gameItemAccess({
    players: [
      { accountId: null, test: false },
      { accountId: null, test: true }
    ]
  }), { eligible: false, freeUse: false });
});

test("admin shop route restores encoded product ids", () => {
  assert.equal(shopProductIdFromPath("avatar-frame%3Aemerald"), "avatar-frame:emerald");
  assert.equal(shopProductIdFromPath("consumable%3Awar-god-card"), "consumable:war-god-card");
  assert.equal(shopProductIdFromPath("avatar-frame:emerald"), "avatar-frame:emerald");
  assert.equal(shopProductIdFromPath("%E0%A4%A"), "%E0%A4%A");
});

test("colorful card always returns a non-default suit permutation", () => {
  assert.deepEqual(DEFAULT_FRY_SUIT_ORDER, ["S", "H", "C", "D"]);
  assert.ok(frySuitStrength(DEFAULT_FRY_SUIT_ORDER).get("S") > frySuitStrength(DEFAULT_FRY_SUIT_ORDER).get("D"));
  for (let index = 0; index < 23; index += 1) {
    const order = randomFrySuitOrder(index);
    assert.equal(new Set(order).size, 4);
    assert.notDeepEqual(order, DEFAULT_FRY_SUIT_ORDER);
  }
});

test("war god doubles its owner and distributes the extra to opponents", () => {
  const outcome = applyWarGodAdjustments([
    { playerId: "idle-a", team: "idle", gameScore: 2 },
    { playerId: "idle-b", team: "idle", gameScore: 2 },
    { playerId: "banker-a", team: "banker", gameScore: -2 },
    { playerId: "banker-b", team: "banker", gameScore: -2 }
  ], ["idle-a"]);

  assert.deepEqual(outcome.playerResults.map((player) => player.gameScore), [4, 2, -3, -3]);
  assert.equal(outcome.playerResults.reduce((sum, player) => sum + player.itemScoreDelta, 0), 0);
  assert.equal(outcome.playerResults[0].baseGameScore, 2);
  assert.equal(outcome.playerResults[0].itemSelfDelta, 2);
});

test("war god stacking uses original scores and conserves hundredths", () => {
  const outcome = applyWarGodAdjustments([
    { playerId: "idle-a", team: "idle", gameScore: 1 },
    { playerId: "idle-b", team: "idle", gameScore: 1 },
    { playerId: "idle-c", team: "idle", gameScore: 1 },
    { playerId: "banker-a", team: "banker", gameScore: -1.5 },
    { playerId: "banker-b", team: "banker", gameScore: -1.5 }
  ], ["idle-a", "banker-a"]);

  const totalDeltaCents = outcome.playerResults.reduce((sum, player) => sum + Math.round(player.itemScoreDelta * 100), 0);
  assert.equal(totalDeltaCents, 0);
  assert.equal(outcome.playerResults.find((player) => player.playerId === "idle-a").itemSelfDelta, 1);
  assert.equal(outcome.playerResults.find((player) => player.playerId === "banker-a").itemSelfDelta, -1.5);
});

test("war god also doubles a loss and transfers the opposite adjustment", () => {
  const outcome = applyWarGodAdjustments([
    { playerId: "idle", team: "idle", gameScore: 2 },
    { playerId: "banker", team: "banker", gameScore: -2 }
  ], ["banker"]);

  assert.deepEqual(outcome.playerResults.map((player) => player.gameScore), [4, -4]);
  assert.equal(outcome.playerResults.reduce((sum, player) => sum + player.itemScoreDelta, 0), 0);
});

test("shop migration creates products, entitlements, inventory, uses, and split scores", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/013_shop_and_consumable_items.sql", import.meta.url));
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_shop_products/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_cosmetic_entitlements/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_consumable_inventory/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_game_item_uses/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS base_game_score/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS item_score_delta/);
  assert.match(migration, /source IN \('migration', 'purchase', 'admin_grant'\)/);
});

test("server and browser expose the shop, self-equipped cosmetics, and game-item routes", async () => {
  const serverPath = fileURLToPath(new URL("../server.js", import.meta.url));
  const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));
  const stylesPath = fileURLToPath(new URL("../public/styles.css", import.meta.url));
  const [serverSource, appSource, styles] = await Promise.all([
    readFile(serverPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(stylesPath, "utf8")
  ]);

  assert.match(serverSource, /pathParts\[1\] === "shop"/);
  assert.match(serverSource, /pathParts\[1\] === "cosmetics"/);
  assert.match(serverSource, /pathParts\[3\] === "item-use"/);
  assert.match(serverSource, /pathParts\[3\] === "item-stage-complete"/);
  assert.match(serverSource, /GAME_ITEM_STAGE_SECONDS/);
  assert.match(serverSource, /restartCardUsedPlayerIds/);
  assert.match(serverSource, /announceRoomNotice\(room, noticeText\)/);
  assert.doesNotMatch(serverSource, /本局已经有缤纷卡生效/);
  assert.match(serverSource, /\{ freeUse: access\.freeUse \}/);
  assert.match(appSource, /本局含 AI，不消耗卡片/);
  assert.match(serverSource, /refundOrphanedGameItemUses/);
  assert.match(serverSource, /updateShopProducts\(body\.products, admin\.id\)/);
  assert.match(serverSource, /pathParts\[2\] === "cosmetics" && pathParts\[3\] === "grants"/);
  assert.match(appSource, /data-action="show-shop"/);
  assert.match(appSource, /data-action="show-inventory"/);
  assert.match(appSource, /function renderInventoryPage/);
  assert.match(appSource, /预占中/);
  assert.match(appSource, /data-form="own-cosmetics"/);
  assert.match(appSource, /class="owned-avatar-frame-grid"/);
  assert.match(appSource, /function avatarFrameArtworkHtml/);
  assert.match(appSource, /shop-preview-label">透明素材/);
  assert.match(appSource, /这里只展示头像框透明素材/);
  assert.doesNotMatch(appSource, /牌桌实装|房间列表效果|title="叠加头像效果"/);
  assert.match(appSource, /data-action="equip-avatar-frame"/);
  assert.match(appSource, /头像框已经佩戴/);
  assert.match(appSource, /低饱和哑光边线/);
  assert.match(appSource, /data-form="save-shop-products"/);
  assert.match(appSource, /data-form="save-seasons"/);
  assert.match(appSource, /data-form="save-taunts"/);
  assert.match(appSource, /data-form="save-profiles"/);
  assert.match(appSource, /统一保存商品设置/);
  assert.match(appSource, /body: JSON\.stringify\(\{\s*products: changes\.map/);
  assert.doesNotMatch(appSource, /data-form="save-shop-product"/);
  assert.doesNotMatch(appSource, /data-form="save-taunt"/);
  assert.doesNotMatch(appSource, /data-form="update-profile"/);
  assert.match(appSource, /牌运之神庇佑着你/);
  assert.match(appSource, /function currentFrySuitStrength/);
  assert.match(appSource, /function renderWarGodMark/);
  assert.match(appSource, /data-action="complete-item-stage"/);
  assert.match(appSource, /function renderColorfulFryOrderBanner/);
  assert.match(appSource, /COLORFUL_FRY_ORDER_VISIBLE_STAGES = new Set\(\[\s*OTHER_CARDS_STAGE,[\s\S]*?"fry-burying"/);
  assert.match(appSource, /花色 \$\{escapeHtml\(currentBidRankName\(\)\)\}：\$\{escapeHtml\(order\)\}/);
  assert.match(styles, /\.colorful-fry-order-banner/);
  assert.match(appSource, /花色 \$\{escapeHtml\(currentBidRankName\(\)\)\} 大小（大 → 小）/);
  assert.match(appSource, /bidBeats\(current, bid, frySuitStrength \|\| undefined\)/);

  const adminProfileUpdate = serverSource.slice(
    serverSource.indexOf('if (pathParts[1] === "players")'),
    serverSource.indexOf('if (pathParts[1] === "rooms"')
  );
  assert.doesNotMatch(adminProfileUpdate, /Object\.hasOwn\(body, "avatarFrame"\)/);
  assert.doesNotMatch(adminProfileUpdate, /Object\.hasOwn\(body, "cardSkin"\)/);
});
