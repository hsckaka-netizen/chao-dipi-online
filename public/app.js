const app = document.querySelector("#app");
const storageKey = "chaoDipiOnlineSession";
let session = loadSession();
let source = null;
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
let scoreBidAutoPassTimer = null;
let throwRevealTimer = null;
let homeView = "rooms";
let profiles = [];
let profilesLoaded = false;
let profilesLoading = false;
let joinableRooms = [];
let joinableRoomsLoaded = false;
let joinableRoomsLoading = false;
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
  scoreBidAutoPassTimer = null;
  throwRevealTimer = null;
  source = null;
  state = null;
  throwDraftComponents = null;
  render();
}

function setMessage(text, bad = false, autoDismiss = !bad) {
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
    }, 4500);
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
  const previousHandIds = new Set((state?.hand || []).map((card) => card.id));
  state = nextState;
  syncThrowDraftForState();
  scheduleThrowReveal(previousState);
  if (previousState?.roomId !== nextState.roomId || nextState.status !== "finished") {
    dismissedResultRoomId = null;
  }
  if (previousState?.status !== "finished" && nextState.status === "finished") {
    dismissedResultRoomId = null;
  }
  if (previousState?.status === "finished" && nextState.status === "lobby") {
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
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
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
    playerId: session.playerId,
    token: session.token
  });
  source = new EventSource(`/events?${params.toString()}`);
  source.addEventListener("state", (event) => {
    applyState(JSON.parse(event.data));
    render();
  });
  source.addEventListener("kicked", (event) => {
    const data = JSON.parse(event.data || "{}");
    clearSession();
    setMessage(data.message || "你已离开房间。", true);
  });
  source.onerror = () => {
    setMessage("连接中断，正在等待浏览器自动重连", true);
  };
}

async function createRoom(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const form = new FormData(formEl);
  try {
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ profileId: form.get("profileId") })
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
  event.preventDefault();
  const formEl = event.target.closest("form");
  const form = new FormData(formEl);
  const roomId = String(form.get("roomId") || "").trim().toUpperCase();
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
      method: "POST",
      body: JSON.stringify({ profileId: form.get("profileId") })
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

async function updateProfile(event) {
  event.preventDefault();
  const formEl = event.target.closest("form");
  const profileId = formEl?.dataset.profileId;
  const form = new FormData(formEl);
  try {
    const data = await api(`/api/players/${encodeURIComponent(profileId)}`, {
      method: "PUT",
      body: JSON.stringify({ name: form.get("name") })
    });
    profiles = data.players || [];
    profilesLoaded = true;
    setMessage("玩家资料已保存。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function startGame() {
  if (!session) return;
  try {
    applyState(await api(`/api/rooms/${session.roomId}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }), { highlightNewKitty: false });
    setMessage("已发牌。每个玩家现在只会看到自己的手牌。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function addRobot() {
  if (!session) return;
  try {
    applyState(await api(`/api/rooms/${session.roomId}/robot`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }), { highlightNewKitty: false });
    setMessage("已添加 1 个机器人。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function randomizeSeats() {
  if (!session) return;
  try {
    applyState(await api(`/api/rooms/${session.roomId}/random-seats`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }), { highlightNewKitty: false });
    setMessage("玩家座位已重新随机。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function setDoglegCount(count) {
  if (!session) return;
  try {
    applyState(await api(`/api/rooms/${session.roomId}/doglegs`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, count })
    }), { highlightNewKitty: false });
    setMessage(`本局狗腿数量已设为 ${state.setup?.doglegNeeded ?? count} 个。`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function bidSelectedCards() {
  if (!session) return;
  try {
    const highlighted = applyState(await api(`/api/rooms/${session.roomId}/bid`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    }));
    clearSelectionUnlessKitty(highlighted);
    activeDialog = null;
    setMessage(state.stage === "burying"
      ? `叫主成功：${state.setup?.bankerName || "庄家"} 成为庄家，已拿底等待贴底。`
      : "已亮 2 叫/抢主。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function passBid() {
  if (!session) return;
  try {
    const highlighted = applyState(await api(`/api/rooms/${session.roomId}/bid-pass`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }));
    clearSelectionUnlessKitty(highlighted);
    activeDialog = null;
    setMessage(state.stage === "burying"
      ? `叫主成功：${state.setup?.bankerName || "庄家"} 成为庄家，已拿底等待贴底。`
      : "已过。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function randomBid() {
  if (!session) return;
  try {
    const highlighted = applyState(await api(`/api/rooms/${session.roomId}/random-bid`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }));
    clearSelectionUnlessKitty(highlighted);
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
    applyState(await api(`/api/rooms/${session.roomId}/call-mode`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, mode })
    }), { highlightNewKitty: false });
    setMessage(`已切换为${state.callModeName || "新的叫庄方式"}。`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function scoreBid(increment = 0) {
  if (!session) return;
  try {
    const highlighted = applyState(await api(`/api/rooms/${session.roomId}/score-bid`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, increment })
    }));
    clearSelectionUnlessKitty(highlighted);
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
    const highlighted = applyState(await api(`/api/rooms/${session.roomId}/score-pass`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }));
    clearSelectionUnlessKitty(highlighted);
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
    const highlighted = applyState(await api(`/api/rooms/${session.roomId}/trump`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    }));
    clearSelectionUnlessKitty(highlighted);
    activeDialog = null;
    setMessage(`定主成功：${state.setup?.bankerName || "庄家"} 已拿底等待贴底。`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function burySelectedCards() {
  if (!session) return;
  try {
    applyState(await api(`/api/rooms/${session.roomId}/bury`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    }));
    selectedCardIds = new Set();
    setMessage(state.stage === "frying" ? "已贴底，进入炒底阶段。" : "已贴底。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function frySelectedCards() {
  if (!session) return;
  try {
    const highlighted = applyState(await api(`/api/rooms/${session.roomId}/fry`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    }));
    clearSelectionUnlessKitty(highlighted);
    activeDialog = null;
    setMessage("已炒底，请选择同数量牌贴底。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function passFry() {
  if (!session) return;
  try {
    const highlighted = applyState(await api(`/api/rooms/${session.roomId}/fry-pass`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }));
    clearSelectionUnlessKitty(highlighted);
    activeDialog = null;
    setMessage(state.stage === "dogleg"
      ? `炒底结束：主牌确定为${state.setup?.currentTrumpSuitName || state.setup?.trumpSuitName || "主牌"}，等待庄家选择狗腿牌。`
      : "已选择不炒。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function chooseDoglegSelectedCard() {
  if (!session) return;
  try {
    const doglegSelection = new Set(selectedCardIds);
    applyState(await api(`/api/rooms/${session.roomId}/dogleg`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds: [...selectedCardIds] })
    }), { highlightNewKitty: false });
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
    applyState(await api(`/api/rooms/${session.roomId}/play`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, cardIds, throwPlay: false })
    }), { highlightNewKitty: false });
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
    applyState(await api(`/api/rooms/${session.roomId}/play`, {
      method: "POST",
      body: JSON.stringify({
        playerId: session.playerId,
        token: session.token,
        cardIds,
        throwPlay: true,
        throwComponents: components
      })
    }), { highlightNewKitty: false });
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
    applyState(await api(`/api/rooms/${session.roomId}/ready`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, ready })
    }), { highlightNewKitty: false });
    if (state?.status === "finished") {
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
    applyState(await api(`/api/rooms/${session.roomId}/again`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }), { highlightNewKitty: false });
    activeDialog = null;
    dismissedResultRoomId = state?.status === "finished" ? state?.roomId || null : null;
    setMessage("已准备下一局，等待其他玩家确认。");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function resetRoom() {
  if (!session) return;
  try {
    applyState(await api(`/api/rooms/${session.roomId}/reset`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token })
    }), { highlightNewKitty: false });
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
    applyState(await api(`/api/rooms/${session.roomId}/kick`, {
      method: "POST",
      body: JSON.stringify({ playerId: session.playerId, token: session.token, targetPlayerId })
    }), { highlightNewKitty: false });
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

function canStart() {
  return state?.viewer?.host
    && state.status === "lobby"
    && state.players.length >= state.minPlayers
    && state.players.length <= state.maxPlayers
    && state.players.every((player) => player.ready);
}

function isViewer(playerId) {
  return state?.viewer?.id === playerId;
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
  return state?.currentTrick?.currentTurnPlayerId === state.viewer?.id && !viewerPlayedCurrent();
}

function viewerCanBid() {
  if (state?.stage !== "bidding") return false;
  return !state.setup?.bid || state.setup?.biddingTurnPlayerId === state.viewer?.id;
}

function viewerCanPassBid() {
  return state?.stage === "bidding" && state.setup?.bid && state.setup?.biddingTurnPlayerId === state.viewer?.id;
}

function viewerCanScoreBid() {
  if (state?.stage !== "score-bidding") return false;
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
  return state?.stage === "playing" || viewerCanBid() || viewerCanRevealTrump() || viewerCanBury() || viewerCanFry() || viewerCanChooseDogleg();
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
    return {
      action: "bury-selected",
      label: `贴底选中的牌`,
      enabled: selectedCardIds.size === state.kittySize,
      reason: selectedCardIds.size === state.kittySize ? "" : `需要选择 ${state.kittySize} 张牌`
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
    return `
      <div class="row hand-controls">
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
  app.innerHTML = `
    <div class="page">
      <header class="topbar">
        <div class="brand">
          <h1>炒地皮在线房间</h1>
          <p>多人在线牌桌，支持真人和机器人同局参与。</p>
        </div>
        ${session ? `<button class="secondary" data-action="leave">退出本机身份</button>` : ""}
      </header>
      ${message ? `<div class="status toast ${messageBad ? "bad" : ""}" role="status">${escapeHtml(message)}</div>` : ""}
      ${content}
    </div>
  `;
}

function renderHome() {
  ensureProfiles();
  ensureJoinableRooms();
  if (homeView === "players") return renderProfileManager();
  const hintedRoom = roomFromUrl();
  renderShell(`
    <div class="row" style="justify-content:flex-end;margin-bottom:14px">
      <button type="button" class="secondary" data-action="show-profiles">玩家列表</button>
    </div>
    ${renderJoinableRooms()}
    <div class="grid">
      <section class="panel">
        <h2>创建房间</h2>
        <form class="form" data-form="create">
          <label>
            选择玩家
            ${renderProfileSelect("profileId")}
          </label>
          <button type="submit">创建房间</button>
        </form>
      </section>
      <section class="panel">
        <h2>加入房间</h2>
        <form class="form" data-form="join">
          <label>
            房间号
            <input name="roomId" maxlength="6" required value="${escapeHtml(hintedRoom)}" placeholder="例如：A7K2QD">
          </label>
          <label>
            选择玩家
            ${renderProfileSelect("profileId")}
          </label>
          <button type="submit">加入房间</button>
        </form>
      </section>
    </div>
  `);
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
          <div class="meta">等待中的房间可加入，进行中的房间只展示状态。</div>
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
    <form class="joinable-room-card ${joinable ? "" : "disabled"}" data-form="join">
      <input type="hidden" name="roomId" value="${escapeHtml(room.roomId)}">
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
        ${players.map((player) => `
          <span class="joinable-room-player ${player.ready ? "ready" : ""}">
            ${avatarHtml(player.name, player.avatarUrl)}
            <span class="joinable-room-player-name">${escapeHtml(player.name)}</span>
          </span>
        `).join("")}
      </div>
      <div class="joinable-room-actions">
        ${joinable ? `
          <label>
            选择玩家
            ${renderProfileSelect("profileId")}
          </label>
          <button type="submit">加入此房间</button>
        ` : `
          <div class="meta">牌局已开始，暂不能加入。</div>
          <button type="button" disabled>进行中</button>
        `}
      </div>
    </form>
  `;
}

function renderProfileSelect(name) {
  if (profilesLoading && !profilesLoaded) return `<select name="${name}" required disabled><option>玩家列表加载中</option></select>`;
  if (!profiles.length) return `<select name="${name}" required disabled><option>暂无预置玩家</option></select>`;
  return `
    <select name="${name}" required>
      <option value="">请选择玩家</option>
      ${profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`).join("")}
    </select>
  `;
}

function renderProfileManager() {
  ensureProfiles();
  renderShell(`
    <section class="panel stack">
      <div class="section-head">
        <h2>玩家列表</h2>
        <button type="button" class="secondary compact-button" data-action="show-rooms">返回房间</button>
      </div>
      <div class="meta">玩家列表由后台预置；头像使用内置素材，这里支持修改现有玩家名称。</div>
      <div class="profile-list">
        ${profiles.length ? profiles.map(renderProfileRow).join("") : `<div class="empty">暂无玩家。</div>`}
      </div>
    </section>
  `);
}

function renderProfileRow(profile) {
  return `
    <form class="profile-row" data-form="update-profile" data-profile-id="${escapeHtml(profile.id)}">
      ${avatarHtml(profile.name, profile.avatarUrl)}
      <label>
        玩家名称
        <input name="name" maxlength="16" required value="${escapeHtml(profile.name)}">
      </label>
      <button type="submit" class="secondary">保存</button>
    </form>
  `;
}

function renderRoom() {
  const viewer = viewerPlayer();
  const waitingNextRound = state.status === "finished" && Boolean(viewer?.ready);
  const inLobbyView = state.status === "lobby" || waitingNextRound;
  const started = state.status !== "lobby" && !waitingNextRound;
  selectedCardIds = new Set([...selectedCardIds].filter((cardId) => state.hand.some((card) => card.id === cardId)));
  maybeAutoOpenActionDialog();
  const waitingText = state.players.length < state.minPlayers
    ? `还差 ${state.minPlayers - state.players.length} 人才能开始`
    : state.players.every((player) => player.ready)
      ? "所有玩家已准备，房主可以开始"
      : "人数已满足，等待所有玩家准备";

  renderShell(`
    <div class="room-layout">
      <div class="stack room-main">
        <section class="panel stack">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="meta">房间号</div>
              <div class="room-code">${escapeHtml(state.roomId)}</div>
            </div>
            <div class="tags">
              <span class="tag accent">${state.players.length}/${state.maxPlayers} 人</span>
              <span class="tag">${escapeHtml(waitingNextRound ? "等待下一局" : state.phase)}</span>
              ${inLobbyView ? `<span class="tag good">${escapeHtml(readyStatusText())}</span>` : ""}
              ${started ? `<span class="tag good">底牌 ${state.kittyCount} 张</span>` : ""}
            </div>
          </div>
          <div class="share">
            <div class="meta">邀请链接</div>
            <code>${escapeHtml(shareUrl(state.roomId))}</code>
            <div class="row">
              <button type="button" data-action="copy">复制链接</button>
              <button type="button" class="secondary" data-action="open-players">玩家</button>
              <button type="button" class="secondary" data-action="open-events">日志</button>
              ${state.viewer.host && state.status === "lobby" ? renderCallModeToggle() : ""}
              ${state.viewer.host && state.status === "lobby" ? renderDoglegCountControl() : ""}
              ${inLobbyView ? renderReadyControls({ waitingNextRound }) : ""}
              ${state.viewer.host && state.status === "lobby" ? `<button type="button" class="secondary" data-action="add-robot" ${state.players.length >= state.maxPlayers ? "disabled" : ""}>添加机器人</button>` : ""}
              ${state.viewer.host && state.status === "lobby" ? `<button type="button" class="secondary" data-action="random-seats" ${state.players.length < 2 ? "disabled" : ""}>随机座位</button>` : ""}
              ${state.viewer.host && state.status === "lobby" ? `<button type="button" data-action="start" ${canStart() ? "" : "disabled"}>开始并发牌</button>` : ""}
              ${state.canViewKitty ? `<button type="button" class="secondary" data-action="open-kitty">查看底牌</button>` : ""}
              ${state.viewer.host && started ? `<button type="button" class="secondary" data-action="reset">重开房间</button>` : ""}
              ${state.viewer.host ? `<button type="button" class="secondary danger" data-action="dissolve-room">解散房间</button>` : ""}
              ${state.status === "lobby" || state.status === "finished" ? `<button type="button" class="secondary" data-action="room-leave">退出房间</button>` : ""}
            </div>
            ${inLobbyView ? `<div class="meta">${escapeHtml(waitingNextRound ? `你已准备下一局，等待其他玩家确认。${readyStatusText()}` : `${waitingText}。${readyStatusText()}。当前支持 5-9 人。`)}</div>` : ""}
          </div>
        </section>

        ${!started ? renderLobbyPlayersPanel() : ""}
        ${started && state.setup?.doglegCard ? renderDoglegPanel() : ""}
        ${started && state.stage !== "playing" && state.stage !== "finished" ? renderSetupPanel() : ""}
        ${started ? renderPlayTable() : ""}
        ${!started ? `<section class="panel"><div class="empty">${escapeHtml(lobbyEmptyText(waitingNextRound))}</div></section>` : ""}
      </div>
    </div>
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

function renderSetupPanel() {
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
        ${viewerCanBid() ? `<button type="button" data-action="open-bid-dialog">${setup.bid ? "选择2抢主" : "选择2叫主"}</button>` : ""}
        ${viewerCanPassBid() ? `<button type="button" class="secondary" data-action="bid-pass">过</button>` : ""}
        ${state.viewer.host && !setup.bid ? `<button type="button" class="secondary" data-action="random-bid">无人叫主，随机指定</button>` : ""}
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
        ${viewerCanFry() ? `<button type="button" data-action="open-fry-dialog">选择2炒底</button>` : ""}
        ${viewerCanFry() ? `<button type="button" class="secondary" data-action="fry-pass">不炒</button>` : ""}
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
    <section class="panel stack setup-detail setup-detail-${escapeHtml(state.stage)}">
      <div class="section-head">
        <h2>牌桌状态</h2>
        <div class="tags">
          <span class="tag accent">${escapeHtml(state.phase)}</span>
        </div>
      </div>
      ${body}
    </section>
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
  if (activeDialog) return;
  if (dismissedActionDialogKey === key) return;
  activeDialog = key.startsWith("bid:") ? "bid" : "fry";
}

function renderActiveDialog() {
  if (activeDialog === "bid" && viewerCanBid()) return renderBidFryDialog("bid");
  if (activeDialog === "fry" && viewerCanFry()) return renderBidFryDialog("fry");
  if (activeDialog === "kitty" && state.canViewKitty) return renderKittyDialog();
  if (activeDialog === "history") return renderHistoryDialog();
  if (activeDialog === "players") return renderPlayersDialog();
  if (activeDialog === "events") return renderEventsDialog();
  if (activeDialog === "result" && state.status === "finished" && !viewerPlayer()?.ready) return renderResultPanel();
  return "";
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
            <div class="meta">${state.events.length} 条最近记录</div>
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
    cards: cards.filter((card) => card.suit === suit)
  })).filter((group) => group.cards.length);
  return `
    <div class="two-card-groups">
      ${groups.map((group) => `
        <div class="two-card-group">
          <div class="hand-group-title">
            <strong>${escapeHtml(group.label)}</strong>
            <span>${group.cards.length} 张</span>
          </div>
          <div class="choice-cards">
            ${group.cards.map((card, index) => `
              <button
                type="button"
                class="card choice-card ${card.color} ${cardSuitClass(card)} ${selectedCardIds.has(card.id) ? "selected" : ""}"
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
    <div class="card static ${card.color} ${cardSuitClass(card)}" title="${escapeHtml(displayCardLabel(card))}">
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
  return `
    <div class="played-five-stats" title="只统计已打到桌面上的红五和方五">
      <span>已出红五 <b>${counts.red || 0}</b></span>
      <span>已出方五 <b>${counts.diamond || 0}</b></span>
    </div>
  `;
}

function idleTargetScore() {
  if (!state) return "";
  if (state.callMode === "score" && state.setup?.scoreBid?.currentScore) {
    return state.players.length * 100 - state.setup.scoreBid.currentScore;
  }
  if (state.players.length === 5) return 250;
  if (state.players.length === 6) return 360;
  if (state.players.length === 7) return 350;
  return Math.round(state.players.length * 100 * 0.5);
}

function renderGameInfoTags() {
  const setup = state.setup || {};
  const tags = [];
  if (setup.currentTrumpSuitName || setup.trumpSuitName) tags.push(`<span class="tag good">主牌 ${escapeHtml(setup.currentTrumpSuitName || setup.trumpSuitName)}</span>`);
  tags.push(`<span class="tag">闲家线 ${escapeHtml(idleTargetScore())} 分</span>`);
  tags.push(`<span class="tag">狗腿 ${escapeHtml(setup.doglegNeeded || 0)} 个</span>`);
  if (setup.doglegCard) tags.push(`<span class="tag accent">狗腿牌 ${escapeHtml(doglegCardText(setup.doglegCard))}</span>`);
  if (setup.bankerName) tags.push(`<span class="tag accent">庄家 ${escapeHtml(setup.bankerName)}</span>`);
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
          <span class="tag accent">${holdingPreviousResult ? `第 ${tableTrick.number} 轮结果` : `当前第 ${state.currentTrick?.number || 1} 轮`}</span>
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
  const currentAction = setupTableActionText();
  const seats = state.players.map((player) => {
    const status = setupSeatStatus(player);
    return {
      playerId: player.id,
      playerName: player.name,
      role: player.role,
      avatarUrl: player.avatarUrl || "",
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
          <span class="tag accent">${escapeHtml(state.phase)}</span>
          ${currentAction ? `<span class="tag good">${escapeHtml(currentAction)}</span>` : ""}
        </div>
      </div>
      ${renderTrick(tableTrick, true, { setupTable: true })}
    </section>
  `;
}

function setupTableActionText() {
  const setup = state.setup || {};
  const fry = setup.fry || {};
  if (state.stage === "bidding") {
    if (!setup.bid) return "等待玩家叫主";
    return setup.biddingTurnPlayerName ? `轮到 ${setup.biddingTurnPlayerName} 抢主或过` : "叫主结束";
  }
  if (state.stage === "score-bidding") {
    const scoreBidState = setup.scoreBid || {};
    if (!scoreBidState.currentPlayerId) return `等待玩家以 ${scoreBidState.minimum || 0} 分叫庄`;
    return `${scoreBidState.currentPlayerName} 当前 ${scoreBidState.currentScore} 分`;
  }
  if (state.stage === "trump-selecting") return setup.bankerName ? `等待 ${setup.bankerName} 亮2定主` : "等待定主";
  if (state.stage === "burying") return setup.bankerName ? `等待 ${setup.bankerName} 贴底` : "等待贴底";
  if (state.stage === "frying") return fry.currentPlayerName ? `轮到 ${fry.currentPlayerName} 炒底或不炒` : "等待炒底";
  if (state.stage === "fry-burying") return fry.currentPlayerName ? `等待 ${fry.currentPlayerName} 贴底` : "等待贴底";
  if (state.stage === "dogleg") return setup.bankerName ? `等待 ${setup.bankerName} 选择狗腿牌` : "等待选择狗腿牌";
  return "";
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

function renderSetupActionTrail(actions) {
  if (!actions?.length) return "";
  return `
    <div class="setup-action-trail">
      ${actions.map((action) => `
        <div class="setup-action ${action.current ? "current" : ""}">
          <span>${escapeHtml(action.kind === "score" ? `${action.score}分` : `${action.count}张${action.suitName}2${action.random ? " 随机" : ""}`)}</span>
          ${action.cards?.length ? renderMiniCards(action.cards) : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderSeatHand(action, play, trick, index, options = {}) {
  if (!state?.viewer?.id || !Array.isArray(state.hand)) return "";
  const statusText = playStatusText(trick, play, index, true, options);
  const statusTone = playStatusTone(trick, play, true, options);
  return `
    <div class="seat-hand">
      <div class="seat-hand-head">
        <div class="seat-hand-player">
          <div class="seat-hand-player-line">
            <strong>${playerNameWithRole(play)}</strong>
            <span class="seat-status ${escapeHtml(statusTone)}">${escapeHtml(statusText)}</span>
          </div>
          <div class="seat-hand-stats">
            <span>牌分 <b>${play.score || 0}</b></span>
            <span>红五 <b>${play.draggedRedFives || 0}</b></span>
            <span>方五 <b>${play.draggedDiamondFives || 0}</b></span>
            <span>甩失 <b>${play.throwFailures || 0}</b></span>
            <span>手牌 <b>${state.hand.length}</b></span>
          </div>
        </div>
        ${renderHandControls(action)}
      </div>
      ${renderThrowDraft()}
      ${renderHand(state.hand, { compact: true })}
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
      <div class="trick-title">
        <span>${current ? (finishedResult ? "最后一轮" : setupTable ? "当前状态" : heldResult ? "上一轮结果" : "当前轮") : `第 ${trick.number} 轮`}</span>
        <span>${escapeHtml(titleMeta)}</span>
      </div>
      <div class="trick-grid ${current ? `table-circle table-seats-${displayPlays.length}` : ""}">
        ${current ? `
          <div class="table-corner-stats">${renderPlayedFiveStats()}</div>
          <div class="table-center ${finishedResult ? "result-center" : ""}">
            <strong>${finishedResult ? "本局结束" : setupTable ? "牌桌" : heldResult ? `第 ${trick.number} 轮结果` : `第 ${trick.number} 轮`}</strong>
            <span>${escapeHtml(finishedResult ? `${state.result?.winnerTeamName || "胜方"}获胜` : titleMeta)}</span>
            ${finishedResult ? `<button type="button" data-action="open-result">查看结算</button>` : ""}
          </div>
        ` : ""}
        ${displayPlays.map((play, index) => {
          const playCards = displayedPlayCards(play);
          const playContent = setupTable ? renderSetupActionTrail(play.setupActions) : (play.played ? renderMiniCards(playCards) : "");
          const isViewerSeat = current && play.playerId === state.viewer?.id;
          const showViewerHand = isViewerSeat && !finishedResult;
          const playIndex = play.turnIndex ?? index;
          const statusText = playStatusText(trick, play, playIndex, current, { heldResult, setupTable });
          const statusTone = playStatusTone(trick, play, current, { heldResult, setupTable });
          const seatHand = showViewerHand ? renderSeatHand(viewerAction, play, trick, playIndex, { heldResult, setupTable }) : "";
          const playerCard = `
            <div class="trick-player ${roleClass(play.role)} ${play.played ? "played" : ""} ${play.lead ? "lead" : ""} ${play.currentTurn ? "current-turn" : ""} ${play.winning ? "winning" : ""}">
              <div class="trick-name">
                <strong>${playerNameWithRole(play)}</strong>
                <span class="seat-status ${escapeHtml(statusTone)}">${escapeHtml(statusText)}</span>
              </div>
              <div class="trick-player-stats">
                <span>牌分 <b>${play.score || 0}</b></span>
                <span>红五 <b>${play.draggedRedFives || 0}</b></span>
                <span>方五 <b>${play.draggedDiamondFives || 0}</b></span>
                <span>甩失 <b>${play.throwFailures || 0}</b></span>
              </div>
              ${!current && play.played ? renderMiniCards(playCards) : ""}
            </div>
          `;
          if (!current) return playerCard;
          return `
            <div class="trick-seat ${seatZone(index, displayPlays.length)} ${isViewerSeat ? "viewer-seat" : ""}" style="${seatStyle(index, displayPlays.length)}">
              ${showViewerHand ? "" : playerCard}
              ${playContent ? `<div class="seat-play">${playContent}</div>` : ""}
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

function roleMark(role) {
  if (!role) return "";
  const text = role === "狗腿" ? "腿" : role === "庄家" || role === "主" ? "庄" : "闲";
  const tone = role === "庄家" || role === "主" || role === "狗腿" ? "accent" : "idle";
  return `<span class="role-mark ${tone}" title="${escapeHtml(role)}">${escapeHtml(text)}</span>`;
}

function roleClass(role) {
  if (role === "庄家" || role === "狗腿" || role === "主") return "banker-team";
  if (role === "闲家") return "idle-team";
  return "";
}

function avatarHtml(name, avatarUrl = "", size = "normal") {
  const initial = String(name || "玩").trim().slice(0, 1) || "玩";
  if (avatarUrl) {
    return `<span class="avatar ${size}" title="${escapeHtml(name)}"><img src="${escapeHtml(avatarUrl)}" alt=""></span>`;
  }
  return `<span class="avatar ${size}" title="${escapeHtml(name)}">${escapeHtml(initial)}</span>`;
}

function playerIdentity(name, role, avatarUrl = "", suffix = "") {
  return `
    <span class="player-identity">
      ${avatarHtml(name, avatarUrl, "small")}
      ${roleMark(role)}
      <span class="name-text">${escapeHtml(`${name}${suffix}`)}</span>
    </span>
  `;
}

function playerNameWithRole(play) {
  return playerIdentity(play.playerName, play.role, play.avatarUrl);
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
  const positions = count <= 1 ? [42] : [39, 58];
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
  return `
    <div class="modal-backdrop">
      <section class="modal-card history-modal" role="dialog" aria-modal="true" aria-label="历史出牌">
        <div class="section-head">
          <div>
            <h2>历史出牌</h2>
            <div class="meta">${history.length} 轮</div>
          </div>
          <button type="button" class="secondary compact-button" data-action="close-dialog">关闭</button>
        </div>
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
  const canKick = state.viewer?.host && !isMe && (state.status === "lobby" || state.status === "finished");
  return `
    <div class="player ${roleClass(player.role)}" data-player-id="${escapeHtml(player.id)}">
      <div>
        <strong class="player-name-line">${playerIdentity(player.name, player.role, player.avatarUrl, isMe ? "（我）" : "")}</strong>
        <div class="tags">
          ${player.host ? `<span class="tag accent">房主</span>` : ""}
          ${player.test ? `<span class="tag">机器人</span>` : ""}
          ${state.status === "lobby" || state.status === "finished" ? `<span class="tag ${player.ready ? "good" : ""}">${player.ready ? "已准备" : "未准备"}</span>` : ""}
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
        <div class="hand-counts">
          ${groups.map((group) => `
            <span class="hand-count-badge suit-${escapeHtml(group.id)}" title="${escapeHtml(group.label)}">
              <span>${escapeHtml(compactHandGroupLabel(group))}</span>
              <strong>${group.cards.length}</strong>
            </span>
          `).join("")}
        </div>
        <div class="hand-row hand-row-compact" data-action="clear-selection">
          ${compactCards.map((card, index) => `
            <button
              type="button"
              class="card ${card.color} ${cardSuitClass(card)} ${selectedCardIds.has(card.id) ? "selected" : ""} ${isThrowDraftCard(card.id) ? "throw-queued" : ""}"
              style="--i:${index}"
              title="${escapeHtml(displayCardLabel(card))}"
              aria-pressed="${selectedCardIds.has(card.id) ? "true" : "false"}"
              aria-disabled="${isThrowDraftCard(card.id) ? "true" : "false"}"
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
                class="card ${card.color} ${cardSuitClass(card)} ${selectedCardIds.has(card.id) ? "selected" : ""} ${isThrowDraftCard(card.id) ? "throw-queued" : ""}"
                style="--i:${index}"
                title="${escapeHtml(displayCardLabel(card))}"
                aria-pressed="${selectedCardIds.has(card.id) ? "true" : "false"}"
                aria-disabled="${isThrowDraftCard(card.id) ? "true" : "false"}"
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

function renderMiniCards(cards) {
  if (!cards.length) return `<div class="meta">未出牌</div>`;
  const sortedCards = sortCardsForPlay(cards);
  return `
    <div class="mini-cards">
      ${sortedCards.map((card, index) => `
        <span class="mini-card ${card.color} ${cardSuitClass(card)}" style="--i:${index}" title="${escapeHtml(displayCardLabel(card))}">${cardCorner(card)}</span>
      `).join("")}
    </div>
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

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  if (form.dataset.form === "create") return createRoom(event);
  if (form.dataset.form === "join") return joinRoom(event);
  if (form.dataset.form === "update-profile") return updateProfile(event);
});

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "leave") clearSession();
  if (action === "room-leave") leaveRoom();
  if (action === "dissolve-room") dissolveRoom();
  if (action === "show-profiles") {
    homeView = "players";
    render();
  }
  if (action === "show-rooms") {
    homeView = "rooms";
    render();
  }
  if (action === "refresh-rooms") refreshJoinableRooms();
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
    if (activeDialog === "result" || (!activeDialog && state?.status === "finished")) dismissedResultRoomId = state?.roomId || null;
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

async function resume() {
  if (!session) return render();
  try {
    const params = new URLSearchParams({ playerId: session.playerId, token: session.token });
    applyState(await api(`/api/rooms/${session.roomId}/state?${params.toString()}`));
    connectEvents();
  } catch {
    clearSession();
    setMessage("本机没有可恢复的房间身份，请重新创建或加入。", true);
  }
  render();
}

resume();
