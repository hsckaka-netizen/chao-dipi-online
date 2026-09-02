import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, randomInt, randomUUID } from "node:crypto";

import {
  accountAuthStatus,
  accountIdFromRequest,
  authEmailForUsername,
  clearedSessionCookie,
  createSupabaseUser,
  decodeAvatarDataUrl,
  decodeAvatarFrameDataUrl,
  deleteSupabaseUser,
  ensureAvatarBucket,
  ensureAvatarFrameBucket,
  sessionCookie,
  signInSupabaseUser,
  updateSupabasePassword,
  uploadSupabaseAvatar,
  uploadSupabaseAvatarFrame,
  validatePassword,
  validateUsername
} from "./account-auth.js";
import { buildGameEvaluations, finalScoreWinnerTeam } from "./game-evaluations.js";
import { removeSpectatorsForAccount, roomPlayerForAccount } from "./room-identities.js";
import {
  draggedFiveActorId,
  forcedProtectedFiveIds
} from "./dragged-five-attribution.js";
import {
  applyDynamicDoglegPlay,
  applyHiddenDoglegPlay,
  applyRandomOrderDoglegPlay,
  createDynamicDoglegState,
  createHiddenDoglegState,
  createRandomOrderDoglegState,
  DOGLEG_MODE_DYNAMIC,
  DOGLEG_MODE_HIDDEN,
  DOGLEG_MODE_RANDOM_ORDER,
  DOGLEG_MODE_TRADITIONAL,
  doglegModeName,
  dynamicDoglegCardId,
  dynamicDoglegMarkCount,
  hiddenDoglegCardId,
  hiddenDoglegIsRevealed,
  hiddenDoglegPlayerIds,
  normalizeDoglegMode,
  sameRandomOrderDoglegCard
} from "./dogleg-mechanism.js";
import {
  allocateBankerTeamScores,
  BANKER_SCORE_MODE_AVERAGE,
  BANKER_SCORE_MODE_REMAINDER,
  bankerScoreModeName,
  DEFAULT_BANKER_SCORE_MODE,
  normalizeBankerScoreMode
} from "./banker-score-mode.js";
import {
  applyDiamondRewardPersistence,
  attachDiamondRewards,
  isDiamondEligibleGame
} from "./diamond-rewards.js";
import {
  applyWarGodAdjustments,
  AVATAR_FRAME_KEYS,
  CONSUMABLE_ITEMS,
  frySuitStrength,
  gameItemAccess,
  itemAllowedInStage,
  isConsumableItemId,
  isItemUseStage,
  OTHER_CARDS_STAGE,
  randomFrySuitOrder,
  RESTART_CARD_STAGE,
  shopProductIdFromPath
} from "./shop-and-items.js";
import { versionedAssetUrl } from "./public/asset-versions.js";
import { createStatePatch } from "./public/state-patch.js";
import { applyShenBiesanCardRules, suitTractorOrderValue } from "./public/replacement-rank-rules.js";
import { calculateHeroSkillReward, HERO_HOME_RULES } from "./hero-home.js";
import {
  assignHomeUnit,
  chargeBoardHeroSkill,
  claimDailyTask,
  collectHomeProduction,
  gameHistoryStatus,
  avatarFrameProductExists,
  consumeGameItemUses,
  collectHeroTask,
  createUploadedAvatarFrameProduct,
  dispatchHeroTask,
  grantDiamondsByAdmin,
  getPlayerShopState,
  getBattleHeroSnapshots,
  getDiamondWallet,
  getHeroHomeState,
  getGameHistory,
  getPlayerStatistics,
  initializeGameHistory,
  listPlayerGames,
  listPlayerStatistics,
  listRecentGames,
  listSeasons,
  listShopProducts,
  loadStoredTauntPresets,
  loadStoredAccounts,
  loadStoredPlayerProfiles,
  queueGameRecord,
  grantCosmeticEntitlement,
  purchaseShopProduct,
  pullHeroGacha,
  recordStoredAccountLogin,
  refundOrphanedGameItemUses,
  refundBoardHeroSkillUses,
  refundGameItemUses,
  reserveGameItem,
  resolveRestartGameItemUses,
  createStoredAccount,
  deleteStoredTauntPreset,
  saveSeason,
  saveEquippedCosmetics,
  saveStoredTauntPreset,
  saveStoredPlayerProfile,
  selectBattleHero,
  updateShopProduct,
  updateShopProducts,
  updateStoredAccount,
  upgradeHomeRegion,
  upgradeHeroUnit
} from "./game-history.js";
import {
  availableTauntPresets,
  DEFAULT_TAUNT_PRESETS,
  normalizeTauntPreset,
  tauntAvailableToAccount,
  validateTauntText
} from "./taunt-presets.js";
import {
  aiKnowsPlayerVoid,
  aiPublicPlayerStats,
  buildAiPublicKnowledge
} from "./ai-public-knowledge.js";
import { createSeededRandom, shuffleWithRandom, stableAiSeed } from "./ai-random.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 9;
const HAND_SIZE = 53;
const CALL_MODE_SCORE = "score";
const OPENING_BID_PERCENTAGES = new Set([10, 20, 30, 40]);
const DEFAULT_OPENING_BID_PERCENT = 40;
const SCORE_BID_SECONDS = 20;
const FRY_SECONDS = 20;
const GAME_ITEM_STAGE_SECONDS = Math.max(1, Number(process.env.GAME_ITEM_STAGE_SECONDS) || 20);
const BOARD_HERO_SKILL_SECONDS = Math.max(1, Number(process.env.BOARD_HERO_SKILL_SECONDS) || 20);
const GAME_ITEM_NOTICE_MS = Math.max(1000, Number(process.env.GAME_ITEM_NOTICE_MS) || 5000);
const TAUNT_DURATION_MS = Math.max(100, Number(process.env.TAUNT_DURATION_MS) || 4500);
const TAUNT_COOLDOWN_MS = Math.max(0, Number(process.env.TAUNT_COOLDOWN_MS) || 1500);
const BUILT_IN_AVATAR_FRAMES = new Set(["", ...AVATAR_FRAME_KEYS]);
let avatarFrames = new Set(BUILT_IN_AVATAR_FRAMES);
const CARD_SKINS = new Set(["", "emerald", "champion", "violet", "stormwind", "idol", "hellfire", "blood-elf", "endless-winter", "cr7", "paladin", "vip-legend"]);
const PLAY_EFFECTS = new Set(["", "fireworks"]);
const configuredAiSetupDelay = Number(process.env.AI_SETUP_DELAY_MS || 450);
const AI_SETUP_DELAY_MS = Number.isFinite(configuredAiSetupDelay) ? Math.max(0, configuredAiSetupDelay) : 450;
const configuredAiPlayDelay = Number(process.env.AI_PLAY_DELAY_MS || 1000);
const AI_PLAY_DELAY_MS = Number.isFinite(configuredAiPlayDelay) ? Math.max(0, configuredAiPlayDelay) : 1000;
const AI_STRATEGY_HEURISTIC = "heuristic-v2";
const AI_STRATEGY_MONTE_CARLO = "monte-carlo-v3";
const AI_STRATEGY_SAFE_FIVE = "monte-carlo-v4";
const AI_STRATEGY_FIXED_TEAM = "fixed-team-v4";
const AI_MONTE_CARLO_CANDIDATES = 3;
const AI_MONTE_CARLO_SAMPLES = 6;
const AI_MONTE_CARLO_ROLLOUT_WEIGHT = 0.3;
const AI_MONTE_CARLO_OVERRIDE_MARGIN = 8;
const MAX_GAME_EVENTS = 700;
const AVATAR_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_BOOTSTRAP_USERNAME = String(process.env.ADMIN_BOOTSTRAP_USERNAME || "").trim();
const ADMIN_BOOTSTRAP_PASSWORD = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "");

const suits = [
  { id: "S", name: "黑桃", symbol: "♠", color: "black", sort: 0 },
  { id: "H", name: "红桃", symbol: "♥", color: "red", sort: 1 },
  { id: "C", name: "草花", symbol: "♣", color: "black", sort: 2 },
  { id: "D", name: "方块", symbol: "♦", color: "red", sort: 3 }
];

const rankOrder = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const rankSort = new Map(rankOrder.map((rank, index) => [rank, index]));
const rulesRankSort = new Map([...rankSort, ["LOW_2", rankOrder.length]]);
const OLD_MAN_REPLACEMENT_RANKS = Object.freeze(["A", "K", "Q", "J", "10", "9", "8", "7", "6", "4"]);
const suitById = new Map(suits.map((suit) => [suit.id, suit]));
const suitStrength = new Map([
  ["D", 0],
  ["C", 1],
  ["H", 2],
  ["S", 3]
]);
const consumableItemById = new Map(CONSUMABLE_ITEMS.map((item) => [item.id, item]));
const autoPlaySuitOrder = new Map([
  ["D", 0],
  ["C", 1],
  ["H", 2],
  ["S", 3],
  ["TRUMP", 4],
  ["JOKER", 5]
]);
const rooms = new Map();
const accounts = new Map();
const accountIdsByUsername = new Map();
let tauntPresets = DEFAULT_TAUNT_PRESETS.map(normalizeTauntPreset);
const avatarUpdatesInFlight = new Set();
const authRuntime = {
  initialized: false,
  avatarStorageReady: false,
  avatarFrameStorageReady: false,
  bootstrapRequired: false,
  lastError: null
};
const initialPlayerProfiles = [
  { id: "player-benlei", name: "奔雷", avatarUrl: "/assets/avatars/benlei.png" },
  { id: "player-biesan", name: "瘪三", avatarUrl: "/assets/avatars/biesan.png" },
  { id: "player-denghuang", name: "登黄", avatarUrl: "/assets/joker-face.png" },
  { id: "player-diaonan", name: "吊男", avatarUrl: "/assets/avatars/diaonan.png" },
  { id: "player-gelu", name: "格鲁", avatarUrl: "/assets/avatars/gelu.png" },
  { id: "player-hanya", name: "寒鸭" },
  { id: "player-haohao", name: "浩浩", avatarUrl: "/assets/joker-face-small.png" },
  { id: "player-jiangmen", name: "姜门", avatarUrl: "/assets/avatars/jiangmen.png" },
  { id: "player-jiangzha", name: "蒋渣", avatarUrl: "/assets/avatars/jiangzha.png" },
  { id: "player-kaxiang", name: "卡翔", avatarUrl: "/assets/avatars/kaxiang.png" },
  { id: "player-lafang", name: "拉芳", avatarUrl: "/assets/avatars/lafang.png" },
  { id: "player-nanju", name: "楠局" },
  { id: "player-shuainan", name: "耍男", avatarUrl: "/assets/avatars/shuainan.png" },
  { id: "player-tianhua", name: "天花" },
  { id: "player-tieniu", name: "铁牛", avatarUrl: "/assets/avatars/tieniu.png" },
  { id: "player-xiaoxu", name: "小旭", avatarUrl: "/assets/avatars/xiaoxu.png" },
  { id: "player-zhengwei", name: "政委" },
  { id: "player-chenran", name: "陈然", avatarUrl: "/assets/avatars/chenran.png" }
];
const playerProfiles = new Map(initialPlayerProfiles.map((profile) => [
  profile.id,
  {
    id: profile.id,
    name: profile.name,
    avatarUrl: versionedAssetUrl(profile.avatarUrl || ""),
    avatarVersion: Number(profile.avatarVersion) || 0,
    avatarUpdatedAt: profile.avatarUpdatedAt || null,
    avatarFrame: avatarFrames.has(profile.avatarFrame) ? profile.avatarFrame : "",
    cardSkin: CARD_SKINS.has(profile.cardSkin) ? profile.cardSkin : "",
    playEffect: PLAY_EFFECTS.has(profile.playEffect) ? profile.playEffect : "",
    builtIn: true,
    updatedAt: now()
  }
]));

function id(size = 8) {
  return randomBytes(size).toString("base64url");
}

function roomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 16);
}

function normalizeAvatarFrame(value) {
  const normalized = String(value || "");
  return avatarFrames.has(normalized) ? normalized : "";
}

async function refreshAvatarFrameCatalog() {
  const products = await listShopProducts();
  const uploadedKeys = products
    .filter((product) => product.productType === "avatar_frame"
      && product.assetUrl
      && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(product.assetKey))
    .map((product) => product.assetKey);
  avatarFrames = new Set([...BUILT_IN_AVATAR_FRAMES, ...uploadedKeys]);
}

function normalizeCardSkin(value) {
  const normalized = String(value || "");
  return CARD_SKINS.has(normalized) ? normalized : "";
}

function normalizePlayEffect(value) {
  const normalized = String(value || "");
  return PLAY_EFFECTS.has(normalized) ? normalized : "";
}

function now() {
  return new Date().toISOString();
}

function addEvent(room, text) {
  room.events = [{ id: id(6), at: now(), text }, ...room.events].slice(0, MAX_GAME_EVENTS);
}

function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: versionedAssetUrl(profile.avatarUrl || ""),
    avatarVersion: Number(profile.avatarVersion) || 0,
    avatarFrame: normalizeAvatarFrame(profile.avatarFrame),
    cardSkin: normalizeCardSkin(profile.cardSkin),
    playEffect: normalizePlayEffect(profile.playEffect),
    builtIn: Boolean(profile.builtIn),
    updatedAt: profile.updatedAt
  };
}

function storeAccount(account) {
  const previous = accounts.get(account.id);
  if (previous?.username && previous.username.toLowerCase() !== String(account.username || "").toLowerCase()) {
    accountIdsByUsername.delete(previous.username.toLowerCase());
  }
  accounts.set(account.id, account);
  accountIdsByUsername.set(String(account.username || "").toLowerCase(), account.id);
  if (account.profileId) {
    const profile = profileForId(account.profileId);
    if (profile) profile.accountId = account.id;
  }
  return account;
}

function accountForUsername(username) {
  const accountId = accountIdsByUsername.get(String(username || "").trim().toLowerCase());
  return accountId ? accounts.get(accountId) || null : null;
}

function accountForRequest(req) {
  const account = accounts.get(accountIdFromRequest(req)) || null;
  return account?.enabled ? account : null;
}

function publicAccount(account) {
  if (!account) return null;
  const profile = account.profileId ? profileForId(account.profileId) : null;
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    enabled: Boolean(account.enabled),
    profileId: account.profileId || null,
    profile: profile ? publicProfile(profile) : null,
    createdAt: account.createdAt || null,
    lastLoginAt: account.lastLoginAt || null,
    nextAvatarChangeAt: profile ? nextAvatarChangeAt(profile) : null
  };
}

function requireAccount(res, req) {
  const account = accountForRequest(req);
  if (!account) writeJson(res, 401, { error: "请先登录账号" });
  return account;
}

function requireAdmin(res, req) {
  const account = requireAccount(res, req);
  if (!account) return null;
  if (account.role !== "admin") {
    writeJson(res, 403, { error: "只有管理员可以进行此操作" });
    return null;
  }
  return account;
}

function nextAvatarChangeAt(profile) {
  if (!profile?.avatarUpdatedAt) return null;
  return new Date(new Date(profile.avatarUpdatedAt).getTime() + AVATAR_CHANGE_COOLDOWN_MS).toISOString();
}

function avatarChangeAllowed(profile) {
  const availableAt = nextAvatarChangeAt(profile);
  return !availableAt || Date.now() >= new Date(availableAt).getTime();
}

function authStatusPayload(req) {
  const service = accountAuthStatus();
  return {
    ...service,
    initialized: authRuntime.initialized,
    avatarStorageReady: authRuntime.avatarStorageReady,
    avatarFrameStorageReady: authRuntime.avatarFrameStorageReady,
    bootstrapRequired: authRuntime.bootstrapRequired,
    legacyProfileSelection: !service.configured || !authRuntime.initialized,
    account: publicAccount(accountForRequest(req))
  };
}

function profileNameTaken(name, exceptId = "") {
  return [...playerProfiles.values()].some((profile) => profile.id !== exceptId && profile.name === name);
}

function profilesList() {
  return [...playerProfiles.values()]
    .map(publicProfile)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function roomStatusLabel(room) {
  if (room.status === "lobby") {
    if (room.stage === "finished") return "等待下一局";
    if (room.players.length >= MAX_PLAYERS) return "已满";
    return "可加入";
  }
  if (room.status === "finished") return "已结束";
  return "进行中";
}

function defaultDoglegCount(playerCount) {
  if (playerCount >= 7) return 2;
  if (playerCount >= 5) return 1;
  return 0;
}

function maxDoglegCount(playerCount) {
  return Math.max(0, playerCount - 3);
}

function clampDoglegCount(value, playerCount) {
  const parsed = Number(value);
  const fallback = defaultDoglegCount(playerCount);
  const count = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  return Math.max(0, Math.min(maxDoglegCount(playerCount), count));
}

function syncLobbyDoglegCount(room) {
  if (room.status !== "lobby" && room.status !== "finished") return;
  if (room.doglegConfigured) {
    room.doglegNeeded = clampDoglegCount(room.doglegNeeded, room.players.length);
  } else {
    room.doglegNeeded = clampDoglegCount(defaultDoglegCount(room.players.length), room.players.length);
  }
}

function joinableRoomsList() {
  return [...rooms.values()]
    .filter((room) => room.status === "lobby" || room.status === "dealt")
    .map((room) => ({
      roomId: room.id,
      status: room.status,
      stage: room.stage,
      joinable: room.status === "lobby" && room.players.length < MAX_PLAYERS,
      statusLabel: roomStatusLabel(room),
      hostName: playerName(room, room.hostId),
      playerCount: room.players.length,
      readyCount: readyPlayerCount(room),
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      phase: room.phase,
      callMode: normalizedCallMode(room.callMode),
      callModeName: callModeName(room.callMode),
      openingBidPercent: normalizedOpeningBidPercent(room.openingBidPercent),
      bankerScoreMode: normalizeBankerScoreMode(room.bankerScoreMode),
      bankerScoreModeName: bankerScoreModeName(room.bankerScoreMode),
      doglegMode: normalizeDoglegMode(room.doglegMode),
      doglegModeName: doglegModeName(room.doglegMode),
      doglegNeeded: clampDoglegCount(room.doglegNeeded, room.players.length),
      doglegMax: maxDoglegCount(room.players.length),
      createdAt: room.createdAt,
      players: room.players.map((player) => ({
        id: player.id,
        profileId: player.profileId || null,
        name: player.name,
        avatarUrl: player.avatarUrl || "",
        avatarFrame: normalizeAvatarFrame(player.avatarFrame),
        cardSkin: normalizeCardSkin(player.cardSkin),
        host: player.host,
        ready: Boolean(player.ready)
      }))
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function profileForId(profileId) {
  return playerProfiles.get(String(profileId || ""));
}

function createPlayer(profileOrName, host = false, test = false) {
  const profile = typeof profileOrName === "object" ? profileOrName : null;
  const name = profile ? profile.name : profileOrName;
  return {
    id: id(9),
    token: id(18),
    name,
    profileId: profile?.id || null,
    accountId: profile?.accountId || null,
    avatarUrl: profile?.avatarUrl || "",
    avatarFrame: normalizeAvatarFrame(profile?.avatarFrame),
    cardSkin: normalizeCardSkin(profile?.cardSkin),
    playEffect: normalizePlayEffect(profile?.playEffect),
    host,
    test,
    connected: false,
    ready: Boolean(test),
    nextRoundEntered: Boolean(test),
    autoPlayEnabled: false,
    score: 0,
    draggedRedFives: 0,
    draggedDiamondFives: 0,
    throwFailures: 0,
    hand: []
  };
}

function baseAiName(name) {
  return String(name || "").replace(/（AI）$/, "");
}

function createAiTestPlayer(room, fallbackIndex) {
  const usedNames = new Set(room.players.map((player) => baseAiName(player.name)));
  const availableProfiles = [...playerProfiles.values()].filter((profile) => !usedNames.has(profile.name));
  const pool = availableProfiles.length ? availableProfiles : [...playerProfiles.values()];
  const profile = pool.length ? pool[randomInt(pool.length)] : null;
  const player = createPlayer(`${profile?.name || `机器人${fallbackIndex}`}（AI）`, false, true);
  player.avatarUrl = profile?.avatarUrl || "";
  player.avatarFrame = normalizeAvatarFrame(profile?.avatarFrame);
  player.cardSkin = normalizeCardSkin(profile?.cardSkin);
  player.playEffect = normalizePlayEffect(profile?.playEffect);
  return player;
}

function syncProfileToRooms(profile) {
  for (const room of rooms.values()) {
    let changed = false;
    room.players.forEach((player) => {
      if (player.profileId !== profile.id) return;
      player.name = profile.name;
      player.avatarUrl = profile.avatarUrl || "";
      player.avatarFrame = normalizeAvatarFrame(profile.avatarFrame);
      player.cardSkin = normalizeCardSkin(profile.cardSkin);
      player.playEffect = normalizePlayEffect(profile.playEffect);
      changed = true;
    });
    if (changed) broadcast(room);
  }
}

async function initializePersistence() {
  const databaseStatus = await initializeGameHistory();
  if (!databaseStatus.connected || !databaseStatus.profileStorageReady) return;
  await refreshAvatarFrameCatalog();
  try {
    const itemRecovery = await refundOrphanedGameItemUses();
    if (itemRecovery.resolved) {
      console.log(`[game-items] refunded ${itemRecovery.resolved} orphaned reservations after restart`);
    }
  } catch (error) {
    console.error("[game-items] orphaned reservation recovery failed", error.message);
  }
  const storedProfiles = await loadStoredPlayerProfiles();
  storedProfiles.forEach((stored) => {
    const profile = profileForId(stored.id) || {
      id: stored.id,
      name: stored.name,
      avatarUrl: "",
      avatarVersion: 0,
      avatarUpdatedAt: null,
      avatarFrame: "",
      cardSkin: "",
      playEffect: "",
      builtIn: false,
      updatedAt: stored.updatedAt || now()
    };
    const storedName = cleanName(stored.name);
    if (storedName && !profileNameTaken(storedName, profile.id)) profile.name = storedName;
    profile.accountId = stored.accountId || null;
    profile.avatarUrl = versionedAssetUrl(stored.avatarUrl ?? profile.avatarUrl);
    profile.avatarVersion = Number(stored.avatarVersion) || 0;
    profile.avatarUpdatedAt = stored.avatarUpdatedAt || null;
    profile.avatarFrame = normalizeAvatarFrame(stored.avatarFrame);
    profile.cardSkin = normalizeCardSkin(stored.cardSkin);
    profile.playEffect = normalizePlayEffect(stored.playEffect);
    profile.updatedAt = stored.updatedAt || profile.updatedAt;
    playerProfiles.set(profile.id, profile);
    syncProfileToRooms(profile);
  });

  const storedAccounts = await loadStoredAccounts();
  storedAccounts.forEach(storeAccount);
  const storedTaunts = await loadStoredTauntPresets();
  if (storedTaunts.length) tauntPresets = storedTaunts.map(normalizeTauntPreset);
  if (accountAuthStatus().storageConfigured) {
    try {
      authRuntime.avatarStorageReady = Boolean((await ensureAvatarBucket()).ready);
      authRuntime.avatarFrameStorageReady = Boolean((await ensureAvatarFrameBucket()).ready);
    } catch (error) {
      authRuntime.lastError = error.message;
      console.error("[avatars] bucket initialization failed", error.message);
    }
  }

  if (![...accounts.values()].some((account) => account.role === "admin")) {
    const usernameCheck = validateUsername(ADMIN_BOOTSTRAP_USERNAME);
    const passwordCheck = validatePassword(ADMIN_BOOTSTRAP_PASSWORD);
    if (accountAuthStatus().configured && !usernameCheck.error && !passwordCheck.error) {
      const email = authEmailForUsername(usernameCheck.username);
      let authUser = null;
      try {
        authUser = await createSupabaseUser({
          email,
          password: passwordCheck.password,
          username: usernameCheck.username,
          role: "admin"
        });
        const persistence = await createStoredAccount({
          id: authUser.id,
          username: usernameCheck.username,
          authEmail: email,
          role: "admin",
          profileId: null,
          enabled: true,
          createdBy: null
        });
        if (persistence.status !== "saved") throw new Error("管理员账号写入数据库失败");
        storeAccount(persistence.account);
        console.log(`[accounts] bootstrap administrator created: ${usernameCheck.username}`);
      } catch (error) {
        if (authUser?.id) await deleteSupabaseUser(authUser.id).catch(() => {});
        authRuntime.lastError = error.message;
        console.error("[accounts] administrator bootstrap failed", error.message);
      }
    }
  }
  authRuntime.bootstrapRequired = ![...accounts.values()].some((account) => account.role === "admin");
  authRuntime.initialized = true;
}

function playerProfileFromBody(body, authAccount = null) {
  if (authAccount) {
    if (authAccount.role !== "player" || !authAccount.profileId) {
      return { error: "管理员账号未绑定玩家身份，不能直接加入牌局", status: 403 };
    }
    const accountProfile = profileForId(authAccount.profileId);
    if (!accountProfile) return { error: "账号绑定的玩家不存在", status: 409 };
    return { profile: accountProfile };
  }
  if (accountAuthStatus().configured) {
    return authRuntime.initialized
      ? { error: "请先登录玩家账号", status: 401 }
      : { error: "账号服务正在初始化，请稍后重试", status: 503 };
  }
  const profile = profileForId(body.profileId);
  if (!profile) return { error: "请选择玩家列表里的玩家", status: 400 };
  return { profile };
}

function adminAccountsPayload() {
  return {
    accounts: [...accounts.values()]
      .map(publicAccount)
      .sort((left, right) => left.username.localeCompare(right.username)),
    profiles: profilesList().map((profile) => {
      const account = [...accounts.values()].find((item) => item.profileId === profile.id) || null;
      return {
        ...profile,
        account: account ? {
          id: account.id,
          username: account.username,
          enabled: Boolean(account.enabled)
        } : null,
        nextAvatarChangeAt: nextAvatarChangeAt(profileForId(profile.id))
      };
    })
  };
}

function adminTauntsPayload() {
  return {
    taunts: tauntPresets
      .map(normalizeTauntPreset)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.text.localeCompare(right.text, "zh-CN")),
    accounts: [...accounts.values()]
      .filter((account) => account.role === "player")
      .map(publicAccount)
      .sort((left, right) => {
        const leftName = left.profile?.name || left.username;
        const rightName = right.profile?.name || right.username;
        return leftName.localeCompare(rightName, "zh-CN");
      })
  };
}

function adminTauntInput(body, current = null) {
  const textCheck = validateTauntText(Object.hasOwn(body, "text") ? body.text : current?.text);
  if (textCheck.error) return { error: textCheck.error, status: 400 };
  const duplicate = tauntPresets.find((preset) =>
    preset.id !== current?.id
    && preset.text.toLocaleLowerCase("zh-CN") === textCheck.text.toLocaleLowerCase("zh-CN")
  );
  if (duplicate) return { error: "这条嘲讽词已经存在", status: 409 };

  const availableToAll = Object.hasOwn(body, "availableToAll")
    ? Boolean(body.availableToAll)
    : current?.availableToAll !== false;
  const requestedAccountIds = availableToAll
    ? []
    : [...new Set((Array.isArray(body.accountIds) ? body.accountIds : current?.availableAccountIds || [])
      .map((accountId) => String(accountId || ""))
      .filter(Boolean))];
  const invalidAccountId = requestedAccountIds.find((accountId) => accounts.get(accountId)?.role !== "player");
  if (invalidAccountId) return { error: "授权名单中包含无效玩家账号", status: 400 };
  if (!availableToAll && !requestedAccountIds.length) {
    return { error: "请选择至少一个可使用的玩家，或改为所有玩家可用", status: 400 };
  }

  return {
    text: textCheck.text,
    enabled: Object.hasOwn(body, "enabled") ? Boolean(body.enabled) : current?.enabled !== false,
    availableToAll,
    availableAccountIds: requestedAccountIds
  };
}

function broadcastTauntPresetChanges() {
  for (const room of rooms.values()) broadcast(room);
}

async function createPlayerAccount(admin, body) {
  const usernameCheck = validateUsername(body.username);
  if (usernameCheck.error) throw Object.assign(new Error(usernameCheck.error), { status: 400 });
  const passwordCheck = validatePassword(body.password);
  if (passwordCheck.error) throw Object.assign(new Error(passwordCheck.error), { status: 400 });
  if (accountForUsername(usernameCheck.username)) throw Object.assign(new Error("用户名已经存在"), { status: 409 });
  const displayName = cleanName(body.displayName);
  if (!displayName) throw Object.assign(new Error("请输入玩家昵称"), { status: 400 });
  if (profileNameTaken(displayName)) throw Object.assign(new Error("这个玩家名称已经存在"), { status: 409 });
  const profile = {
    id: `player-${randomUUID()}`,
    name: displayName,
    avatarUrl: "",
    avatarVersion: 0,
    avatarUpdatedAt: null,
    avatarFrame: "",
    cardSkin: "",
    playEffect: "",
    builtIn: false,
    updatedAt: now()
  };

  const email = authEmailForUsername(usernameCheck.username);
  let authUser = null;
  try {
    authUser = await createSupabaseUser({
      email,
      password: passwordCheck.password,
      username: usernameCheck.username,
      role: "player"
    });
    const persistence = await createStoredAccount({
      id: authUser.id,
      username: usernameCheck.username,
      authEmail: email,
      role: "player",
      profileId: profile.id,
      enabled: true,
      createdBy: admin.id
    }, { ...profile, accountId: authUser.id });
    if (persistence.status !== "saved") throw new Error("玩家账号写入数据库失败");
    profile.accountId = authUser.id;
    playerProfiles.set(profile.id, profile);
    return storeAccount(persistence.account);
  } catch (error) {
    if (authUser?.id) await deleteSupabaseUser(authUser.id).catch(() => {});
    throw error;
  }
}

async function saveProfileAvatar(profile, dataUrl, { bypassCooldown = false } = {}) {
  if (avatarUpdatesInFlight.has(profile.id)) {
    throw Object.assign(new Error("头像正在上传，请勿重复提交"), { status: 409 });
  }
  avatarUpdatesInFlight.add(profile.id);
  try {
    if (!bypassCooldown && !avatarChangeAllowed(profile)) {
      const error = new Error(`头像每 7 天只能更换一次，下次可更换时间：${new Date(nextAvatarChangeAt(profile)).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
      error.status = 429;
      error.nextAvatarChangeAt = nextAvatarChangeAt(profile);
      throw error;
    }
    const avatar = decodeAvatarDataUrl(dataUrl);
    const nextVersion = (Number(profile.avatarVersion) || 0) + 1;
    const avatarUrl = await uploadSupabaseAvatar(profile.id, nextVersion, avatar);
    const nextProfile = {
      ...profile,
      avatarUrl,
      avatarVersion: nextVersion,
      avatarUpdatedAt: now(),
      updatedAt: now()
    };
    const persistence = await saveStoredPlayerProfile(nextProfile);
    if (persistence.status !== "saved") {
      throw Object.assign(new Error("头像已上传，但玩家资料保存失败，请稍后重试"), { status: 503 });
    }
    Object.assign(profile, nextProfile);
    playerProfiles.set(profile.id, profile);
    syncProfileToRooms(profile);
    authRuntime.avatarStorageReady = true;
    return profile;
  } finally {
    avatarUpdatesInFlight.delete(profile.id);
  }
}

function createEmptyTrick(number = 1, leaderId = null) {
  return {
    number,
    leaderId,
    winnerId: null,
    winnerName: null,
    points: 0,
    winningPlayIndex: null,
    plays: []
  };
}

function normalizedCallMode() {
  return CALL_MODE_SCORE;
}

function callModeName() {
  return "叫分抢庄";
}

function emptySetup() {
  return {
    bid: null,
    bidHistory: [],
    biddingTurnPlayerId: null,
    passIds: [],
    scoreBid: null,
    fry: null
  };
}

function totalGamePoints(room) {
  return room.players.length * 100;
}

function normalizedOpeningBidPercent(value) {
  const percent = Number(value);
  return OPENING_BID_PERCENTAGES.has(percent) ? percent : DEFAULT_OPENING_BID_PERCENT;
}

function openingBankerScore(room) {
  return Math.round(totalGamePoints(room) * normalizedOpeningBidPercent(room.openingBidPercent) / 100);
}

function createScoreBidSetup(room) {
  const minimum = openingBankerScore(room);
  const firstPlayer = randomPlayer(room) || null;
  const openedAt = now();
  const current = firstPlayer
    ? {
        playerId: firstPlayer.id,
        score: minimum,
        at: openedAt
      }
    : null;
  return {
    minimum,
    current,
    history: firstPlayer
      ? [{
          playerId: firstPlayer.id,
          score: minimum,
          increment: 0,
          at: openedAt
        }]
      : [],
    passIds: [],
    deadlineAt: firstPlayer ? new Date(Date.now() + SCORE_BID_SECONDS * 1000).toISOString() : null,
    openedAt
  };
}

function emptyGameItems() {
  return {
    uses: [],
    frySuitOrder: null,
    luckyPlayerIds: [],
    stage: null
  };
}

function emptyBoardHeroSkills() {
  return {
    shenBiesan: {
      eligiblePlayerIds: [],
      completedPlayerIds: [],
      applicantPlayerIds: [],
      candidateRanksByPlayerId: {},
      selectedRankByPlayerId: {},
      deadlineAt: null,
      resolving: false
    },
    yokoyama: {
      queuePlayerIds: [],
      currentPlayerId: null,
      candidates: [],
      paid: false,
      deadlineAt: null
    },
    shenJiangwen: {
      offeredPlayerIds: [],
      directPlayerId: null
    }
  };
}

function emptyBoardHeroEffects() {
  return {
    uses: [],
    replacementRank: null,
    seatSwaps: []
  };
}

function gameRank(card) {
  return card?.rulesRank || card?.rank || "";
}

function cardRulesRankSort(card) {
  return rulesRankSort.get(gameRank(card)) ?? 99;
}

function announceRoomNotice(room, text, bad = false) {
  const createdAt = now();
  room.notice = {
    id: id(8),
    text,
    bad: Boolean(bad),
    createdAt,
    expiresAt: new Date(new Date(createdAt).getTime() + GAME_ITEM_NOTICE_MS).toISOString()
  };
}

function beginScoreBidding(room) {
  clearGameItemStageTimer(room);
  clearBoardHeroSkillTimer(room);
  room.stage = "score-bidding";
  room.phase = "叫分抢庄";
  room.gameItems.stage = null;
  room.setup.scoreBid = createScoreBidSetup(room);
  if (!room.setup.scoreBid?.current) return;
  const scoreBid = room.setup.scoreBid;
  room.phase = `${playerName(room, scoreBid.current.playerId)} 以 ${scoreBid.current.score} 分起叫，等待其他玩家加分或过`;
  addEvent(room, `${playerName(room, scoreBid.current.playerId)} 以 ${scoreBid.current.score} 分起叫抢庄`);
}

function completedGameItemPlayerIds(room) {
  return new Set(room.gameItems?.stage?.completedPlayerIds || []);
}

function allPlayersCompletedGameItemStage(room) {
  const completedIds = completedGameItemPlayerIds(room);
  return room.players.every((player) => player.test || completedIds.has(player.id));
}

function beginGameItemStage(room, stage) {
  clearGameItemStageTimer(room);
  const completedPlayerIds = room.players
    .filter((player) => player.test || (
      stage === RESTART_CARD_STAGE
      && (room.restartCardUsedPlayerIds || []).includes(player.id)
    ))
    .map((player) => player.id);
  const openedAt = now();
  room.stage = stage;
  room.phase = stage === RESTART_CARD_STAGE ? "重开卡使用阶段" : "其他卡牌使用阶段";
  room.gameItems.stage = {
    type: stage,
    openedAt,
    deadlineAt: new Date(new Date(openedAt).getTime() + GAME_ITEM_STAGE_SECONDS * 1000).toISOString(),
    completedPlayerIds
  };
  if (allPlayersCompletedGameItemStage(room)) advanceGameItemStage(room);
}

function advanceGameItemStage(room) {
  if (room.stage === RESTART_CARD_STAGE) {
    beginGameItemStage(room, OTHER_CARDS_STAGE);
    return true;
  }
  if (room.stage === OTHER_CARDS_STAGE) {
    beginShenBiesanSkillStage(room);
    return true;
  }
  return false;
}

function playerHasBoardHero(room, player, heroId) {
  return Boolean(
    isDiamondEligibleGame(room)
    && player
    && !player.test
    && player.accountId
    && player.battleHeroSnapshot?.heroId === heroId
  );
}

function hasPairedPrintedTwo(player) {
  return suits.some((suit) => player.hand.filter((card) => card.type === "normal" && card.rank === "2" && card.suit === suit.id).length >= 2);
}

function ownedReplacementRanksForShenBiesan(player) {
  return OLD_MAN_REPLACEMENT_RANKS.filter((rank) => player.hand.some((card) => card.type === "normal" && card.rank === rank));
}

function pairedReplacementRanksForShenBiesan(player) {
  return OLD_MAN_REPLACEMENT_RANKS.filter((rank) => suits.some((suit) => (
    player.hand.filter((card) => card.type === "normal" && card.rank === rank && card.suit === suit.id).length >= 2
  )));
}

function shenBiesanEligiblePlayers(room) {
  return room.players.filter((player) => {
    if (!playerHasBoardHero(room, player, "shen-biesan")) return false;
    const stars = Math.max(1, Math.min(5, Number(player.battleHeroSnapshot?.stars) || 1));
    const candidateCount = HERO_HOME_RULES.shenBiesanCandidateCounts[stars - 1];
    const requiredPairedCount = HERO_HOME_RULES.shenBiesanRequiredPairedCounts[stars - 1];
    return ownedReplacementRanksForShenBiesan(player).length >= candidateCount
      && pairedReplacementRanksForShenBiesan(player).length >= requiredPairedCount
      && (stars === 5 || !hasPairedPrintedTwo(player));
  });
}

function candidateRanksForShenBiesan(player) {
  const stars = Math.max(1, Math.min(5, Number(player.battleHeroSnapshot?.stars) || 1));
  const candidateCount = HERO_HOME_RULES.shenBiesanCandidateCounts[stars - 1];
  const requiredPairedCount = HERO_HOME_RULES.shenBiesanRequiredPairedCounts[stars - 1];
  const selected = shuffle(pairedReplacementRanksForShenBiesan(player)).slice(0, requiredPairedCount);
  const remaining = shuffle(ownedReplacementRanksForShenBiesan(player).filter((rank) => !selected.includes(rank)))
    .slice(0, candidateCount - selected.length);
  return shuffle([...selected, ...remaining]);
}

function beginShenBiesanSkillStage(room) {
  clearGameItemStageTimer(room);
  clearBoardHeroSkillTimer(room);
  const eligiblePlayers = shenBiesanEligiblePlayers(room);
  const eligiblePlayerIds = eligiblePlayers.map((player) => player.id);
  const candidateRanksByPlayerId = Object.fromEntries(eligiblePlayers.map((player) => {
    return [player.id, candidateRanksForShenBiesan(player)];
  }));
  room.boardHeroSkills.shenBiesan = {
    eligiblePlayerIds,
    completedPlayerIds: [],
    applicantPlayerIds: [],
    candidateRanksByPlayerId,
    selectedRankByPlayerId: {},
    deadlineAt: eligiblePlayerIds.length
      ? new Date(Date.now() + BOARD_HERO_SKILL_SECONDS * 1000).toISOString()
      : null,
    resolving: false
  };
  if (!eligiblePlayerIds.length) {
    beginScoreBidding(room);
    return false;
  }
  room.stage = "shen-biesan-skill";
  room.phase = "玉面雷神发动阶段";
  addEvent(room, "进入玉面雷神发动阶段，符合条件的玩家可选择是否申请发动");
  return true;
}

function applyShenBiesanReplacement(room, replacementRank) {
  const annotate = (card) => applyShenBiesanCardRules(card, replacementRank);
  room.players.forEach((player) => {
    player.hand = sortHand(player.hand.map(annotate));
  });
  room.kitty = room.kitty.map(annotate);
  room.removedCards = room.removedCards.map(annotate);
  room.boardHeroEffects.replacementRank = replacementRank;
}

function recordBoardHeroSkillUse(room, player, heroId, payment, effect = {}) {
  const use = {
    playerId: player.id,
    accountId: player.accountId,
    heroId,
    skillName: player.battleHeroSnapshot?.skillName || "",
    stars: player.battleHeroSnapshot?.stars || 1,
    cost: payment.cost,
    heatBefore: payment.heatBefore,
    heatAfter: payment.heatAfter,
    effect,
    at: now()
  };
  room.boardHeroEffects.uses.push(use);
  return use;
}

async function chargeRoomBoardHeroSkill(room, ...args) {
  if (room.boardHeroSkillUseInFlight) {
    const error = new Error("正在处理其他英雄技能，请稍后重试");
    error.status = 409;
    throw error;
  }
  room.boardHeroSkillUseInFlight = true;
  try {
    return await chargeBoardHeroSkill(...args);
  } finally {
    room.boardHeroSkillUseInFlight = false;
  }
}

async function resolveShenBiesanSkillStage(room) {
  const state = room.boardHeroSkills.shenBiesan;
  if (room.stage !== "shen-biesan-skill" || state.resolving) return false;
  state.resolving = true;
  state.deadlineAt = null;
  clearBoardHeroSkillTimer(room);
  const applicants = shuffle(state.applicantPlayerIds.map((playerId) => playerById(room, playerId)).filter(Boolean));
  for (const player of applicants) {
    try {
      const replacementRank = state.selectedRankByPlayerId[player.id];
      const payment = await chargeRoomBoardHeroSkill(
        room,
        player.accountId,
        room.gameRecordId,
        "shen-biesan",
        `shen-biesan:${room.gameRecordId}:${player.id}`,
        { replacementRank }
      );
      applyShenBiesanReplacement(room, replacementRank);
      recordBoardHeroSkillUse(room, player, "shen-biesan", payment, { replacementRank });
      addEvent(room, `${player.name} 发动玉面雷神，本局以 ${replacementRank} 替代 2 参与叫主、炒底和牌力判定`);
      break;
    } catch (error) {
      addEvent(room, `${player.name} 发动玉面雷神失败：${error.message}`);
    }
  }
  beginScoreBidding(room);
  return true;
}

async function submitShenBiesanSkillChoice(room, player, activate, replacementRank = "") {
  if (room.stage !== "shen-biesan-skill") return { error: "当前不是玉面雷神发动阶段", status: 409 };
  const state = room.boardHeroSkills.shenBiesan;
  if (!state.eligiblePlayerIds.includes(player.id)) return { error: "你当前不满足玉面雷神发动条件", status: 403 };
  if (state.completedPlayerIds.includes(player.id)) return { error: "你已经完成选择", status: 409 };
  if (activate && !(state.candidateRanksByPlayerId[player.id] || []).includes(replacementRank)) {
    return { error: "请从本局随机生成的成对牌中选择一张替代2", status: 400 };
  }
  state.completedPlayerIds.push(player.id);
  if (activate) {
    state.applicantPlayerIds.push(player.id);
    state.selectedRankByPlayerId[player.id] = replacementRank;
  }
  addEvent(room, `${player.name}${activate ? "申请发动玉面雷神" : "放弃发动玉面雷神"}`);
  if (state.completedPlayerIds.length >= state.eligiblePlayerIds.length) await resolveShenBiesanSkillStage(room);
  return { ok: true };
}

function autoAdvanceExpiredGameItemStage(room) {
  if (!isItemUseStage(room?.stage)) return false;
  const deadline = new Date(room.gameItems?.stage?.deadlineAt || "").getTime();
  if (!Number.isFinite(deadline) || Date.now() < deadline) return false;
  return advanceGameItemStage(room);
}

function completeGameItemStageForPlayer(room, player) {
  if (!isItemUseStage(room.stage)) return { error: "当前不是卡牌使用阶段", status: 409 };
  const completedIds = completedGameItemPlayerIds(room);
  completedIds.add(player.id);
  room.gameItems.stage.completedPlayerIds = [...completedIds];
  const advanced = allPlayersCompletedGameItemStage(room) ? advanceGameItemStage(room) : false;
  return { ok: true, advanced };
}

function createDeck(deckCount) {
  const deck = [];
  for (let deckIndex = 1; deckIndex <= deckCount; deckIndex += 1) {
    for (const suit of suits) {
      for (const rank of rankOrder) {
        deck.push({
          id: `${deckIndex}-${suit.id}-${rank}`,
          deck: deckIndex,
          type: "normal",
          suit: suit.id,
          suitName: suit.name,
          symbol: suit.symbol,
          color: suit.color,
          rank,
          label: `${suit.symbol}${rank}`,
          sort: suit.sort * 100 + rankSort.get(rank)
        });
      }
    }
    deck.push({
      id: `${deckIndex}-JOKER-BIG`,
      deck: deckIndex,
      type: "joker",
      joker: "big",
      color: "red",
      rank: "JOKER",
      label: "JOKER",
      sort: 500
    });
    deck.push({
      id: `${deckIndex}-JOKER-SMALL`,
      deck: deckIndex,
      type: "joker",
      joker: "small",
      color: "black",
      rank: "JOKER",
      label: "JOKER",
      sort: 501
    });
  }
  return deck;
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function deckForPlayerCount(playerCount) {
  const fullDeck = createDeck(playerCount);
  const removeCount = Math.max(0, playerCount - 6);
  if (!removeCount) return { deck: fullDeck, removedCards: [] };

  const selectedSuits = shuffle(suits.map((suit) => suit.id)).slice(0, removeCount);
  const deck = [...fullDeck];
  const removedCards = selectedSuits.map((suit) => {
    const candidates = deck
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.type === "normal" && card.rank === "4" && card.suit === suit);
    const selected = candidates[randomInt(candidates.length)];
    return deck.splice(selected.index, 1)[0];
  });
  return { deck, removedCards };
}

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const aSort = a.type === "normal" ? (suitById.get(a.suit)?.sort || 0) * 100 + cardRulesRankSort(a) : a.sort;
    const bSort = b.type === "normal" ? (suitById.get(b.suit)?.sort || 0) * 100 + cardRulesRankSort(b) : b.sort;
    return aSort - bSort || a.deck - b.deck || a.id.localeCompare(b.id);
  });
}

async function lockBattleHeroesForDeal(room) {
  room.players.forEach((player) => {
    player.battleHeroSnapshot = null;
  });
  const accountIds = room.players.filter((player) => !player.test && player.accountId).map((player) => player.accountId);
  if (!accountIds.length) return;
  let timeoutId = null;
  try {
    const snapshots = await Promise.race([
      getBattleHeroSnapshots(accountIds),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("读取上阵英雄超时")), 1500);
        timeoutId.unref?.();
      })
    ]);
    room.players.forEach((player) => {
      player.battleHeroSnapshot = snapshots[player.accountId] || null;
    });
  } catch (error) {
    console.error("[hero-home] battle hero snapshot unavailable; game continues", error.message);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function deal(room, options = {}) {
  clearAiSetupTimer(room);
  clearAiPlayTimer(room);
  clearScoreBidTimer(room);
  clearFryTimer(room);
  clearGameItemStageTimer(room);
  clearBoardHeroSkillTimer(room);
  clearRoomTaunts(room);
  room.events = [];
  const count = room.players.length;
  const preparedDeck = deckForPlayerCount(count);
  const deck = shuffle(preparedDeck.deck);
  room.removedCards = preparedDeck.removedCards;
  room.players.forEach((player, playerIndex) => {
    const start = playerIndex * HAND_SIZE;
    player.hand = sortHand(deck.slice(start, start + HAND_SIZE));
    player.score = 0;
    player.draggedRedFives = 0;
    player.draggedDiamondFives = 0;
    player.throwFailures = 0;
    player.ready = false;
    player.nextRoundEntered = false;
  });
  room.kitty = deck.slice(count * HAND_SIZE);
  room.status = "dealt";
  room.callMode = CALL_MODE_SCORE;
  room.openingBidPercent = normalizedOpeningBidPercent(room.openingBidPercent);
  room.bankerScoreMode = normalizeBankerScoreMode(room.bankerScoreMode);
  room.stage = RESTART_CARD_STAGE;
  room.phase = "重开卡使用阶段";
  room.startedAt = now();
  room.kittySize = room.kitty.length;
  room.bankerId = null;
  room.trumpSuit = null;
  room.doglegCard = null;
  room.doglegPlayerIds = [];
  room.dynamicDogleg = null;
  room.hiddenDogleg = null;
  room.randomOrderDogleg = null;
  room.doglegNeeded = clampDoglegCount(room.doglegNeeded, count);
  room.result = null;
  room.setup = emptySetup();
  room.currentTrick = null;
  room.trickHistory = [];
  room.settledTrickHistory = [];
  room.provisionalWinnerPlayerIds = [];
  room.playPauseUntil = null;
  room.notice = null;
  room.gameItems = emptyGameItems();
  room.boardHeroSkills = emptyBoardHeroSkills();
  room.boardHeroEffects = emptyBoardHeroEffects();
  room.boardHeroSkillUseInFlight = false;
  if (!options.preserveRestartUsage) room.restartCardUsedPlayerIds = [];
  if (room.removedCards.length) {
    addEvent(room, `本局开局移除 ${room.removedCards.map((card) => card.label).join("、")}，底牌保持 ${room.kittySize} 张`);
  }
  if (gameItemAccess(room).eligible) beginGameItemStage(room, RESTART_CARD_STAGE);
  else beginShenBiesanSkillStage(room);
}

function readyPlayerCount(room) {
  return room.players.filter((player) => player.ready).length;
}

function allPlayersReady(room) {
  return room.players.length > 0 && room.players.every((player) => player.ready);
}

function allPlayersEnteredNextRound(room) {
  return room.players.length > 0 && room.players.every((player) => player.test || player.nextRoundEntered);
}

function finalizeNextRoundLobby(room) {
  if (room.stage !== "finished" || !allPlayersEnteredNextRound(room)) return false;
  resetRoomToLobby(room, { preserveReady: true });
  addEvent(room, "所有玩家已确认下一局，等待房主开始");
  return true;
}

function resetRoomToLobby(room, options = {}) {
  clearAiSetupTimer(room);
  clearAiPlayTimer(room);
  clearScoreBidTimer(room);
  clearFryTimer(room);
  clearGameItemStageTimer(room);
  clearBoardHeroSkillTimer(room);
  clearRoomTaunts(room);
  const readyPlayerId = options.readyPlayerId || null;
  const previousReady = new Map(room.players.map((player) => [player.id, Boolean(player.ready)]));
  room.status = "lobby";
  room.stage = "lobby";
  room.phase = "等待玩家加入";
  room.startedAt = null;
  room.gameRecordId = null;
  room.kitty = [];
  room.removedCards = [];
  room.kittySize = room.players.length;
  room.bankerId = null;
  room.trumpSuit = null;
  room.doglegCard = null;
  room.doglegPlayerIds = [];
  room.dynamicDogleg = null;
  room.hiddenDogleg = null;
  room.randomOrderDogleg = null;
  syncLobbyDoglegCount(room);
  room.result = null;
  room.setup = emptySetup();
  room.currentTrick = null;
  room.trickHistory = [];
  room.settledTrickHistory = [];
  room.provisionalWinnerPlayerIds = [];
  room.playPauseUntil = null;
  room.notice = null;
  room.gameItems = emptyGameItems();
  room.boardHeroSkills = emptyBoardHeroSkills();
  room.boardHeroEffects = emptyBoardHeroEffects();
  room.restartCardUsedPlayerIds = [];
  room.boardHeroSkillUseInFlight = false;
  room.events = [];
  room.players.forEach((player) => {
    player.hand = [];
    player.autoPlayEnabled = false;
    player.score = 0;
    player.draggedRedFives = 0;
    player.draggedDiamondFives = 0;
    player.throwFailures = 0;
    player.ready = player.test || player.id === readyPlayerId || (options.preserveReady && previousReady.get(player.id));
    player.nextRoundEntered = false;
  });
}

function publicCard(card) {
  return {
    id: card.id,
    label: card.label,
    suit: card.suit || null,
    suitName: card.suitName || null,
    symbol: card.symbol || "",
    color: card.color,
    rank: card.rank,
    rulesRank: card.rulesRank || null,
    rulesReplacementRank: card.rulesReplacementRank || null,
    deck: card.deck,
    type: card.type,
    joker: card.joker || null
  };
}

function playerFor(room, playerId, token) {
  return room.players.find((player) => player.id === playerId && player.token === token) || null;
}

function playerName(room, playerId) {
  return room.players.find((player) => player.id === playerId)?.name || "玩家";
}

function suitName(suitId) {
  return suitById.get(suitId)?.name || "";
}

function publicBid(room, bid) {
  if (!bid) return null;
  return {
    actionId: bid.actionId || "",
    playerId: bid.playerId,
    playerName: playerName(room, bid.playerId),
    count: bid.count,
    suit: bid.suit,
    suitName: suitName(bid.suit),
    cards: (bid.cards || []).map(publicCard),
    random: Boolean(bid.random),
    direct: Boolean(bid.direct),
    at: bid.at || null
  };
}

function publicScoreBid(room, scoreBid) {
  if (!scoreBid) return null;
  const current = scoreBid.current || null;
  return {
    minimum: scoreBid.minimum || openingBankerScore(room),
    currentScore: current?.score || 0,
    currentPlayerId: current?.playerId || null,
    currentPlayerName: current?.playerId ? playerName(room, current.playerId) : "",
    deadlineAt: scoreBid.deadlineAt || null,
    passIds: [...(scoreBid.passIds || [])],
    history: (scoreBid.history || []).map((item) => ({
      playerId: item.playerId,
      playerName: playerName(room, item.playerId),
      score: item.score,
      increment: item.increment || 0,
      at: item.at
    }))
  };
}

function currentTrumpSuit(room) {
  const fry = room.setup?.fry || null;
  if (room.trumpSuit) return room.trumpSuit;
  if (room.stage === "fry-burying" && fry?.pendingBid?.suit) return fry.pendingBid.suit;
  if (fry?.lastBid?.suit) return fry.lastBid.suit;
  return room.setup?.bid?.suit || null;
}

function currentBidRankName(room) {
  return room.boardHeroEffects?.replacementRank || "2";
}

function setupSnapshot(room, viewer = null) {
  const fry = room.setup?.fry || null;
  const currentSuit = currentTrumpSuit(room);
  const mode = normalizeDoglegMode(room.doglegMode);
  const doglegHits = mode === DOGLEG_MODE_DYNAMIC && Array.isArray(room.dynamicDogleg?.hits)
    ? room.dynamicDogleg.hits.slice(-20).map((hit) => ({ ...hit }))
    : mode === DOGLEG_MODE_HIDDEN && Array.isArray(room.hiddenDogleg?.reveals)
      ? room.hiddenDogleg.reveals.slice(-20).map((hit) => ({ ...hit }))
      : mode === DOGLEG_MODE_RANDOM_ORDER && Array.isArray(room.randomOrderDogleg?.plays)
        ? room.randomOrderDogleg.plays.slice(-20).map((hit) => ({ ...hit }))
        : [];
  const markedCardId = mode === DOGLEG_MODE_DYNAMIC && viewer
    ? dynamicDoglegCardId(room.dynamicDogleg, viewer.id)
    : mode === DOGLEG_MODE_HIDDEN && viewer && room.stage === "playing"
        && !hiddenDoglegIsRevealed(room.hiddenDogleg, viewer.id)
      ? hiddenDoglegCardId(room.hiddenDogleg, viewer.id)
      : null;
  return {
    stage: room.stage,
    callMode: normalizedCallMode(room.callMode),
    callModeName: callModeName(room.callMode),
    openingBidPercent: normalizedOpeningBidPercent(room.openingBidPercent),
    bankerScoreMode: normalizeBankerScoreMode(room.bankerScoreMode),
    bankerScoreModeName: bankerScoreModeName(room.bankerScoreMode),
    bankerId: room.bankerId,
    bankerName: room.bankerId ? playerName(room, room.bankerId) : "",
    trumpSuit: room.trumpSuit,
    trumpSuitName: room.trumpSuit ? suitName(room.trumpSuit) : "",
    currentTrumpSuit: currentSuit,
    currentTrumpSuitName: currentSuit ? suitName(currentSuit) : "",
    doglegMode: mode,
    doglegModeName: doglegModeName(mode),
    doglegCard: room.doglegCard,
    doglegMarkedCardId: markedCardId,
    doglegHitSequence: mode === DOGLEG_MODE_DYNAMIC
      ? Number(room.dynamicDogleg?.hitSequence) || 0
      : mode === DOGLEG_MODE_HIDDEN
        ? Number(room.hiddenDogleg?.revealSequence) || 0
        : mode === DOGLEG_MODE_RANDOM_ORDER
          ? Number(room.randomOrderDogleg?.playSequence) || 0
          : 0,
    doglegHits,
    doglegTargetPositions: mode === DOGLEG_MODE_RANDOM_ORDER
      ? [...(room.randomOrderDogleg?.targetPositions || [])]
      : [],
    doglegTargetCount: mode === DOGLEG_MODE_RANDOM_ORDER
      ? (room.randomOrderDogleg?.targetPositions || []).length
      : room.doglegNeeded || 0,
    doglegPlayerIds: [...(room.doglegPlayerIds || [])],
    doglegPlayerNames: (room.doglegPlayerIds || []).map((playerId) => playerName(room, playerId)),
    doglegNeeded: room.doglegNeeded || 0,
    doglegMax: maxDoglegCount(room.players.length),
    bid: publicBid(room, room.setup?.bid),
    bidHistory: (room.setup?.bidHistory || []).map((bid) => publicBid(room, bid)),
    bidPassIds: [...(room.setup?.passIds || [])],
    scoreBid: publicScoreBid(room, room.setup?.scoreBid),
    biddingTurnPlayerId: room.setup?.biddingTurnPlayerId || null,
    biddingTurnPlayerName: room.setup?.biddingTurnPlayerId ? playerName(room, room.setup.biddingTurnPlayerId) : "",
    fry: fry
      ? {
          currentPlayerId: fry.currentPlayerId,
          currentPlayerName: fry.currentPlayerId ? playerName(room, fry.currentPlayerId) : "",
          lastFryerId: fry.lastFryerId,
          lastFryerName: fry.lastFryerId ? playerName(room, fry.lastFryerId) : "",
          lastBid: publicBid(room, fry.lastBid),
          pendingBid: publicBid(room, fry.pendingBid),
          history: (fry.history || []).map((bid) => publicBid(room, bid)),
          passesSinceLast: fry.passesSinceLast,
          deadlineAt: fry.deadlineAt || null,
          passIds: [...(fry.passIds || [])]
        }
      : null
  };
}

function gameItemsSnapshot(room, viewer = null) {
  const gameItems = room.gameItems || emptyGameItems();
  const access = gameItemAccess(room);
  const completedPlayerIds = [...(gameItems.stage?.completedPlayerIds || [])];
  const viewerCompleted = Boolean(viewer && completedPlayerIds.includes(viewer.id));
  return {
    eligible: access.eligible,
    freeUse: access.freeUse,
    canUse: room.status === "dealt" && isItemUseStage(room.stage) && access.eligible && !viewerCompleted,
    stageType: isItemUseStage(room.stage) ? room.stage : null,
    deadlineAt: gameItems.stage?.deadlineAt || null,
    completedPlayerIds,
    viewerCompleted,
    restartUsedPlayerIds: [...(room.restartCardUsedPlayerIds || [])],
    frySuitOrder: gameItems.frySuitOrder ? [...gameItems.frySuitOrder] : null,
    frySuitOrderNames: gameItems.frySuitOrder?.map(suitName) || [],
    luckyPlayerIds: [...(gameItems.luckyPlayerIds || [])],
    warGodPlayerIds: (gameItems.uses || [])
      .filter((use) => use.itemId === "war-god-card")
      .map((use) => use.playerId),
    uses: (gameItems.uses || []).map((use) => ({
      useId: use.useId,
      playerId: use.playerId,
      playerName: playerName(room, use.playerId),
      itemId: use.itemId,
      itemName: consumableItemById.get(use.itemId)?.name || use.itemId,
      freeUse: Boolean(use.freeUse),
      at: use.at
    }))
  };
}

function boardHeroSkillsSnapshot(room, viewer = null) {
  const skills = room.boardHeroSkills || emptyBoardHeroSkills();
  const shenBiesan = skills.shenBiesan;
  const yokoyama = skills.yokoyama;
  const viewerIsBiesanEligible = Boolean(viewer && shenBiesan.eligiblePlayerIds.includes(viewer.id));
  const viewerCompletedBiesan = Boolean(viewer && shenBiesan.completedPlayerIds.includes(viewer.id));
  const viewerIsCurrentYokoyama = Boolean(viewer && yokoyama.currentPlayerId === viewer.id);
  return {
    replacementRank: room.boardHeroEffects?.replacementRank || null,
    shenBiesan: {
      active: room.stage === "shen-biesan-skill",
      deadlineAt: shenBiesan.deadlineAt,
      eligiblePlayerIds: [...shenBiesan.eligiblePlayerIds],
      viewerEligible: viewerIsBiesanEligible,
      viewerCompleted: viewerCompletedBiesan,
      canChoose: room.stage === "shen-biesan-skill" && viewerIsBiesanEligible && !viewerCompletedBiesan,
      candidateRanks: viewerIsBiesanEligible ? [...(shenBiesan.candidateRanksByPlayerId[viewer.id] || [])] : [],
      cost: viewer?.battleHeroSnapshot?.heroId === "shen-biesan" ? viewer.battleHeroSnapshot.paidSkill?.cost || 0 : 0,
      heat: viewer?.battleHeroSnapshot?.heroId === "shen-biesan" ? viewer.battleHeroSnapshot.paidSkill?.heat ?? null : null
    },
    yokoyama: {
      active: room.stage === "yokoyama-skill",
      currentPlayerId: yokoyama.currentPlayerId,
      currentPlayerName: yokoyama.currentPlayerId ? playerName(room, yokoyama.currentPlayerId) : "",
      deadlineAt: yokoyama.deadlineAt,
      paid: viewerIsCurrentYokoyama ? Boolean(yokoyama.paid) : false,
      canActivate: room.stage === "yokoyama-skill" && viewerIsCurrentYokoyama && !yokoyama.paid,
      canFinish: room.stage === "yokoyama-skill" && viewerIsCurrentYokoyama,
      cost: HERO_HOME_RULES.yokoyamaSkillCost,
      candidates: viewerIsCurrentYokoyama && yokoyama.paid
        ? yokoyama.candidates.map((playerId) => ({
            playerId,
            playerName: playerName(room, playerId),
            seat: room.players.findIndex((player) => player.id === playerId) + 1
          }))
        : []
    },
    shenJiangwen: {
      canActivate: shenJiangwenCanActivate(room, viewer),
      cost: viewer?.battleHeroSnapshot?.heroId === "shen-jiangwen" ? viewer.battleHeroSnapshot.paidSkill?.cost || 0 : 0,
      heat: viewer?.battleHeroSnapshot?.heroId === "shen-jiangwen" ? viewer.battleHeroSnapshot.paidSkill?.heat ?? null : null
    },
    uses: (room.boardHeroEffects?.uses || []).map((use) => ({
      playerId: use.playerId,
      playerName: playerName(room, use.playerId),
      heroId: use.heroId,
      skillName: use.skillName,
      cost: use.cost,
      effect: use.effect,
      at: use.at
    })),
    seatSwaps: [...(room.boardHeroEffects?.seatSwaps || [])]
  };
}

function playerRole(room, playerId, viewer = null) {
  if (room.bankerId === playerId) return "庄家";
  if ((room.doglegPlayerIds || []).includes(playerId)) return "狗腿";
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_HIDDEN
    && viewer?.id === playerId
    && hiddenDoglegPlayerIds(room.hiddenDogleg).includes(playerId)) return "狗腿";
  if (room.bankerId) return "闲家";
  return "";
}

function trickSnapshot(room, trick, viewer = null) {
  if (!trick) return null;
  const currentTurnPlayerId = trick === room.currentTrick ? expectedPlayerId(room) : null;
  const turnIndexByPlayerId = new Map(orderedPlayersFrom(room, trick.leaderId || room.hostId).map((player, index) => [player.id, index]));
  const provisionalOutcome = trick === room.currentTrick && trick.plays.length && trick.winningPlayIndex == null
    ? settleTrick(room, trick)
    : null;
  const winningPlayIndex = trick.winningPlayIndex ?? provisionalOutcome?.winningPlayIndex ?? null;
  return {
    number: trick.number,
    leaderId: trick.leaderId,
    leaderName: trick.leaderId ? playerName(room, trick.leaderId) : "",
    currentTurnPlayerId,
    currentTurnPlayerName: currentTurnPlayerId ? playerName(room, currentTurnPlayerId) : "",
    winnerId: trick.winnerId,
    winnerName: trick.winnerName,
    points: trick.points || 0,
    winningPlayIndex,
    plays: room.players.map((player) => {
      const rawPlayIndex = trick.plays.findIndex((item) => item.playerId === player.id);
      const play = rawPlayIndex >= 0 ? trick.plays[rawPlayIndex] : null;
      return {
        playerId: player.id,
        playerName: player.name,
        avatarUrl: player.avatarUrl || "",
        avatarFrame: normalizeAvatarFrame(player.avatarFrame),
        cardSkin: normalizeCardSkin(player.cardSkin),
        playEffect: normalizePlayEffect(player.playEffect),
        autoPlayEnabled: Boolean(player.autoPlayEnabled),
        battleHeroSnapshot: player.battleHeroSnapshot || null,
        role: playerRole(room, player.id, viewer),
        doglegMarkCount: dynamicDoglegMarkCount(room.dynamicDogleg, player.id),
        played: Boolean(play),
        lead: trick.leaderId === player.id,
        currentTurn: currentTurnPlayerId === player.id,
        winning: rawPlayIndex >= 0 && rawPlayIndex === winningPlayIndex,
        turnIndex: turnIndexByPlayerId.get(player.id) ?? null,
        score: player.score || 0,
        draggedRedFives: player.draggedRedFives || 0,
        draggedDiamondFives: player.draggedDiamondFives || 0,
        throwFailures: player.throwFailures || 0,
        cardCount: player.hand.length,
        at: play?.at || null,
        throwPlay: Boolean(play?.throwPlay),
        throwFailed: Boolean(play?.throwFailed),
        throwAttemptCards: play?.throwAttemptCards?.map(publicCard) || [],
        throwRevealUntil: play?.throwRevealUntil || null,
        throwDisplayPhase: play?.throwFailed
          ? (Date.now() < new Date(play.throwRevealUntil).getTime() ? "attempt" : "failed")
          : "",
        throwComponents: (play?.throwComponents || []).map((component) => ({
          signature: component.signature,
          pattern: component.pattern,
          count: component.count,
          cards: (component.cards || []).map(publicCard)
        })),
        forcedProtectedFiveIds: [...(play?.forcedProtectedFiveIds || [])],
        cards: play ? play.cards.map(publicCard) : []
      };
    })
  };
}

function playedProtectedFiveCounts(room) {
  const counts = { red: 0, diamond: 0 };
  const tricks = [...(room.trickHistory || [])];
  if (room.currentTrick) tricks.push(room.currentTrick);
  tricks.forEach((trick) => {
    (trick.plays || []).forEach((play) => {
      (play.cards || []).forEach((card) => {
        if (card.type !== "normal" || card.rank !== "5") return;
        if (card.suit === "H") counts.red += 1;
        if (card.suit === "D") counts.diamond += 1;
      });
    });
  });
  return counts;
}

function roomResultSnapshot(room, privatePlayerId = null) {
  if (!room.result) return null;
  return {
    ...room.result,
    playerResults: (room.result.playerResults || []).map((playerResult) => {
      if (playerResult.playerId === privatePlayerId) return playerResult;
      const heroSkillReward = playerResult.heroSkillReward
        ? {
            rulesVersion: playerResult.heroSkillReward.rulesVersion,
            hero: playerResult.heroSkillReward.hero,
            skillName: playerResult.heroSkillReward.skillName,
            amount: playerResult.heroSkillReward.amount
          }
        : null;
      const diamondReward = playerResult.diamondReward
        ? {
            ...playerResult.diamondReward,
            balanceAfter: null,
            heroSkillReward: null
          }
        : null;
      return { ...playerResult, heroSkillReward, diamondReward };
    })
  };
}

function roomSnapshot(room, viewer = null, options = {}) {
  autoAdvanceExpiredGameItemStage(room);
  autoAdvanceExpiredScoreBid(room);
  autoAdvanceExpiredFry(room);
  const secretViewer = options.hideViewerSecrets ? null : viewer;
  const canViewKitty = Boolean(viewer && room.kitty.length && room.setup?.fry?.lastFryerId === viewer.id);
  const kittyViewerId = room.setup?.fry?.lastFryerId || null;
  const readyCount = readyPlayerCount(room);
  const allReady = allPlayersReady(room);
  return {
    snapshotVersion: room.snapshotVersion || 0,
    roomId: room.id,
    status: room.status,
    stage: room.stage,
    phase: room.phase,
    callMode: normalizedCallMode(room.callMode),
    callModeName: callModeName(room.callMode),
    openingBidPercent: normalizedOpeningBidPercent(room.openingBidPercent),
    bankerScoreMode: normalizeBankerScoreMode(room.bankerScoreMode),
    bankerScoreModeName: bankerScoreModeName(room.bankerScoreMode),
    doglegMode: normalizeDoglegMode(room.doglegMode),
    doglegModeName: doglegModeName(room.doglegMode),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    handSize: HAND_SIZE,
    kittyCount: room.kitty.length,
    kittySize: room.kittySize || room.players.length,
    doglegMax: maxDoglegCount(room.players.length),
    canViewKitty,
    kittyViewerId,
    kittyViewerName: kittyViewerId ? playerName(room, kittyViewerId) : "",
    kitty: canViewKitty ? room.kitty.map(publicCard) : [],
    removedCards: (room.removedCards || []).map(publicCard),
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    readyCount,
    allReady,
    notice: room.notice?.expiresAt && Date.now() < new Date(room.notice.expiresAt).getTime() ? room.notice : null,
    tauntPresets: availableTauntPresets(tauntPresets, viewer?.accountId || null),
    taunts: activeTauntsSnapshot(room),
    gameItems: gameItemsSnapshot(room, viewer),
    boardHeroSkills: boardHeroSkillsSnapshot(room, viewer),
    hostId: room.hostId,
    setup: setupSnapshot(room, secretViewer),
    viewer: viewer ? {
      id: viewer.id,
      accountId: viewer.accountId || null,
      name: viewer.name,
      avatarUrl: viewer.avatarUrl || "",
      host: viewer.host,
      ready: Boolean(viewer.ready),
      nextRoundEntered: Boolean(viewer.nextRoundEntered),
      autoPlayEnabled: Boolean(viewer.autoPlayEnabled),
      battleHeroSnapshot: viewer.battleHeroSnapshot || null
    } : null,
    players: room.players.map((player) => ({
      id: player.id,
      accountId: player.accountId || null,
      profileId: player.profileId || null,
      name: player.name,
      avatarUrl: player.avatarUrl || "",
      avatarFrame: normalizeAvatarFrame(player.avatarFrame),
      cardSkin: normalizeCardSkin(player.cardSkin),
      playEffect: normalizePlayEffect(player.playEffect),
      host: player.host,
      test: player.test,
      role: playerRole(room, player.id, secretViewer),
      connected: player.connected,
      ready: Boolean(player.ready),
      nextRoundEntered: Boolean(player.nextRoundEntered),
      autoPlayEnabled: Boolean(player.autoPlayEnabled),
      battleHeroSnapshot: player.battleHeroSnapshot || null,
      score: player.score || 0,
      doglegMarkCount: dynamicDoglegMarkCount(room.dynamicDogleg, player.id),
      draggedRedFives: player.draggedRedFives || 0,
      draggedDiamondFives: player.draggedDiamondFives || 0,
      throwFailures: player.throwFailures || 0,
      cardCount: player.hand.length
    })),
    spectators: publicRoomSpectators(room),
    hand: viewer ? viewerHandForSnapshot(room, viewer).map(publicCard) : [],
    currentTrick: trickSnapshot(room, room.currentTrick, secretViewer),
    trickHistory: [...(room.settledTrickHistory || [])],
    playedProtectedFives: playedProtectedFiveCounts(room),
    result: roomResultSnapshot(
      room,
      Object.hasOwn(options, "privatePlayerId") ? options.privatePlayerId : viewer?.id || null
    ),
    events: [...room.events]
  };
}

function roomSpectators(room) {
  if (!(room.spectators instanceof Map)) room.spectators = new Map();
  return room.spectators;
}

function roomTaunts(room) {
  if (!(room.taunts instanceof Map)) room.taunts = new Map();
  return room.taunts;
}

function roomTauntTimers(room) {
  if (!(room.tauntTimers instanceof Map)) room.tauntTimers = new Map();
  return room.tauntTimers;
}

function roomTauntLastSentAt(room) {
  if (!(room.tauntLastSentAt instanceof Map)) room.tauntLastSentAt = new Map();
  return room.tauntLastSentAt;
}

function clearRoomTaunts(room) {
  for (const timer of roomTauntTimers(room).values()) clearTimeout(timer);
  roomTauntTimers(room).clear();
  roomTaunts(room).clear();
  roomTauntLastSentAt(room).clear();
}

function activeTauntsSnapshot(room) {
  const currentTime = Date.now();
  return [...roomTaunts(room).values()]
    .filter((taunt) => new Date(taunt.expiresAt).getTime() > currentTime)
    .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
}

function submitTaunt(room, player, presetId) {
  if (room.status !== "dealt" || room.stage !== "playing") {
    return { error: "只有打牌阶段可以发送嘲讽", status: 409 };
  }
  const preset = tauntPresets.find((item) => item.id === String(presetId || ""));
  if (!preset) return { error: "请选择系统提供的嘲讽词", status: 400 };
  if (!tauntAvailableToAccount(preset, player.accountId || null)) {
    return { error: "你暂时不能使用这条嘲讽词", status: 403 };
  }

  const currentTime = Date.now();
  const lastSentAt = roomTauntLastSentAt(room).get(player.id) || 0;
  const retryAfterMs = TAUNT_COOLDOWN_MS - (currentTime - lastSentAt);
  if (retryAfterMs > 0) {
    return {
      error: `操作太快了，请 ${Math.ceil(retryAfterMs / 1000)} 秒后再发`,
      status: 429
    };
  }

  const taunt = {
    id: id(9),
    playerId: player.id,
    playerName: player.name,
    presetId: preset.id,
    text: preset.text,
    sentAt: new Date(currentTime).toISOString(),
    expiresAt: new Date(currentTime + TAUNT_DURATION_MS).toISOString()
  };
  roomTaunts(room).set(player.id, taunt);
  roomTauntLastSentAt(room).set(player.id, currentTime);

  const previousTimer = roomTauntTimers(room).get(player.id);
  if (previousTimer) clearTimeout(previousTimer);
  const timer = setTimeout(() => {
    const activeRoom = rooms.get(room.id);
    if (!activeRoom || roomTaunts(activeRoom).get(player.id)?.id !== taunt.id) return;
    roomTaunts(activeRoom).delete(player.id);
    roomTauntTimers(activeRoom).delete(player.id);
    broadcast(activeRoom);
  }, TAUNT_DURATION_MS + 20);
  timer.unref?.();
  roomTauntTimers(room).set(player.id, timer);
  return { taunt };
}

async function submitGameItem(room, player, itemIdValue, requestId) {
  const itemId = String(itemIdValue || "");
  if (!isConsumableItemId(itemId)) return { error: "对局道具不存在", status: 404 };
  if (room.itemUseInFlight) return { error: "正在处理其他道具，请稍后重试", status: 409 };
  if (room.status !== "dealt" || !isItemUseStage(room.stage)) {
    return { error: "只能在对应的卡牌使用阶段使用对局道具", status: 409 };
  }
  if (!itemAllowedInStage(room.stage, itemId)) {
    return {
      error: room.stage === RESTART_CARD_STAGE ? "当前只能使用重开卡" : "重开卡只能在重开卡阶段使用",
      status: 409
    };
  }
  const access = gameItemAccess(room);
  if (!access.eligible) {
    return { error: "真人玩家需全部登录且账号不能重复，才能使用对局道具", status: 409 };
  }
  if (!player.accountId) return { error: "请先登录玩家账号", status: 403 };
  if (!room.gameRecordId) return { error: "本局尚未生成有效标识", status: 409 };
  const gameItems = room.gameItems || emptyGameItems();
  room.gameItems = gameItems;
  if (completedGameItemPlayerIds(room).has(player.id)) {
    return { error: "你已经完成本阶段选择", status: 409 };
  }
  if (gameItems.uses.some((use) => use.playerId === player.id && use.itemId === itemId)) {
    return { error: "本局已经使用过这个对局道具", status: 409 };
  }
  if (itemId === "restart-card" && (room.restartCardUsedPlayerIds || []).includes(player.id)) {
    return { error: "你在本轮连续牌局已经使用过重开卡", status: 409 };
  }

  room.itemUseInFlight = true;
  try {
    const effectData = itemId === "colorful-card"
      ? { frySuitOrder: randomFrySuitOrder(randomInt(23)) }
      : {};
    const reservation = await reserveGameItem(
      player.accountId,
      player.id,
      room.gameRecordId,
      itemId,
      requestId,
      effectData,
      { freeUse: access.freeUse }
    );
    const use = {
      useId: reservation.use.use_id,
      playerId: player.id,
      accountId: player.accountId,
      itemId,
      effectData: reservation.use.effect_data || effectData,
      freeUse: Boolean(reservation.freeUse),
      at: now()
    };
    if (reservation.repeated) {
      const existing = gameItems.uses.find((entry) => entry.useId === use.useId);
      if (existing) return { ok: true, repeated: true, use: existing };
    }

    if (itemId === "restart-card") {
      const oldGameId = room.gameRecordId;
      await resolveRestartGameItemUses(oldGameId, use.useId);
      room.restartCardUsedPlayerIds = [...new Set([...(room.restartCardUsedPlayerIds || []), player.id])];
      deal(room, { preserveRestartUsage: true });
      room.gameRecordId = randomUUID();
      const text = `${player.name} 使用重开卡，本局已重新洗牌发牌`;
      addEvent(room, text);
      announceRoomNotice(room, text);
      return { ok: true, restarted: true, use };
    }

    gameItems.uses.push(use);
    let noticeText = `${player.name} 使用了 ${consumableItemById.get(itemId)?.name || itemId}`;
    if (itemId === "colorful-card") {
      gameItems.frySuitOrder = [...use.effectData.frySuitOrder];
      noticeText = `${player.name} 使用缤纷卡，本局炒底花色顺序变为 ${gameItems.frySuitOrder.map(suitName).join(" > ")}`;
    } else if (itemId === "luck-card") {
      if (!gameItems.luckyPlayerIds.includes(player.id)) gameItems.luckyPlayerIds.push(player.id);
      noticeText = `${player.name} 使用牌运卡，牌运之神开始庇佑`;
    } else if (itemId === "war-god-card") {
      noticeText = `${player.name} 使用战神卡，本局积分将在原始结算后翻倍`;
    }
    addEvent(room, noticeText);
    announceRoomNotice(room, noticeText);
    return { ok: true, use };
  } catch (error) {
    return { error: error.message || "对局道具使用失败", status: error.status || 503 };
  } finally {
    room.itemUseInFlight = false;
  }
}

function publicRoomSpectators(room) {
  return [...roomSpectators(room).values()]
    .map((spectator) => ({
      id: spectator.id,
      name: spectator.name || "路人",
      avatarUrl: spectator.avatarUrl || "",
      avatarFrame: normalizeAvatarFrame(spectator.avatarFrame),
      targetPlayerId: spectator.targetPlayerId,
      targetPlayerName: playerName(room, spectator.targetPlayerId),
      joinedAt: spectator.createdAt
    }))
    .sort((left, right) => new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime());
}

function spectatorFor(room, spectatorId, token) {
  const spectator = roomSpectators(room).get(String(spectatorId || ""));
  return spectator?.token === token ? spectator : null;
}

function spectatorSnapshot(room, spectator) {
  const viewer = playerById(room, spectator?.targetPlayerId);
  if (!viewer) return null;
  return {
    ...roomSnapshot(room, viewer, { hideViewerSecrets: true, privatePlayerId: null }),
    spectator: {
      id: spectator.id,
      targetPlayerId: viewer.id,
      targetPlayerName: viewer.name
    }
  };
}

function viewerHandForSnapshot(room, viewer) {
  const pendingThrow = room.currentTrick?.plays?.find((play) =>
    play.playerId === viewer.id &&
    play.throwFailed &&
    play.throwAttemptCards?.length &&
    Date.now() < new Date(play.throwRevealUntil).getTime()
  );
  if (!pendingThrow) return viewer.hand;
  const attemptedIds = new Set(pendingThrow.throwAttemptCards.map((card) => card.id));
  return viewer.hand.filter((card) => !attemptedIds.has(card.id));
}

function requirePlayer(res, room, playerId, token) {
  const viewer = playerFor(room, playerId, token);
  if (!viewer) writeJson(res, 401, { error: "玩家身份已失效" });
  return viewer;
}

function canChangeRoomPlayers(room) {
  return room.status === "lobby";
}

function disconnectPlayerClients(room, playerId, messageText) {
  for (const client of [...room.clients]) {
    if (client.playerId !== playerId) continue;
    client.res.write(`event: kicked\ndata: ${JSON.stringify({ message: messageText })}\n\n`);
    client.res.end();
    room.clients.delete(client);
  }
}

function disconnectSpectatorClients(room, spectatorId) {
  for (const client of [...room.clients]) {
    if (client.spectatorId !== spectatorId) continue;
    client.res.end();
    room.clients.delete(client);
  }
}

function clearSpectatorIdentityForAccount(room, accountId) {
  return removeSpectatorsForAccount(room, accountId, (spectator) => {
    disconnectSpectatorClients(room, spectator.id);
  });
}

function disconnectAllRoomClients(room, messageText) {
  for (const client of [...room.clients]) {
    client.res.write(`event: kicked\ndata: ${JSON.stringify({ message: messageText })}\n\n`);
    client.res.end();
    room.clients.delete(client);
  }
}

function hasHumanPlayer(room) {
  return room.players.some((player) => !player.test);
}

function dissolveRoom(room, messageText) {
  clearAiSetupTimer(room);
  clearAiPlayTimer(room);
  clearScoreBidTimer(room);
  clearFryTimer(room);
  clearGameItemStageTimer(room);
  clearRoomTaunts(room);
  if (room.gameRecordId && room.gameItems?.uses?.length) {
    void refundGameItemUses(room.gameRecordId).catch((error) => {
      console.error(`[game-items] refund failed for dissolved room ${room.id}`, error.message);
    });
  }
  disconnectAllRoomClients(room, messageText);
  rooms.delete(room.id);
}

function removePlayerFromRoom(room, playerId, messageText) {
  const playerIndex = room.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) return null;
  const [removed] = room.players.splice(playerIndex, 1);
  disconnectPlayerClients(room, playerId, messageText);
  for (const spectator of [...roomSpectators(room).values()]) {
    if (spectator.targetPlayerId !== playerId) continue;
    disconnectSpectatorClients(room, spectator.id);
    roomSpectators(room).delete(spectator.id);
  }

  if (!room.players.length || !hasHumanPlayer(room)) {
    dissolveRoom(room, "房间只剩 AI，已自动解散");
    return removed;
  }

  if (removed.host && room.players.length) {
    const nextHost = room.players.find((player) => !player.test) || room.players[0];
    nextHost.host = true;
    room.hostId = nextHost.id;
    addEvent(room, `${nextHost.name} 成为新的房主`);
  }

  room.kittySize = room.status === "lobby" ? room.players.length : room.kittySize;
  syncLobbyDoglegCount(room);
  finalizeNextRoundLobby(room);
  return removed;
}

function updateDraggedFiveStats(room, trick, winnerId) {
  trick.plays.forEach((play) => {
    if (play.playerId === winnerId) return;
    const player = playerById(room, play.playerId);
    if (!player) return;
    play.cards.forEach((card) => {
      if (card.type !== "normal" || card.rank !== "5") return;
      const actorId = draggedFiveActorId(trick, play, card);
      const actorName = playerName(room, actorId);
      const forced = (play.forcedProtectedFiveIds || []).includes(card.id);
      if (card.suit === "H") {
        player.draggedRedFives = (player.draggedRedFives || 0) + 1;
        addEvent(room, forced
          ? `${player.name} 的红五被 ${actorName} 拖走`
          : `${player.name} 主动出的红五被 ${actorName} 压走`);
      }
      if (card.suit === "D") {
        player.draggedDiamondFives = (player.draggedDiamondFives || 0) + 1;
        addEvent(room, forced
          ? `${player.name} 的方五被 ${actorName} 拖走`
          : `${player.name} 主动出的方五被 ${actorName} 压走`);
      }
    });
  });
}

function actualDoglegPlayerIds(room) {
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_HIDDEN) {
    return hiddenDoglegPlayerIds(room.hiddenDogleg);
  }
  return [...(room.doglegPlayerIds || [])];
}

function revealRemainingHiddenDoglegs(room) {
  if (normalizeDoglegMode(room.doglegMode) !== DOGLEG_MODE_HIDDEN || !room.hiddenDogleg) return;
  const actualIds = hiddenDoglegPlayerIds(room.hiddenDogleg);
  const previouslyRevealed = new Set(room.doglegPlayerIds || []);
  const newlyRevealed = actualIds.filter((playerId) => !previouslyRevealed.has(playerId));
  actualIds.forEach((playerId) => {
    const state = room.hiddenDogleg.players?.[playerId];
    if (state) state.revealed = true;
  });
  room.doglegPlayerIds = actualIds;
  if (newlyRevealed.length) {
    addEvent(room, `本局结束，公开尚未亮明的暗狗腿：${newlyRevealed.map((playerId) => playerName(room, playerId)).join("、")}`);
  }
}

function bankerTeamIds(room) {
  return [room.bankerId, ...actualDoglegPlayerIds(room)].filter(Boolean);
}

function idleTeamIds(room) {
  const bankerIds = new Set(bankerTeamIds(room));
  return room.players.filter((player) => !bankerIds.has(player.id)).map((player) => player.id);
}

function winThreshold(playerCount) {
  if (playerCount === 5) return 250;
  if (playerCount === 6) return 360;
  if (playerCount === 7) return 350;
  return Math.round(playerCount * 100 * 0.5);
}

function gameWinThreshold(room) {
  if (normalizedCallMode(room.callMode) === CALL_MODE_SCORE) {
    const bidScore = room.setup?.scoreBid?.current?.score;
    if (Number.isFinite(bidScore) && bidScore > 0) return totalGamePoints(room) - bidScore;
  }
  return winThreshold(room.players.length);
}

function roundGameScore(value) {
  return Math.round(value * 100) / 100;
}

function gameScoreText(value) {
  const rounded = roundGameScore(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function teamName(team) {
  return team === "idle" ? "闲家" : "庄队";
}

function finishGame(room, completedTrick) {
  if (room.result) return;
  clearAiSetupTimer(room);
  clearAiPlayTimer(room);
  clearScoreBidTimer(room);
  clearFryTimer(room);
  clearGameItemStageTimer(room);
  room.players.forEach((player) => {
    player.autoPlayEnabled = false;
  });

  revealRemainingHiddenDoglegs(room);
  const bankerIds = bankerTeamIds(room);
  const bankerIdSet = new Set(bankerIds);
  const idleIds = idleTeamIds(room);
  const bottomWinnerId = completedTrick.winnerId;
  const bottomWinnerTeam = bankerIdSet.has(bottomWinnerId) ? "banker" : "idle";
  const bottomPoints = cardsPoint(room.kitty);
  const bottomCards = room.kitty.map(publicCard);
  const bottomDraggedRedFives = bottomWinnerTeam === "idle"
    ? room.kitty.filter((card) => card.type === "normal" && card.rank === "5" && card.suit === "H").length
    : 0;
  const bottomDraggedDiamondFives = bottomWinnerTeam === "idle"
    ? room.kitty.filter((card) => card.type === "normal" && card.rank === "5" && card.suit === "D").length
    : 0;

  if (bottomWinnerTeam === "idle" && bottomPoints) {
    const winner = playerById(room, bottomWinnerId);
    if (winner) winner.score = (winner.score || 0) + bottomPoints * 2;
  }

  if (bottomDraggedRedFives || bottomDraggedDiamondFives) {
    const banker = playerById(room, room.bankerId);
    if (banker) {
      banker.draggedRedFives = (banker.draggedRedFives || 0) + bottomDraggedRedFives;
      banker.draggedDiamondFives = (banker.draggedDiamondFives || 0) + bottomDraggedDiamondFives;
    }
  }

  const threshold = gameWinThreshold(room);
  const idleScore = idleIds.reduce((sum, playerId) => sum + (playerById(room, playerId)?.score || 0), 0);
  const scoreDiff = idleScore - threshold;
  const baseScore = idleScore >= threshold ? 2 : -2;
  const scoreStep = scoreDiff >= 0 ? Math.floor(scoreDiff / 40) : -Math.floor(Math.abs(scoreDiff) / 40);
  const bottomDelta = bottomWinnerTeam === "idle" ? 1 : -1;

  let bankerDraggedValue = 0;
  let idleDraggedValue = 0;
  room.players.forEach((player) => {
    const value = (player.draggedRedFives || 0) * 2 + (player.draggedDiamondFives || 0);
    if (bankerIdSet.has(player.id)) bankerDraggedValue += value;
    else idleDraggedValue += value;
  });
  const bottomDraggedExtra = bottomDraggedRedFives * 2 + bottomDraggedDiamondFives;
  const draggedDelta = bankerDraggedValue - idleDraggedValue + bottomDraggedExtra;
  let bankerThrowFailures = 0;
  let idleThrowFailures = 0;
  room.players.forEach((player) => {
    const failures = player.throwFailures || 0;
    if (bankerIdSet.has(player.id)) bankerThrowFailures += failures;
    else idleThrowFailures += failures;
  });
  const throwFailureDelta = bankerThrowFailures - idleThrowFailures;

  const idleEachScore = baseScore + scoreStep + bottomDelta + draggedDelta + throwFailureDelta;
  const bankerScores = allocateBankerTeamScores({
    idleEachScore,
    idleCount: idleIds.length,
    doglegCount: Math.max(0, bankerIds.length - 1),
    mode: room.bankerScoreMode
  });
  const bankerScore = bankerScores.bankerScore;
  const doglegEachScore = bankerScores.doglegEachScore;
  const winnerTeam = idleScore >= threshold ? "idle" : "banker";
  const evaluationWinnerTeam = finalScoreWinnerTeam(idleEachScore);
  const bottomWinningPlay = completedTrick.plays.find((play) => play.playerId === bottomWinnerId);
  const finalSideSuitBottomWinnerId = bottomWinningPlay?.cards?.length
    && bottomWinningPlay.cards.every((card) => !isMainPlayCard(card, room.trumpSuit))
    ? bottomWinnerId
    : null;
  const evaluations = buildGameEvaluations({
    players: room.players,
    tricks: room.trickHistory,
    bankerTeamIds: bankerIds,
    winnerTeam: evaluationWinnerTeam,
    provisionalWinnerPlayerIds: room.provisionalWinnerPlayerIds || [],
    finalSideSuitBottomWinnerId,
    bottom: {
      winnerId: bottomWinnerId,
      winnerTeam: bottomWinnerTeam,
      bankerId: room.bankerId,
      points: bottomPoints,
      draggedRedFives: bottomDraggedRedFives,
      draggedDiamondFives: bottomDraggedDiamondFives
    }
  });
  if (!room.settledTrickHistory?.length) {
    room.settledTrickHistory = room.trickHistory.map((trick) => trickSnapshot(room, trick));
  }

  room.status = "lobby";
  room.stage = "finished";
  room.phase = `本局结束：${teamName(winnerTeam)}获胜，等待下一局`;
  room.currentTrick = null;
  room.players.forEach((player) => {
    player.ready = Boolean(player.test);
    player.nextRoundEntered = Boolean(player.test);
  });
  room.result = {
    finishedAt: now(),
    playerCount: room.players.length,
    callMode: normalizedCallMode(room.callMode),
    callModeName: callModeName(room.callMode),
    bankerBidScore: room.setup?.scoreBid?.current?.score || null,
    bankerScoreMode: bankerScores.mode,
    bankerScoreModeName: bankerScoreModeName(bankerScores.mode),
    doglegMode: normalizeDoglegMode(room.doglegMode),
    doglegModeName: doglegModeName(room.doglegMode),
    doglegMarks: room.players.map((player) => ({
      playerId: player.id,
      playerName: player.name,
      count: dynamicDoglegMarkCount(room.dynamicDogleg, player.id)
    })),
    totalGamePoints: totalGamePoints(room),
    bankerTeamIds: bankerIds,
    bankerTeamNames: bankerIds.map((playerId) => playerName(room, playerId)),
    idleTeamIds: idleIds,
    idleTeamNames: idleIds.map((playerId) => playerName(room, playerId)),
    threshold,
    idleScore,
    scoreDiff,
    winnerTeam,
    winnerTeamName: teamName(winnerTeam),
    evaluationWinnerTeam,
    evaluationWinnerTeamName: evaluationWinnerTeam ? teamName(evaluationWinnerTeam) : "平局",
    bottomWinnerId,
    bottomWinnerName: playerName(room, bottomWinnerId),
    bottomWinnerTeam,
    bottomWinnerTeamName: teamName(bottomWinnerTeam),
    bottomPoints,
    bottomScoreAddedToIdle: bottomWinnerTeam === "idle" ? bottomPoints * 2 : 0,
    bottomCards,
    bottomDraggedRedFives,
    bottomDraggedDiamondFives,
    baseScore,
    scoreStep,
    bottomDelta,
    bankerDraggedValue,
    idleDraggedValue,
    bottomDraggedExtra,
    draggedDelta,
    bankerThrowFailures,
    idleThrowFailures,
    throwFailureDelta,
    evaluations: evaluations.awards,
    idleEachScore: roundGameScore(idleEachScore),
    bankerTeamTotal: bankerScores.bankerTeamTotal,
    bankerScore: roundGameScore(bankerScore),
    doglegEachScore: roundGameScore(doglegEachScore),
    bankerEachScore: roundGameScore(bankerScore),
    idleEachScoreText: gameScoreText(idleEachScore),
    bankerScoreText: gameScoreText(bankerScore),
    doglegEachScoreText: gameScoreText(doglegEachScore),
    bankerEachScoreText: gameScoreText(bankerScore),
    playerResults: room.players.map((player) => {
      const isBankerTeam = bankerIdSet.has(player.id);
      const role = playerRole(room, player.id);
      const roleScore = !isBankerTeam
        ? idleEachScore
        : player.id === room.bankerId
          ? bankerScore
          : doglegEachScore;
      const evaluation = evaluations.byPlayerId[player.id] || null;
      return {
        playerId: player.id,
        name: player.name,
        role,
        team: isBankerTeam ? "banker" : "idle",
        teamName: isBankerTeam ? "庄队" : "闲家",
        trickScore: player.score || 0,
        draggedRedFives: player.draggedRedFives || 0,
        draggedDiamondFives: player.draggedDiamondFives || 0,
        throwFailures: player.throwFailures || 0,
        gameScore: roundGameScore(roleScore),
        gameScoreText: gameScoreText(roleScore),
        evaluation,
        evaluationTags: evaluation?.tags || []
      };
    })
  };
  const warGodPlayerIds = (room.gameItems?.uses || [])
    .filter((use) => use.itemId === "war-god-card")
    .map((use) => use.playerId);
  const adjusted = applyWarGodAdjustments(room.result.playerResults, warGodPlayerIds);
  room.result.playerResults = adjusted.playerResults.map((playerResult) => ({
    ...playerResult,
    baseGameScoreText: gameScoreText(playerResult.baseGameScore),
    itemSelfDeltaText: gameScoreText(playerResult.itemSelfDelta),
    itemOpponentDeltaText: gameScoreText(playerResult.itemOpponentDelta),
    itemScoreDeltaText: gameScoreText(playerResult.itemScoreDelta),
    gameScoreText: gameScoreText(playerResult.gameScore)
  }));
  room.result.itemAdjustments = adjusted.adjustments;
  room.result.itemUses = (room.gameItems?.uses || []).map((use) => ({
    useId: use.useId,
    playerId: use.playerId,
    itemId: use.itemId,
    itemName: consumableItemById.get(use.itemId)?.name || use.itemId,
    effectData: use.effectData || {},
    freeUse: Boolean(use.freeUse),
    at: use.at
  }));
  room.result.playerResults.forEach((playerResult) => {
    const roomPlayer = room.players.find((player) => player.id === playerResult.playerId);
    playerResult.heroSkillReward = calculateHeroSkillReward({
      snapshot: roomPlayer?.battleHeroSnapshot,
      playerId: playerResult.playerId,
      playerResult,
      trickHistory: room.trickHistory
    });
  });
  attachDiamondRewards(room);

  const bankerSettlementText = bankerIds.length > 1
    ? `庄家 ${room.result.bankerScoreText} 分，狗腿每人 ${room.result.doglegEachScoreText} 分`
    : `庄家 ${room.result.bankerScoreText} 分`;
  addEvent(room, `本局结束：${teamName(winnerTeam)}牌局获胜，闲家 ${idleScore}/${threshold} 分，闲家每人 ${room.result.idleEachScoreText} 分，${bankerSettlementText}`);
}

function completeCurrentTrick(room) {
  const completed = room.currentTrick;
  const outcome = settleTrick(room, completed);
  Object.assign(completed, outcome);
  updateDraggedFiveStats(room, completed, outcome.winnerId);
  const winner = room.players.find((player) => player.id === outcome.winnerId);
  if (winner) winner.score = (winner.score || 0) + outcome.points;
  room.trickHistory.push(completed);
  room.settledTrickHistory = [...room.settledTrickHistory, trickSnapshot(room, completed)];
  addEvent(room, `第 ${completed.number} 轮结束：${outcome.winnerName} 获得 ${outcome.points} 分，下轮先出`);
  if (room.players.every((player) => player.hand.length === 0)) {
    finishGame(room, completed);
    const finishedGameId = room.gameRecordId;
    if (room.gameItems?.uses?.length) {
      void consumeGameItemUses(finishedGameId).catch((error) => {
        console.error(`[game-items] consume failed for ${finishedGameId}`, error.message);
      });
    }
    const persistence = queueGameRecord(room, (nextPersistence) => {
      const currentRoom = rooms.get(room.id);
      if (!currentRoom || currentRoom.gameRecordId !== finishedGameId) return;
      applyDiamondRewardPersistence(currentRoom, nextPersistence);
      broadcast(currentRoom);
    });
    applyDiamondRewardPersistence(room, persistence);
    return;
  }
  room.currentTrick = createEmptyTrick(completed.number + 1, outcome.winnerId);
}

function followSuit(card) {
  return card.type === "joker" ? "JOKER" : card.suit;
}

function followSuitName(suit) {
  if (suit === "TRUMP") return "主牌";
  if (suit === "JOKER") return "王";
  return suitById.get(suit)?.name || "该花色";
}

function uniqueFollowSuits(cards) {
  return [...new Set(cards.map(followSuit).filter(Boolean))];
}

function isMainPlayCard(card, trumpSuit) {
  if (!card) return false;
  if (isCompareCard(card, trumpSuit)) return true;
  return card.type === "normal" && trumpSuit && card.suit === trumpSuit;
}

function playSuit(card, trumpSuit) {
  if (isMainPlayCard(card, trumpSuit)) return "TRUMP";
  return followSuit(card);
}

function uniquePlaySuits(cards, trumpSuit) {
  return [...new Set(cards.map((card) => playSuit(card, trumpSuit)).filter(Boolean))];
}

function mainCardPower(card, trumpSuit) {
  if (card.type === "normal" && card.suit === "H" && card.rank === "5") return 0;
  if (card.type === "normal" && card.suit === "D" && card.rank === "5") return 1;
  if (card.joker === "big") return 2;
  if (card.joker === "small") return 3;
  if (card.type === "normal" && card.rank === "3" && trumpSuit) {
    if (card.suit === trumpSuit) return 4;
    if (cardColor(card) === cardColor({ suit: trumpSuit })) return 5;
  }
  if (card.type === "normal" && gameRank(card) === "2") {
    if (card.suit === trumpSuit) return 6;
    return 7;
  }
  if (card.type === "normal" && trumpSuit && card.suit === trumpSuit) {
    return 8 + cardRulesRankSort(card);
  }
  return 99;
}

function patternValue(card, trumpSuit) {
  if (isMainPlayCard(card, trumpSuit)) return mainCardPower(card, trumpSuit);
  return cardRulesRankSort(card);
}

function patternKey(card, trumpSuit) {
  return `${playSuit(card, trumpSuit)}:${patternValue(card, trumpSuit)}`;
}

function leadInfo(trick, trumpSuit) {
  const lead = trick.plays[0];
  if (!lead) return null;
  const suitsInLead = uniquePlaySuits(lead.cards, trumpSuit);
  const pattern = detectPlayPattern(lead.cards, trumpSuit);
  return {
    count: lead.cards.length,
    suit: suitsInLead.length === 1 ? suitsInLead[0] : null,
    pattern,
    throwComponents: lead.throwPlay
      ? (lead.throwComponents || throwComponentsFromCards(lead.cards, trumpSuit).components || [])
      : null
  };
}

function orderedPlayersFrom(room, leaderId) {
  if (!room.players.length) return [];
  const start = Math.max(0, room.players.findIndex((player) => player.id === leaderId));
  return [...room.players.slice(start), ...room.players.slice(0, start)];
}

function expectedPlayerId(room) {
  if (room.stage !== "playing") return null;
  if (room.playPauseUntil && Date.now() < new Date(room.playPauseUntil).getTime()) return null;
  const trick = room.currentTrick;
  if (!trick) return null;
  const leaderId = trick.leaderId || room.hostId || room.players[0]?.id || null;
  const playedIds = new Set(trick.plays.map((play) => play.playerId));
  const nextPlayer = orderedPlayersFrom(room, leaderId).find((player) => player.hand.length && !playedIds.has(player.id));
  return nextPlayer?.id || null;
}

function nextPlayerId(room, playerId) {
  const ordered = orderedPlayersFrom(room, playerId);
  return ordered[1]?.id || ordered[0]?.id || null;
}

function playerById(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function selectedCardsFromHand(player, cardIds) {
  if (!Array.isArray(cardIds) || !cardIds.length) {
    return { error: "请选择牌", status: 400 };
  }
  const uniqueCardIds = [...new Set(cardIds.map(String))];
  if (uniqueCardIds.length !== cardIds.length) {
    return { error: "不能重复选择同一张牌", status: 400 };
  }
  const cards = player.hand.filter((card) => uniqueCardIds.includes(card.id));
  if (cards.length !== uniqueCardIds.length) {
    return { error: "选择的牌不在你的手牌中", status: 400 };
  }
  return { cards, cardIds: uniqueCardIds };
}

function removeCardsFromHand(player, cardIds) {
  const selectedIds = new Set(cardIds);
  player.hand = player.hand.filter((card) => !selectedIds.has(card.id));
}

function isTwoCard(card) {
  return card.type === "normal" && gameRank(card) === "2";
}

function bidFromCards(room, player, cardIds) {
  const selected = selectedCardsFromHand(player, cardIds);
  if (selected.error) return selected;
  if (!selected.cards.every(isTwoCard)) {
    return { error: `叫主/炒底只能选择 ${currentBidRankName(room)}`, status: 400 };
  }
  const suitsInBid = uniqueFollowSuits(selected.cards);
  if (suitsInBid.length !== 1) {
    return { error: `叫主/炒底需要选择同一花色的 ${currentBidRankName(room)}`, status: 400 };
  }
  return {
    actionId: id(6),
    playerId: player.id,
    count: selected.cards.length,
    suit: suitsInBid[0],
    cards: selected.cards,
    random: false,
    at: now()
  };
}

function bidFromSuit(room, player, suit) {
  const suitId = String(suit || "").trim().toUpperCase();
  if (!suitById.has(suitId)) {
    return { error: "请选择有效的主花色", status: 400 };
  }
  return {
    actionId: id(6),
    playerId: player.id,
    count: 0,
    suit: suitId,
    cards: [],
    random: false,
    direct: true,
    at: now()
  };
}

function bidBeats(current, next, strength = suitStrength) {
  if (!current) return next.count >= 1;
  if (current.direct) return next.count >= 2;
  if (current.count === 1) return next.count >= 2;
  if (next.count > current.count) return true;
  if (next.count < current.count) return false;
  return (strength.get(next.suit) ?? -1) > (strength.get(current.suit) ?? -1);
}

function randomSuitId() {
  return suits[randomInt(suits.length)].id;
}

function randomPlayer(room) {
  return room.players[randomInt(room.players.length)];
}

function beginBurying(room) {
  const banker = playerById(room, room.bankerId);
  if (!banker) return;
  banker.hand = sortHand([...banker.hand, ...room.kitty]);
  room.kitty = [];
  room.stage = "burying";
  room.phase = `${banker.name} 拿底，等待贴底`;
  addEvent(room, `${banker.name} 成为庄家，拿入 ${room.kittySize} 张底牌`);
}

function finishBidding(room) {
  const bid = room.setup.bid;
  if (!bid) return { error: "还没有玩家叫主", status: 409 };
  room.bankerId = bid.playerId;
  room.trumpSuit = null;
  room.setup.biddingTurnPlayerId = null;
  room.setup.passIds = [];
  beginBurying(room);
  return { ok: true };
}

function submitBid(room, player, cardIds) {
  if (room.stage !== "bidding") return { error: "当前不能叫主/抢主", status: 409 };
  if (room.setup.bid && room.setup.biddingTurnPlayerId !== player.id) {
    return { error: `现在轮到 ${playerName(room, room.setup.biddingTurnPlayerId)} 抢主或过`, status: 409 };
  }
  const bid = bidFromCards(room, player, cardIds);
  if (bid.error) return bid;
  if (!bidBeats(room.setup.bid, bid)) {
    return { error: `选择的 ${currentBidRankName(room)} 不能压过当前叫主`, status: 400 };
  }

  room.setup.bid = bid;
  if (!room.setup.bidHistory) room.setup.bidHistory = [];
  room.setup.bidHistory.push(bid);
  room.setup.passIds = [];
  room.setup.biddingTurnPlayerId = nextPlayerId(room, player.id);
  room.phase = `${player.name} 亮 ${bid.count} 张${suitName(bid.suit)}${currentBidRankName(room)}，等待抢主`;
  addEvent(room, `${player.name} 亮 ${bid.count} 张${suitName(bid.suit)}${currentBidRankName(room)} 叫/抢主`);
  return { ok: true };
}

function passBid(room, player) {
  if (room.stage !== "bidding") return { error: "当前不能过叫主", status: 409 };
  if (!room.setup.bid) return { error: "还没有玩家叫主，暂不能过", status: 409 };
  if (room.setup.biddingTurnPlayerId !== player.id) {
    return { error: `现在轮到 ${playerName(room, room.setup.biddingTurnPlayerId)} 抢主或过`, status: 409 };
  }

  if (!room.setup.passIds.includes(player.id)) room.setup.passIds.push(player.id);
  addEvent(room, `${player.name} 选择不抢主`);
  if (room.setup.passIds.length >= room.players.length - 1) {
    return finishBidding(room);
  }
  room.setup.biddingTurnPlayerId = nextPlayerId(room, player.id);
  room.phase = `等待 ${playerName(room, room.setup.biddingTurnPlayerId)} 抢主或过`;
  return { ok: true };
}

function randomDeclare(room) {
  if (room.stage !== "bidding") return { error: "当前不能随机指定主", status: 409 };
  if (room.setup.bid) return { error: "已经有人叫主，不能随机指定", status: 409 };
  const player = randomPlayer(room);
  const suit = randomSuitId();
  room.setup.bid = {
    actionId: id(6),
    playerId: player.id,
    count: 1,
    suit,
    cards: [],
    random: true,
    at: now()
  };
  if (!room.setup.bidHistory) room.setup.bidHistory = [];
  room.setup.bidHistory.push(room.setup.bid);
  addEvent(room, `无人叫主，系统随机指定 ${player.name} 为庄家，临时花色为${suitName(suit)}`);
  return finishBidding(room);
}

function ensureScoreBidSetup(room) {
  if (!room.setup.scoreBid) room.setup.scoreBid = createScoreBidSetup(room);
  return room.setup.scoreBid;
}

function scoreBidOthersPassed(room) {
  const scoreBid = room.setup?.scoreBid;
  const currentId = scoreBid?.current?.playerId;
  if (!currentId) return false;
  const passIds = new Set(scoreBid.passIds || []);
  return room.players.every((player) => player.id === currentId || passIds.has(player.id));
}

function enterTrumpSelecting(room) {
  clearBoardHeroSkillTimer(room);
  room.stage = "trump-selecting";
  room.phase = `${playerName(room, room.bankerId)} 等待选择主花色`;
}

function beginYokoyamaSkillStage(room) {
  clearBoardHeroSkillTimer(room);
  const queuePlayerIds = room.players
    .filter((player) => playerHasBoardHero(room, player, "yokoyama-yui"))
    .map((player) => player.id);
  room.boardHeroSkills.yokoyama = {
    queuePlayerIds,
    currentPlayerId: null,
    candidates: [],
    paid: false,
    deadlineAt: null
  };
  return advanceYokoyamaSkillStage(room);
}

function advanceYokoyamaSkillStage(room) {
  const state = room.boardHeroSkills.yokoyama;
  state.currentPlayerId = state.queuePlayerIds.shift() || null;
  state.candidates = [];
  state.paid = false;
  if (!state.currentPlayerId) {
    state.deadlineAt = null;
    enterTrumpSelecting(room);
    return false;
  }
  state.deadlineAt = new Date(Date.now() + BOARD_HERO_SKILL_SECONDS * 1000).toISOString();
  room.stage = "yokoyama-skill";
  room.phase = `等待 ${playerName(room, state.currentPlayerId)} 决定是否发动全能偶像`;
  return true;
}

async function activateYokoyamaSkill(room, player, requestId) {
  if (room.stage !== "yokoyama-skill") return { error: "当前不是全能偶像发动阶段", status: 409 };
  const state = room.boardHeroSkills.yokoyama;
  if (state.currentPlayerId !== player.id) return { error: `现在轮到 ${playerName(room, state.currentPlayerId)} 选择`, status: 409 };
  if (state.paid) return { error: "已经生成候选玩家", status: 409 };
  const stars = Math.max(1, Math.min(5, Number(player.battleHeroSnapshot?.stars) || 1));
  const candidates = shuffle(room.players.filter((item) => item.id !== player.id))
    .slice(0, stars)
    .map((item) => item.id);
  const payment = await chargeRoomBoardHeroSkill(
    room,
    player.accountId,
    room.gameRecordId,
    "yokoyama-yui",
    requestId || `yokoyama:${room.gameRecordId}:${player.id}`,
    { candidatePlayerIds: candidates }
  );
  recordBoardHeroSkillUse(room, player, "yokoyama-yui", payment, { candidatePlayerIds: candidates });
  state.paid = true;
  state.candidates = candidates;
  state.deadlineAt = new Date(Date.now() + BOARD_HERO_SKILL_SECONDS * 1000).toISOString();
  room.phase = `${player.name} 已发动全能偶像，等待选择换位玩家`;
  addEvent(room, `${player.name} 发动全能偶像，获得 ${candidates.length} 名随机换位候选人`);
  return { ok: true };
}

function finishYokoyamaChoice(room, player, targetPlayerId = null) {
  if (room.stage !== "yokoyama-skill") return { error: "当前不是全能偶像发动阶段", status: 409 };
  const state = room.boardHeroSkills.yokoyama;
  if (state.currentPlayerId !== player.id) return { error: `现在轮到 ${playerName(room, state.currentPlayerId)} 选择`, status: 409 };
  if (targetPlayerId) {
    if (!state.paid || !state.candidates.includes(targetPlayerId)) return { error: "该玩家不在本次随机候选中", status: 400 };
    const selfIndex = room.players.findIndex((item) => item.id === player.id);
    const targetIndex = room.players.findIndex((item) => item.id === targetPlayerId);
    if (selfIndex < 0 || targetIndex < 0) return { error: "换位玩家已经离开房间", status: 409 };
    const target = room.players[targetIndex];
    [room.players[selfIndex], room.players[targetIndex]] = [room.players[targetIndex], room.players[selfIndex]];
    room.boardHeroEffects.seatSwaps.push({
      playerId: player.id,
      targetPlayerId: target.id,
      fromSeat: selfIndex + 1,
      toSeat: targetIndex + 1,
      at: now()
    });
    addEvent(room, `${player.name} 使用全能偶像，与 ${target.name} 交换座位；双方身份和手牌不变`);
  } else {
    addEvent(room, `${player.name}${state.paid ? "放弃本次换位" : "不发动全能偶像"}`);
  }
  advanceYokoyamaSkillStage(room);
  return { ok: true };
}

function finishScoreBidding(room) {
  clearScoreBidTimer(room);
  const scoreBid = ensureScoreBidSetup(room);
  if (!scoreBid.current) return { error: "还没有玩家叫分抢庄", status: 409 };
  room.bankerId = scoreBid.current.playerId;
  scoreBid.passIds = [];
  scoreBid.deadlineAt = null;
  addEvent(room, `${playerName(room, room.bankerId)} 以 ${scoreBid.current.score} 分成为庄家`);
  beginYokoyamaSkillStage(room);
  return { ok: true };
}

function submitScoreBid(room, player, increment) {
  if (room.stage !== "score-bidding") return { error: "当前不能叫分抢庄", status: 409 };
  const scoreBid = ensureScoreBidSetup(room);
  const current = scoreBid.current || null;
  if (current?.playerId === player.id) return { error: "你已经是当前最高叫分", status: 400 };

  const allowed = new Set([10, 20, 30]);
  let nextScore = scoreBid.minimum || openingBankerScore(room);
  let normalizedIncrement = 0;
  if (current) {
    normalizedIncrement = Number(increment);
    if (!allowed.has(normalizedIncrement)) return { error: "每次只能加 10、20 或 30 分", status: 400 };
    nextScore = current.score + normalizedIncrement;
  }
  if (nextScore > totalGamePoints(room)) return { error: "叫分不能超过该局总分", status: 400 };

  scoreBid.current = {
    playerId: player.id,
    score: nextScore,
    at: now()
  };
  scoreBid.passIds = [];
  scoreBid.deadlineAt = new Date(Date.now() + SCORE_BID_SECONDS * 1000).toISOString();
  if (!scoreBid.history) scoreBid.history = [];
  scoreBid.history.push({
    playerId: player.id,
    score: nextScore,
    increment: normalizedIncrement,
    at: scoreBid.current.at
  });
  room.phase = `${player.name} 叫 ${nextScore} 分抢庄，等待其他玩家加分或过`;
  addEvent(room, `${player.name} ${current ? `加 ${normalizedIncrement} 分` : "起叫"}，当前叫分 ${nextScore}`);
  if (scoreBidOthersPassed(room)) return finishScoreBidding(room);
  return { ok: true };
}

function passScoreBid(room, player) {
  if (room.stage !== "score-bidding") return { error: "当前不能过叫分", status: 409 };
  const scoreBid = ensureScoreBidSetup(room);
  if (!scoreBid.current) return { error: "还没有玩家叫分，暂不能过", status: 409 };
  if (scoreBid.current.playerId === player.id) return { error: "当前最高叫分玩家不需要过", status: 400 };
  if (!scoreBid.passIds.includes(player.id)) scoreBid.passIds.push(player.id);
  addEvent(room, `${player.name} 选择不加分`);
  if (scoreBidOthersPassed(room)) return finishScoreBidding(room);
  room.phase = `${playerName(room, scoreBid.current.playerId)} 当前 ${scoreBid.current.score} 分，等待其他玩家加分或过`;
  return { ok: true };
}

function autoAdvanceExpiredScoreBid(room) {
  if (room.stage !== "score-bidding") return false;
  const scoreBid = room.setup?.scoreBid;
  if (!scoreBid?.current?.playerId || !scoreBid.deadlineAt) return false;
  const deadline = new Date(scoreBid.deadlineAt).getTime();
  if (!Number.isFinite(deadline) || deadline > Date.now()) return false;
  room.players.forEach((player) => {
    if (player.id === scoreBid.current.playerId) return;
    if (!scoreBid.passIds.includes(player.id)) scoreBid.passIds.push(player.id);
  });
  addEvent(room, "叫分倒计时结束，未操作玩家自动过");
  finishScoreBidding(room);
  return true;
}

function selectTrumpSuit(room, player, suit) {
  if (room.stage !== "trump-selecting") return { error: "当前不能选择主花色", status: 409 };
  if (player.id !== room.bankerId) return { error: "只有庄家可以选择主花色", status: 403 };
  const bid = bidFromSuit(room, player, suit);
  if (bid.error) return bid;
  room.setup.bid = bid;
  if (!room.setup.bidHistory) room.setup.bidHistory = [];
  room.setup.bidHistory.push(bid);
  room.phase = `${player.name} 选择${suitName(bid.suit)}为主，等待贴底`;
  addEvent(room, `${player.name} 选择${suitName(bid.suit)}为主`);
  beginBurying(room);
  return { ok: true };
}

function startFrying(room) {
  room.stage = "frying";
  room.phase = "炒底";
  room.setup.fry = {
    currentPlayerId: nextPlayerId(room, room.bankerId),
    lastFryerId: room.bankerId,
    lastBid: room.setup.bid,
    pendingBid: null,
    history: [],
    passesSinceLast: 0,
    deadlineAt: new Date(Date.now() + FRY_SECONDS * 1000).toISOString(),
    passIds: []
  };
  addEvent(room, `开始炒底，当前底牌 ${room.kitty.length} 张`);
}

function shenJiangwenCanActivate(room, player) {
  const state = room.boardHeroSkills.shenJiangwen;
  return Boolean(
    room.stage === "frying"
    && room.setup.fry?.currentPlayerId === player?.id
    && playerHasBoardHero(room, player, "shen-jiangwen")
    && !state.offeredPlayerIds.includes(player.id)
  );
}

function completeShenJiangwenOffer(room, player) {
  if (!playerHasBoardHero(room, player, "shen-jiangwen")) return;
  const offered = room.boardHeroSkills.shenJiangwen.offeredPlayerIds;
  if (!offered.includes(player.id)) offered.push(player.id);
}

async function activateShenJiangwenSkill(room, player, requestId) {
  if (!shenJiangwenCanActivate(room, player)) return { error: "排骨之王只能在首次轮到本人炒底时发动", status: 409 };
  const payment = await chargeRoomBoardHeroSkill(
    room,
    player.accountId,
    room.gameRecordId,
    "shen-jiangwen",
    requestId || `shen-jiangwen:${room.gameRecordId}:${player.id}`,
    { directFry: true }
  );
  completeShenJiangwenOffer(room, player);
  recordBoardHeroSkillUse(room, player, "shen-jiangwen", payment, { directFry: true });
  player.hand = sortHand([...player.hand, ...room.kitty]);
  room.kitty = [];
  room.setup.fry.directSkillPendingPlayerId = player.id;
  room.setup.fry.deadlineAt = null;
  room.boardHeroSkills.shenJiangwen.directPlayerId = player.id;
  room.stage = "fry-burying";
  room.phase = `${player.name} 发动排骨之王，等待贴底`;
  addEvent(room, `${player.name} 发动排骨之王，直接拿入底牌；本次不提高炒底门槛`);
  return { ok: true };
}

function continueFryingAfterBury(room, player) {
  const fry = room.setup.fry;
  if (fry.directSkillPendingPlayerId === player.id) {
    fry.directSkillPendingPlayerId = null;
    fry.lastFryerId = player.id;
    fry.pendingBid = null;
    fry.passesSinceLast = 0;
    fry.passIds = [];
    fry.currentPlayerId = nextPlayerId(room, player.id);
    fry.deadlineAt = new Date(Date.now() + FRY_SECONDS * 1000).toISOString();
    room.stage = "frying";
    room.phase = `等待 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`;
    addEvent(room, `${player.name} 完成排骨之王贴底，炒底门槛保持不变`);
    return;
  }
  fry.lastBid = fry.pendingBid;
  fry.lastFryerId = player.id;
  fry.pendingBid = null;
  fry.passesSinceLast = 0;
  fry.passIds = [];
  fry.currentPlayerId = nextPlayerId(room, player.id);
  fry.deadlineAt = new Date(Date.now() + FRY_SECONDS * 1000).toISOString();
  room.stage = "frying";
  room.phase = `等待 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`;
  addEvent(room, `${player.name} 完成炒底贴底，继续下一家`);
}

function beginPlaying(room) {
  clearAiSetupTimer(room);
  clearScoreBidTimer(room);
  clearFryTimer(room);
  room.stage = "playing";
  room.phase = `打牌中，主牌为${suitName(room.trumpSuit)}`;
  room.currentTrick = createEmptyTrick(1, room.bankerId);
  if (!room.doglegPlayerIds) room.doglegPlayerIds = [];
}

function finishFrying(room) {
  clearFryTimer(room);
  const lastBid = room.setup.fry?.lastBid || room.setup.bid;
  if (room.setup.fry) room.setup.fry.deadlineAt = null;
  room.trumpSuit = lastBid?.suit || randomSuitId();
  addEvent(room, `炒底结束，主牌确定为${suitName(room.trumpSuit)}`);
  if (!room.doglegNeeded) {
    room.doglegCard = null;
    room.doglegPlayerIds = [];
    room.dynamicDogleg = null;
    room.hiddenDogleg = null;
    room.randomOrderDogleg = null;
    beginPlaying(room);
    addEvent(room, "本局不设置狗腿，直接开始打牌");
    return;
  }
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_DYNAMIC) {
    room.doglegCard = null;
    room.doglegPlayerIds = [];
    room.dynamicDogleg = createDynamicDoglegState(room.players, room.bankerId);
    room.hiddenDogleg = null;
    room.randomOrderDogleg = null;
    beginPlaying(room);
    addEvent(room, "本局使用动态狗腿，已为每名非庄家玩家随机标记一张狗腿牌");
    return;
  }
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_HIDDEN) {
    room.doglegCard = null;
    room.doglegPlayerIds = [];
    room.dynamicDogleg = null;
    room.hiddenDogleg = createHiddenDoglegState(room.players, room.bankerId, room.doglegNeeded);
    room.randomOrderDogleg = null;
    beginPlaying(room);
    addEvent(room, `本局使用暗狗腿，已随机确定 ${hiddenDoglegPlayerIds(room.hiddenDogleg).length} 名暗狗腿并分别标记专属狗腿牌`);
    return;
  }
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_RANDOM_ORDER) {
    room.doglegPlayerIds = [];
    room.dynamicDogleg = null;
    room.hiddenDogleg = null;
    room.randomOrderDogleg = createRandomOrderDoglegState(room.players, room.bankerId, room.doglegNeeded);
    room.doglegCard = room.randomOrderDogleg.card;
    beginPlaying(room);
    const positions = room.randomOrderDogleg.targetPositions.map((position) => `第 ${position} 次`).join("、") || "无";
    addEvent(room, `本局使用顺位狗腿，狗腿牌为 ${room.doglegCard?.label || "未生成"}；生效顺位为${positions}`);
    return;
  }
  room.dynamicDogleg = null;
  room.hiddenDogleg = null;
  room.randomOrderDogleg = null;
  room.stage = "dogleg";
  room.phase = `主牌为${suitName(room.trumpSuit)}，等待庄家选择狗腿牌`;
}

function buryCards(room, player, cardIds) {
  if (room.stage !== "burying" && room.stage !== "fry-burying") {
    return { error: "当前不能贴底", status: 409 };
  }
  const ownerId = room.stage === "burying" ? room.bankerId : room.setup.fry?.currentPlayerId;
  if (player.id !== ownerId) return { error: `现在轮到 ${playerName(room, ownerId)} 贴底`, status: 409 };

  const selected = selectedCardsFromHand(player, cardIds);
  if (selected.error) return selected;
  if (selected.cards.length !== room.kittySize) {
    return { error: `需要选择 ${room.kittySize} 张牌贴到底里`, status: 400 };
  }

  removeCardsFromHand(player, selected.cardIds);
  room.kitty = selected.cards;
  addEvent(room, `${player.name} 贴入 ${selected.cards.length} 张底牌`);
  if (room.stage === "burying") {
    startFrying(room);
  } else {
    continueFryingAfterBury(room, player);
  }
  return { ok: true };
}

function passFry(room, player, options = {}) {
  if (room.stage !== "frying") return { error: "当前不能选择不炒", status: 409 };
  const fry = room.setup.fry;
  if (fry.currentPlayerId !== player.id) {
    return { error: `现在轮到 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`, status: 409 };
  }
  completeShenJiangwenOffer(room, player);
  fry.passesSinceLast += 1;
  if (!fry.passIds) fry.passIds = [];
  if (!fry.passIds.includes(player.id)) fry.passIds.push(player.id);
  addEvent(room, options.automatic ? `${player.name} 炒底倒计时结束，自动不炒` : `${player.name} 选择不炒底`);
  if (fry.passesSinceLast >= room.players.length - 1) {
    finishFrying(room);
    return { ok: true };
  }
  fry.currentPlayerId = nextPlayerId(room, player.id);
  fry.deadlineAt = new Date(Date.now() + FRY_SECONDS * 1000).toISOString();
  room.phase = `等待 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`;
  return { ok: true };
}

function submitFry(room, player, cardIds) {
  if (room.stage !== "frying") return { error: "当前不能炒底", status: 409 };
  const fry = room.setup.fry;
  if (fry.currentPlayerId !== player.id) {
    return { error: `现在轮到 ${playerName(room, fry.currentPlayerId)} 炒底或不炒`, status: 409 };
  }
  const bid = bidFromCards(room, player, cardIds);
  if (bid.error) return bid;
  const strength = room.gameItems?.frySuitOrder
    ? frySuitStrength(room.gameItems.frySuitOrder)
    : suitStrength;
  if (!bidBeats(fry.lastBid, bid, strength)) {
    return { error: `选择的 ${currentBidRankName(room)} 不能压过当前炒底`, status: 400 };
  }

  completeShenJiangwenOffer(room, player);
  player.hand = sortHand([...player.hand, ...room.kitty]);
  room.kitty = [];
  fry.pendingBid = bid;
  fry.deadlineAt = null;
  if (!fry.history) fry.history = [];
  fry.history.push(bid);
  room.stage = "fry-burying";
  room.phase = `${player.name} 炒底，等待贴底`;
  addEvent(room, `${player.name} 用 ${bid.count} 张${suitName(bid.suit)}${currentBidRankName(room)} 炒底并拿入底牌`);
  return { ok: true };
}

function autoAdvanceExpiredFry(room) {
  if (room.stage !== "frying") return false;
  const fry = room.setup?.fry;
  if (!fry?.currentPlayerId || !fry.deadlineAt) return false;
  const deadline = new Date(fry.deadlineAt).getTime();
  if (!Number.isFinite(deadline) || deadline > Date.now()) return false;
  const player = playerById(room, fry.currentPlayerId);
  if (!player) return false;
  const result = passFry(room, player, { automatic: true });
  return !result.error;
}

function cardColor(card) {
  if (card.suit === "H" || card.suit === "D") return "red";
  if (card.suit === "S" || card.suit === "C") return "black";
  return "";
}

function isCompareCard(card, trumpSuit) {
  if (card.type === "joker") return true;
  if (gameRank(card) === "2") return true;
  if ((card.suit === "H" || card.suit === "D") && card.rank === "5") return true;
  if (card.rank === "3" && trumpSuit && cardColor(card) === cardColor({ suit: trumpSuit })) return true;
  return false;
}

function sameDoglegCard(card, doglegCard) {
  if (!card || !doglegCard) return false;
  return card.type === "normal" && card.suit === doglegCard.suit && card.rank === doglegCard.rank;
}

function sameRoomDoglegCard(room, card) {
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_RANDOM_ORDER) {
    return sameRandomOrderDoglegCard(card, room.doglegCard);
  }
  return sameDoglegCard(card, room.doglegCard);
}

function doglegTargetCount(room) {
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_RANDOM_ORDER) {
    return (room.randomOrderDogleg?.targetPositions || []).length;
  }
  return Math.max(0, Number(room.doglegNeeded) || 0);
}

function revealDoglegIfNeeded(room, player, selected) {
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_HIDDEN) {
    if (!room.hiddenDogleg) return;
    const outcome = applyHiddenDoglegPlay(room.hiddenDogleg, {
      playerId: player.id,
      playedCards: selected
    });
    room.hiddenDogleg = outcome.state;
    room.doglegPlayerIds = outcome.doglegPlayerIds;
    if (!outcome.hit) return;
    const hitCard = selected.find((card) => card.id === outcome.hit.cardId);
    addEvent(room, `${player.name} 打出暗狗腿牌${hitCard?.label ? ` ${hitCard.label}` : ""}，公开狗腿身份`);
    return;
  }
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_DYNAMIC) {
    if (player.id === room.bankerId || !room.dynamicDogleg) return;
    const previousDoglegIds = new Set(room.doglegPlayerIds || []);
    const outcome = applyDynamicDoglegPlay(room.dynamicDogleg, {
      playerId: player.id,
      playedCards: selected,
      remainingHand: player.hand,
      needed: room.doglegNeeded
    });
    room.dynamicDogleg = outcome.state;
    room.doglegPlayerIds = outcome.doglegPlayerIds;
    if (!outcome.hit) return;
    const hitCard = selected.find((card) => card.id === outcome.hit.cardId);
    addEvent(room, `${player.name} 打出动态狗腿牌${hitCard?.label ? ` ${hitCard.label}` : ""}，获得第 ${outcome.hit.count} 个狗腿标记`);
    const enteredIds = room.doglegPlayerIds.filter((playerId) => !previousDoglegIds.has(playerId));
    const exitedIds = [...previousDoglegIds].filter((playerId) => !room.doglegPlayerIds.includes(playerId));
    if (enteredIds.length || exitedIds.length) {
      const names = room.doglegPlayerIds.map((playerId) => playerName(room, playerId));
      addEvent(room, `当前狗腿：${names.length ? names.join("、") : "暂无"}`);
    }
    return;
  }
  if (normalizeDoglegMode(room.doglegMode) === DOGLEG_MODE_RANDOM_ORDER) {
    if (player.id === room.bankerId || !room.randomOrderDogleg) return;
    const outcome = applyRandomOrderDoglegPlay(room.randomOrderDogleg, {
      playerId: player.id,
      playedCards: selected
    });
    room.randomOrderDogleg = outcome.state;
    room.doglegPlayerIds = outcome.doglegPlayerIds;
    if (!outcome.hit) return;
    const hitCard = selected.find((card) => sameRandomOrderDoglegCard(card, room.doglegCard));
    if (outcome.hit.becameDogleg) {
      addEvent(room, `${player.name} 第 ${outcome.hit.sequence} 次有效打出顺位狗腿牌${hitCard?.label ? ` ${hitCard.label}` : ""}，命中顺位并成为狗腿`);
    } else {
      addEvent(room, `${player.name} 第 ${outcome.hit.sequence} 次有效打出顺位狗腿牌${hitCard?.label ? ` ${hitCard.label}` : ""}，未命中生效顺位`);
    }
    return;
  }
  if (!room.doglegCard || player.id === room.bankerId) return;
  if ((room.doglegPlayerIds || []).includes(player.id)) return;
  if ((room.doglegPlayerIds || []).length >= (room.doglegNeeded || 0)) return;
  if (!selected.some((card) => sameDoglegCard(card, room.doglegCard))) return;
  if (!room.doglegPlayerIds) room.doglegPlayerIds = [];
  room.doglegPlayerIds.push(player.id);
  addEvent(room, `${player.name} 打出狗腿牌 ${room.doglegCard.label}，身份变为狗腿`);
}

function selectDogleg(room, player, cardIds) {
  if (room.stage !== "dogleg") return { error: "当前不能选择狗腿牌", status: 409 };
  if (player.id !== room.bankerId) return { error: "只有庄家可以选择狗腿牌", status: 403 };
  const selected = selectedCardsFromHand(player, cardIds);
  if (selected.error) return selected;
  if (selected.cards.length !== 1) return { error: "请选择 1 张牌作为狗腿牌", status: 400 };
  const card = selected.cards[0];
  if (isCompareCard(card, room.trumpSuit)) {
    return { error: "狗腿牌不能选择比牌", status: 400 };
  }
  room.doglegCard = {
    type: card.type,
    color: card.color,
    suit: card.suit,
    suitName: card.suitName,
    symbol: card.symbol,
    rank: card.rank,
    label: card.label
  };
  room.doglegPlayerIds = [];
  room.dynamicDogleg = null;
  room.hiddenDogleg = null;
  room.randomOrderDogleg = null;
  beginPlaying(room);
  addEvent(room, `${player.name} 选择 ${card.label} 为狗腿牌，开始打牌`);
  return { ok: true };
}

function autoDoglegCardId(room, player) {
  const candidates = sortHand(player.hand).filter((item) => !isCompareCard(item, room.trumpSuit));
  if (!candidates.length) return player.hand[0]?.id || null;
  const totalDeckCopies = room.players.length;
  const keyFor = (card) => `${card.suit}:${card.rank}`;
  const handCounts = new Map();
  player.hand.forEach((card) => {
    if (card.type !== "normal") return;
    const key = keyFor(card);
    handCounts.set(key, (handCounts.get(key) || 0) + 1);
  });
  const kittyCounts = new Map();
  room.kitty.forEach((card) => {
    if (card.type !== "normal") return;
    const key = keyFor(card);
    kittyCounts.set(key, (kittyCounts.get(key) || 0) + 1);
  });
  return candidates
    .map((card) => {
      const key = keyFor(card);
      const heldByBanker = handCounts.get(key) || 0;
      const buried = kittyCounts.get(key) || 0;
      const outsideCopies = Math.max(0, totalDeckCopies - heldByBanker - buried);
      const pointPenalty = cardPoint(card) * 12;
      const rankIndex = cardRulesRankSort(card);
      return {
        card,
        score: outsideCopies * 45 + rankIndex * 2 - heldByBanker * 10 - buried * 35 - pointPenalty
      };
    })
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))[0].card.id;
}

function aiTrumpSuit(room) {
  return room.trumpSuit || currentTrumpSuit(room);
}

function setupControlScore(cards, trumpSuit) {
  if (!trumpSuit) return 0;
  return cards.reduce((score, card) => {
    let next = score;
    if (isMainPlayCard(card, trumpSuit)) {
      next += 5;
      const power = patternValue(card, trumpSuit);
      if (power <= 8) next += Math.max(0, 18 - power * 2);
    }
    if (card.type === "normal" && card.suit === trumpSuit && !isCompareCard(card, trumpSuit)) next += 2;
    if (isProtectedFive(card)) next += 8;
    next += cardPoint(card) * 0.8;
    return next;
  }, 0);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tentativeTrumpBid(room) {
  return room.setup?.fry?.pendingBid || room.setup?.fry?.lastBid || room.setup?.bid || null;
}

function tentativeTrumpCertainty(room) {
  if (room.trumpSuit) return 1;
  const bid = tentativeTrumpBid(room);
  if (!bid) return 0.18;
  if (bid.direct) return 0.96;
  const count = bid.count || 1;
  const suitValue = suitStrength.get(bid.suit) ?? 0;
  const countValue = count <= 1 ? 0.18 : count === 2 ? 0.42 : count === 3 ? 0.68 : 0.86;
  const suitBonus = suitValue * 0.045;
  return clampNumber(countValue + suitBonus, 0.18, 0.96);
}

function groupAssetValue(group, trumpSuit) {
  if (!group || group.count < 2) return 0;
  const cards = group.cards || [];
  const width = group.count;
  const power = rankValue(cards[0], trumpSuit);
  const points = cardsPoint(cards);
  const isMain = playSuit(cards[0], trumpSuit) === "TRUMP";
  let value = 10 + (width - 1) * 13;
  value += Math.max(0, 18 - power) * 1.8;
  if (width >= 3) value += (width - 2) * 18;
  if (width >= 4) value += 18;
  value += points * (width >= 3 ? 1.55 : 0.75);
  if (isMain) value += 8 + width * 3;
  if (cards.some(isProtectedFive)) value += 42;
  return value;
}

function tractorAssetValue(groups, trumpSuit) {
  if (!groups?.length || groups.length < 2) return 0;
  const width = Math.min(...groups.map((group) => group.count));
  const points = cardsPoint(groups.flatMap((group) => group.cards.slice(0, width)));
  const bestPower = Math.min(...groups.map((group) => rankValue(group.cards[0], trumpSuit)));
  return 24 + groups.length * width * 9 + Math.max(0, 18 - bestPower) * 1.2 + points * 0.8;
}

function patternAssetScore(cards, trumpSuit) {
  const groups = cardsByRank(cards, trumpSuit)
    .filter((group) => group.count >= 2)
    .sort((a, b) => tractorOrderValue(a, trumpSuit) - tractorOrderValue(b, trumpSuit) || a.value - b.value);
  let score = groups.reduce((total, group) => total + groupAssetValue(group, trumpSuit), 0);
  const bySuit = new Map();
  groups.filter((group) => tractorOrderValue(group, trumpSuit) < 99).forEach((group) => {
    const suit = playSuit(group.cards[0], trumpSuit);
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(group);
  });
  for (const suitGroups of bySuit.values()) {
    for (let start = 0; start < suitGroups.length; start += 1) {
      const chain = [suitGroups[start]];
      for (let next = start + 1; next < suitGroups.length; next += 1) {
        if (!consecutiveTractorGroups(chain[chain.length - 1], suitGroups[next], trumpSuit)) break;
        chain.push(suitGroups[next]);
        if (chain.length >= 2) score += tractorAssetValue(chain, trumpSuit);
      }
    }
  }
  return score;
}

function cardShapeAssetCost(room, player, card) {
  if (!room.trumpSuit || !player?.hand?.length) return 0;
  const sameRank = player.hand.filter((item) => rankKey(item, room.trumpSuit) === rankKey(card, room.trumpSuit));
  if (sameRank.length < 2) return 0;
  let cost = (sameRank.length - 1) * 7;
  if (sameRank.length >= 3) cost += 18;
  if (sameRank.length >= 4) cost += 16;
  cost += cardPoint(card) * (sameRank.length >= 3 ? 1.8 : 0.8);
  if (playSuit(card, room.trumpSuit) === "TRUMP") cost += 8;
  if (isProtectedFive(card)) cost += 30;
  return cost;
}

function minimumBidCountToBeat(currentBid, suit, strength = suitStrength) {
  if (!currentBid) return 1;
  const currentCount = Number(currentBid.count) || 0;
  if (currentCount <= 0) return 1;
  if (currentCount === 1) return 2;
  if ((strength.get(suit) ?? -1) > (strength.get(currentBid.suit) ?? -1)) return currentCount;
  return currentCount + 1;
}

function highMainCount(cards, trumpSuit, maxPower = 8) {
  return cards.filter((card) => isMainPlayCard(card, trumpSuit) && patternValue(card, trumpSuit) <= maxPower).length;
}

function protectedFiveCount(cards) {
  return cards.filter(isProtectedFive).length;
}

function twoCountForSuit(player, suit) {
  return player.hand.filter((card) => card.type === "normal" && gameRank(card) === "2" && card.suit === suit).length;
}

function bidStrengthValue(bid, strength = suitStrength) {
  if (!bid) return 0;
  return (bid.count || 0) * 10 + (strength.get(bid.suit) ?? 0);
}

function bestPossibleBidStrength(player, strength = suitStrength) {
  return suits.reduce((best, suit) => {
    const count = twoCountForSuit(player, suit.id);
    if (!count) return best;
    return Math.max(best, bidStrengthValue({ count, suit: suit.id }, strength));
  }, 0);
}

function bidLockValue(room, player, suit, count) {
  const ownedTwos = twoCountForSuit(player, suit);
  const totalCopies = Math.max(1, room.players.length);
  const outsideCopies = Math.max(0, totalCopies - ownedTwos);
  const countPressure = Math.max(0, count - 1) * 12 + Math.max(0, count - 2) * 10;
  const scarcity = count > outsideCopies ? 26 : count === outsideCopies ? 12 : 0;
  const suitTieBreak = (suitStrength.get(suit) ?? 0) * 2;
  return countPressure + scarcity + suitTieBreak;
}

function futureFryFlexValue(player, bid) {
  return Math.max(0, bestPossibleBidStrength(player) - bidStrengthValue(bid));
}

function setupBottomControlScore(room, player, trumpSuit) {
  const control = setupControlScore(player.hand, trumpSuit);
  const topControls = highMainCount(player.hand, trumpSuit, 7);
  const mainCount = player.hand.filter((card) => isMainPlayCard(card, trumpSuit)).length;
  return control + topControls * 12 + mainCount * 1.5;
}

function setupIdleProbability(room, player) {
  if (player.id === room.bankerId) return 0;
  const nonBankers = Math.max(1, room.players.length - 1);
  return Math.max(0, (nonBankers - (room.doglegNeeded || 0)) / nonBankers);
}

function shouldAimForBottom(room, player, trumpSuit) {
  const bottomControl = setupBottomControlScore(room, player, trumpSuit);
  if (player.id === room.bankerId) return bottomControl >= 155;
  return setupIdleProbability(room, player) >= 0.6 && bottomControl >= 125;
}

function bidPowerScore(room, player, suit, count, { includeKitty = false } = {}) {
  const currentBid = includeKitty ? room.setup.fry?.lastBid : room.setup.bid;
  const strength = includeKitty && room.gameItems?.frySuitOrder
    ? frySuitStrength(room.gameItems.frySuitOrder)
    : suitStrength;
  const cards = includeKitty ? [...player.hand, ...room.kitty] : player.hand;
  const twoCount = twoCountForSuit(player, suit);
  const minimumCount = minimumBidCountToBeat(currentBid, suit, strength);
  const trumpNormalCount = cards.filter((card) => card.type === "normal" && card.suit === suit && !isCompareCard(card, suit)).length;
  const mainCount = cards.filter((card) => isMainPlayCard(card, suit)).length;
  const topMainCount = highMainCount(cards, suit, 8);
  const pointLoad = cardsPoint(cards.filter((card) => isMainPlayCard(card, suit)));
  const protectedFives = protectedFiveCount(cards);
  const control = setupControlScore(cards, suit);
  const shape = patternAssetScore(cards, suit);
  const kittyPointLoad = includeKitty ? cardsPoint(room.kitty) : 0;
  const kittyProtectedFives = includeKitty ? protectedFiveCount(room.kitty) : 0;
  const suitUpgrade = currentBid?.suit && currentBid.suit !== suit
    ? Math.max(-24, Math.min(36, setupControlScore(cards, suit) - setupControlScore(cards, currentBid.suit)))
    : 0;
  const extraCount = Math.max(0, count - minimumCount);
  const base = control * 0.72
    + mainCount * 2.2
    + topMainCount * 8
    + trumpNormalCount * 1.4
    + protectedFives * 14
    + pointLoad * 0.45
    + twoCount * 2.5
    + shape * 0.22;
  const bid = { count, suit };
  const lockValue = bidLockValue(room, player, suit, count);
  const lockBonus = includeKitty
    ? lockValue * (base >= 105 ? 0.9 : 0.35)
    : lockValue * (base >= 145 ? 0.7 : base >= 120 ? 0.35 : 0.05);
  const flexBonus = includeKitty ? 0 : futureFryFlexValue(player, bid) * (base >= 100 ? 2.4 : 1.2);
  const overbidPenalty = extraCount * (includeKitty ? 7 : 18);
  const bottomSwing = includeKitty ? kittyPointLoad * 1.2 + kittyProtectedFives * 28 + suitUpgrade * 0.55 : 0;
  return base + bottomSwing + count * 2.5 + lockBonus + flexBonus - overbidPenalty;
}

function bidCardIdsForSuit(player, suit, count) {
  return player.hand
    .filter((card) => card.type === "normal" && gameRank(card) === "2" && card.suit === suit)
    .slice(0, count)
    .map((card) => card.id);
}

function bestAutoBid(room, player, currentBid, options = {}) {
  const strength = options.includeKitty && room.gameItems?.frySuitOrder
    ? frySuitStrength(room.gameItems.frySuitOrder)
    : suitStrength;
  const choices = [];
  for (const suit of suits.map((item) => item.id)) {
    const count = player.hand.filter((card) => card.type === "normal" && gameRank(card) === "2" && card.suit === suit).length;
    for (let bidCount = 1; bidCount <= count; bidCount += 1) {
      const bid = { count: bidCount, suit };
      if (!bidBeats(currentBid, bid, strength)) continue;
      const score = bidPowerScore(room, player, suit, bidCount, options);
      choices.push({ bid, score, cardIds: bidCardIdsForSuit(player, suit, bidCount) });
    }
  }
  if (!choices.length) return null;
  const best = choices.sort((a, b) => {
    return b.score - a.score
      || a.bid.count - b.bid.count
      || (strength.get(b.bid.suit) ?? 0) - (strength.get(a.bid.suit) ?? 0);
  })[0];
  const kittyPressure = options.includeKitty
    ? Math.min(34, cardsPoint(room.kitty) * 0.7 + protectedFiveCount(room.kitty) * 12)
    : 0;
  const threshold = currentBid
    ? (options.includeKitty ? 96 : 108) + (currentBid.count || 1) * 15 - kittyPressure
    : 82;
  return best.score >= threshold ? best : null;
}

function buryContext(room, player) {
  const trumpSuit = aiTrumpSuit(room);
  const banker = player.id === room.bankerId;
  const idleProbability = banker ? 0 : setupIdleProbability(room, player);
  const aimForBottom = shouldAimForBottom(room, player, trumpSuit);
  const trumpCertainty = tentativeTrumpCertainty(room);
  return { trumpSuit, banker, idleProbability, aimForBottom, trumpCertainty };
}

function sideBurySuit(card, trumpSuit) {
  const suit = playSuit(card, trumpSuit);
  return suit === "TRUMP" ? null : suit;
}

function autoBuryCardScore(room, player, card, context = buryContext(room, player)) {
  const trumpSuit = context.trumpSuit;
  const isMain = isMainPlayCard(card, trumpSuit);
  const protectedFive = isProtectedFive(card);
  const points = cardPoint(card);
  const power = patternValue(card, trumpSuit);
  let score = 0;

  score += Math.max(0, power - 8) * 0.7;
  if (!isMain && !points) score += 12;
  if (isMain) score -= 36 + Math.max(0, 18 - power) * 1.2;
  if (!room.trumpSuit && card.type === "normal" && card.rank === "3" && !isMain) {
    score -= (1 - (context.trumpCertainty ?? tentativeTrumpCertainty(room))) * 34;
  }

  if (context.banker) {
    score -= points * (context.aimForBottom ? 5 : 13);
    if (protectedFive) score -= card.suit === "D" ? 220 : 260;
  } else {
    const idle = context.idleProbability;
    score += points * (context.aimForBottom ? 8 * idle - 1.5 * (1 - idle) : 1.8 * idle - 7 * (1 - idle));
    if (protectedFive && card.suit === "D") {
      score += context.aimForBottom ? 88 * idle - 12 * (1 - idle) : 42 * idle - 12 * (1 - idle);
    } else if (protectedFive && card.suit === "H") {
      score += context.aimForBottom ? 58 * idle - 28 * (1 - idle) : 10 * idle - 42 * (1 - idle);
    }
  }

  return score;
}

function buryVoidBonus(room, player, cards, context) {
  const selectedIds = new Set(cards.map((card) => card.id));
  let bonus = 0;
  suits.forEach((suit) => {
    const suitCards = player.hand.filter((card) => sideBurySuit(card, context.trumpSuit) === suit.id);
    if (!suitCards.length) return;
    const buried = suitCards.filter((card) => selectedIds.has(card.id));
    if (!buried.length) return;
    const remaining = suitCards.length - buried.length;
    const suitPoints = cardsPoint(suitCards);
    const buriedPoints = cardsPoint(buried);
    if (remaining === 0) {
      bonus += 24 + Math.min(5, suitCards.length) * 5;
      if (suitCards.length <= 3) bonus += 16;
      bonus -= suitPoints * (context.aimForBottom ? 0.4 : 1.8);
    } else if (remaining <= 2 && buried.length >= 2) {
      const remainingCards = suitCards.filter((card) => !selectedIds.has(card.id));
      const strongRemainder = remainingCards.length
        && remainingCards.every((card) => patternValue(card, context.trumpSuit) <= 3);
      bonus += 8 + buried.length * 2;
      if (strongRemainder) bonus += 18 + remainingCards.length * 5;
    }
    if (context.banker && buriedPoints) bonus -= buriedPoints * (remaining === 0 ? 0.8 : 2.2);
  });
  return bonus;
}

function buryPatternBreakPenalty(room, player, cards, context) {
  const selectedIds = new Set(cards.map((card) => card.id));
  const trumpSuit = context.trumpSuit;
  let penalty = 0;
  const groups = cardsByRank(player.hand, trumpSuit)
    .filter((group) => group.count >= 2)
    .sort((a, b) => tractorOrderValue(a, trumpSuit) - tractorOrderValue(b, trumpSuit) || a.value - b.value);

  groups.forEach((group) => {
    const selectedCount = group.cards.filter((card) => selectedIds.has(card.id)).length;
    if (!selectedCount) return;
    const asset = groupAssetValue(group, trumpSuit);
    const fullGroup = selectedCount === group.count;
    penalty += asset * (fullGroup ? 0.58 : 0.92);
    if (!fullGroup) penalty += selectedCount * 12;
  });

  const bySuit = new Map();
  groups.filter((group) => tractorOrderValue(group, trumpSuit) < 99).forEach((group) => {
    const suit = playSuit(group.cards[0], trumpSuit);
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(group);
  });

  for (const suitGroups of bySuit.values()) {
    for (let start = 0; start < suitGroups.length; start += 1) {
      const chain = [suitGroups[start]];
      for (let next = start + 1; next < suitGroups.length; next += 1) {
        if (!consecutiveTractorGroups(chain[chain.length - 1], suitGroups[next], trumpSuit)) break;
        chain.push(suitGroups[next]);
        if (chain.length < 2) continue;
        const width = Math.min(...chain.map((group) => group.count));
        const chainCards = chain.flatMap((group) => group.cards.slice(0, width));
        const selectedCount = chainCards.filter((card) => selectedIds.has(card.id)).length;
        if (!selectedCount) continue;
        const fullChain = selectedCount === chainCards.length;
        penalty += tractorAssetValue(chain, trumpSuit) * (fullChain ? 0.38 : 0.7);
      }
    }
  }

  return penalty;
}

function buryComboScore(room, player, cards, context) {
  let score = cards.reduce((total, card) => total + autoBuryCardScore(room, player, card, context), 0);
  score += buryVoidBonus(room, player, cards, context);
  score -= buryPatternBreakPenalty(room, player, cards, context);
  const mainCount = cards.filter((card) => isMainPlayCard(card, context.trumpSuit)).length;
  if (!context.aimForBottom && mainCount >= Math.ceil(cards.length / 2)) score -= mainCount * 10;
  if (context.aimForBottom && !context.banker) score += cardsPoint(cards) * 0.8 + protectedFiveCount(cards) * 12;
  if (context.banker) score -= cardsPoint(cards) * (context.aimForBottom ? 1.2 : 2.6);
  if (context.banker) score -= cards.filter(isProtectedFive).length * 120;
  return score;
}

function buryCandidateCards(room, player, count, context) {
  const scored = player.hand
    .map((card) => ({ card, score: autoBuryCardScore(room, player, card, context) }))
    .sort((a, b) => b.score - a.score || b.card.id.localeCompare(a.card.id));
  const candidateIds = new Set(scored.slice(0, Math.min(18, scored.length)).map((item) => item.card.id));

  suits.forEach((suit) => {
    const suitCards = player.hand.filter((card) => sideBurySuit(card, context.trumpSuit) === suit.id);
    if (suitCards.length && suitCards.length <= Math.max(4, count)) {
      suitCards.forEach((card) => candidateIds.add(card.id));
    }
  });

  if (!context.banker && (context.aimForBottom || context.idleProbability >= 0.55)) {
    player.hand.forEach((card) => {
      if (cardPoint(card) || isProtectedFive(card)) candidateIds.add(card.id);
    });
  }

  const candidates = player.hand
    .filter((card) => candidateIds.has(card.id))
    .sort((a, b) => autoBuryCardScore(room, player, b, context) - autoBuryCardScore(room, player, a, context) || b.id.localeCompare(a.id));
  if (candidates.length >= count) return candidates.slice(0, 15);
  scored.forEach((item) => candidateIds.add(item.card.id));
  return player.hand.filter((card) => candidateIds.has(card.id)).slice(0, Math.max(count, 15));
}

function bestBuryCombination(room, player, candidates, count, context) {
  let bestCards = candidates.slice(0, count);
  let bestScore = -Infinity;
  const current = [];

  function walk(start) {
    if (current.length === count) {
      const score = buryComboScore(room, player, current, context);
      if (score > bestScore) {
        bestScore = score;
        bestCards = [...current];
      }
      return;
    }
    const remainingNeeded = count - current.length;
    for (let index = start; index <= candidates.length - remainingNeeded; index += 1) {
      current.push(candidates[index]);
      walk(index + 1);
      current.pop();
    }
  }

  walk(0);
  return bestCards;
}

function autoBuryCardIds(player, count, room = null) {
  if (!room) return sortHand(player.hand).slice(-count).map((card) => card.id);
  const context = buryContext(room, player);
  const candidates = buryCandidateCards(room, player, count, context);
  return bestBuryCombination(room, player, candidates, count, context).map((card) => card.id);
}

function bestTrumpRevealChoice(room, player) {
  const choices = [];
  for (const suit of suits.map((item) => item.id)) {
    const count = twoCountForSuit(player, suit);
    for (let bidCount = 1; bidCount <= count; bidCount += 1) {
      const lockValue = bidLockValue(room, player, suit, bidCount);
      choices.push({
        suit,
        count: bidCount,
        score: bidPowerScore(room, player, suit, bidCount) + lockValue * 1.15 + bidCount * 4,
        cardIds: bidCardIdsForSuit(player, suit, bidCount)
      });
    }
  }
  if (!choices.length) return null;
  return choices.sort((a, b) => {
    return b.score - a.score
      || a.count - b.count
      || (suitStrength.get(b.suit) ?? 0) - (suitStrength.get(a.suit) ?? 0);
  })[0];
}

function trumpSuitChoiceScore(room, player, suit) {
  const cards = player.hand;
  const trumpNormalCount = cards.filter((card) => card.type === "normal" && card.suit === suit && !isCompareCard(card, suit)).length;
  const mainCount = cards.filter((card) => isMainPlayCard(card, suit)).length;
  const topMainCount = highMainCount(cards, suit, 8);
  const pointLoad = cardsPoint(cards.filter((card) => isMainPlayCard(card, suit)));
  const control = setupControlScore(cards, suit);
  const shape = patternAssetScore(cards, suit);
  const twoCount = twoCountForSuit(player, suit);
  return control * 0.72
    + mainCount * 2.2
    + topMainCount * 8
    + trumpNormalCount * 1.4
    + pointLoad * 0.45
    + shape * 0.22
    + twoCount * 2.5
    + (suitStrength.get(suit) ?? 0) * 1.6;
}

function bestTrumpSuitChoice(room, player) {
  return suits
    .map((suit) => ({
      suit: suit.id,
      count: 0,
      score: trumpSuitChoiceScore(room, player, suit.id),
      direct: true
    }))
    .sort((a, b) => b.score - a.score || (suitStrength.get(b.suit) ?? 0) - (suitStrength.get(a.suit) ?? 0))[0];
}

function trumpRevealCertainty(room, player, choice) {
  if (!choice) return 0;
  if (choice.direct) return 0.96;
  const lock = bidLockValue(room, player, choice.suit, choice.count);
  const suitValue = suitStrength.get(choice.suit) ?? 0;
  const base = choice.count <= 1 ? 0.25 : choice.count === 2 ? 0.46 : choice.count === 3 ? 0.72 : 0.9;
  return clampNumber(base + suitValue * 0.045 + lock * 0.009, 0.18, 0.98);
}

function estimatedBankerScoreCapacity(room, player, trumpSuit, choice) {
  const total = totalGamePoints(room);
  const handPoints = cardsPoint(player.hand);
  const control = setupControlScore(player.hand, trumpSuit);
  const shape = Math.min(patternAssetScore(player.hand, trumpSuit), 145 + room.players.length * 9);
  const mainCount = player.hand.filter((card) => isMainPlayCard(card, trumpSuit)).length;
  const topMainCount = highMainCount(player.hand, trumpSuit, 8);
  const protectedCount = protectedFiveCount(player.hand);
  const doglegShare = (room.doglegNeeded || 0) * (total / Math.max(1, room.players.length)) * 0.78;
  const certainty = trumpRevealCertainty(room, player, choice);
  let estimate = 0;
  estimate += handPoints * 0.74;
  estimate += control * 0.44;
  estimate += shape * 0.34;
  estimate += mainCount * 1.5;
  estimate += topMainCount * 7.5;
  estimate += doglegShare;
  estimate += protectedCount * (control >= 120 ? 5 : -8);
  estimate -= Math.max(0, 96 - control) * 0.45;
  estimate -= (1 - certainty) * 46;
  const hardCap = total * 0.58
    + Math.max(0, control - 130) * 0.28
    + Math.max(0, topMainCount - 4) * 3
    + (certainty - 0.5) * 28;
  const strategicCap = openingBankerScore(room)
    + 48
    + Math.max(0, control - 140) * 0.16
    + Math.max(0, shape - 95) * 0.07
    + Math.max(0, topMainCount - 5) * 2.4
    + (certainty - 0.55) * 18;
  return clampNumber(Math.min(estimate, hardCap, strategicCap), 0, total * 0.7);
}

function bestAutoScoreBid(room, player) {
  const scoreBid = ensureScoreBidSetup(room);
  const trumpChoice = bestTrumpSuitChoice(room, player);
  if (!trumpChoice) return null;
  const strength = trumpChoice.score + setupControlScore(player.hand, trumpChoice.suit) * 0.18;
  const capacity = estimatedBankerScoreCapacity(room, player, trumpChoice.suit, trumpChoice);
  const minimum = scoreBid.minimum || openingBankerScore(room);
  const riskBuffer = 18 + (room.players.length - 5) * 5;
  const comfortableScore = Math.max(minimum, Math.floor((capacity - riskBuffer) / 10) * 10);
  const current = scoreBid.current || null;
  if (!current) {
    return comfortableScore >= minimum && strength >= 88 ? { increment: 0, score: minimum, strength, capacity } : null;
  }
  if (current.playerId === player.id) return null;
  const options = [30, 20, 10]
    .map((increment) => ({ increment, score: current.score + increment, strength, capacity }))
    .filter((item) => item.score <= totalGamePoints(room) && item.score <= comfortableScore);
  return options[0] || null;
}

function autoProgressTestSetup(room, maxActions = Number.POSITIVE_INFINITY) {
  let actions = 0;
  let safety = room.players.length * 8;
  while (safety > 0 && actions < maxActions) {
    safety -= 1;
    autoAdvanceExpiredScoreBid(room);
    autoAdvanceExpiredFry(room);

    if (room.stage === "score-bidding") {
      const scoreBid = ensureScoreBidSetup(room);
      const currentId = scoreBid.current?.playerId || null;
      const passed = new Set(scoreBid.passIds || []);
      const candidates = room.players.filter((player) => player.test && player.id !== currentId && !passed.has(player.id));
      if (!candidates.length) break;
      if (!currentId) {
        const best = candidates
          .map((player) => ({ player, choice: bestAutoScoreBid(room, player) }))
          .filter((item) => item.choice)
          .sort((a, b) => b.choice.strength - a.choice.strength)[0];
        if (!best) break;
        const result = submitScoreBid(room, best.player, best.choice.increment);
        if (result.error) break;
        actions += 1;
        continue;
      }
      const best = candidates
        .map((player) => ({ player, choice: bestAutoScoreBid(room, player) }))
        .filter((item) => item.choice)
        .sort((a, b) => b.choice.score - a.choice.score || b.choice.strength - a.choice.strength)[0];
      const result = best ? submitScoreBid(room, best.player, best.choice.increment) : passScoreBid(room, candidates[0]);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "trump-selecting") {
      const player = playerById(room, room.bankerId);
      if (!player?.test) break;
      const choice = bestTrumpSuitChoice(room, player);
      if (!choice) break;
      const result = selectTrumpSuit(room, player, choice.suit);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "bidding" && !room.setup.bid) {
      const best = room.players
        .filter((player) => player.test)
        .map((player) => ({ player, choice: bestAutoBid(room, player, null) }))
        .filter((item) => item.choice)
        .sort((a, b) => b.choice.score - a.choice.score)[0];
      if (!best) break;
      const result = submitBid(room, best.player, best.choice.cardIds);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "bidding" && room.setup.bid) {
      const player = playerById(room, room.setup.biddingTurnPlayerId);
      if (!player?.test) break;
      const bidChoice = bestAutoBid(room, player, room.setup.bid);
      const result = bidChoice ? submitBid(room, player, bidChoice.cardIds) : passBid(room, player);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "burying") {
      const player = playerById(room, room.bankerId);
      if (!player?.test) break;
      const result = buryCards(room, player, autoBuryCardIds(player, room.kittySize, room));
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "frying") {
      const player = playerById(room, room.setup.fry?.currentPlayerId);
      if (!player?.test) break;
      const fryChoice = bestAutoBid(room, player, room.setup.fry?.lastBid, { includeKitty: true });
      const result = fryChoice ? submitFry(room, player, fryChoice.cardIds) : passFry(room, player);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "fry-burying") {
      const player = playerById(room, room.setup.fry?.currentPlayerId);
      if (!player?.test) break;
      const result = buryCards(room, player, autoBuryCardIds(player, room.kittySize, room));
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "dogleg") {
      const player = playerById(room, room.bankerId);
      if (!player?.test) break;
      const cardId = autoDoglegCardId(room, player);
      if (!cardId) break;
      const result = selectDogleg(room, player, [cardId]);
      if (result.error) break;
      actions += 1;
      continue;
    }

    if (room.stage === "playing") {
      scheduleNextAiPlay(room);
    }
    break;
  }
  return actions;
}

function clearAiSetupTimer(room) {
  if (!room?.aiSetupTimer) return;
  clearTimeout(room.aiSetupTimer);
  room.aiSetupTimer = null;
}

function clearScoreBidTimer(room) {
  if (!room?.scoreBidTimer) return;
  clearTimeout(room.scoreBidTimer);
  room.scoreBidTimer = null;
}

function clearFryTimer(room) {
  if (!room?.fryTimer) return;
  clearTimeout(room.fryTimer);
  room.fryTimer = null;
}

function clearGameItemStageTimer(room) {
  if (!room?.gameItemStageTimer) return;
  clearTimeout(room.gameItemStageTimer);
  room.gameItemStageTimer = null;
}

function clearBoardHeroSkillTimer(room) {
  if (!room?.boardHeroSkillTimer) return;
  clearTimeout(room.boardHeroSkillTimer);
  room.boardHeroSkillTimer = null;
}

async function autoAdvanceExpiredBoardHeroSkill(room) {
  if (room.stage === "shen-biesan-skill") {
    const state = room.boardHeroSkills.shenBiesan;
    const deadline = new Date(state.deadlineAt || "").getTime();
    if (!Number.isFinite(deadline) || deadline > Date.now()) return false;
    state.eligiblePlayerIds.forEach((playerId) => {
      if (!state.completedPlayerIds.includes(playerId)) state.completedPlayerIds.push(playerId);
    });
    addEvent(room, "玉面雷神倒计时结束，未操作玩家视为放弃");
    await resolveShenBiesanSkillStage(room);
    return true;
  }
  if (room.stage === "yokoyama-skill") {
    const state = room.boardHeroSkills.yokoyama;
    const deadline = new Date(state.deadlineAt || "").getTime();
    if (!Number.isFinite(deadline) || deadline > Date.now()) return false;
    const player = playerById(room, state.currentPlayerId);
    if (!player) {
      advanceYokoyamaSkillStage(room);
      return true;
    }
    addEvent(room, `${player.name} 全能偶像选择超时`);
    finishYokoyamaChoice(room, player);
    return true;
  }
  return false;
}

function scheduleBoardHeroSkillTimer(room) {
  clearBoardHeroSkillTimer(room);
  const deadlineAt = room.stage === "shen-biesan-skill"
    ? room.boardHeroSkills.shenBiesan.deadlineAt
    : room.stage === "yokoyama-skill"
      ? room.boardHeroSkills.yokoyama.deadlineAt
      : null;
  if (!deadlineAt) return false;
  const deadline = new Date(deadlineAt).getTime();
  if (!Number.isFinite(deadline)) return false;
  room.boardHeroSkillTimer = setTimeout(async () => {
    room.boardHeroSkillTimer = null;
    if (rooms.get(room.id) !== room || room.status !== "dealt") return;
    try {
      if (await autoAdvanceExpiredBoardHeroSkill(room)) broadcastAndContinueAutomation(room);
    } catch (error) {
      console.error("[hero-home] board hero skill timeout failed", error.message);
      broadcastAndContinueAutomation(room);
    }
  }, Math.max(0, deadline - Date.now()) + 50);
  room.boardHeroSkillTimer.unref?.();
  return true;
}

function scheduleGameItemStageTimer(room) {
  clearGameItemStageTimer(room);
  const deadlineAt = isItemUseStage(room?.stage) ? room.gameItems?.stage?.deadlineAt : null;
  if (!deadlineAt) return false;
  const deadline = new Date(deadlineAt).getTime();
  if (!Number.isFinite(deadline)) return false;
  room.gameItemStageTimer = setTimeout(() => {
    room.gameItemStageTimer = null;
    if (rooms.get(room.id) !== room || room.status !== "dealt") return;
    if (autoAdvanceExpiredGameItemStage(room)) broadcastAndContinueAutomation(room);
  }, Math.max(0, deadline - Date.now()) + 50);
  room.gameItemStageTimer.unref?.();
  return true;
}

function scheduleScoreBidTimer(room) {
  clearScoreBidTimer(room);
  const deadlineAt = room?.stage === "score-bidding" ? room.setup?.scoreBid?.deadlineAt : null;
  if (!deadlineAt) return false;
  const deadline = new Date(deadlineAt).getTime();
  if (!Number.isFinite(deadline)) return false;
  room.scoreBidTimer = setTimeout(() => {
    room.scoreBidTimer = null;
    if (rooms.get(room.id) !== room || room.status !== "dealt") return;
    if (autoAdvanceExpiredScoreBid(room)) broadcastAndContinueAutomation(room);
  }, Math.max(0, deadline - Date.now()) + 50);
  room.scoreBidTimer.unref?.();
  return true;
}

function scheduleFryTimer(room) {
  clearFryTimer(room);
  const deadlineAt = room?.stage === "frying" ? room.setup?.fry?.deadlineAt : null;
  if (!deadlineAt) return false;
  const deadline = new Date(deadlineAt).getTime();
  if (!Number.isFinite(deadline)) return false;
  room.fryTimer = setTimeout(() => {
    room.fryTimer = null;
    if (rooms.get(room.id) !== room || room.status !== "dealt") return;
    if (autoAdvanceExpiredFry(room)) broadcastAndContinueAutomation(room);
  }, Math.max(0, deadline - Date.now()) + 50);
  room.fryTimer.unref?.();
  return true;
}

function scheduleNextAiSetupAction(room, delayMs = AI_SETUP_DELAY_MS) {
  if (!room || room.aiSetupTimer || room.status !== "dealt" || room.stage === "playing" || room.stage === "finished") {
    return false;
  }
  room.aiSetupTimer = setTimeout(() => {
    room.aiSetupTimer = null;
    if (rooms.get(room.id) !== room || room.status !== "dealt") return;
    const actions = autoProgressTestSetup(room, 1);
    if (!actions) return;
    broadcastAndContinueAutomation(room);
  }, Math.max(0, delayMs));
  return true;
}

function broadcastAndContinueAutomation(room) {
  broadcast(room);
  scheduleGameItemStageTimer(room);
  scheduleScoreBidTimer(room);
  scheduleFryTimer(room);
  scheduleBoardHeroSkillTimer(room);
  if (room.stage === "playing") scheduleNextAiPlay(room);
  else scheduleNextAiSetupAction(room);
}

function rankValue(card, trumpSuit) {
  return patternValue(card, trumpSuit);
}

function nonMainRankOrderValue(card, trumpSuit) {
  return suitTractorOrderValue(card, trumpSuit);
}

function mainTractorOrderValue(card, trumpSuit) {
  if (!card) return 99;
  if (card.type === "normal" && trumpSuit && card.suit === trumpSuit && !isCompareCard(card, trumpSuit)) {
    const index = suitTractorOrderValue(card, trumpSuit);
    return index < 99 ? 8 + index : 99;
  }
  return patternValue(card, trumpSuit);
}

function tractorOrderValue(group, trumpSuit) {
  const card = group.cards[0];
  if (!card) return 99;
  if (playSuit(card, trumpSuit) === "TRUMP") return mainTractorOrderValue(card, trumpSuit);
  return nonMainRankOrderValue(card, trumpSuit);
}

function consecutiveTractorGroups(previous, next, trumpSuit) {
  const previousCard = previous.cards[0];
  const nextCard = next.cards[0];
  if (!previousCard || !nextCard) return false;
  if (playSuit(previousCard, trumpSuit) !== playSuit(nextCard, trumpSuit)) return false;
  return tractorOrderValue(next, trumpSuit) === tractorOrderValue(previous, trumpSuit) + 1;
}

function rankKey(card, trumpSuit) {
  if (card.type === "joker") return `${playSuit(card, trumpSuit)}:JOKER:${card.joker}`;
  return `${playSuit(card, trumpSuit)}:${card.suit}:${gameRank(card)}`;
}

function cardsByRank(cards, trumpSuit) {
  const map = new Map();
  cards.forEach((card) => {
    const key = rankKey(card, trumpSuit);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  });
  return [...map.entries()].map(([rank, rankCards]) => ({
    rank,
    cards: rankCards,
    count: rankCards.length,
    value: rankValue(rankCards[0], trumpSuit)
  }));
}

function detectPlayPattern(cards, trumpSuit) {
  if (!cards.length) return null;
  if (cards.length === 1) return { type: "single", count: 1 };

  const suitsInCards = uniquePlaySuits(cards, trumpSuit);
  const groups = cardsByRank(cards, trumpSuit).sort((a, b) => tractorOrderValue(a, trumpSuit) - tractorOrderValue(b, trumpSuit) || a.value - b.value);
  if (groups.length === 1) {
    if (suitsInCards.length !== 1) return null;
    return {
      type: "multi",
      count: cards.length,
      width: cards.length,
      ranks: [groups[0].rank]
    };
  }

  if (suitsInCards.length !== 1) return null;
  const width = groups[0].count;
  if (width < 2) return null;
  if (!groups.every((group) => group.count === width)) return null;
  if (groups.some((group) => tractorOrderValue(group, trumpSuit) >= 99)) return null;

  for (let i = 1; i < groups.length; i += 1) {
    if (!consecutiveTractorGroups(groups[i - 1], groups[i], trumpSuit)) return null;
  }
  return {
    type: "tractor",
    count: cards.length,
    width,
    length: groups.length,
    ranks: groups.map((group) => group.rank)
  };
}

function patternLabel(pattern) {
  if (!pattern) return "不合法牌型";
  if (pattern.type === "single") return "单张";
  if (pattern.type === "multi") return `${pattern.width} 张`;
  if (pattern.type === "tractor") return `${pattern.width} 张拖拉机`;
  return "牌型";
}

function samePattern(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.count !== b.count) return false;
  if (a.type === "tractor") return a.width === b.width && a.length === b.length;
  if (a.type === "multi") return a.width === b.width;
  return true;
}

function cardPoint(card) {
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

function cardsPoint(cards) {
  return cards.reduce((total, card) => total + cardPoint(card), 0);
}

function playPower(cards, trumpSuit) {
  const groups = cardsByRank(cards, trumpSuit).sort((a, b) => a.value - b.value);
  return groups[0]?.value ?? 99;
}

function playComparisonAgainstLead(info, cards, trumpSuit) {
  if (info.throwComponents?.length) return throwPlayComparisonAgainstLead(info, cards, trumpSuit);
  const pattern = detectPlayPattern(cards, trumpSuit);
  if (!samePattern(info.pattern, pattern)) return null;
  if (!info.suit) return { level: 1, power: playPower(cards, trumpSuit) };
  const suitsInCards = uniquePlaySuits(cards, trumpSuit);
  if (suitsInCards.length !== 1) return null;
  const playSuitId = suitsInCards[0];
  if (playSuitId === info.suit) {
    return { level: 1, power: playPower(cards, trumpSuit) };
  }
  if (info.suit !== "TRUMP" && playSuitId === "TRUMP") {
    return { level: 2, power: playPower(cards, trumpSuit) };
  }
  return null;
}

function patternSignature(pattern) {
  if (!pattern) return "";
  if (pattern.type === "single") return "single:1:1:1";
  if (pattern.type === "multi") return `multi:${pattern.width}:1:${pattern.count}`;
  if (pattern.type === "tractor") return `tractor:${pattern.width}:${pattern.length}:${pattern.count}`;
  return `${pattern.type}:${pattern.count}`;
}

function throwComponentFromCards(cards, trumpSuit) {
  const pattern = detectPlayPattern(cards, trumpSuit);
  if (!pattern) return null;
  return {
    cards,
    pattern,
    signature: patternSignature(pattern),
    count: cards.length,
    power: playPower(cards, trumpSuit),
    strongestValue: Math.min(...cards.map((card) => patternValue(card, trumpSuit))),
    weakestValue: Math.max(...cards.map((card) => patternValue(card, trumpSuit)))
  };
}

function throwComponentFromGroups(groups, trumpSuit) {
  return throwComponentFromCards(groups.flatMap((group) => group.cards), trumpSuit);
}

function throwComponentsFromExplicitGroups(cards, componentCardIds, trumpSuit) {
  if (!Array.isArray(componentCardIds)) return throwComponentsFromCards(cards, trumpSuit);
  if (!componentCardIds.length) return { error: "请至少加入一手甩牌牌型" };

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const usedIds = new Set();
  const components = [];
  const routes = new Set();
  for (const ids of componentCardIds) {
    if (!Array.isArray(ids) || !ids.length) return { error: "甩牌中存在空的牌型" };
    const componentCards = [];
    for (const rawId of ids) {
      const cardId = String(rawId);
      const card = cardsById.get(cardId);
      if (!card) return { error: "甩牌分组中包含未选择的牌" };
      if (usedIds.has(cardId)) return { error: "甩牌分组中不能重复使用同一张牌" };
      usedIds.add(cardId);
      componentCards.push(card);
    }
    const suitsInComponent = uniquePlaySuits(componentCards, trumpSuit);
    if (suitsInComponent.length !== 1) return { error: "甩牌中的每手牌型必须属于同一路牌" };
    const component = throwComponentFromCards(componentCards, trumpSuit);
    if (!component) return { error: "甩牌中存在不合法的牌型" };
    routes.add(suitsInComponent[0]);
    components.push(component);
  }

  if (usedIds.size !== cards.length) return { error: "所有选中的牌都必须加入甩牌框" };
  if (routes.size !== 1) return { error: "甩牌中的所有牌型必须属于同一路牌" };
  return { suit: [...routes][0], components };
}

function throwComponentsFromCards(cards, trumpSuit) {
  if (!cards.length) return { error: "请选择要甩的牌" };
  const suitsInCards = uniquePlaySuits(cards, trumpSuit);
  if (suitsInCards.length !== 1) return { error: "甩牌必须选择同一路牌" };

  const wholePattern = detectPlayPattern(cards, trumpSuit);
  if (wholePattern) {
    return {
      suit: suitsInCards[0],
      components: [{
        cards,
        pattern: wholePattern,
        signature: patternSignature(wholePattern),
        count: cards.length,
        power: playPower(cards, trumpSuit),
        strongestValue: Math.min(...cards.map((card) => patternValue(card, trumpSuit))),
        weakestValue: Math.max(...cards.map((card) => patternValue(card, trumpSuit)))
      }]
    };
  }

  const groups = cardsByRank(cards, trumpSuit)
    .sort((a, b) => tractorOrderValue(a, trumpSuit) - tractorOrderValue(b, trumpSuit) || a.value - b.value || a.rank.localeCompare(b.rank));
  const components = [];
  let index = 0;
  while (index < groups.length) {
    const group = groups[index];
    if (group.count >= 2 && tractorOrderValue(group, trumpSuit) < 99) {
      const chain = [group];
      let next = index + 1;
      while (
        next < groups.length &&
        groups[next].count === group.count &&
        tractorOrderValue(groups[next], trumpSuit) < 99 &&
        consecutiveTractorGroups(chain[chain.length - 1], groups[next], trumpSuit)
      ) {
        chain.push(groups[next]);
        next += 1;
      }
      if (chain.length >= 2) {
        const component = throwComponentFromGroups(chain, trumpSuit);
        if (!component) return { error: "甩牌中存在无法识别的拖拉机" };
        components.push(component);
        index = next;
        continue;
      }
    }

    const component = throwComponentFromGroups([group], trumpSuit);
    if (!component) return { error: "甩牌中存在不合法的牌型" };
    components.push(component);
    index += 1;
  }

  if (!components.length) return { error: "甩牌中没有可出的牌型" };
  return { suit: suitsInCards[0], components };
}

function throwPlayComparisonAgainstLead(info, cards, trumpSuit) {
  if (cards.length !== info.count) return null;
  const suitsInCards = uniquePlaySuits(cards, trumpSuit);
  if (suitsInCards.length !== 1) return null;
  if (!cardsMatchThrowComponents(cards, info.throwComponents, trumpSuit)) return null;
  const playSuitId = suitsInCards[0];
  let level = null;
  if (playSuitId === info.suit) level = 1;
  if (info.suit !== "TRUMP" && playSuitId === "TRUMP") level = 2;
  if (!level) return null;
  return {
    level,
    power: Math.min(...cards.map((card) => patternValue(card, trumpSuit)))
  };
}

function cardsMatchThrowComponents(cards, leadComponents, trumpSuit) {
  const expectedCount = (leadComponents || []).reduce((total, component) => total + component.count, 0);
  if (!leadComponents?.length || cards.length !== expectedCount) return false;
  const ordered = [...leadComponents].sort((a, b) =>
    b.count - a.count || a.signature.localeCompare(b.signature)
  );
  const failedStates = new Set();

  function match(index, remaining) {
    if (index === ordered.length) return remaining.length === 0;
    const stateKey = `${index}:${remaining.map((card) => card.id).sort().join(",")}`;
    if (failedStates.has(stateKey)) return false;
    const candidates = exactPatternCandidates(remaining, ordered[index].pattern, trumpSuit);
    for (const candidate of candidates) {
      const candidateIds = new Set(candidate.map((card) => card.id));
      const next = remaining.filter((card) => !candidateIds.has(card.id));
      if (next.length !== remaining.length - candidate.length) continue;
      if (match(index + 1, next)) return true;
    }
    failedStates.add(stateKey);
    return false;
  }

  return match(0, cards);
}

function publicThrowComponents(components) {
  return components.map((component) => ({
    signature: component.signature,
    pattern: component.pattern,
    count: component.count,
    cards: component.cards.map(publicCard)
  }));
}

function componentCanBeBeatenInSameRoute(room, component, routeSuit, defender) {
  const sameRouteCards = defender.hand.filter((card) => playSuit(card, room.trumpSuit) === routeSuit);
  if (!sameRouteCards.length) return false;
  return exactPatternCandidates(sameRouteCards, component.pattern, room.trumpSuit)
    .some((candidate) => playPower(candidate, room.trumpSuit) < component.power);
}

function chooseFailedThrowComponent(beatableComponents) {
  if (!beatableComponents.length) return null;
  const sorted = [...beatableComponents].sort((a, b) => {
    return b.weakestValue - a.weakestValue
      || a.cards.length - b.cards.length
      || a.signature.localeCompare(b.signature)
      || a.cards[0].id.localeCompare(b.cards[0].id);
  });
  const best = sorted[0];
  const tied = sorted.filter((item) =>
    item.weakestValue === best.weakestValue &&
    item.cards.length === best.cards.length &&
    item.signature === best.signature
  );
  return tied[randomInt(tied.length)];
}

function prepareThrowLeadPlay(room, player, selected, componentCardIds = null) {
  if (leadInfo(room.currentTrick, room.trumpSuit)) {
    return { error: "只有首家出牌时可以甩牌", status: 400 };
  }
  const parsed = throwComponentsFromExplicitGroups(selected, componentCardIds, room.trumpSuit);
  if (parsed.error) return { error: parsed.error, status: 400 };

  const otherPlayers = room.players.filter((item) => item.id !== player.id);
  const beatableComponents = parsed.components.filter((component) =>
    otherPlayers.some((defender) => componentCanBeBeatenInSameRoute(room, component, parsed.suit, defender))
  );

  if (beatableComponents.length) {
    const failedComponent = chooseFailedThrowComponent(beatableComponents);
    return {
      ok: true,
      failed: true,
      cards: failedComponent.cards,
      components: [failedComponent],
      attemptCards: selected,
      revealUntil: new Date(Date.now() + 2400).toISOString()
    };
  }

  addEvent(room, `${player.name} 甩牌成功，打出 ${parsed.components.length} 手，共 ${selected.length} 张`);
  return {
    ok: true,
    failed: false,
    cards: selected,
    components: parsed.components
  };
}

function settleTrick(room, trick) {
  const info = leadInfo(trick, room.trumpSuit);
  if (!info || !trick.plays.length) {
    return {
      winnerId: trick.leaderId,
      winnerName: trick.leaderId ? playerName(room, trick.leaderId) : "",
      points: 0,
      winningPlayIndex: null
    };
  }

  let winningPlayIndex = 0;
  let winningComparison = playComparisonAgainstLead(info, trick.plays[0].cards, room.trumpSuit) || {
    level: 1,
    power: playPower(trick.plays[0].cards, room.trumpSuit)
  };
  trick.plays.forEach((play, index) => {
    if (index === 0) return;
    const comparison = playComparisonAgainstLead(info, play.cards, room.trumpSuit);
    if (!comparison) return;
    if (
      comparison.level > winningComparison.level ||
      (comparison.level === winningComparison.level && comparison.power < winningComparison.power)
    ) {
      winningComparison = comparison;
      winningPlayIndex = index;
    }
  });

  const winnerId = trick.plays[winningPlayIndex].playerId;
  return {
    winnerId,
    winnerName: playerName(room, winnerId),
    points: cardsPoint(trick.plays.flatMap((play) => play.cards)),
    winningPlayIndex
  };
}

function recordProvisionalWinner(room) {
  const trick = room.currentTrick;
  if (!trick?.plays?.length) return;
  const outcome = settleTrick(room, trick);
  if (!outcome.winnerId) return;
  if (!Array.isArray(room.provisionalWinnerPlayerIds)) room.provisionalWinnerPlayerIds = [];
  if (!room.provisionalWinnerPlayerIds.includes(outcome.winnerId)) {
    room.provisionalWinnerPlayerIds.push(outcome.winnerId);
  }
}

function validatePlay(room, player, selected) {
  const trick = room.currentTrick;
  const expected = expectedPlayerId(room);
  if (expected && player.id !== expected) {
    return `现在轮到 ${playerName(room, expected)} 出牌`;
  }

  const info = leadInfo(trick, room.trumpSuit);

  if (!info) {
    const selectedPattern = detectPlayPattern(selected, room.trumpSuit);
    if (!selectedPattern) {
      return "首家出牌不符合牌型规则。只能出单张、同牌力多张，或连续牌力拖拉机";
    }
    const suitsInSelected = uniquePlaySuits(selected, room.trumpSuit);
    if (suitsInSelected.length > 1) {
      return "首家出牌暂时必须是同一花色或同一主牌牌组，甩牌后续单独做";
    }
    return null;
  }

  if (selected.length !== info.count) {
    return `本轮首家出了 ${info.count} 张，你也必须出 ${info.count} 张`;
  }

  if (!info.suit) return null;

  const sameSuitInHand = player.hand.filter((card) => playSuit(card, room.trumpSuit) === info.suit).length;
  const sameSuitSelected = selected.filter((card) => playSuit(card, room.trumpSuit) === info.suit).length;
  const requiredSameSuit = Math.min(info.count, sameSuitInHand);
  if (sameSuitSelected < requiredSameSuit) {
    if (sameSuitInHand >= info.count) {
      return `你手里有足够的${followSuitName(info.suit)}，必须全部出${followSuitName(info.suit)}`;
    }
    return `你手里还有 ${sameSuitInHand} 张${followSuitName(info.suit)}，必须先跟完该花色再垫其他牌`;
  }
  return null;
}

function cardIdsKey(cards) {
  return cards.map((card) => card.id).sort().join("|");
}

function isProtectedFive(card) {
  return card?.type === "normal" && card.rank === "5" && (card.suit === "H" || card.suit === "D");
}

function hiddenDoglegInHand(room, player) {
  const mode = normalizeDoglegMode(room.doglegMode);
  if (mode === DOGLEG_MODE_DYNAMIC) {
    const markedCardId = dynamicDoglegCardId(room.dynamicDogleg, player.id);
    return Boolean(player.id !== room.bankerId && markedCardId && player.hand.some((card) => card.id === markedCardId));
  }
  if (mode === DOGLEG_MODE_HIDDEN) {
    const markedCardId = hiddenDoglegCardId(room.hiddenDogleg, player.id);
    return Boolean(markedCardId && !hiddenDoglegIsRevealed(room.hiddenDogleg, player.id)
      && player.hand.some((card) => card.id === markedCardId));
  }
  if (mode === DOGLEG_MODE_RANDOM_ORDER) {
    return Boolean(room.doglegCard && player.id !== room.bankerId
      && !(room.doglegPlayerIds || []).includes(player.id)
      && (room.doglegPlayerIds || []).length < doglegTargetCount(room)
      && player.hand.some((card) => sameRoomDoglegCard(room, card)));
  }
  return Boolean(room.doglegCard && player.id !== room.bankerId && !(room.doglegPlayerIds || []).includes(player.id)
    && player.hand.some((card) => sameDoglegCard(card, room.doglegCard)));
}

function cardIsHiddenDogleg(room, player, card) {
  const mode = normalizeDoglegMode(room.doglegMode);
  if (mode === DOGLEG_MODE_DYNAMIC) {
    return Boolean(hiddenDoglegInHand(room, player) && card?.id === dynamicDoglegCardId(room.dynamicDogleg, player.id));
  }
  if (mode === DOGLEG_MODE_HIDDEN) {
    return Boolean(hiddenDoglegInHand(room, player) && card?.id === hiddenDoglegCardId(room.hiddenDogleg, player.id));
  }
  if (mode === DOGLEG_MODE_RANDOM_ORDER) {
    return Boolean(hiddenDoglegInHand(room, player) && sameRoomDoglegCard(room, card));
  }
  return Boolean(hiddenDoglegInHand(room, player) && sameDoglegCard(card, room.doglegCard));
}

function aiOwnTeam(room, player) {
  if (player.id === room.bankerId) return "banker";
  if (actualDoglegPlayerIds(room).includes(player.id)) return "banker";
  return "idle";
}

function aiVisibleTeam(room, perspectivePlayer, targetPlayerId) {
  if (targetPlayerId === room.bankerId) return "banker";
  if ((room.doglegPlayerIds || []).includes(targetPlayerId)) return "banker";
  if (targetPlayerId === perspectivePlayer.id) return aiOwnTeam(room, perspectivePlayer);
  if ((room.doglegPlayerIds || []).length >= doglegTargetCount(room)) return "idle";
  return "unknown";
}

function aiTeamRelation(room, perspectivePlayer, targetPlayerId) {
  if (targetPlayerId === perspectivePlayer.id) return "self";
  const ownTeam = aiOwnTeam(room, perspectivePlayer);
  const targetTeam = aiVisibleTeam(room, perspectivePlayer, targetPlayerId);
  if (targetTeam === "unknown") return "unknown";
  return ownTeam === targetTeam ? "ally" : "opponent";
}

function aiPublicKnowledge(room) {
  return buildAiPublicKnowledge({
    playerIds: room.players.map((player) => player.id),
    trickHistory: room.trickHistory || [],
    currentTrick: room.currentTrick,
    trumpSuit: room.trumpSuit,
    routeOfCard: playSuit,
    pointsOfCards: cardsPoint,
    isProtectedFive
  });
}

function aiTeamContext(room, perspectivePlayer) {
  const ownTeam = aiOwnTeam(room, perspectivePlayer);
  const relationByPlayerId = new Map(room.players.map((player) => [
    player.id,
    aiTeamRelation(room, perspectivePlayer, player.id)
  ]));
  const unknownIds = room.players
    .filter((player) => relationByPlayerId.get(player.id) === "unknown")
    .map((player) => player.id);
  const remainingBankerSlots = Math.max(0, doglegTargetCount(room) - (room.doglegPlayerIds || []).length);
  const unknownBankerProbability = unknownIds.length
    ? clampNumber(remainingBankerSlots / unknownIds.length, 0, 1)
    : 0;

  function opponentProbability(playerId) {
    const relation = relationByPlayerId.get(playerId);
    if (relation === "self" || relation === "ally") return 0;
    if (relation === "opponent") return 1;
    return ownTeam === "banker" ? 1 - unknownBankerProbability : unknownBankerProbability;
  }

  return {
    ownTeam,
    relationByPlayerId,
    unknownBankerProbability,
    opponentProbability
  };
}

function aiCardsWithCurrentReplacement(room, cards) {
  const replacementRank = room.boardHeroEffects?.replacementRank || null;
  if (!replacementRank) return cards;
  return cards.map((card) => {
    if (card.type !== "normal" || (card.rank !== replacementRank && card.rank !== "2")) return card;
    return { ...card, rulesReplacementRank: replacementRank };
  });
}

function aiUnseenCards(room, player, knowledge) {
  const publicKnownIds = new Set([
    ...knowledge.seenCardIds,
    ...player.hand.map((card) => card.id),
    ...(room.removedCards || []).map((card) => card.id)
  ]);
  return aiCardsWithCurrentReplacement(room, createDeck(room.players.length))
    .filter((card) => !publicKnownIds.has(card.id));
}

function aiDecisionContext(room, player) {
  const knowledge = aiPublicKnowledge(room);
  return {
    knowledge,
    teams: aiTeamContext(room, player),
    unseenCards: aiUnseenCards(room, player, knowledge)
  };
}

function aiPlayersAfterCurrent(room, player) {
  const ordered = orderedPlayersFrom(room, room.currentTrick?.leaderId);
  const index = ordered.findIndex((item) => item.id === player.id);
  return index < 0 ? [] : ordered.slice(index + 1);
}

function aiExpectedIdleScore(room, player, context) {
  return room.players.reduce((total, target) => {
    const visibleTeam = aiVisibleTeam(room, player, target.id);
    const idleProbability = visibleTeam === "idle"
      ? 1
      : visibleTeam === "banker"
        ? 0
        : 1 - context.teams.unknownBankerProbability;
    return total + (Number(target.score) || 0) * idleProbability;
  }, 0);
}

function aiScoreUrgency(room, player, context, pointsAtStake) {
  const idleScore = aiExpectedIdleScore(room, player, context);
  const distance = gameWinThreshold(room) - idleScore;
  const swing = Math.max(10, Number(pointsAtStake) || 0);
  const nearDecision = Math.abs(distance) <= swing * 1.5;
  if (!nearDecision) return 1;
  return context.teams.ownTeam === "idle" ? 1.28 : 1.34;
}

function aiPatternThreat(room, player, cards, context, playerIds = null) {
  const pattern = detectPlayPattern(cards, room.trumpSuit);
  const route = playSuit(cards[0], room.trumpSuit);
  if (!pattern || !route) return { opponentRisk: 0.5, allySupport: 0 };
  const targets = (playerIds || room.players.map((target) => target.id))
    .filter((playerId) => playerId !== player.id);
  const routeTargets = targets.filter((playerId) => !aiKnowsPlayerVoid(context.knowledge, playerId, route));
  const routeCards = context.unseenCards.filter((card) => playSuit(card, room.trumpSuit) === route);
  const strongerPatterns = exactPatternCandidates(routeCards, pattern, room.trumpSuit)
    .filter((candidate) => playPower(candidate, room.trumpSuit) < playPower(cards, room.trumpSuit));
  const baseRisk = strongerPatterns.length
    ? clampNumber(0.18 + strongerPatterns.length / Math.max(4, routeTargets.length * 3), 0.18, 0.94)
    : 0;
  const opponentWeight = routeTargets.reduce(
    (total, playerId) => total + context.teams.opponentProbability(playerId),
    0
  );
  const allyWeight = Math.max(0, routeTargets.length - opponentWeight);
  const totalWeight = Math.max(1, opponentWeight + allyWeight);
  let opponentRisk = baseRisk * opponentWeight / totalWeight;
  let allySupport = baseRisk * allyWeight / totalWeight;

  if (route !== "TRUMP") {
    const knownVoidIds = targets.filter((playerId) => aiKnowsPlayerVoid(context.knowledge, playerId, route));
    const trumpPatternExists = exactPatternCandidates(
      context.unseenCards.filter((card) => playSuit(card, room.trumpSuit) === "TRUMP"),
      pattern,
      room.trumpSuit
    ).length > 0;
    if (trumpPatternExists && knownVoidIds.length) {
      const voidOpponentWeight = knownVoidIds.reduce(
        (total, playerId) => total + context.teams.opponentProbability(playerId),
        0
      );
      const voidAllyWeight = Math.max(0, knownVoidIds.length - voidOpponentWeight);
      opponentRisk += 0.42 * voidOpponentWeight / Math.max(1, knownVoidIds.length);
      allySupport += 0.28 * voidAllyWeight / Math.max(1, knownVoidIds.length);
    }
  }

  return {
    opponentRisk: clampNumber(opponentRisk, 0, 0.98),
    allySupport: clampNumber(allySupport, 0, 0.8)
  };
}

function aiPublicBankerSupport(room, context) {
  if (!room.bankerId) return 0;
  const stats = aiPublicPlayerStats(context.knowledge, room.bankerId);
  const trickCount = Math.max(1, context.knowledge.completedTrickCount);
  const winRate = stats.tricksWon / trickCount;
  const pointRate = stats.pointsCaptured / Math.max(40, trickCount * 30);
  return clampNumber((winRate - 0.22) * 55 + (pointRate - 0.2) * 24, -24, 34);
}

function aiSetupStrengthSignal(room, context, playerId) {
  const fryHistory = room.setup?.fry?.history || [];
  const fryStrength = fryHistory.reduce((total, bid) => {
    if (bid.playerId !== playerId) return total;
    return total + 16 + Math.max(0, (Number(bid.count) || 1) - 1) * 8;
  }, 0);
  const stats = aiPublicPlayerStats(context.knowledge, playerId);
  const trickCount = Math.max(1, context.knowledge.completedTrickCount);
  return clampNumber(
    fryStrength + stats.tricksWon / trickCount * 28 + stats.pointsCaptured / Math.max(40, trickCount * 24) * 12,
    0,
    80
  );
}

function aiFixedTeamLeadTransferAdjustment(room, player, cards, context) {
  if (room.currentTrick?.plays?.length) return 0;
  const route = playSuit(cards[0], room.trumpSuit);
  if (!route) return 0;
  const ownStrength = aiSetupStrengthSignal(room, context, player.id);
  const ownControl = setupControlScore(player.hand, room.trumpSuit);
  if (ownControl >= 105) return 0;
  const ordered = orderedPlayersFrom(room, player.id).slice(1);
  let best = 0;
  ordered.forEach((target, index) => {
    if (aiTeamRelation(room, player, target.id) !== "ally") return;
    const intervening = ordered.slice(0, index);
    const opponentBarriers = intervening.filter((seat) => aiTeamRelation(room, player, seat.id) === "opponent").length;
    const allyStrength = aiSetupStrengthSignal(room, context, target.id);
    if (allyStrength < ownStrength + 8) return;
    const allyVoid = route !== "TRUMP" && aiKnowsPlayerVoid(context.knowledge, target.id, route);
    const barrierVoidRisk = route === "TRUMP" ? 0 : intervening.filter((seat) => {
      return aiTeamRelation(room, player, seat.id) === "opponent"
        && aiKnowsPlayerVoid(context.knowledge, seat.id, route);
    }).length;
    const weakOwnLead = Math.min(20, Math.max(0, playPower(cards, room.trumpSuit) - 6) * 1.1);
    const publicStrengthEdge = Math.max(0, allyStrength - ownStrength) * 0.45;
    const weakHandNeed = Math.max(0, 105 - ownControl) * 0.16;
    const value = 8 + weakOwnLead + publicStrengthEdge + weakHandNeed
      + (allyVoid ? 16 : 0)
      - opponentBarriers * 8
      - barrierVoidRisk * 18;
    best = Math.max(best, value);
  });
  return best;
}

function aiFixedTeamPlanAdjustment(room, player, plan, context, options = {}) {
  let score = 0;
  if (options.fixedLeadTransfer === true) score += aiFixedTeamLeadTransferAdjustment(room, player, plan.cards, context);
  return score;
}

function aiVoluntaryProtectedFiveCount(room, player, cards, info = null) {
  const forcedIds = new Set(info
    ? forcedProtectedFiveIds({
      hand: player.hand,
      selected: cards,
      leadCards: room.currentTrick?.plays?.[0]?.cards || [],
      trumpSuit: room.trumpSuit
    })
    : []);
  return cards.filter((card) => isProtectedFive(card) && !forcedIds.has(card.id)).length;
}

function aiCreatedVoidBonus(room, player, cards) {
  const selectedIds = new Set(cards.map((card) => card.id));
  const routes = new Set(player.hand.map((card) => playSuit(card, room.trumpSuit)));
  let bonus = 0;
  routes.forEach((route) => {
    if (!route || route === "TRUMP") return;
    const routeCards = player.hand.filter((card) => playSuit(card, room.trumpSuit) === route);
    if (routeCards.length && routeCards.every((card) => selectedIds.has(card.id))) bonus += 16;
  });
  return bonus;
}

function sortForShapeDiscard(room, player, cards) {
  return [...cards].sort((a, b) => {
    return cardShapeAssetCost(room, player, a) - cardShapeAssetCost(room, player, b)
      || (isProtectedFive(a) ? 1 : 0) - (isProtectedFive(b) ? 1 : 0)
      || cardPoint(a) - cardPoint(b)
      || patternValue(b, room.trumpSuit) - patternValue(a, room.trumpSuit)
      || a.id.localeCompare(b.id);
  });
}

function addPreferredFillCandidate(candidates, base, preferred, pool, count) {
  const selected = [...base, ...preferred.slice(0, count)];
  const selectedIds = new Set(selected.map((card) => card.id));
  const missing = count - preferred.slice(0, count).length;
  if (missing > 0) {
    selected.push(...pool.filter((card) => !selectedIds.has(card.id)).slice(0, missing));
  }
  addCandidate(candidates, selected);
}

function cardAssetCost(room, player, card) {
  let cost = 0;
  if (isProtectedFive(card)) cost += card.suit === "H" ? 90 : 65;
  if (cardIsHiddenDogleg(room, player, card)) cost += 30;
  if (playSuit(card, room.trumpSuit) === "TRUMP") cost += 10;
  cost += cardPoint(card) * 2;
  const strength = patternValue(card, room.trumpSuit);
  if (strength < 20) cost += Math.max(0, 20 - strength);
  cost += cardShapeAssetCost(room, player, card);
  return cost;
}

function cardsAssetCost(room, player, cards) {
  return cards.reduce((total, card) => total + cardAssetCost(room, player, card), 0);
}

function sortForDiscard(room, player, cards) {
  return [...cards].sort((a, b) => {
    return (isProtectedFive(a) ? 1 : 0) - (isProtectedFive(b) ? 1 : 0)
      || (cardIsHiddenDogleg(room, player, a) ? 1 : 0) - (cardIsHiddenDogleg(room, player, b) ? 1 : 0)
      || cardPoint(a) - cardPoint(b)
      || (playSuit(a, room.trumpSuit) === "TRUMP" ? 1 : 0) - (playSuit(b, room.trumpSuit) === "TRUMP" ? 1 : 0)
      || patternValue(b, room.trumpSuit) - patternValue(a, room.trumpSuit)
      || a.id.localeCompare(b.id);
  });
}

function sortForFeed(room, player, cards) {
  return [...cards].sort((a, b) => {
    return (isProtectedFive(a) ? 1 : 0) - (isProtectedFive(b) ? 1 : 0)
      || cardPoint(b) - cardPoint(a)
      || (playSuit(a, room.trumpSuit) === "TRUMP" ? 1 : 0) - (playSuit(b, room.trumpSuit) === "TRUMP" ? 1 : 0)
      || patternValue(b, room.trumpSuit) - patternValue(a, room.trumpSuit)
      || a.id.localeCompare(b.id);
  });
}

function sortForStrength(room, cards) {
  return [...cards].sort((a, b) => {
    return patternValue(a, room.trumpSuit) - patternValue(b, room.trumpSuit)
      || cardPoint(a) - cardPoint(b)
      || a.id.localeCompare(b.id);
  });
}

function takeCards(cards, count) {
  return cards.slice(0, Math.max(0, count));
}

function addCandidate(candidates, cards) {
  if (!cards.length) return;
  const key = cardIdsKey(cards);
  if (candidates.some((candidate) => candidate.key === key)) return;
  candidates.push({ key, cards });
}

function exactPatternCandidates(cards, pattern, trumpSuit) {
  if (!pattern) return [];
  if (pattern.type === "single") return cards.map((card) => [card]);

  const candidates = [];
  const groups = cardsByRank(cards, trumpSuit)
    .filter((group) => group.count >= (pattern.width || 1))
    .sort((a, b) => tractorOrderValue(a, trumpSuit) - tractorOrderValue(b, trumpSuit) || a.value - b.value);

  if (pattern.type === "multi") {
    groups.forEach((group) => addCandidate(candidates, group.cards.slice(0, pattern.width)));
    return candidates.map((candidate) => candidate.cards);
  }

  if (pattern.type !== "tractor") return [];
  const bySuit = new Map();
  groups.forEach((group) => {
    const suit = playSuit(group.cards[0], trumpSuit);
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(group);
  });

  for (const suitGroups of bySuit.values()) {
    for (let start = 0; start < suitGroups.length; start += 1) {
      const chain = [suitGroups[start]];
      for (let next = start + 1; next < suitGroups.length; next += 1) {
        if (!consecutiveTractorGroups(chain[chain.length - 1], suitGroups[next], trumpSuit)) break;
        chain.push(suitGroups[next]);
        if (chain.length === pattern.length) {
          addCandidate(candidates, chain.flatMap((group) => group.cards.slice(0, pattern.width)));
          break;
        }
      }
    }
  }
  return candidates.map((candidate) => candidate.cards);
}

function leadPatternCandidates(room, player) {
  const candidates = [];
  const groups = cardsByRank(player.hand, room.trumpSuit)
    .sort((a, b) => tractorOrderValue(a, room.trumpSuit) - tractorOrderValue(b, room.trumpSuit) || a.value - b.value);

  player.hand.forEach((card) => addCandidate(candidates, [card]));
  groups.forEach((group) => {
    if (group.count < 2) return;
    addCandidate(candidates, group.cards.slice(0, group.count));
    addCandidate(candidates, group.cards.slice(0, 2));
    if (group.count >= 3) addCandidate(candidates, group.cards.slice(0, 3));
  });

  const bySuit = new Map();
  groups.filter((group) => group.count >= 2 && tractorOrderValue(group, room.trumpSuit) < 99).forEach((group) => {
    const suit = playSuit(group.cards[0], room.trumpSuit);
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(group);
  });

  for (const suitGroups of bySuit.values()) {
    for (let start = 0; start < suitGroups.length; start += 1) {
      const chain = [suitGroups[start]];
      for (let next = start + 1; next < suitGroups.length; next += 1) {
        if (!consecutiveTractorGroups(chain[chain.length - 1], suitGroups[next], room.trumpSuit)) break;
        chain.push(suitGroups[next]);
        for (let length = 2; length <= chain.length; length += 1) {
          const sequence = chain.slice(chain.length - length);
          const maxWidth = Math.min(...sequence.map((group) => group.count));
          for (let width = 2; width <= maxWidth; width += 1) {
            addCandidate(candidates, sequence.flatMap((group) => group.cards.slice(0, width)));
          }
        }
      }
    }
  }

  return candidates.map((candidate) => candidate.cards).filter((cards) => detectPlayPattern(cards, room.trumpSuit));
}

function aiComponentIsPubliclySafe(room, cards, context) {
  const pattern = detectPlayPattern(cards, room.trumpSuit);
  const route = playSuit(cards[0], room.trumpSuit);
  if (!pattern || !route) return false;
  const unseenInRoute = context.unseenCards.filter((card) => playSuit(card, room.trumpSuit) === route);
  return !exactPatternCandidates(unseenInRoute, pattern, room.trumpSuit)
    .some((candidate) => playPower(candidate, room.trumpSuit) < playPower(cards, room.trumpSuit));
}

function addAiThrowPlan(plans, room, components) {
  if (components.length < 2) return;
  const cards = components.flat();
  if (cards.length < 2 || cards.length > 14 || detectPlayPattern(cards, room.trumpSuit)) return;
  const key = cardIdsKey(cards);
  if (plans.some((plan) => plan.key === key)) return;
  plans.push({
    key,
    cards,
    throwPlay: true,
    throwComponents: components.map((component) => component.map((card) => card.id))
  });
}

function aiSafeThrowPlans(room, player, context) {
  const plans = [];
  const candidatesByRoute = new Map();
  leadPatternCandidates(room, player)
    .filter((cards) => aiComponentIsPubliclySafe(room, cards, context))
    .forEach((cards) => {
      const route = playSuit(cards[0], room.trumpSuit);
      if (!candidatesByRoute.has(route)) candidatesByRoute.set(route, []);
      candidatesByRoute.get(route).push(cards);
    });

  candidatesByRoute.forEach((routeCandidates) => {
    const ordered = [...routeCandidates].sort((left, right) => {
      return playPower(left, room.trumpSuit) - playPower(right, room.trumpSuit)
        || right.length - left.length
        || cardsPoint(right) - cardsPoint(left);
    });
    const selected = [];
    const usedIds = new Set();
    for (const cards of ordered) {
      if (cards.some((card) => usedIds.has(card.id))) continue;
      if (selected.reduce((total, component) => total + component.length, 0) + cards.length > 14) continue;
      selected.push(cards);
      cards.forEach((card) => usedIds.add(card.id));
    }
    addAiThrowPlan(plans, room, selected.slice(0, 2));
    addAiThrowPlan(plans, room, selected);
  });
  return plans;
}

function currentWinningState(room) {
  const trick = room.currentTrick;
  const info = leadInfo(trick, room.trumpSuit);
  if (!info || !trick.plays.length) return null;
  const outcome = settleTrick(room, trick);
  const play = Number.isFinite(outcome.winningPlayIndex) ? trick.plays[outcome.winningPlayIndex] : trick.plays[0];
  if (!play) return null;
  return {
    playerId: play.playerId,
    play,
    comparison: playComparisonAgainstLead(info, play.cards, room.trumpSuit) || {
      level: 1,
      power: playPower(play.cards, room.trumpSuit)
    }
  };
}

function comparisonBeats(a, b) {
  if (!a || !b) return Boolean(a);
  return a.level > b.level || (a.level === b.level && a.power < b.power);
}

function candidateBeatsCurrent(room, info, candidate, winning) {
  const comparison = playComparisonAgainstLead(info, candidate, room.trumpSuit);
  if (!comparison) return { beats: false, comparison: null };
  return { beats: comparisonBeats(comparison, winning?.comparison), comparison };
}

function protectedFivesInTrickByRelation(room, player, relation) {
  return (room.currentTrick?.plays || []).reduce((total, play) => {
    if (aiTeamRelation(room, player, play.playerId) !== relation) return total;
    return total + play.cards.filter(isProtectedFive).length;
  }, 0);
}

function canRevealDoglegWithCards(room, player, cards) {
  if (!hiddenDoglegInHand(room, player)) return false;
  const mode = normalizeDoglegMode(room.doglegMode);
  if (mode === DOGLEG_MODE_DYNAMIC) {
    const markedCardId = dynamicDoglegCardId(room.dynamicDogleg, player.id);
    return cards.some((card) => card.id === markedCardId);
  }
  if (mode === DOGLEG_MODE_HIDDEN) {
    const markedCardId = hiddenDoglegCardId(room.hiddenDogleg, player.id);
    return cards.some((card) => card.id === markedCardId);
  }
  if ((room.doglegPlayerIds || []).length >= doglegTargetCount(room)) return false;
  return cards.some((card) => sameRoomDoglegCard(room, card));
}

function doglegCopiesInHand(room, player) {
  const mode = normalizeDoglegMode(room.doglegMode);
  if (mode === DOGLEG_MODE_DYNAMIC || mode === DOGLEG_MODE_HIDDEN) {
    return hiddenDoglegInHand(room, player) ? 1 : 0;
  }
  if (!room.doglegCard) return 0;
  return player.hand.filter((card) => sameRoomDoglegCard(room, card)).length;
}

function doglegRevealProbability(room, player) {
  if (!hiddenDoglegInHand(room, player)) return 0;
  const copies = doglegCopiesInHand(room, player);
  const mode = normalizeDoglegMode(room.doglegMode);
  const doglegCard = mode === DOGLEG_MODE_DYNAMIC
    ? player.hand.find((card) => card.id === dynamicDoglegCardId(room.dynamicDogleg, player.id))
    : mode === DOGLEG_MODE_HIDDEN
      ? player.hand.find((card) => card.id === hiddenDoglegCardId(room.hiddenDogleg, player.id))
      : room.doglegCard;
  if (!doglegCard) return 0;
  const doglegSuit = playSuit(doglegCard, room.trumpSuit);
  const sameSuitCount = player.hand.filter((card) => playSuit(card, room.trumpSuit) === doglegSuit).length;
  const remainingDoglegs = Math.max(1, doglegTargetCount(room) - (room.doglegPlayerIds || []).length);
  const copyPressure = Math.min(0.38, copies * 0.17);
  const suitPressure = sameSuitCount <= copies
    ? 0.34
    : sameSuitCount <= copies + 2
      ? 0.23
      : sameSuitCount <= 6
        ? 0.1
        : 0;
  const lateHandPressure = player.hand.length <= 14 ? 0.16 : player.hand.length <= 28 ? 0.08 : 0;
  const multiDoglegPressure = remainingDoglegs > 1 ? 0.08 : 0;
  return Math.max(0.05, Math.min(0.9, 0.08 + copyPressure + suitPressure + lateHandPressure + multiDoglegPressure));
}

function doglegRevealValue(room, player, cards, context, { beats = false, pointsAtStake = 0, leading = false } = {}) {
  if (!canRevealDoglegWithCards(room, player, cards)) return 0;
  const control = setupControlScore(player.hand, room.trumpSuit);
  const revealProbability = doglegRevealProbability(room, player);
  let value = -58 + revealProbability * 78 + aiPublicBankerSupport(room, context) * 0.75;
  if (pointsAtStake >= 20) value += pointsAtStake * 1.8;
  else if (pointsAtStake <= 5 && !beats) value -= 18;
  if (beats) value += 24;
  if (leading) value += control >= 120 ? 18 : -16;
  value += Math.max(-22, Math.min(34, (control - 95) * 0.35));
  return value;
}

function legalFollowCandidates(room, player, info) {
  const candidates = [];
  const sameSuit = player.hand.filter((card) => playSuit(card, room.trumpSuit) === info.suit);
  const others = player.hand.filter((card) => playSuit(card, room.trumpSuit) !== info.suit);

  if (sameSuit.length >= info.count) {
    addCandidate(candidates, takeCards(sortForDiscard(room, player, sameSuit), info.count));
    addCandidate(candidates, takeCards(sortForFeed(room, player, sameSuit), info.count));
    addCandidate(candidates, takeCards(sortForStrength(room, sameSuit), info.count));
    addCandidate(candidates, takeCards(sortForShapeDiscard(room, player, sameSuit), info.count));
    cardsByRank(sameSuit, room.trumpSuit).forEach((group) => {
      const preferred = [...group.cards, ...sortForShapeDiscard(
        room,
        player,
        sameSuit.filter((card) => !group.cards.some((item) => item.id === card.id))
      )];
      addCandidate(candidates, takeCards(preferred, info.count));
    });
    exactPatternCandidates(sameSuit, info.pattern, room.trumpSuit).forEach((cards) => addCandidate(candidates, cards));
  } else {
    const base = sortForDiscard(room, player, sameSuit);
    const shortage = info.count - base.length;
    const discardPool = sortForDiscard(room, player, others);
    addCandidate(candidates, [...base, ...takeCards(discardPool, shortage)]);
    addCandidate(candidates, [...base, ...takeCards(sortForFeed(room, player, others), shortage)]);
    addCandidate(candidates, [...base, ...takeCards(sortForStrength(room, others), shortage)]);
    addCandidate(candidates, [...base, ...takeCards(sortForShapeDiscard(room, player, others), shortage)]);
    const byRoute = new Map();
    others.forEach((card) => {
      const route = playSuit(card, room.trumpSuit);
      if (!byRoute.has(route)) byRoute.set(route, []);
      byRoute.get(route).push(card);
    });
    byRoute.forEach((routeCards) => {
      addPreferredFillCandidate(
        candidates,
        base,
        sortForShapeDiscard(room, player, routeCards),
        discardPool,
        shortage
      );
    });
    if (sameSuit.length === 0 && info.suit !== "TRUMP") {
      const trumpCards = player.hand.filter((card) => playSuit(card, room.trumpSuit) === "TRUMP");
      exactPatternCandidates(trumpCards, info.pattern, room.trumpSuit).forEach((cards) => addCandidate(candidates, cards));
    }
  }

  return candidates
    .map((candidate) => candidate.cards)
    .filter((cards) => cards.length === info.count && !validatePlay(room, player, cards));
}

function leadCandidateScore(room, player, cards, context) {
  const pattern = detectPlayPattern(cards, room.trumpSuit);
  if (!pattern) return -Infinity;
  const points = cardsPoint(cards);
  const power = playPower(cards, room.trumpSuit);
  const voluntaryProtectedFives = aiVoluntaryProtectedFiveCount(room, player, cards);
  const endgame = player.hand.length <= 10;
  const threat = aiPatternThreat(room, player, cards, context);
  const urgency = aiScoreUrgency(room, player, context, points);
  let score = 0;
  score += cards.length * 8;
  if (pattern.type === "tractor") score += 32 + pattern.length * 10 + pattern.width * 6;
  if (pattern.type === "multi") score += 14 + pattern.width * 5;
  score += Math.max(0, 35 - power * 2);
  score += points * (power <= 8 ? 1.8 : -0.8) * urgency;
  score += (1 - threat.opponentRisk) * (18 + cards.length * 3);
  score += threat.allySupport * (12 + points);
  score -= threat.opponentRisk * (22 + points * 2.4);
  if (voluntaryProtectedFives && power > 2) score -= voluntaryProtectedFives * 72;
  score += doglegRevealValue(room, player, cards, context, { pointsAtStake: points, leading: true });
  score += aiCreatedVoidBonus(room, player, cards);
  if (endgame) score += Math.max(0, 30 - power) + cards.length * 4;
  score -= cardsAssetCost(room, player, cards) * 0.12;
  return score;
}

function throwLeadScore(room, player, plan, context) {
  const points = cardsPoint(plan.cards);
  const voluntaryProtectedFives = aiVoluntaryProtectedFiveCount(room, player, plan.cards);
  let score = 150 + plan.cards.length * 11 + points * 2.2;
  score += aiCreatedVoidBonus(room, player, plan.cards);
  score += doglegRevealValue(room, player, plan.cards, context, { pointsAtStake: points, leading: true });
  score -= voluntaryProtectedFives * 58;
  score -= cardsAssetCost(room, player, plan.cards) * 0.08;
  return score;
}

function leadAutoPlayPlans(room, player, context) {
  const candidates = leadPatternCandidates(room, player);
  const plans = candidates.map((cards) => ({
    cards,
    throwPlay: false,
    throwComponents: null,
    score: leadCandidateScore(room, player, cards, context)
  }));
  aiSafeThrowPlans(room, player, context).forEach((plan) => {
    plans.push({ ...plan, score: throwLeadScore(room, player, plan, context) });
  });
  if (!plans.length) {
    return [{
      cards: [sortForDiscard(room, player, player.hand)[0]].filter(Boolean),
      throwPlay: false,
      throwComponents: null,
      score: 0
    }];
  }
  return plans.sort((a, b) => b.score - a.score || b.cards.length - a.cards.length);
}

function followCandidateScore(room, player, cards, info, winning, context) {
  const relation = winning ? aiTeamRelation(room, player, winning.playerId) : "opponent";
  const pointsInCandidate = cardsPoint(cards);
  const pointsOnTable = cardsPoint((room.currentTrick?.plays || []).flatMap((play) => play.cards)) + pointsInCandidate;
  const opponentProtectedFives = protectedFivesInTrickByRelation(room, player, "opponent");
  const voluntaryProtectedFives = aiVoluntaryProtectedFiveCount(room, player, cards, info);
  const { beats, comparison } = candidateBeatsCurrent(room, info, cards, winning);
  const endgame = player.hand.length <= info.count * 2 + 2;
  const cost = cardsAssetCost(room, player, cards);
  const remainingIds = aiPlayersAfterCurrent(room, player).map((target) => target.id);
  const candidateThreat = beats
    ? aiPatternThreat(room, player, cards, context, remainingIds).opponentRisk
    : 0;
  const currentThreat = winning
    ? aiPatternThreat(room, player, winning.play.cards, context, remainingIds).opponentRisk
    : 1;
  const urgency = aiScoreUrgency(room, player, context, pointsOnTable);
  let score = 0;

  if (relation === "opponent") {
    if (beats) {
      const captureValue = (pointsOnTable >= 10 || opponentProtectedFives || endgame ? 120 : 72)
        + pointsOnTable * 3 * urgency
        + opponentProtectedFives * 80;
      score += captureValue * (1 - candidateThreat * 0.72);
      score -= candidateThreat * cost * 0.35;
    } else {
      score -= pointsInCandidate * 3 * urgency + voluntaryProtectedFives * 95;
    }
  } else if (relation === "ally" || relation === "self") {
    if (beats) {
      score += (currentThreat - candidateThreat) * (85 + pointsOnTable * 0.8);
      score -= 38 + cost * 0.3;
    } else {
      score += pointsInCandidate * 4 * (1 - currentThreat) * urgency;
      score -= currentThreat * pointsInCandidate * 4.5;
      score -= voluntaryProtectedFives * 88;
    }
  } else {
    const unknownOpponentProbability = winning
      ? context.teams.opponentProbability(winning.playerId)
      : 0.5;
    if (beats && (pointsOnTable >= 20 || opponentProtectedFives)) {
      score += (70 + pointsOnTable * 1.5 * urgency) * unknownOpponentProbability * (1 - candidateThreat * 0.65);
    } else {
      score += pointsInCandidate * 2.2 * (1 - unknownOpponentProbability) * (1 - currentThreat);
      score -= pointsInCandidate * unknownOpponentProbability;
      score -= voluntaryProtectedFives * 82;
    }
  }

  if (beats && comparison) score += Math.max(0, 35 - comparison.power);
  score += doglegRevealValue(room, player, cards, context, { beats, pointsAtStake: pointsOnTable });
  score += aiCreatedVoidBonus(room, player, cards);
  if (endgame && beats) score += 35 + pointsOnTable;
  score -= cost * (beats ? 0.25 : 0.55);
  return score;
}

function followAutoPlayPlans(room, player, info, context) {
  const candidates = legalFollowCandidates(room, player, info);
  if (!candidates.length) return [];
  const winning = currentWinningState(room);
  return candidates
    .map((cards) => ({ cards, score: followCandidateScore(room, player, cards, info, winning, context) }))
    .map((plan) => ({ ...plan, throwPlay: false, throwComponents: null }))
    .sort((a, b) => b.score - a.score || cardsPoint(b.cards) - cardsPoint(a.cards));
}

function heuristicAutoPlayPlans(room, player, context = aiDecisionContext(room, player)) {
  if (!player.hand.length) return [];
  const info = leadInfo(room.currentTrick, room.trumpSuit);
  return info
    ? followAutoPlayPlans(room, player, info, context)
    : leadAutoPlayPlans(room, player, context);
}

function legalHeuristicAutoPlay(room, player, context = aiDecisionContext(room, player)) {
  const best = heuristicAutoPlayPlans(room, player, context)[0];
  if (!best) {
    return {
      cards: [],
      throwPlay: false,
      throwComponents: null,
      strategy: AI_STRATEGY_HEURISTIC
    };
  }
  return { ...best, strategy: AI_STRATEGY_HEURISTIC };
}

function aiDecisionSeed(room, player) {
  const ownCards = player.hand.map((card) => card.id).sort().join(",");
  const publicPlays = (room.currentTrick?.plays || [])
    .map((play) => `${play.playerId}:${play.cards.map((card) => card.id).sort().join(",")}`)
    .join(";");
  const publicHistory = (room.trickHistory || [])
    .map((trick) => `${trick.number}:${trick.winnerId || ""}:${trick.plays
      .map((play) => play.cards.map((card) => card.id).sort().join(","))
      .join("/")}`)
    .join(";");
  const handCounts = room.players.map((target) => `${target.id}:${target.hand.length}`).join(",");
  return stableAiSeed([
    room.players.length,
    room.trumpSuit || "",
    player.id,
    room.currentTrick?.number || 0,
    ownCards,
    handCounts,
    publicPlays,
    publicHistory
  ].join("|"));
}

function aiSampleHiddenHands(room, player, context, random) {
  const targets = room.players
    .filter((target) => target.id !== player.id)
    .map((target) => ({
      id: target.id,
      count: target.hand.length,
      voidRoutes: context.knowledge.voidRoutesByPlayerId.get(target.id) || new Set()
    }))
    .sort((left, right) => right.voidRoutes.size - left.voidRoutes.size || right.count - left.count);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let remaining = shuffleWithRandom(context.unseenCards, random);
    const hands = new Map();
    let failed = false;
    for (const target of targets) {
      const allowed = remaining.filter((card) => !target.voidRoutes.has(playSuit(card, room.trumpSuit)));
      if (allowed.length < target.count) {
        failed = true;
        break;
      }
      const selected = allowed.slice(0, target.count);
      const selectedIds = new Set(selected.map((card) => card.id));
      hands.set(target.id, selected);
      remaining = remaining.filter((card) => !selectedIds.has(card.id));
    }
    if (!failed) return { hands, hiddenKitty: remaining };
  }
  return null;
}

function aiSampleWorlds(room, player, context, sampleCount = AI_MONTE_CARLO_SAMPLES) {
  const random = createSeededRandom(aiDecisionSeed(room, player));
  const worlds = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const world = aiSampleHiddenHands(room, player, context, random);
    if (world) worlds.push(world);
  }
  return worlds;
}

function aiSimulationRoom(room, player, world) {
  return {
    ...room,
    players: room.players.map((target) => ({
      ...target,
      hand: target.id === player.id
        ? [...player.hand]
        : [...(world.hands.get(target.id) || [])]
    })),
    kitty: [...world.hiddenKitty],
    trickHistory: [...(room.trickHistory || [])],
    currentTrick: {
      ...room.currentTrick,
      plays: (room.currentTrick?.plays || []).map((play) => ({
        ...play,
        cards: [...play.cards],
        forcedProtectedFiveIds: [...(play.forcedProtectedFiveIds || [])]
      }))
    },
    doglegPlayerIds: [...(room.doglegPlayerIds || [])],
    events: []
  };
}

function aiPlanPlayRecord(room, player, plan) {
  let throwComponents = null;
  if (plan.throwPlay) {
    const parsed = throwComponentsFromExplicitGroups(plan.cards, plan.throwComponents, room.trumpSuit);
    if (parsed.error) return null;
    throwComponents = publicThrowComponents(parsed.components);
  }
  return {
    playerId: player.id,
    cards: [...plan.cards],
    forcedProtectedFiveIds: [],
    throwPlay: Boolean(plan.throwPlay),
    throwFailed: false,
    throwComponents
  };
}

function aiAppendSimulatedPlay(room, player, plan) {
  const play = aiPlanPlayRecord(room, player, plan);
  if (!play) return false;
  const leadCards = room.currentTrick.plays[0]?.cards || [];
  play.forcedProtectedFiveIds = leadCards.length
    ? forcedProtectedFiveIds({
      hand: player.hand,
      selected: play.cards,
      leadCards,
      trumpSuit: room.trumpSuit
    })
    : [];
  const selectedIds = new Set(play.cards.map((card) => card.id));
  player.hand = player.hand.filter((card) => !selectedIds.has(card.id));
  room.currentTrick.plays.push(play);
  return true;
}

function aiTeamAffinity(context, playerId) {
  const relation = context.teams.relationByPlayerId.get(playerId);
  if (relation === "self" || relation === "ally") return 1;
  if (relation === "opponent") return -1;
  return 1 - context.teams.opponentProbability(playerId) * 2;
}

function aiSimulatedTrickValue(room, context, outcome, options = {}) {
  const { fixedTeam = false } = options;
  const winnerAffinity = aiTeamAffinity(context, outcome.winnerId);
  let value = winnerAffinity * (28 + outcome.points * 3.2);
  room.currentTrick.plays.forEach((play) => {
    if (play.playerId === outcome.winnerId) return;
    const ownerAffinity = aiTeamAffinity(context, play.playerId);
    play.cards.forEach((card) => {
      if (!isProtectedFive(card)) return;
      const fiveWeight = card.suit === "H" ? 92 : 68;
      value += (winnerAffinity - ownerAffinity) * fiveWeight / 2;
    });
  });
  if (fixedTeam && options.fixedTeamControl === true) {
    const relation = context.teams.relationByPlayerId.get(outcome.winnerId);
    const selfId = [...context.teams.relationByPlayerId.entries()]
      .find(([, targetRelation]) => targetRelation === "self")?.[0];
    const winnerStrength = aiSetupStrengthSignal(room, context, outcome.winnerId);
    const selfStrength = selfId ? aiSetupStrengthSignal(room, context, selfId) : 0;
    if (relation === "ally") value += 14 + Math.max(0, winnerStrength - selfStrength) * 0.6;
    if (relation === "opponent") value -= winnerStrength * 0.35;
  }
  return value;
}

function aiSimulatedFiveLosses(trick, outcome, player, context) {
  const losses = { own: 0, ally: 0, opponent: 0 };
  trick.plays.forEach((play) => {
    if (play.playerId === outcome.winnerId) return;
    const fiveLoss = play.cards.reduce((total, card) => {
      if (!isProtectedFive(card)) return total;
      return total + (card.suit === "H" ? 2 : 1);
    }, 0);
    if (!fiveLoss) return;
    if (play.playerId === player.id) losses.own += fiveLoss;
    else if (aiTeamAffinity(context, play.playerId) > 0) losses.ally += fiveLoss;
    else losses.opponent += fiveLoss;
  });
  return losses;
}

function aiAdvanceSimulatedTrick(room, outcome) {
  const completed = { ...room.currentTrick, ...outcome };
  const winner = playerById(room, outcome.winnerId);
  if (winner) winner.score = (winner.score || 0) + outcome.points;
  room.trickHistory = [...(room.trickHistory || []), completed];
  room.currentTrick = createEmptyTrick(completed.number + 1, outcome.winnerId);
}

function aiSimulateNextTrick(room) {
  let remainingTurns = room.players.length;
  while (room.currentTrick.plays.length < room.players.length && remainingTurns > 0) {
    remainingTurns -= 1;
    const nextId = expectedPlayerId(room);
    const nextPlayer = playerById(room, nextId);
    if (!nextPlayer?.hand?.length) return null;
    const response = legalHeuristicAutoPlay(room, nextPlayer);
    if (!response.cards.length || !aiAppendSimulatedPlay(room, nextPlayer, response)) return null;
  }
  if (room.currentTrick.plays.length !== room.players.length) return null;
  return settleTrick(room, room.currentTrick);
}

function aiSimulatePlan(room, player, plan, context, world, options = {}) {
  const simulatedRoom = aiSimulationRoom(room, player, world);
  const simulatedPlayer = playerById(simulatedRoom, player.id);
  if (!simulatedPlayer || !aiAppendSimulatedPlay(simulatedRoom, simulatedPlayer, plan)) return null;

  let remainingTurns = simulatedRoom.players.length;
  while (simulatedRoom.currentTrick.plays.length < simulatedRoom.players.length && remainingTurns > 0) {
    remainingTurns -= 1;
    const nextId = expectedPlayerId(simulatedRoom);
    const nextPlayer = playerById(simulatedRoom, nextId);
    if (!nextPlayer) return null;
    const response = legalHeuristicAutoPlay(simulatedRoom, nextPlayer);
    if (!response.cards.length || !aiAppendSimulatedPlay(simulatedRoom, nextPlayer, response)) return null;
  }
  if (simulatedRoom.currentTrick.plays.length !== simulatedRoom.players.length) return null;
  const outcome = settleTrick(simulatedRoom, simulatedRoom.currentTrick);
  const firstLosses = aiSimulatedFiveLosses(simulatedRoom.currentTrick, outcome, player, context);
  let value = aiSimulatedTrickValue(simulatedRoom, context, outcome, options);
  let ownFiveLoss = firstLosses.own;
  let allyFiveLoss = firstLosses.ally;
  let opponentFiveLoss = firstLosses.opponent;
  let finalWinnerId = outcome.winnerId;
  const depth = Math.max(1, Math.min(2, Number(options.fixedTeamDepth) || 1));
  if (depth >= 2 && simulatedRoom.players.some((target) => target.hand.length > 0)) {
    aiAdvanceSimulatedTrick(simulatedRoom, outcome);
    const nextOutcome = aiSimulateNextTrick(simulatedRoom);
    if (nextOutcome) {
      const nextLosses = aiSimulatedFiveLosses(simulatedRoom.currentTrick, nextOutcome, player, context);
      value += aiSimulatedTrickValue(simulatedRoom, context, nextOutcome, options) * 0.55;
      ownFiveLoss += nextLosses.own;
      allyFiveLoss += nextLosses.ally;
      opponentFiveLoss += nextLosses.opponent;
      finalWinnerId = nextOutcome.winnerId;
    }
  }
  return {
    value,
    winnerId: finalWinnerId,
    ownFiveLoss,
    allyFiveLoss,
    opponentFiveLoss
  };
}

function aiTeamFiveExposure(room, context) {
  const exposure = {
    allyRedPlayers: new Set(),
    opponentRedPlayers: new Set(),
    allyDiamondPlayers: new Set(),
    opponentDiamondPlayers: new Set()
  };
  (room.trickHistory || []).forEach((trick) => {
    const winningPlay = (trick.plays || []).find((play) => play.playerId === trick.winnerId);
    if (!winningPlay) return;
    const relation = context.teams.relationByPlayerId.get(winningPlay.playerId);
    const side = relation === "self" || relation === "ally" ? "ally" : relation === "opponent" ? "opponent" : null;
    if (!side) return;
    if (winningPlay.cards.some((card) => isProtectedFive(card) && card.suit === "H")) {
      exposure[`${side}RedPlayers`].add(winningPlay.playerId);
    }
    if (winningPlay.cards.some((card) => isProtectedFive(card) && card.suit === "D")) {
      exposure[`${side}DiamondPlayers`].add(winningPlay.playerId);
    }
  });
  return exposure;
}

function aiFixedTeamRolloutAdjustment(room, context, plan, simulations, options = {}) {
  if (!simulations.length) return 0;
  let score = 0;
  const plannedDiamondFives = plan.cards.filter((card) => isProtectedFive(card) && card.suit === "D").length;
  const plannedRedFives = plan.cards.filter((card) => isProtectedFive(card) && card.suit === "H").length;
  if (options.fixedFiveRun === true && (plannedDiamondFives || plannedRedFives)) {
    const unsafeRate = simulations.filter((result) => result.ownFiveLoss > 0).length / simulations.length;
    const acceptableRate = plannedDiamondFives >= 3 ? 0.09 : 0;
    if (unsafeRate > acceptableRate) score -= (plannedRedFives * 2 + plannedDiamondFives) * 260;
    else if (plannedDiamondFives) score += plannedDiamondFives * 56;
  }
  if (
    options.fixedFiveDrag === true
    && !room.currentTrick?.plays?.length
    && !plannedDiamondFives
    && !plannedRedFives
  ) {
    const allyLoss = simulations.reduce((total, result) => total + result.allyFiveLoss, 0) / simulations.length;
    const opponentLoss = simulations.reduce((total, result) => total + result.opponentFiveLoss, 0) / simulations.length;
    const net = opponentLoss - allyLoss;
    const pattern = detectPlayPattern(plan.cards, room.trumpSuit);
    const strongMainLead = playSuit(plan.cards[0], room.trumpSuit) === "TRUMP"
      && plan.cards.length >= 2
      && (pattern?.type === "tractor" || pattern?.type === "multi");
    const exposure = aiTeamFiveExposure(room, context);
    const redRunnerBias = exposure.opponentRedPlayers.size - exposure.allyRedPlayers.size;
    const allyRiskMultiplier = strongMainLead ? 1 + Math.max(0, redRunnerBias) * 0.45 : 1;
    const requiredNet = strongMainLead ? 0.3 + Math.max(0, redRunnerBias) * 0.25 : 0.3;
    if (strongMainLead && redRunnerBias > 0) score -= redRunnerBias * 10;
    if (allyLoss > 0.08 || net < requiredNet) score -= allyLoss * 140 * allyRiskMultiplier;
    else score += net * 14;
  }
  return score;
}

function aiFixedTeamNeedsFullSampling(room, plan) {
  if (plan.cards.some(isProtectedFive)) return true;
  if (room.currentTrick?.plays?.length) return false;
  const pattern = detectPlayPattern(plan.cards, room.trumpSuit);
  return playSuit(plan.cards[0], room.trumpSuit) === "TRUMP"
    && plan.cards.length >= 2
    && (pattern?.type === "tractor" || pattern?.type === "multi");
}

function chooseMonteCarloAutoPlay(room, player, plans, context, options = {}) {
  const maximumCandidates = options.fixedTeam ? 6 : AI_MONTE_CARLO_CANDIDATES;
  const candidateLimit = Math.max(1, Math.min(
    maximumCandidates,
    Number(options.candidateLimit) || AI_MONTE_CARLO_CANDIDATES
  ));
  const maximumSamples = options.fixedTeam ? 12 : AI_MONTE_CARLO_SAMPLES;
  const defaultSampleCount = options.fixedTeam ? (room.players.length >= 7 ? 8 : 12) : room.players.length >= 7 ? 4 : AI_MONTE_CARLO_SAMPLES;
  const sampleCount = Math.max(1, Math.min(
    maximumSamples,
    Number(options.sampleCount) || defaultSampleCount
  ));
  const rolloutWeight = clampNumber(
    Number.isFinite(Number(options.rolloutWeight)) ? Number(options.rolloutWeight) : AI_MONTE_CARLO_ROLLOUT_WEIGHT,
    0,
    2
  );
  const overrideMargin = clampNumber(
    Number.isFinite(Number(options.overrideMargin)) ? Number(options.overrideMargin) : AI_MONTE_CARLO_OVERRIDE_MARGIN,
    0,
    100
  );
  const candidates = plans.slice(0, candidateLimit);
  const worlds = aiSampleWorlds(room, player, context, sampleCount);
  if (candidates.length < 2 || !worlds.length) {
    return {
      ...plans[0],
      strategy: options.strategyName || AI_STRATEGY_MONTE_CARLO,
      sampleCount: worlds.length,
      overrodeHeuristic: false
    };
  }

  const evaluated = candidates.map((plan) => {
    const planWorlds = options.fixedTeam && !aiFixedTeamNeedsFullSampling(room, plan)
      ? worlds.slice(0, AI_MONTE_CARLO_SAMPLES)
      : worlds;
    const simulations = planWorlds
      .map((world) => aiSimulatePlan(room, player, plan, context, world, options))
      .filter(Boolean);
    const rolloutScore = simulations.length
      ? simulations.reduce((total, result) => total + result.value, 0) / simulations.length
      : 0;
    const fixedTeamAdjustment = options.fixedTeam
      ? aiFixedTeamRolloutAdjustment(room, context, plan, simulations, options)
      : 0;
    return {
      ...plan,
      heuristicScore: plan.score,
      rolloutScore,
      sampleCount: simulations.length,
      combinedScore: plan.score + rolloutScore * rolloutWeight + fixedTeamAdjustment,
      fixedTeamAdjustment
    };
  });
  const heuristicBestKey = cardIdsKey(plans[0].cards);
  const ranked = evaluated.sort((left, right) =>
    right.combinedScore - left.combinedScore
    || right.heuristicScore - left.heuristicScore
    || right.cards.length - left.cards.length
  );
  const heuristicBest = evaluated.find((plan) => cardIdsKey(plan.cards) === heuristicBestKey)
    || ranked[0];
  const rolloutBest = ranked[0];
  const selected = rolloutBest !== heuristicBest
    && rolloutBest.combinedScore < heuristicBest.combinedScore + overrideMargin
    ? heuristicBest
    : rolloutBest;
  return {
    ...selected,
    strategy: options.strategyName || AI_STRATEGY_MONTE_CARLO,
    overrodeHeuristic: selected !== heuristicBest,
    heuristicBestScore: heuristicBest.combinedScore,
    selectedScoreAdvantage: selected.combinedScore - heuristicBest.combinedScore
  };
}

function protectedFiveCandidatePlans(plans) {
  const protectedFivePlans = plans.filter((plan) => plan.cards.some(isProtectedFive)).slice(0, 3);
  const candidates = [];
  const seenPlans = new Set();
  [
    ...plans.slice(0, 3),
    ...protectedFivePlans,
    ...plans
  ].forEach((plan) => {
    const key = cardIdsKey(plan.cards);
    if (seenPlans.has(key)) return;
    seenPlans.add(key);
    candidates.push(plan);
  });
  return { candidates, protectedFivePlans };
}

function legalAutoPlay(room, player, options = {}) {
  const strategy = options.strategy || AI_STRATEGY_SAFE_FIVE;
  if (!player.hand.length) {
    return { cards: [], throwPlay: false, throwComponents: null, strategy };
  }
  const context = aiDecisionContext(room, player);
  const plans = heuristicAutoPlayPlans(room, player, context);
  if (!plans.length) {
    return { cards: [], throwPlay: false, throwComponents: null, strategy };
  }
  if (
    strategy === AI_STRATEGY_HEURISTIC
    || normalizeDoglegMode(room.doglegMode) !== DOGLEG_MODE_TRADITIONAL
  ) return legalHeuristicAutoPlay(room, player, context);
  if (strategy === AI_STRATEGY_SAFE_FIVE) {
    const { candidates, protectedFivePlans } = protectedFiveCandidatePlans(plans);
    return chooseMonteCarloAutoPlay(room, player, candidates, context, {
      ...options,
      fixedTeam: true,
      fixedFiveRun: true,
      fixedTeamDepth: 1,
      strategyName: AI_STRATEGY_SAFE_FIVE,
      candidateLimit: Number(options.candidateLimit)
        || Math.min(6, AI_MONTE_CARLO_CANDIDATES + protectedFivePlans.length),
      sampleCount: Number(options.sampleCount) || (room.players.length >= 7 ? 4 : 6)
    });
  }
  if (strategy === AI_STRATEGY_FIXED_TEAM) {
    const scoredPlans = plans
      .map((plan) => ({
        ...plan,
        score: plan.score + aiFixedTeamPlanAdjustment(room, player, plan, context, options)
      }))
      .sort((left, right) => right.score - left.score || right.cards.length - left.cards.length);
    const { candidates, protectedFivePlans } = protectedFiveCandidatePlans(scoredPlans);
    return chooseMonteCarloAutoPlay(room, player, candidates, context, {
      ...options,
      fixedTeam: true,
      strategyName: AI_STRATEGY_FIXED_TEAM,
      candidateLimit: Number(options.candidateLimit) || (options.fixedFiveRun === true
        ? Math.min(6, AI_MONTE_CARLO_CANDIDATES + protectedFivePlans.length)
        : AI_MONTE_CARLO_CANDIDATES),
      sampleCount: Number(options.sampleCount) || (room.players.length >= 7 ? 4 : 6),
      fixedTeamDepth: Math.max(1, Math.min(2, Number(options.fixedTeamDepth) || 2))
    });
  }
  return chooseMonteCarloAutoPlay(room, player, plans, context, options);
}

function compareCardsSmallToLarge(room, a, b) {
  const aSuit = playSuit(a, room.trumpSuit);
  const bSuit = playSuit(b, room.trumpSuit);
  return patternValue(b, room.trumpSuit) - patternValue(a, room.trumpSuit)
    || (autoPlaySuitOrder.get(aSuit) ?? 9) - (autoPlaySuitOrder.get(bSuit) ?? 9)
    || a.deck - b.deck
    || a.id.localeCompare(b.id);
}

function sortCardsSmallToLarge(room, cards) {
  return [...cards].sort((a, b) => compareCardsSmallToLarge(room, a, b));
}

function smallestLegalAutoCards(room, player) {
  if (!player.hand.length) return [];
  const info = leadInfo(room.currentTrick, room.trumpSuit);
  if (!info) return sortCardsSmallToLarge(room, player.hand).slice(0, 1);

  const sameSuit = sortCardsSmallToLarge(
    room,
    player.hand.filter((card) => playSuit(card, room.trumpSuit) === info.suit)
  );
  if (sameSuit.length >= info.count) return sameSuit.slice(0, info.count);

  const otherCards = sortCardsSmallToLarge(
    room,
    player.hand.filter((card) => playSuit(card, room.trumpSuit) !== info.suit)
  );
  return [...sameSuit, ...otherCards.slice(0, info.count - sameSuit.length)];
}

function playerUsesAutomaticPlay(player) {
  return Boolean(player?.test || player?.autoPlayEnabled);
}

function setPlayerAutoPlay(room, player, enabled) {
  if (room.status !== "dealt" || room.stage !== "playing") {
    return { error: "只有进入打牌阶段后才能开启托管", status: 409 };
  }
  const nextEnabled = Boolean(enabled);
  if (player.autoPlayEnabled === nextEnabled) return { ok: true, changed: false };
  player.autoPlayEnabled = nextEnabled;
  addEvent(room, `${player.name}${nextEnabled ? "开启" : "取消"}了托管`);
  return { ok: true, changed: true };
}

function clearAiPlayTimer(room) {
  if (!room?.aiPlayTimer) return;
  clearTimeout(room.aiPlayTimer);
  room.aiPlayTimer = null;
}

function scheduleNextAiPlay(room, delayMs = AI_PLAY_DELAY_MS) {
  if (!room || room.aiPlayTimer || room.status !== "dealt" || room.stage !== "playing") return false;
  const nextPlayerId = expectedPlayerId(room);
  const nextPlayer = playerById(room, nextPlayerId);
  if (!playerUsesAutomaticPlay(nextPlayer)) return false;
  const pauseDelay = room.playPauseUntil
    ? Math.max(0, new Date(room.playPauseUntil).getTime() - Date.now())
    : 0;

  room.aiPlayTimer = setTimeout(() => {
    room.aiPlayTimer = null;
    if (rooms.get(room.id) !== room || room.status !== "dealt" || room.stage !== "playing") return;
    const currentPlayer = playerById(room, expectedPlayerId(room));
    if (!playerUsesAutomaticPlay(currentPlayer)) return;
    const automaticPlay = currentPlayer.test
      ? legalAutoPlay(room, currentPlayer)
      : {
        cards: smallestLegalAutoCards(room, currentPlayer),
        throwPlay: false,
        throwComponents: null
      };
    if (!automaticPlay.cards.length) return;
    const result = playCards(
      room,
      currentPlayer,
      automaticPlay.cards.map((card) => card.id),
      {
        throwPlay: Boolean(currentPlayer.test && automaticPlay.throwPlay),
        throwComponents: automaticPlay.throwComponents
      }
    );
    if (result.error) {
      addEvent(room, `${currentPlayer.name} ${currentPlayer.test ? "自动" : "托管"}出牌失败：${result.error}`);
      broadcast(room);
      return;
    }
    broadcast(room);
    if (result.resumeAt) {
      scheduleFailedThrowResolution(room, currentPlayer, result);
      return;
    }
    scheduleNextAiPlay(room);
  }, Math.max(0, delayMs, pauseDelay + 20));
  return true;
}

function autoCompleteFinalTrick(room, triggeringPlayer) {
  const finalTrick = room.currentTrick;
  if (!finalTrick || room.stage !== "playing") return;
  addEvent(room, `${triggeringPlayer.name} 打出最后一手，剩余玩家自动跟出`);

  let remainingPlayers = room.players.length;
  while (
    remainingPlayers > 0
    && room.stage === "playing"
    && room.currentTrick === finalTrick
    && finalTrick.plays.length < room.players.length
  ) {
    remainingPlayers -= 1;
    const nextPlayer = playerById(room, expectedPlayerId(room));
    if (!nextPlayer?.hand?.length) break;
    const result = playCards(room, nextPlayer, nextPlayer.hand.map((card) => card.id), { autoFinalFollow: true });
    if (result.error) {
      addEvent(room, `${nextPlayer.name} 最后一手自动跟牌失败：${result.error}`);
      break;
    }
  }
}

function playCards(room, player, cardIds, options = {}) {
  if (room.status !== "dealt" || room.stage !== "playing") {
    return { error: "还没有进入打牌阶段，暂不能出牌", status: 409 };
  }
  if (room.playPauseUntil) {
    const pauseUntil = new Date(room.playPauseUntil).getTime();
    if (Date.now() < pauseUntil) return { error: "正在展示甩牌判定结果，请稍候", status: 409 };
    room.playPauseUntil = null;
  }
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return { error: "请选择要出的牌", status: 400 };
  }
  const uniqueCardIds = [...new Set(cardIds.map(String))];
  if (uniqueCardIds.length !== cardIds.length) {
    return { error: "不能重复选择同一张牌", status: 400 };
  }
  if (room.currentTrick.plays.some((play) => play.playerId === player.id)) {
    return { error: "你本轮已经出过牌", status: 409 };
  }
  const expected = expectedPlayerId(room);
  if (expected && player.id !== expected) {
    return { error: `现在轮到 ${playerName(room, expected)} 出牌`, status: 409 };
  }

  const selected = player.hand.filter((card) => uniqueCardIds.includes(card.id));
  if (selected.length !== uniqueCardIds.length) {
    return { error: "选择的牌不在你的手牌中", status: 400 };
  }
  let playedCards = selected;
  let throwMeta = null;
  if (options.throwPlay) {
    throwMeta = prepareThrowLeadPlay(room, player, selected, options.throwComponents);
    if (throwMeta.error) return { error: throwMeta.error, status: throwMeta.status || 400 };
    playedCards = throwMeta.cards;
  } else {
    const playError = validatePlay(room, player, selected);
    if (playError) {
      return { error: playError, status: 400 };
    }
  }

  clearAiPlayTimer(room);
  const leadCards = room.currentTrick.plays[0]?.cards || [];
  const forcedFiveIds = leadCards.length
    ? forcedProtectedFiveIds({
      hand: player.hand,
      selected: playedCards,
      leadCards,
      trumpSuit: room.trumpSuit
    })
    : [];
  const selectedIds = new Set(playedCards.map((card) => card.id));
  player.hand = player.hand.filter((card) => !selectedIds.has(card.id));
  room.currentTrick.plays.push({
    playerId: player.id,
    at: now(),
    cards: playedCards,
    forcedProtectedFiveIds: forcedFiveIds,
    throwPlay: Boolean(throwMeta && !throwMeta.failed),
    throwFailed: Boolean(throwMeta?.failed),
    throwAttemptCards: throwMeta?.attemptCards || null,
    throwRevealUntil: throwMeta?.revealUntil || null,
    throwComponents: throwMeta?.components ? publicThrowComponents(throwMeta.components) : null
  });
  if (!throwMeta?.failed) {
    addEvent(room, `${player.name} 第 ${room.currentTrick.number} 轮出了 ${playedCards.map((card) => card.label).join(" ")}`);
  }
  revealDoglegIfNeeded(room, player, playedCards);
  recordProvisionalWinner(room);

  if (room.currentTrick.plays.length === room.players.length) {
    completeCurrentTrick(room);
  } else if (player.hand.length === 0 && !throwMeta?.failed && !options.autoFinalFollow) {
    autoCompleteFinalTrick(room, player);
  }

  if (throwMeta?.failed) {
    const resumeAt = new Date(new Date(throwMeta.revealUntil).getTime() + 1400).toISOString();
    room.playPauseUntil = resumeAt;
    return { ok: true, revealAt: throwMeta.revealUntil, resumeAt };
  }
  return { ok: true };
}

function scheduleFailedThrowResolution(room, player, result) {
  if (!result?.resumeAt || !result?.revealAt) return false;
  const revealAt = result.revealAt;
  const resumeAt = result.resumeAt;
  const noticeId = `throw-${room.currentTrick?.number || 0}-${player.id}-${revealAt}`;
  setTimeout(() => {
    const activeRoom = rooms.get(room.id);
    if (!activeRoom || activeRoom.playPauseUntil !== resumeAt) return;
    const failedPlayer = playerById(activeRoom, player.id);
    const failedPlay = activeRoom.currentTrick?.plays?.find((play) => play.playerId === player.id && play.throwFailed);
    if (failedPlayer && failedPlay) {
      failedPlayer.throwFailures = (failedPlayer.throwFailures || 0) + 1;
      addEvent(activeRoom, `${failedPlayer.name} 甩牌失败，改出 ${failedPlay.cards.map((card) => card.label).join(" ")}，累计甩牌失败 ${failedPlayer.throwFailures} 次`);
    }
    activeRoom.notice = {
      id: noticeId,
      text: `${player.name} 甩牌失败，已自动改出被压过的牌型。`,
      bad: true,
      expiresAt: new Date(Date.now() + 4500).toISOString()
    };
    broadcast(activeRoom);
  }, Math.max(0, new Date(revealAt).getTime() - Date.now()) + 20);
  setTimeout(() => {
    const activeRoom = rooms.get(room.id);
    if (!activeRoom || activeRoom.playPauseUntil !== resumeAt) return;
    activeRoom.playPauseUntil = null;
    broadcast(activeRoom);
    scheduleNextAiPlay(activeRoom);
  }, Math.max(0, new Date(resumeAt).getTime() - Date.now()) + 20);
  return true;
}

function writeJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function readJson(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(Object.assign(new Error("请求内容过大"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("请求格式不正确"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function getRoom(res, rawRoomId) {
  const room = rooms.get(String(rawRoomId || "").toUpperCase());
  if (!room) {
    writeJson(res, 404, { error: "房间不存在" });
    return null;
  }
  return room;
}

function broadcast(room) {
  room.snapshotVersion = (room.snapshotVersion || 0) + 1;
  for (const client of room.clients) {
    sendLatestState(room, client);
  }
}

function sendLatestState(room, client) {
  if (!room.clients.has(client)) return;
  if (client.backpressured) {
    client.pendingState = true;
    return;
  }
  const spectator = client.spectatorId ? roomSpectators(room).get(client.spectatorId) : null;
  const viewer = spectator
    ? playerById(room, spectator.targetPlayerId)
    : room.players.find((player) => player.id === client.playerId) || null;
  const snapshot = spectator ? spectatorSnapshot(room, spectator) : roomSnapshot(room, viewer);
  if (!snapshot) return;
  const isInitialState = !client.lastSnapshot;
  const data = isInitialState ? snapshot : createStatePatch(client.lastSnapshot, snapshot);
  const eventName = isInitialState ? "state" : "patch";
  const payload = `id: ${room.snapshotVersion || 0}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  client.lastSnapshot = snapshot;
  if (client.res.write(payload)) return;
  client.backpressured = true;
  client.res.once("drain", () => {
    client.backpressured = false;
    if (!room.clients.has(client) || !client.pendingState) return;
    client.pendingState = false;
    sendLatestState(room, client);
  });
}

function updateConnection(room, playerId, connected) {
  const player = room.players.find((item) => item.id === playerId);
  if (!player) return false;
  const wasConnected = player.connected;
  const hasOtherClient = [...room.clients].some((client) => client.playerId === playerId);
  player.connected = connected || hasOtherClient;
  return wasConnected !== player.connected;
}

function roomStateAck(room, extra = {}) {
  return {
    ok: true,
    snapshotVersion: room.snapshotVersion || 0,
    ...extra
  };
}

async function handleApi(req, res, pathParts, url) {
  if (pathParts[1] === "auth") {
    if (req.method === "GET" && pathParts[2] === "status") {
      return writeJson(res, 200, authStatusPayload(req));
    }

    if (req.method === "POST" && pathParts[2] === "login") {
      if (!accountAuthStatus().configured || !authRuntime.initialized) {
        return writeJson(res, 503, { error: "账号服务正在初始化，请稍后重试" });
      }
      const body = await readJson(req);
      const account = accountForUsername(body.username);
      if (!account?.enabled) return writeJson(res, 401, { error: "用户名或密码不正确" });
      try {
        const user = await signInSupabaseUser(account.authEmail, String(body.password || ""));
        if (user?.id !== account.id) return writeJson(res, 401, { error: "用户名或密码不正确" });
      } catch {
        return writeJson(res, 401, { error: "用户名或密码不正确" });
      }
      account.lastLoginAt = now();
      void recordStoredAccountLogin(account.id);
      return writeJson(res, 200, { account: publicAccount(account) }, {
        "set-cookie": sessionCookie(req, account.id)
      });
    }

    if (req.method === "POST" && pathParts[2] === "logout") {
      return writeJson(res, 200, { ok: true }, { "set-cookie": clearedSessionCookie(req) });
    }

    if (req.method === "POST" && pathParts[2] === "password") {
      const account = requireAccount(res, req);
      if (!account) return;
      const body = await readJson(req);
      const passwordCheck = validatePassword(body.newPassword);
      if (passwordCheck.error) return writeJson(res, 400, { error: passwordCheck.error });
      try {
        const user = await signInSupabaseUser(account.authEmail, String(body.currentPassword || ""));
        if (user?.id !== account.id) return writeJson(res, 401, { error: "当前密码不正确" });
        await updateSupabasePassword(account.id, passwordCheck.password);
        return writeJson(res, 200, { ok: true });
      } catch {
        return writeJson(res, 401, { error: "当前密码不正确" });
      }
    }

    if (req.method === "POST" && pathParts[2] === "avatar") {
      const account = requireAccount(res, req);
      if (!account) return;
      if (account.role !== "player" || !account.profileId) return writeJson(res, 403, { error: "当前账号没有玩家身份" });
      const profile = profileForId(account.profileId);
      if (!profile) return writeJson(res, 404, { error: "账号绑定的玩家不存在" });
      const body = await readJson(req, 450_000);
      try {
        await saveProfileAvatar(profile, body.avatarDataUrl);
        return writeJson(res, 200, {
          account: publicAccount(account),
          player: publicProfile(profile),
          nextAvatarChangeAt: nextAvatarChangeAt(profile)
        });
      } catch (error) {
        return writeJson(res, error.status || 500, {
          error: error.message,
          nextAvatarChangeAt: error.nextAvatarChangeAt || nextAvatarChangeAt(profile)
        });
      }
    }

    return writeJson(res, 404, { error: "账号接口不存在" });
  }

  if (pathParts[1] === "admin") {
    const admin = requireAdmin(res, req);
    if (!admin) return;

    if (pathParts[2] === "accounts" && pathParts.length === 3 && req.method === "GET") {
      return writeJson(res, 200, adminAccountsPayload());
    }
    if (pathParts[2] === "accounts" && pathParts.length === 3 && req.method === "POST") {
      const body = await readJson(req);
      const account = await createPlayerAccount(admin, body);
      return writeJson(res, 201, { account: publicAccount(account), ...adminAccountsPayload() });
    }
    if (pathParts[2] === "accounts" && pathParts[3] && pathParts.length === 4 && req.method === "PATCH") {
      const target = accounts.get(pathParts[3]);
      if (!target) return writeJson(res, 404, { error: "账号不存在" });
      if (target.role !== "player") return writeJson(res, 400, { error: "不能在这里停用管理员账号" });
      const body = await readJson(req);
      let username = null;
      if (Object.hasOwn(body, "username")) {
        const usernameCheck = validateUsername(body.username);
        if (usernameCheck.error) return writeJson(res, 400, { error: usernameCheck.error });
        const owner = accountForUsername(usernameCheck.username);
        if (owner && owner.id !== target.id) return writeJson(res, 409, { error: "用户名已经存在" });
        username = usernameCheck.username;
      }
      const persistence = await updateStoredAccount(target.id, {
        enabled: Object.hasOwn(body, "enabled") ? Boolean(body.enabled) : undefined,
        username
      });
      if (persistence.status !== "saved") return writeJson(res, 503, { error: "账号资料保存失败" });
      storeAccount(persistence.account);
      return writeJson(res, 200, adminAccountsPayload());
    }
    if (pathParts[2] === "accounts" && pathParts[3] && pathParts[4] === "password" && req.method === "POST") {
      const target = accounts.get(pathParts[3]);
      if (!target) return writeJson(res, 404, { error: "账号不存在" });
      const body = await readJson(req);
      const passwordCheck = validatePassword(body.password);
      if (passwordCheck.error) return writeJson(res, 400, { error: passwordCheck.error });
      await updateSupabasePassword(target.id, passwordCheck.password);
      return writeJson(res, 200, { ok: true });
    }
    if (pathParts[2] === "taunts" && pathParts.length === 3 && req.method === "GET") {
      return writeJson(res, 200, adminTauntsPayload());
    }
    if (pathParts[2] === "taunts" && pathParts.length === 3 && req.method === "POST") {
      const body = await readJson(req);
      const input = adminTauntInput(body);
      if (input.error) return writeJson(res, input.status, { error: input.error });
      const sortOrder = Math.max(0, ...tauntPresets.map((preset) => preset.sortOrder || 0)) + 10;
      const preset = normalizeTauntPreset({
        id: `taunt-${randomUUID()}`,
        ...input,
        sortOrder
      });
      const persistence = await saveStoredTauntPreset(preset, { createdBy: admin.id });
      if (persistence.status !== "saved") {
        return writeJson(res, 503, { error: "嘲讽词保存失败，请确认数据库连接正常" });
      }
      tauntPresets.push(normalizeTauntPreset(persistence.preset));
      broadcastTauntPresetChanges();
      return writeJson(res, 201, adminTauntsPayload());
    }
    if (pathParts[2] === "taunts" && pathParts[3] && pathParts.length === 4 && req.method === "PATCH") {
      const current = tauntPresets.find((preset) => preset.id === pathParts[3]);
      if (!current) return writeJson(res, 404, { error: "嘲讽词不存在" });
      const body = await readJson(req);
      const input = adminTauntInput(body, current);
      if (input.error) return writeJson(res, input.status, { error: input.error });
      const nextPreset = normalizeTauntPreset({
        ...current,
        ...input
      });
      const persistence = await saveStoredTauntPreset(nextPreset);
      if (persistence.status !== "saved") {
        return writeJson(res, 503, { error: "嘲讽词保存失败，请确认数据库连接正常" });
      }
      tauntPresets = tauntPresets.map((preset) =>
        preset.id === current.id ? normalizeTauntPreset(persistence.preset) : preset
      );
      broadcastTauntPresetChanges();
      return writeJson(res, 200, adminTauntsPayload());
    }
    if (pathParts[2] === "taunts" && pathParts[3] && pathParts.length === 4 && req.method === "DELETE") {
      const current = tauntPresets.find((preset) => preset.id === pathParts[3]);
      if (!current) return writeJson(res, 404, { error: "嘲讽词不存在" });
      const persistence = await deleteStoredTauntPreset(current.id);
      if (persistence.status !== "deleted") {
        return writeJson(res, persistence.status === "missing" ? 404 : 503, {
          error: persistence.status === "missing" ? "嘲讽词不存在" : "嘲讽词删除失败，请确认数据库连接正常"
        });
      }
      tauntPresets = tauntPresets.filter((preset) => preset.id !== current.id);
      broadcastTauntPresetChanges();
      return writeJson(res, 200, adminTauntsPayload());
    }
    if (pathParts[2] === "avatar-frames" && pathParts.length === 3 && req.method === "POST") {
      const body = await readJson(req, 1_700_000);
      if (body.specConfirmed !== true) {
        return writeJson(res, 400, { error: "请先确认头像框符合虚拟骨架规范并检查真实叠加效果" });
      }
      if (await avatarFrameProductExists(body.assetKey)) {
        return writeJson(res, 409, { error: "这个主题编号已经存在，请换一个新的编号" });
      }
      const avatarFrame = decodeAvatarFrameDataUrl(body.avatarFrameDataUrl);
      const assetUrl = await uploadSupabaseAvatarFrame(body.assetKey, avatarFrame);
      const product = await createUploadedAvatarFrameProduct({
        assetKey: body.assetKey,
        name: body.name,
        description: body.description,
        price: body.price,
        isListed: body.isListed,
        assetUrl,
        assetVersion: avatarFrame.contentVersion
      }, admin.id);
      authRuntime.avatarFrameStorageReady = true;
      await refreshAvatarFrameCatalog();
      return writeJson(res, 201, {
        product,
        products: await listShopProducts({ includeUnlisted: true }),
        accounts: [...accounts.values()].filter((account) => account.role === "player").map(publicAccount)
      });
    }
    if (pathParts[2] === "shop" && pathParts.length === 3 && req.method === "GET") {
      return writeJson(res, 200, {
        products: await listShopProducts({ includeUnlisted: true }),
        accounts: [...accounts.values()].filter((account) => account.role === "player").map(publicAccount)
      });
    }
    if (pathParts[2] === "diamonds" && pathParts[3] === "grants" && pathParts.length === 4 && req.method === "POST") {
      const body = await readJson(req);
      const target = accounts.get(String(body.accountId || ""));
      if (!target || target.role !== "player") return writeJson(res, 404, { error: "玩家账号不存在" });
      const grant = await grantDiamondsByAdmin(
        admin.id,
        target.id,
        body.amount,
        body.requestId,
        body.note
      );
      return writeJson(res, 200, { grant, account: publicAccount(target) });
    }
    if (pathParts[2] === "shop" && pathParts.length === 3 && req.method === "PATCH") {
      const body = await readJson(req);
      await updateShopProducts(body.products, admin.id);
      await refreshAvatarFrameCatalog();
      return writeJson(res, 200, {
        products: await listShopProducts({ includeUnlisted: true }),
        accounts: [...accounts.values()].filter((account) => account.role === "player").map(publicAccount)
      });
    }
    if (pathParts[2] === "shop" && pathParts[3] && pathParts.length === 4 && req.method === "PATCH") {
      const body = await readJson(req);
      await updateShopProduct(shopProductIdFromPath(pathParts[3]), body, admin.id);
      await refreshAvatarFrameCatalog();
      return writeJson(res, 200, {
        products: await listShopProducts({ includeUnlisted: true }),
        accounts: [...accounts.values()].filter((account) => account.role === "player").map(publicAccount)
      });
    }
    if (pathParts[2] === "cosmetics" && pathParts[3] === "grants" && req.method === "POST") {
      const body = await readJson(req);
      const result = await grantCosmeticEntitlement(
        admin.id,
        body.accountId,
        body.productId,
        body.requestId,
        body.reason
      );
      return writeJson(res, 200, { ...result, products: await listShopProducts({ includeUnlisted: true }) });
    }
    if (pathParts[2] === "seasons" && pathParts.length === 3 && req.method === "GET") {
      return writeJson(res, 200, { seasons: await listSeasons() });
    }
    if (pathParts[2] === "seasons" && pathParts.length === 3 && req.method === "POST") {
      const body = await readJson(req);
      const season = await saveSeason(null, body, admin.id);
      return writeJson(res, 201, { season, seasons: await listSeasons() });
    }
    if (pathParts[2] === "seasons" && pathParts[3] && pathParts.length === 4 && req.method === "PATCH") {
      const body = await readJson(req);
      const season = await saveSeason(pathParts[3], body, admin.id);
      return writeJson(res, 200, { season, seasons: await listSeasons() });
    }
    if (pathParts[2] === "profiles" && pathParts[3] && pathParts[4] === "avatar" && req.method === "POST") {
      const profile = profileForId(pathParts[3]);
      if (!profile) return writeJson(res, 404, { error: "玩家不存在" });
      const body = await readJson(req, 450_000);
      await saveProfileAvatar(profile, body.avatarDataUrl, { bypassCooldown: true });
      return writeJson(res, 200, { player: publicProfile(profile), ...adminAccountsPayload() });
    }
    return writeJson(res, 404, { error: "管理员接口不存在" });
  }

  if (pathParts[1] === "history" && req.method === "GET") {
    if (pathParts[2] === "status") {
      return writeJson(res, 200, gameHistoryStatus());
    }
    if (pathParts[2] === "seasons") {
      return writeJson(res, 200, { seasons: await listSeasons() });
    }
    if (pathParts[2] === "statistics") {
      return writeJson(res, 200, { players: await listPlayerStatistics(url.searchParams.get("seasonId")) });
    }
    if (pathParts[2] === "players" && pathParts[3]) {
      if (pathParts[4] === "games") {
        const games = await listPlayerGames(pathParts[3], {
          seasonId: url.searchParams.get("seasonId"),
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          limit: url.searchParams.get("limit")
        });
        return writeJson(res, 200, { games });
      }
      const detail = await getPlayerStatistics(pathParts[3], url.searchParams.get("seasonId"));
      return detail
        ? writeJson(res, 200, detail)
        : writeJson(res, 404, { error: "暂无该玩家的牌局数据" });
    }
    if (pathParts[2] === "games") {
      if (pathParts[3]) {
        const game = await getGameHistory(pathParts[3]);
        return game
          ? writeJson(res, 200, { game })
          : writeJson(res, 404, { error: "牌局记录不存在" });
      }
      return writeJson(res, 200, { games: await listRecentGames(url.searchParams.get("limit")) });
    }
    return writeJson(res, 404, { error: "历史记录接口不存在" });
  }

  if (pathParts[1] === "heroes") {
    const account = requireAccount(res, req);
    if (!account) return;
    if (account.role !== "player") return writeJson(res, 403, { error: "管理员账号没有英雄家园" });
    if (req.method === "GET" && pathParts[2] === "me" && pathParts.length === 3) {
      return writeJson(res, 200, await getHeroHomeState(account.id));
    }
    if (req.method === "POST" && pathParts[2] === "home" && pathParts[3] === "collect") {
      const body = await readJson(req);
      return writeJson(res, 200, await collectHomeProduction(account.id, body.regionId, body.requestId));
    }
    if (req.method === "POST" && pathParts[2] === "home" && pathParts[3] === "assign") {
      const body = await readJson(req);
      return writeJson(res, 200, await assignHomeUnit(account.id, body.regionId, body.unitId, body.requestId, body.slot));
    }
    if (req.method === "POST" && pathParts[2] === "home" && pathParts[3] === "upgrade") {
      const body = await readJson(req);
      return writeJson(res, 200, await upgradeHomeRegion(account.id, body.regionId, body.requestId));
    }
    if (req.method === "PATCH" && pathParts[2] === "battle" && pathParts.length === 3) {
      const body = await readJson(req);
      return writeJson(res, 200, await selectBattleHero(account.id, body.unitId));
    }
    if (req.method === "POST" && pathParts[2] === "gacha" && pathParts.length === 3) {
      const body = await readJson(req);
      const result = await pullHeroGacha(account.id, body.pullCount, body.requestId);
      return writeJson(res, 200, { ...result, state: await getHeroHomeState(account.id) });
    }
    if (req.method === "POST" && pathParts[2] === "upgrade" && pathParts.length === 3) {
      const body = await readJson(req);
      const result = await upgradeHeroUnit(account.id, body.unitId, body.requestId);
      return writeJson(res, 200, { ...result, state: await getHeroHomeState(account.id) });
    }
    if (req.method === "POST" && pathParts[2] === "tasks" && pathParts[3] === "dispatch") {
      const body = await readJson(req);
      return writeJson(res, 200, await dispatchHeroTask(account.id, body.taskId, body.unitIds, body.requestId, body.autoSelect));
    }
    if (req.method === "POST" && pathParts[2] === "tasks" && pathParts[3] === "collect") {
      const body = await readJson(req);
      return writeJson(res, 200, await collectHeroTask(account.id, body.taskId, body.requestId));
    }
    if (req.method === "POST" && pathParts[2] === "daily-tasks" && pathParts[3] === "claim") {
      const body = await readJson(req);
      return writeJson(res, 200, await claimDailyTask(account.id, body.taskId, body.requestId));
    }
    return writeJson(res, 404, { error: "英雄家园接口不存在" });
  }

  if (pathParts[1] === "diamonds" && req.method === "GET" && pathParts[2] === "me") {
    const account = requireAccount(res, req);
    if (!account) return;
    if (account.role !== "player") return writeJson(res, 403, { error: "管理员账号没有玩家钻石钱包" });
    return writeJson(res, 200, await getDiamondWallet(account.id, url.searchParams.get("limit")));
  }

  if (pathParts[1] === "avatar-frames" && pathParts.length === 2 && req.method === "GET") {
    const products = await listShopProducts();
    return writeJson(res, 200, { products: products.filter((product) => product.productType === "avatar_frame") });
  }

  if (pathParts[1] === "shop") {
    const account = requireAccount(res, req);
    if (!account) return;
    if (account.role !== "player") return writeJson(res, 403, { error: "管理员账号不能购买商品" });
    if (req.method === "GET" && pathParts[2] === "me") {
      return writeJson(res, 200, await getPlayerShopState(account.id, { includeUnlisted: true }));
    }
    if (req.method === "POST" && pathParts[2] === "purchases") {
      const body = await readJson(req);
      const purchase = await purchaseShopProduct(account.id, body.productId, body.requestId);
      return writeJson(res, 200, { purchase, ...(await getPlayerShopState(account.id, { includeUnlisted: true })) });
    }
    return writeJson(res, 404, { error: "商城接口不存在" });
  }

  if (pathParts[1] === "cosmetics" && pathParts[2] === "me" && req.method === "PATCH") {
    const account = requireAccount(res, req);
    if (!account) return;
    if (account.role !== "player" || !account.profileId) {
      return writeJson(res, 403, { error: "当前账号没有玩家身份" });
    }
    const profile = profileForId(account.profileId);
    if (!profile) return writeJson(res, 404, { error: "账号绑定的玩家不存在" });
    const body = await readJson(req);
    const avatarFrame = normalizeAvatarFrame(body.avatarFrame);
    const cardSkin = normalizeCardSkin(body.cardSkin);
    const saved = await saveEquippedCosmetics(account.id, profile.id, { avatarFrame, cardSkin });
    profile.avatarFrame = avatarFrame;
    profile.cardSkin = cardSkin;
    profile.updatedAt = saved.updatedAt;
    playerProfiles.set(profile.id, profile);
    syncProfileToRooms(profile);
    return writeJson(res, 200, {
      account: publicAccount(account),
      player: publicProfile(profile),
      ...(await getPlayerShopState(account.id, { includeUnlisted: true }))
    });
  }

  if (pathParts[1] === "players") {
    if (req.method === "GET" && pathParts.length === 2) {
      return writeJson(res, 200, { players: profilesList() });
    }

    if (req.method === "PUT" && pathParts[2]) {
      const admin = requireAdmin(res, req);
      if (!admin) return;
      const profile = profileForId(pathParts[2]);
      if (!profile) return writeJson(res, 404, { error: "玩家不存在" });
      const body = await readJson(req);
      const name = cleanName(body.name);
      if (!name) return writeJson(res, 400, { error: "请输入玩家名称" });
      if (profileNameTaken(name, profile.id)) return writeJson(res, 409, { error: "这个玩家名称已经存在" });
      profile.name = name;
      if (Object.hasOwn(body, "playEffect")) profile.playEffect = normalizePlayEffect(body.playEffect);
      profile.updatedAt = now();
      playerProfiles.set(profile.id, profile);
      syncProfileToRooms(profile);
      const persistence = await saveStoredPlayerProfile(profile);
      return writeJson(res, 200, {
        player: publicProfile(profile),
        players: profilesList(),
        persistent: persistence.status === "saved"
      });
    }

    return writeJson(res, 404, { error: "接口不存在" });
  }

  if (pathParts[1] === "rooms" && req.method === "GET" && pathParts.length === 2) {
    return writeJson(res, 200, { rooms: joinableRoomsList() });
  }

  if (req.method === "POST" && pathParts[1] === "rooms" && pathParts.length === 2) {
    const body = await readJson(req);
    const selectedProfile = playerProfileFromBody(body, accountForRequest(req));
    if (selectedProfile.error) return writeJson(res, selectedProfile.status, { error: selectedProfile.error });
    const profile = selectedProfile.profile;

    let nextRoomId = roomId();
    while (rooms.has(nextRoomId)) nextRoomId = roomId();

    const host = createPlayer(profile, true);
    const room = {
      id: nextRoomId,
      status: "lobby",
      stage: "lobby",
      phase: "等待玩家加入",
      createdAt: now(),
      startedAt: null,
      gameRecordId: null,
      callMode: CALL_MODE_SCORE,
      openingBidPercent: DEFAULT_OPENING_BID_PERCENT,
      bankerScoreMode: DEFAULT_BANKER_SCORE_MODE,
      hostId: host.id,
      players: [host],
      kitty: [],
      removedCards: [],
      kittySize: 0,
      bankerId: null,
      trumpSuit: null,
      doglegMode: DOGLEG_MODE_TRADITIONAL,
      doglegCard: null,
      doglegPlayerIds: [],
      dynamicDogleg: null,
      hiddenDogleg: null,
      randomOrderDogleg: null,
      doglegNeeded: 0,
      doglegConfigured: false,
      result: null,
      setup: emptySetup(),
      currentTrick: null,
      trickHistory: [],
      settledTrickHistory: [],
      provisionalWinnerPlayerIds: [],
      playPauseUntil: null,
      aiSetupTimer: null,
      aiPlayTimer: null,
      scoreBidTimer: null,
      fryTimer: null,
      gameItemStageTimer: null,
      boardHeroSkillTimer: null,
      notice: null,
      events: [],
      clients: new Set(),
      spectators: new Map(),
      taunts: new Map(),
      tauntTimers: new Map(),
      tauntLastSentAt: new Map(),
      gameItems: emptyGameItems(),
      boardHeroSkills: emptyBoardHeroSkills(),
      boardHeroEffects: emptyBoardHeroEffects(),
      restartCardUsedPlayerIds: [],
      itemUseInFlight: false,
      boardHeroSkillUseInFlight: false,
      snapshotVersion: 0
    };
    rooms.set(room.id, room);
    addEvent(room, `${profile.name} 创建了房间`);
    return writeJson(res, 201, {
      roomId: room.id,
      playerId: host.id,
      token: host.token,
      snapshot: roomSnapshot(room, host)
    });
  }

  if (pathParts[1] === "rooms" && pathParts[2]) {
    const room = getRoom(res, pathParts[2]);
    if (!room) return;

    if (req.method === "GET" && pathParts[3] === "state") {
      const spectatorId = url.searchParams.get("spectatorId");
      const playerId = url.searchParams.get("playerId");
      const token = url.searchParams.get("token");
      if (spectatorId) {
        const spectator = spectatorFor(room, spectatorId, token);
        if (!spectator) return writeJson(res, 401, { error: "观战身份已失效，请重新选择观战玩家" });
        const snapshot = spectatorSnapshot(room, spectator);
        if (!snapshot) return writeJson(res, 404, { error: "被观战玩家已离开房间" });
        return writeJson(res, 200, snapshot);
      }
      const viewer = playerFor(room, playerId, token);
      if (!viewer) return writeJson(res, 401, { error: "玩家身份已失效，请重新加入房间" });
      return writeJson(res, 200, roomSnapshot(room, viewer));
    }

    if (req.method === "POST" && pathParts[3] === "spectate") {
      const body = await readJson(req);
      if (room.status !== "dealt") return writeJson(res, 409, { error: "只有进行中的牌局可以观战" });
      const target = playerById(room, body.targetPlayerId);
      if (!target) return writeJson(res, 404, { error: "要观战的玩家不存在" });
      const spectatorAccount = accountForRequest(req);
      if (accountAuthStatus().configured && !spectatorAccount) {
        return writeJson(res, 401, { error: "请先登录账号再观战" });
      }
      if (spectatorAccount && roomPlayerForAccount(room, spectatorAccount.id)) {
        return writeJson(res, 409, { error: "你已经是本房间玩家，请返回牌桌" });
      }
      const spectatorProfile = spectatorAccount?.profileId ? profileForId(spectatorAccount.profileId) : null;
      clearSpectatorIdentityForAccount(room, spectatorAccount?.id);
      const spectator = {
        id: id(9),
        token: id(18),
        targetPlayerId: target.id,
        accountId: spectatorAccount?.id || null,
        name: spectatorProfile?.name || spectatorAccount?.username || "路人",
        avatarUrl: spectatorProfile?.avatarUrl || "",
        avatarFrame: normalizeAvatarFrame(spectatorProfile?.avatarFrame),
        createdAt: now()
      };
      roomSpectators(room).set(spectator.id, spectator);
      broadcast(room);
      return writeJson(res, 201, {
        roomId: room.id,
        spectatorId: spectator.id,
        token: spectator.token,
        targetPlayerId: target.id,
        snapshot: spectatorSnapshot(room, spectator)
      });
    }

    if (req.method === "POST" && pathParts[3] === "spectate-leave") {
      const body = await readJson(req);
      const spectator = spectatorFor(room, body.spectatorId, body.token);
      if (!spectator) return writeJson(res, 401, { error: "观战身份已失效" });
      disconnectSpectatorClients(room, spectator.id);
      roomSpectators(room).delete(spectator.id);
      broadcast(room);
      return writeJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && pathParts[3] === "join") {
      const body = await readJson(req);
      const joiningAccount = accountForRequest(req);
      const selectedProfile = playerProfileFromBody(body, joiningAccount);
      if (selectedProfile.error) return writeJson(res, selectedProfile.status, { error: selectedProfile.error });
      const profile = selectedProfile.profile;
      const existingPlayer = room.players.find((player) => player.profileId === profile.id) || null;
      if (existingPlayer) {
        if (accountAuthStatus().configured && (!joiningAccount || joiningAccount.profileId !== profile.id)) {
          return writeJson(res, 409, { error: "这个玩家已经在房间里" });
        }
        if (joiningAccount) existingPlayer.accountId = joiningAccount.id;
        const removedSpectators = clearSpectatorIdentityForAccount(room, existingPlayer.accountId);
        if (removedSpectators.length) broadcast(room);
        return writeJson(res, 200, {
          roomId: room.id,
          playerId: existingPlayer.id,
          token: existingPlayer.token,
          reconnected: true,
          snapshot: roomSnapshot(room, existingPlayer)
        });
      }
      if (room.status !== "lobby") return writeJson(res, 409, { error: "牌局已经开始，暂不能加入" });
      if (room.players.length >= MAX_PLAYERS) return writeJson(res, 409, { error: "房间已满" });

      const player = createPlayer(profile, false);
      if (room.stage === "finished") {
        player.nextRoundEntered = true;
        player.ready = true;
      }
      room.players.push(player);
      clearSpectatorIdentityForAccount(room, player.accountId);
      syncLobbyDoglegCount(room);
      addEvent(room, `${profile.name} 加入了房间`);
      finalizeNextRoundLobby(room);
      broadcast(room);
      return writeJson(res, 201, {
        roomId: room.id,
        playerId: player.id,
        token: player.token,
        snapshot: roomSnapshot(room, player)
      });
    }

    if (req.method === "POST" && pathParts[3] === "leave-room") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!canChangeRoomPlayers(room)) {
        return writeJson(res, 409, { error: "牌局进行中暂不能退出房间，可以关闭页面或本机退出身份" });
      }
      const removed = removePlayerFromRoom(room, viewer.id, "你已退出房间");
      if (removed && !rooms.has(room.id)) {
        return writeJson(res, 200, { ok: true, dissolved: true });
      }
      if (removed) addEvent(room, `${removed.name} 退出了房间`);
      broadcast(room);
      return writeJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && pathParts[3] === "dissolve") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以解散房间" });
      dissolveRoom(room, "房主已解散房间");
      return writeJson(res, 200, { ok: true, dissolved: true });
    }

    if (req.method === "POST" && pathParts[3] === "kick") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以踢出玩家" });
      if (!canChangeRoomPlayers(room)) return writeJson(res, 409, { error: "牌局进行中暂不能踢出玩家" });
      const target = playerById(room, body.targetPlayerId);
      if (!target) return writeJson(res, 404, { error: "玩家不存在" });
      if (target.id === viewer.id) return writeJson(res, 400, { error: "不能踢出自己，请使用退出房间" });
      const removed = removePlayerFromRoom(room, target.id, "你已被房主移出房间");
      if (removed && !rooms.has(room.id)) {
        return writeJson(res, 200, { ok: true, dissolved: true });
      }
      if (removed) addEvent(room, `房主将 ${removed.name} 移出了房间`);
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "call-mode") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以设置叫庄方式" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "只有开局前可以设置叫庄方式" });
      if (body.mode !== CALL_MODE_SCORE) return writeJson(res, 400, { error: "当前仅支持叫分抢庄" });
      room.callMode = CALL_MODE_SCORE;
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "opening-bid-percent") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以设置起始叫分" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "只有开局前可以设置起始叫分" });
      const nextPercent = Number(body.percent);
      if (!OPENING_BID_PERCENTAGES.has(nextPercent)) {
        return writeJson(res, 400, { error: "起始叫分比例只能设置为 10%、20%、30% 或 40%" });
      }
      if (room.openingBidPercent !== nextPercent) {
        room.openingBidPercent = nextPercent;
        addEvent(room, `房主将起始叫分设置为总牌分的 ${nextPercent}%`);
      }
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "banker-score-mode") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以设置庄腿积分" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "只有开局前可以切换庄腿积分" });
      if (body.mode !== BANKER_SCORE_MODE_REMAINDER && body.mode !== BANKER_SCORE_MODE_AVERAGE) {
        return writeJson(res, 400, { error: "庄腿积分只支持庄家承余或庄队均摊" });
      }
      if (room.bankerScoreMode !== body.mode) {
        room.bankerScoreMode = body.mode;
        addEvent(room, `房主将庄腿积分设为${bankerScoreModeName(body.mode)}`);
      }
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "doglegs") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以设置狗腿数量" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "只有开局前可以设置狗腿数量" });
      const nextCount = clampDoglegCount(body.count, room.players.length);
      room.doglegNeeded = nextCount;
      room.doglegConfigured = true;
      addEvent(room, `房主将本局狗腿数量设置为 ${nextCount} 个`);
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "dogleg-mode") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以设置狗腿机制" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "只有开局前可以切换狗腿机制" });
      if (body.mode !== DOGLEG_MODE_TRADITIONAL
        && body.mode !== DOGLEG_MODE_DYNAMIC
        && body.mode !== DOGLEG_MODE_HIDDEN
        && body.mode !== DOGLEG_MODE_RANDOM_ORDER) {
        return writeJson(res, 400, { error: "狗腿机制只支持传统狗腿、动态狗腿、暗狗腿或顺位狗腿" });
      }
      room.doglegMode = body.mode;
      addEvent(room, `房主将本局狗腿机制设为${doglegModeName(body.mode)}`);
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "random-seats") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以随机座位" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "只有开局前可以随机座位" });
      if (room.players.length < 2) return writeJson(res, 409, { error: "至少需要 2 名玩家才能随机座位" });

      const previousOrder = room.players.map((player) => player.id);
      const nextOrder = shuffle(room.players);
      if (nextOrder.every((player, index) => player.id === previousOrder[index])) {
        nextOrder.push(nextOrder.shift());
      }
      room.players = nextOrder;
      addEvent(room, "房主重新随机了玩家座位");
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "robot") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以添加机器人" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "牌局已经开始，不能添加机器人" });
      if (room.players.length >= MAX_PLAYERS) return writeJson(res, 409, { error: "房间已满" });
      const nextIndex = room.players.filter((player) => player.test).length + 1;
      const robot = createAiTestPlayer(room, nextIndex);
      room.players.push(robot);
      syncLobbyDoglegCount(room);
      addEvent(room, `房主添加了机器人 ${robot.name}`);
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "test-players") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以添加机器人" });
      if (room.status !== "lobby") return writeJson(res, 409, { error: "牌局已经开始，不能添加机器人" });

      const targetCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(body.targetCount) || MIN_PLAYERS));
      let added = 0;
      while (room.players.length < targetCount) {
        const nextIndex = room.players.filter((player) => player.test).length + 1;
        const player = createAiTestPlayer(room, nextIndex);
        room.players.push(player);
        added += 1;
      }
      syncLobbyDoglegCount(room);
      if (added) addEvent(room, `房主添加了 ${added} 个机器人`);
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "ready") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (room.status !== "lobby") return writeJson(res, 409, { error: "只有等待开局时可以准备" });
      if (room.stage === "finished" && !viewer.nextRoundEntered) {
        return writeJson(res, 409, { error: "请先在结算页点击再来一局" });
      }
      const nextReady = Boolean(body.ready);
      if (viewer.ready !== nextReady) {
        viewer.ready = nextReady;
        addEvent(room, `${viewer.name} ${nextReady ? "已准备" : "取消准备"}`);
      }
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "start") {
      const body = await readJson(req);
      const viewer = playerFor(room, body.playerId, body.token);
      if (!viewer) return writeJson(res, 401, { error: "玩家身份已失效" });
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以开始" });
      if (room.status !== "lobby" || room.stage !== "lobby") {
        return writeJson(res, 409, { error: room.stage === "finished" ? "还有玩家正在查看结算" : "牌局已经开始" });
      }
      if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
        return writeJson(res, 400, { error: `需要 ${MIN_PLAYERS}-${MAX_PLAYERS} 人才能开始` });
      }
      if (!allPlayersReady(room)) {
        return writeJson(res, 409, { error: `还有玩家未准备：${readyPlayerCount(room)}/${room.players.length}` });
      }

      room.restartCardUsedPlayerIds = [];
      await lockBattleHeroesForDeal(room);
      deal(room);
      room.gameRecordId = randomUUID();
      addEvent(room, `房主开始牌局：${room.players.length} 人，每人 ${HAND_SIZE} 张，底牌 ${room.kitty.length} 张`);
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "item-stage-complete") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = completeGameItemStageForPlayer(room, viewer);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "board-hero-skill") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      let result = null;
      if (body.action === "shen-biesan-activate") result = await submitShenBiesanSkillChoice(room, viewer, true, String(body.replacementRank || ""));
      else if (body.action === "shen-biesan-pass") result = await submitShenBiesanSkillChoice(room, viewer, false);
      else if (body.action === "yokoyama-activate") result = await activateYokoyamaSkill(room, viewer, body.requestId);
      else if (body.action === "yokoyama-swap") result = finishYokoyamaChoice(room, viewer, String(body.targetPlayerId || ""));
      else if (body.action === "yokoyama-pass") result = finishYokoyamaChoice(room, viewer);
      else if (body.action === "shen-jiangwen-activate") result = await activateShenJiangwenSkill(room, viewer, body.requestId);
      else return writeJson(res, 400, { error: "未知的英雄技能操作" });
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "bid") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = submitBid(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "bid-pass") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = passBid(room, viewer);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "random-bid") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以随机指定主" });
      const result = randomDeclare(room);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "score-bid") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = submitScoreBid(room, viewer, body.increment);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "score-pass") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = passScoreBid(room, viewer);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "trump") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = selectTrumpSuit(room, viewer, body.suit);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "bury") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = buryCards(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "test-setup") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以推进机器人准备流程" });
      if (room.status !== "dealt" || room.stage === "playing") {
        return writeJson(res, 409, { error: "当前不在准备流程中" });
      }
      clearAiSetupTimer(room);
      const autoActions = autoProgressTestSetup(room, 1);
      if (!autoActions) return writeJson(res, 409, { error: "当前没有可自动推进的机器人" });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "fry") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = submitFry(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "fry-pass") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = passFry(room, viewer);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "dogleg") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = selectDogleg(room, viewer, body.cardIds);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "auto-play") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = setPlayerAutoPlay(room, viewer, body.enabled);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      clearAiPlayTimer(room);
      broadcast(room);
      scheduleNextAiPlay(room);
      return writeJson(res, 200, roomStateAck(room, { autoPlayEnabled: viewer.autoPlayEnabled }));
    }

    if (req.method === "POST" && pathParts[3] === "taunt") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = submitTaunt(room, viewer, body.presetId);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room, { taunt: result.taunt }));
    }

    if (req.method === "POST" && pathParts[3] === "item-use") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = await submitGameItem(room, viewer, body.itemId, body.requestId);
      if (result.error) return writeJson(res, result.status, { error: result.error });
      broadcastAndContinueAutomation(room);
      return writeJson(res, 200, roomStateAck(room, {
        restarted: Boolean(result.restarted),
        itemUse: result.use
      }));
    }

    if (req.method === "POST" && pathParts[3] === "play") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      const result = playCards(room, viewer, body.cardIds, {
        throwPlay: Boolean(body.throwPlay),
        throwComponents: body.throwComponents
      });
      if (result.error) return writeJson(res, result.status, { error: result.error });
      if (result.resumeAt) {
        broadcast(room);
        scheduleFailedThrowResolution(room, viewer, result);
        return writeJson(res, 200, roomStateAck(room));
      }
      broadcast(room);
      scheduleNextAiPlay(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "test-play-round") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以触发机器人出牌" });
      if (room.status !== "dealt" || room.stage !== "playing") return writeJson(res, 409, { error: "还没有进入打牌阶段，不能自动出牌" });

      const nextPlayerId = expectedPlayerId(room);
      if (!nextPlayerId) return writeJson(res, 409, { error: "本轮没有可自动出牌的玩家" });
      const nextPlayer = room.players.find((player) => player.id === nextPlayerId);
      if (!nextPlayer?.test) {
        return writeJson(res, 409, { error: `现在轮到 ${playerName(room, nextPlayerId)}（真人），请由该玩家自己出牌` });
      }

      if (!scheduleNextAiPlay(room)) return writeJson(res, 409, { error: "机器人没有可出的牌" });
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "reset") {
      const body = await readJson(req);
      const viewer = playerFor(room, body.playerId, body.token);
      if (!viewer) return writeJson(res, 401, { error: "玩家身份已失效" });
      if (!viewer.host) return writeJson(res, 403, { error: "只有房主可以重开" });
      if (room.itemUseInFlight || room.boardHeroSkillUseInFlight) {
        return writeJson(res, 409, { error: "本局资源正在结算，请稍后重试" });
      }
      if (room.gameRecordId && (room.gameItems?.uses?.length || room.boardHeroEffects?.uses?.length)) {
        try {
          if (room.gameItems?.uses?.length) await refundGameItemUses(room.gameRecordId);
          if (room.boardHeroEffects?.uses?.length) await refundBoardHeroSkillUses(room.gameRecordId);
        } catch (error) {
          return writeJson(res, error.status || 503, { error: "本局道具或英雄技能资源返还失败，暂不能重置房间" });
        }
      }
      resetRoomToLobby(room);
      addEvent(room, "房主把房间重置到等待状态");
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }

    if (req.method === "POST" && pathParts[3] === "again") {
      const body = await readJson(req);
      const viewer = requirePlayer(res, room, body.playerId, body.token);
      if (!viewer) return;
      if (room.status !== "lobby") {
        return writeJson(res, 409, { error: "本局还未结束，暂不能再来一局" });
      }
      if (room.stage === "finished") {
        viewer.nextRoundEntered = true;
        viewer.ready = true;
        addEvent(room, `${viewer.name} 已进入下一局准备`);
        finalizeNextRoundLobby(room);
      } else if (room.stage === "lobby") {
        viewer.ready = true;
      }
      broadcast(room);
      return writeJson(res, 200, roomStateAck(room));
    }
  }

  writeJson(res, 404, { error: "接口不存在" });
}

function handleEvents(req, res, url) {
  const room = rooms.get(String(url.searchParams.get("roomId") || "").toUpperCase());
  if (!room) {
    res.writeHead(404);
    res.end("room not found");
    return;
  }
  const spectatorId = url.searchParams.get("spectatorId");
  const playerId = url.searchParams.get("playerId");
  const token = url.searchParams.get("token");
  const spectator = spectatorId ? spectatorFor(room, spectatorId, token) : null;
  const viewer = spectator ? playerById(room, spectator.targetPlayerId) : playerFor(room, playerId, token);
  if (!viewer || (spectatorId && !spectator)) {
    res.writeHead(401);
    res.end("unauthorized");
    return;
  }
  const knownVersionText = url.searchParams.get("snapshotVersion");
  const knownVersion = knownVersionText == null ? null : Number(knownVersionText);
  const canResumeFromKnownState = Number.isFinite(knownVersion)
    && knownVersion === Number(room.snapshotVersion || 0);

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.flushHeaders?.();
  const client = {
    res,
    playerId: spectator ? null : viewer.id,
    spectatorId: spectator?.id || null,
    backpressured: false,
    pendingState: false,
    lastSnapshot: canResumeFromKnownState
      ? (spectator ? spectatorSnapshot(room, spectator) : roomSnapshot(room, viewer))
      : null
  };
  room.clients.add(client);
  if (spectator) {
    if (!client.lastSnapshot) sendLatestState(room, client);
  } else if (updateConnection(room, viewer.id, true)) broadcast(room);
  else if (!client.lastSnapshot) sendLatestState(room, client);

  const keepAlive = setInterval(() => {
    if (!client.backpressured) res.write(`event: heartbeat\ndata: ${room.snapshotVersion || 0}\n\n`);
  }, 5_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    room.clients.delete(client);
    if (!spectator && updateConnection(room, viewer.id, false)) broadcast(room);
  });
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = normalize(join(publicDir, pathname));
  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const extension = extname(target).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
  }[extension] || "application/octet-stream";
  const versionedStaticFile = url.searchParams.has("v");
  const cacheControl = extension === ".html"
    ? "no-store"
    : versionedStaticFile
      ? "public, max-age=31536000, immutable"
      : "no-cache";

  try {
    await readFile(target);
    res.writeHead(200, {
      "content-type": type,
      "cache-control": cacheControl
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  try {
    if (url.pathname === "/events") return handleEvents(req, res, url);
    if (pathParts[0] === "api") return await handleApi(req, res, pathParts, url);
    await serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    writeJson(res, status, { error: error.message || "服务器错误" });
  }
});

export const __aiPlayTesting = {
  AI_STRATEGY_FIXED_TEAM,
  AI_STRATEGY_HEURISTIC,
  AI_STRATEGY_MONTE_CARLO,
  AI_STRATEGY_SAFE_FIVE,
  aiDecisionContext,
  aiPublicKnowledge,
  aiSampleHiddenHands,
  aiSafeThrowPlans,
  createDeck,
  expectedPlayerId,
  legalHeuristicAutoPlay,
  legalAutoPlay,
  playCards,
  playSuit
};

const executedFileUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (executedFileUrl === import.meta.url) {
  server.listen(port, () => {
    console.log(`炒地皮在线版已启动：http://localhost:${port}`);
    void initializePersistence().catch((error) => {
      console.error("[persistence] background initialization failed", error.message);
    });
  });
}
