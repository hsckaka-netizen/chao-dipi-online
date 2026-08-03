import { applyStatePatch } from "./state-patch.js?v=9330552c7e1e";
import { detectNewDraggedFiveEffects, detectNewLargePlayEffects } from "./gameplay-effects.js?v=14791e626d30";
import { ASSET_URLS } from "./asset-versions.js?v=2da6575de9af";
import { createHistoryTrickEntry, filterHistoryTimelineEntries } from "./history-records.js?v=874ba3c97732";

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
  { value: "stormwind", label: "皇家蓝城邦（暴风城主题）" },
  { value: "idol", label: "剧场偶像（AKB48 主题）" },
  { value: "hellfire", label: "暗黑地狱（暗黑主题）" },
  { value: "blood-elf", label: "血精灵奥术" },
  { value: "endless-winter", label: "无尽冬日（冰雪熔炉）" },
  { value: "cr7", label: "7号传奇（C罗主题）" },
  { value: "paladin", label: "圣光骑士（魔兽圣骑士主题）" },
  { value: "warrior", label: "魔兽战士" },
  { value: "mage", label: "魔兽法师" },
  { value: "warlock", label: "魔兽术士" },
  { value: "rogue", label: "魔兽盗贼" },
  { value: "druid", label: "魔兽德鲁伊" },
  { value: "shaman", label: "魔兽萨满祭司" },
  { value: "death-knight", label: "魔兽死亡骑士" },
  { value: "vip-legend", label: "至尊星耀 VIP" },
  { value: "minions", label: "小黄人工坊（小黄人主题）" },
  { value: "usagi", label: "乌萨奇萌兔" },
  { value: "toy-story", label: "玩具总动员" }
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
const CONSUMABLE_ITEM_FALLBACKS = Object.freeze([
  { assetKey: "restart-card", name: "重开卡", description: "重开卡阶段使用，作废当前牌局并立即重新洗牌发牌。" },
  { assetKey: "war-god-card", name: "战神卡", description: "其他卡牌阶段使用，本局原始积分翻倍，额外积分由最终对方阵营承担。" },
  { assetKey: "colorful-card", name: "缤纷卡", description: "其他卡牌阶段使用，随机改变炒底阶段四种花色 2 的压制顺序，最后一次结果生效。" },
  { assetKey: "luck-card", name: "牌运卡", description: "其他卡牌阶段使用，本局头像展示牌运之神的庇佑效果。" }
]);
const RESTART_CARD_STAGE = "restart-card-using";
const OTHER_CARDS_STAGE = "other-cards-using";
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
let autoFollowSelectionKey = "";
let throwDraftComponents = null;
let dragSelect = null;
let suppressCardClickUntil = 0;
let activeDialog = null;
let pendingRoomAction = "";
let historyFilter = "all";
let dismissedActionDialogKey = null;
let dismissedResultRoomId = null;
let messageTimer = null;
let actionDialogResumeTimer = null;
let actionPassInFlight = false;
let actionDialogTemporarilyBlocked = false;
let buryInFlight = false;
let tauntInFlight = false;
let scoreBidAutoPassTimer = null;
let setupCountdownRenderTimer = null;
let setupCountdownRenderKey = "";
let setupCountdownExpiredSyncKey = "";
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
const statisticsPlayerGameLists = new Map();
const statisticsGameLogs = new Map();
let statisticsGameDate = "";
let statisticsPlayerGamesLoadingKey = "";
let statisticsGameLogId = "";
let statisticsGameLogLoadingId = "";
const statisticsRelationshipSorts = {
  bonds: { key: "games_played", direction: "desc" },
  opponents: { key: "games_played", direction: "desc" }
};
let statisticsSeasonId = "all";
let statisticsSeasons = [];
let statisticsSeasonsLoaded = false;
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
let diamondWallet = null;
let diamondWalletLoading = false;
let diamondWalletAccountId = "";
let shopState = null;
let shopStateLoading = false;
let shopStateAccountId = "";
let shopPurchaseInFlight = "";
let avatarFrameEquipInFlight = "";
let itemUseInFlight = "";
let adminData = null;
let adminDataLoading = false;
let adminTaunts = null;
let adminTauntsLoading = false;
let adminShop = null;
let adminShopLoading = false;
const adminOpenModules = new Set();
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
  clearSetupCountdownRenderTimer();
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
  tauntInFlight = false;
  itemUseInFlight = "";
  stateSyncInFlight = false;
  lastEventReceivedAt = 0;
  source = null;
  state = null;
  selectedCardIds = new Set();
  autoFollowSelectionKey = "";
  pendingRoomAction = "";
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
  syncCardSelectionForState();
  const viewerReward = nextState?.result?.playerResults
    ?.find((player) => player.playerId === nextState?.viewer?.id)
    ?.diamondReward;
  if (viewerReward?.status === "awarded" && Number.isFinite(Number(viewerReward.balanceAfter))) {
    diamondWallet = {
      ...(diamondWallet || {}),
      balance: Number(viewerReward.balanceAfter),
      rulesVersion: viewerReward.rulesVersion
    };
  }
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
  scheduleSetupCountdownRender();
  if (options.highlightNewKitty === false || !shouldHighlightNewKitty(nextState)) return false;
  const newCardIds = (nextState.hand || [])
    .filter((card) => !previousHandIds.has(card.id))
    .map((card) => card.id);
  if (!newCardIds.length) return false;
  selectedCardIds = new Set(newCardIds);
  return true;
}

function followSelectionKey(lead) {
  if (!lead || !viewerNeedsFollow(lead) || state?.stage !== "playing" || !state.currentTrick) return "";
  return [
    state.roomId,
    state.currentTrick.number,
    state.viewer?.id || "",
    lead.suit || "mixed",
    lead.count
  ].join(":");
}

function syncCardSelectionForState() {
  const hand = state?.hand || [];
  const handIds = new Set(hand.map((card) => card.id));
  let nextSelection = [...selectedCardIds].filter((cardId) => handIds.has(cardId));
  const lead = state?.stage === "playing" ? leadInfoFromSnapshot(state.currentTrick) : null;
  const key = followSelectionKey(lead);
  if (!lead || !key) {
    selectedCardIds = new Set(nextSelection);
    autoFollowSelectionKey = "";
    return;
  }

  if (key !== autoFollowSelectionKey && lead.suit) {
    const routeCardIds = hand
      .filter((card) => playSuit(card) === lead.suit)
      .map((card) => card.id);
    if (routeCardIds.length <= lead.count) {
      const requiredIds = new Set(routeCardIds);
      nextSelection = [
        ...routeCardIds,
        ...nextSelection.filter((cardId) => !requiredIds.has(cardId))
      ];
    }
  }
  selectedCardIds = new Set(nextSelection.slice(0, lead.count));
  autoFollowSelectionKey = key;
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
    const newDraggedFiveEffects = detectNewDraggedFiveEffects(previousState, nextState, nowMs);

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

    if (newDraggedFiveEffects.length && nextState.status !== "lobby") {
      const trickNumber = Math.max(...newDraggedFiveEffects.map((effect) => effect.trickNumber));
      const latestEffects = newDraggedFiveEffects.filter((effect) => effect.trickNumber === trickNumber);
      const previousEntries = draggedFiveEffect?.trickNumber === trickNumber ? draggedFiveEffect.entries : [];
      const entriesByKey = new Map(previousEntries.map((entry) => [`${entry.playerId}:${entry.cardId}`, entry]));
      latestEffects.forEach((effect) => entriesByKey.set(`${effect.playerId}:${effect.cardId}`, effect));
      draggedFiveEffect = {
        trickNumber,
        entries: [...entriesByKey.values()],
        animateUntil: Math.max(...latestEffects.map((effect) => effect.until))
      };
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
  if (previousState.stage === RESTART_CARD_STAGE && nextState.stage === OTHER_CARDS_STAGE) {
    return "重开卡阶段结束，进入其他卡牌使用阶段。";
  }
  if (previousState.stage === OTHER_CARDS_STAGE && nextState.stage === "score-bidding") {
    return "卡牌使用阶段结束，开始叫庄。";
  }
  if (previousState.stage === "bidding" && nextState.stage === "burying") {
    return `叫主成功：${nextState.setup?.bankerName || "庄家"} 成为庄家，已拿底等待贴底。`;
  }
  if (previousState.stage === "score-bidding" && nextState.stage === "trump-selecting") {
    const score = nextState.setup?.scoreBid?.currentScore || "";
    return `叫分结束：${nextState.setup?.bankerName || "庄家"} ${score ? `以 ${score} 分` : ""}成为庄家，等待选择主花色。`;
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

function resetDiamondWallet() {
  diamondWallet = null;
  diamondWalletLoading = false;
  diamondWalletAccountId = "";
}

function resetShopState() {
  shopState = null;
  shopStateLoading = false;
  shopStateAccountId = "";
  shopPurchaseInFlight = "";
  avatarFrameEquipInFlight = "";
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ensureShopState(force = false) {
  const account = authState.account;
  if (!account || account.role !== "player") {
    if (shopStateAccountId) resetShopState();
    return;
  }
  if (shopStateAccountId !== account.id) {
    resetShopState();
    shopStateAccountId = account.id;
  }
  if (shopStateLoading || (!force && shopState)) return;
  shopStateLoading = true;
  api("/api/shop/me")
    .then((data) => {
      if (authState.account?.id !== account.id) return;
      shopState = data;
      shopStateLoading = false;
      render();
    })
    .catch((error) => {
      if (authState.account?.id !== account.id) return;
      shopStateLoading = false;
      shopState = { unavailable: true, products: [], entitlements: {}, inventory: {} };
      if (homeView === "shop" || homeView === "inventory") setMessage(error.message || "商城与背包暂不可用", true);
      render();
    });
}

function ensureDiamondWallet(force = false) {
  const account = authState.account;
  if (!account || account.role !== "player") {
    if (diamondWalletAccountId) resetDiamondWallet();
    return;
  }
  if (diamondWalletAccountId !== account.id) {
    diamondWallet = null;
    diamondWalletLoading = false;
    diamondWalletAccountId = account.id;
  }
  if (diamondWalletLoading || (!force && diamondWallet)) return;
  diamondWalletLoading = true;
  api("/api/diamonds/me?limit=10")
    .then((data) => {
      if (authState.account?.id !== account.id) return;
      diamondWallet = data;
      diamondWalletLoading = false;
      render();
    })
    .catch(() => {
      if (authState.account?.id !== account.id) return;
      diamondWalletLoading = false;
      diamondWallet = { unavailable: true };
      render();
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

function ensureAdminTaunts(force = false) {
  if (authState.account?.role !== "admin" || adminTauntsLoading || (!force && adminTaunts)) return;
  adminTauntsLoading = true;
  api("/api/admin/taunts")
    .then((data) => {
      adminTaunts = data;
      adminTauntsLoading = false;
      render();
    })
    .catch((error) => {
      adminTauntsLoading = false;
      setMessage(error.message || "嘲讽词读取失败", true);
    });
}

function ensureAdminShop(force = false) {
  if (authState.account?.role !== "admin" || adminShopLoading || (!force && adminShop)) return;
  adminShopLoading = true;
  api("/api/admin/shop")
    .then((data) => {
      adminShop = data;
      adminShopLoading = false;
      render();
    })
    .catch((error) => {
      adminShopLoading = false;
      setMessage(error.message || "商城管理数据读取失败", true);
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
    resetDiamondWallet();
    resetShopState();
    homeView = data.account?.role === "admin" ? "admin" : "rooms";
    adminData = null;
    adminTaunts = null;
    adminShop = null;
    adminOpenModules.clear();
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
  resetDiamondWallet();
  resetShopState();
  adminData = null;
  adminTaunts = null;
  adminTauntsLoading = false;
  adminShop = null;
  adminShopLoading = false;
  adminOpenModules.clear();
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
    adminTaunts = null;
    formEl.reset();
    setMessage("玩家账号已创建。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function tauntPayloadFromContainer(container) {
  return {
    text: container.querySelector('input[name="text"]')?.value || "",
    enabled: Boolean(container.querySelector('input[name="enabled"]')?.checked),
    availableToAll: Boolean(container.querySelector('input[name="availableToAll"]')?.checked),
    accountIds: [...container.querySelectorAll('input[name="accountIds"]:checked:not(:disabled)')].map((input) => input.value)
  };
}

function setModuleSaveState(formEl, saving) {
  const button = formEl?.querySelector("[data-module-save]");
  if (!button) return;
  if (saving) {
    button.dataset.idleLabel = button.textContent;
    button.textContent = "保存中…";
    button.disabled = true;
    return;
  }
  button.textContent = button.dataset.idleLabel || "保存";
  button.disabled = false;
}

async function createManagedTaunt(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  try {
    adminTaunts = await api("/api/admin/taunts", {
      method: "POST",
      body: JSON.stringify(tauntPayloadFromContainer(formEl))
    });
    formEl.reset();
    syncTauntAudienceInputs(formEl);
    setMessage("嘲讽词已添加。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function saveManagedTaunts(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const rows = [...formEl.querySelectorAll("[data-taunt-row]")];
  if (!rows.length) return setMessage("暂无可保存的嘲讽词。", true);
  setModuleSaveState(formEl, true);
  try {
    let latest = adminTaunts;
    for (const row of rows) {
      latest = await api(`/api/admin/taunts/${encodeURIComponent(row.dataset.tauntId || "")}`, {
        method: "PATCH",
        body: JSON.stringify(tauntPayloadFromContainer(row))
      });
    }
    adminTaunts = latest;
    setMessage(`已统一保存 ${rows.length} 条嘲讽词设置。`, false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setModuleSaveState(formEl, false);
  }
}

async function deleteManagedTaunt(tauntId) {
  if (!tauntId || !window.confirm("确定删除这条嘲讽词吗？删除后所有玩家立即不可再用。")) return;
  try {
    adminTaunts = await api(`/api/admin/taunts/${encodeURIComponent(tauntId)}`, {
      method: "DELETE"
    });
    setMessage("嘲讽词已删除。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function syncTauntAudienceInputs(formEl) {
  if (!formEl) return;
  const availableToAll = Boolean(formEl.querySelector('input[name="availableToAll"]')?.checked);
  formEl.querySelectorAll('input[name="accountIds"]').forEach((input) => {
    input.disabled = availableToAll;
  });
}

function updateTauntAudienceSummary(container) {
  if (!container) return;
  const availableToAll = Boolean(container.querySelector('input[name="availableToAll"]')?.checked);
  const selectedCount = [...container.querySelectorAll('input[name="accountIds"]')]
    .filter((input) => input.checked).length;
  const summary = container.querySelector("[data-taunt-audience-summary]");
  if (summary) summary.textContent = availableToAll ? "所有玩家" : `指定 ${selectedCount} 人`;
}

async function toggleManagedAccount(accountId, enabled) {
  try {
    adminData = await api(`/api/admin/accounts/${encodeURIComponent(accountId)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled })
    });
    adminTaunts = null;
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

function seasonPayloadFromContainer(container) {
  const startsAt = String(container.querySelector('[name="startsAt"]')?.value || "");
  const endsAt = String(container.querySelector('[name="endsAt"]')?.value || "");
  return {
    name: container.querySelector('[name="name"]')?.value || "",
    startsAt: startsAt ? new Date(startsAt).toISOString() : "",
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    isActive: Boolean(container.querySelector('[name="isActive"]')?.checked)
  };
}

async function saveSeasonForm(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  try {
    const data = await api("/api/admin/seasons", {
      method: "POST",
      body: JSON.stringify(seasonPayloadFromContainer(formEl))
    });
    statisticsSeasons = data.seasons || [];
    statisticsSeasonsLoaded = true;
    playerStatisticsLoaded = false;
    statisticsPlayerDetails.clear();
    formEl.reset();
    setMessage("赛季已创建。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function saveManagedSeasons(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const rows = [...formEl.querySelectorAll("[data-season-id]")];
  if (!rows.length) return setMessage("暂无可保存的赛季。", true);
  setModuleSaveState(formEl, true);
  try {
    let data = { seasons: statisticsSeasons };
    for (const row of rows) {
      data = await api(`/api/admin/seasons/${encodeURIComponent(row.dataset.seasonId || "")}`, {
        method: "PATCH",
        body: JSON.stringify(seasonPayloadFromContainer(row))
      });
    }
    statisticsSeasons = data.seasons || [];
    statisticsSeasonsLoaded = true;
    playerStatisticsLoaded = false;
    statisticsPlayerDetails.clear();
    setMessage(`已统一保存 ${rows.length} 个赛季设置。`, false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setModuleSaveState(formEl, false);
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

function ensurePlayerStatistics(force = false) {
  if ((!force && playerStatisticsLoaded) || playerStatisticsLoading) return;
  playerStatisticsLoading = true;
  const requestedSeasonId = statisticsSeasonId;
  Promise.all([
    api(`/api/history/statistics?seasonId=${encodeURIComponent(requestedSeasonId)}`),
    statisticsSeasonsLoaded
      ? Promise.resolve({ seasons: statisticsSeasons })
      : api("/api/history/seasons").catch(() => ({ seasons: [] })),
    api("/api/history/status").catch(() => null)
  ])
    .then(([data, seasonData, status]) => {
      if (requestedSeasonId !== statisticsSeasonId) {
        playerStatisticsLoading = false;
        return ensurePlayerStatistics(true);
      }
      playerStatisticsRows = data.players || [];
      if (requestedSeasonId === "all") {
        playerStatistics = new Map(playerStatisticsRows.map((row) => [row.profile_id, {
          games: Number(row.games_played) || 0,
          score: Number(row.total_score) || 0
        }]));
      }
      statisticsSeasons = seasonData.seasons || [];
      statisticsSeasonsLoaded = true;
      historyStatus = status;
      playerStatisticsLoaded = true;
      playerStatisticsLoading = false;
      render();
    })
    .catch(() => {
      playerStatisticsLoaded = true;
      playerStatisticsLoading = false;
      if (requestedSeasonId !== statisticsSeasonId) {
        playerStatisticsLoaded = false;
        return ensurePlayerStatistics(true);
      }
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
  const profileId = authState.legacyProfileSelection && !authState.account ? "player-benlei" : null;
  try {
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify(profileId ? { profileId } : {})
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
  if (authState.legacyProfileSelection) return true;
  homeJoinOpen = false;
  homeView = "login";
  setMessage(authState.account?.role === "admin" ? "管理员账号不能加入牌局" : "请先登录玩家账号", true);
  return false;
}

async function joinRoomById(roomId) {
  const normalizedRoomId = String(roomId || "").trim().toUpperCase();
  if (!normalizedRoomId) return setMessage("请输入房间号", true);
  if (!requirePlayerLogin()) return;
  const profileId = authState.legacyProfileSelection && !authState.account ? "player-benlei" : null;
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(normalizedRoomId)}/join`, {
      method: "POST",
      body: JSON.stringify(profileId ? { profileId } : {})
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

async function saveManagedProfiles(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const rows = [...formEl.querySelectorAll("[data-profile-id]")];
  const changedRows = rows.filter((row) => {
    const name = row.querySelector('[name="name"]')?.value || "";
    const playEffect = row.querySelector('[name="playEffect"]')?.value || "";
    const avatar = row.querySelector('[name="avatar"]')?.files?.[0];
    return name !== (row.dataset.originalName || "")
      || playEffect !== (row.dataset.originalPlayEffect || "")
      || Boolean(avatar?.size);
  });
  if (!changedRows.length) return setMessage("玩家资料没有需要保存的修改。", false);
  setModuleSaveState(formEl, true);
  try {
    for (const row of changedRows) {
      const profileId = row.dataset.profileId || "";
      await api(`/api/players/${encodeURIComponent(profileId)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: row.querySelector('[name="name"]')?.value || "",
          playEffect: row.querySelector('[name="playEffect"]')?.value || ""
        })
      });
      const avatarFile = row.querySelector('[name="avatar"]')?.files?.[0];
      if (avatarFile?.size) {
        const avatarDataUrl = await prepareAvatarDataUrl(avatarFile);
        await api(`/api/admin/profiles/${encodeURIComponent(profileId)}/avatar`, {
          method: "POST",
          body: JSON.stringify({ avatarDataUrl })
        });
      }
    }
    adminData = await api("/api/admin/accounts");
    profiles = adminData.profiles || [];
    profilesLoaded = true;
    setMessage(`已统一保存 ${changedRows.length} 位玩家的资料。`, false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setModuleSaveState(formEl, false);
  }
}

async function purchaseShopItem(productId) {
  if (!productId || shopPurchaseInFlight) return;
  shopPurchaseInFlight = productId;
  render();
  try {
    const data = await api("/api/shop/purchases", {
      method: "POST",
      body: JSON.stringify({ productId, requestId: requestId() })
    });
    shopState = data;
    if (diamondWallet) diamondWallet.balance = data.balance;
    setMessage("购买成功，商品已经发放。", false);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    shopPurchaseInFlight = "";
    render();
  }
}

async function equipAvatarFrame(avatarFrame) {
  const profile = authState.account?.profile;
  if (!profile || avatarFrameEquipInFlight || profile.avatarFrame === avatarFrame) return;
  avatarFrameEquipInFlight = avatarFrame;
  render();
  try {
    const data = await api("/api/cosmetics/me", {
      method: "PATCH",
      body: JSON.stringify({ avatarFrame, cardSkin: profile.cardSkin || "" })
    });
    shopState = data;
    authState.account = data.account;
    setMessage("头像框已经佩戴，牌桌和房间列表会同步展示。", false);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    avatarFrameEquipInFlight = "";
    render();
  }
}

async function saveOwnCosmetics(event) {
  event.preventDefault();
  const form = new FormData(event.target.closest("form"));
  try {
    const data = await api("/api/cosmetics/me", {
      method: "PATCH",
      body: JSON.stringify({ avatarFrame: form.get("avatarFrame"), cardSkin: form.get("cardSkin") })
    });
    shopState = data;
    authState.account = data.account;
    setMessage("当前皮肤已经保存。", false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function saveShopProducts(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const changes = [...formEl.querySelectorAll("[data-product-id]")].map((row) => ({
    productId: row.dataset.productId || "",
    price: Number(row.querySelector('[name="price"]')?.value),
    isListed: Boolean(row.querySelector('[name="isListed"]')?.checked),
    originalPrice: Number(row.dataset.originalPrice),
    originalListed: row.dataset.originalListed === "true"
  })).filter((product) =>
    product.price !== product.originalPrice || product.isListed !== product.originalListed
  );
  if (!changes.length) return setMessage("商品设置没有需要保存的修改。", false);
  setModuleSaveState(formEl, true);
  try {
    adminShop = await api("/api/admin/shop", {
      method: "PATCH",
      body: JSON.stringify({
        products: changes.map(({ productId, price, isListed }) => ({ productId, price, isListed }))
      })
    });
    setMessage(`已统一保存 ${changes.length} 项商品修改。`, false);
    render();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setModuleSaveState(formEl, false);
  }
}

async function grantShopCosmetic(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const form = new FormData(formEl);
  try {
    const result = await api("/api/admin/cosmetics/grants", {
      method: "POST",
      body: JSON.stringify({
        accountId: form.get("accountId"),
        productId: form.get("productId"),
        reason: form.get("reason"),
        requestId: requestId()
      })
    });
    if (result.products) adminShop.products = result.products;
    setMessage(result.granted ? "皮肤已经发放。" : "该玩家已经拥有这件皮肤。", false);
    formEl.reset();
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function grantAdminDiamonds(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const form = new FormData(formEl);
  const accountId = String(form.get("accountId") || "");
  const amount = Number(form.get("amount"));
  const note = String(form.get("note") || "").trim();
  const accountLabel = formEl.querySelector('[name="accountId"]')?.selectedOptions?.[0]?.textContent?.trim() || "该玩家";
  if (!accountId || !Number.isInteger(amount) || amount <= 0) {
    return setMessage("请选择玩家并填写正确的钻石数量。", true);
  }
  if (!window.confirm(`确认给 ${accountLabel} 发放 ${amount} 钻石吗？发放后会立即到账并写入流水。`)) return;
  const signature = JSON.stringify({ accountId, amount, note });
  if (formEl.dataset.grantSignature !== signature) {
    formEl.dataset.grantSignature = signature;
    formEl.dataset.requestId = requestId();
  }
  setModuleSaveState(formEl, true);
  try {
    const result = await api("/api/admin/diamonds/grants", {
      method: "POST",
      body: JSON.stringify({
        accountId,
        amount,
        note,
        requestId: formEl.dataset.requestId
      })
    });
    const grant = result.grant || {};
    setMessage(
      grant.repeated
        ? `该笔发放已经处理，玩家当前余额为 ${grant.balanceAfter || 0} 钻石。`
        : `已向 ${result.account?.profile?.name || result.account?.username || accountLabel} 发放 ${grant.amount || amount} 钻石，余额 ${grant.balanceAfter || 0}。`,
      false
    );
    formEl.reset();
    delete formEl.dataset.grantSignature;
    delete formEl.dataset.requestId;
    render();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setModuleSaveState(formEl, false);
  }
}

async function useGameItem(itemId) {
  if (!session || isSpectating() || itemUseInFlight) return;
  if (itemId === "restart-card" && !window.confirm("使用重开卡会立即作废当前牌局并重新发牌，确定使用吗？")) return;
  const freeUse = Boolean(state?.gameItems?.freeUse);
  itemUseInFlight = itemId;
  render();
  try {
    await roomAction(`/api/rooms/${session.roomId}/item-use`, {
      method: "POST",
      body: JSON.stringify({
        playerId: session.playerId,
        token: session.token,
        itemId,
        requestId: requestId()
      })
    });
    if (itemId === "restart-card") activeDialog = null;
    ensureShopState(true);
    const successText = state?.notice?.text || (itemId === "restart-card" ? "重开卡已生效，牌局已经重新发牌。" : "对局道具已生效。");
    setMessage(freeUse ? `${successText} 本局含 AI，不消耗卡片。` : successText, false);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    itemUseInFlight = "";
    render();
  }
}

async function completeGameItemStage() {
  if (!session || isSpectating() || state?.gameItems?.viewerCompleted) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/item-stage-complete`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    });
    activeDialog = null;
    setMessage(state?.stage === OTHER_CARDS_STAGE ? "已进入其他卡牌使用阶段。" : "已完成卡牌选择。");
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

async function setOpeningBidPercent(percent) {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/opening-bid-percent`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, percent })
    });
    setMessage(`起始叫分已设置为总牌分的 ${state.openingBidPercent || percent}%。`);
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
      ? `叫分结束：${state.setup?.bankerName || "庄家"} 成为庄家，等待选择主花色。`
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
      ? `叫分结束：${state.setup?.bankerName || "庄家"} 成为庄家，等待选择主花色。`
      : "已过，不加分。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function selectTrumpSuit(suit) {
  if (!session) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/trump`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, suit })
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

async function setAutoPlay(enabled) {
  if (!session || isSpectating()) return;
  try {
    await roomAction(`/api/rooms/${session.roomId}/auto-play`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, enabled })
    });
    if (enabled) {
      selectedCardIds = new Set();
      throwDraftComponents = null;
    }
    setMessage(enabled ? "已开启托管，轮到你时会从小到大自动出牌。" : "已取消托管。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function sendTaunt(presetId) {
  if (!session || isSpectating() || tauntInFlight) return;
  tauntInFlight = true;
  render();
  try {
    await roomAction(`/api/rooms/${session.roomId}/taunt`, {
      method: "POST",
      body: JSON.stringify({
        playerId: session.playerId,
        token: session.token,
        presetId
      })
    });
    activeDialog = null;
    setMessage("嘲讽已发送，牌桌上的玩家都能看到。");
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    tauntInFlight = false;
    render();
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
    setMessage("已进入下一局准备页。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function openRoomActionConfirm(action) {
  if (isSpectating() || !state?.viewer?.host) return;
  if (action === "reset" && state.status !== "dealt") return;
  if (action !== "reset" && action !== "dissolve") return;
  pendingRoomAction = action;
  activeDialog = "room-action-confirm";
  render();
}

async function confirmRoomAction() {
  const action = pendingRoomAction;
  pendingRoomAction = "";
  activeDialog = null;
  if (action === "reset") await resetRoom();
  if (action === "dissolve") await dissolveRoom();
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
    && state.stage === "lobby"
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

function viewerEnteredNextRound() {
  return !isSpectating() && state?.stage === "finished" && Boolean(state?.viewer?.nextRoundEntered);
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

function setupSecondsLeft(deadline) {
  if (!deadline) return null;
  const deadlineMs = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return null;
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

function setupCountdownText(deadline, suffix = "", prefix = "") {
  const secondsLeft = setupSecondsLeft(deadline);
  if (secondsLeft === null) return "";
  return `${prefix}${secondsLeft}s${suffix}`;
}

function setupCountdownAttributes(deadline, suffix = "", prefix = "") {
  if (!deadline) return "";
  return `data-countdown-deadline="${escapeHtml(deadline)}" data-countdown-suffix="${escapeHtml(suffix)}" data-countdown-prefix="${escapeHtml(prefix)}"`;
}

function setupCountdownTag(deadline, suffix = "", prefix = "") {
  const text = setupCountdownText(deadline, suffix, prefix);
  if (!text) return "";
  return `<span class="tag" ${setupCountdownAttributes(deadline, suffix, prefix)}>${escapeHtml(text)}</span>`;
}

function refreshSetupCountdownDisplays() {
  document.querySelectorAll("[data-countdown-deadline]").forEach((element) => {
    const text = setupCountdownText(
      element.dataset.countdownDeadline || "",
      element.dataset.countdownSuffix || "",
      element.dataset.countdownPrefix || ""
    );
    if (text) element.textContent = text;
  });
}

function scoreBidSecondsLeft() {
  return setupSecondsLeft(state?.setup?.scoreBid?.deadlineAt);
}

function frySecondsLeft() {
  return setupSecondsLeft(state?.setup?.fry?.deadlineAt);
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

function currentSetupCountdownDeadline() {
  if (state?.stage === RESTART_CARD_STAGE || state?.stage === OTHER_CARDS_STAGE) {
    return state.gameItems?.deadlineAt || null;
  }
  if (state?.stage === "score-bidding") return state.setup?.scoreBid?.deadlineAt || null;
  if (state?.stage === "frying") return state.setup?.fry?.deadlineAt || null;
  return null;
}

function currentSetupCountdownKey() {
  const deadline = currentSetupCountdownDeadline();
  if (!deadline) return "";
  return `${state?.roomId || ""}:${state?.stage || ""}:${deadline}`;
}

function clearSetupCountdownRenderTimer() {
  if (setupCountdownRenderTimer) window.clearInterval(setupCountdownRenderTimer);
  setupCountdownRenderTimer = null;
  setupCountdownRenderKey = "";
  setupCountdownExpiredSyncKey = "";
}

function scheduleSetupCountdownRender() {
  const key = currentSetupCountdownKey();
  if (!key) {
    clearSetupCountdownRenderTimer();
    return;
  }
  if (setupCountdownRenderTimer && setupCountdownRenderKey === key) return;
  if (setupCountdownRenderTimer) window.clearInterval(setupCountdownRenderTimer);
  setupCountdownRenderKey = key;
  setupCountdownExpiredSyncKey = "";
  refreshSetupCountdownDisplays();
  setupCountdownRenderTimer = window.setInterval(() => {
    const nextKey = currentSetupCountdownKey();
    if (!nextKey) {
      clearSetupCountdownRenderTimer();
      return;
    }
    refreshSetupCountdownDisplays();
    const secondsLeft = setupSecondsLeft(currentSetupCountdownDeadline());
    if (secondsLeft === 0 && setupCountdownExpiredSyncKey !== nextKey) {
      setupCountdownExpiredSyncKey = nextKey;
      scheduleStateSync(0);
    }
  }, 1000);
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
  return !isSpectating() && (state?.stage === "playing" || viewerCanBid() || viewerCanBury() || viewerCanFry() || viewerCanChooseDogleg());
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

function currentFrySuitStrength() {
  const order = state?.gameItems?.frySuitOrder;
  if (!Array.isArray(order) || order.length !== 4 || new Set(order).size !== 4) return null;
  return Object.fromEntries(order.map((suit, index) => [suit, order.length - index - 1]));
}

function colorfulFryOrderText() {
  const names = state?.gameItems?.frySuitOrderNames;
  return Array.isArray(names) && names.length === 4 ? names.join(" ＞ ") : "";
}

function bidBeats(current, next, suitStrength = { D: 0, C: 1, H: 2, S: 3 }) {
  if (!current) return next.count >= 1;
  if (current.direct) return next.count >= 2;
  if (current.count === 1) return next.count >= 2;
  if (next.count > current.count) return true;
  if (next.count < current.count) return false;
  return (suitStrength[next.suit] ?? -1) > (suitStrength[current.suit] ?? -1);
}

function validateBidLikeSelection(type) {
  if (type === "bid" && !viewerCanBid()) return { ok: false, reason: "还没轮到你叫主/抢主" };
  if (type === "fry" && !viewerCanFry()) return { ok: false, reason: "还没轮到你炒底" };
  if (type === "trump" && !viewerCanRevealTrump()) return { ok: false, reason: "还没轮到你选择主花色" };

  const cards = selectedCards();
  if (!cards.length) return { ok: false, reason: "请选择同一花色的 2" };
  if (!cards.every(isTwoCard)) return { ok: false, reason: "只能选择 2" };
  const suits = uniqueFollowSuits(cards);
  if (suits.length !== 1) return { ok: false, reason: "必须选择同一花色的 2" };

  const bid = { count: cards.length, suit: suits[0] };
  const current = type === "bid" ? state.setup?.bid : type === "fry" ? state.setup?.fry?.lastBid : null;
  const frySuitStrength = type === "fry" ? currentFrySuitStrength() : null;
  if (!bidBeats(current, bid, frySuitStrength || undefined)) {
    if (current?.direct) return { ok: false, reason: "定主后首轮炒底至少需要 2 张同花色 2" };
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
    playerId: lead.playerId,
    count: lead.cards.length,
    suit: suits.length === 1 ? suits[0] : null,
    pattern: detectPlayPattern(lead.cards)
  };
}

function viewerNeedsFollow(lead) {
  return Boolean(
    lead
    && !isSpectating()
    && lead.playerId !== state?.viewer?.id
    && !viewerPlayedCurrent()
  );
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

function viewerAutoPlayEnabled() {
  return Boolean(viewerPlayer()?.autoPlayEnabled);
}

function renderAutoPlayControl() {
  if (isSpectating() || state?.stage !== "playing") return "";
  const enabled = viewerAutoPlayEnabled();
  return `
    <button
      type="button"
      class="secondary auto-play-toggle ${enabled ? "active" : ""}"
      data-action="${enabled ? "auto-play-off" : "auto-play-on"}"
      aria-pressed="${enabled ? "true" : "false"}"
      title="${enabled ? "取消后恢复手动出牌" : "轮到你时按规则从小到大自动出牌"}"
    >${enabled ? "取消托管" : "托管"}</button>
  `;
}

function renderAutoPlayMark(player) {
  return player?.autoPlayEnabled
    ? `<span class="auto-play-mark" title="该玩家已开启自动出牌">托管中</span>`
    : "";
}

function renderTauntControl() {
  if (isSpectating() || state?.stage !== "playing") return "";
  return `
    <button
      type="button"
      class="secondary taunt-toggle"
      data-action="open-taunts"
      aria-haspopup="dialog"
      title="发送一条预设嘲讽词"
    >嘲讽</button>
  `;
}

function renderGameItemControl() {
  if (isSpectating() || !state?.gameItems?.canUse) return "";
  const available = Object.values(shopState?.inventory || {}).reduce((total, item) => total + Number(item?.available || 0), 0);
  const stageLabel = state.gameItems?.stageType === RESTART_CARD_STAGE ? "选择重开卡" : "选择卡牌";
  return `
    <button
      type="button"
      class="secondary item-use-toggle"
      data-action="open-items"
      aria-haspopup="dialog"
      title="在当前卡牌使用阶段选择对局道具"
    >${escapeHtml(stageLabel)}${available ? ` ${available}` : ""}</button>
  `;
}

function followSelectionLimit() {
  if (state?.stage !== "playing") return null;
  const lead = leadInfoFromSnapshot(state.currentTrick);
  return viewerNeedsFollow(lead) ? lead.count : null;
}

function selectedCountLabel() {
  const limit = followSelectionLimit();
  return limit === null ? `${selectedCardIds.size} 张已选` : `已选 ${selectedCardIds.size}/${limit}`;
}

function selectionLimitMessage() {
  const limit = followSelectionLimit();
  return limit === null ? "" : `本轮需跟 ${limit} 张，不能继续选牌`;
}

function renderHandControls(action) {
  if (action) {
    if (action.throwMode) {
      const reason = selectedCardIds.size
        ? (!action.enabled ? action.reason : "")
        : (!action.throwEnabled ? action.throwReason : "");
      return `
        <div class="row hand-controls throw-controls">
          <span class="tag">${escapeHtml(selectedCountLabel())}</span>
          <button type="button" data-action="add-throw-component" ${action.enabled ? "" : "disabled"}>加入牌型</button>
          <button type="button" data-action="confirm-throw" ${action.throwEnabled ? "" : "disabled"}>确认甩牌</button>
          <button type="button" class="secondary" data-action="cancel-throw">取消</button>
          ${renderAutoPlayControl()}
          ${renderTauntControl()}
          ${renderGameItemControl()}
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
        <span class="tag">${escapeHtml(selectedCountLabel())}</span>
        <button type="button" data-action="${action.action}" ${action.enabled ? "" : "disabled"}>${escapeHtml(action.label)}</button>
        ${throwButton}
        ${renderAutoPlayControl()}
        ${renderTauntControl()}
        ${renderGameItemControl()}
        <span class="action-reason">${escapeHtml(reason)}</span>
      </div>
    `;
  }
  if (state?.stage !== "playing") {
    return state?.gameItems?.canUse ? `<div class="hand-waiting-controls">${renderGameItemControl()}</div>` : "";
  }

  const turnName = state.currentTrick?.currentTurnPlayerName || "";
  const played = viewerPlayedCurrent();
  const text = played
    ? `你本轮已出，等待${turnName ? ` ${turnName} ` : "其他玩家"}出牌`
    : turnName
      ? `等待 ${turnName} 出牌`
      : "等待下一轮";
  return `
    <div class="hand-waiting-controls">
      <span class="tag">${escapeHtml(selectedCountLabel())}</span>
      <div class="turn-waiting">${escapeHtml(text)}</div>
      ${renderAutoPlayControl()}
      ${renderTauntControl()}
      ${renderGameItemControl()}
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

function renderOpeningBidPercentControl() {
  const options = [10, 20, 30, 40];
  const current = options.includes(Number(state.openingBidPercent)) ? Number(state.openingBidPercent) : 40;
  return `
    <span class="dogleg-count-control">
      <span class="meta">起始叫分</span>
      <span class="segmented" aria-label="起始叫分占总牌分比例">
        ${options.map((percent) => `
          <button
            type="button"
            class="${percent === current ? "" : "secondary"}"
            data-action="opening-bid-percent"
            data-percent="${percent}"
            ${percent === current ? "disabled" : ""}
          >${percent}%</button>
        `).join("")}
      </span>
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
  const gameView = Boolean(state && state.stage !== "lobby");
  ensureDiamondWallet();
  const accountLabel = account?.profile?.name || account?.username || "";
  const canLeaveCurrentRoom = Boolean(session && !session.spectator && state?.status === "lobby");
  const preservedScroll = new Map(
    [...app.querySelectorAll("[data-preserve-scroll]")].map((element) => [
      element.dataset.preserveScroll,
      { top: element.scrollTop, left: element.scrollLeft }
    ])
  );
  app.innerHTML = `
    <div class="page ${gameView ? "game-page" : ""}">
      <header class="topbar ${gameView ? "game-topbar" : ""}">
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
            ${account.role === "player" ? `<span class="diamond-balance" title="当前钻石余额">💎 ${diamondWallet?.unavailable ? "暂不可用" : diamondWallet ? escapeHtml(diamondWallet.balance) : "…"}</span>` : ""}
            ${!session ? `<button class="secondary compact-button" data-action="${account.role === "admin" ? "show-admin" : "show-account"}">${account.role === "admin" ? "管理后台" : "我的资料"}</button>` : ""}
            ${!session ? `<button class="secondary compact-button" data-action="logout-account">退出登录</button>` : ""}
          ` : `<button class="secondary compact-button" data-action="show-login">玩家登录</button>`}
          ${session ? `<button class="secondary compact-button" data-action="${session.spectator ? "leave-spectating" : canLeaveCurrentRoom ? "room-leave" : "leave"}" ${!session.spectator && !canLeaveCurrentRoom ? `title="席位会保留，可使用同一账号重新进入"` : ""}>${session.spectator ? "退出观战" : canLeaveCurrentRoom ? "退出房间" : "暂离牌桌"}</button>` : ""}
        </div>
      </header>
      ${message ? `<div class="status toast ${messageBad ? "bad" : ""}" role="status">${escapeHtml(message)}</div>` : ""}
      ${content}
    </div>
  `;
  app.querySelectorAll("[data-preserve-scroll]").forEach((element) => {
    const position = preservedScroll.get(element.dataset.preserveScroll);
    if (!position) return;
    element.scrollTop = position.top;
    element.scrollLeft = position.left;
  });
}

function renderHome() {
  ensureAuth();
  ensureJoinableRooms();
  ensurePlayerStatistics();
  if (homeView === "login") return renderLogin();
  if (homeView === "account") return renderAccountSettings();
  if (homeView === "admin" || homeView === "players") return renderProfileManager();
  if (homeView === "shop") return renderShopPage();
  if (homeView === "inventory") return renderInventoryPage();
  renderShell(`
    <section class="home-toolbar">
      <div class="segmented home-tabs" role="tablist" aria-label="首页模块">
        <button type="button" class="${homeView === "rooms" ? "active" : "secondary"}" data-action="show-rooms">房间</button>
        <button type="button" class="${homeView === "stats" ? "active" : "secondary"}" data-action="show-statistics">数据</button>
        ${authState.account?.role === "player" ? `<button type="button" class="secondary" data-action="show-shop">钻石商城</button>` : ""}
        ${authState.account?.role === "player" ? `<button type="button" class="secondary" data-action="show-inventory">背包</button>` : ""}
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
          <div class="meta">等待中的房间可加入；进行中的玩家可返回原席位，其他玩家可选择视角观战。</div>
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
  const currentProfileId = authState.account?.profile?.id || authState.account?.profileId || "";
  const rejoinable = Boolean(currentProfileId && players.some((player) => player.profileId === currentProfileId));
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
          <span class="tag">起叫 ${escapeHtml(room.openingBidPercent || 40)}%</span>
          ${room.phase ? `<span class="tag">${escapeHtml(room.phase)}</span>` : ""}
          <span class="tag">${escapeHtml(fmtTime(room.createdAt))}</span>
        </div>
      </div>
      <div class="joinable-room-players">
        ${players.map((player) => {
          const ownSeat = Boolean(currentProfileId && player.profileId === currentProfileId);
          return room.status === "dealt" ? `
          <button
            type="button"
            class="joinable-room-player spectate-player ${ownSeat ? "own-seat" : ""}"
            data-action="${ownSeat ? "join-listed-room" : "spectate-player"}"
            data-room-id="${escapeHtml(room.roomId)}"
            data-player-id="${escapeHtml(player.id)}"
            title="${ownSeat ? "返回自己的牌桌席位" : `以${escapeHtml(player.name)}的视角观战`}"
          >
            ${avatarHtml(player.name, player.avatarUrl, "normal", player.avatarFrame)}
            <span class="joinable-room-player-name">${escapeHtml(player.name)}</span>
            <span class="spectate-player-label">${ownSeat ? "返回" : authState.account ? "观战" : "登录后观战"}</span>
          </button>
        ` : `
          <span class="joinable-room-player ${player.ready ? "ready" : ""} ${ownSeat ? "own-seat" : ""}">
            ${avatarHtml(player.name, player.avatarUrl, "normal", player.avatarFrame)}
            <span class="joinable-room-player-name">${escapeHtml(player.name)}</span>
          </span>
        `;
        }).join("")}
      </div>
      <div class="joinable-room-actions">
        ${rejoinable ? `
          <button type="button" data-action="join-listed-room" data-room-id="${escapeHtml(room.roomId)}">
            ${room.status === "dealt" ? "返回牌桌" : "返回房间"}
          </button>
        ` : joinable ? `
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
  const selectedSeason = statisticsSeasons.find((season) => String(season.season_id) === statisticsSeasonId) || null;
  const rankingTitle = selectedSeason ? `${selectedSeason.name}数据榜` : "历史数据总榜";
  const currentColumn = statisticsColumns().find((column) => column.key === statisticsSortKey) || statisticsColumns()[0];
  const body = playerStatisticsLoading && !playerStatisticsLoaded
    ? `<div class="empty">正在加载数据...</div>`
    : rows.length ? renderStatisticsTable(rows) : `<div class="empty">暂无已记录的全真人牌局。记录开启后，结算数据会自动出现在这里。</div>`;
  return `
    <section class="panel stack statistics-panel">
      <div class="section-head">
        <div>
          <h2>${escapeHtml(rankingTitle)}</h2>
          <div class="meta">列顺序保持固定；点击任意参数名称即可排行，再次点击切换升序或降序。</div>
        </div>
        <div class="statistics-header-tools">
          <label>统计范围
            <select data-action="select-statistics-season">
              <option value="all" ${statisticsSeasonId === "all" ? "selected" : ""}>历史总榜</option>
              ${statisticsSeasons.map((season) => `<option value="${escapeHtml(season.season_id)}" ${String(season.season_id) === statisticsSeasonId ? "selected" : ""}>${escapeHtml(season.name)}${season.is_active ? "（当前）" : ""}</option>`).join("")}
            </select>
          </label>
          <div class="statistics-sort-status"><span>当前排序</span><strong>${escapeHtml(currentColumn.label)} ${statisticsSortDirection === "desc" ? "↓" : "↑"}</strong></div>
        </div>
      </div>
      <div class="statistics-summary statistics-summary-wide">
        <div class="statistics-current-leader">
          ${rows[0] ? avatarHtml(rows[0].latest_name || "玩家", rows[0].latest_avatar_url || "", "normal", rows[0].avatar_frame || "") : ""}
          <span><i>当前排名第一</i><b>${escapeHtml(rows[0]?.latest_name || "暂无")}</b><em>${rows[0] ? escapeHtml(currentColumn.format(currentColumn.value(rows[0]), rows[0])) : "-"}</em></span>
        </div>
        <div><span>上榜玩家</span><strong>${rows.length}</strong></div>
        <div><span>参赛人次</span><strong>${appearances}</strong></div>
        <div><span>${selectedSeason ? "赛季时间" : "记录状态"}</span><strong class="${!selectedSeason && historyStatus?.enabled ? "positive" : ""}">${selectedSeason ? escapeHtml(seasonDateRange(selectedSeason)) : recordedState}</strong></div>
      </div>
      ${!historyStatus?.enabled && historyStatus ? `<div class="status bad">线上牌局记录开关尚未开启，当前结算不会写入统计。</div>` : ""}
      ${body}
    </section>
  `;
}

function statisticNumber(value) {
  return Number(value) || 0;
}

function shortDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "未设置";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function seasonDateRange(season) {
  return `${shortDate(season?.starts_at)} - ${season?.ends_at ? shortDate(season.ends_at) : "进行中"}`;
}

function dateTimeLocalValue(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function statisticDecimal(value, digits = 2) {
  return statisticNumber(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function statisticFixed2(value) {
  return statisticNumber(value).toFixed(2);
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
  const column = (key, label, group, value, format = (item) => statisticDecimal(item, 0), signed = false, sortTitle = "") => ({ key, label, group, value, format, signed, sortTitle });
  const roleColumn = (key, label, group, field, format, signed = false) => column(key, label, group, (row) => statisticNumber(row[field]), format, signed);
  const fivePoints = (row, redField, diamondField, average = false) => {
    const points = statisticNumber(row[redField]) * 2 + statisticNumber(row[diamondField]);
    return average && statisticNumber(row.games_played) ? points / statisticNumber(row.games_played) : average ? 0 : points;
  };
  const fivePair = (row, redField, diamondField, average = false) => {
    const games = statisticNumber(row.games_played);
    const divisor = average && games ? games : 1;
    const digits = average ? 2 : 0;
    return `${statisticDecimal(statisticNumber(row[redField]) / divisor, digits)}/${statisticDecimal(statisticNumber(row[diamondField]) / divisor, digits)}`;
  };
  const fiveColumn = (key, label, redField, diamondField, average = false) => column(
    key,
    label,
    "牌局",
    (row) => fivePoints(row, redField, diamondField, average),
    (_value, row) => fivePair(row, redField, diamondField, average),
    false,
    `按${label}积分排行（红五×2 + 方五×1）`
  );
  return [
    column("total_score", "总积分", "综合", (row) => statisticNumber(row.total_score), (value) => statisticSigned(value), true),
    column("games_played", "场次", "综合", (row) => statisticNumber(row.games_played)),
    column("wins", "胜场", "综合", (row) => statisticNumber(row.wins)),
    column("win_rate", "胜率", "综合", (row) => statisticNumber(row.win_rate), statisticPercent),
    column("average_score", "场均积分", "综合", (row) => statisticNumber(row.average_score), (value) => statisticSigned(value), true),
    column("mvp_count", "MVP次数", "综合", (row) => statisticNumber(row.mvp_count)),
    roleColumn("banker_games", "庄家场次", "庄家", "banker_games"),
    roleColumn("banker_score", "庄家积分", "庄家", "banker_score", (value) => statisticSigned(value), true),
    column("banker_win_rate", "庄家胜率", "庄家", (row) => statisticRate(row.banker_wins, row.banker_games), statisticPercent),
    roleColumn("dogleg_games", "狗腿场次", "狗腿", "dogleg_games"),
    roleColumn("dogleg_score", "狗腿积分", "狗腿", "dogleg_score", (value) => statisticSigned(value), true),
    column("dogleg_win_rate", "狗腿胜率", "狗腿", (row) => statisticRate(row.dogleg_wins, row.dogleg_games), statisticPercent),
    roleColumn("idle_games", "闲家场次", "闲家", "idle_games"),
    roleColumn("idle_score", "闲家积分", "闲家", "idle_score", (value) => statisticSigned(value), true),
    column("idle_win_rate", "闲家胜率", "闲家", (row) => statisticRate(row.idle_wins, row.idle_games), statisticPercent),
    fiveColumn("dragged_fives", "被拖红五/方五", "dragged_red_fives", "dragged_diamond_fives"),
    fiveColumn("dragged_average", "场均被拖红五/方五", "dragged_red_fives", "dragged_diamond_fives", true),
    column("total_trick_score", "累计牌分", "牌局", (row) => statisticNumber(row.total_trick_score)),
    column("trick_score_average", "场均牌分", "牌局", (row) => statisticNumber(row.games_played) ? statisticNumber(row.total_trick_score) / statisticNumber(row.games_played) : 0, statisticDecimal),
    fiveColumn("opponent_dragged_fives", "拖对方红五/方五", "opponent_dragged_red_fives", "opponent_dragged_diamond_fives"),
    fiveColumn("opponent_dragged_average", "场均拖对方红五/方五", "opponent_dragged_red_fives", "opponent_dragged_diamond_fives", true),
    fiveColumn("teammate_dragged_fives", "拖队友红五/方五", "teammate_dragged_red_fives", "teammate_dragged_diamond_fives"),
    fiveColumn("teammate_dragged_average", "场均拖队友红五/方五", "teammate_dragged_red_fives", "teammate_dragged_diamond_fives", true),
    column("won_tricks", "获胜轮次", "牌局", (row) => statisticNumber(row.won_tricks)),
    column("total_tricks", "总轮次", "牌局", (row) => statisticNumber(row.total_tricks)),
    column("round_win_rate", "轮次胜率", "牌局", (row) => statisticRate(row.won_tricks, row.total_tricks), statisticPercent),
    column("fry_count", "炒底次数", "牌局", (row) => statisticNumber(row.fry_count)),
    column("fry_average", "场均炒底数", "牌局", (row) => statisticNumber(row.games_played) ? statisticNumber(row.fry_count) / statisticNumber(row.games_played) : 0, statisticFixed2),
    column("won_trick_card_rate", "获胜张数占比", "牌局", (row) => statisticRate(row.won_trick_cards, row.total_hand_cards), statisticPercent),
    column("bottom_wins", "保底数", "牌局", (row) => statisticNumber(row.bottom_wins)),
    column("bottom_win_average", "场均保底数", "牌局", (row) => statisticNumber(row.games_played) ? statisticNumber(row.bottom_wins) / statisticNumber(row.games_played) : 0, statisticFixed2)
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
          <th class="statistics-user-column">排名 · 玩家</th>
          ${columns.map((column, index) => `
            <th class="${column.key === statisticsSortKey ? "selected-column" : ""} ${statisticsSectionStart(columns, index) ? "section-start" : ""}" ${column.key === statisticsSortKey ? `aria-sort="${statisticsSortDirection === "desc" ? "descending" : "ascending"}"` : ""}>
              <button type="button" class="statistics-column-button" data-action="sort-statistics" data-stat-key="${column.key}" title="${escapeHtml(column.sortTitle || `按${column.label}排行`)}">
                <span>${escapeHtml(column.label)}</span><i>${column.key === statisticsSortKey ? (statisticsSortDirection === "desc" ? "↓" : "↑") : ""}</i>
              </button>
            </th>
          `).join("")}
          <th></th>
        </tr></thead>
        <tbody>
          ${rows.map((row, rowIndex) => `
            <tr>
              <td class="statistics-user-column">
                <div class="statistics-user-cell">
                  <span class="rank-number rank-${rowIndex + 1}">${rowIndex + 1}</span>
                ${row.account_id ? `
                  <button type="button" class="statistics-player-button" data-action="show-player-statistics" data-account-id="${escapeHtml(row.account_id)}" title="${escapeHtml(row.latest_name || "玩家")} · @${escapeHtml(row.username || "player")}">
                    ${avatarHtml(row.latest_name || "玩家", row.latest_avatar_url || "", "small", row.avatar_frame || "")}
                    <b>${escapeHtml(row.latest_name || "玩家")}</b>
                  </button>
                ` : `
                  <span class="statistics-player">
                    ${avatarHtml(row.latest_name || "玩家", row.latest_avatar_url || "", "small", row.avatar_frame || "")}
                    <b>${escapeHtml(row.latest_name || "玩家")}</b>
                  </span>
                `}
                </div>
              </td>
              ${columns.map((column, columnIndex) => {
                const value = column.value(row);
                const tone = column.signed && value > 0 ? "positive" : column.signed && value < 0 ? "negative" : "";
                return `<td class="${column.key === statisticsSortKey ? "selected-column statistics-score" : ""} ${statisticsSectionStart(columns, columnIndex) ? "section-start" : ""} ${tone}">${escapeHtml(column.format(value, row))}</td>`;
              }).join("")}
              <td>${row.account_id ? `<button type="button" class="secondary compact-button" data-action="show-player-statistics" data-account-id="${escapeHtml(row.account_id)}">查看</button>` : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function statisticsPlayerDetailKey(accountId) {
  return `${statisticsSeasonId}:${accountId}`;
}

function showPlayerStatistics(accountId) {
  if (!accountId) return;
  if (statisticsSelectedAccountId !== accountId) {
    statisticsGameDate = "";
    statisticsGameLogId = "";
    historyFilter = "all";
  }
  const detailKey = statisticsPlayerDetailKey(accountId);
  statisticsSelectedAccountId = accountId;
  ensurePlayerGameHistory(accountId);
  if (statisticsPlayerDetails.has(detailKey) || statisticsPlayerDetailLoadingId === detailKey) {
    render();
    return;
  }
  statisticsPlayerDetailLoadingId = detailKey;
  render();
  api(`/api/history/players/${encodeURIComponent(accountId)}?seasonId=${encodeURIComponent(statisticsSeasonId)}`)
    .then((detail) => {
      statisticsPlayerDetails.set(detailKey, detail);
    })
    .catch((error) => {
      setMessage(error.message || "玩家数据加载失败", true);
    })
    .finally(() => {
      if (statisticsPlayerDetailLoadingId === detailKey) statisticsPlayerDetailLoadingId = "";
      render();
    });
}

function playerGameHistoryKey(accountId, date = statisticsGameDate) {
  return `${statisticsSeasonId}:${accountId}:${date || "all"}`;
}

function playerGameDateRange(dateText) {
  if (!dateText) return null;
  const start = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function ensurePlayerGameHistory(accountId, force = false) {
  if (!accountId) return;
  const key = playerGameHistoryKey(accountId);
  if ((!force && statisticsPlayerGameLists.has(key)) || statisticsPlayerGamesLoadingKey === key) return;
  statisticsPlayerGamesLoadingKey = key;
  const params = new URLSearchParams({
    seasonId: statisticsSeasonId,
    limit: "100"
  });
  const range = playerGameDateRange(statisticsGameDate);
  if (range) {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  api(`/api/history/players/${encodeURIComponent(accountId)}/games?${params.toString()}`)
    .then((data) => {
      statisticsPlayerGameLists.set(key, data.games || []);
    })
    .catch((error) => {
      setMessage(error.message || "对局历史加载失败", true);
    })
    .finally(() => {
      if (statisticsPlayerGamesLoadingKey === key) statisticsPlayerGamesLoadingKey = "";
      render();
    });
}

function openStoredGameHistory(gameId) {
  if (!gameId) return;
  statisticsGameLogId = gameId;
  historyFilter = "all";
  if (statisticsGameLogs.has(gameId) || statisticsGameLogLoadingId === gameId) {
    render();
    return;
  }
  statisticsGameLogLoadingId = gameId;
  render();
  api(`/api/history/games/${encodeURIComponent(gameId)}`)
    .then((data) => {
      if (data.game) statisticsGameLogs.set(gameId, data.game);
    })
    .catch((error) => {
      statisticsGameLogId = "";
      setMessage(error.message || "牌局记录加载失败", true);
    })
    .finally(() => {
      if (statisticsGameLogLoadingId === gameId) statisticsGameLogLoadingId = "";
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

function sortedPlayerRelationships(type, rows = []) {
  const sort = statisticsRelationshipSorts[type] || statisticsRelationshipSorts.bonds;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const difference = statisticNumber(left[sort.key]) - statisticNumber(right[sort.key]);
    if (difference) return difference * direction;
    const gamesDifference = statisticNumber(right.games_played) - statisticNumber(left.games_played);
    if (gamesDifference) return gamesDifference;
    const scoreDifference = statisticNumber(right.own_score) - statisticNumber(left.own_score);
    if (scoreDifference) return scoreDifference;
    return String(left.latest_name || "").localeCompare(String(right.latest_name || ""), "zh-CN");
  });
}

function relationshipSortButton(type, key, label) {
  const sort = statisticsRelationshipSorts[type];
  const selected = sort.key === key;
  return `
    <button
      type="button"
      class="statistics-relationship-sort ${selected ? "selected" : ""}"
      data-action="sort-player-relationships"
      data-relationship-type="${type}"
      data-stat-key="${key}"
      ${selected ? `aria-sort="${sort.direction === "desc" ? "descending" : "ascending"}"` : ""}
    >${escapeHtml(label)} <i>${selected ? (sort.direction === "desc" ? "↓" : "↑") : ""}</i></button>
  `;
}

function renderPlayerRelationshipBoard(type, rows = [], loading = false) {
  const isBond = type === "bonds";
  const sortedRows = sortedPlayerRelationships(type, rows);
  const title = isBond ? "羁绊榜" : "对手榜";
  const note = isBond ? "最终阵营相同的牌局" : "最终阵营不同的牌局";
  return `
    <section class="statistics-detail-section statistics-relationship-section">
      <header>
        <div><h3>${title}</h3><span>${note}</span></div>
        <div class="statistics-relationship-sorters">
          ${relationshipSortButton(type, "games_played", "场数")}
          ${relationshipSortButton(type, "own_score", "本人积分")}
        </div>
      </header>
      ${loading ? `<div class="empty">正在读取...</div>` : sortedRows.length ? `
        <div class="statistics-relationship-table-wrap">
          <table class="statistics-relationship-table">
            <thead><tr><th>玩家</th><th>场数</th><th>本人积分</th></tr></thead>
            <tbody>${sortedRows.map((relationship) => {
              const score = statisticNumber(relationship.own_score);
              const identity = `
                ${avatarHtml(relationship.latest_name || "玩家", relationship.latest_avatar_url || "", "small", relationship.avatar_frame || "")}
                <b>${escapeHtml(relationship.latest_name || "玩家")}</b>
              `;
              return `
                <tr>
                  <td>${relationship.account_id ? `
                    <button type="button" class="statistics-player-button" data-action="show-player-statistics" data-account-id="${escapeHtml(relationship.account_id)}">
                      ${identity}
                    </button>
                  ` : `<span class="statistics-player">${identity}</span>`}</td>
                  <td>${statisticNumber(relationship.games_played)}</td>
                  <td class="${score > 0 ? "positive" : score < 0 ? "negative" : ""}">${statisticSigned(score)}</td>
                </tr>
              `;
            }).join("")}</tbody>
          </table>
        </div>
      ` : `<div class="empty">${isBond ? "暂无同队记录" : "暂无对阵记录"}</div>`}
    </section>
  `;
}

function renderPlayerGameHistorySection(accountId) {
  const key = playerGameHistoryKey(accountId);
  const games = statisticsPlayerGameLists.get(key) || [];
  const loading = statisticsPlayerGamesLoadingKey === key;
  return `
    <section class="statistics-detail-section statistics-game-history-section">
      <header>
        <div>
          <h3>对局历史</h3>
          <span>按结束时间倒序，可查看完整牌局记录</span>
        </div>
        <label class="statistics-game-date-filter">
          <span>筛选日期</span>
          <input type="date" value="${escapeHtml(statisticsGameDate)}" data-action="filter-player-game-date">
          ${statisticsGameDate ? `<button type="button" class="secondary compact-button" data-action="clear-player-game-date">查看全部</button>` : ""}
        </label>
      </header>
      ${loading && !statisticsPlayerGameLists.has(key) ? `<div class="empty">正在读取对局历史...</div>` : games.length ? `
        <div class="statistics-game-list">
          ${games.map((game) => {
            const gameScore = statisticNumber(game.game_score);
            const teammates = (game.players || []).map((player) => player.name).filter(Boolean).join("、");
            return `
              <article class="statistics-game-row">
                <div class="statistics-game-time">
                  <strong>${escapeHtml(fmtDateTime(game.finished_at))}</strong>
                  <span>房间 ${escapeHtml(game.room_code || "-")} · ${escapeHtml(game.call_mode_name || "")}</span>
                </div>
                <div class="statistics-game-result">
                  <span class="tag ${game.won ? "good" : ""}">${game.won ? "胜" : "负"}</span>
                  <strong>${escapeHtml(game.role || "")}</strong>
                  <b class="${gameScore > 0 ? "positive" : gameScore < 0 ? "negative" : ""}">${escapeHtml(statisticSigned(gameScore))}</b>
                  <small>牌分 ${escapeHtml(game.trick_score || 0)} · 闲家 ${escapeHtml(game.idle_score || 0)}/${escapeHtml(game.threshold || 0)}</small>
                </div>
                <div class="statistics-game-players" title="${escapeHtml(teammates)}">${escapeHtml(teammates)}</div>
                <button type="button" class="secondary compact-button" data-action="open-stored-game-history" data-game-id="${escapeHtml(game.game_id)}">查看牌局记录</button>
              </article>
            `;
          }).join("")}
        </div>
      ` : `<div class="empty">${statisticsGameDate ? "这一天没有已记录的牌局" : "暂无已记录的对局"}</div>`}
    </section>
    ${statisticsGameLogId ? renderStoredGameHistoryDialog() : ""}
  `;
}

function renderPlayerStatisticsDetail(baseRow) {
  const detailKey = statisticsPlayerDetailKey(baseRow.account_id);
  const detail = statisticsPlayerDetails.get(detailKey);
  const row = { ...baseRow, ...(detail?.player || {}) };
  const trend = detail?.trend || [];
  const relationships = detail?.relationships || {};
  const rank = [...playerStatisticsRows].sort((left, right) => statisticNumber(right.total_score) - statisticNumber(left.total_score)).findIndex((item) => item.account_id === row.account_id) + 1;
  const games = statisticNumber(row.games_played);
  const dragged = statisticNumber(row.dragged_red_fives) + statisticNumber(row.dragged_diamond_fives);
  const opponentDragged = statisticNumber(row.opponent_dragged_red_fives) + statisticNumber(row.opponent_dragged_diamond_fives);
  const teammateDragged = statisticNumber(row.teammate_dragged_red_fives) + statisticNumber(row.teammate_dragged_diamond_fives);
  const wonTricks = statisticNumber(row.won_tricks);
  const totalTricks = statisticNumber(row.total_tricks);
  const wonTrickCards = statisticNumber(row.won_trick_cards);
  const totalHandCards = statisticNumber(row.total_hand_cards);
  const selectedSeason = statisticsSeasons.find((season) => String(season.season_id) === statisticsSeasonId) || null;
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
          <div><span>${escapeHtml(selectedSeason?.name || "历史总榜")}第 ${rank || "-"} 名</span><h2>${escapeHtml(row.latest_name || "玩家")}</h2><small>@${escapeHtml(row.username || "player")} · ${games} 场全真人牌局</small></div>
        </div>
        <div class="statistics-headline"><span>总积分</span><strong class="${statisticNumber(row.total_score) > 0 ? "positive" : statisticNumber(row.total_score) < 0 ? "negative" : ""}">${statisticSigned(row.total_score)}</strong><small>场均 ${statisticSigned(row.average_score)}</small></div>
        <div class="statistics-headline"><span>胜率</span><strong>${statisticPercent(row.win_rate)}</strong><small>${statisticNumber(row.wins)} 胜 / ${statisticNumber(row.losses)} 负</small></div>
        <div class="statistics-headline"><span>累计牌分</span><strong>${statisticNumber(row.total_trick_score)}</strong><small>场均 ${statisticDecimal(games ? statisticNumber(row.total_trick_score) / games : 0, 1)}</small></div>
      </section>
      <div class="statistics-detail-grid">
        <div>
          <section class="statistics-detail-section">
            <header><h3>积分走势</h3><span>${statisticsPlayerDetailLoadingId === detailKey ? "读取中" : `最近 ${trend.length} 场`}</span></header>
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
              ${statisticsPerformanceItem("获胜张数", wonTrickCards, `总手牌 ${totalHandCards} · 占比 ${statisticPercent(statisticRate(wonTrickCards, totalHandCards))}`)}
              ${statisticsPerformanceItem("炒底次数", statisticNumber(row.fry_count), `${statisticDecimal(games ? statisticNumber(row.fry_count) / games : 0)} / 场`)}
              ${statisticsPerformanceItem("保底", statisticNumber(row.bottom_wins), `${statisticDecimal(games ? statisticNumber(row.bottom_wins) / games : 0)} / 场`)}
            </div>
          </section>
          <section class="statistics-detail-section">
            <header><h3>称号记录</h3><span>可同时获得多个称号</span></header>
            ${titleItems.length ? `<div class="statistics-title-list">${titleItems.map(([label, key]) => `<div><span>${label}</span><b>${statisticNumber(row[key])}</b></div>`).join("")}</div>` : `<div class="empty">暂无称号记录</div>`}
          </section>
        </div>
      </div>
      <div class="statistics-relationship-grid">
        ${renderPlayerRelationshipBoard("bonds", relationships.bonds || [], statisticsPlayerDetailLoadingId === detailKey)}
        ${renderPlayerRelationshipBoard("opponents", relationships.opponents || [], statisticsPlayerDetailLoadingId === detailKey)}
      </div>
      ${renderPlayerGameHistorySection(row.account_id)}
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

function ownedShopProduct(product) {
  if (product.productType === "avatar_frame") {
    return (shopState?.entitlements?.avatarFrames || []).includes(product.assetKey);
  }
  if (product.productType === "card_skin") {
    return (shopState?.entitlements?.cardSkins || []).includes(product.assetKey);
  }
  return false;
}

function shopProductPreview(product) {
  if (product.productType === "avatar_frame") {
    const profile = authState.account?.profile;
    const previewName = profile?.name || product.name;
    const previewAvatarUrl = profile?.avatarUrl || "";
    return `
      <div class="shop-avatar-preview">
        <span class="shop-preview-label">牌桌实装</span>
        <span class="shop-avatar-hero-stage">
          ${avatarHtml(previewName, previewAvatarUrl, "shop-feature", product.assetKey)}
        </span>
        <span class="shop-avatar-mini-preview">
          ${avatarHtml(previewName, previewAvatarUrl, "small", product.assetKey)}
          <span><b>${escapeHtml(previewName)}</b><small>房间列表效果</small></span>
        </span>
      </div>
    `;
  }
  if (product.productType === "card_skin") {
    return `
      <div class="shop-card-preview" aria-hidden="true">
        <span class="shop-preview-card black ${cardSkinClass(product.assetKey)}"><span><b>K</b><i>♠</i></span></span>
        <span class="shop-preview-card red ${cardSkinClass(product.assetKey)}"><span><b>Q</b><i>♦</i></span></span>
        <span class="shop-preview-card red ${cardSkinClass(product.assetKey)}"><span><b>A</b><i>♥</i></span></span>
      </div>
    `;
  }
  const icon = {
    "restart-card": "↻",
    "war-god-card": "⚔",
    "colorful-card": "✦",
    "luck-card": "☘"
  }[product.assetKey] || "◇";
  return `<div class="shop-item-preview shop-item-${escapeHtml(product.assetKey)}" aria-hidden="true">${icon}</div>`;
}

function renderShopProduct(product) {
  const owned = ownedShopProduct(product);
  const profile = authState.account?.profile;
  const isAvatarFrame = product.productType === "avatar_frame";
  const equipped = isAvatarFrame && profile?.avatarFrame === product.assetKey;
  const itemCount = product.productType === "consumable_item"
    ? Number(shopState?.inventory?.[product.assetKey]?.available || 0)
    : 0;
  const purchasing = shopPurchaseInFlight === product.id;
  const equipping = avatarFrameEquipInFlight === product.assetKey;
  const cannotAfford = Number(shopState?.balance || 0) < Number(product.price || 0);
  return `
    <article class="shop-product-card ${isAvatarFrame ? "avatar-frame-product" : ""} ${owned ? "owned" : ""} ${equipped ? "equipped" : ""}">
      ${shopProductPreview(product)}
      <div class="shop-product-copy">
        <div class="shop-product-title">
          <strong>${escapeHtml(product.name)}</strong>
          ${equipped ? `<span class="tag good">佩戴中</span>` : owned ? `<span class="tag good">已拥有</span>` : itemCount ? `<span class="tag">背包 ${itemCount}</span>` : ""}
        </div>
        <p>${escapeHtml(product.description)}</p>
        ${isAvatarFrame ? `<div class="shop-avatar-visibility"><span>牌桌头像</span><span>房间列表</span><span>数据榜单</span></div>` : ""}
      </div>
      <div class="shop-product-buy">
        <b>${owned && isAvatarFrame ? "永久拥有" : `💎 ${escapeHtml(product.price)}`}</b>
        ${owned && isAvatarFrame ? `
          <button
            type="button"
            data-action="equip-avatar-frame"
            data-avatar-frame="${escapeHtml(product.assetKey)}"
            ${equipped || equipping || avatarFrameEquipInFlight ? "disabled" : ""}
          >${equipped ? "当前佩戴" : equipping ? "佩戴中…" : "立即佩戴"}</button>
        ` : `
          <button
            type="button"
            data-action="buy-shop-product"
            data-product-id="${escapeHtml(product.id)}"
            ${owned || purchasing || shopPurchaseInFlight || cannotAfford ? "disabled" : ""}
          >${owned ? "已解锁" : purchasing ? "购买中…" : cannotAfford ? "钻石不足" : "购买"}</button>
        `}
      </div>
    </article>
  `;
}

function renderOwnedCosmetics() {
  const profile = authState.account?.profile;
  if (!profile) return "";
  const avatarFrameKeys = ["", ...new Set((shopState?.entitlements?.avatarFrames || [])
    .filter((key) => key && AVATAR_FRAME_VALUES.has(key)))];
  const cardSkinKeys = ["", ...new Set((shopState?.entitlements?.cardSkins || [])
    .filter((key) => key && CARD_SKIN_VALUES.has(key)))];
  const avatarLabels = new Map(AVATAR_FRAME_OPTIONS.map((option) => [option.value, option.label]));
  const cardLabels = new Map(CARD_SKIN_OPTIONS.map((option) => [option.value, option.label]));
  return `
    <section class="panel stack owned-cosmetics-panel">
      <div class="section-head">
        <div><h2>我的头像框</h2><div class="meta">先看实际效果再选择，保存后会同步到牌桌、房间列表和数据榜单。</div></div>
      </div>
      <form class="owned-cosmetics-form" data-form="own-cosmetics">
        <div class="owned-avatar-current">
          <span>当前佩戴</span>
          <span class="owned-avatar-current-stage">
            ${avatarHtml(profile.name, profile.avatarUrl, "shop-feature", profile.avatarFrame)}
          </span>
          <div><b>${escapeHtml(avatarLabels.get(profile.avatarFrame) || profile.avatarFrame)}</b><small>${escapeHtml(profile.name)}</small></div>
        </div>
        <fieldset class="owned-avatar-frame-picker">
          <legend>选择头像框</legend>
          <div class="owned-avatar-frame-grid">
            ${avatarFrameKeys.map((key) => `
              <label class="owned-avatar-frame-option ${profile.avatarFrame === key ? "selected" : ""}">
                <input type="radio" name="avatarFrame" value="${escapeHtml(key)}" ${profile.avatarFrame === key ? "checked" : ""}>
                <span class="owned-avatar-frame-stage">${avatarHtml(profile.name, profile.avatarUrl, "normal", key)}</span>
                <b>${escapeHtml(avatarLabels.get(key) || key)}</b>
                <small>${profile.avatarFrame === key ? "当前佩戴" : "点击选择"}</small>
              </label>
            `).join("")}
          </div>
        </fieldset>
        <details class="owned-card-skin-setting">
          <summary>牌面边框</summary>
          <label>
            保留现有设置
            <select name="cardSkin">
              ${cardSkinKeys.map((key) => `<option value="${escapeHtml(key)}" ${profile.cardSkin === key ? "selected" : ""}>${escapeHtml(cardLabels.get(key) || key)}</option>`).join("")}
            </select>
          </label>
        </details>
        <button class="owned-avatar-save" type="submit">保存佩戴</button>
      </form>
    </section>
  `;
}

function renderShopPage() {
  const account = authState.account;
  if (!account) {
    homeView = "login";
    return renderLogin();
  }
  if (account.role !== "player") {
    homeView = "admin";
    return renderProfileManager();
  }
  ensureShopState();
  const products = shopState?.products || [];
  const avatarFrames = products.filter((product) => product.isListed && product.productType === "avatar_frame");
  const cardSkins = products.filter((product) => product.isListed && product.productType === "card_skin");
  const consumables = products.filter((product) => product.isListed && product.productType === "consumable_item");
  renderShell(`
    <section class="shop-hero panel">
      <div>
        <span class="eyebrow">DIAMOND SHOP</span>
        <h2>钻石商城</h2>
        <p>用牌局获得的钻石解锁永久皮肤，或补充对局中使用的消耗型道具。</p>
      </div>
      <div class="shop-balance"><span>当前余额</span><strong>💎 ${escapeHtml(shopState?.balance ?? diamondWallet?.balance ?? "…")}</strong></div>
      <button type="button" class="secondary compact-button" data-action="show-rooms">返回房间</button>
    </section>
    ${shopStateLoading && !shopState ? `<section class="panel"><div class="empty">正在读取商品与背包...</div></section>` : shopState?.unavailable ? `<section class="panel"><div class="empty">商城暂不可用，请稍后再试。</div></section>` : `
      ${renderOwnedCosmetics()}
      <section class="panel stack shop-catalog">
        <div class="section-head"><div><h2>头像框</h2><div class="meta">使用你的真实头像预览；购买一次永久拥有，并可立即佩戴。</div></div><span class="tag">${avatarFrames.length} 款</span></div>
        <div class="shop-product-grid avatar-frame-grid">${avatarFrames.map(renderShopProduct).join("") || `<div class="empty">暂无上架头像框。</div>`}</div>
      </section>
      ${cardSkins.length ? `
        <section class="panel stack shop-catalog shop-card-skin-catalog">
          <div class="section-head"><div><h2>牌面边框</h2><div class="meta">改为低饱和哑光边线；重叠手牌靠左侧主题色识别，不使用持续闪烁光效。</div></div><span class="tag">${cardSkins.length} 款</span></div>
          <div class="shop-product-grid">${cardSkins.map(renderShopProduct).join("")}</div>
        </section>
      ` : ""}
      <section class="panel stack shop-catalog">
        <div class="section-head"><div><h2>对局道具</h2><div class="meta">每次购买增加 1 张；真人局正常消耗，含 AI 的牌局可免费使用。</div></div><span class="tag">${consumables.length} 种</span></div>
        <div class="shop-product-grid consumables">${consumables.map(renderShopProduct).join("") || `<div class="empty">暂无上架道具。</div>`}</div>
      </section>
    `}
  `);
}

function backpackConsumables() {
  const productsByItemId = new Map([
    ...CONSUMABLE_ITEM_FALLBACKS.map((item, index) => [item.assetKey, {
      ...item,
      productType: "consumable_item",
      sortOrder: 100 + index
    }]),
    ...(shopState?.products || [])
      .filter((product) => product.productType === "consumable_item")
      .map((product) => [product.assetKey, product])
  ]);
  return Object.entries(shopState?.inventory || {}).map(([itemId, inventory]) => {
    const available = Number(inventory?.available || 0);
    const reserved = Number(inventory?.reserved || 0);
    const product = productsByItemId.get(itemId) || {
      assetKey: itemId,
      name: itemId,
      description: "已拥有的对局道具。",
      productType: "consumable_item",
      sortOrder: 999
    };
    return { ...product, available, reserved };
  }).filter((item) => item.available > 0 || item.reserved > 0)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
}

function renderBackpackItem(item) {
  return `
    <article class="game-item-row backpack-item">
      ${shopProductPreview(item)}
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(item.description || "")}</p>
        ${item.isListed === false ? `<span class="tag">已下架 · 已拥有仍可使用</span>` : ""}
      </div>
      <div class="backpack-item-counts">
        <span class="tag good">可用 ${escapeHtml(item.available)}</span>
        ${item.reserved ? `<span class="tag accent">预占中 ${escapeHtml(item.reserved)}</span>` : ""}
      </div>
    </article>
  `;
}

function renderInventoryPage() {
  if (authState.account?.role !== "player") {
    homeView = "rooms";
    return renderHome();
  }
  ensureShopState();
  const items = backpackConsumables();
  const availableCount = items.reduce((total, item) => total + item.available, 0);
  const reservedCount = items.reduce((total, item) => total + item.reserved, 0);
  renderShell(`
    <section class="shop-hero panel">
      <div>
        <span class="eyebrow">PLAYER INVENTORY</span>
        <h2>我的背包</h2>
        <p>查看已拥有的对局道具卡。预占中的卡会在牌局自然结束时消耗，房间重置或解散时返还。</p>
      </div>
      <div class="shop-balance"><span>当前卡片</span><strong>${escapeHtml(availableCount)} 可用${reservedCount ? ` · ${escapeHtml(reservedCount)} 预占` : ""}</strong></div>
      <button type="button" class="secondary compact-button" data-action="show-rooms">返回房间</button>
    </section>
    ${shopStateLoading && !shopState
      ? `<section class="panel"><div class="empty">正在读取背包...</div></section>`
      : shopState?.unavailable
        ? `<section class="panel"><div class="empty">背包暂不可用，请稍后再试。</div></section>`
        : `
          <section class="panel stack">
            <div class="section-head">
              <div><h2>对局道具卡</h2><div class="meta">与未来的英雄卡系统相互独立；符合牌局条件时在叫庄前的对应卡牌阶段使用。</div></div>
              <span class="tag">${items.length} 种</span>
            </div>
            <div class="game-items-list">
              ${items.map(renderBackpackItem).join("") || `
                <div class="empty">
                  背包里还没有对局道具卡。
                  <button type="button" data-action="show-shop">前往钻石商城</button>
                </div>
              `}
            </div>
          </section>
        `}
  `);
}

function renderAdminModule(id, title, description, status, content) {
  return `
    <details class="admin-module panel" data-admin-module="${escapeHtml(id)}" ${adminOpenModules.has(id) ? "open" : ""}>
      <summary class="admin-module-summary">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="admin-module-summary-status">
          ${status}
          <span class="admin-disclosure-icon" aria-hidden="true">⌄</span>
        </div>
      </summary>
      <div class="admin-module-body">${content}</div>
    </details>
  `;
}

function renderManagedAccount(account) {
  const profileName = account.profile?.name || "未绑定玩家";
  return `
    <article class="managed-account-row">
      <div class="managed-account-main">
        ${account.profile ? avatarHtml(account.profile.name, account.profile.avatarUrl, "small", account.profile.avatarFrame) : `<span class="avatar small">玩</span>`}
        <div><b>${escapeHtml(profileName)}</b><span>${escapeHtml(account.username)}</span></div>
      </div>
      <span class="tag ${account.enabled ? "good" : ""}">${account.enabled ? "已启用" : "已停用"}</span>
      <details class="managed-account-tools">
        <summary class="secondary compact-button">账号操作</summary>
        <div class="managed-account-actions">
          <form class="managed-password-reset" data-form="reset-password" data-account-id="${escapeHtml(account.id)}">
            <label>重置密码<input name="password" type="password" minlength="6" maxlength="72" placeholder="至少 6 位" required></label>
            <button type="submit" class="secondary compact-button">确认重置</button>
          </form>
          <button type="button" class="${account.enabled ? "danger" : "secondary"} compact-button" data-action="toggle-account" data-account-id="${escapeHtml(account.id)}" data-enabled="${account.enabled ? "false" : "true"}">${account.enabled ? "停用账号" : "重新启用"}</button>
        </div>
      </details>
    </article>
  `;
}

function renderSeasonForm(season = null) {
  const seasonId = season?.season_id ? String(season.season_id) : "";
  if (season) {
    return `
      <div class="season-form" data-season-id="${escapeHtml(seasonId)}">
        <label>赛季名称<input name="name" required maxlength="64" value="${escapeHtml(season.name || "")}"></label>
        <label>开始时间<input name="startsAt" type="datetime-local" required value="${escapeHtml(dateTimeLocalValue(season.starts_at))}"></label>
        <label>结束时间<input name="endsAt" type="datetime-local" value="${escapeHtml(dateTimeLocalValue(season.ends_at))}"></label>
        <label class="season-active-field"><input name="isActive" type="checkbox" data-action="season-active" ${season.is_active ? "checked" : ""}><span>设为当前赛季</span></label>
        <div class="season-form-action"><span class="tag ${season.is_active ? "good" : ""}">${season.is_active ? "当前赛季" : seasonDateRange(season)}</span></div>
      </div>
    `;
  }
  return `
    <form class="season-form season-create-form" data-form="save-season">
      <label>赛季名称<input name="name" required maxlength="64" value="" placeholder="例如 2026 夏季赛"></label>
      <label>开始时间<input name="startsAt" type="datetime-local" required value="${escapeHtml(dateTimeLocalValue(new Date()))}"></label>
      <label>结束时间<input name="endsAt" type="datetime-local" value=""></label>
      <label class="season-active-field"><input name="isActive" type="checkbox"><span>设为当前赛季</span></label>
      <div class="season-form-action">
        <span class="meta">结束时间可留空</span>
        <button type="submit">创建赛季</button>
      </div>
    </form>
  `;
}

function renderSeasonManager() {
  const currentSeason = statisticsSeasons.find((season) => season.is_active);
  return `
    <section class="admin-module-section season-manager">
      <div class="admin-module-section-head">
        <div><h3>赛季</h3><div class="meta">按牌局结束时间归入赛季。</div></div>
        <span class="tag ${currentSeason ? "good" : ""}">${currentSeason ? `当前：${escapeHtml(currentSeason.name)}` : "暂无当前赛季"}</span>
      </div>
      <details class="admin-inline-tool">
        <summary><span>创建新赛季</span><small>需要时展开</small></summary>
        <div class="admin-inline-tool-body">${renderSeasonForm()}</div>
      </details>
      <form class="module-settings-form" data-form="save-seasons">
        <div class="season-list">
          ${statisticsSeasonsLoaded
            ? statisticsSeasons.map((season) => renderSeasonForm(season)).join("") || `<div class="empty">暂无赛季，先创建一个赛季。</div>`
            : `<div class="empty">正在读取赛季...</div>`}
        </div>
        <div class="module-save-actions"><button type="submit" data-module-save ${statisticsSeasons.length ? "" : "disabled"}>统一保存赛季设置</button></div>
      </form>
    </section>
  `;
}

function renderAdminShopManager() {
  const products = adminShop?.products || [];
  const accounts = adminShop?.accounts || [];
  const cosmetics = products.filter((product) => product.productType === "avatar_frame" || product.productType === "card_skin");
  return `
    <section class="admin-module-section shop-admin-manager">
      <div class="admin-module-section-head">
        <div><h3>商品设置</h3><div class="meta">价格与上下架支持批量编辑、统一保存。</div></div>
        <span class="tag">${products.filter((product) => product.isListed).length}/${products.length} 上架</span>
      </div>
      ${adminShopLoading && !adminShop ? `<div class="empty">正在读取商品...</div>` : `
        <form class="module-settings-form" data-form="save-shop-products">
          <div class="shop-admin-products">
            ${products.map((product) => `
              <div
                class="shop-admin-product"
                data-product-id="${escapeHtml(product.id)}"
                data-original-price="${escapeHtml(product.price)}"
                data-original-listed="${product.isListed ? "true" : "false"}"
              >
                <div><strong>${escapeHtml(product.name)}</strong><span>${product.productType === "consumable_item" ? "对局道具" : product.productType === "avatar_frame" ? "头像框" : "牌面边框"}</span></div>
                <label>价格<input name="price" type="number" min="1" step="1" required value="${escapeHtml(product.price)}"></label>
                <label class="check-label"><input name="isListed" type="checkbox" ${product.isListed ? "checked" : ""}>上架</label>
              </div>
            `).join("") || `<div class="empty">暂无商品。</div>`}
          </div>
          <div class="module-save-actions"><button type="submit" data-module-save ${products.length ? "" : "disabled"}>统一保存商品设置</button></div>
        </form>
        <details class="admin-inline-tool">
          <summary><span>直接发放皮肤</span><small>只增加拥有权</small></summary>
          <div class="admin-inline-tool-body">
            <form class="shop-grant-form" data-form="grant-cosmetic">
              <label>玩家<select name="accountId" required><option value="">选择玩家</option>${accounts.filter((account) => account.role === "player").map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.profile?.name || account.username)}（${escapeHtml(account.username)}）</option>`).join("")}</select></label>
              <label>皮肤<select name="productId" required><option value="">选择皮肤</option>${cosmetics.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`).join("")}</select></label>
              <label>备注<input name="reason" maxlength="160" placeholder="可选，例如：活动奖励"></label>
              <button type="submit">确认发放</button>
            </form>
          </div>
        </details>
      `}
    </section>
  `;
}

function renderAdminDiamondGrant() {
  const accounts = (adminData?.accounts || []).filter((account) => account.role === "player");
  return `
    <details class="admin-inline-tool admin-risk-tool">
      <summary><span>发放钻石</span><small>到账后不可撤回</small></summary>
      <div class="admin-inline-tool-body">
        <div class="admin-action-warning">每笔操作都会写入钻石流水，提交前会再次确认。</div>
        <form class="shop-grant-form admin-diamond-grant-form" data-form="grant-diamonds">
          <label>玩家<select name="accountId" required><option value="">选择玩家</option>${accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.profile?.name || account.username)}（${escapeHtml(account.username)}）</option>`).join("")}</select></label>
          <label>数量<input name="amount" type="number" min="1" max="1000000" step="1" required placeholder="1～1000000"></label>
          <label>备注<input name="note" maxlength="160" placeholder="可选，例如：活动奖励"></label>
          <button type="submit" data-module-save ${accounts.length ? "" : "disabled"}>确认发放</button>
        </form>
      </div>
    </details>
  `;
}

function renderProfileManager() {
  if (authState.account?.role !== "admin") {
    homeView = "login";
    return renderLogin();
  }
  ensureAdminData();
  ensureAdminTaunts();
  ensureAdminShop();
  const managedProfiles = adminData?.profiles || [];
  const managedAccounts = (adminData?.accounts || []).filter((account) => account.role === "player");
  const enabledAccountCount = managedAccounts.filter((account) => account.enabled).length;
  const products = adminShop?.products || [];
  const listedProductCount = products.filter((product) => product.isListed).length;
  const taunts = adminTaunts?.taunts || [];
  const enabledTauntCount = taunts.filter((taunt) => taunt.enabled).length;
  const currentSeason = statisticsSeasons.find((season) => season.is_active);
  renderShell(`
    <section class="panel admin-hero">
      <div class="admin-hero-head">
        <div>
          <span class="eyebrow">ADMIN CONSOLE</span>
          <h2>管理后台</h2>
          <p>先看概览，再按业务模块展开操作；修改类配置仍在模块内统一保存。</p>
        </div>
        <button type="button" class="secondary compact-button" data-action="show-rooms">返回房间</button>
      </div>
      <div class="admin-overview-grid">
        <button type="button" class="admin-overview-card" data-action="open-admin-module" data-admin-module-id="accounts">
          <span>玩家账号</span><strong>${adminData ? managedAccounts.length : "…"}</strong><small>${adminData ? `${enabledAccountCount} 启用 · ${managedAccounts.length - enabledAccountCount} 停用` : "正在读取"}</small>
        </button>
        <button type="button" class="admin-overview-card" data-action="open-admin-module" data-admin-module-id="profiles">
          <span>玩家资料</span><strong>${adminData ? managedProfiles.length : "…"}</strong><small>昵称、头像、出牌特效</small>
        </button>
        <button type="button" class="admin-overview-card" data-action="open-admin-module" data-admin-module-id="economy">
          <span>商城商品</span><strong>${adminShop ? products.length : "…"}</strong><small>${adminShop ? `${listedProductCount} 件上架` : "正在读取"}</small>
        </button>
        <button type="button" class="admin-overview-card" data-action="open-admin-module" data-admin-module-id="content">
          <span>牌局内容</span><strong>${adminTaunts ? taunts.length : "…"}</strong><small>${adminTaunts ? `${enabledTauntCount} 条嘲讽启用` : "正在读取"}</small>
        </button>
        <button type="button" class="admin-overview-card" data-action="open-admin-module" data-admin-module-id="content">
          <span>当前赛季</span><strong class="admin-overview-text">${statisticsSeasonsLoaded ? escapeHtml(currentSeason?.name || "未设置") : "…"}</strong><small>${statisticsSeasonsLoaded ? `${statisticsSeasons.length} 个赛季` : "正在读取"}</small>
        </button>
      </div>
    </section>

    <div class="admin-module-list">
      ${renderAdminModule(
        "accounts",
        "玩家账号",
        "管理登录账号的创建、启停与密码重置。",
        `<span class="tag ${managedAccounts.length && enabledAccountCount === managedAccounts.length ? "good" : ""}">${adminData ? `${enabledAccountCount}/${managedAccounts.length} 启用` : "加载中"}</span>`,
        `
          <details class="admin-inline-tool">
            <summary><span>创建玩家账号</span><small>同时生成玩家资料</small></summary>
            <div class="admin-inline-tool-body">
              <form class="admin-create-form" data-form="create-account">
                <label>玩家昵称<input name="displayName" required maxlength="16" placeholder="例如 新玩家"></label>
                <label>登录用户名<input name="username" required minlength="3" maxlength="24" pattern="[a-z0-9_-]+" placeholder="例如 benlei"></label>
                <label>初始密码<input name="password" type="password" required minlength="6" maxlength="72"></label>
                <button type="submit">创建账号</button>
              </form>
            </div>
          </details>
          <div class="admin-module-section-head compact">
            <h3>账号状态</h3><span class="meta">点“账号操作”后重置密码或停用账号。</span>
          </div>
          <div class="managed-account-list">
            ${adminDataLoading && !adminData ? `<div class="empty">正在加载账号...</div>` : managedAccounts.map(renderManagedAccount).join("") || `<div class="empty">暂无玩家账号。</div>`}
          </div>
        `
      )}

      ${renderAdminModule(
        "profiles",
        "玩家资料",
        "编辑昵称、头像和出牌特效；皮肤由玩家自行装备。",
        `<span class="tag">${adminData ? `${managedProfiles.length} 位玩家` : "加载中"}</span>`,
        `
          <form class="module-settings-form" data-form="save-profiles">
            <div class="profile-list">
              ${managedProfiles.length ? managedProfiles.map(renderProfileRow).join("") : `<div class="empty">暂无玩家。</div>`}
            </div>
            <div class="module-save-actions"><button type="submit" data-module-save ${managedProfiles.length ? "" : "disabled"}>统一保存玩家资料</button></div>
          </form>
        `
      )}

      ${renderAdminModule(
        "economy",
        "钻石与商城",
        "批量管理商品；钻石和皮肤发放按需展开。",
        `<span class="tag">${adminShop ? `${listedProductCount}/${products.length} 上架` : "加载中"}</span>`,
        `${renderAdminShopManager()}${renderAdminDiamondGrant()}`
      )}

      ${renderAdminModule(
        "content",
        "牌局内容配置",
        "集中管理赛季与预设嘲讽词。",
        `<span class="tag">${statisticsSeasonsLoaded ? `${statisticsSeasons.length} 赛季` : "…"} · ${adminTaunts ? `${enabledTauntCount}/${taunts.length} 嘲讽启用` : "加载中"}</span>`,
        `${renderSeasonManager()}${renderTauntManager()}`
      )}

      ${renderAdminModule(
        "security",
        "管理员安全",
        "仅用于修改当前管理员账号密码。",
        `<span class="tag accent">${escapeHtml(authState.account?.username || "管理员")}</span>`,
        `
          <form class="admin-password-form" data-form="change-password">
            <label>当前密码<input type="password" name="currentPassword" autocomplete="current-password" required maxlength="72"></label>
            <label>新密码<input type="password" name="newPassword" autocomplete="new-password" required minlength="6" maxlength="72"></label>
            <label>确认新密码<input type="password" name="confirmPassword" autocomplete="new-password" required minlength="6" maxlength="72"></label>
            <button type="submit">保存新密码</button>
          </form>
        `
      )}
    </div>
  `);
}

function renderTauntManager() {
  const accounts = adminTaunts?.accounts || [];
  const taunts = adminTaunts?.taunts || [];
  const loading = adminTauntsLoading && !adminTaunts;
  return `
    <section class="admin-module-section taunt-admin-manager">
      <div class="admin-module-section-head">
        <div>
          <h3>牌局嘲讽词</h3>
          <div class="meta">文案、启停与使用范围支持统一保存。</div>
        </div>
        <span class="tag">${taunts.filter((taunt) => taunt.enabled).length}/${taunts.length} 启用</span>
      </div>
      ${loading ? `<div class="empty">正在读取嘲讽词...</div>` : `
        <details class="admin-inline-tool">
          <summary><span>添加嘲讽词</span><small>新增后立即生效</small></summary>
          <div class="admin-inline-tool-body">
            <form class="taunt-admin-card taunt-admin-create" data-form="create-taunt">
              <div class="taunt-admin-head">
                <label class="taunt-text-field">
                  新嘲讽词
                  <input name="text" required maxlength="40" placeholder="输入不超过 40 个字符的固定文案">
                </label>
                <label class="check-label">
                  <input type="checkbox" name="enabled" checked>
                  立即启用
                </label>
                <button type="submit">添加</button>
              </div>
              ${renderTauntAudienceControls(null, accounts)}
            </form>
          </div>
        </details>
        <form class="module-settings-form" data-form="save-taunts">
          <div class="taunt-admin-list">
            ${taunts.length
              ? taunts.map((taunt) => renderTauntAdminRow(taunt, accounts)).join("")
              : `<div class="empty">暂无嘲讽词，可以先添加一条。</div>`}
          </div>
          <div class="module-save-actions"><button type="submit" data-module-save ${taunts.length ? "" : "disabled"}>统一保存嘲讽词设置</button></div>
        </form>
      `}
    </section>
  `;
}

function renderTauntAudienceControls(taunt, accounts) {
  const availableToAll = taunt?.availableToAll !== false;
  const availableAccountIds = new Set(taunt?.availableAccountIds || []);
  return `
    <details class="taunt-audience">
      <summary>
        <span>使用范围</span>
        <span class="tag" data-taunt-audience-summary>${availableToAll ? "所有玩家" : `指定 ${availableAccountIds.size} 人`}</span>
      </summary>
      <div class="taunt-audience-body">
        <label class="check-label taunt-all-users">
          <input
            type="checkbox"
            name="availableToAll"
            data-action="taunt-all-users"
            ${availableToAll ? "checked" : ""}
          >
          所有玩家可用
        </label>
        <div class="taunt-account-grid ${availableToAll ? "is-disabled" : ""}">
          ${accounts.length ? accounts.map((account) => `
            <label class="check-label">
              <input
                type="checkbox"
                name="accountIds"
                value="${escapeHtml(account.id)}"
                ${availableAccountIds.has(account.id) ? "checked" : ""}
                ${availableToAll ? "disabled" : ""}
              >
              <span>${escapeHtml(account.profile?.name || account.username)}</span>
              <small>${escapeHtml(account.username)}${account.enabled ? "" : " · 已停用"}</small>
            </label>
          `).join("") : `<span class="meta">暂无玩家账号。</span>`}
        </div>
      </div>
    </details>
  `;
}

function renderTauntAdminRow(taunt, accounts) {
  return `
    <div class="taunt-admin-card" data-taunt-row data-taunt-id="${escapeHtml(taunt.id)}">
      <div class="taunt-admin-head">
        <label class="taunt-text-field">
          嘲讽词
          <input name="text" required maxlength="40" value="${escapeHtml(taunt.text)}">
        </label>
        <label class="check-label">
          <input type="checkbox" name="enabled" ${taunt.enabled ? "checked" : ""}>
          启用
        </label>
        <div class="taunt-admin-actions">
          <button
            type="button"
            class="secondary danger"
            data-action="delete-taunt"
            data-taunt-id="${escapeHtml(taunt.id)}"
          >删除</button>
        </div>
      </div>
      ${renderTauntAudienceControls(taunt, accounts)}
    </div>
  `;
}

function renderProfileRow(profile) {
  return `
    <article
      class="profile-row"
      data-profile-id="${escapeHtml(profile.id)}"
      data-original-name="${escapeHtml(profile.name)}"
      data-original-play-effect="${escapeHtml(profile.playEffect || "")}"
    >
      <div class="profile-row-summary">
        ${avatarHtml(profile.name, profile.avatarUrl, "small", profile.avatarFrame)}
        <div><b>${escapeHtml(profile.name)}</b><span>${escapeHtml(profile.account?.username || "未绑定账号")}</span></div>
        <span class="tag ${profile.account?.enabled ? "good" : ""}">${profile.playEffect ? "已设出牌特效" : "默认特效"}</span>
      </div>
      <details class="profile-editor">
        <summary class="secondary compact-button">编辑资料</summary>
        <div class="profile-fields">
          <label>
            玩家名称
            <input name="name" maxlength="16" required value="${escapeHtml(profile.name)}">
          </label>
          <label>
            出牌特效
            <select name="playEffect">
              <option value="" ${profile.playEffect ? "" : "selected"}>无</option>
              <option value="fireworks" ${profile.playEffect === "fireworks" ? "selected" : ""}>烟花（至少 8 张且当前最大）</option>
            </select>
          </label>
          <label>
            更换头像
            <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp">
          </label>
        </div>
      </details>
    </article>
  `;
}

function renderRoom() {
  ensurePlayerStatistics();
  ensureShopState();
  const viewer = viewerPlayer();
  const spectating = isSpectating();
  const waitingNextRound = viewerEnteredNextRound();
  const inLobbyView = state.status === "lobby";
  const gameInProgress = state.status === "dealt";
  const showTable = state.stage !== "lobby" && !waitingNextRound;
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
        <section class="panel stack room-overview ${showTable ? "game-room-overview" : ""}">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="meta">房间号</div>
              <div class="room-code">${escapeHtml(state.roomId)}</div>
            </div>
            <div class="tags">
              <span class="tag accent">${state.players.length}/${state.maxPlayers} 人</span>
              ${spectating ? `<span class="tag good">观战 · ${escapeHtml(state.spectator?.targetPlayerName || state.viewer?.name || "玩家")}</span>` : ""}
              <span class="tag">${escapeHtml(waitingNextRound ? "等待其他玩家进入下一局" : state.phase)}</span>
              ${inLobbyView ? `<span class="tag">起叫 ${escapeHtml(state.openingBidPercent || 40)}%</span>` : ""}
              ${inLobbyView ? `<span class="tag good">${escapeHtml(readyStatusText())}</span>` : ""}
            </div>
          </div>
          <div class="share">
            <div class="meta">邀请链接</div>
            <code>${escapeHtml(shareUrl(state.roomId))}</code>
            <div class="row">
              <button type="button" data-action="copy">复制链接</button>
              <button type="button" class="secondary" data-action="open-players">玩家</button>
              ${state.status === "dealt" || state.events.length ? `<button type="button" class="secondary" data-action="open-history">牌局记录 ${state.trickHistory.length} 轮</button>` : ""}
              ${state.canViewKitty ? `<button type="button" class="secondary" data-action="open-kitty">查看底牌</button>` : ""}
              ${spectating ? "" : `
                ${state.viewer.host && state.status === "lobby" ? renderOpeningBidPercentControl() : ""}
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
        ${showTable ? renderRoomManagementActions() : ""}
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
  if (bid.direct) return `${bid.playerName}：${bid.suitName}主`;
  return `${bid.playerName}：${bid.count} 张${bid.suitName}2${bid.random ? "（随机）" : ""}`;
}

function scoreBidText(scoreBid) {
  if (!scoreBid?.currentPlayerId) return `起叫 ${scoreBid?.minimum || 0} 分`;
  return `${scoreBid.currentPlayerName}：${scoreBid.currentScore} 分`;
}

function scoreBidActionButtons() {
  const scoreBidState = state.setup?.scoreBid || {};
  const deadline = scoreBidState.deadlineAt || "";
  const countdown = setupCountdownTag(deadline);
  const passLabel = setupCountdownText(deadline, "）", "过（") || "过";
  const passCountdownAttrs = setupCountdownAttributes(deadline, "）", "过（");
  if (!viewerCanScoreBid()) {
    if (scoreBidState.currentPlayerId === state.viewer?.id) return `<div class="turn-waiting">你是当前最高叫分，等待其他玩家加分或过 ${countdown}</div>`;
    if ((scoreBidState.passIds || []).includes(state.viewer?.id)) return `<div class="turn-waiting">你已过，等待叫分结束 ${countdown}</div>`;
    return `<div class="turn-waiting">等待其他玩家叫分 ${countdown}</div>`;
  }
  if (!scoreBidState.currentPlayerId) {
    return `<button type="button" data-action="score-bid-start">以 ${escapeHtml(scoreBidState.minimum || 0)} 分叫庄</button>`;
  }
  return `
    <span class="score-bid-actions">
      <button type="button" data-action="score-bid-10">+10</button>
      <button type="button" data-action="score-bid-20">+20</button>
      <button type="button" data-action="score-bid-30">+30</button>
      <button type="button" class="secondary" data-action="score-pass" ${passCountdownAttrs}>${escapeHtml(passLabel)}</button>
    </span>
  `;
}

function trumpSuitActionButtons() {
  const options = [
    { id: "S", label: "黑桃", symbol: "♠" },
    { id: "H", label: "红桃", symbol: "♥" },
    { id: "C", label: "草花", symbol: "♣" },
    { id: "D", label: "方块", symbol: "♦" }
  ];
  if (!viewerCanRevealTrump()) return `<div class="turn-waiting">等待庄家选择主花色</div>`;
  return `
    <span class="trump-suit-actions">
      ${options.map((suit) => `
        <button type="button" class="secondary trump-suit-button suit-${suit.id}" data-action="trump-suit-${suit.id}">
          <span>${escapeHtml(suit.symbol)}</span>${escapeHtml(suit.label)}
        </button>
      `).join("")}
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

function renderSetupLines(items) {
  const visibleItems = items.filter((item) => item?.value);
  if (!visibleItems.length) return "";
  return `
    <div class="setup-lines">
      ${visibleItems.map((item) => `
        <span><em>${escapeHtml(item.label)}</em><strong>${item.value}</strong></span>
      `).join("")}
    </div>
  `;
}

function renderSetupCenter() {
  const setup = state.setup || {};
  const stage = state.stage;
  let body = "";
  const colorfulOrder = colorfulFryOrderText();
  const colorfulOrderItem = colorfulOrder
    ? { label: "缤纷顺序（大 → 小）", value: escapeHtml(colorfulOrder) }
    : null;
  const currentTrumpItem = setup.currentTrumpSuitName
    ? { label: "当前主牌", value: escapeHtml(setup.currentTrumpSuitName) }
    : null;

  if (stage === RESTART_CARD_STAGE || stage === OTHER_CARDS_STAGE) {
    const completedIds = state.gameItems?.completedPlayerIds || [];
    const uses = state.gameItems?.uses || [];
    const viewerUses = uses.filter((use) => use.playerId === state.viewer?.id);
    const restartNames = (state.gameItems?.restartUsedPlayerIds || [])
      .map((playerId) => state.players.find((player) => player.id === playerId)?.name)
      .filter(Boolean);
    const useSummary = stage === RESTART_CARD_STAGE
      ? restartNames.map((name) => `${name}已重开`)
      : uses.map((use) => `${use.playerName}使用${use.itemName}`);
    const completed = Boolean(state.gameItems?.viewerCompleted);
    const completeLabel = viewerUses.length ? "完成使用" : "不使用";
    body = `
      ${renderSetupLines([
        { label: "当前阶段", value: stage === RESTART_CARD_STAGE ? "重开卡" : "战神卡、缤纷卡、牌运卡" },
        { label: "倒计时", value: setupCountdownTag(state.gameItems?.deadlineAt, " 后自动完成") },
        { label: "已完成", value: `${completedIds.length}/${state.players.length}` }
      ])}
      ${useSummary.length ? `<div class="game-item-use-summary">${useSummary.map((text) => `<span>${escapeHtml(text)}</span>`).join("")}</div>` : `<div class="meta">尚无玩家使用本阶段卡牌</div>`}
      <div class="row">
        ${!isSpectating() && !completed ? renderGameItemControl() : ""}
        ${!isSpectating() && !completed ? `<button type="button" class="secondary" data-action="complete-item-stage">${escapeHtml(completeLabel)}</button>` : ""}
        ${!isSpectating() && completed ? `<span class="tag good">你已完成选择</span>` : ""}
        ${isSpectating() ? `<span class="tag">观战中</span>` : ""}
      </div>
    `;
  }

  if (stage === "bidding") {
    const turnText = setup.bid
      ? `轮到 ${setup.biddingTurnPlayerName} 抢主或过`
      : "任意玩家可先亮 2 叫主";
    body = `
      ${renderSetupLines([
        { label: "当前叫主", value: escapeHtml(bidText(setup.bid)) },
        { label: "当前动作", value: escapeHtml(turnText) },
        currentTrumpItem
      ])}
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
      ${renderSetupLines([
        { label: "当前叫分", value: escapeHtml(scoreBidText(scoreBidState)) },
        { label: "闲家线", value: `${escapeHtml(idleTarget)} 分` },
        scoreBidState.deadlineAt ? { label: "倒计时", value: setupCountdownTag(scoreBidState.deadlineAt) } : null
      ])}
      <div class="row">${scoreBidActionButtons()}</div>
    `;
  }

  if (stage === "trump-selecting") {
    body = `
      ${renderSetupLines([
        { label: "庄家", value: escapeHtml(setup.bankerName) },
        { label: "最终叫分", value: `${escapeHtml(setup.scoreBid?.currentScore || 0)} 分` }
      ])}
      <div class="row">${trumpSuitActionButtons()}</div>
    `;
  }

  if (stage === "burying") {
    body = `
      ${renderSetupLines([
        { label: "庄家", value: escapeHtml(setup.bankerName) },
        { label: "贴底", value: `选择 ${escapeHtml(state.kittySize)} 张` },
        currentTrumpItem
      ])}
    `;
  }

  if (stage === "frying") {
    const fry = setup.fry || {};
    const deadline = fry.deadlineAt || "";
    const passLabel = actionPassInFlight ? "提交中…" : (setupCountdownText(deadline, "）", "不炒（") || "不炒");
    const passCountdownAttrs = actionPassInFlight ? "" : setupCountdownAttributes(deadline, "）", "不炒（");
    body = `
      ${renderSetupLines([
        { label: "控底", value: escapeHtml(fry.lastFryerName || setup.bankerName) },
        { label: "门槛", value: escapeHtml(bidText(fry.lastBid)) },
        colorfulOrderItem,
        { label: "当前", value: `轮到 ${escapeHtml(fry.currentPlayerName)} ${setupCountdownTag(deadline, " 后自动不炒")}` },
        currentTrumpItem
      ])}
      <div class="row">
        ${viewerCanFry() ? `<button type="button" data-action="open-fry-dialog" ${actionPassInFlight ? "disabled" : ""}>选择2炒底</button>` : ""}
        ${viewerCanFry() ? `<button type="button" class="secondary" data-action="fry-pass" ${actionPassInFlight ? "disabled" : ""} ${passCountdownAttrs}>${escapeHtml(passLabel)}</button>` : ""}
      </div>
    `;
  }

  if (stage === "fry-burying") {
    const fry = setup.fry || {};
    body = `
      ${renderSetupLines([
        { label: "炒底玩家", value: escapeHtml(fry.currentPlayerName) },
        { label: "贴底", value: `选择 ${escapeHtml(state.kittySize)} 张` },
        colorfulOrderItem,
        currentTrumpItem
      ])}
    `;
  }

  if (stage === "dogleg") {
    body = `
      ${renderSetupLines([
        { label: "庄家", value: escapeHtml(setup.bankerName) },
        { label: "主牌", value: escapeHtml(setup.currentTrumpSuitName || setup.trumpSuitName) },
        { label: "狗腿", value: `${escapeHtml(setup.doglegNeeded)} 个` }
      ])}
      <div class="meta">庄家需要选择 1 张非比牌作为狗腿牌；打牌中最先打出该牌的玩家成为狗腿。</div>
    `;
  }

  return `
    <div class="setup-center-content">
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
  if (activeDialog === "items" && (!state.gameItems?.canUse || isSpectating())) activeDialog = null;
  if (activeDialog === "bid" && viewerCanBid()) return renderBidFryDialog("bid");
  if (activeDialog === "fry" && viewerCanFry()) return renderBidFryDialog("fry");
  if (activeDialog === "room-action-confirm" && pendingRoomAction) return renderRoomActionConfirmDialog();
  if (activeDialog === "items" && state.gameItems?.canUse && !isSpectating()) return renderGameItemsDialog();
  if (activeDialog === "taunts" && state.stage === "playing" && !isSpectating()) return renderTauntDialog();
  if (activeDialog === "kitty" && state.canViewKitty) return renderKittyDialog();
  if (activeDialog === "history") return renderHistoryDialog();
  if (activeDialog === "players") return renderPlayersDialog();
  if (activeDialog === "events") return renderHistoryDialog();
  if (activeDialog === "spectators") return renderSpectatorsDialog();
  if (activeDialog === "result" && state.stage === "finished" && !viewerEnteredNextRound()) return renderResultPanel();
  return "";
}

function renderRoomActionConfirmDialog() {
  const resetting = pendingRoomAction === "reset";
  const title = resetting ? "确认重开房间？" : "确认解散房间？";
  const description = resetting
    ? "当前牌局会立即结束，所有玩家回到房间等待状态，已进行的出牌不会保留。"
    : "房间会立即解散，所有玩家和观战者都会离开，之后无法返回本房间。";
  return `
    <div class="modal-backdrop">
      <section class="modal-card room-action-confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="stack">
          <div>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(description)}</p>
          </div>
          <div class="row room-action-confirm-buttons">
            <button type="button" class="secondary" data-action="close-dialog">取消</button>
            <button type="button" class="danger" data-action="confirm-room-action">${resetting ? "确认重开" : "确认解散"}</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderGameItemsDialog() {
  const stageType = state.gameItems?.stageType;
  const itemMatchesStage = (item) => stageType === RESTART_CARD_STAGE
    ? item.assetKey === "restart-card"
    : item.assetKey !== "restart-card";
  const catalog = (shopState?.products || []).filter((product) =>
    product.productType === "consumable_item"
    && (product.isListed || Number(shopState?.inventory?.[product.assetKey]?.available || 0) > 0)
    && itemMatchesStage(product)
  );
  const fallbackItems = CONSUMABLE_ITEM_FALLBACKS.filter(itemMatchesStage);
  const items = catalog.length ? catalog : fallbackItems;
  const uses = state.gameItems?.uses || [];
  const viewerId = state.viewer?.id;
  return `
    <div class="modal-backdrop">
      <section class="modal-card game-items-modal" role="dialog" aria-modal="true" aria-label="使用对局道具">
        <div class="section-head">
          <div><h2>${stageType === RESTART_CARD_STAGE ? "重开卡阶段" : "其他卡牌阶段"}</h2><div class="meta">${state.gameItems?.freeUse ? "本局含 AI，使用后不消耗卡片；" : ""}每位玩家每局每种卡牌限用一次，可使用多种。</div></div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
        ${colorfulFryOrderText() ? `<div class="colorful-order">缤纷卡顺序（大 → 小）：<strong>${escapeHtml(colorfulFryOrderText())}</strong></div>` : ""}
        <div class="game-items-list">
          ${items.map((item) => {
            const count = Number(shopState?.inventory?.[item.assetKey]?.available || 0);
            const usedByViewer = uses.some((use) => use.playerId === viewerId && use.itemId === item.assetKey);
            const restartUsed = item.assetKey === "restart-card" && (state.gameItems?.restartUsedPlayerIds || []).includes(viewerId);
            const disabled = !count || usedByViewer || restartUsed || state.gameItems?.viewerCompleted || Boolean(itemUseInFlight);
            return `
              <article class="game-item-row">
                ${shopProductPreview({ ...item, productType: "consumable_item" })}
                <div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p><span class="tag">${state.gameItems?.freeUse ? "AI 局免费使用 · " : ""}背包 ${count}</span></div>
                <button type="button" data-action="use-game-item" data-item-id="${escapeHtml(item.assetKey)}" ${disabled ? "disabled" : ""}>${itemUseInFlight === item.assetKey ? "使用中…" : usedByViewer || restartUsed ? "本局已用" : count ? "使用" : "暂无"}</button>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderTauntDialog() {
  const presets = state.tauntPresets || [];
  return `
    <div class="modal-backdrop">
      <section class="modal-card taunt-modal" role="dialog" aria-modal="true" aria-label="发送嘲讽">
        <div class="section-head">
          <div>
            <h2>发送嘲讽</h2>
            <div class="meta">发送后会在你的头像上显示几秒，牌桌内所有人都能看到。</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
        <div class="taunt-preset-list">
          ${presets.map((preset) => `
            <button
              type="button"
              class="secondary taunt-preset"
              data-action="send-taunt"
              data-preset-id="${escapeHtml(preset.id)}"
              ${tauntInFlight ? "disabled" : ""}
            >${escapeHtml(preset.text)}</button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
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

function diamondRewardTitle(reward) {
  if (!reward) return "";
  const parts = [`基础 ${reward.baseAmount || 0}`];
  if (reward.winBonus) parts.push(`胜利 +${reward.winBonus}`);
  if (reward.titleBonus) {
    const titles = (reward.titleRewards || []).map((item) => `${item.label} +${item.amount}`).join("、");
    const capped = Number(reward.titleBonusBeforeCap) > Number(reward.titleBonus)
      ? `，原合计 ${reward.titleBonusBeforeCap}，封顶 ${reward.titleBonus}`
      : "";
    parts.push(`称号 +${reward.titleBonus}${titles ? `（${titles}${capped}）` : ""}`);
  }
  return parts.join("，");
}

function renderDiamondReward(reward) {
  if (!reward) return `<span class="result-diamond muted">💎 —</span>`;
  const title = diamondRewardTitle(reward);
  if (reward.status === "ineligible") {
    const ineligibleTitle = reward.reason === "spectator"
      ? "观战身份不参与本局钻石结算"
      : "含机器人、未登录或重复账号席位的牌局不发钻石";
    return `<span class="result-diamond muted" title="${escapeHtml(ineligibleTitle)}">💎 不发放</span>`;
  }
  if (reward.status === "awarded") {
    return `<span class="result-diamond awarded" title="${escapeHtml(title)}">💎 +${escapeHtml(reward.awardedAmount ?? reward.totalAmount ?? 0)}</span>`;
  }
  if (reward.status === "pending") {
    return `<span class="result-diamond pending" title="${escapeHtml(title)}">💎 +${escapeHtml(reward.totalAmount || 0)} 处理中</span>`;
  }
  return `<span class="result-diamond muted" title="钻石奖励暂未入账">💎 未入账</span>`;
}

function renderViewerDiamondSummary(result) {
  if (isSpectating()) {
    return `<div class="diamond-reward-summary muted"><strong>观战不获得钻石</strong><span>观战用户只查看牌局，不参与本局奖励结算。</span></div>`;
  }
  const player = result?.playerResults?.find((item) => item.playerId === state?.viewer?.id);
  const reward = player?.diamondReward;
  if (!reward) return "";
  if (reward.status === "ineligible") {
    return reward.reason === "spectator"
      ? `<div class="diamond-reward-summary muted"><strong>观战不获得钻石</strong><span>观战用户只查看牌局，不参与本局奖励结算。</span></div>`
      : `<div class="diamond-reward-summary muted"><strong>本局不发钻石</strong><span>只有全部席位均为已登录真人账号时才会发放。</span></div>`;
  }
  const amount = reward.status === "awarded"
    ? reward.awardedAmount ?? reward.totalAmount ?? 0
    : reward.totalAmount || 0;
  const stateText = reward.status === "awarded"
    ? `已入账，当前余额 ${escapeHtml(reward.balanceAfter ?? diamondWallet?.balance ?? "—")}`
    : "正在写入钱包";
  return `
    <div class="diamond-reward-summary ${reward.status === "awarded" ? "awarded" : "pending"}">
      <strong>💎 本局 ${reward.status === "awarded" ? "获得" : "预计获得"} +${escapeHtml(amount)}</strong>
      <span>${escapeHtml(diamondRewardTitle(reward))} · ${stateText}</span>
    </div>
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
  const spectating = isSpectating();
  return `
    <div class="modal-backdrop">
      <section class="modal-card result-modal stack" role="dialog" aria-modal="true" aria-label="总结看板">
        <div class="section-head">
          <div>
            <h2>总结看板</h2>
            <div class="meta">${escapeHtml(spectating ? "观战用户不参与下一局准备和钻石结算。" : "点击再来一局后，只有你自己进入准备页并自动准备，其他玩家仍可继续查看结算。")}</div>
          </div>
          <div class="row">
            ${spectating
              ? `<button type="button" class="secondary" data-action="leave-spectating">结束观战</button>`
              : `<button type="button" data-action="play-again">再来一局</button>
                 <button type="button" class="secondary" data-action="room-leave">退出房间</button>`}
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
          ${result.itemAdjustments?.length ? " 战神卡调整单独计算，并已计入下方个人最终积分。" : ""}
        </div>
        <div class="score-breakdown">
          <span class="tag">胜负 ${signedScore(null, result.baseScore)}</span>
          <span class="tag">上下台阶 ${signedScore(null, result.scoreStep)}</span>
          <span class="tag">保底 ${signedScore(null, result.bottomDelta)}</span>
          <span class="tag">拖五 ${signedScore(null, result.draggedDelta)}</span>
          <span class="tag">甩牌 ${signedScore(null, result.throwFailureDelta || 0)}</span>
          ${result.bottomDraggedRedFives || result.bottomDraggedDiamondFives ? `<span class="tag accent">底牌拖主：红五 ${result.bottomDraggedRedFives}，方五 ${result.bottomDraggedDiamondFives}</span>` : ""}
        </div>
        ${renderViewerDiamondSummary(result)}
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
              ${renderDiamondReward(player.diamondReward)}
              <span class="result-final-score">
                <b>${signedScore(player.gameScoreText, player.gameScore)}</b>
                ${Number(player.itemScoreDelta || 0) ? `<small>原始 ${signedScore(player.baseGameScoreText, player.baseGameScore)} · 道具 ${signedScore(player.itemScoreDeltaText, player.itemScoreDelta)}</small>` : ""}
              </span>
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
  const colorfulOrder = isBid ? "" : colorfulFryOrderText();
  const validation = validateBidLikeSelection(type);
  const currentBid = isBid ? state.setup?.bid : state.setup?.fry?.lastBid;
  const twoCards = sortCardsForGroup("rank", (state.hand || []).filter(isTwoCard));
  const passAction = isBid ? "bid-pass" : "fry-pass";
  const canPass = isBid ? viewerCanPassBid() : viewerCanFry();
  const fryDeadline = state.setup?.fry?.deadlineAt || "";
  const passLabel = isBid ? "过" : (setupCountdownText(fryDeadline, "）", "不炒（") || "不炒");
  const passCountdownAttrs = isBid ? "" : setupCountdownAttributes(fryDeadline, "）", "不炒（");
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
        ${colorfulOrder ? `<div class="colorful-order">花色 2 大小（大 → 小）：<strong>${escapeHtml(colorfulOrder)}</strong></div>` : ""}
        <div class="choice-panel">
          <div class="choice-title">
            <strong>我的 2</strong>
            <span class="tag">${twoCards.length} 张</span>
          </div>
          ${twoCards.length ? renderTwoCardChoices(twoCards) : `<div class="empty">手里没有可用于${escapeHtml(title)}的 2。</div>`}
        </div>
        <div class="dialog-actions">
          ${renderGameItemControl()}
          ${canPass ? `<button type="button" class="secondary" data-action="${passAction}" ${passCountdownAttrs}>${escapeHtml(passLabel)}</button>` : `<button type="button" class="secondary" data-action="close-dialog">过</button>`}
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

function renderDoglegTableTag() {
  const setup = state.setup || {};
  const card = setup.doglegCard;
  if (!card) return "";
  const names = setup.doglegPlayerNames || [];
  const needed = Number(setup.doglegNeeded) || 0;
  const revealText = names.length ? `已出现：${names.join("、")}` : "尚未出现";
  return `
    <span class="tag table-dogleg-tag" title="${escapeHtml(revealText)}">
      狗腿牌 <strong class="${escapeHtml(card.color || suitColor(card.suit))}">${escapeHtml(doglegCardText(card))}</strong>
      <i>${names.length}/${needed}</i>
    </span>
  `;
}

function renderTableToolbar(title, statusTag = "") {
  const spectating = isSpectating();
  return `
    <div class="game-table-toolbar">
      <div class="game-table-heading">
        <h2>${escapeHtml(title)}</h2>
        <span class="table-room-code" title="房间号">#${escapeHtml(state.roomId)}</span>
        <span class="tag accent">${state.players.length}/${state.maxPlayers} 人</span>
        <span class="tag">${escapeHtml(state.phase)}</span>
        ${spectating ? `<span class="tag good">观战 · ${escapeHtml(state.spectator?.targetPlayerName || state.viewer?.name || "玩家")}</span>` : ""}
      </div>
      <div class="game-table-status tags">
        ${renderGameInfoTags()}
        ${renderDoglegTableTag()}
        ${statusTag}
      </div>
      <div class="game-table-actions">
        <button type="button" class="secondary compact-button" data-action="copy">复制邀请</button>
        <button type="button" class="secondary compact-button" data-action="open-players">玩家</button>
        <button type="button" class="secondary compact-button" data-action="open-history">记录 ${state.trickHistory.length} 轮</button>
        ${state.canViewKitty ? `<button type="button" class="secondary compact-button" data-action="open-kitty">底牌</button>` : ""}
      </div>
    </div>
  `;
}

function renderRoomManagementActions() {
  if (isSpectating() || !state.viewer?.host) return "";
  return `
    <div class="room-table-management">
      <span>房间管理</span>
      ${state.status === "dealt" ? `<button type="button" class="secondary compact-button" data-action="reset">重开房间</button>` : ""}
      <button type="button" class="danger compact-button" data-action="dissolve-room">解散房间</button>
    </div>
  `;
}

function renderPlayTable() {
  if (state.stage === "finished") {
    const finalTrick = state.trickHistory?.[state.trickHistory.length - 1] || null;
    return `
      <section class="panel stack game-table-panel">
        ${renderTableToolbar("打牌桌面", `<span class="tag accent">本局结束</span>`)}
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
    <section class="panel stack game-table-panel">
      ${renderTableToolbar("打牌桌面", `<span class="tag good">${escapeHtml(holdingPreviousResult ? `${turnText}，上一轮结果暂留` : turnText)}</span>`)}
      ${renderTrick(tableTrick, true, { heldResult: holdingPreviousResult })}
    </section>
  `;
}

function renderSetupTable() {
  const setup = state.setup || {};
  const titleByStage = {
    [RESTART_CARD_STAGE]: "重开卡阶段",
    [OTHER_CARDS_STAGE]: "其他卡牌阶段",
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
    <section class="panel stack game-table-panel setup-stage setup-stage-${escapeHtml(state.stage)}">
      ${renderTableToolbar(titleByStage[state.stage] || "牌桌")}
      ${renderTrick(tableTrick, true, { setupTable: true })}
    </section>
  `;
}

function setupSeatStatus(player) {
  const setup = state.setup || {};
  const fry = setup.fry || {};
  if (state.stage === RESTART_CARD_STAGE || state.stage === OTHER_CARDS_STAGE) {
    if ((state.gameItems?.completedPlayerIds || []).includes(player.id)) return { text: "已完成", tone: "good" };
    const usedCount = state.stage === RESTART_CARD_STAGE
      ? ((state.gameItems?.restartUsedPlayerIds || []).includes(player.id) ? 1 : 0)
      : (state.gameItems?.uses || []).filter((use) => use.playerId === player.id).length;
    return usedCount ? { text: `已用 ${usedCount} 张`, tone: "accent" } : { text: "选择卡牌", tone: "" };
  }
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
    if (setup.bankerId === player.id) return { text: "选主花色", tone: "good" };
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
          <span>${escapeHtml(action.kind === "score" ? `${action.score}分` : action.direct ? `${action.suitName}主` : `${action.count}张${action.suitName}2${action.random ? " 随机" : ""}`)}</span>
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
            ${renderLuckyMark(play.playerId)}
            ${renderWarGodMark(play.playerId)}
            ${renderTauntBubble(play.playerId, true)}
            ${renderPlayerHistoryMini(play.playerId, { overlay: true })}
          </div>
          <div class="seat-hand-profile-copy">
            <div class="seat-hand-player-line">
              <strong><span class="seat-hand-name">${escapeHtml(play.playerName)}</span>${roleMark(play.role, play.playerId)}${renderAutoPlayMark(roomPlayer)}</strong>
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
            ${setupTable ? "" : `<strong>${finishedResult ? "本局结束" : heldResult ? `第 ${trick.number} 轮结果` : `第 ${trick.number} 轮`}</strong>`}
            ${setupTable ? renderSetupCenter() : `<span>${escapeHtml(finishedResult ? `${state.result?.winnerTeamName || "胜方"}获胜` : titleMeta)}</span>`}
            ${finishedResult ? `<button type="button" data-action="open-result">查看结算</button>` : ""}
          </div>
        ` : ""}
        ${displayPlays.map((play, index) => {
          const playCards = displayedPlayCards(play);
          const playContent = setupTable ? renderSetupActionTrail(play.setupActions, play.cardSkin || cardSkinForPlayer(play.playerId)) : (play.played ? renderPlayedCards(play, playCards, trick.number) : "");
          const isViewerSeat = current && play.playerId === state.viewer?.id;
          const showViewerHand = isViewerSeat && !finishedResult;
          const hasActiveTaunt = Boolean(activeTauntForPlayer(play.playerId));
          const playIndex = play.turnIndex ?? index;
          const statusText = playStatusText(trick, play, playIndex, current, { heldResult, setupTable });
          const statusTone = playStatusTone(trick, play, current, { heldResult, setupTable });
          const seatHand = showViewerHand ? renderSeatHand(viewerAction, play, trick, playIndex, { heldResult, setupTable }) : "";
          const playEffect = setupTable ? "" : renderLargePlayEffect(play, trick.number);
          const playerCard = `
            <div class="trick-player ${roleClass(play.role)} ${play.played ? "played" : ""} ${play.lead ? "lead" : ""} ${play.currentTurn ? "current-turn" : ""} ${play.winning ? "winning" : ""}">
              ${renderTablePlayerSummary(play, statusText, statusTone)}
              ${!current && play.played ? renderPlayedCards(play, playCards, trick.number) : ""}
            </div>
          `;
          if (!current) return playerCard;
          return `
            <div class="trick-seat ${seatZone(index, displayPlays.length)} ${isViewerSeat ? "viewer-seat" : ""} ${hasActiveTaunt ? "taunt-active" : ""}" style="${seatStyle(index, displayPlays.length)}">
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
  const text = role === "狗腿" ? "狗腿" : role === "庄家" || role === "主" ? "庄家" : "闲";
  const tone = role === "狗腿" ? "dogleg" : role === "庄家" || role === "主" ? "accent" : "idle";
  const reveal = role === "狗腿" && doglegRevealEffects.some((effect) => effect.playerId === playerId && effect.until > Date.now());
  return `<span class="role-mark ${tone} ${reveal ? "dogleg-role-reveal" : ""}" title="${escapeHtml(role)}">${escapeHtml(text)}</span>`;
}

function roleClass(role) {
  if (role === "狗腿") return "banker-team dogleg-team";
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

function activeTauntForPlayer(playerId) {
  return (state?.taunts || []).find((item) =>
    item.playerId === playerId && new Date(item.expiresAt).getTime() > Date.now()
  );
}

function renderTauntBubble(playerId, large = false) {
  const taunt = activeTauntForPlayer(playerId);
  if (!taunt) return "";
  return `
    <span class="player-taunt ${large ? "large" : ""}" role="status" aria-live="polite">
      ${escapeHtml(taunt.text)}
    </span>
  `;
}

function renderLuckyMark(playerId) {
  if (!(state?.gameItems?.luckyPlayerIds || []).includes(playerId)) return "";
  const self = !isSpectating() && state?.viewer?.id === playerId;
  const playerName = state?.players?.find((player) => player.id === playerId)?.name || "他";
  const text = self ? "牌运之神庇佑着你" : "牌运之神庇佑着他";
  return `
    <span class="lucky-deity-mark" title="${escapeHtml(self ? text : `牌运之神庇佑着${playerName}`)}">
      <span class="lucky-deity-figure" aria-hidden="true">🧚</span>
      <small>${escapeHtml(text)}</small>
    </span>
  `;
}

function renderWarGodMark(playerId) {
  if (!(state?.gameItems?.warGodPlayerIds || []).includes(playerId)) return "";
  const playerName = state?.players?.find((player) => player.id === playerId)?.name || "该玩家";
  return `
    <span class="war-god-mark" title="${escapeHtml(`${playerName}已使用战神卡`)}" aria-label="${escapeHtml(`${playerName}已使用战神卡`)}">
      <span aria-hidden="true">⚔</span>
      <small>战神</small>
    </span>
  `;
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
      ${renderLuckyMark(playerId)}
      ${renderWarGodMark(playerId)}
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
        ${renderLuckyMark(play.playerId)}
        ${renderWarGodMark(play.playerId)}
        ${renderTauntBubble(play.playerId)}
        ${renderPlayerHistoryMini(play.playerId, { overlay: true })}
      </span>
      ${roleMark(play.role, play.playerId)}
      <span class="name-text">${escapeHtml(play.playerName)}</span>
    </span>
  `;
}

function renderTablePlayerSummary(play, statusText, statusTone) {
  const player = state?.players?.find((item) => item.id === play.playerId);
  const avatarFrame = play.avatarFrame || player?.avatarFrame || "";
  return `
    <div class="trick-player-main">
      <span class="trick-player-meta">
        ${roleMark(play.role, play.playerId)}
        <span class="seat-status ${escapeHtml(statusTone)}">${escapeHtml(statusText)}</span>
      </span>
      <span class="table-player-avatar-stage" tabindex="0" aria-label="查看${escapeHtml(play.playerName)}的历史数据">
        ${avatarHtml(play.playerName, play.avatarUrl, "small", avatarFrame)}
        ${renderLuckyMark(play.playerId)}
        ${renderWarGodMark(play.playerId)}
        ${renderTauntBubble(play.playerId)}
        ${renderPlayerHistoryMini(play.playerId, { overlay: true })}
      </span>
      <span class="trick-player-summary">
        <span class="trick-player-line">
          <strong class="trick-player-display-name">${escapeHtml(play.playerName)}</strong>
          ${renderAutoPlayMark(player || play)}
        </span>
        ${renderCompactPlayerStats(play)}
      </span>
    </div>
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
  const draggedRedFives = Number(play.draggedRedFives) || 0;
  const draggedDiamondFives = Number(play.draggedDiamondFives) || 0;
  const throwFailures = Number(play.throwFailures) || 0;
  return `
    <div class="trick-player-stats ${handCount === null ? "" : "with-hand-count"}" aria-label="${escapeHtml(`${play.playerName || "玩家"}本局表现`)}">
      <span class="player-stat-score" title="本局获得牌分"><i>牌</i><b>${play.score || 0}</b></span>
      ${draggedRedFives ? `<span class="player-stat-red" title="被拖红五"><i>红</i><b>${draggedRedFives}</b></span>` : ""}
      ${draggedDiamondFives ? `<span class="player-stat-diamond" title="被拖方五"><i>方</i><b>${draggedDiamondFives}</b></span>` : ""}
      ${throwFailures ? `<span class="player-stat-throw" title="甩牌失败"><i>甩</i><b>${throwFailures}</b></span>` : ""}
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
    return `--seat-x:${x.toFixed(2)}%;--seat-y:9%;`;
  }
  const y = sideSeatY(side.slot, counts.left);
  return `--seat-x:12%;--seat-y:${y.toFixed(2)}%;`;
}

function sideSeatY(slot, count, reverse = false) {
  const positions = count <= 1 ? [42] : [35, 54];
  const positionIndex = reverse ? positions.length - 1 - slot : slot;
  return positions[Math.max(0, Math.min(positionIndex, positions.length - 1))];
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

function historySuitDetail(suit) {
  return {
    S: { name: "黑桃", symbol: "♠" },
    H: { name: "红桃", symbol: "♥" },
    C: { name: "草花", symbol: "♣" },
    D: { name: "方块", symbol: "♦" }
  }[suit] || { name: "未定", symbol: "" };
}

function historySourceFromState() {
  const tricks = [...(state.trickHistory || [])];
  if (state.currentTrick && (state.currentTrick.plays || []).some((play) => play.played && play.cards?.length)) {
    tricks.push(state.currentTrick);
  }
  return {
    setup: state.setup || {},
    events: state.events || [],
    trickHistory: tricks,
    removedCards: state.removedCards || [],
    trumpSuit: currentTrumpSuit(),
    players: state.players || [],
    finishedAt: state.result?.finishedAt || null
  };
}

function historySourceFromStoredGame(game) {
  return {
    setup: game.setup_data || {},
    events: game.setup_data?.events || [],
    trickHistory: game.trick_history || [],
    removedCards: game.removed_cards || [],
    trumpSuit: game.trump_suit || null,
    players: game.players || [],
    finishedAt: game.finished_at || null
  };
}

function historyPlayerName(source, playerId) {
  const player = (source.players || []).find((item) => (item.id || item.roomPlayerId) === playerId);
  return player?.name || "玩家";
}

function historyPlayerRole(source, playerId) {
  const player = (source.players || []).find((item) => (item.id || item.roomPlayerId) === playerId);
  return player?.role || "";
}

function setupHistoryEntries(source) {
  const setup = source.setup || {};
  const entries = [];
  (setup.scoreBid?.history || []).forEach((action) => {
    entries.push({
      kind: "setup",
      label: "叫分",
      at: action.at || null,
      text: `${action.playerName || historyPlayerName(source, action.playerId)} 叫到 ${action.score} 分`
    });
  });
  (setup.bidHistory || []).forEach((action) => {
    const playerName = action.playerName || historyPlayerName(source, action.playerId);
    entries.push({
      kind: "setup",
      label: action.direct ? "定主" : "叫主",
      at: action.at || null,
      text: action.direct
        ? `${playerName} 选择${action.suitName || historySuitDetail(action.suit).name}为主`
        : `${playerName} ${action.random ? "被随机指定" : "亮出"}${action.count || 1}张${action.suitName || historySuitDetail(action.suit).name}2`
    });
  });
  (setup.fry?.history || []).forEach((action) => {
    entries.push({
      kind: "fry",
      label: "炒底",
      at: action.at || null,
      text: `${action.playerName || historyPlayerName(source, action.playerId)} 用 ${action.count} 张${action.suitName || historySuitDetail(action.suit).name}2 炒底`
    });
  });
  return entries;
}

function timelineEventKind(text) {
  if (/炒底|不炒/.test(text)) return "fry";
  if (/叫分|叫主|抢主|庄家|主牌|贴底|底牌|狗腿/.test(text)) return "setup";
  return "event";
}

function isDuplicatedPlayEvent(text) {
  return / 第 \d+ 轮出了 /.test(text) || /^第 \d+ 轮结束：/.test(text);
}

function historyTimelineEntries(source) {
  let sequence = 0;
  const events = (source.events || [])
    .filter((event) => event?.text && !isDuplicatedPlayEvent(event.text))
    .map((event) => ({
      kind: timelineEventKind(event.text),
      label: timelineEventKind(event.text) === "fry" ? "炒底" : "牌局",
      at: event.at || null,
      text: event.text,
      sequence: sequence += 1
    }));
  if (!events.length) {
    setupHistoryEntries(source).forEach((entry) => events.push({ ...entry, sequence: sequence += 1 }));
  }

  (source.trickHistory || []).forEach((trick) => {
    const entry = createHistoryTrickEntry(trick, {
      sequence: sequence += 1,
      playerName: (playerId) => historyPlayerName(source, playerId),
      playerRole: (playerId) => historyPlayerRole(source, playerId),
      playSuits: (cards) => uniquePlaySuits(cards, source.trumpSuit)
    });
    if (entry.plays.length) events.push(entry);
  });

  return events.sort((left, right) => {
    const leftAt = left.at ? new Date(left.at).getTime() : Number.MAX_SAFE_INTEGER;
    const rightAt = right.at ? new Date(right.at).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return left.sequence - right.sequence;
  });
}

function historyFilterOptions(source) {
  const options = [
    { value: "all", label: "全部" },
    { value: "fry", label: "炒底" }
  ];
  if (!source.trumpSuit) return options;
  const trump = historySuitDetail(source.trumpSuit);
  options.push({ value: "suit:TRUMP", label: `主牌 ${trump.symbol}${trump.name}` });
  ["S", "H", "C", "D"].filter((suit) => suit !== source.trumpSuit).forEach((suit) => {
    const detail = historySuitDetail(suit);
    options.push({ value: `suit:${suit}`, label: `${detail.symbol}${detail.name}` });
  });
  return options;
}

function filteredHistoryEntries(entries) {
  return filterHistoryTimelineEntries(entries, historyFilter);
}

function renderHistoryTimelineEntry(entry, source) {
  if (entry.kind !== "trick") {
    return `
      <article class="history-timeline-entry history-${escapeHtml(entry.kind)}">
        <time>${escapeHtml(fmtTime(entry.at))}</time>
        <div class="history-entry-body">
          <div class="history-entry-head"><span class="tag ${entry.kind === "fry" ? "accent" : ""}">${escapeHtml(entry.label)}</span></div>
          <p>${escapeHtml(entry.text)}</p>
        </div>
      </article>
    `;
  }
  return `
    <article class="history-timeline-entry history-trick">
      <time>${escapeHtml(fmtTime(entry.at))}</time>
      <div class="history-entry-body">
        <div class="history-entry-head history-trick-head">
          <span class="tag">${escapeHtml(entry.label)}</span>
          <span class="meta">${entry.plays.length} 人出牌 · 按出牌顺序${entry.points ? ` · 本轮 ${entry.points} 分` : ""}</span>
        </div>
        <div class="history-trick-plays">
          ${entry.plays.map((play) => `
            <section class="history-trick-play">
              <div class="history-entry-head">
                <span class="history-play-order">第 ${play.order} 手</span>
                <strong>${escapeHtml(play.playerName)}</strong>
                ${play.role ? `<span class="history-role">${escapeHtml(play.role)}</span>` : ""}
                ${play.lead ? `<span class="tag lead">首家</span>` : ""}
                ${play.winning ? `<span class="tag good">本轮最大${entry.points ? ` · ${entry.points}分` : ""}</span>` : ""}
                ${play.throwPlay ? `<span class="tag accent">甩牌成功</span>` : ""}
                ${play.throwFailed ? `<span class="tag bad">甩牌失败</span>` : ""}
              </div>
              ${renderMiniCards(play.cards, { trumpSuit: source.trumpSuit, cardSkin: "" })}
            </section>
          `).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderHistoryRecordDialog(source, options = {}) {
  const entries = historyTimelineEntries(source);
  const removedCards = source.removedCards || [];
  const filters = historyFilterOptions(source);
  if (!filters.some((option) => option.value === historyFilter)) historyFilter = "all";
  const visibleEntries = filteredHistoryEntries(entries);
  const playCount = entries
    .filter((entry) => entry.kind === "trick")
    .reduce((total, entry) => total + entry.plays.length, 0);
  return `
    <div class="modal-backdrop">
      <section class="modal-card history-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(options.title || "牌局记录")}">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(options.title || "牌局记录")}</h2>
            <div class="meta">${escapeHtml(options.meta || `${playCount} 次出牌 · 每轮按出牌顺序展示`)}</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="${escapeHtml(options.closeAction || "close-dialog")}">关闭</button>
        </div>
        <div class="history-filters" role="group" aria-label="筛选牌局记录">
          ${filters.map((filter) => `
            <button type="button" class="${historyFilter === filter.value ? "" : "secondary"} compact-button" data-action="filter-history" data-history-filter="${escapeHtml(filter.value)}">${escapeHtml(filter.label)}</button>
          `).join("")}
        </div>
        ${removedCards.length && historyFilter === "all" ? `
          <div class="history-removed-cards">
            <div class="section-head compact">
              <h3>开局移除的4</h3>
              <span class="tag">${removedCards.length} 张</span>
            </div>
            <div class="kitty-cards">${sortCardsForPlay(removedCards, source.trumpSuit).map(renderStaticCard).join("")}</div>
          </div>
        ` : ""}
        ${visibleEntries.length ? `
          <div class="history-timeline" data-preserve-scroll="${escapeHtml(options.scrollKey || "live-game-history")}">
            ${visibleEntries.map((entry) => renderHistoryTimelineEntry(entry, source)).join("")}
          </div>
        ` : `<div class="empty">${historyFilter === "all" ? "本局还没有记录" : "没有符合当前筛选的记录"}</div>`}
      </section>
    </div>
  `;
}

function renderHistoryDialog() {
  return renderHistoryRecordDialog(historySourceFromState());
}

function renderStoredGameHistoryDialog() {
  if (statisticsGameLogLoadingId === statisticsGameLogId && !statisticsGameLogs.has(statisticsGameLogId)) {
    return `
      <div class="modal-backdrop">
        <section class="modal-card history-modal" role="dialog" aria-modal="true" aria-label="牌局记录">
          <div class="section-head"><h2>牌局记录</h2><button type="button" class="secondary compact-button" data-action="close-stored-game-history">关闭</button></div>
          <div class="empty">正在读取牌局记录...</div>
        </section>
      </div>
    `;
  }
  const game = statisticsGameLogs.get(statisticsGameLogId);
  if (!game) return "";
  const trump = historySuitDetail(game.trump_suit);
  return renderHistoryRecordDialog(historySourceFromStoredGame(game), {
    title: `牌局记录 · ${fmtDateTime(game.finished_at)}`,
    meta: `房间 ${game.room_code || "-"} · 主牌 ${trump.symbol}${trump.name} · 闲家 ${game.idle_score}/${game.threshold} 分`,
    closeAction: "close-stored-game-history",
    scrollKey: `stored-game-history-${game.game_id}`
  });
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
          ${player.autoPlayEnabled ? `<span class="tag auto-play-mark">托管中</span>` : ""}
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

function handUsesFinalTrumpOrder() {
  return state?.stage === "dogleg" || state?.stage === "playing";
}

function isCounselor(card, trumpSuit) {
  return card.type === "normal" && card.rank === "3" && trumpSuit && suitColor(card.suit) === suitColor(trumpSuit);
}

function isFixedRankCard(card) {
  const trumpSuit = currentTrumpSuit();
  const usesFinalTrumpOrder = handUsesFinalTrumpOrder();
  if (card.type === "joker") return true;
  if (card.rank === "2") return true;
  if (usesFinalTrumpOrder && isCounselor(card, trumpSuit)) return true;
  if (usesFinalTrumpOrder && trumpSuit && card.suit === trumpSuit) return true;
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

function sortCardsForPlay(cards, trumpSuit = currentTrumpSuit()) {
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
  const rankGroupLabel = handUsesFinalTrumpOrder() && trumpSuit ? "主牌/比牌" : "比牌";
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
  if (group.id === "rank") return handUsesFinalTrumpOrder() ? "主" : "比";
  return ({ S: "♠", H: "♥", C: "♣", D: "♦" })[group.id] || group.label;
}

function renderCompactHandGroupLabel(group) {
  if (group.id !== "rank" || !handUsesFinalTrumpOrder()) {
    return escapeHtml(compactHandGroupLabel(group));
  }
  const trumpSuit = currentTrumpSuit();
  const symbol = ({ S: "♠", H: "♥", C: "♣", D: "♦" })[trumpSuit] || "";
  return `主牌${symbol ? `<em class="hand-trump-suit suit-${escapeHtml(trumpSuit)}">${escapeHtml(symbol)}</em>` : ""}`;
}

function isHiddenDoglegHandCard(card) {
  const setup = state?.setup || {};
  const doglegCard = setup.doglegCard;
  const revealedIds = setup.doglegPlayerIds || [];
  const needed = Number(setup.doglegNeeded) || 0;
  const viewerId = state?.viewer?.id;
  if (state?.stage !== "playing" || !doglegCard || !viewerId || !needed) return false;
  if (revealedIds.length >= needed || viewerId === setup.bankerId || revealedIds.includes(viewerId)) return false;
  return card?.type === "normal" && card.suit === doglegCard.suit && card.rank === doglegCard.rank;
}

function renderDoglegHandMark(card) {
  if (!isHiddenDoglegHandCard(card)) return "";
  return `
    <span class="dogleg-hand-mark" aria-label="狗腿牌" title="狗腿牌">
      <svg viewBox="0 0 32 30" aria-hidden="true" focusable="false">
        <ellipse cx="16" cy="20" rx="8" ry="7"></ellipse>
        <circle cx="6.5" cy="12" r="3.4"></circle>
        <circle cx="12.5" cy="6" r="3.4"></circle>
        <circle cx="20" cy="5.5" r="3.4"></circle>
        <circle cx="26" cy="11.5" r="3.4"></circle>
      </svg>
    </span>
  `;
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
                <span>${renderCompactHandGroupLabel(group)}</span>
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
              class="card ${card.color} ${cardSuitClass(card)} ${cardSkinClass(viewerCardSkin())} ${isHiddenDoglegHandCard(card) ? "dogleg-hand-card" : ""} ${selectedCardIds.has(card.id) ? "selected" : ""} ${isThrowDraftCard(card.id) ? "throw-queued" : ""}"
              style="--i:${index}"
              title="${escapeHtml(`${displayCardLabel(card)}${isHiddenDoglegHandCard(card) ? " · 狗腿牌" : ""}`)}"
              aria-pressed="${selectedCardIds.has(card.id) ? "true" : "false"}"
              aria-disabled="${isSpectating() || isThrowDraftCard(card.id) ? "true" : "false"}"
              ${isSpectating() ? 'tabindex="-1"' : ""}
              data-action="toggle-card"
              data-card-id="${escapeHtml(card.id)}"
            >
              ${cardCorner(card)}
              ${renderDoglegHandMark(card)}
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
                class="card ${card.color} ${cardSuitClass(card)} ${cardSkinClass(viewerCardSkin())} ${isHiddenDoglegHandCard(card) ? "dogleg-hand-card" : ""} ${selectedCardIds.has(card.id) ? "selected" : ""} ${isThrowDraftCard(card.id) ? "throw-queued" : ""}"
                style="--i:${index}"
                title="${escapeHtml(`${displayCardLabel(card)}${isHiddenDoglegHandCard(card) ? " · 狗腿牌" : ""}`)}"
                aria-pressed="${selectedCardIds.has(card.id) ? "true" : "false"}"
                aria-disabled="${isSpectating() || isThrowDraftCard(card.id) ? "true" : "false"}"
                ${isSpectating() ? 'tabindex="-1"' : ""}
                data-action="toggle-card"
                data-card-id="${escapeHtml(card.id)}"
              >
                ${cardCorner(card)}
                ${renderDoglegHandMark(card)}
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
  const sortedCards = sortCardsForPlay(cards, options.trumpSuit ?? currentTrumpSuit());
  const densityClass = sortedCards.length >= 18
    ? "mini-cards-packed"
    : sortedCards.length >= 10
    ? "mini-cards-dense"
    : sortedCards.length >= 6
      ? "mini-cards-folded"
      : "";
  const skin = options.cardSkin
    ?? options.play?.cardSkin
    ?? (options.play?.playerId ? cardSkinForPlayer(options.play.playerId) : viewerCardSkin());
  return `
    <div class="mini-cards ${densityClass}">
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
  if (!session || !state) {
    clearSetupCountdownRenderTimer();
    return renderHome();
  }
  renderRoom();
  scheduleSetupCountdownRender();
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
  const limit = followSelectionLimit();
  if (selected && limit !== null && selectedCardIds.size >= limit) return false;
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
  const selected = !selectedCardIds.has(cardId);
  if (selected && !setCardSelected(cardId, true)) {
    const limitMessage = selectionLimitMessage();
    if (limitMessage) return setMessage(limitMessage, true);
  } else if (!selected) {
    setCardSelected(cardId, false);
  }
  render();
}

function beginDragSelect(event) {
  const cardElement = event.target.closest("[data-card-id]");
  const cardId = cardElement?.dataset.cardId;
  if (!cardId || !viewerCanSelectCards() || isThrowDraftCard(cardId)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (!selectedCardIds.has(cardId)) {
    const limit = followSelectionLimit();
    if (limit !== null && selectedCardIds.size >= limit) {
      const limitMessage = selectionLimitMessage();
      if (limitMessage) setMessage(limitMessage, true);
      return;
    }
  }
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
  "room-leave", "confirm-room-action", "opening-bid-percent", "dogleg-count",
  "add-robot", "random-seats", "start", "ready-on", "ready-off", "bid-selected",
  "bid-pass", "random-bid", "score-bid-start", "score-bid-10", "score-bid-20",
  "score-bid-30", "score-pass", "trump-suit-S", "trump-suit-H", "trump-suit-C",
  "trump-suit-D", "bury-selected", "fry-selected",
  "fry-pass", "dogleg-selected", "play-selected", "confirm-throw", "play-again",
  "send-taunt", "delete-taunt", "kick-player", "buy-shop-product", "equip-avatar-frame", "use-game-item",
  "complete-item-stage"
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
  if (form.dataset.form === "account-login") return loginAccount(event);
  if (form.dataset.form === "change-password") return changeAccountPassword(event);
  if (form.dataset.form === "own-avatar") return uploadOwnAvatar(event);
  if (form.dataset.form === "own-cosmetics") return saveOwnCosmetics(event);
  if (form.dataset.form === "create-account") return createManagedAccount(event);
  if (form.dataset.form === "create-taunt") return createManagedTaunt(event);
  if (form.dataset.form === "save-taunts") return saveManagedTaunts(event);
  if (form.dataset.form === "reset-password") return resetManagedPassword(event);
  if (form.dataset.form === "save-season") return saveSeasonForm(event);
  if (form.dataset.form === "save-seasons") return saveManagedSeasons(event);
  if (form.dataset.form === "save-shop-products") return saveShopProducts(event);
  if (form.dataset.form === "save-profiles") return saveManagedProfiles(event);
  if (form.dataset.form === "grant-cosmetic") return grantShopCosmetic(event);
  if (form.dataset.form === "grant-diamonds") return grantAdminDiamonds(event);
});

document.addEventListener("change", (event) => {
  const tauntAudienceTarget = event.target.closest('[data-action="taunt-all-users"]');
  if (tauntAudienceTarget) {
    const cardEl = tauntAudienceTarget.closest(".taunt-admin-card");
    syncTauntAudienceInputs(cardEl);
    cardEl?.querySelector(".taunt-account-grid")?.classList.toggle("is-disabled", tauntAudienceTarget.checked);
    updateTauntAudienceSummary(cardEl);
    return;
  }
  const tauntAccountTarget = event.target.closest('input[name="accountIds"]');
  if (tauntAccountTarget) {
    updateTauntAudienceSummary(tauntAccountTarget.closest(".taunt-admin-card"));
    return;
  }
  const seasonActiveTarget = event.target.closest('[data-action="season-active"]');
  if (seasonActiveTarget) {
    if (seasonActiveTarget.checked) {
      seasonActiveTarget.closest("form")?.querySelectorAll('[data-action="season-active"]').forEach((input) => {
        if (input !== seasonActiveTarget) input.checked = false;
      });
    }
    return;
  }
  const gameDateTarget = event.target.closest('[data-action="filter-player-game-date"]');
  if (gameDateTarget) {
    statisticsGameDate = gameDateTarget.value || "";
    statisticsGameLogId = "";
    ensurePlayerGameHistory(statisticsSelectedAccountId, true);
    render();
    return;
  }
  const target = event.target.closest('[data-action="select-statistics-season"]');
  if (!target) return;
  const nextSeasonId = target.value || "all";
  const valid = nextSeasonId === "all" || statisticsSeasons.some((season) => String(season.season_id) === nextSeasonId);
  if (!valid || nextSeasonId === statisticsSeasonId) return;
  statisticsSeasonId = nextSeasonId;
  statisticsSelectedAccountId = "";
  statisticsGameDate = "";
  statisticsGameLogId = "";
  playerStatisticsRows = [];
  playerStatisticsLoaded = false;
  ensurePlayerStatistics(true);
  render();
});

document.addEventListener("toggle", (event) => {
  const module = event.target.closest?.("details[data-admin-module]");
  if (!module || module !== event.target) return;
  const moduleId = module.dataset.adminModule || "";
  if (!moduleId) return;
  if (module.open) adminOpenModules.add(moduleId);
  else adminOpenModules.delete(moduleId);
}, true);

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
  if (action === "dissolve-room") openRoomActionConfirm("dissolve");
  if (action === "confirm-room-action") confirmRoomAction();
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
  if (action === "show-shop") {
    homeView = "shop";
    homeJoinOpen = false;
    render();
  }
  if (action === "show-inventory") {
    homeView = "inventory";
    homeJoinOpen = false;
    render();
  }
  if (action === "show-admin") {
    homeView = "admin";
    render();
  }
  if (action === "open-admin-module") {
    const moduleId = event.target.closest("[data-admin-module-id]")?.dataset.adminModuleId || "";
    if (moduleId) {
      adminOpenModules.add(moduleId);
      render();
      document.querySelector(`details[data-admin-module="${moduleId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  if (action === "logout-account") logoutAccount();
  if (action === "buy-shop-product") {
    purchaseShopItem(event.target.closest("[data-product-id]")?.dataset.productId || "");
  }
  if (action === "equip-avatar-frame") {
    equipAvatarFrame(event.target.closest("[data-avatar-frame]")?.dataset.avatarFrame || "");
  }
  if (action === "toggle-account") {
    const target = event.target.closest("[data-account-id]");
    toggleManagedAccount(target?.dataset.accountId || "", target?.dataset.enabled === "true");
  }
  if (action === "delete-taunt") {
    deleteManagedTaunt(event.target.closest("[data-taunt-id]")?.dataset.tauntId || "");
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
  if (action === "sort-player-relationships") {
    const target = event.target.closest("[data-relationship-type][data-stat-key]");
    const type = target?.dataset.relationshipType || "";
    const key = target?.dataset.statKey || "";
    const sort = statisticsRelationshipSorts[type];
    if (sort && new Set(["games_played", "own_score"]).has(key)) {
      if (sort.key === key) sort.direction = sort.direction === "desc" ? "asc" : "desc";
      else {
        sort.key = key;
        sort.direction = "desc";
      }
      render();
    }
  }
  if (action === "show-player-statistics") {
    showPlayerStatistics(event.target.closest("[data-account-id]")?.dataset.accountId || "");
  }
  if (action === "back-statistics") {
    statisticsSelectedAccountId = "";
    statisticsGameDate = "";
    statisticsGameLogId = "";
    render();
  }
  if (action === "clear-player-game-date") {
    statisticsGameDate = "";
    statisticsGameLogId = "";
    ensurePlayerGameHistory(statisticsSelectedAccountId);
    render();
  }
  if (action === "open-stored-game-history") {
    openStoredGameHistory(event.target.closest("[data-game-id]")?.dataset.gameId || "");
  }
  if (action === "close-stored-game-history") {
    statisticsGameLogId = "";
    historyFilter = "all";
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
  if (action === "opening-bid-percent") {
    setOpeningBidPercent(Number(event.target.closest("[data-percent]")?.dataset.percent || 0));
  }
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
  if (action.startsWith("trump-suit-")) selectTrumpSuit(action.slice("trump-suit-".length));
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
  if (action === "open-taunts") {
    activeDialog = "taunts";
    render();
  }
  if (action === "open-items") {
    activeDialog = "items";
    render();
  }
  if (action === "use-game-item") {
    useGameItem(event.target.closest("[data-item-id]")?.dataset.itemId || "");
  }
  if (action === "complete-item-stage") completeGameItemStage();
  if (action === "send-taunt") {
    sendTaunt(event.target.closest("[data-preset-id]")?.dataset.presetId || "");
  }
  if (action === "auto-play-on") setAutoPlay(true);
  if (action === "auto-play-off") setAutoPlay(false);
  if (action === "enter-throw") enterThrowMode();
  if (action === "add-throw-component") addSelectedThrowComponent();
  if (action === "remove-throw-component") {
    removeThrowComponent(Number(event.target.closest("[data-component-index]")?.dataset.componentIndex));
  }
  if (action === "confirm-throw") playThrowDraft();
  if (action === "cancel-throw") cancelThrowMode();
  if (action === "reset") openRoomActionConfirm("reset");
  if (action === "play-again") playAgain();
  if (action === "open-kitty") {
    activeDialog = "kitty";
    render();
  }
  if (action === "open-history") {
    historyFilter = "all";
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
    historyFilter = "all";
    activeDialog = "history";
    render();
  }
  if (action === "filter-history") {
    const nextFilter = event.target.closest("[data-history-filter]")?.dataset.historyFilter || "all";
    historyFilter = nextFilter;
    const timeline = app.querySelector(".history-timeline");
    if (timeline) timeline.scrollTop = 0;
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
    if (activeDialog === "room-action-confirm") pendingRoomAction = "";
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
