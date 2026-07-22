import { applyStatePatch } from "./state-patch.js?v=9330552c7e1e";
import { detectNewLargePlayEffects } from "./gameplay-effects.js?v=d2368568e06d";
import { ASSET_URLS } from "./asset-versions.js?v=b62e391a838d";

const app = document.querySelector("#app");
document.documentElement.style.setProperty("--joker-face-image", `url("${ASSET_URLS.jokerFace}")`);
document.documentElement.style.setProperty("--joker-face-small-image", `url("${ASSET_URLS.jokerFaceSmall}")`);
Object.entries(ASSET_URLS.avatarFrames).forEach(([key, url]) => {
  document.documentElement.style.setProperty(`--avatar-frame-${key}-image`, `url("${url}")`);
});
Object.entries(ASSET_URLS.cardFrames).forEach(([key, url]) => {
  document.documentElement.style.setProperty(`--card-frame-${key}-image`, `url("${url}")`);
});
Object.entries(ASSET_URLS.staticAvatarFrames).forEach(([key, url]) => {
  document.documentElement.style.setProperty(`--avatar-frame-${key}-static-image`, `url("${url}")`);
});
Object.entries(ASSET_URLS.staticCardFrames).forEach(([key, url]) => {
  document.documentElement.style.setProperty(`--card-frame-${key}-static-image`, `url("${url}")`);
});
const AVATAR_FRAME_OPTIONS = [
  { value: "", label: "默认方框" },
  { value: "vip", label: "经典 VIP" },
  { value: "emerald", label: "翡翠" },
  { value: "violet", label: "紫晶" },
  { value: "champion", label: "冠军" },
  { value: "stormwind", label: "皇家蓝城邦（暴风城主题）" },
  { value: "idol", label: "剧场偶像（AKB48 主题）" },
  { value: "hellfire", label: "暗黑地狱（暗黑主题）" },
  { value: "blood-elf", label: "血精灵奥术" },
  { value: "endless-winter", label: "无尽冬日（冰雪熔炉）" },
  { value: "cr7", label: "7号传奇（C罗主题）" },
  { value: "paladin", label: "圣光骑士（魔兽圣骑士主题）" },
  { value: "vip-legend", label: "至尊星耀 VIP（动态）" }
];
const CARD_SKIN_OPTIONS = [
  { value: "", label: "默认牌框" },
  { value: "emerald", label: "翡翠" },
  { value: "violet", label: "紫晶" },
  { value: "champion", label: "冠军" },
  { value: "stormwind", label: "皇家蓝城邦（暴风城主题）" },
  { value: "idol", label: "剧场偶像（AKB48 主题）" },
  { value: "hellfire", label: "暗黑地狱（暗黑主题）" },
  { value: "blood-elf", label: "血精灵奥术" },
  { value: "endless-winter", label: "无尽冬日（冰雪熔炉）" },
  { value: "cr7", label: "7号传奇（C罗主题）" },
  { value: "paladin", label: "圣光骑士（魔兽圣骑士主题）" },
  { value: "vip-legend", label: "至尊星耀 VIP（动态）" }
];
const AVATAR_FRAME_VALUES = new Set(AVATAR_FRAME_OPTIONS.map((option) => option.value));
const CARD_SKIN_VALUES = new Set(CARD_SKIN_OPTIONS.map((option) => option.value));
const storageKey = "chaoDipiOnlineSession";
let session = loadSession();
let source = null;
let stateSyncTimer = null;
let stateWatchdogTimer = null;
let stateSyncInFlight = false;
let lastEventReceivedAt = 0;
let state = null;
let message = "";
let messageBad = false;
let selectedCardIds = new Set();
let throwDraftComponents = null;
let dragSelect = null;
let suppressCardClickUntil = 0;
let activeDialog = null;
let dismissedActionDialogKey = null;
let dismissedResultRoomId = null;
let messageTimer = null;
let actionDialogResumeTimer = null;
let actionPassInFlight = false;
let actionDialogTemporarilyBlocked = false;
let buryInFlight = false;
let scoreBidAutoPassTimer = null;
let throwRevealTimer = null;
let gameplayEffectTimer = null;
let doglegRevealEffects = [];
let draggedFiveEffect = null;
let largePlayEffects = [];
let lastMutatingActionAt = 0;
let homeView = "rooms";
let profiles = [];
let profilesLoaded = false;
let profilesLoading = false;
let playerStatistics = new Map();
let playerStatisticsRows = [];
let playerStatisticsLoaded = false;
let playerStatisticsLoading = false;
let historyStatus = null;
let statisticsSortKey = "total_score";
let statisticsSortDirection = "desc";
let statisticsSelectedAccountId = "";
let statisticsPlayerDetailLoadingId = "";
const statisticsPlayerDetails = new Map();
let joinableRooms = [];
let joinableRoomsLoaded = false;
let joinableRoomsLoading = false;
let authState = {
  loaded: false,
  loading: false,
  configured: false,
  initialized: false,
  bootstrapRequired: false,
  account: null
};
let adminData = null;
let adminDataLoading = false;
let homeJoinOpen = Boolean(roomFromUrl());
const stateVersionWaiters = new Set();
const dragSelectThreshold = 8;

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || null;
  } catch {
    return null;
  }
}

function saveSession(next) {
  session = next;
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function clearSession() {
  session = null;
  localStorage.removeItem(storageKey);
  if (source) source.close();
  if (scoreBidAutoPassTimer) window.clearTimeout(scoreBidAutoPassTimer);
  if (throwRevealTimer) window.clearTimeout(throwRevealTimer);
  if (gameplayEffectTimer) window.clearTimeout(gameplayEffectTimer);
  if (stateSyncTimer) window.clearTimeout(stateSyncTimer);
  if (stateWatchdogTimer) window.clearInterval(stateWatchdogTimer);
  if (actionDialogResumeTimer) window.clearTimeout(actionDialogResumeTimer);
  scoreBidAutoPassTimer = null;
  throwRevealTimer = null;
  gameplayEffectTimer = null;
  doglegRevealEffects = [];
  draggedFiveEffect = null;
  largePlayEffects = [];
  stateSyncTimer = null;
  stateWatchdogTimer = null;
  actionDialogResumeTimer = null;
  actionPassInFlight = false;
  actionDialogTemporarilyBlocked = false;
  buryInFlight = false;
  stateSyncInFlight = false;
  lastEventReceivedAt = 0;
  source = null;
  state = null;
  for (const waiter of stateVersionWaiters) {
    window.clearTimeout(waiter.timer);
    waiter.resolve(false);
  }
  stateVersionWaiters.clear();
  throwDraftComponents = null;
  render();
}

function isSpectating() {
  return Boolean(session?.spectator || state?.spectator);
}

function setMessage(text, bad = false, autoDismiss = true) {
  if (messageTimer) window.clearTimeout(messageTimer);
  message = text;
  messageBad = bad;
  render();
  if (text && autoDismiss) {
    messageTimer = window.setTimeout(() => {
      if (message === text) {
        message = "";
        render();
      }
    }, 3000);
  }
}

function shouldHighlightNewKitty(nextState) {
  const viewerId = nextState?.viewer?.id;
  if (!viewerId) return false;
  if (nextState.stage === "burying") return nextState.setup?.bankerId === viewerId;
  if (nextState.stage === "fry-burying") return nextState.setup?.fry?.currentPlayerId === viewerId;
  return false;
}

function applyState(nextState, options = {}) {
  const previousState = state;
  const sameRoom = previousState?.roomId && previousState.roomId === nextState?.roomId;
  const previousVersion = Number(previousState?.snapshotVersion || 0);
  const nextVersion = Number(nextState?.snapshotVersion || 0);
  if (sameRoom && previousVersion && nextVersion && nextVersion < previousVersion) return false;
  captureGameplayEffects(previousState, nextState);
  const previousHandIds = new Set((state?.hand || []).map((card) => card.id));
  state = nextState;
  resolveStateVersionWaiters();
  syncThrowDraftForState();
  scheduleThrowReveal(previousState);
  if (previousState?.roomId !== nextState.roomId || nextState.stage !== "finished") {
    dismissedResultRoomId = null;
  }
  if (previousState?.stage !== "finished" && nextState.stage === "finished") {
    dismissedResultRoomId = null;
  }
  if (previousState?.stage === "finished" && nextState.stage === "lobby") {
    activeDialog = null;
    dismissedResultRoomId = null;
    selectedCardIds = new Set();
    throwDraftComponents = null;
  }
  const roomNotice = nextState.notice?.id && nextState.notice.id !== previousState?.notice?.id
    ? nextState.notice
    : null;
  const throwNotice = throwFailureTransitionNotice(previousState, nextState);
  const notice = transitionNotice(previousState, nextState);
  if (roomNotice && options.showTransitionNotice !== false) setMessage(roomNotice.text, Boolean(roomNotice.bad), true);
  else if (throwNotice && options.showTransitionNotice !== false) setMessage(throwNotice, true, true);
  else if (notice && options.showTransitionNotice !== false) setMessage(notice);
  scheduleScoreBidAutoPass();
  if (options.highlightNewKitty === false || !shouldHighlightNewKitty(nextState)) return false;
  const newCardIds = (nextState.hand || [])
    .filter((card) => !previousHandIds.has(card.id))
    .map((card) => card.id);
  if (!newCardIds.length) return false;
  selectedCardIds = new Set(newCardIds);
  return true;
}

function resolveStateVersionWaiters() {
  const currentVersion = Number(state?.snapshotVersion || 0);
  for (const waiter of stateVersionWaiters) {
    if (currentVersion < waiter.version) continue;
    window.clearTimeout(waiter.timer);
    stateVersionWaiters.delete(waiter);
    waiter.resolve(true);
  }
}

function waitForStateVersion(version, timeoutMs = 1500) {
  const targetVersion = Number(version || 0);
  if (!targetVersion || Number(state?.snapshotVersion || 0) >= targetVersion) return Promise.resolve(true);
  return new Promise((resolve) => {
    const waiter = { version: targetVersion, resolve, timer: null };
    waiter.timer = window.setTimeout(() => {
      stateVersionWaiters.delete(waiter);
      resolve(false);
    }, timeoutMs);
    stateVersionWaiters.add(waiter);
  });
}

function snapshotTricks(snapshot) {
  if (!snapshot) return [];
  return [...(snapshot.trickHistory || []), ...(snapshot.currentTrick ? [snapshot.currentTrick] : [])];
}

function findPlayedCard(snapshot, playerId, matcher) {
  const tricks = snapshotTricks(snapshot);
  for (let trickIndex = tricks.length - 1; trickIndex >= 0; trickIndex -= 1) {
    const play = (tricks[trickIndex].plays || []).find((item) => item.playerId === playerId && item.played);
    const card = play?.cards?.find(matcher);
    if (card) return card;
  }
  return null;
}

function captureGameplayEffects(previousState, nextState) {
  const nowMs = Date.now();
  doglegRevealEffects = doglegRevealEffects.filter((effect) => effect.until > nowMs);
  largePlayEffects = largePlayEffects.filter((effect) => effect.until > nowMs);

  if (previousState?.roomId === nextState?.roomId) {
    const activeKeys = new Set(largePlayEffects.map((effect) => effect.key));
    largePlayEffects.push(...detectNewLargePlayEffects(previousState, nextState, nowMs)
      .filter((effect) => !activeKeys.has(effect.key)));

    const previousDoglegs = new Set(previousState.setup?.doglegPlayerIds || []);
    const doglegCard = nextState.setup?.doglegCard;
    (nextState.setup?.doglegPlayerIds || [])
      .filter((playerId) => !previousDoglegs.has(playerId))
      .forEach((playerId) => {
        const card = findPlayedCard(nextState, playerId, (item) =>
          item.type === doglegCard?.type && item.suit === doglegCard?.suit && item.rank === doglegCard?.rank
        );
        doglegRevealEffects.push({ playerId, cardId: card?.id || null, until: nowMs + 900 });
      });

    if (draggedFiveEffect) {
      const currentTrick = nextState.currentTrick;
      const nextRoundStarted = currentTrick
        && currentTrick.number !== draggedFiveEffect.trickNumber
        && (currentTrick.plays || []).some((play) => play.played && play.cards?.length);
      if (nextRoundStarted || nextState.status === "lobby") draggedFiveEffect = null;
    }

    const previousCompleted = new Set((previousState.trickHistory || []).map((trick) => trick.number));
    const newlyCompleted = (nextState.trickHistory || []).filter((trick) => !previousCompleted.has(trick.number));
    const completed = newlyCompleted[newlyCompleted.length - 1];
    if (completed) {
      const entries = (completed.plays || []).flatMap((play) => {
        if (!play.played || play.playerId === completed.winnerId) return [];
        return (play.cards || [])
          .filter((card) => card.type === "normal" && card.rank === "5" && (card.suit === "H" || card.suit === "D"))
          .map((card) => ({ playerId: play.playerId, cardId: card.id, suit: card.suit }));
      });
      if (entries.length) {
        draggedFiveEffect = { trickNumber: completed.number, entries, animateUntil: nowMs + 900 };
      }
    }
  } else {
    doglegRevealEffects = [];
    draggedFiveEffect = null;
    largePlayEffects = [];
  }
  scheduleGameplayEffectEnd();
}

function scheduleGameplayEffectEnd() {
  if (gameplayEffectTimer) window.clearTimeout(gameplayEffectTimer);
  gameplayEffectTimer = null;
  const nowMs = Date.now();
  const expirations = doglegRevealEffects.map((effect) => effect.until);
  if (draggedFiveEffect?.animateUntil > nowMs) expirations.push(draggedFiveEffect.animateUntil);
  expirations.push(...largePlayEffects.map((effect) => effect.until));
  const nextExpiration = expirations.filter((value) => value > nowMs).sort((a, b) => a - b)[0];
  if (!nextExpiration) return;
  gameplayEffectTimer = window.setTimeout(() => {
    gameplayEffectTimer = null;
    const currentTime = Date.now();
    doglegRevealEffects = doglegRevealEffects.filter((effect) => effect.until > currentTime);
    largePlayEffects = largePlayEffects.filter((effect) => effect.until > currentTime);
    if (draggedFiveEffect?.animateUntil <= currentTime) draggedFiveEffect.animateUntil = 0;
    render();
    scheduleGameplayEffectEnd();
  }, Math.max(0, nextExpiration - nowMs) + 20);
}

function transitionNotice(previousState, nextState) {
  if (!previousState || !nextState || previousState.roomId !== nextState.roomId) return "";
  const previousDoglegs = new Set(previousState.setup?.doglegPlayerIds || []);
  const newDoglegIds = (nextState.setup?.doglegPlayerIds || []).filter((playerId) => !previousDoglegs.has(playerId));
  if (newDoglegIds.length) {
    const names = newDoglegIds
      .map((playerId) => nextState.players?.find((player) => player.id === playerId)?.name)
      .filter(Boolean);
    if (names.length) return `${names.join("、")} 打出狗腿牌，成为狗腿。`;
  }
  const draggedNotices = [];
  (nextState.players || []).forEach((player) => {
    const previous = previousState.players?.find((item) => item.id === player.id);
    if (!previous) return;
    const redDelta = (player.draggedRedFives || 0) - (previous.draggedRedFives || 0);
    const diamondDelta = (player.draggedDiamondFives || 0) - (previous.draggedDiamondFives || 0);
    if (redDelta > 0) draggedNotices.push(`${player.name} 被拖红五 ${redDelta} 张`);
    if (diamondDelta > 0) draggedNotices.push(`${player.name} 被拖方五 ${diamondDelta} 张`);
  });
  if (draggedNotices.length) return draggedNotices.join("，");
  if (previousState.stage === nextState.stage) return "";
  if (previousState.stage === "bidding" && nextState.stage === "burying") {
    return `叫主成功：${nextState.setup?.bankerName || "庄家"} 成为庄家，已拿底等待贴底。`;
  }
  if (previousState.stage === "score-bidding" && nextState.stage === "trump-selecting") {
    const score = nextState.setup?.scoreBid?.currentScore || "";
    return `叫分结束：${nextState.setup?.bankerName || "庄家"} ${score ? `以 ${score} 分` : ""}成为庄家，等待亮2定主。`;
  }
  if (previousState.stage === "trump-selecting" && nextState.stage === "burying") {
    return `定主成功：${nextState.setup?.bankerName || "庄家"} 已拿底等待贴底。`;
  }
  if ((previousState.stage === "frying" || previousState.stage === "fry-burying") && nextState.stage === "dogleg") {
    const trump = nextState.setup?.currentTrumpSuitName || nextState.setup?.trumpSuitName || "随机花色";
    return `炒底结束：主牌确定为${trump}，等待庄家选择狗腿牌。`;
  }
  if (previousState.stage === "dogleg" && nextState.stage === "playing") {
    const trump = nextState.setup?.currentTrumpSuitName || nextState.setup?.trumpSuitName || "主牌";
    return `开始出牌：主牌为${trump}。`;
  }
  if (previousState.stage === "playing" && nextState.stage === "finished") {
    const result = nextState.result || {};
    return `本局结束：${result.winnerTeamName || "胜方"}牌局获胜；积分结算为闲家每人 ${signedScore(result.idleEachScoreText, result.idleEachScore)} 分，庄队每人 ${signedScore(result.bankerEachScoreText, result.bankerEachScore)} 分。`;
  }
  return "";
}

function throwFailureEntries() {
  if (!state) return [];
  const tricks = [...(state.trickHistory || [])];
  if (state.currentTrick && !tricks.some((trick) => trick.number === state.currentTrick.number)) {
    tricks.push(state.currentTrick);
  }
  return tricks.flatMap((trick) => (trick.plays || [])
    .filter((play) => play.throwFailed && play.throwRevealUntil)
    .map((play) => ({
      trickNumber: trick.number,
      play,
      revealAt: new Date(play.throwRevealUntil).getTime()
    })))
    .filter((entry) => Number.isFinite(entry.revealAt));
}

function isThrowAttemptVisible(play) {
  if (play?.throwDisplayPhase) return play.throwDisplayPhase === "attempt";
  return Boolean(
    play?.throwFailed &&
    play.throwAttemptCards?.length &&
    play.throwRevealUntil &&
    Date.now() < new Date(play.throwRevealUntil).getTime()
  );
}

function displayedPlayCards(play) {
  return isThrowAttemptVisible(play) ? play.throwAttemptCards : (play.cards || []);
}

function snapshotPlays(snapshot) {
  if (!snapshot) return [];
  const tricks = [...(snapshot.trickHistory || [])];
  if (snapshot.currentTrick && !tricks.some((trick) => trick.number === snapshot.currentTrick.number)) {
    tricks.push(snapshot.currentTrick);
  }
  return tricks.flatMap((trick) => (trick.plays || []).map((play) => ({ trickNumber: trick.number, play })));
}

function throwFailureTransitionNotice(previousState, nextState) {
  if (!previousState || previousState.roomId !== nextState?.roomId) return "";
  const previousPhases = new Map(snapshotPlays(previousState).map(({ trickNumber, play }) => [
    `${trickNumber}:${play.playerId}:${play.at || ""}`,
    play.throwDisplayPhase || ""
  ]));
  const revealed = snapshotPlays(nextState).find(({ trickNumber, play }) =>
    play.throwFailed &&
    play.throwDisplayPhase === "failed" &&
    previousPhases.get(`${trickNumber}:${play.playerId}:${play.at || ""}`) === "attempt"
  );
  return revealed ? `${revealed.play.playerName} 甩牌失败，已自动改出被压过的牌型。` : "";
}

function scheduleThrowReveal() {
  if (throwRevealTimer) window.clearTimeout(throwRevealTimer);
  throwRevealTimer = null;
  const entries = throwFailureEntries();
  const nowMs = Date.now();
  const nextEntry = entries
    .filter((entry) => entry.revealAt > nowMs)
    .sort((a, b) => a.revealAt - b.revealAt)[0];
  if (!nextEntry) return;
  throwRevealTimer = window.setTimeout(() => {
    throwRevealTimer = null;
    render();
  }, Math.max(0, nextEntry.revealAt - nowMs) + 30);
}

function hasCompleteKittySelection() {
  if (!shouldHighlightNewKitty(state)) return false;
  if (selectedCardIds.size !== state.kittySize) return false;
  const handIds = new Set((state.hand || []).map((card) => card.id));
  return [...selectedCardIds].every((cardId) => handIds.has(cardId));
}

function clearSelectionUnlessKitty(highlighted) {
  if (!highlighted && !hasCompleteKittySelection()) selectedCardIds = new Set();
}

function roomFromUrl() {
  const params = new URLSearchParams(location.search);
  return (params.get("room") || "").toUpperCase();
}

function shareUrl(roomId) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", roomId);
  return url.toString();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "请求失败");
    error.data = data;
    error.status = res.status;
    throw error;
  }
  return data;
}

function ensureAuth(force = false) {
  if (!force && (authState.loaded || authState.loading)) return;
  authState.loading = true;
  api("/api/auth/status")
    .then((data) => {
      authState = { ...data, loaded: true, loading: false };
      render();
    })
    .catch((error) => {
      authState = { ...authState, loaded: true, loading: false };
      setMessage(error.message || "账号状态加载失败", true);
    });
}

async function refreshAuth() {
  const data = await api("/api/auth/status");
  authState = { ...data, loaded: true, loading: false };
  return authState;
}

function ensureAdminData(force = false) {
  if (authState.account?.role !== "admin" || adminDataLoading || (!force && adminData)) return;
  adminDataLoading = true;
  api("/api/admin/accounts")
    .then((data) => {
      adminData = data;
      profiles = data.profiles || profiles;
      profilesLoaded = true;
      adminDataLoading = false;
      render();
    })
    .catch((error) => {
      adminDataLoading = false;
      setMessage(error.message || "管理员数据加载失败", true);
    });
}

async function loginAccount(event) {
  event.preventDefault();
  const form = new FormData(event.target.closest("form"));
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") })
    });
    authState.account = data.account;
    authState.loaded = true;
    homeView = data.account?.role === "admin" ? "admin" : "rooms";
    adminData = null;
    setMessage(`已登录：${data.account?.profile?.name || data.account?.username || "账号"}`);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function logoutAccount() {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Local account state can still be cleared if the service restarts.
  }
  authState.account = null;
  adminData = null;
  homeView = "rooms";
  setMessage("已退出账号。", false);
  render();
}

async function changeAccountPassword(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const form = new FormData(formEl);
  if (form.get("newPassword") !== form.get("confirmPassword")) return setMessage("两次输入的新密码不一致", true);
  try {
    await api("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") })
    });
    formEl.reset();
    setMessage("密码已修改。", false);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function imageElementForFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取头像图片"));
    };
    image.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("头像处理失败"));
    reader.readAsDataURL(blob);
  });
}

async function prepareAvatarDataUrl(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("请选择图片文件");
  if (file.size > 10 * 1024 * 1024) throw new Error("原始图片不能超过 10MB");
  const image = await imageElementForFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d", { alpha: false });
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - side) / 2;
  const sourceY = (image.naturalHeight - side) / 2;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 256, 256);
  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, 256, 256);
  let blob = await canvasBlob(canvas, "image/webp", 0.82);
  if (!blob || blob.size > 280_000) blob = await canvasBlob(canvas, "image/jpeg", 0.76);
  if (!blob || blob.size > 280_000) blob = await canvasBlob(canvas, "image/jpeg", 0.58);
  if (!blob || blob.size > 300_000) throw new Error("头像压缩后仍然过大，请换一张图片");
  return blobDataUrl(blob);
}

async function uploadOwnAvatar(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const file = new FormData(formEl).get("avatar");
  if (!(file instanceof File) || !file.size) return setMessage("请选择新头像", true);
  try {
    const avatarDataUrl = await prepareAvatarDataUrl(file);
    const data = await api("/api/auth/avatar", {
      method: "POST",
      body: JSON.stringify({ avatarDataUrl })
    });
    authState.account = data.account;
    profiles = profiles.map((profile) => profile.id === data.player.id ? data.player : profile);
    formEl.reset();
    setMessage("头像已更新，7 天后可以再次更换。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function createManagedAccount(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const form = new FormData(formEl);
  try {
    const data = await api("/api/admin/accounts", {
      method: "POST",
      body: JSON.stringify({
        displayName: form.get("displayName"),
        username: form.get("username"),
        password: form.get("password")
      })
    });
    adminData = data;
    profiles = data.profiles || profiles;
    formEl.reset();
    setMessage("玩家账号已创建。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function toggleManagedAccount(accountId, enabled) {
  try {
    adminData = await api(`/api/admin/accounts/${encodeURIComponent(accountId)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled })
    });
    setMessage(enabled ? "账号已启用。" : "账号已停用。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function resetManagedPassword(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const accountId = formEl.dataset.accountId;
  const password = new FormData(formEl).get("password");
  try {
    await api(`/api/admin/accounts/${encodeURIComponent(accountId)}/password`, {
      method: "POST",
      body: JSON.stringify({ password })
    });
    formEl.reset();
    setMessage("密码已重置。", false);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function roomAction(path, options = {}) {
  const activeSession = session ? { ...session } : null;
  const response = await api(path, options);
  if (response?.roomId) {
    applyState(response);
    render();
    return state;
  }
  const targetVersion = Number(response?.snapshotVersion || 0);
  if (!targetVersion || await waitForStateVersion(targetVersion)) return state;
  if (!sameSessionIdentity(session, activeSession)) return state;
  const nextState = await api(stateUrl(activeSession));
  if (!sameSessionIdentity(session, activeSession)) return state;
  applyState(nextState, { showTransitionNotice: false });
  render();
  return state;
}

function ensureProfiles() {
  if (profilesLoaded || profilesLoading) return;
  profilesLoading = true;
  api("/api/players")
    .then((data) => {
      profiles = data.players || [];
      profilesLoaded = true;
      profilesLoading = false;
      render();
    })
    .catch((error) => {
      profilesLoading = false;
      setMessage(error.message || "玩家列表加载失败", true);
    });
}

function ensurePlayerStatistics() {
  if (playerStatisticsLoaded || playerStatisticsLoading) return;
  playerStatisticsLoading = true;
  Promise.all([
    api("/api/history/statistics"),
    api("/api/history/status").catch(() => null)
  ])
    .then(([data, status]) => {
      playerStatisticsRows = data.players || [];
      playerStatistics = new Map(playerStatisticsRows.map((row) => [row.profile_id, {
        games: Number(row.games_played) || 0,
        score: Number(row.total_score) || 0
      }]));
      historyStatus = status;
      playerStatisticsLoaded = true;
      playerStatisticsLoading = false;
      render();
    })
    .catch(() => {
      playerStatisticsLoaded = true;
      playerStatisticsLoading = false;
      render();
    });
}

function ensureJoinableRooms(force = false) {
  if (!force && (joinableRoomsLoaded || joinableRoomsLoading)) return;
  joinableRoomsLoading = true;
  api("/api/rooms")
    .then((data) => {
      joinableRooms = data.rooms || [];
      joinableRoomsLoaded = true;
      joinableRoomsLoading = false;
      render();
    })
    .catch((error) => {
      joinableRoomsLoading = false;
      setMessage(error.message || "可加入房间加载失败", true);
    });
}

function refreshJoinableRooms() {
  ensureJoinableRooms(true);
}

function connectEvents() {
  if (!session || source) return;
  const params = new URLSearchParams({
    roomId: session.roomId,
    token: session.token
  });
  if (session.spectator) params.set("spectatorId", session.spectatorId);
  else params.set("playerId", session.playerId);
  if (state?.roomId === session.roomId) params.set("snapshotVersion", String(state.snapshotVersion || 0));
  source = new EventSource(`/events?${params.toString()}`);
  source.addEventListener("open", () => {
    lastEventReceivedAt = Date.now();
  });
  source.addEventListener("state", (event) => {
    try {
      lastEventReceivedAt = Date.now();
      applyState(JSON.parse(event.data));
      render();
    } catch {
      scheduleStateSync(0);
    }
  });
  source.addEventListener("patch", (event) => {
    try {
      lastEventReceivedAt = Date.now();
      const nextState = applyStatePatch(state, JSON.parse(event.data));
      if (!nextState) return scheduleStateSync(0);
      applyState(nextState);
      render();
    } catch {
      scheduleStateSync(0);
    }
  });
  source.addEventListener("heartbeat", (event) => {
    lastEventReceivedAt = Date.now();
    const remoteVersion = Number(event.data || 0);
    const localVersion = Number(state?.snapshotVersion || 0);
    if (remoteVersion > localVersion) scheduleStateSync(0);
  });
  source.addEventListener("kicked", (event) => {
    const data = JSON.parse(event.data || "{}");
    clearSession();
    setMessage(data.message || "你已离开房间。", true);
  });
  source.onerror = () => {
    scheduleStateSync(700);
    if (source?.readyState === EventSource.CLOSED) {
      source.close();
      source = null;
      window.setTimeout(connectEvents, 1200);
    }
  };
  startStateWatchdog();
}

function stateUrl(activeSession = session) {
  if (!activeSession) return "";
  const params = new URLSearchParams({ token: activeSession.token });
  if (activeSession.spectator) params.set("spectatorId", activeSession.spectatorId);
  else params.set("playerId", activeSession.playerId);
  return `/api/rooms/${activeSession.roomId}/state?${params.toString()}`;
}

function sameSessionIdentity(left, right) {
  if (!left || !right || left.roomId !== right.roomId || Boolean(left.spectator) !== Boolean(right.spectator)) return false;
  return left.spectator ? left.spectatorId === right.spectatorId : left.playerId === right.playerId;
}

async function syncRoomState({ showError = false } = {}) {
  if (!session || stateSyncInFlight) return;
  const activeSession = { ...session };
  stateSyncInFlight = true;
  try {
    const nextState = await api(stateUrl(activeSession));
    if (!sameSessionIdentity(session, activeSession)) return;
    applyState(nextState, { showTransitionNotice: false });
    render();
  } catch (error) {
    if (showError) setMessage(error.message || "房间状态同步失败", true);
  } finally {
    stateSyncInFlight = false;
  }
}

function scheduleStateSync(delay = 0) {
  if (!session) return;
  if (stateSyncTimer) window.clearTimeout(stateSyncTimer);
  stateSyncTimer = window.setTimeout(() => {
    stateSyncTimer = null;
    syncRoomState();
  }, Math.max(0, delay));
}

function startStateWatchdog() {
  if (stateWatchdogTimer) return;
  stateWatchdogTimer = window.setInterval(() => {
    if (!session || document.hidden) return;
    const eventAge = Date.now() - lastEventReceivedAt;
    if (!lastEventReceivedAt || eventAge > 7_000) scheduleStateSync(0);
  }, 2_000);
}

async function createRoom(event) {
  event?.preventDefault();
  if (!requirePlayerLogin()) return;
  try {
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({})
    });
    saveSession({ roomId: data.roomId, playerId: data.playerId, token: data.token });
    history.replaceState(null, "", `?room=${data.roomId}`);
    applyState(data.snapshot, { highlightNewKitty: false });
    message = "";
    connectEvents();
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function joinRoom(event) {
  event?.preventDefault();
  const formEl = event?.target.closest("form");
  const form = formEl ? new FormData(formEl) : null;
  const roomId = String(form?.get("roomId") || "").trim().toUpperCase();
  if (!requirePlayerLogin()) return;
  await joinRoomById(roomId);
}

function requirePlayerLogin() {
  if (authState.account?.role === "player" && authState.account.profile) return true;
  homeJoinOpen = false;
  homeView = "login";
  setMessage(authState.account?.role === "admin" ? "管理员账号不能加入牌局" : "请先登录玩家账号", true);
  return false;
}

async function joinRoomById(roomId) {
  const normalizedRoomId = String(roomId || "").trim().toUpperCase();
  if (!normalizedRoomId) return setMessage("请输入房间号", true);
  if (!requirePlayerLogin()) return;
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(normalizedRoomId)}/join`, {
      method: "POST",
      body: JSON.stringify({})
    });
    saveSession({ roomId: data.roomId, playerId: data.playerId, token: data.token });
    history.replaceState(null, "", `?room=${data.roomId}`);
    applyState(data.snapshot, { highlightNewKitty: false });
    message = "";
    connectEvents();
    homeJoinOpen = false;
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function spectatePlayer(roomId, targetPlayerId) {
  if (!authState.account) {
    homeView = "login";
    setMessage("请先登录账号再观战", true);
    return;
  }
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(roomId)}/spectate`, {
      method: "POST",
      body: JSON.stringify({ targetPlayerId })
    });
    saveSession({
      roomId: data.roomId,
      spectator: true,
      spectatorId: data.spectatorId,
      targetPlayerId: data.targetPlayerId,
      token: data.token
    });
    history.replaceState(null, "", `?room=${data.roomId}`);
    applyState(data.snapshot, { highlightNewKitty: false });
    message = "";
    connectEvents();
    render();
  } catch (error) {
    setMessage(error.message || "无法进入观战", true);
  }
}

async function leaveSpectating() {
  if (!session?.spectator) return clearSession();
  const activeSession = { ...session };
  try {
    await api(`/api/rooms/${activeSession.roomId}/spectate-leave`, {
      method: "POST",
      body: JSON.stringify({ spectatorId: activeSession.spectatorId, token: activeSession.token })
    });
  } catch {
    // The local spectator session can always be discarded, even if the room already ended.
  }
  clearSession();
  history.replaceState(null, "", location.pathname);
  setMessage("已退出观战。");
}

async function updateProfile(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const profileId = formEl?.dataset.profileId;
  const form = new FormData(formEl);
  try {
    await api(`/api/players/${encodeURIComponent(profileId)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: form.get("name"),
        avatarFrame: form.get("avatarFrame"),
        cardSkin: form.get("cardSkin"),
        playEffect: form.get("playEffect")
      })
    });
    const avatarFile = form.get("avatar");
    if (avatarFile instanceof File && avatarFile.size) {
      const avatarDataUrl = await prepareAvatarDataUrl(avatarFile);
      await api(`/api/admin/profiles/${encodeURIComponent(profileId)}/avatar`, {
        method: "POST",
        body: JSON.stringify({ avatarDataUrl })
      });
    }
    adminData = await api("/api/admin/accounts");
    profiles = adminData.profiles || [];
    profilesLoaded = true;
    setMessage("玩家资料已保存。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function startGame() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    setMessage("已发牌。每个玩家现在只会看到自己的手牌。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function addRobot() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/robot`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    setMessage("已添加 1 个机器人。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function randomizeSeats() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/random-seats`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    setMessage("玩家座位已重新随机。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function setDoglegCount(count) {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/doglegs`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, count })
    });
    setMessage(`本局狗腿数量已设为 ${state.setup?.doglegNeeded ?? count} 个。`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function bidSelectedCards() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/bid`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    });
    clearSelectionUnlessKitty(false);
    activeDialog = null;
    setMessage(state.stage === "burying"
      ? `叫主成功：${state.setup?.bankerName || "庄家"} 成为庄家，已拿底等待贴底。`
      : "已亮 2 叫/抢主。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function passBid() {
  if (!session || actionPassInFlight) return;
  actionPassInFlight = true;
  actionDialogTemporarilyBlocked = true;
  activeDialog = null;
  setMessage("正在提交“过”…", false, false);
  try {
    await roomAction(`/api/rooms/${session.roomId}/bid-pass`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    clearSelectionUnlessKitty(false);
    actionPassInFlight = false;
    temporarilyDismissActionDialog();
    setMessage(state.stage === "burying"
      ? `叫主成功：${state.setup?.bankerName || "庄家"} 成为庄家，已拿底等待贴底。`
      : viewerCanBid()
        ? "已过，其他玩家操作后再次轮到你。"
        : "已过，等待其他玩家操作。");
  } catch (error) {
    actionPassInFlight = false;
    actionDialogTemporarilyBlocked = false;
    activeDialog = viewerCanBid() ? "bid" : null;
    setMessage(error.message, true);
  }
}

async function randomBid() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/random-bid`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    clearSelectionUnlessKitty(false);
    activeDialog = null;
    setMessage(state.stage === "burying"
      ? `叫主成功：${state.setup?.bankerName || "庄家"} 成为庄家，已拿底等待贴底。`
      : "已随机指定主。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function setCallMode(mode) {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/call-mode`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, mode })
    });
    setMessage(`已切换为${state.callModeName || "新的叫庄方式"}。`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function scoreBid(increment = 0) {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/score-bid`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, increment })
    });
    clearSelectionUnlessKitty(false);
    setMessage(state.stage === "trump-selecting"
      ? `叫分结束：${state.setup?.bankerName || "庄家"} 成为庄家，等待亮2定主。`
      : "已提交叫分。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function passScoreBid() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/score-pass`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    clearSelectionUnlessKitty(false);
    setMessage(state.stage === "trump-selecting"
      ? `叫分结束：${state.setup?.bankerName || "庄家"} 成为庄家，等待亮2定主。`
      : "已过，不加分。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function revealTrumpSelectedCards() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/trump`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    });
    clearSelectionUnlessKitty(false);
    activeDialog = null;
    setMessage(`定主成功：${state.setup?.bankerName || "庄家"} 已拿底等待贴底。`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function burySelectedCards() {
  if (!session || buryInFlight) return;
  const cardIds = [...selectedCardIds];
  buryInFlight = true;
  setMessage(`正在贴底（${cardIds.length} 张）…`, false, false);
  try {
    await roomAction(`/api/rooms/${session.roomId}/bury`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds })
    });
    selectedCardIds = new Set();
    buryInFlight = false;
    setMessage(state.stage === "frying" ? "已贴底，进入炒底阶段。" : "已贴底。");
  } catch (error) {
    buryInFlight = false;
    setMessage(error.message, true);
  }
}

async function frySelectedCards() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/fry`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    });
    clearSelectionUnlessKitty(false);
    activeDialog = null;
    setMessage("已炒底，请选择同数量牌贴底。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function passFry() {
  if (!session || actionPassInFlight) return;
  actionPassInFlight = true;
  actionDialogTemporarilyBlocked = true;
  activeDialog = null;
  setMessage("正在提交“不炒”…", false, false);
  try {
    await roomAction(`/api/rooms/${session.roomId}/fry-pass`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    clearSelectionUnlessKitty(false);
    actionPassInFlight = false;
    temporarilyDismissActionDialog();
    setMessage(state.stage === "dogleg"
      ? `炒底结束：主牌确定为${state.setup?.currentTrumpSuitName || state.setup?.trumpSuitName || "主牌"}，等待庄家选择狗腿牌。`
      : viewerCanFry()
        ? "已选择不炒，其他玩家操作后再次轮到你。"
        : "已选择不炒，等待其他玩家操作。");
  } catch (error) {
    actionPassInFlight = false;
    actionDialogTemporarilyBlocked = false;
    activeDialog = viewerCanFry() ? "fry" : null;
    setMessage(error.message, true);
  }
}

async function chooseDoglegSelectedCard() {
  if (!session) return;
  try {
    const doglegSelection = new Set(selectedCardIds);
    await roomAction(`/api/rooms/${session.roomId}/dogleg`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    });
    if (viewerCanPlayCurrent()) {
      const handIds = new Set((state.hand || []).map((card) => card.id));
      selectedCardIds = new Set([...doglegSelection].filter((cardId) => handIds.has(cardId)));
    } else {
      selectedCardIds = new Set();
    }
    setMessage(`开始出牌：主牌为${state.setup?.currentTrumpSuitName || state.setup?.trumpSuitName || "主牌"}。`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function playSelectedCards() {
  if (!session) return;
  try {
    const cardIds = [...selectedCardIds];
    await roomAction(`/api/rooms/${session.roomId}/play`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds, throwPlay: false })
    });
    const playedIds = new Set(cardIds);
    const handIds = new Set((state.hand || []).map((card) => card.id));
    selectedCardIds = new Set([...selectedCardIds].filter((cardId) => !playedIds.has(cardId) && handIds.has(cardId)));
    setMessage("已出牌，其他玩家会在当前轮看到。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function playThrowDraft() {
  if (!session || !throwDraftComponents) return;
  const validation = validateThrowDraft();
  if (!validation.ok) return setMessage(validation.reason, true);
  const components = throwDraftComponents.map((component) => [...component]);
  const cardIds = components.flat();
  try {
    await roomAction(`/api/rooms/${session.roomId}/play`, {
      method: "POST",
      body: JSON.stringify({
        playerId: session.playerId,
        token: session.token,
        cardIds,
        throwPlay: true,
        throwComponents: components
      })
    });
    throwDraftComponents = null;
    selectedCardIds = new Set();
    setMessage("甩牌已提交，结果以桌面和日志为准。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function setReady(ready) {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/ready`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, ready })
    });
    if (state?.stage === "finished") {
      dismissedResultRoomId = ready ? state.roomId : null;
      activeDialog = null;
    }
    setMessage(ready ? "已准备。" : "已取消准备。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function playAgain() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/again`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    activeDialog = null;
    dismissedResultRoomId = state?.stage === "finished" ? state?.roomId || null : null;
    setMessage("已准备下一局，等待其他玩家确认。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function resetRoom() {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/reset`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    setMessage("房间已重置，可以重新开始。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function leaveRoom() {
  if (!session) return clearSession();
  try {
    await api(`/api/rooms/${session.roomId}/leave-room`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    clearSession();
    setMessage("已退出房间。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function dissolveRoom() {
  if (!session) return clearSession();
  if (!window.confirm("确定要解散这个房间吗？房间内所有玩家都会离开。")) return;
  try {
    await api(`/api/rooms/${session.roomId}/dissolve`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    clearSession();
    setMessage("房间已解散。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function kickPlayer(targetPlayerId) {
  if (!session || !targetPlayerId) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/kick`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, targetPlayerId })
    });
    setMessage("已移出玩家。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function copyShare() {
  if (!state) return;
  navigator.clipboard?.writeText(shareUrl(state.roomId));
  setMessage("房间链接已复制。");
}

function fmtTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function fmtDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function canStart() {
  return !isSpectating()
    && state?.viewer?.host
    && state.status === "lobby"
    && state.players.length >= state.minPlayers
    && state.players.length <= state.maxPlayers
    && state.players.every((player) => player.ready);
}

function isViewer(playerId) {
  return !isSpectating() && state?.viewer?.id === playerId;
}

function viewerPlayer() {
  return state?.players?.find((player) => player.id === state.viewer?.id) || null;
}

function readyStatusText() {
  if (!state) return "";
  const readyCount = state.readyCount ?? state.players.filter((player) => player.ready).length;
  return `已准备 ${readyCount}/${state.players.length}`;
}

function viewerPlayedCurrent() {
  return Boolean(state?.currentTrick?.plays?.find((play) => play.playerId === state.viewer?.id && play.played));
}

function viewerCanPlayCurrent() {
  return !isSpectating() && state?.currentTrick?.currentTurnPlayerId === state.viewer?.id && !viewerPlayedCurrent();
}

function viewerCanBid() {
  if (isSpectating() || state?.stage !== "bidding") return false;
  return !state.setup?.bid || state.setup?.biddingTurnPlayerId === state.viewer?.id;
}

function viewerCanPassBid() {
  return !isSpectating() && state?.stage === "bidding" && state.setup?.bid && state.setup?.biddingTurnPlayerId === state.viewer?.id;
}

function viewerCanScoreBid() {
  if (isSpectating() || state?.stage !== "score-bidding") return false;
  const currentId = state.setup?.scoreBid?.currentPlayerId || null;
  if (currentId === state.viewer?.id) return false;
  return !(state.setup?.scoreBid?.passIds || []).includes(state.viewer?.id);
}

function viewerCanPassScoreBid() {
  return viewerCanScoreBid() && Boolean(state.setup?.scoreBid?.currentPlayerId);
}

function scoreBidSecondsLeft() {
  const deadline = state?.setup?.scoreBid?.deadlineAt;
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
}

function scheduleScoreBidAutoPass() {
  if (scoreBidAutoPassTimer) window.clearTimeout(scoreBidAutoPassTimer);
  scoreBidAutoPassTimer = null;
  if (!viewerCanPassScoreBid()) return;
  const deadline = state?.setup?.scoreBid?.deadlineAt;
  if (!deadline) return;
  const wait = Math.max(0, new Date(deadline).getTime() - Date.now()) + 120;
  scoreBidAutoPassTimer = window.setTimeout(() => {
    scoreBidAutoPassTimer = null;
    if (viewerCanPassScoreBid()) passScoreBid();
  }, wait);
}

function viewerCanBury() {
  if (state?.stage === "burying") return isViewer(state.setup?.bankerId);
  if (state?.stage === "fry-burying") return isViewer(state.setup?.fry?.currentPlayerId);
  return false;
}

function viewerCanFry() {
  return state?.stage === "frying" && isViewer(state.setup?.fry?.currentPlayerId);
}

function viewerCanChooseDogleg() {
  return state?.stage === "dogleg" && isViewer(state.setup?.bankerId);
}

function viewerCanRevealTrump() {
  return state?.stage === "trump-selecting" && isViewer(state.setup?.bankerId);
}

function viewerCanSelectCards() {
  return !isSpectating() && (state?.stage === "playing" || viewerCanBid() || viewerCanRevealTrump() || viewerCanBury() || viewerCanFry() || viewerCanChooseDogleg());
}

function selectedCards() {
  const ids = new Set(selectedCardIds);
  return (state?.hand || []).filter((card) => ids.has(card.id));
}

function throwDraftCardIds() {
  return new Set((throwDraftComponents || []).flat());
}

function isThrowDraftCard(cardId) {
  return Boolean(throwDraftComponents && throwDraftCardIds().has(cardId));
}

function cardsFromIds(cardIds) {
  const ids = new Set(cardIds || []);
  return (state?.hand || []).filter((card) => ids.has(card.id));
}

function syncThrowDraftForState() {
  if (!throwDraftComponents) return;
  if (!viewerCanThrowLead()) {
    throwDraftComponents = null;
    return;
  }
  const handIds = new Set((state?.hand || []).map((card) => card.id));
  const complete = throwDraftComponents.every((component) =>
    component.length > 0 && component.every((cardId) => handIds.has(cardId))
  );
  if (!complete) throwDraftComponents = null;
}

function enterThrowMode() {
  if (!viewerCanThrowLead()) return setMessage("只有首家出牌时可以甩牌", true);
  throwDraftComponents = [];
  selectedCardIds = new Set();
  render();
}

function cancelThrowMode() {
  throwDraftComponents = null;
  selectedCardIds = new Set();
  render();
}

function throwDraftRoute() {
  const firstCardId = throwDraftComponents?.[0]?.[0];
  return playSuit(cardsFromIds([firstCardId])[0]);
}

function playPatternLabel(pattern) {
  if (!pattern) return "不合法牌型";
  if (pattern.type === "single") return "单张";
  if (pattern.type === "multi") return `${pattern.width} 张同点牌`;
  if (pattern.type === "tractor") return `${pattern.width} 张头拖拉机`;
  return "牌型";
}

function validateThrowComponentSelection() {
  if (!viewerCanThrowLead()) return { ok: false, reason: "只有首家出牌时可以甩牌" };
  if (!throwDraftComponents) return { ok: false, reason: "请先进入甩牌模式" };
  const cards = selectedCards();
  if (!cards.length) return { ok: false, reason: "请选择一手要加入的牌型" };
  if (cards.some((card) => isThrowDraftCard(card.id))) return { ok: false, reason: "甩牌框中已有这些牌" };
  const suits = uniquePlaySuits(cards);
  if (suits.length !== 1) return { ok: false, reason: "每一手牌型必须属于同一路牌" };
  const pattern = detectPlayPattern(cards);
  if (!pattern) return { ok: false, reason: "当前选择不是合法的单张、多张或拖拉机" };
  const route = throwDraftRoute();
  if (route && suits[0] !== route) {
    return { ok: false, reason: `甩牌框内是${followSuitName(route)}，只能继续加入同一路牌` };
  }
  return { ok: true, reason: "", pattern };
}

function addSelectedThrowComponent() {
  const validation = validateThrowComponentSelection();
  if (!validation.ok) return setMessage(validation.reason, true);
  throwDraftComponents.push([...selectedCardIds]);
  selectedCardIds = new Set();
  setMessage(`已加入第 ${throwDraftComponents.length} 手牌型：${playPatternLabel(validation.pattern)}。`);
}

function removeThrowComponent(index) {
  if (!throwDraftComponents || !Number.isInteger(index) || index < 0 || index >= throwDraftComponents.length) return;
  throwDraftComponents.splice(index, 1);
  selectedCardIds = new Set();
  render();
}

function validateThrowDraft() {
  if (!viewerCanThrowLead()) return { ok: false, reason: "只有首家出牌时可以甩牌" };
  if (!throwDraftComponents?.length) return { ok: false, reason: "请至少加入一手牌型" };
  if (selectedCardIds.size) return { ok: false, reason: "请先把当前选牌加入甩牌框，或取消选中" };
  const routes = new Set();
  const used = new Set();
  for (const component of throwDraftComponents) {
    const cards = cardsFromIds(component);
    if (cards.length !== component.length || !detectPlayPattern(cards)) {
      return { ok: false, reason: "甩牌框中存在已经失效的牌型" };
    }
    const suits = uniquePlaySuits(cards);
    if (suits.length !== 1) return { ok: false, reason: "甩牌框中的牌型必须属于同一路牌" };
    routes.add(suits[0]);
    for (const card of cards) {
      if (used.has(card.id)) return { ok: false, reason: "甩牌框中不能重复使用同一张牌" };
      used.add(card.id);
    }
  }
  if (routes.size !== 1) return { ok: false, reason: "甩牌框中的所有牌型必须属于同一路牌" };
  return { ok: true, reason: "" };
}

function isTwoCard(card) {
  return card?.type === "normal" && card.rank === "2";
}

function followSuit(card) {
  return card?.type === "joker" ? "JOKER" : card?.suit;
}

function followSuitName(suit) {
  if (suit === "TRUMP") return "主牌";
  if (suit === "JOKER") return "王";
  return { S: "黑桃", H: "红桃", C: "草花", D: "方块" }[suit] || "该花色";
}

function uniqueFollowSuits(cards) {
  return [...new Set(cards.map(followSuit).filter(Boolean))];
}

function isMainPlayCard(card, trumpSuit = currentTrumpSuit()) {
  if (!card) return false;
  if (isComparePlayCard(card, trumpSuit)) return true;
  return card.type === "normal" && trumpSuit && card.suit === trumpSuit;
}

function isComparePlayCard(card, trumpSuit = currentTrumpSuit()) {
  if (!card) return false;
  if (card.type === "joker") return true;
  if (card.rank === "2") return true;
  if ((card.suit === "H" || card.suit === "D") && card.rank === "5") return true;
  if (card.rank === "3" && trumpSuit && suitColor(card.suit) === suitColor(trumpSuit)) return true;
  return false;
}

function playSuit(card, trumpSuit = currentTrumpSuit()) {
  if (isMainPlayCard(card, trumpSuit)) return "TRUMP";
  return followSuit(card);
}

function uniquePlaySuits(cards, trumpSuit = currentTrumpSuit()) {
  return [...new Set(cards.map((card) => playSuit(card, trumpSuit)).filter(Boolean))];
}

function mainCardPower(card, trumpSuit = currentTrumpSuit()) {
  if (card.type === "normal" && card.suit === "H" && card.rank === "5") return 0;
  if (card.type === "normal" && card.suit === "D" && card.rank === "5") return 1;
  if (card.joker === "big") return 2;
  if (card.joker === "small") return 3;
  if (card.type === "normal" && card.rank === "3" && trumpSuit) {
    if (card.suit === trumpSuit) return 4;
    if (suitColor(card.suit) === suitColor(trumpSuit)) return 5;
  }
  if (card.type === "normal" && card.rank === "2") {
    if (card.suit === trumpSuit) return 6;
    return 7;
  }
  if (card.type === "normal" && trumpSuit && card.suit === trumpSuit) {
    return 8 + (rankSort[card.rank] ?? 99);
  }
  return 99;
}

function patternValue(card, trumpSuit = currentTrumpSuit()) {
  if (isMainPlayCard(card, trumpSuit)) return mainCardPower(card, trumpSuit);
  return rankSort[card.rank] ?? 99;
}

function patternKey(card, trumpSuit = currentTrumpSuit()) {
  return `${playSuit(card, trumpSuit)}:${patternValue(card, trumpSuit)}`;
}

function bidBeats(current, next) {
  const suitStrength = { D: 0, C: 1, H: 2, S: 3 };
  if (!current) return next.count >= 1;
  if (current.count === 1) return next.count >= 2;
  if (next.count > current.count) return true;
  if (next.count < current.count) return false;
  return (suitStrength[next.suit] ?? -1) > (suitStrength[current.suit] ?? -1);
}

function validateBidLikeSelection(type) {
  if (type === "bid" && !viewerCanBid()) return { ok: false, reason: "还没轮到你叫主/抢主" };
  if (type === "fry" && !viewerCanFry()) return { ok: false, reason: "还没轮到你炒底" };
  if (type === "trump" && !viewerCanRevealTrump()) return { ok: false, reason: "还没轮到你亮2定主" };

  const cards = selectedCards();
  if (!cards.length) return { ok: false, reason: "请选择同一花色的 2" };
  if (!cards.every(isTwoCard)) return { ok: false, reason: "只能选择 2" };
  const suits = uniqueFollowSuits(cards);
  if (suits.length !== 1) return { ok: false, reason: "必须选择同一花色的 2" };

  const bid = { count: cards.length, suit: suits[0] };
  const current = type === "bid" ? state.setup?.bid : type === "fry" ? state.setup?.fry?.lastBid : null;
  if (!bidBeats(current, bid)) {
    if (current?.count === 1) return { ok: false, reason: "当前是 1 张叫主，至少 2 张 2 才能抢" };
    return { ok: false, reason: `需要比 ${bidText(current)} 更大` };
  }
  return { ok: true, reason: "" };
}

function rankValue(card, trumpSuit = currentTrumpSuit()) {
  return patternValue(card, trumpSuit);
}

function nonMainRankOrderValue(card, trumpSuit = currentTrumpSuit()) {
  if (!card || card.type !== "normal") return 99;
  const availableRanks = rankOrder.filter((rank) => {
    const sample = { type: "normal", suit: card.suit, rank };
    return !isMainPlayCard(sample, trumpSuit);
  });
  const index = availableRanks.indexOf(card.rank);
  return index >= 0 ? index : 99;
}

function mainTractorOrderValue(card, trumpSuit = currentTrumpSuit()) {
  if (!card) return 99;
  if (card.type === "normal" && trumpSuit && card.suit === trumpSuit && !isComparePlayCard(card, trumpSuit)) {
    const availableRanks = rankOrder.filter((rank) => {
      const sample = { type: "normal", suit: trumpSuit, rank };
      return !isComparePlayCard(sample, trumpSuit);
    });
    const index = availableRanks.indexOf(card.rank);
    return index >= 0 ? 8 + index : 99;
  }
  return patternValue(card, trumpSuit);
}

function tractorOrderValue(group, trumpSuit = currentTrumpSuit()) {
  const card = group.cards[0];
  if (!card) return 99;
  if (playSuit(card, trumpSuit) === "TRUMP") return mainTractorOrderValue(card, trumpSuit);
  return nonMainRankOrderValue(card, trumpSuit);
}

function consecutiveTractorGroups(previous, next, trumpSuit = currentTrumpSuit()) {
  const previousCard = previous.cards[0];
  const nextCard = next.cards[0];
  if (!previousCard || !nextCard) return false;
  if (playSuit(previousCard, trumpSuit) !== playSuit(nextCard, trumpSuit)) return false;
  return tractorOrderValue(next, trumpSuit) === tractorOrderValue(previous, trumpSuit) + 1;
}

function rankKey(card, trumpSuit = currentTrumpSuit()) {
  if (card.type === "joker") return `${playSuit(card, trumpSuit)}:JOKER:${card.joker}`;
  return `${playSuit(card, trumpSuit)}:${card.suit}:${card.rank}`;
}

function cardsByRank(cards, trumpSuit = currentTrumpSuit()) {
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

function detectPlayPattern(cards, trumpSuit = currentTrumpSuit()) {
  if (!cards.length) return null;
  if (cards.length === 1) return { type: "single", count: 1 };

  const suits = uniquePlaySuits(cards, trumpSuit);
  const groups = cardsByRank(cards, trumpSuit).sort((a, b) => tractorOrderValue(a, trumpSuit) - tractorOrderValue(b, trumpSuit) || a.value - b.value);
  if (groups.length === 1) {
    if (suits.length !== 1) return null;
    return { type: "multi", count: cards.length, width: cards.length, ranks: [groups[0].rank] };
  }

  if (suits.length !== 1) return null;
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

function leadInfoFromSnapshot(trick) {
  const lead = (trick?.plays || [])
    .filter((play) => play.played && play.cards?.length)
    .sort((a, b) => {
      const aIndex = Number.isFinite(a.turnIndex) ? a.turnIndex : Number.MAX_SAFE_INTEGER;
      const bIndex = Number.isFinite(b.turnIndex) ? b.turnIndex : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    })[0];
  if (!lead) return null;
  const suits = uniquePlaySuits(lead.cards);
  return {
    count: lead.cards.length,
    suit: suits.length === 1 ? suits[0] : null,
    pattern: detectPlayPattern(lead.cards)
  };
}

function validatePlaySelection() {
  if (!viewerCanPlayCurrent()) return { ok: false, reason: "还没轮到你出牌" };
  const cards = selectedCards();
  if (!cards.length) return { ok: false, reason: "请选择要出的牌" };

  const lead = leadInfoFromSnapshot(state.currentTrick);
  if (!lead) {
    if (!detectPlayPattern(cards)) {
      return { ok: false, reason: "首家只能出单张、同牌力多张，或连续牌力拖拉机" };
    }
    if (uniquePlaySuits(cards).length > 1) {
      return { ok: false, reason: "首家暂时必须出同一花色或同一主牌牌组" };
    }
    return { ok: true, reason: "" };
  }

  if (cards.length !== lead.count) {
    return { ok: false, reason: `本轮首家出了 ${lead.count} 张，必须跟 ${lead.count} 张` };
  }
  if (!lead.suit) return { ok: true, reason: "" };

  const sameSuitInHand = (state.hand || []).filter((card) => playSuit(card) === lead.suit).length;
  const sameSuitSelected = cards.filter((card) => playSuit(card) === lead.suit).length;
  const requiredSameSuit = Math.min(lead.count, sameSuitInHand);
  if (sameSuitSelected < requiredSameSuit) {
    if (sameSuitInHand >= lead.count) {
      return { ok: false, reason: `你有足够的${followSuitName(lead.suit)}，必须优先跟该花色` };
    }
    return { ok: false, reason: `你还有 ${sameSuitInHand} 张${followSuitName(lead.suit)}，必须先跟完` };
  }
  return { ok: true, reason: "" };
}

function viewerCanThrowLead() {
  return viewerCanPlayCurrent() && !leadInfoFromSnapshot(state.currentTrick);
}

function selectionAction() {
  if (viewerCanBid()) {
    const validation = validateBidLikeSelection("bid");
    return { action: "bid-selected", label: "亮选中的2叫/抢主", enabled: validation.ok, reason: validation.reason };
  }
  if (viewerCanRevealTrump()) {
    const validation = validateBidLikeSelection("trump");
    return { action: "trump-selected", label: "亮选中的2定主", enabled: validation.ok, reason: validation.reason };
  }
  if (viewerCanBury()) {
    const complete = selectedCardIds.size === state.kittySize;
    return {
      action: "bury-selected",
      label: buryInFlight ? "正在贴底…" : "贴底选中的牌",
      enabled: complete && !buryInFlight,
      reason: buryInFlight ? "贴底已提交，请稍候" : complete ? "" : `需要选择 ${state.kittySize} 张牌`
    };
  }
  if (viewerCanFry()) {
    const validation = validateBidLikeSelection("fry");
    return { action: "fry-selected", label: "用选中的2炒底", enabled: validation.ok, reason: validation.reason };
  }
  if (viewerCanChooseDogleg()) {
    return {
      action: "dogleg-selected",
      label: "选为狗腿牌",
      enabled: selectedCardIds.size === 1,
      reason: selectedCardIds.size === 1 ? "" : "请选择 1 张非比牌"
    };
  }
  if (viewerCanPlayCurrent()) {
    if (throwDraftComponents) {
      const componentValidation = validateThrowComponentSelection();
      const throwValidation = validateThrowDraft();
      return {
        action: "add-throw-component",
        label: "加入甩牌框",
        enabled: componentValidation.ok,
        reason: componentValidation.reason,
        throwMode: true,
        throwEnabled: throwValidation.ok,
        throwReason: throwValidation.reason
      };
    }
    const validation = validatePlaySelection();
    return {
      action: "play-selected",
      label: "出选中的牌",
      enabled: validation.ok,
      reason: validation.reason,
      canEnterThrow: viewerCanThrowLead()
    };
  }
  return null;
}

function renderHandControls(action) {
  if (action) {
    if (action.throwMode) {
      const reason = selectedCardIds.size
        ? (!action.enabled ? action.reason : "")
        : (!action.throwEnabled ? action.throwReason : "");
      return `
        <div class="row hand-controls throw-controls">
          <span class="tag">${selectedCardIds.size} 张已选</span>
          <button type="button" data-action="add-throw-component" ${action.enabled ? "" : "disabled"}>加入牌型</button>
          <button type="button" data-action="confirm-throw" ${action.throwEnabled ? "" : "disabled"}>确认甩牌</button>
          <button type="button" class="secondary" data-action="cancel-throw">取消</button>
          <span class="action-reason">${escapeHtml(reason)}</span>
        </div>
      `;
    }
    const throwButton = action.action === "play-selected" && action.canEnterThrow
      ? `<button type="button" class="secondary throw-entry" data-action="enter-throw">甩牌</button>`
      : "";
    const reason = !action.enabled && action.reason ? action.reason : "";
    const turnIndicator = action.action === "play-selected" ? `<span class="turn-indicator">轮到你出牌</span>` : "";
    return `
      <div class="row hand-controls">
        ${turnIndicator}
        <span class="tag">${selectedCardIds.size} 张已选</span>
        <button type="button" data-action="${action.action}" ${action.enabled ? "" : "disabled"}>${escapeHtml(action.label)}</button>
        ${throwButton}
        <span class="action-reason">${escapeHtml(reason)}</span>
      </div>
    `;
  }
  if (state?.stage !== "playing") return "";

  const turnName = state.currentTrick?.currentTurnPlayerName || "";
  const played = viewerPlayedCurrent();
  const text = played
    ? `你本轮已出，等待${turnName ? ` ${turnName} ` : "其他玩家"}出牌`
    : turnName
      ? `等待 ${turnName} 出牌`
      : "等待下一轮";
  return `
    <div class="hand-waiting-controls">
      <span class="tag">${selectedCardIds.size} 张已选</span>
      <div class="turn-waiting">${escapeHtml(text)}</div>
    </div>
  `;
}

function renderThrowDraft() {
  if (!throwDraftComponents) return "";
  const totalCards = throwDraftComponents.reduce((total, component) => total + component.length, 0);
  return `
    <div class="throw-draft">
      <div class="throw-draft-head">
        <strong>甩牌框</strong>
        <span>${throwDraftComponents.length} 手 · ${totalCards} 张</span>
      </div>
      <div class="throw-components">
        ${throwDraftComponents.length ? throwDraftComponents.map((component, index) => {
          const cards = cardsFromIds(component);
          const pattern = detectPlayPattern(cards);
          return `
            <div class="throw-component">
              <div class="throw-component-title">
                <span>第 ${index + 1} 手 · ${escapeHtml(playPatternLabel(pattern))}</span>
                <button type="button" class="secondary" data-action="remove-throw-component" data-component-index="${index}">移除</button>
              </div>
              ${renderMiniCards(cards)}
            </div>
          `;
        }).join("") : `<div class="throw-draft-empty">尚未加入牌型</div>`}
      </div>
    </div>
  `;
}

function renderReadyControls({ waitingNextRound = false } = {}) {
  const viewer = viewerPlayer();
  if (!viewer) return "";
  const ready = Boolean(viewer.ready);
  const label = ready ? (waitingNextRound ? "取消下一局准备" : "取消准备") : "准备";
  return `<button type="button" class="${ready ? "secondary" : ""}" data-action="${ready ? "ready-off" : "ready-on"}">${escapeHtml(label)}</button>`;
}

function renderCallModeToggle() {
  const mode = state.callMode || state.setup?.callMode || "two";
  return `
    <span class="segmented call-mode-toggle" aria-label="叫庄方式">
      <button type="button" class="${mode === "two" ? "" : "secondary"}" data-action="call-mode-two" ${mode === "two" ? "disabled" : ""}>亮2叫主</button>
      <button type="button" class="${mode === "score" ? "" : "secondary"}" data-action="call-mode-score" ${mode === "score" ? "disabled" : ""}>叫分抢庄</button>
    </span>
  `;
}

function renderDoglegCountControl() {
  const max = Number.isFinite(state.setup?.doglegMax) ? state.setup.doglegMax : Math.max(0, state.players.length - 3);
  const current = Math.max(0, Math.min(max, state.setup?.doglegNeeded ?? 0));
  const buttons = Array.from({ length: max + 1 }, (_, count) => `
    <button
      type="button"
      class="${count === current ? "" : "secondary"}"
      data-action="dogleg-count"
      data-count="${count}"
      ${count === current ? "disabled" : ""}
    >${count}</button>
  `).join("");
  return `
    <span class="dogleg-count-control">
      <span class="meta">狗腿</span>
      <span class="segmented">${buttons}</span>
    </span>
  `;
}

function lobbyEmptyText(waitingNextRound) {
  if (waitingNextRound) return `你已准备下一局，等待其他玩家确认。${readyStatusText()}。`;
  return "房主开始后，这里会显示你的 53 张手牌。";
}

function renderShell(content) {
  const account = authState.account;
  const accountLabel = account?.profile?.name || account?.username || "";
  app.innerHTML = `
    <div class="page">
      <header class="topbar">
        <div class="brand">
          <h1>炒地皮在线房间</h1>
          <p>多人在线牌桌，支持真人和机器人同局参与。</p>
        </div>
        <div class="topbar-actions">
          ${account ? `
            <span class="account-chip">
              ${account.profile ? avatarHtml(account.profile.name, account.profile.avatarUrl, "small", account.profile.avatarFrame) : `<span class="avatar small">管</span>`}
              <span>${escapeHtml(accountLabel)}</span>
              ${account.role === "admin" ? `<b>管理员</b>` : ""}
            </span>
            ${!session ? `<button class="secondary compact-button" data-action="${account.role === "admin" ? "show-admin" : "show-account"}">${account.role === "admin" ? "管理后台" : "我的资料"}</button>` : ""}
            ${!session ? `<button class="secondary compact-button" data-action="logout-account">退出登录</button>` : ""}
          ` : `<button class="secondary compact-button" data-action="show-login">玩家登录</button>`}
          ${session ? `<button class="secondary compact-button" data-action="${session.spectator ? "leave-spectating" : "leave"}">${session.spectator ? "退出观战" : "退出本机身份"}</button>` : ""}
        </div>
      </header>
      ${message ? `<div class="status toast ${messageBad ? "bad" : ""}" role="status">${escapeHtml(message)}</div>` : ""}
      ${content}
    </div>
  `;
}

function renderHome() {
  ensureAuth();
  ensureJoinableRooms();
  ensurePlayerStatistics();
  if (homeView === "login") return renderLogin();
  if (homeView === "account") return renderAccountSettings();
  if (homeView === "admin" || homeView === "players") return renderProfileManager();
  renderShell(`
    <section class="home-toolbar">
      <div class="segmented home-tabs" role="tablist" aria-label="首页模块">
        <button type="button" class="${homeView === "rooms" ? "active" : "secondary"}" data-action="show-rooms">房间</button>
        <button type="button" class="${homeView === "stats" ? "active" : "secondary"}" data-action="show-statistics">数据</button>
      </div>
      ${homeView === "rooms" ? `
        <div class="home-room-actions">
          <button type="button" data-action="quick-create-room">创建房间</button>
          <button type="button" class="secondary" data-action="open-join-room">加入房间</button>
        </div>
      ` : ""}
    </section>
    ${homeView === "stats" ? renderHomeStatistics() : `
      ${renderSignedInIdentity()}
      ${renderJoinableRooms()}
    `}
    ${homeJoinOpen ? renderHomeJoinDialog() : ""}
  `);
}

function renderHomeJoinDialog() {
  const account = authState.account;
  return `
    <div class="modal-backdrop">
      <section class="modal-card home-join-modal" role="dialog" aria-modal="true" aria-label="加入房间">
        <div class="section-head">
          <div>
            <h2>加入房间</h2>
            <div class="meta">输入朋友分享的 6 位房间号</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-home-dialog">关闭</button>
        </div>
        <form class="form" data-form="join">
          <label>
            房间号
            <input name="roomId" maxlength="6" required autofocus value="${escapeHtml(roomFromUrl())}" placeholder="例如：A7K2QD">
          </label>
          ${account?.profile ? `
            <div class="home-join-player">
              ${avatarHtml(account.profile.name, account.profile.avatarUrl, "normal", account.profile.avatarFrame)}
              <span>将以 <b>${escapeHtml(account.profile.name)}</b> 加入</span>
            </div>
          ` : `<div class="status bad">需要先登录玩家账号。</div>`}
          <button type="submit">${account?.profile ? "加入房间" : "前往登录"}</button>
        </form>
      </section>
    </div>
  `;
}

function renderSignedInIdentity() {
  const account = authState.account;
  if (!account?.profile) return account?.role === "admin"
    ? `<section class="account-banner admin"><b>管理员模式</b><span>管理员账号不绑定牌桌身份，可管理玩家或进行观战。</span></section>`
    : `<section class="account-banner login-required"><b>登录后参与牌局</b><span>未登录可以查看房间和数据；创建、加入和观战均需登录。</span><button type="button" data-action="show-login">玩家登录</button></section>`;
  return `
    <section class="account-banner">
      ${avatarHtml(account.profile.name, account.profile.avatarUrl, "normal", account.profile.avatarFrame)}
      <div><b>${escapeHtml(account.profile.name)}</b><span>玩家账号 ${escapeHtml(account.username)}</span></div>
    </section>
  `;
}

function renderJoinableRooms() {
  const content = joinableRoomsLoading && !joinableRoomsLoaded
    ? `<div class="empty">正在查找可加入房间...</div>`
    : joinableRooms.length
      ? `<div class="joinable-room-list">${joinableRooms.map(renderJoinableRoom).join("")}</div>`
      : `<div class="empty">暂无房间。可以先创建一个房间，再让朋友从这里加入。</div>`;

  return `
    <section class="panel stack joinable-rooms-panel">
      <div class="section-head">
        <div>
          <h2>当前房间</h2>
          <div class="meta">等待中的房间可加入；进行中的房间可选择任意玩家视角观战。</div>
        </div>
        <button type="button" class="secondary compact-button" data-action="refresh-rooms" ${joinableRoomsLoading ? "disabled" : ""}>
          ${joinableRoomsLoading ? "刷新中" : "刷新"}
        </button>
      </div>
      ${content}
    </section>
  `;
}

function renderJoinableRoom(room) {
  const players = room.players || [];
  const joinable = Boolean(room.joinable);
  return `
    <article class="joinable-room-card ${joinable ? "" : "in-progress"}">
      <div class="joinable-room-main">
        <div>
          <div class="meta">房间号</div>
          <div class="joinable-room-code">${escapeHtml(room.roomId)}</div>
        </div>
        <div class="tags">
          <span class="tag ${joinable ? "good" : "accent"}">${escapeHtml(room.statusLabel || (joinable ? "可加入" : "进行中"))}</span>
          <span class="tag accent">${escapeHtml(room.playerCount)}/${escapeHtml(room.maxPlayers)} 人</span>
          ${room.status === "lobby" ? `<span class="tag good">准备 ${escapeHtml(room.readyCount)}/${escapeHtml(room.playerCount)}</span>` : ""}
          <span class="tag">房主 ${escapeHtml(room.hostName || "未知")}</span>
          <span class="tag">${escapeHtml(room.callModeName || "亮2叫主")}</span>
          ${room.phase ? `<span class="tag">${escapeHtml(room.phase)}</span>` : ""}
          <span class="tag">${escapeHtml(fmtTime(room.createdAt))}</span>
        </div>
      </div>
      <div class="joinable-room-players">
        ${players.map((player) => room.status === "dealt" ? `
          <button
            type="button"
            class="joinable-room-player spectate-player"
            data-action="spectate-player"
            data-room-id="${escapeHtml(room.roomId)}"
            data-player-id="${escapeHtml(player.id)}"
            title="以${escapeHtml(player.name)}的视角观战"
          >
            ${avatarHtml(player.name, player.avatarUrl, "normal", player.avatarFrame)}
            <span class="joinable-room-player-name">${escapeHtml(player.name)}</span>
            <span class="spectate-player-label">${authState.account ? "观战" : "登录后观战"}</span>
          </button>
        ` : `
          <span class="joinable-room-player ${player.ready ? "ready" : ""}">
            ${avatarHtml(player.name, player.avatarUrl, "normal", player.avatarFrame)}
            <span class="joinable-room-player-name">${escapeHtml(player.name)}</span>
          </span>
        `).join("")}
      </div>
      <div class="joinable-room-actions">
        ${joinable ? `
          <button type="button" data-action="join-listed-room" data-room-id="${escapeHtml(room.roomId)}">
            ${authState.account?.profile ? "加入房间" : "登录后加入"}
          </button>
        ` : `
          <div class="meta">牌局已开始，点击上方玩家即可观战。</div>
        `}
      </div>
    </article>
  `;
}

function renderHomeStatistics() {
  const selectedRow = statisticsSelectedAccountId
    ? playerStatisticsRows.find((row) => row.account_id === statisticsSelectedAccountId)
    : null;
  if (selectedRow) return renderPlayerStatisticsDetail(selectedRow);

  const rows = sortedStatisticsRows();
  const appearances = rows.reduce((sum, row) => sum + (Number(row.games_played) || 0), 0);
  const recordedState = historyStatus?.enabled ? "记录中" : "未开启";
  const currentColumn = statisticsColumns().find((column) => column.key === statisticsSortKey) || statisticsColumns()[0];
  const body = playerStatisticsLoading && !playerStatisticsLoaded
    ? `<div class="empty">正在加载数据...</div>`
    : rows.length ? renderStatisticsTable(rows) : `<div class="empty">暂无已记录的全真人牌局。记录开启后，结算数据会自动出现在这里。</div>`;
  return `
    <section class="panel stack statistics-panel">
      <div class="section-head">
        <div>
          <h2>历史数据总榜</h2>
          <div class="meta">列顺序保持固定；点击任意参数名称即可排行，再次点击切换升序或降序。</div>
        </div>
        <div class="statistics-sort-status"><span>当前排序</span><strong>${escapeHtml(currentColumn.label)} ${statisticsSortDirection === "desc" ? "↓" : "↑"}</strong></div>
      </div>
      <div class="statistics-summary statistics-summary-wide">
        <div class="statistics-current-leader">
          ${rows[0] ? avatarHtml(rows[0].latest_name || "玩家", rows[0].latest_avatar_url || "", "normal", rows[0].avatar_frame || "") : ""}
          <span><i>当前排名第一</i><b>${escapeHtml(rows[0]?.latest_name || "暂无")}</b><em>${rows[0] ? escapeHtml(currentColumn.format(currentColumn.value(rows[0]))) : "-"}</em></span>
        </div>
        <div><span>上榜玩家</span><strong>${rows.length}</strong></div>
        <div><span>参赛人次</span><strong>${appearances}</strong></div>
        <div><span>记录状态</span><strong class="${historyStatus?.enabled ? "positive" : ""}">${recordedState}</strong></div>
      </div>
      ${!historyStatus?.enabled && historyStatus ? `<div class="status bad">线上牌局记录开关尚未开启，当前结算不会写入统计。</div>` : ""}
      ${body}
    </section>
  `;
}

function statisticNumber(value) {
  return Number(value) || 0;
}

function statisticDecimal(value, digits = 2) {
  return statisticNumber(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function statisticSigned(value, digits = 2) {
  const numeric = statisticNumber(value);
  return signedScore(statisticDecimal(numeric, digits), numeric);
}

function statisticPercent(value) {
  return `${statisticNumber(value).toFixed(1)}%`;
}

function statisticRate(wins, games) {
  const total = statisticNumber(games);
  return total ? statisticNumber(wins) * 100 / total : 0;
}

function statisticsColumns() {
  const column = (key, label, group, value, format = (item) => statisticDecimal(item, 0), signed = false) => ({ key, label, group, value, format, signed });
  const roleColumn = (key, label, group, field, format, signed = false) => column(key, label, group, (row) => statisticNumber(row[field]), format, signed);
  return [
    column("total_score", "总积分", "综合", (row) => statisticNumber(row.total_score), (value) => statisticSigned(value), true),
    column("games_played", "场次", "综合", (row) => statisticNumber(row.games_played)),
    column("wins", "胜场", "综合", (row) => statisticNumber(row.wins)),
    column("win_rate", "胜率", "综合", (row) => statisticNumber(row.win_rate), statisticPercent),
    column("average_score", "场均积分", "综合", (row) => statisticNumber(row.average_score), (value) => statisticSigned(value), true),
    roleColumn("banker_games", "庄家场次", "庄家", "banker_games"),
    roleColumn("banker_score", "庄家积分", "庄家", "banker_score", (value) => statisticSigned(value), true),
    column("banker_win_rate", "庄家胜率", "庄家", (row) => statisticRate(row.banker_wins, row.banker_games), statisticPercent),
    roleColumn("dogleg_games", "狗腿场次", "狗腿", "dogleg_games"),
    roleColumn("dogleg_score", "狗腿积分", "狗腿", "dogleg_score", (value) => statisticSigned(value), true),
    column("dogleg_win_rate", "狗腿胜率", "狗腿", (row) => statisticRate(row.dogleg_wins, row.dogleg_games), statisticPercent),
    roleColumn("idle_games", "闲家场次", "闲家", "idle_games"),
    roleColumn("idle_score", "闲家积分", "闲家", "idle_score", (value) => statisticSigned(value), true),
    column("idle_win_rate", "闲家胜率", "闲家", (row) => statisticRate(row.idle_wins, row.idle_games), statisticPercent),
    column("dragged_fives", "被拖红方五", "牌局", (row) => statisticNumber(row.dragged_red_fives) + statisticNumber(row.dragged_diamond_fives)),
    column("dragged_average", "场均被拖", "牌局", (row) => statisticNumber(row.games_played) ? (statisticNumber(row.dragged_red_fives) + statisticNumber(row.dragged_diamond_fives)) / statisticNumber(row.games_played) : 0, statisticDecimal),
    column("total_trick_score", "累计牌分", "牌局", (row) => statisticNumber(row.total_trick_score)),
    column("trick_score_average", "场均牌分", "牌局", (row) => statisticNumber(row.games_played) ? statisticNumber(row.total_trick_score) / statisticNumber(row.games_played) : 0, statisticDecimal),
    column("opponent_dragged_fives", "拖对方红方五", "牌局", (row) => statisticNumber(row.opponent_dragged_red_fives) + statisticNumber(row.opponent_dragged_diamond_fives)),
    column("opponent_dragged_average", "场均拖对方", "牌局", (row) => statisticNumber(row.games_played) ? (statisticNumber(row.opponent_dragged_red_fives) + statisticNumber(row.opponent_dragged_diamond_fives)) / statisticNumber(row.games_played) : 0, statisticDecimal),
    column("teammate_dragged_fives", "拖队友红方五", "牌局", (row) => statisticNumber(row.teammate_dragged_red_fives) + statisticNumber(row.teammate_dragged_diamond_fives)),
    column("teammate_dragged_average", "场均拖队友", "牌局", (row) => statisticNumber(row.games_played) ? (statisticNumber(row.teammate_dragged_red_fives) + statisticNumber(row.teammate_dragged_diamond_fives)) / statisticNumber(row.games_played) : 0, statisticDecimal),
    column("won_tricks", "获胜轮次", "牌局", (row) => statisticNumber(row.won_tricks)),
    column("total_tricks", "总轮次", "牌局", (row) => statisticNumber(row.total_tricks)),
    column("round_win_rate", "轮次胜率", "牌局", (row) => statisticRate(row.won_tricks, row.total_tricks), statisticPercent),
    column("bottom_wins", "保底数", "牌局", (row) => statisticNumber(row.bottom_wins))
  ];
}

function sortedStatisticsRows() {
  const column = statisticsColumns().find((item) => item.key === statisticsSortKey) || statisticsColumns()[0];
  const direction = statisticsSortDirection === "asc" ? 1 : -1;
  return [...playerStatisticsRows].sort((left, right) => {
    const difference = column.value(left) - column.value(right);
    if (difference) return difference * direction;
    const scoreDifference = statisticNumber(right.total_score) - statisticNumber(left.total_score);
    if (scoreDifference) return scoreDifference;
    return String(left.latest_name || "").localeCompare(String(right.latest_name || ""), "zh-CN");
  });
}

function statisticsSectionStart(columns, index) {
  return index > 0 && columns[index - 1].group !== columns[index].group;
}

function renderStatisticsTable(rows) {
  const columns = statisticsColumns();
  return `
    <div class="statistics-table-note"><span>当前按 <b>${escapeHtml(columns.find((column) => column.key === statisticsSortKey)?.label || "总积分")}</b> ${statisticsSortDirection === "desc" ? "从高到低" : "从低到高"}排列</span><span>横向滑动可查看全部 ${columns.length} 项数据</span></div>
    <div class="statistics-table-wrap">
      <table class="statistics-table statistics-data-table">
        <thead><tr>
          <th>排名</th><th>玩家</th>
          ${columns.map((column, index) => `
            <th class="${column.key === statisticsSortKey ? "selected-column" : ""} ${statisticsSectionStart(columns, index) ? "section-start" : ""}" ${column.key === statisticsSortKey ? `aria-sort="${statisticsSortDirection === "desc" ? "descending" : "ascending"}"` : ""}>
              <button type="button" class="statistics-column-button" data-action="sort-statistics" data-stat-key="${column.key}" title="按${escapeHtml(column.label)}排行">
                <span>${escapeHtml(column.label)}</span><i>${column.key === statisticsSortKey ? (statisticsSortDirection === "desc" ? "↓" : "↑") : ""}</i>
              </button>
            </th>
          `).join("")}
          <th></th>
        </tr></thead>
        <tbody>
          ${rows.map((row, rowIndex) => `
            <tr>
              <td><span class="rank-number rank-${rowIndex + 1}">${rowIndex + 1}</span></td>
              <td>
                ${row.account_id ? `
                  <button type="button" class="statistics-player-button" data-action="show-player-statistics" data-account-id="${escapeHtml(row.account_id)}">
                    ${avatarHtml(row.latest_name || "玩家", row.latest_avatar_url || "", "normal", row.avatar_frame || "")}
                    <span><b>${escapeHtml(row.latest_name || "玩家")}</b><small>@${escapeHtml(row.username || "player")}</small></span>
                  </button>
                ` : `
                  <span class="statistics-player">
                    ${avatarHtml(row.latest_name || "玩家", row.latest_avatar_url || "", "normal", row.avatar_frame || "")}
                    <b>${escapeHtml(row.latest_name || "玩家")}</b>
                  </span>
                `}
              </td>
              ${columns.map((column, columnIndex) => {
                const value = column.value(row);
                const tone = column.signed && value > 0 ? "positive" : column.signed && value < 0 ? "negative" : "";
                return `<td class="${column.key === statisticsSortKey ? "selected-column statistics-score" : ""} ${statisticsSectionStart(columns, columnIndex) ? "section-start" : ""} ${tone}">${escapeHtml(column.format(value))}</td>`;
              }).join("")}
              <td>${row.account_id ? `<button type="button" class="secondary compact-button" data-action="show-player-statistics" data-account-id="${escapeHtml(row.account_id)}">查看</button>` : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function showPlayerStatistics(accountId) {
  if (!accountId) return;
  statisticsSelectedAccountId = accountId;
  render();
  if (statisticsPlayerDetails.has(accountId) || statisticsPlayerDetailLoadingId === accountId) return;
  statisticsPlayerDetailLoadingId = accountId;
  api(`/api/history/players/${encodeURIComponent(accountId)}`)
    .then((detail) => {
      statisticsPlayerDetails.set(accountId, detail);
    })
    .catch((error) => {
      setMessage(error.message || "玩家数据加载失败", true);
    })
    .finally(() => {
      if (statisticsPlayerDetailLoadingId === accountId) statisticsPlayerDetailLoadingId = "";
      render();
    });
}

function statisticsRoleRow(row, key, label) {
  const games = statisticNumber(row[`${key}_games`]);
  const wins = statisticNumber(row[`${key}_wins`]);
  const score = statisticNumber(row[`${key}_score`]);
  return `<tr><td><span class="statistics-role-label role-${key}">${label}</span></td><td>${games}</td><td>${wins}</td><td>${statisticPercent(statisticRate(wins, games))}</td><td class="${score > 0 ? "positive" : score < 0 ? "negative" : ""}">${statisticSigned(score)}</td><td>${statisticSigned(games ? score / games : 0)}</td></tr>`;
}

function statisticsPerformanceItem(label, value, note) {
  return `<div class="statistics-performance-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function renderStatisticsTrend(trend = []) {
  const values = trend.map((item) => statisticNumber(item.running_score));
  if (!values.length) return `<div class="empty">暂无积分走势</div>`;
  const width = 760;
  const height = 210;
  const padding = 18;
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values, 0);
  const range = Math.max(1, maximum - minimum);
  const points = values.map((value, index) => {
    const x = padding + index * ((width - padding * 2) / Math.max(1, values.length - 1));
    const y = height - padding - (value - minimum) / range * (height - padding * 2);
    return [x, y];
  });
  const pointString = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPoints = `${padding},${height - padding} ${pointString} ${width - padding},${height - padding}`;
  const grid = [0.2, 0.5, 0.8].map((ratio) => `<line x1="${padding}" y1="${height * ratio}" x2="${width - padding}" y2="${height * ratio}"></line>`).join("");
  const dots = points.map(([x, y], index) => index === points.length - 1 || index === 0 || index % Math.max(1, Math.ceil(points.length / 8)) === 0 ? `<circle cx="${x}" cy="${y}" r="4"></circle>` : "").join("");
  return `
    <svg class="statistics-trend-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="积分走势">
      <defs><linearGradient id="statistics-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d8a6d" stop-opacity="0.24"></stop><stop offset="1" stop-color="#1d8a6d" stop-opacity="0.02"></stop></linearGradient></defs>
      <g class="chart-grid">${grid}</g><polygon class="chart-area" points="${areaPoints}"></polygon><polyline class="chart-line" points="${pointString}"></polyline><g class="chart-dots">${dots}</g>
    </svg>
  `;
}

function renderPlayerStatisticsDetail(baseRow) {
  const detail = statisticsPlayerDetails.get(baseRow.account_id);
  const row = { ...baseRow, ...(detail?.player || {}) };
  const trend = detail?.trend || [];
  const rank = [...playerStatisticsRows].sort((left, right) => statisticNumber(right.total_score) - statisticNumber(left.total_score)).findIndex((item) => item.account_id === row.account_id) + 1;
  const games = statisticNumber(row.games_played);
  const dragged = statisticNumber(row.dragged_red_fives) + statisticNumber(row.dragged_diamond_fives);
  const opponentDragged = statisticNumber(row.opponent_dragged_red_fives) + statisticNumber(row.opponent_dragged_diamond_fives);
  const teammateDragged = statisticNumber(row.teammate_dragged_red_fives) + statisticNumber(row.teammate_dragged_diamond_fives);
  const wonTricks = statisticNumber(row.won_tricks);
  const totalTricks = statisticNumber(row.total_tricks);
  const titleItems = [
    ["MVP", "mvp_count"], ["辅", "support_count"], ["躺", "couch_count"], ["坑", "pit_count"],
    ["僵", "stiff_count"], ["僵中僵", "stiffest_count"], ["雷", "thunder_count"], ["精", "precision_count"],
    ["神", "god_count"], ["天之上", "heaven_count"], ["神坑", "god_pit_count"], ["尽", "exhausted_count"], ["擎", "pillar_count"]
  ].filter(([, key]) => statisticNumber(row[key]) > 0);
  return `
    <div class="statistics-detail-page">
      <button type="button" class="secondary statistics-back-button" data-action="back-statistics">返回排行榜</button>
      <section class="statistics-detail-hero">
        <div class="statistics-detail-identity">
          ${avatarHtml(row.latest_name || "玩家", row.latest_avatar_url || "", "large", row.avatar_frame || "")}
          <div><span>历史总榜第 ${rank || "-"} 名</span><h2>${escapeHtml(row.latest_name || "玩家")}</h2><small>@${escapeHtml(row.username || "player")} · ${games} 场全真人牌局</small></div>
        </div>
        <div class="statistics-headline"><span>总积分</span><strong class="${statisticNumber(row.total_score) > 0 ? "positive" : statisticNumber(row.total_score) < 0 ? "negative" : ""}">${statisticSigned(row.total_score)}</strong><small>场均 ${statisticSigned(row.average_score)}</small></div>
        <div class="statistics-headline"><span>胜率</span><strong>${statisticPercent(row.win_rate)}</strong><small>${statisticNumber(row.wins)} 胜 / ${statisticNumber(row.losses)} 负</small></div>
        <div class="statistics-headline"><span>累计牌分</span><strong>${statisticNumber(row.total_trick_score)}</strong><small>场均 ${statisticDecimal(games ? statisticNumber(row.total_trick_score) / games : 0, 1)}</small></div>
      </section>
      <div class="statistics-detail-grid">
        <div>
          <section class="statistics-detail-section">
            <header><h3>积分走势</h3><span>${statisticsPlayerDetailLoadingId === row.account_id ? "读取中" : `最近 ${trend.length} 场`}</span></header>
            <div class="statistics-trend-wrap">${renderStatisticsTrend(trend)}<div><span>较早</span><span>当前 ${statisticSigned(row.total_score)} 分</span></div></div>
          </section>
          <section class="statistics-detail-section">
            <header><h3>身份表现</h3><span>积分、场次与胜率独立计算</span></header>
            <div class="statistics-role-table-wrap"><table class="statistics-role-table"><thead><tr><th>身份</th><th>场次</th><th>胜场</th><th>胜率</th><th>积分</th><th>场均</th></tr></thead><tbody>${statisticsRoleRow(row, "banker", "庄家")}${statisticsRoleRow(row, "dogleg", "狗腿")}${statisticsRoleRow(row, "idle", "闲家")}</tbody></table></div>
          </section>
        </div>
        <div>
          <section class="statistics-detail-section">
            <header><h3>牌局表现</h3><span>历史累计 / 场均</span></header>
            <div class="statistics-performance-grid">
              ${statisticsPerformanceItem("被拖红方五", dragged, `${statisticDecimal(games ? dragged / games : 0)} / 场`)}
              ${statisticsPerformanceItem("拖对方红方五", opponentDragged, `${statisticDecimal(games ? opponentDragged / games : 0)} / 场`)}
              ${statisticsPerformanceItem("拖队友红方五", teammateDragged, `${statisticDecimal(games ? teammateDragged / games : 0)} / 场`)}
              ${statisticsPerformanceItem("获胜轮次", wonTricks, `总轮次 ${totalTricks} · 轮次胜率 ${statisticPercent(statisticRate(wonTricks, totalTricks))}`)}
              ${statisticsPerformanceItem("保底", statisticNumber(row.bottom_wins), `${statisticDecimal(games ? statisticNumber(row.bottom_wins) / games : 0)} / 场`)}
            </div>
          </section>
          <section class="statistics-detail-section">
            <header><h3>称号记录</h3><span>可同时获得多个称号</span></header>
            ${titleItems.length ? `<div class="statistics-title-list">${titleItems.map(([label, key]) => `<div><span>${label}</span><b>${statisticNumber(row[key])}</b></div>`).join("")}</div>` : `<div class="empty">暂无称号记录</div>`}
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderLogin() {
  renderShell(`
    <div class="auth-page-grid">
      <section class="panel stack auth-panel">
        <div class="section-head">
          <h2>玩家登录</h2>
          <button type="button" class="secondary compact-button" data-action="show-rooms">返回房间</button>
        </div>
        ${authState.bootstrapRequired ? `<div class="status bad">管理员账号尚未创建，请先完成服务器初始化设置。</div>` : ""}
        <form class="form" data-form="account-login">
          <label>用户名<input name="username" autocomplete="username" required maxlength="24"></label>
          <label>密码<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label>
          <button type="submit" ${!authState.configured || !authState.initialized ? "disabled" : ""}>登录</button>
        </form>
      </section>
    </div>
  `);
}

function renderAccountSettings() {
  const account = authState.account;
  if (!account) {
    homeView = "login";
    return renderLogin();
  }
  const profile = account.profile;
  const nextAvatarAt = account.nextAvatarChangeAt ? new Date(account.nextAvatarChangeAt) : null;
  const avatarLocked = nextAvatarAt && nextAvatarAt.getTime() > Date.now();
  renderShell(`
    <div class="settings-grid">
      ${profile ? `
        <section class="panel stack">
          <div class="section-head">
            <div><h2>我的头像</h2><div class="meta">头像由浏览器压缩后上传，每 7 天可以更换一次。</div></div>
            <button type="button" class="secondary compact-button" data-action="show-rooms">返回房间</button>
          </div>
          <div class="account-profile-preview">
            ${avatarHtml(profile.name, profile.avatarUrl, "normal", profile.avatarFrame)}
            <div><b>${escapeHtml(profile.name)}</b><span>用户名 ${escapeHtml(account.username)}</span></div>
          </div>
          <form class="form" data-form="own-avatar">
            <label>选择新头像<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required ${avatarLocked ? "disabled" : ""}></label>
            ${avatarLocked ? `<div class="status">下次可更换：${escapeHtml(fmtDateTime(account.nextAvatarChangeAt))}</div>` : ""}
            <button type="submit" ${avatarLocked ? "disabled" : ""}>更换头像</button>
          </form>
        </section>
      ` : ""}
      <section class="panel stack">
        <h2>修改密码</h2>
        <form class="form" data-form="change-password">
          <label>当前密码<input type="password" name="currentPassword" autocomplete="current-password" required maxlength="72"></label>
          <label>新密码<input type="password" name="newPassword" autocomplete="new-password" required minlength="6" maxlength="72"></label>
          <label>确认新密码<input type="password" name="confirmPassword" autocomplete="new-password" required minlength="6" maxlength="72"></label>
          <button type="submit">保存新密码</button>
        </form>
      </section>
    </div>
  `);
}

function renderManagedAccount(account) {
  const profileName = account.profile?.name || "未绑定玩家";
  return `
    <form class="managed-account-row" data-form="reset-password" data-account-id="${escapeHtml(account.id)}">
      <div class="managed-account-main">
        ${account.profile ? avatarHtml(account.profile.name, account.profile.avatarUrl, "small", account.profile.avatarFrame) : `<span class="avatar small">管</span>`}
        <div><b>${escapeHtml(account.username)}</b><span>${escapeHtml(profileName)}</span></div>
      </div>
      <span class="tag ${account.enabled ? "good" : ""}">${account.enabled ? "已启用" : "已停用"}</span>
      ${account.role === "player" ? `
        <label>重置密码<input name="password" type="password" minlength="6" maxlength="72" placeholder="输入新密码" required></label>
        <button type="submit" class="secondary compact-button">重置</button>
        <button type="button" class="${account.enabled ? "danger" : "secondary"} compact-button" data-action="toggle-account" data-account-id="${escapeHtml(account.id)}" data-enabled="${account.enabled ? "false" : "true"}">${account.enabled ? "停用" : "启用"}</button>
      ` : `<span class="tag accent">管理员</span>`}
    </form>
  `;
}

function renderProfileManager() {
  if (authState.account?.role !== "admin") {
    homeView = "login";
    return renderLogin();
  }
  ensureAdminData();
  const managedProfiles = adminData?.profiles || [];
  const managedAccounts = adminData?.accounts || [];
  renderShell(`
    <section class="panel stack admin-own-password">
      <div class="section-head">
        <div><h2>管理员密码</h2><div class="meta">修改当前登录管理员账号的密码。</div></div>
        <button type="button" class="secondary compact-button" data-action="show-rooms">返回房间</button>
      </div>
      <form class="admin-password-form" data-form="change-password">
        <label>当前密码<input type="password" name="currentPassword" autocomplete="current-password" required maxlength="72"></label>
        <label>新密码<input type="password" name="newPassword" autocomplete="new-password" required minlength="6" maxlength="72"></label>
        <label>确认新密码<input type="password" name="confirmPassword" autocomplete="new-password" required minlength="6" maxlength="72"></label>
        <button type="submit">保存新密码</button>
      </form>
    </section>

    <section class="panel stack admin-account-create">
      <div class="section-head">
        <div><h2>创建玩家账号</h2><div class="meta">创建账号时会同时生成对应的玩家资料。</div></div>
      </div>
      <form class="admin-create-form" data-form="create-account">
        <label>玩家昵称<input name="displayName" required maxlength="16" placeholder="例如 新玩家"></label>
        <label>登录用户名<input name="username" required minlength="3" maxlength="24" pattern="[a-z0-9_-]+" placeholder="例如 benlei"></label>
        <label>初始密码<input name="password" type="password" required minlength="6" maxlength="72"></label>
        <button type="submit">创建账号</button>
      </form>
    </section>

    <section class="panel stack">
      <h2>账号状态</h2>
      <div class="managed-account-list">
        ${adminDataLoading && !adminData ? `<div class="empty">正在加载账号...</div>` : managedAccounts.map(renderManagedAccount).join("") || `<div class="empty">暂无账号。</div>`}
      </div>
    </section>

    <section class="panel stack">
      <div class="section-head">
        <div><h2>玩家资料</h2><div class="meta">昵称、头像框、牌面边框和出牌特效由管理员管理；玩家可每 7 天自助更换头像一次。</div></div>
      </div>
      <div class="profile-list">
        ${managedProfiles.length ? managedProfiles.map(renderProfileRow).join("") : `<div class="empty">暂无玩家。</div>`}
      </div>
    </section>
  `);
}

function renderProfileRow(profile) {
  return `
    <form class="profile-row" data-form="update-profile" data-profile-id="${escapeHtml(profile.id)}">
      ${avatarHtml(profile.name, profile.avatarUrl, "normal", profile.avatarFrame)}
      <div class="profile-fields">
        <label>
          玩家名称
          <input name="name" maxlength="16" required value="${escapeHtml(profile.name)}">
        </label>
        <label>
          头像框
          <select name="avatarFrame">
            ${AVATAR_FRAME_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${profile.avatarFrame === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <label>
          牌面边框
          <select name="cardSkin">
            ${CARD_SKIN_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${profile.cardSkin === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <label>
          出牌特效
          <select name="playEffect">
            <option value="" ${profile.playEffect ? "" : "selected"}>无</option>
            <option value="fireworks" ${profile.playEffect === "fireworks" ? "selected" : ""}>烟花（至少8张且当前最大）</option>
          </select>
        </label>
        <label>
          管理员更换头像
          <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp">
        </label>
      </div>
      <div class="profile-row-actions">
        ${profile.account ? `<span class="tag ${profile.account.enabled ? "good" : ""}">${escapeHtml(profile.account.username)}</span>` : `<span class="tag">未绑定账号</span>`}
        <button type="submit" class="secondary">保存</button>
      </div>
    </form>
  `;
}

function renderRoom() {
  ensurePlayerStatistics();
  const viewer = viewerPlayer();
  const spectating = isSpectating();
  const waitingNextRound = !spectating && state.stage === "finished" && Boolean(viewer?.ready);
  const inLobbyView = state.status === "lobby";
  const gameInProgress = state.status === "dealt";
  const showTable = state.stage !== "lobby";
  selectedCardIds = new Set([...selectedCardIds].filter((cardId) => state.hand.some((card) => card.id === cardId)));
  maybeAutoOpenActionDialog();
  const waitingText = state.players.length < state.minPlayers
    ? `还差 ${state.minPlayers - state.players.length} 人才能开始`
    : state.players.every((player) => player.ready)
      ? "所有玩家已准备，房主可以开始"
      : "人数已满足，等待所有玩家准备";

  renderShell(`
    <div class="room-layout ${spectating ? "spectator-mode" : ""}">
      <div class="stack room-main">
        <section class="panel stack">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="meta">房间号</div>
              <div class="room-code">${escapeHtml(state.roomId)}</div>
            </div>
            <div class="tags">
              <span class="tag accent">${state.players.length}/${state.maxPlayers} 人</span>
              ${spectating ? `<span class="tag good">观战 · ${escapeHtml(state.spectator?.targetPlayerName || state.viewer?.name || "玩家")}</span>` : ""}
              <span class="tag">${escapeHtml(state.phase)}</span>
              ${inLobbyView ? `<span class="tag good">${escapeHtml(readyStatusText())}</span>` : ""}
            </div>
          </div>
          <div class="share">
            <div class="meta">邀请链接</div>
            <code>${escapeHtml(shareUrl(state.roomId))}</code>
            <div class="row">
              <button type="button" data-action="copy">复制链接</button>
              <button type="button" class="secondary" data-action="open-players">玩家</button>
              <button type="button" class="secondary" data-action="open-events">日志</button>
              ${state.trickHistory.length || state.removedCards?.length ? `<button type="button" class="secondary" data-action="open-history">历史出牌 ${state.trickHistory.length}</button>` : ""}
              ${state.canViewKitty ? `<button type="button" class="secondary" data-action="open-kitty">查看底牌</button>` : ""}
              ${spectating ? "" : `
                ${state.viewer.host && state.status === "lobby" ? renderCallModeToggle() : ""}
                ${state.viewer.host && state.status === "lobby" ? renderDoglegCountControl() : ""}
                ${inLobbyView ? renderReadyControls({ waitingNextRound }) : ""}
                ${state.viewer.host && state.status === "lobby" ? `<button type="button" class="secondary" data-action="add-robot" ${state.players.length >= state.maxPlayers ? "disabled" : ""}>添加机器人</button>` : ""}
                ${state.viewer.host && state.status === "lobby" ? `<button type="button" class="secondary" data-action="random-seats" ${state.players.length < 2 ? "disabled" : ""}>随机座位</button>` : ""}
                ${state.viewer.host && state.status === "lobby" ? `<button type="button" data-action="start" ${canStart() ? "" : "disabled"}>开始并发牌</button>` : ""}
                ${state.viewer.host && gameInProgress ? `<button type="button" class="secondary" data-action="reset">重开房间</button>` : ""}
                ${state.viewer.host ? `<button type="button" class="secondary danger" data-action="dissolve-room">解散房间</button>` : ""}
                ${state.status === "lobby" ? `<button type="button" class="secondary" data-action="room-leave">退出房间</button>` : ""}
              `}
            </div>
            ${spectating ? `<div class="spectator-notice">只读观战中：你看到的是 ${escapeHtml(state.spectator?.targetPlayerName || state.viewer?.name || "该玩家")} 的完整视角，无法操作任何牌。</div>` : ""}
            ${inLobbyView && !spectating ? `<div class="meta">${escapeHtml(waitingNextRound ? `你已准备下一局，等待其他玩家确认。${readyStatusText()}` : `${waitingText}。${readyStatusText()}。当前支持 5-9 人。`)}</div>` : ""}
          </div>
        </section>

        ${!showTable ? renderLobbyPlayersPanel() : ""}
        ${showTable && state.setup?.doglegCard ? renderDoglegPanel() : ""}
        ${showTable ? renderPlayTable() : ""}
        ${!showTable ? `<section class="panel"><div class="empty">${escapeHtml(lobbyEmptyText(waitingNextRound))}</div></section>` : ""}
      </div>
    </div>
    ${renderSpectatorIndicator()}
    ${renderActiveDialog()}
  `);
}

function bidText(bid) {
  if (!bid) return "暂无";
  return `${bid.playerName}：${bid.count} 张${bid.suitName}2${bid.random ? "（随机）" : ""}`;
}

function scoreBidText(scoreBid) {
  if (!scoreBid?.currentPlayerId) return `起叫 ${scoreBid?.minimum || 0} 分`;
  return `${scoreBid.currentPlayerName}：${scoreBid.currentScore} 分`;
}

function scoreBidActionButtons() {
  const scoreBidState = state.setup?.scoreBid || {};
  if (!viewerCanScoreBid()) {
    if (scoreBidState.currentPlayerId === state.viewer?.id) return `<div class="turn-waiting">你是当前最高叫分，等待其他玩家加分或过</div>`;
    if ((scoreBidState.passIds || []).includes(state.viewer?.id)) return `<div class="turn-waiting">你已过，等待叫分结束</div>`;
    return `<div class="turn-waiting">等待其他玩家叫分</div>`;
  }
  if (!scoreBidState.currentPlayerId) {
    return `<button type="button" data-action="score-bid-start">以 ${escapeHtml(scoreBidState.minimum || 0)} 分叫庄</button>`;
  }
  const secondsLeft = scoreBidSecondsLeft();
  const countdown = secondsLeft === null ? "" : `<span class="tag">${secondsLeft}s</span>`;
  return `
    <span class="score-bid-actions">
      ${countdown}
      <button type="button" data-action="score-bid-10">+10</button>
      <button type="button" data-action="score-bid-20">+20</button>
      <button type="button" data-action="score-bid-30">+30</button>
      <button type="button" class="secondary" data-action="score-pass">过</button>
    </span>
  `;
}

function doglegCardText(card) {
  if (!card) return "未确定";
  return displayCardLabel(card);
}

function renderDoglegPanel() {
  const card = state.setup?.doglegCard;
  const names = state.setup?.doglegPlayerNames || [];
  return `
    <section class="panel dogleg-panel">
      <div>
        <div class="meta">狗腿牌</div>
        <strong class="${card?.color || (card?.suit === "H" || card?.suit === "D" ? "red" : "black")}">${escapeHtml(doglegCardText(card))}</strong>
      </div>
      <div>
        <div class="meta">已暴露狗腿</div>
        <strong>${names.length ? escapeHtml(names.join("、")) : "等待玩家打出"}</strong>
      </div>
      <span class="tag accent">${names.length}/${state.setup?.doglegNeeded || 0}</span>
    </section>
  `;
}

function renderSetupPlayers(type) {
  const setup = state.setup || {};
  const fry = setup.fry || {};
  return `
    <div class="setup-players">
      ${state.players.map((player) => {
        let label = "等待";
        let tone = "";
        if (type === "bid") {
          if (!setup.bid) {
            label = "等待叫主";
          } else if (setup.biddingTurnPlayerId === player.id) {
            label = "抢主/过";
            tone = "good";
          } else if (setup.bid?.playerId === player.id) {
            label = setup.bid.random ? "随机主" : "当前叫主";
            tone = "accent";
          } else if ((setup.bidPassIds || []).includes(player.id)) {
            label = "已过";
          } else {
            label = "等待抢主";
          }
        }
        if (type === "fry") {
          if (fry.currentPlayerId === player.id) {
            label = "炒底/过";
            tone = "good";
          } else if (fry.lastFryerId === player.id) {
            label = "当前底牌";
            tone = "accent";
          } else if ((fry.passIds || []).includes(player.id)) {
            label = "已过";
          } else {
            label = "等待炒底";
          }
        }
        return `
          <div class="setup-player">
            <strong>${escapeHtml(player.name)}</strong>
            <span class="tag ${tone}">${escapeHtml(label)}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderSetupCenter() {
  const setup = state.setup || {};
  const stage = state.stage;
  let body = "";
  const currentTrumpBlock = setup.currentTrumpSuitName
    ? `
      <div>
        <div class="meta">当前主牌</div>
        <strong>${escapeHtml(setup.currentTrumpSuitName)}</strong>
      </div>
    `
    : "";

  if (stage === "bidding") {
    const turnText = setup.bid
      ? `轮到 ${setup.biddingTurnPlayerName} 抢主或过`
      : "任意玩家可先亮 2 叫主";
    body = `
      <div class="setup-grid">
        <div>
          <div class="meta">当前叫主</div>
          <strong>${escapeHtml(bidText(setup.bid))}</strong>
        </div>
        <div>
          <div class="meta">当前动作</div>
          <strong>${escapeHtml(turnText)}</strong>
        </div>
        ${currentTrumpBlock}
      </div>
      <div class="row">
        ${viewerCanBid() ? `<button type="button" data-action="open-bid-dialog" ${actionPassInFlight ? "disabled" : ""}>${setup.bid ? "选择2抢主" : "选择2叫主"}</button>` : ""}
        ${viewerCanPassBid() ? `<button type="button" class="secondary" data-action="bid-pass" ${actionPassInFlight ? "disabled" : ""}>${actionPassInFlight ? "提交中…" : "过"}</button>` : ""}
        ${!isSpectating() && state.viewer.host && !setup.bid ? `<button type="button" class="secondary" data-action="random-bid">无人叫主，随机指定</button>` : ""}
      </div>
    `;
  }

  if (stage === "score-bidding") {
    const scoreBidState = setup.scoreBid || {};
    const idleTarget = scoreBidState.currentScore
      ? (state.players.length * 100 - scoreBidState.currentScore)
      : (state.players.length * 100 - (scoreBidState.minimum || 0));
    body = `
      <div class="setup-grid">
        <div>
          <div class="meta">当前叫分</div>
          <strong>${escapeHtml(scoreBidText(scoreBidState))}</strong>
        </div>
        <div>
          <div class="meta">闲家胜利线</div>
          <strong>${escapeHtml(idleTarget)} 分</strong>
        </div>
        <div>
          <div class="meta">叫庄方式</div>
          <strong>叫分抢庄</strong>
        </div>
      </div>
      <div class="row">${scoreBidActionButtons()}</div>
    `;
  }

  if (stage === "trump-selecting") {
    body = `
      <div class="setup-grid">
        <div>
          <div class="meta">庄家</div>
          <strong>${escapeHtml(setup.bankerName)}</strong>
        </div>
        <div>
          <div class="meta">最终叫分</div>
          <strong>${escapeHtml(setup.scoreBid?.currentScore || 0)} 分</strong>
        </div>
        <div>
          <div class="meta">当前动作</div>
          <strong>庄家亮一张或多张同花色 2 定主</strong>
        </div>
      </div>
    `;
  }

  if (stage === "burying") {
    body = `
      <div class="setup-grid">
        <div>
          <div class="meta">庄家</div>
          <strong>${escapeHtml(setup.bankerName)}</strong>
        </div>
        <div>
          <div class="meta">贴底要求</div>
          <strong>选择 ${state.kittySize} 张牌放入底牌</strong>
        </div>
        ${currentTrumpBlock}
      </div>
    `;
  }

  if (stage === "frying") {
    const fry = setup.fry || {};
    body = `
      <div class="setup-grid">
        <div>
          <div class="meta">当前底牌控制</div>
          <strong>${escapeHtml(fry.lastFryerName || setup.bankerName)}</strong>
        </div>
        <div>
          <div class="meta">当前炒底门槛</div>
          <strong>${escapeHtml(bidText(fry.lastBid))}</strong>
        </div>
        <div>
          <div class="meta">当前动作</div>
          <strong>轮到 ${escapeHtml(fry.currentPlayerName)} 炒底或不炒</strong>
        </div>
        ${currentTrumpBlock}
      </div>
      <div class="row">
        ${viewerCanFry() ? `<button type="button" data-action="open-fry-dialog" ${actionPassInFlight ? "disabled" : ""}>选择2炒底</button>` : ""}
        ${viewerCanFry() ? `<button type="button" class="secondary" data-action="fry-pass" ${actionPassInFlight ? "disabled" : ""}>${actionPassInFlight ? "提交中…" : "不炒"}</button>` : ""}
      </div>
    `;
  }

  if (stage === "fry-burying") {
    const fry = setup.fry || {};
    body = `
      <div class="setup-grid">
        <div>
          <div class="meta">炒底玩家</div>
          <strong>${escapeHtml(fry.currentPlayerName)}</strong>
        </div>
        <div>
          <div class="meta">贴底要求</div>
          <strong>选择 ${state.kittySize} 张牌放入底牌</strong>
        </div>
        ${currentTrumpBlock}
      </div>
    `;
  }

  if (stage === "dogleg") {
    body = `
      <div class="setup-grid">
        <div>
          <div class="meta">庄家</div>
          <strong>${escapeHtml(setup.bankerName)}</strong>
        </div>
        <div>
          <div class="meta">主牌</div>
          <strong>${escapeHtml(setup.currentTrumpSuitName || setup.trumpSuitName)}</strong>
        </div>
        <div>
          <div class="meta">狗腿数量</div>
          <strong>${setup.doglegNeeded} 个</strong>
        </div>
      </div>
      <div class="meta">庄家需要选择 1 张非比牌作为狗腿牌；打牌中最先打出该牌的玩家成为狗腿。</div>
    `;
  }

  return `
    <div class="setup-center-content">
      <span class="tag accent">${escapeHtml(state.phase)}</span>
      ${body}
    </div>
  `;
}

function actionDialogKey() {
  if (viewerCanBid()) {
    const bid = state.setup?.bid;
    return `bid:${state.roomId}:${bid?.count || 0}:${bid?.suit || "none"}:${state.setup?.biddingTurnPlayerId || "open"}`;
  }
  if (viewerCanFry()) {
    const bid = state.setup?.fry?.lastBid;
    return `fry:${state.roomId}:${state.setup?.fry?.currentPlayerId || "none"}:${bid?.count || 0}:${bid?.suit || "none"}`;
  }
  return "";
}

function maybeAutoOpenActionDialog() {
  const key = actionDialogKey();
  if (!key) {
    if (activeDialog === "bid" || activeDialog === "fry") activeDialog = null;
    dismissedActionDialogKey = null;
    return;
  }
  if (actionDialogTemporarilyBlocked) {
    if (activeDialog === "bid" || activeDialog === "fry") activeDialog = null;
    return;
  }
  if (activeDialog) return;
  if (dismissedActionDialogKey === key) return;
  activeDialog = key.startsWith("bid:") ? "bid" : "fry";
}

function temporarilyDismissActionDialog(delay = 900) {
  if (actionDialogResumeTimer) window.clearTimeout(actionDialogResumeTimer);
  const key = actionDialogKey();
  activeDialog = null;
  dismissedActionDialogKey = key || null;
  actionDialogTemporarilyBlocked = true;
  actionDialogResumeTimer = window.setTimeout(() => {
    actionDialogResumeTimer = null;
    actionDialogTemporarilyBlocked = false;
    if (dismissedActionDialogKey === actionDialogKey()) dismissedActionDialogKey = null;
    render();
  }, delay);
}

function renderActiveDialog() {
  if (activeDialog === "bid" && viewerCanBid()) return renderBidFryDialog("bid");
  if (activeDialog === "fry" && viewerCanFry()) return renderBidFryDialog("fry");
  if (activeDialog === "kitty" && state.canViewKitty) return renderKittyDialog();
  if (activeDialog === "history") return renderHistoryDialog();
  if (activeDialog === "players") return renderPlayersDialog();
  if (activeDialog === "events") return renderEventsDialog();
  if (activeDialog === "spectators") return renderSpectatorsDialog();
  if (activeDialog === "result" && state.stage === "finished") return renderResultPanel();
  return "";
}

function renderSpectatorIndicator() {
  const spectators = state.spectators || [];
  if (!spectators.length) return "";
  return `
    <button type="button" class="spectator-indicator" data-action="open-spectators" title="查看观战玩家" aria-label="${spectators.length} 人正在观战">
      <span class="spectator-eye" aria-hidden="true"></span>
      <span class="spectator-count">${spectators.length}</span>
    </button>
  `;
}

function renderSpectatorsDialog() {
  const spectators = state.spectators || [];
  return `
    <div class="modal-backdrop">
      <section class="modal-card spectators-modal" role="dialog" aria-modal="true" aria-label="观战玩家">
        <div class="section-head">
          <div>
            <h2>观战玩家</h2>
            <div class="meta">${spectators.length} 人正在观看本局</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
        <div class="spectator-list">
          ${spectators.length ? spectators.map((spectator) => `
            <div class="spectator-list-item">
              ${avatarHtml(spectator.name || "路人", spectator.avatarUrl || "", "normal", spectator.avatarFrame || "")}
              <div>
                <strong>${escapeHtml(spectator.name || "路人")}</strong>
                <span>正在观看 ${escapeHtml(spectator.targetPlayerName || "玩家")}</span>
              </div>
            </div>
          `).join("") : `<div class="empty">当前没有人观战</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderLobbyPlayersPanel() {
  return `
    <section class="panel">
      <div class="section-head">
        <h2>玩家</h2>
        <span class="tag">${state.players.length}/${state.maxPlayers}</span>
      </div>
      <div class="players lobby-players">
        ${state.players.map(renderPlayer).join("")}
      </div>
    </section>
  `;
}

function renderPlayersDialog() {
  return `
    <div class="modal-backdrop">
      <section class="modal-card players-modal" role="dialog" aria-modal="true" aria-label="玩家">
        <div class="section-head">
          <div>
            <h2>玩家</h2>
            <div class="meta">${state.players.length}/${state.maxPlayers} 人</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
        <div class="players">
          ${state.players.map(renderPlayer).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderEventsDialog() {
  return `
    <div class="modal-backdrop">
      <section class="modal-card events-modal" role="dialog" aria-modal="true" aria-label="房间日志">
        <div class="section-head">
          <div>
            <h2>房间日志</h2>
            <div class="meta">本局完整记录 · ${state.events.length} 条，下一局开始时清空</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
        <div class="events">
          ${state.events.length ? state.events.map(renderEvent).join("") : `<div class="empty">暂无记录</div>`}
        </div>
      </section>
    </div>
  `;
}

function signedScore(valueText, value) {
  const numeric = Number(value);
  const text = valueText ?? String(value ?? 0);
  if (numeric > 0) return `+${text}`;
  return text;
}

function resultScoreStatus(value) {
  const numeric = Number(value);
  if (numeric > 0) return { className: "winner", label: "积分加" };
  if (numeric < 0) return { className: "loser", label: "积分扣" };
  return { className: "neutral", label: "积分平" };
}

function renderEvaluationTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return "";
  return `
    <span class="result-evaluations">
      ${tags.map((tag) => `
        <span
          class="result-evaluation result-evaluation-${escapeHtml(tag.code || "default")}"
          title="${escapeHtml(tag.title || tag.label || "本局评价")}"
          aria-label="${escapeHtml(tag.title || tag.label || "本局评价")}"
        >${escapeHtml(tag.label || "评")}</span>
      `).join("")}
    </span>
  `;
}

function renderResultPanel() {
  const result = state.result;
  if (!result) return `
    <div class="modal-backdrop">
      <section class="modal-card result-modal" role="dialog" aria-modal="true" aria-label="总结看板">
        <div class="empty">本局已结束，暂无结算数据。</div>
      </section>
    </div>
  `;
  const winnerEachScore = result.winnerTeam === "idle" ? result.idleEachScore : result.bankerEachScore;
  const scoreDirectionReversed = Number(winnerEachScore) < 0;
  return `
    <div class="modal-backdrop">
      <section class="modal-card result-modal stack" role="dialog" aria-modal="true" aria-label="总结看板">
        <div class="section-head">
          <div>
            <h2>总结看板</h2>
            <div class="meta">${escapeHtml(readyStatusText())}，点击再来一局只会让你自己进入下一局准备。</div>
          </div>
          <div class="row">
            <button type="button" data-action="play-again">再来一局</button>
            <button type="button" class="secondary" data-action="room-leave">退出房间</button>
            <button type="button" class="secondary compact-button" data-action="close-dialog">隐藏结算</button>
          </div>
        </div>
        <div class="tags">
          <span class="tag accent">牌局胜方：${escapeHtml(result.winnerTeamName)}</span>
          <span class="tag good">闲家 ${result.idleScore}/${result.threshold} 分</span>
          ${result.bankerBidScore ? `<span class="tag">叫分 ${escapeHtml(result.bankerBidScore)} / 总分 ${escapeHtml(result.totalGamePoints)}</span>` : ""}
          <span class="tag">${state.trickHistory.length} 轮</span>
        </div>
        <div class="result-grid">
          <div>
            <div class="meta">庄家队</div>
            <strong>${escapeHtml(result.bankerTeamNames.join("、") || "无")}</strong>
          </div>
          <div>
            <div class="meta">闲家队</div>
            <strong>${escapeHtml(result.idleTeamNames.join("、") || "无")}</strong>
          </div>
          <div>
            <div class="meta">保底</div>
            <strong>${escapeHtml(result.bottomWinnerName)}（${escapeHtml(result.bottomWinnerTeamName)}）</strong>
            <span>${result.bottomPoints} 底分${result.bottomScoreAddedToIdle ? `，闲家加 ${result.bottomScoreAddedToIdle}` : ""}</span>
          </div>
          <div>
            <div class="meta">每人积分</div>
            <strong>闲家 ${signedScore(result.idleEachScoreText, result.idleEachScore)} / 庄队 ${signedScore(result.bankerEachScoreText, result.bankerEachScore)}</strong>
          </div>
        </div>
        <div class="result-score-note ${scoreDirectionReversed ? "warning" : ""}">
          ${scoreDirectionReversed
            ? "牌局胜负按闲家牌分判断；保底、拖五和甩牌调整后，牌局胜方本局仍可能成为积分扣分方。"
            : "牌局胜负按闲家牌分判断；每人积分还包含保底、拖五和甩牌调整。"}
        </div>
        <div class="score-breakdown">
          <span class="tag">胜负 ${signedScore(null, result.baseScore)}</span>
          <span class="tag">上下台阶 ${signedScore(null, result.scoreStep)}</span>
          <span class="tag">保底 ${signedScore(null, result.bottomDelta)}</span>
          <span class="tag">拖五 ${signedScore(null, result.draggedDelta)}</span>
          <span class="tag">甩牌 ${signedScore(null, result.throwFailureDelta || 0)}</span>
          ${result.bottomDraggedRedFives || result.bottomDraggedDiamondFives ? `<span class="tag accent">底牌拖主：红五 ${result.bottomDraggedRedFives}，方五 ${result.bottomDraggedDiamondFives}</span>` : ""}
        </div>
        <div class="result-bottom">
          <div class="section-head compact">
            <h3>底牌</h3>
            <span class="tag">${result.bottomCards?.length || 0} 张</span>
          </div>
          <div class="kitty-cards">
            ${(result.bottomCards || []).length ? sortCardsForPlay(result.bottomCards).map(renderStaticCard).join("") : `<div class="empty">无底牌记录</div>`}
          </div>
        </div>
        <div class="result-table">
          ${result.playerResults.map((player) => {
            const wonGame = player.team === result.winnerTeam;
            const scoreStatus = resultScoreStatus(player.gameScore);
            return `
            <div class="result-row ${scoreStatus.className}">
              <strong class="result-player-name">
                <span>${escapeHtml(player.name)}</span>
                ${renderEvaluationTags(player.evaluationTags)}
                <span class="result-outcome">${scoreStatus.label}</span>
              </strong>
              <span>${escapeHtml(player.role || player.teamName)} · ${wonGame ? "牌胜" : "牌负"}</span>
              <span>牌分 ${player.trickScore}</span>
              <span>红五 ${player.draggedRedFives}</span>
              <span>方五 ${player.draggedDiamondFives}</span>
              <span>甩失 ${player.throwFailures || 0}</span>
              <b>${signedScore(player.gameScoreText, player.gameScore)}</b>
            </div>
          `;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderBidFryDialog(type) {
  const isBid = type === "bid";
  const title = isBid ? (state.setup?.bid ? "抢主" : "叫主") : "炒底";
  const validation = validateBidLikeSelection(type);
  const currentBid = isBid ? state.setup?.bid : state.setup?.fry?.lastBid;
  const twoCards = sortCardsForGroup("rank", (state.hand || []).filter(isTwoCard));
  const passAction = isBid ? "bid-pass" : "fry-pass";
  const passLabel = isBid ? "过" : "不炒";
  const canPass = isBid ? viewerCanPassBid() : viewerCanFry();
  return `
    <div class="modal-backdrop">
      <section class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(title)}</h2>
            <div class="meta">当前门槛：${escapeHtml(bidText(currentBid))}</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
        <div class="choice-panel">
          <div class="choice-title">
            <strong>我的 2</strong>
            <span class="tag">${twoCards.length} 张</span>
          </div>
          ${twoCards.length ? renderTwoCardChoices(twoCards) : `<div class="empty">手里没有可用于${escapeHtml(title)}的 2。</div>`}
        </div>
        <div class="dialog-actions">
          ${canPass ? `<button type="button" class="secondary" data-action="${passAction}">${passLabel}</button>` : `<button type="button" class="secondary" data-action="close-dialog">过</button>`}
          <button type="button" data-action="${isBid ? "bid-selected" : "fry-selected"}" ${validation.ok ? "" : "disabled"}>${escapeHtml(title)}</button>
          ${!validation.ok && validation.reason ? `<span class="action-reason">${escapeHtml(validation.reason)}</span>` : ""}
        </div>
      </section>
    </div>
  `;
}

function renderTwoCardChoices(cards) {
  const groups = ["S", "H", "C", "D"].map((suit) => ({
    suit,
    label: { S: "黑桃", H: "红桃", C: "草花", D: "方块" }[suit],
    cards: cards.filter((card) => card.suit === suit),
    routeCount: (state.hand || []).filter((card) => card.type === "normal" && card.suit === suit).length
  })).filter((group) => group.cards.length);
  return `
    <div class="two-card-groups">
      ${groups.map((group) => `
        <div class="two-card-group">
          <div class="hand-group-title">
            <strong>${escapeHtml(group.label)}</strong>
            <span>该路 ${group.routeCount} 张</span>
          </div>
          <div class="choice-cards">
            ${group.cards.map((card, index) => `
              <button
                type="button"
                class="card choice-card ${card.color} ${cardSuitClass(card)} ${cardSkinClass(viewerCardSkin())} ${selectedCardIds.has(card.id) ? "selected" : ""}"
                style="--i:${index}"
                title="${escapeHtml(displayCardLabel(card))}"
                aria-pressed="${selectedCardIds.has(card.id) ? "true" : "false"}"
                data-action="toggle-card"
                data-card-id="${escapeHtml(card.id)}"
              >
                ${cardCorner(card)}
              </button>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderStaticCard(card) {
  return `
    <div class="card static ${card.color} ${cardSuitClass(card)} ${cardSkinClass(viewerCardSkin())}" title="${escapeHtml(displayCardLabel(card))}">
      ${cardCorner(card)}
    </div>
  `;
}

function renderKittyDialog() {
  const cards = sortCardsForGroup("rank", state.kitty || []);
  return `
    <div class="modal-backdrop">
      <section class="modal-card" role="dialog" aria-modal="true" aria-label="查看底牌">
        <div class="section-head">
          <div>
            <h2>底牌</h2>
            <div class="meta">当前只有最后贴底的人可查看。</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
        ${cards.length ? `
          <div class="kitty-cards">
            ${cards.map(renderStaticCard).join("")}
          </div>
        ` : `<div class="empty">当前没有可查看的底牌。</div>`}
      </section>
    </div>
  `;
}

function renderPlayedFiveStats() {
  const counts = state.playedProtectedFives || {};
  const animate = Boolean(draggedFiveEffect?.animateUntil > Date.now());
  const redBump = animate && draggedFiveEffect.entries.some((entry) => entry.suit === "H");
  const diamondBump = animate && draggedFiveEffect.entries.some((entry) => entry.suit === "D");
  return `
    <div class="played-five-stats" title="只统计已打到桌面上的红五和方五">
      <span class="${redBump ? "five-stat-bump" : ""}">已出红五 <b>${counts.red || 0}</b></span>
      <span class="${diamondBump ? "five-stat-bump" : ""}">已出方五 <b>${counts.diamond || 0}</b></span>
    </div>
  `;
}

function idleTargetScore() {
  if (!state) return "";
  if (state.stage === "finished" && state.result) return Number(state.result.threshold) || 0;
  if (state.callMode === "score" && state.setup?.scoreBid?.currentScore) {
    return state.players.length * 100 - state.setup.scoreBid.currentScore;
  }
  if (state.players.length === 5) return 250;
  if (state.players.length === 6) return 360;
  if (state.players.length === 7) return 350;
  return Math.round(state.players.length * 100 * 0.5);
}

function currentIdleScore() {
  if (!state) return 0;
  if (state.stage === "finished" && state.result) return Number(state.result.idleScore) || 0;
  return (state.players || [])
    .filter((player) => player.role === "闲家")
    .reduce((total, player) => total + (Number(player.score) || 0), 0);
}

function renderGameInfoTags() {
  const setup = state.setup || {};
  const tags = [];
  if (setup.currentTrumpSuitName || setup.trumpSuitName) tags.push(`<span class="tag good">主牌 ${escapeHtml(setup.currentTrumpSuitName || setup.trumpSuitName)}</span>`);
  tags.push(`<span class="tag idle-score-tag">闲家 <strong>${escapeHtml(currentIdleScore())}</strong> / ${escapeHtml(idleTargetScore())} 分</span>`);
  return tags.join("");
}

function renderPlayTable() {
  if (state.stage === "finished") {
    const finalTrick = state.trickHistory?.[state.trickHistory.length - 1] || null;
    return `
      <section class="panel stack">
        <div class="section-head">
          <h2>打牌桌面</h2>
          <div class="tags">
            ${renderGameInfoTags()}
            <span class="tag accent">本局结束</span>
            <button type="button" class="secondary compact-button" data-action="open-history">历史出牌 ${state.trickHistory.length}</button>
          </div>
        </div>
        ${finalTrick
          ? renderTrick(finalTrick, true, { heldResult: true, finishedResult: true })
          : `<div class="empty finished-result-empty"><span>本局已结束</span><button type="button" data-action="open-result">查看结算</button></div>`}
      </section>
    `;
  }
  if (state.stage !== "playing") return renderSetupTable();
  const turnText = state.currentTrick?.currentTurnPlayerName
    ? `轮到 ${state.currentTrick.currentTurnPlayerName}`
    : "等待下一轮";
  const tableTrick = visibleTableTrick();
  const holdingPreviousResult = tableTrick && tableTrick !== state.currentTrick;
  return `
    <section class="panel stack">
      <div class="section-head">
        <h2>打牌桌面</h2>
        <div class="tags">
          ${renderGameInfoTags()}
          <span class="tag good">${escapeHtml(holdingPreviousResult ? `${turnText}，上一轮结果暂留` : turnText)}</span>
          <button type="button" class="secondary compact-button" data-action="open-history">历史出牌 ${state.trickHistory.length}</button>
        </div>
      </div>
      ${renderTrick(tableTrick, true, { heldResult: holdingPreviousResult })}
    </section>
  `;
}

function renderSetupTable() {
  const setup = state.setup || {};
  const titleByStage = {
    bidding: "叫主牌桌",
    "score-bidding": "叫分牌桌",
    "trump-selecting": "定主牌桌",
    burying: "贴底牌桌",
    frying: "炒底牌桌",
    "fry-burying": "炒底贴底",
    dogleg: "狗腿牌"
  };
  const seats = state.players.map((player) => {
    const status = setupSeatStatus(player);
    return {
      playerId: player.id,
      playerName: player.name,
      role: player.role,
      avatarUrl: player.avatarUrl || "",
      avatarFrame: player.avatarFrame || "",
      playEffect: player.playEffect || "",
      played: false,
      winning: false,
      lead: false,
      currentTurn: false,
      cards: [],
      cardCount: player.cardCount,
      score: player.score || 0,
      draggedRedFives: player.draggedRedFives || 0,
      draggedDiamondFives: player.draggedDiamondFives || 0,
      throwFailures: player.throwFailures || 0,
      setupActions: setupActionsForPlayer(player.id),
      statusText: status.text,
      statusTone: status.tone
    };
  });
  const tableTrick = {
    number: state.currentTrick?.number || 1,
    leaderId: state.hostId,
    leaderName: "",
    points: 0,
    plays: seats
  };
  return `
    <section class="panel stack setup-stage setup-stage-${escapeHtml(state.stage)}">
      <div class="section-head">
        <h2>${escapeHtml(titleByStage[state.stage] || "牌桌")}</h2>
        <div class="tags">
          ${renderGameInfoTags()}
        </div>
      </div>
      ${renderTrick(tableTrick, true, { setupTable: true })}
    </section>
  `;
}

function setupSeatStatus(player) {
  const setup = state.setup || {};
  const fry = setup.fry || {};
  if (state.stage === "bidding") {
    if (!setup.bid) return { text: "等待叫主", tone: "" };
    if (setup.biddingTurnPlayerId === player.id) return { text: "抢主/过", tone: "good" };
    if (setup.bid?.playerId === player.id) return { text: setup.bid.random ? "随机主" : "当前叫主", tone: "accent" };
    if ((setup.bidPassIds || []).includes(player.id)) return { text: "已过", tone: "" };
    return { text: "等待抢主", tone: "" };
  }
  if (state.stage === "score-bidding") {
    const scoreBidState = setup.scoreBid || {};
    if (scoreBidState.currentPlayerId === player.id) return { text: `${scoreBidState.currentScore}分`, tone: "accent" };
    if ((scoreBidState.passIds || []).includes(player.id)) return { text: "已过", tone: "" };
    return { text: scoreBidState.currentPlayerId ? "可加分/过" : "可起叫", tone: scoreBidState.currentPlayerId ? "good" : "" };
  }
  if (state.stage === "trump-selecting") {
    if (setup.bankerId === player.id) return { text: "亮2定主", tone: "good" };
    return { text: "等待定主", tone: "" };
  }
  if (state.stage === "burying") {
    if (setup.bankerId === player.id) return { text: "贴底", tone: "good" };
    return { text: "等待贴底", tone: "" };
  }
  if (state.stage === "frying") {
    if (fry.currentPlayerId === player.id) return { text: "炒底/过", tone: "good" };
    if (fry.lastFryerId === player.id) return { text: "当前底牌", tone: "accent" };
    if ((fry.passIds || []).includes(player.id)) return { text: "已过", tone: "" };
    return { text: "等待炒底", tone: "" };
  }
  if (state.stage === "fry-burying") {
    if (fry.currentPlayerId === player.id) return { text: "贴底", tone: "good" };
    return { text: "等待贴底", tone: "" };
  }
  if (state.stage === "dogleg") {
    if (setup.bankerId === player.id) return { text: "选狗腿牌", tone: "good" };
    return { text: "等待选择", tone: "" };
  }
  return { text: "等待", tone: "" };
}

function currentSetupActionId() {
  const setup = state.setup || {};
  if (state.stage === "bidding") return setup.bid?.actionId || "";
  if (state.stage === "trump-selecting") return setup.bid?.actionId || "";
  if (state.stage === "fry-burying") return setup.fry?.pendingBid?.actionId || "";
  if (state.stage === "frying") return setup.fry?.lastBid?.actionId || "";
  return "";
}

function setupActionsForPlayer(playerId) {
  const setup = state.setup || {};
  if (state.stage === "score-bidding") {
    const currentPlayerId = setup.scoreBid?.currentPlayerId || "";
    return (setup.scoreBid?.history || [])
      .filter((action) => action.playerId === playerId)
      .map((action) => ({
        ...action,
        kind: "score",
        current: currentPlayerId === playerId && action.score === setup.scoreBid?.currentScore
      }));
  }
  const currentId = currentSetupActionId();
  const source = state.stage === "bidding" || state.stage === "trump-selecting"
    ? (setup.bidHistory || [])
    : (setup.fry?.history || []);
  return source
    .filter((action) => action.playerId === playerId)
    .map((action) => ({
      ...action,
      current: Boolean(action.actionId && action.actionId === currentId)
    }));
}

function renderSetupActionTrail(actions, cardSkin = "") {
  if (!actions?.length) return "";
  return `
    <div class="setup-action-trail">
      ${actions.map((action) => `
        <div class="setup-action ${action.current ? "current" : ""}">
          <span>${escapeHtml(action.kind === "score" ? `${action.score}分` : `${action.count}张${action.suitName}2${action.random ? " 随机" : ""}`)}</span>
          ${action.cards?.length ? renderMiniCards(action.cards, { cardSkin }) : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderSeatHand(action, play, trick, index, options = {}) {
  if (!state?.viewer?.id || !Array.isArray(state.hand)) return "";
  const statusText = playStatusText(trick, play, index, true, options);
  const statusTone = playStatusTone(trick, play, true, options);
  const myTurn = state.stage === "playing" && viewerCanPlayCurrent();
  const roomPlayer = state.players.find((player) => player.id === play.playerId) || play;
  return `
    <div class="seat-hand ${myTurn ? "is-my-turn" : ""}" data-action="clear-selection">
      <div class="seat-hand-layout">
        <aside class="seat-hand-profile-card">
          <div class="seat-hand-avatar-stage" tabindex="0" aria-label="查看${escapeHtml(play.playerName)}的历史数据">
            ${avatarHtml(play.playerName, play.avatarUrl, "seat-profile", play.avatarFrame || roomPlayer.avatarFrame)}
            ${renderPlayerHistoryMini(play.playerId, { overlay: true })}
          </div>
          <div class="seat-hand-profile-copy">
            <div class="seat-hand-player-line">
              <strong><span class="seat-hand-name">${escapeHtml(play.playerName)}</span>${roleMark(play.role, play.playerId)}</strong>
              <span class="seat-status ${escapeHtml(statusTone)}">${escapeHtml(statusText)}</span>
            </div>
          </div>
        </aside>
        <div class="seat-hand-main">
          <div class="seat-hand-head">
            ${renderCompactPlayerStats(play, { handCount: state.hand.length })}
            ${renderHandControls(action)}
          </div>
          ${renderThrowDraft()}
          ${renderHand(state.hand, { compact: true })}
        </div>
      </div>
    </div>
  `;
}

function visibleTableTrick() {
  const currentTrick = state.currentTrick;
  if (!currentTrick) return null;
  const hasCurrentPlay = (currentTrick.plays || []).some((play) => play.played && play.cards?.length);
  const latestCompleted = state.trickHistory?.[state.trickHistory.length - 1] || null;
  if (!hasCurrentPlay && latestCompleted) return latestCompleted;
  return currentTrick;
}

function renderTrick(trick, current, options = {}) {
  if (!trick) return `<div class="empty">等待发牌。</div>`;
  const plays = trick.plays || [];
  const displayPlays = current ? orientPlaysForViewer(plays) : plays;
  const heldResult = Boolean(options.heldResult);
  const setupTable = Boolean(options.setupTable);
  const finishedResult = Boolean(options.finishedResult);
  const viewerAction = current && !finishedResult ? selectionAction() : null;
  const titleMeta = current
    ? finishedResult
      ? `${trick.winnerName ? `胜者 ${trick.winnerName} · ${trick.points} 分` : "本局最后一轮"}`
      : setupTable
      ? state.phase
      : heldResult
      ? `${trick.winnerName ? `胜者 ${trick.winnerName} · ${trick.points} 分` : "上一轮结果"}`
      : `${trick.leaderName ? `首家 ${trick.leaderName}` : "等待首家"}`
    : `${trick.winnerName ? `胜者 ${trick.winnerName} · ${trick.points} 分` : "已完成"}`;
  return `
    <div class="trick ${current ? "current" : ""} ${heldResult ? "held-result" : ""} ${setupTable ? "setup-table" : ""} ${finishedResult ? "finished-table" : ""}">
      ${setupTable ? "" : `
        <div class="trick-title">
          <span>${current ? (finishedResult ? "最后一轮" : heldResult ? "上一轮结果" : "当前轮") : `第 ${trick.number} 轮`}</span>
          <span>${escapeHtml(titleMeta)}</span>
        </div>
      `}
      <div class="trick-grid ${current ? `table-circle table-seats-${displayPlays.length}` : ""}">
        ${current ? `
          <div class="table-corner-stats">${renderPlayedFiveStats()}</div>
          <div class="table-center ${setupTable ? "setup-center" : ""} ${finishedResult ? "result-center" : ""}">
            <strong>${finishedResult ? "本局结束" : setupTable ? "牌桌" : heldResult ? `第 ${trick.number} 轮结果` : `第 ${trick.number} 轮`}</strong>
            ${setupTable ? renderSetupCenter() : `<span>${escapeHtml(finishedResult ? `${state.result?.winnerTeamName || "胜方"}获胜` : titleMeta)}</span>`}
            ${finishedResult ? `<button type="button" data-action="open-result">查看结算</button>` : ""}
          </div>
        ` : ""}
        ${displayPlays.map((play, index) => {
          const playCards = displayedPlayCards(play);
          const playContent = setupTable ? renderSetupActionTrail(play.setupActions, play.cardSkin || cardSkinForPlayer(play.playerId)) : (play.played ? renderPlayedCards(play, playCards, trick.number) : "");
          const isViewerSeat = current && play.playerId === state.viewer?.id;
          const showViewerHand = isViewerSeat && !finishedResult;
          const playIndex = play.turnIndex ?? index;
          const statusText = playStatusText(trick, play, playIndex, current, { heldResult, setupTable });
          const statusTone = playStatusTone(trick, play, current, { heldResult, setupTable });
          const seatHand = showViewerHand ? renderSeatHand(viewerAction, play, trick, playIndex, { heldResult, setupTable }) : "";
          const playEffect = setupTable ? "" : renderLargePlayEffect(play, trick.number);
          const playerCard = `
            <div class="trick-player ${roleClass(play.role)} ${play.played ? "played" : ""} ${play.lead ? "lead" : ""} ${play.currentTurn ? "current-turn" : ""} ${play.winning ? "winning" : ""}">
              <div class="trick-player-profile-section">
                <div class="trick-name">
                  <strong>${tablePlayerIdentity(play)}</strong>
                  <span class="seat-status ${escapeHtml(statusTone)}">${escapeHtml(statusText)}</span>
                </div>
              </div>
              <div class="trick-player-game-section">
                ${renderCompactPlayerStats(play)}
              </div>
              ${!current && play.played ? renderPlayedCards(play, playCards, trick.number) : ""}
            </div>
          `;
          if (!current) return playerCard;
          return `
            <div class="trick-seat ${seatZone(index, displayPlays.length)} ${isViewerSeat ? "viewer-seat" : ""}" style="${seatStyle(index, displayPlays.length)}">
              ${showViewerHand ? "" : playerCard}
              ${playContent ? `<div class="seat-play ${playEffect ? "large-play-effect-active" : ""}">${playContent}${playEffect}</div>` : ""}
              ${seatHand}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function playStatusText(trick, play, index, current, options = {}) {
  if (options.setupTable) return play.statusText || "等待";
  if (isThrowAttemptVisible(play)) return "甩牌判断中";
  if (!current) {
    if (play.throwFailed) return "甩牌失败";
    if (play.throwPlay) return "甩牌成功";
    if (play.winning) return "本轮最大";
    return play.played ? fmtTime(play.at) : "未出牌";
  }
  if (options.heldResult) {
    if (play.throwFailed) return "甩牌失败";
    if (play.throwPlay) return "甩牌成功";
    if (play.winning) return "本轮最大";
    return play.played ? "已出" : "未出牌";
  }
  if (trick.currentTurnPlayerId === play.playerId) return "当前";
  if (play.throwFailed) return "甩牌失败";
  if (play.throwPlay) return "甩牌成功";
  if (play.winning && play.played) return "当前最大";
  if (play.lead) return play.played ? "首家已出" : "首家";
  if (play.played) return `${index + 1}手已出`;
  return `${index + 1}手`;
}

function playStatusTone(trick, play, current, options = {}) {
  if (options.setupTable) return play.statusTone || "";
  if (options.heldResult && play.winning) return "accent";
  if (current && trick.currentTurnPlayerId === play.playerId) return "good";
  if (play.winning) return "accent";
  if (play.lead) return "lead";
  return "";
}

function orientPlaysForViewer(plays) {
  const viewerId = state?.viewer?.id;
  if (!viewerId || !plays.length) return plays;
  const index = plays.findIndex((play) => play.playerId === viewerId);
  if (index < 0) return plays;
  return [...plays.slice(index), ...plays.slice(0, index)];
}

function roleMark(role, playerId = "") {
  if (!role) return "";
  const text = role === "狗腿" ? "腿" : role === "庄家" || role === "主" ? "庄" : "闲";
  const tone = role === "庄家" || role === "主" || role === "狗腿" ? "accent" : "idle";
  const reveal = role === "狗腿" && doglegRevealEffects.some((effect) => effect.playerId === playerId && effect.until > Date.now());
  return `<span class="role-mark ${tone} ${reveal ? "dogleg-role-reveal" : ""}" title="${escapeHtml(role)}">${escapeHtml(text)}</span>`;
}

function roleClass(role) {
  if (role === "庄家" || role === "狗腿" || role === "主") return "banker-team";
  if (role === "闲家") return "idle-team";
  return "";
}

function avatarHtml(name, avatarUrl = "", size = "normal", avatarFrame = "") {
  const initial = String(name || "玩").trim().slice(0, 1) || "玩";
  const frameKey = AVATAR_FRAME_VALUES.has(avatarFrame) ? avatarFrame : "";
  const frameClass = frameKey ? `avatar-frame avatar-frame-${frameKey}` : "";
  const content = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" decoding="async" draggable="false">`
    : escapeHtml(initial);
  return `<span class="avatar ${size} ${frameClass}" title="${escapeHtml(name)}"><span class="avatar-core">${content}</span></span>`;
}

function normalizedCardSkin(value) {
  return CARD_SKIN_VALUES.has(value) ? value : "";
}

function cardSkinClass(value) {
  const skin = normalizedCardSkin(value);
  return skin ? `card-skin card-skin-${skin}` : "";
}

function cardSkinForPlayer(playerId) {
  return normalizedCardSkin(state?.players?.find((player) => player.id === playerId)?.cardSkin || "");
}

function viewerCardSkin() {
  return cardSkinForPlayer(state?.viewer?.id);
}

function playerIdentity(name, role, avatarUrl = "", suffix = "", playerId = "", avatarFrame = "") {
  return `
    <span class="player-identity">
      ${avatarHtml(name, avatarUrl, "small", avatarFrame)}
      ${roleMark(role, playerId)}
      <span class="name-text">${escapeHtml(`${name}${suffix}`)}</span>
    </span>
  `;
}

function playerNameWithRole(play) {
  const player = state?.players?.find((item) => item.id === play.playerId);
  return playerIdentity(play.playerName, play.role, play.avatarUrl, "", play.playerId, play.avatarFrame || player?.avatarFrame);
}

function tablePlayerIdentity(play) {
  const player = state?.players?.find((item) => item.id === play.playerId);
  const avatarFrame = play.avatarFrame || player?.avatarFrame || "";
  return `
    <span class="player-identity table-player-identity">
      <span class="table-player-avatar-stage" tabindex="0" aria-label="查看${escapeHtml(play.playerName)}的历史数据">
        ${avatarHtml(play.playerName, play.avatarUrl, "small", avatarFrame)}
        ${renderPlayerHistoryMini(play.playerId, { overlay: true })}
      </span>
      ${roleMark(play.role, play.playerId)}
      <span class="name-text">${escapeHtml(play.playerName)}</span>
    </span>
  `;
}

function renderPlayerHistoryMini(roomPlayerId, { overlay = false } = {}) {
  const player = state?.players?.find((item) => item.id === roomPlayerId);
  const className = `player-history-mini${overlay ? " overlay" : ""}`;
  if (!player || player.test) return `<div class="${className} unavailable">AI 不计历史</div>`;
  if (playerStatisticsLoading) return `<div class="${className} unavailable">历史读取中</div>`;
  const statistics = player.profileId ? playerStatistics.get(player.profileId) : null;
  if (!statistics) return `<div class="${className} unavailable">暂无历史</div>`;
  return `
    <div class="${className}" title="仅统计全真人牌局">
      <span><i>${overlay ? "局" : "总局"}</i><b>${statistics.games}</b></span>
      <span><i>${overlay ? "分" : "积分"}</i><b class="${statistics.score > 0 ? "positive" : statistics.score < 0 ? "negative" : ""}">${signedScore(null, statistics.score)}</b></span>
    </div>
  `;
}

function renderCompactPlayerStats(play, { handCount = null } = {}) {
  return `
    <div class="trick-player-stats ${handCount === null ? "" : "with-hand-count"}" aria-label="${escapeHtml(`${play.playerName || "玩家"}本局表现`)}">
      <span class="player-stat-score" title="本局获得牌分"><i>牌</i><b>${play.score || 0}</b></span>
      <span class="player-stat-red" title="被拖红五"><i>红</i><b>${play.draggedRedFives || 0}</b></span>
      <span class="player-stat-diamond" title="被拖方五"><i>方</i><b>${play.draggedDiamondFives || 0}</b></span>
      <span class="player-stat-throw" title="甩牌失败"><i>甩</i><b>${play.throwFailures || 0}</b></span>
      ${handCount === null ? "" : `<span class="player-stat-hand" title="当前手牌"><i>手</i><b>${handCount}</b></span>`}
    </div>
  `;
}

function seatStyle(index, total) {
  if (index === 0) return "--seat-x:50%;--seat-y:100%;";
  const counts = sideSeatCounts(total);
  const side = sideSeatInfo(index, counts);
  if (side.name === "right") {
    const y = sideSeatY(side.slot, counts.right, true);
    return `--seat-x:88%;--seat-y:${y.toFixed(2)}%;`;
  }
  if (side.name === "top") {
    const x = 94 - ((side.slot + 0.5) * 88) / counts.top;
    const playShift = topPlayShift(side.slot, counts.top);
    return `--seat-x:${x.toFixed(2)}%;--seat-y:9%;--play-shift-x:${playShift}px;`;
  }
  const y = sideSeatY(side.slot, counts.left);
  return `--seat-x:12%;--seat-y:${y.toFixed(2)}%;`;
}

function sideSeatY(slot, count, reverse = false) {
  const positions = count <= 1 ? [42] : [35, 54];
  const positionIndex = reverse ? positions.length - 1 - slot : slot;
  return positions[Math.max(0, Math.min(positionIndex, positions.length - 1))];
}

function topPlayShift(slot, count) {
  if (count <= 1) return 0;
  if (count === 2) return slot === 0 ? -120 : 120;
  if (count === 3) return [-84, 0, 84][slot] || 0;
  return [-72, -24, 24, 72][slot] || 0;
}

function seatZone(index, total) {
  if (index === 0) return "seat-bottom";
  return `seat-${sideSeatInfo(index, sideSeatCounts(total)).name}`;
}

function sideSeatCounts(total) {
  const others = Math.max(0, total - 1);
  const side = Math.floor(others / 3);
  const right = side;
  const left = side;
  const top = others - right - left;
  return { left, top, right };
}

function sideSeatInfo(index, counts) {
  let offset = index - 1;
  if (offset < counts.right) return { name: "right", slot: offset };
  offset -= counts.right;
  if (offset < counts.top) return { name: "top", slot: offset };
  offset -= counts.top;
  return { name: "left", slot: offset };
}

function renderHistoryDialog() {
  const history = [...(state.trickHistory || [])].reverse();
  const removedCards = state.removedCards || [];
  return `
    <div class="modal-backdrop">
      <section class="modal-card history-modal" role="dialog" aria-modal="true" aria-label="历史出牌">
        <div class="section-head">
          <div>
            <h2>历史出牌</h2>
            <div class="meta">${history.length} 轮${removedCards.length ? ` · 开局移除 ${removedCards.length} 张4` : ""}</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
        ${removedCards.length ? `
          <div class="history-removed-cards">
            <div class="section-head compact">
              <h3>开局移除的4</h3>
              <span class="tag">底牌保持 6 张</span>
            </div>
            <div class="kitty-cards">${sortCardsForPlay(removedCards).map(renderStaticCard).join("")}</div>
          </div>
        ` : ""}
        ${history.length ? `
          <div class="history">
            ${history.map((trick) => renderTrick(trick, false)).join("")}
          </div>
        ` : `<div class="empty">本局还没有完成的历史轮。</div>`}
      </section>
    </div>
  `;
}

function renderPlayer(player) {
  const isMe = state.viewer?.id === player.id;
  const isTurn = state.currentTrick?.currentTurnPlayerId === player.id;
  const isSetupTurn = state.setup?.biddingTurnPlayerId === player.id || state.setup?.fry?.currentPlayerId === player.id;
  const isBankerAction = (state.stage === "burying" || state.stage === "dogleg") && state.setup?.bankerId === player.id;
  const canKick = !isSpectating() && state.viewer?.host && !isMe && state.status === "lobby";
  return `
    <div class="player ${roleClass(player.role)}" data-player-id="${escapeHtml(player.id)}">
      <div>
        <strong class="player-name-line">${playerIdentity(player.name, player.role, player.avatarUrl, isMe ? "（我）" : "", player.id, player.avatarFrame)}</strong>
        <div class="tags">
          ${player.host ? `<span class="tag accent">房主</span>` : ""}
          ${player.test ? `<span class="tag">机器人</span>` : ""}
          ${state.status === "lobby" ? `<span class="tag ${player.ready ? "good" : ""}">${player.ready ? "已准备" : "未准备"}</span>` : ""}
          ${isTurn ? `<span class="tag good">出牌</span>` : ""}
          ${isSetupTurn || isBankerAction ? `<span class="tag good">操作</span>` : ""}
          <span class="tag ${player.connected ? "good" : ""}">${player.connected ? "在线" : "未连接"}</span>
        </div>
        ${state.status !== "lobby" ? `
          <div class="player-stats">
            <span>得分 <strong>${player.score || 0}</strong></span>
            <span>被拖红五 <strong>${player.draggedRedFives || 0}</strong></span>
            <span>被拖方五 <strong>${player.draggedDiamondFives || 0}</strong></span>
            <span>甩牌失败 <strong>${player.throwFailures || 0}</strong></span>
          </div>
        ` : ""}
      </div>
      <div class="player-side">
        <div class="meta">${state.status === "lobby" || isMe ? (player.cardCount ? `${player.cardCount} 张` : "") : ""}</div>
        ${canKick ? `<button type="button" class="secondary compact-button" data-action="kick-player">踢出</button>` : ""}
      </div>
    </div>
  `;
}

function suitColor(suit) {
  return suit === "H" || suit === "D" ? "red" : "black";
}

function currentTrumpSuit() {
  return state?.setup?.currentTrumpSuit || state?.setup?.trumpSuit || null;
}

function isCounselor(card, trumpSuit) {
  return card.type === "normal" && card.rank === "3" && trumpSuit && suitColor(card.suit) === suitColor(trumpSuit);
}

function isFixedRankCard(card) {
  const trumpSuit = currentTrumpSuit();
  const isPlaying = state?.stage === "playing";
  if (card.type === "joker") return true;
  if (card.rank === "2") return true;
  if (isPlaying && isCounselor(card, trumpSuit)) return true;
  if (isPlaying && trumpSuit && card.suit === trumpSuit) return true;
  return (card.suit === "H" && card.rank === "5") || (card.suit === "D" && card.rank === "5");
}

const suitSort = { S: 0, H: 1, C: 2, D: 3 };
const rankOrder = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const rankSort = {
  A: 0,
  K: 1,
  Q: 2,
  J: 3,
  "10": 4,
  "9": 5,
  "8": 6,
  "7": 7,
  "6": 8,
  "5": 9,
  "4": 10,
  "3": 11,
  "2": 12
};

function fixedRankSort(card) {
  const trumpSuit = currentTrumpSuit();
  if (isMainPlayCard(card, trumpSuit)) return mainCardPower(card, trumpSuit);
  return 99;
}

function sortCardsForGroup(groupId, cards) {
  return [...cards].sort((a, b) => {
    if (groupId === "rank") {
      return fixedRankSort(a) - fixedRankSort(b) || fixedRankTieSort(a, b) || a.deck - b.deck || a.id.localeCompare(b.id);
    }
    return (rankSort[a.rank] ?? 99) - (rankSort[b.rank] ?? 99) || a.deck - b.deck || a.id.localeCompare(b.id);
  });
}

function sortCardsForPlay(cards) {
  const trumpSuit = currentTrumpSuit();
  const suitOrder = { TRUMP: 0, S: 1, H: 2, C: 3, D: 4, JOKER: 5 };
  return [...cards].sort((a, b) => {
    const aSuit = playSuit(a, trumpSuit);
    const bSuit = playSuit(b, trumpSuit);
    return (suitOrder[aSuit] ?? 9) - (suitOrder[bSuit] ?? 9)
      || patternValue(a, trumpSuit) - patternValue(b, trumpSuit)
      || fixedRankTieSort(a, b)
      || (rankSort[a.rank] ?? 99) - (rankSort[b.rank] ?? 99)
      || (suitSort[a.suit] ?? 99) - (suitSort[b.suit] ?? 99)
      || a.deck - b.deck
      || a.id.localeCompare(b.id);
  });
}

function fixedRankTieSort(a, b) {
  const trumpSuit = currentTrumpSuit();
  if (a.rank === "2" && b.rank === "2") {
    const aMain = a.suit === trumpSuit ? 0 : 1;
    const bMain = b.suit === trumpSuit ? 0 : 1;
    return aMain - bMain || (suitSort[a.suit] ?? 99) - (suitSort[b.suit] ?? 99);
  }
  return 0;
}

function handGroups(hand) {
  const trumpSuit = currentTrumpSuit();
  const rankGroupLabel = state?.stage === "playing" && trumpSuit ? "主牌/比牌" : "比牌";
  const groups = [
    { id: "rank", label: rankGroupLabel, cards: [] },
    { id: "S", label: trumpSuit === "S" ? "主牌（黑桃）" : "黑桃", cards: [] },
    { id: "H", label: trumpSuit === "H" ? "主牌（红桃）" : "红桃", cards: [] },
    { id: "C", label: trumpSuit === "C" ? "主牌（草花）" : "草花", cards: [] },
    { id: "D", label: trumpSuit === "D" ? "主牌（方块）" : "方块", cards: [] }
  ];
  const byId = new Map(groups.map((group) => [group.id, group]));
  hand.forEach((card) => {
    if (isFixedRankCard(card)) byId.get("rank").cards.push(card);
    else if (byId.has(card.suit)) byId.get(card.suit).cards.push(card);
  });
  return groups
    .filter((group) => group.cards.length)
    .map((group) => ({ ...group, cards: sortCardsForGroup(group.id, group.cards) }));
}

function cardCorner(card) {
  if (card.type === "joker") {
    return `
      <span class="card-joker-face ${card.joker === "small" ? "small" : "big"}" aria-hidden="true"></span>
      <span class="card-corner joker ${card.joker === "small" ? "small" : "big"}">
        <span>JOKER</span>
      </span>
    `;
  }
  return `
    <span class="card-corner">
      <span class="card-rank">${escapeHtml(card.rank)}</span>
      ${renderCardSuit(card)}
    </span>
  `;
}

function renderCardSuit(card) {
  if (card?.suit !== "C") return `<span class="card-suit">${escapeHtml(displayCardSymbol(card))}</span>`;
  return `
    <svg class="card-suit card-suit-club" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <ellipse cx="12" cy="5.5" rx="3.1" ry="4.3"></ellipse>
      <ellipse cx="6.6" cy="10.5" rx="3.1" ry="4.1" transform="rotate(-38 6.6 10.5)"></ellipse>
      <ellipse cx="17.4" cy="10.5" rx="3.1" ry="4.1" transform="rotate(38 17.4 10.5)"></ellipse>
      <path d="M10.5 11.5c.2 3.9-1 6.7-2.8 8.5h8.6c-1.8-1.8-3-4.6-2.8-8.5z"></path>
    </svg>
  `;
}

function displayCardSymbol(card) {
  return card?.suit === "C" ? "♣" : card?.symbol || "";
}

function displayCardLabel(card) {
  if (!card) return "";
  if (card.type === "normal") return `${displayCardSymbol(card)}${card.rank || ""}`;
  return card.label || `${card.symbol || ""}${card.rank || ""}`;
}

function cardSuitClass(card) {
  return card?.type === "normal" && card.suit ? `suit-${card.suit}` : "";
}

function compactHandGroupLabel(group) {
  if (group.id === "rank") return state?.stage === "playing" ? "主" : "比";
  return ({ S: "♠", H: "♥", C: "♣", D: "♦" })[group.id] || group.label;
}

function renderHand(hand, options = {}) {
  if (!hand.length) return `<div class="empty">暂无手牌</div>`;
  const groups = handGroups(hand);
  if (options.compact) {
    const compactCards = groups.flatMap((group) => group.cards);
    return `
      <div class="hand hand-compact">
        <div class="hand-summary-line">
          <div class="hand-counts">
            ${groups.map((group) => `
              <span class="hand-count-badge suit-${escapeHtml(group.id)}" title="${escapeHtml(group.label)}">
                <span>${escapeHtml(compactHandGroupLabel(group))}</span>
                <strong>${group.cards.length}</strong>
              </span>
            `).join("")}
          </div>
          ${options.stats ? `
            <div class="hand-inline-stats">
              <span>牌分 <b>${options.stats.score || 0}</b></span>
              <span>红五 <b>${options.stats.draggedRedFives || 0}</b></span>
              <span>方五 <b>${options.stats.draggedDiamondFives || 0}</b></span>
              <span>甩失 <b>${options.stats.throwFailures || 0}</b></span>
              <span>手牌 <b>${hand.length}</b></span>
            </div>
          ` : ""}
        </div>
        <div class="hand-row hand-row-compact" data-action="clear-selection">
          ${compactCards.map((card, index) => `
            <button
              type="button"
              class="card ${card.color} ${cardSuitClass(card)} ${cardSkinClass(viewerCardSkin())} ${selectedCardIds.has(card.id) ? "selected" : ""} ${isThrowDraftCard(card.id) ? "throw-queued" : ""}"
              style="--i:${index}"
              title="${escapeHtml(displayCardLabel(card))}"
              aria-pressed="${selectedCardIds.has(card.id) ? "true" : "false"}"
              aria-disabled="${isSpectating() || isThrowDraftCard(card.id) ? "true" : "false"}"
              ${isSpectating() ? 'tabindex="-1"' : ""}
              data-action="toggle-card"
              data-card-id="${escapeHtml(card.id)}"
            >
              ${cardCorner(card)}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }
  return `
    <div class="hand">
      ${groups.map((group) => `
        <div class="hand-group">
          <div class="hand-group-title">
            <strong>${escapeHtml(group.label)}</strong>
            <span>${group.cards.length} 张</span>
          </div>
          <div class="hand-row" data-action="clear-selection">
            ${group.cards.map((card, index) => `
              <button
                type="button"
                class="card ${card.color} ${cardSuitClass(card)} ${cardSkinClass(viewerCardSkin())} ${selectedCardIds.has(card.id) ? "selected" : ""} ${isThrowDraftCard(card.id) ? "throw-queued" : ""}"
                style="--i:${index}"
                title="${escapeHtml(displayCardLabel(card))}"
                aria-pressed="${selectedCardIds.has(card.id) ? "true" : "false"}"
                aria-disabled="${isSpectating() || isThrowDraftCard(card.id) ? "true" : "false"}"
                ${isSpectating() ? 'tabindex="-1"' : ""}
                data-action="toggle-card"
                data-card-id="${escapeHtml(card.id)}"
              >
                ${cardCorner(card)}
              </button>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function playedCardEffectClass(play, card, trickNumber) {
  const classes = [];
  const doglegEffect = doglegRevealEffects.find((effect) =>
    effect.until > Date.now() && effect.playerId === play?.playerId && effect.cardId === card.id
  );
  if (doglegEffect) classes.push("dogleg-card-reveal");
  const dragged = Boolean(
    draggedFiveEffect
      && draggedFiveEffect.trickNumber === trickNumber
      && draggedFiveEffect.entries.some((entry) => entry.playerId === play?.playerId && entry.cardId === card.id)
  );
  if (dragged) {
    classes.push("dragged-five-marked");
    if (draggedFiveEffect.animateUntil > Date.now()) classes.push("dragged-five-animated");
  }
  return classes.join(" ");
}

function renderMiniCards(cards, options = {}) {
  if (!cards.length) return `<div class="meta">未出牌</div>`;
  const sortedCards = sortCardsForPlay(cards);
  const skin = options.cardSkin
    ?? options.play?.cardSkin
    ?? (options.play?.playerId ? cardSkinForPlayer(options.play.playerId) : viewerCardSkin());
  return `
    <div class="mini-cards">
      ${sortedCards.map((card, index) => `
        <span class="mini-card ${card.color} ${cardSuitClass(card)} ${cardSkinClass(skin)} ${playedCardEffectClass(options.play, card, options.trickNumber)}" style="--i:${index}" title="${escapeHtml(displayCardLabel(card))}">${cardCorner(card)}</span>
      `).join("")}
    </div>
  `;
}

function throwComponentLabel(component) {
  const pattern = component?.pattern;
  if (!pattern) return `${component?.count || 0} 张`;
  if (pattern.type === "single") return "单张";
  if (pattern.type === "multi") {
    if (pattern.width === 2) return "对子";
    if (pattern.width === 3) return "三张";
    return `${pattern.width} 张同点`;
  }
  if (pattern.type === "tractor") {
    const unit = pattern.width === 2 ? "对" : `${pattern.width}张头`;
    return `${pattern.length} 连${unit}（${pattern.count} 张）`;
  }
  return `${component?.count || pattern.count || 0} 张牌型`;
}

function renderPlayedCards(play, fallbackCards = [], trickNumber = null) {
  if (!play?.throwPlay || !play.throwComponents?.length) return renderMiniCards(fallbackCards, { play, trickNumber });
  return `
    <div class="played-throw-components" aria-label="甩牌牌型">
      ${play.throwComponents.map((component) => `
        <div class="played-throw-component">
          <span class="played-throw-label">${escapeHtml(throwComponentLabel(component))}</span>
          ${renderMiniCards(component.cards || [], { play, trickNumber })}
        </div>
      `).join("")}
    </div>
  `;
}

function renderLargePlayEffect(play, trickNumber) {
  const active = largePlayEffects.some((effect) =>
    effect.trickNumber === trickNumber && effect.playerId === play.playerId && effect.until > Date.now()
  );
  if (!active) return "";
  const rays = Array.from({ length: 8 }, (_, index) => `<i style="--ray:${index}"></i>`).join("");
  return `
    <span class="play-fireworks" aria-hidden="true">
      <span class="firework-burst firework-one">${rays}</span>
      <span class="firework-burst firework-two">${rays}</span>
      <span class="firework-burst firework-three">${rays}</span>
    </span>
  `;
}

function renderEvent(event) {
  return `
    <div class="event">
      <time>${fmtTime(event.at)}</time>
      <div>${escapeHtml(event.text)}</div>
    </div>
  `;
}

function render() {
  if (!session || !state) return renderHome();
  renderRoom();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cardIdFromEvent(event) {
  return event.target.closest("[data-card-id]")?.dataset.cardId || null;
}

function syncCardSelectionVisual(cardId) {
  if (!cardId) return;
  const selected = selectedCardIds.has(cardId);
  document.querySelectorAll("[data-card-id]").forEach((element) => {
    if (element.dataset.cardId !== cardId) return;
    element.classList.toggle("selected", selected);
    element.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function setCardSelected(cardId, selected, syncVisual = false) {
  if (!cardId) return false;
  if (selectedCardIds.has(cardId) === selected) return false;
  if (selected) selectedCardIds.add(cardId);
  else selectedCardIds.delete(cardId);
  if (syncVisual) syncCardSelectionVisual(cardId);
  return true;
}

function suppressNextCardClick() {
  suppressCardClickUntil = Date.now() + 500;
}

function shouldSuppressCardClick() {
  if (!suppressCardClickUntil) return false;
  if (Date.now() > suppressCardClickUntil) {
    suppressCardClickUntil = 0;
    return false;
  }
  suppressCardClickUntil = 0;
  return true;
}

function toggleCard(cardId) {
  if (!cardId || !viewerCanSelectCards() || isThrowDraftCard(cardId)) return;
  setCardSelected(cardId, !selectedCardIds.has(cardId));
  render();
}

function beginDragSelect(event) {
  const cardElement = event.target.closest("[data-card-id]");
  const cardId = cardElement?.dataset.cardId;
  if (!cardId || !viewerCanSelectCards() || isThrowDraftCard(cardId)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  suppressNextCardClick();
  dragSelect = {
    pointerId: event.pointerId,
    add: !selectedCardIds.has(cardId),
    moved: false,
    active: false,
    startCardId: cardId,
    lastCardId: cardId,
    startX: event.clientX,
    startY: event.clientY
  };
  setCardSelected(cardId, dragSelect.add, true);
  cardElement.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function continueDragSelect(event) {
  if (!dragSelect || event.pointerId !== dragSelect.pointerId) return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-card-id]");
  const cardId = target?.dataset.cardId;
  if (!cardId || !viewerCanSelectCards() || isThrowDraftCard(cardId)) return;
  if (!dragSelect.active) {
    const dx = event.clientX - dragSelect.startX;
    const dy = event.clientY - dragSelect.startY;
    if (Math.hypot(dx, dy) < dragSelectThreshold) return;
    dragSelect.active = true;
  }
  if (cardId === dragSelect.lastCardId) return;
  if (cardId !== dragSelect.startCardId) dragSelect.moved = true;
  dragSelect.lastCardId = cardId;
  setCardSelected(cardId, dragSelect.add, true);
}

function endDragSelect(event) {
  if (!dragSelect || event.pointerId !== dragSelect.pointerId) return;
  suppressNextCardClick();
  dragSelect = null;
  render();
}

function clearSelectionFromPageClick(event) {
  if (!selectedCardIds.size) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-card-id], button, a, input, select, textarea, label, [role="button"], [contenteditable="true"]')) {
    return false;
  }
  selectedCardIds = new Set();
  render();
  return true;
}

const mutatingActions = new Set([
  "room-leave", "dissolve-room", "call-mode-two", "call-mode-score", "dogleg-count",
  "add-robot", "random-seats", "start", "ready-on", "ready-off", "bid-selected",
  "bid-pass", "random-bid", "score-bid-start", "score-bid-10", "score-bid-20",
  "score-bid-30", "score-pass", "trump-selected", "bury-selected", "fry-selected",
  "fry-pass", "dogleg-selected", "play-selected", "confirm-throw", "reset", "play-again",
  "kick-player"
]);

function isRapidMutatingAction(action) {
  if (!mutatingActions.has(action)) return false;
  const actionAt = Date.now();
  if (actionAt - lastMutatingActionAt < 450) return true;
  lastMutatingActionAt = actionAt;
  return false;
}

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  if (form.dataset.form === "create") return createRoom(event);
  if (form.dataset.form === "join") return joinRoom(event);
  if (form.dataset.form === "update-profile") return updateProfile(event);
  if (form.dataset.form === "account-login") return loginAccount(event);
  if (form.dataset.form === "change-password") return changeAccountPassword(event);
  if (form.dataset.form === "own-avatar") return uploadOwnAvatar(event);
  if (form.dataset.form === "create-account") return createManagedAccount(event);
  if (form.dataset.form === "reset-password") return resetManagedPassword(event);
});

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) {
    clearSelectionFromPageClick(event);
    return;
  }
  if (isSpectating() && !new Set([
    "leave-spectating",
    "copy",
    "open-kitty",
    "open-history",
    "open-players",
    "open-events",
    "open-spectators",
    "open-result",
    "close-dialog",
    "clear-selection"
  ]).has(action)) return;
  if (isRapidMutatingAction(action)) return;
  if (action === "leave") clearSession();
  if (action === "leave-spectating") leaveSpectating();
  if (action === "room-leave") leaveRoom();
  if (action === "dissolve-room") dissolveRoom();
  if (action === "show-profiles") {
    homeView = "admin";
    render();
  }
  if (action === "show-login") {
    homeView = "login";
    render();
  }
  if (action === "show-account") {
    homeView = "account";
    render();
  }
  if (action === "show-admin") {
    homeView = "admin";
    render();
  }
  if (action === "logout-account") logoutAccount();
  if (action === "toggle-account") {
    const target = event.target.closest("[data-account-id]");
    toggleManagedAccount(target?.dataset.accountId || "", target?.dataset.enabled === "true");
  }
  if (action === "show-rooms") {
    homeView = "rooms";
    homeJoinOpen = false;
    render();
  }
  if (action === "show-statistics") {
    homeView = "stats";
    homeJoinOpen = false;
    render();
  }
  if (action === "sort-statistics") {
    const key = event.target.closest("[data-stat-key]")?.dataset.statKey || "";
    if (statisticsColumns().some((column) => column.key === key)) {
      if (statisticsSortKey === key) statisticsSortDirection = statisticsSortDirection === "desc" ? "asc" : "desc";
      else {
        statisticsSortKey = key;
        statisticsSortDirection = "desc";
      }
      render();
    }
  }
  if (action === "show-player-statistics") {
    showPlayerStatistics(event.target.closest("[data-account-id]")?.dataset.accountId || "");
  }
  if (action === "back-statistics") {
    statisticsSelectedAccountId = "";
    render();
  }
  if (action === "quick-create-room") createRoom();
  if (action === "open-join-room") {
    homeJoinOpen = true;
    render();
  }
  if (action === "close-home-dialog") {
    homeJoinOpen = false;
    render();
  }
  if (action === "join-listed-room") {
    const target = event.target.closest("[data-room-id]");
    joinRoomById(target?.dataset.roomId || "");
  }
  if (action === "refresh-rooms") refreshJoinableRooms();
  if (action === "spectate-player") {
    const target = event.target.closest("[data-player-id]");
    spectatePlayer(target?.dataset.roomId || "", target?.dataset.playerId || "");
  }
  if (action === "copy") copyShare();
  if (action === "call-mode-two") setCallMode("two");
  if (action === "call-mode-score") setCallMode("score");
  if (action === "dogleg-count") setDoglegCount(Number(event.target.closest("[data-count]")?.dataset.count || 0));
  if (action === "add-robot") addRobot();
  if (action === "random-seats") randomizeSeats();
  if (action === "start") startGame();
  if (action === "ready-on") setReady(true);
  if (action === "ready-off") setReady(false);
  if (action === "bid-selected") bidSelectedCards();
  if (action === "bid-pass") passBid();
  if (action === "random-bid") randomBid();
  if (action === "score-bid-start") scoreBid(0);
  if (action === "score-bid-10") scoreBid(10);
  if (action === "score-bid-20") scoreBid(20);
  if (action === "score-bid-30") scoreBid(30);
  if (action === "score-pass") passScoreBid();
  if (action === "trump-selected") revealTrumpSelectedCards();
  if (action === "open-bid-dialog") {
    activeDialog = "bid";
    render();
  }
  if (action === "bury-selected") burySelectedCards();
  if (action === "fry-selected") frySelectedCards();
  if (action === "fry-pass") passFry();
  if (action === "open-fry-dialog") {
    activeDialog = "fry";
    render();
  }
  if (action === "dogleg-selected") chooseDoglegSelectedCard();
  if (action === "play-selected") playSelectedCards();
  if (action === "enter-throw") enterThrowMode();
  if (action === "add-throw-component") addSelectedThrowComponent();
  if (action === "remove-throw-component") {
    removeThrowComponent(Number(event.target.closest("[data-component-index]")?.dataset.componentIndex));
  }
  if (action === "confirm-throw") playThrowDraft();
  if (action === "cancel-throw") cancelThrowMode();
  if (action === "reset") resetRoom();
  if (action === "play-again") playAgain();
  if (action === "open-kitty") {
    activeDialog = "kitty";
    render();
  }
  if (action === "open-history") {
    activeDialog = "history";
    render();
  }
  if (action === "open-players") {
    activeDialog = "players";
    render();
  }
  if (action === "open-spectators") {
    activeDialog = "spectators";
    render();
  }
  if (action === "open-events") {
    activeDialog = "events";
    render();
  }
  if (action === "open-result") {
    activeDialog = "result";
    dismissedResultRoomId = null;
    render();
  }
  if (action === "kick-player") {
    kickPlayer(event.target.closest("[data-player-id]")?.dataset.playerId || "");
  }
  if (action === "close-dialog") {
    if (activeDialog === "bid" || activeDialog === "fry") dismissedActionDialogKey = actionDialogKey();
    if (activeDialog === "result" || (!activeDialog && state?.stage === "finished")) dismissedResultRoomId = state?.roomId || null;
    activeDialog = null;
    render();
  }
  if (action === "toggle-card") {
    const cardId = cardIdFromEvent(event);
    if (shouldSuppressCardClick()) return;
    toggleCard(cardId);
  }
  if (action === "clear-selection") {
    if (event.target.closest("[data-card-id]")) return;
    selectedCardIds = new Set();
    render();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-card-id]")) beginDragSelect(event);
});

document.addEventListener("pointermove", continueDragSelect);
document.addEventListener("pointerup", endDragSelect);
document.addEventListener("pointercancel", endDragSelect);

document.addEventListener("visibilitychange", () => {
  if (document.hidden || !session) return;
  scheduleStateSync(0);
  if (!source) connectEvents();
});

window.addEventListener("online", () => {
  if (!session) return;
  scheduleStateSync(0);
  if (!source) connectEvents();
});

window.addEventListener("pageshow", () => {
  if (session) scheduleStateSync(0);
});

async function resume() {
  await refreshAuth().catch(() => {});
  if (!session) return render();
  try {
    applyState(await api(stateUrl(session)));
    connectEvents();
  } catch {
    const wasSpectating = Boolean(session?.spectator);
    clearSession();
    setMessage(wasSpectating ? "观战已结束，请重新选择房间和玩家。" : "本机没有可恢复的房间身份，请重新创建或加入。", true);
  }
  render();
}

resume();
