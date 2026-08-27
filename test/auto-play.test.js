import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL("..", import.meta.url));
const rankOrder = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const rankSort = new Map(rankOrder.map((rank, index) => [rank, index]));

async function startServer(env = {}) {
  const port = 44000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(port),
      AI_SETUP_DELAY_MS: "0",
      AI_PLAY_DELAY_MS: "300",
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`测试服务启动超时\n${output}`)), 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (!output.includes("已启动")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`测试服务提前退出 (${code})\n${output}`));
    });
  });
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  assert.equal(response.ok, true, data.error || `请求失败：${response.status}`);
  return data;
}

async function waitForState(url, predicate, message, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await jsonRequest(url);
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
}

async function waitForHumanPlayingTurn(stateUrl, actionUrl, credentials, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await jsonRequest(stateUrl);
    if (state.stage === "playing" && state.currentTrick?.currentTurnPlayerId === credentials.playerId) {
      return state;
    }
    if (state.stage === "bidding" && state.setup?.bid && state.setup.biddingTurnPlayerId === credentials.playerId) {
      await jsonRequest(actionUrl("bid-pass"), {
        method: "POST",
        body: JSON.stringify(credentials)
      });
      continue;
    }
    if (
      state.stage === "score-bidding"
      && state.setup?.scoreBid?.currentPlayerId !== credentials.playerId
      && !(state.setup?.scoreBid?.passIds || []).includes(credentials.playerId)
    ) {
      await jsonRequest(actionUrl("score-pass"), {
        method: "POST",
        body: JSON.stringify(credentials)
      });
      continue;
    }
    if (state.stage === "trump-selecting" && state.setup?.bankerId === credentials.playerId) {
      await jsonRequest(actionUrl("trump"), {
        method: "POST",
        body: JSON.stringify({ ...credentials, suit: "S" })
      });
      continue;
    }
    if (state.stage === "burying" && state.setup?.bankerId === credentials.playerId) {
      await jsonRequest(actionUrl("bury"), {
        method: "POST",
        body: JSON.stringify({
          ...credentials,
          cardIds: state.hand.slice(0, state.kittySize).map((card) => card.id)
        })
      });
      continue;
    }
    if (state.stage === "frying" && state.setup?.fry?.currentPlayerId === credentials.playerId) {
      await jsonRequest(actionUrl("fry-pass"), {
        method: "POST",
        body: JSON.stringify(credentials)
      });
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("机器人准备流程没有推进到真人出牌");
}

function suitColor(suit) {
  return suit === "H" || suit === "D" ? "red" : "black";
}

function isMainPlayCard(card, trumpSuit) {
  if (card.type === "joker") return true;
  if (card.rank === "2") return true;
  if ((card.suit === "H" || card.suit === "D") && card.rank === "5") return true;
  if (card.rank === "3" && trumpSuit && suitColor(card.suit) === suitColor(trumpSuit)) return true;
  return card.type === "normal" && trumpSuit && card.suit === trumpSuit;
}

function playSuit(card, trumpSuit) {
  if (isMainPlayCard(card, trumpSuit)) return "TRUMP";
  return card.type === "joker" ? "JOKER" : card.suit;
}

function mainCardPower(card, trumpSuit) {
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
    return 8 + (rankSort.get(card.rank) ?? 99);
  }
  return 99;
}

function patternValue(card, trumpSuit) {
  return isMainPlayCard(card, trumpSuit)
    ? mainCardPower(card, trumpSuit)
    : rankSort.get(card.rank) ?? 99;
}

function sortSmallToLarge(cards, trumpSuit) {
  const suitOrder = new Map([
    ["D", 0],
    ["C", 1],
    ["H", 2],
    ["S", 3],
    ["TRUMP", 4],
    ["JOKER", 5]
  ]);
  return [...cards].sort((a, b) => {
    const aSuit = playSuit(a, trumpSuit);
    const bSuit = playSuit(b, trumpSuit);
    return patternValue(b, trumpSuit) - patternValue(a, trumpSuit)
      || (suitOrder.get(aSuit) ?? 9) - (suitOrder.get(bSuit) ?? 9)
      || a.deck - b.deck
      || a.id.localeCompare(b.id);
  });
}

function expectedAutoCards(state) {
  const trumpSuit = state.setup.currentTrumpSuit;
  const lead = (state.currentTrick?.plays || [])
    .filter((play) => play.played && play.cards?.length)
    .sort((a, b) => a.turnIndex - b.turnIndex)[0];
  if (!lead) return sortSmallToLarge(state.hand, trumpSuit).slice(0, 1);

  const leadSuits = [...new Set(lead.cards.map((card) => playSuit(card, trumpSuit)))];
  const leadSuit = leadSuits.length === 1 ? leadSuits[0] : null;
  const sameSuit = sortSmallToLarge(
    state.hand.filter((card) => playSuit(card, trumpSuit) === leadSuit),
    trumpSuit
  );
  if (sameSuit.length >= lead.cards.length) return sameSuit.slice(0, lead.cards.length);
  const others = sortSmallToLarge(
    state.hand.filter((card) => playSuit(card, trumpSuit) !== leadSuit),
    trumpSuit
  );
  return [...sameSuit, ...others.slice(0, lead.cards.length - sameSuit.length)];
}

test("trustee state is public, plays the smallest legal cards, and can be cancelled", async (t) => {
  const server = await startServer({ AI_SETUP_DELAY_MS: "25" });
  t.after(() => server.child.kill());

  const created = await jsonRequest(`${server.baseUrl}/api/rooms`, {
    method: "POST",
    body: JSON.stringify({ profileId: "player-benlei" })
  });
  const credentials = { playerId: created.playerId, token: created.token };
  const stateParams = new URLSearchParams(credentials);
  const stateUrl = `${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`;
  const actionUrl = (action) => `${server.baseUrl}/api/rooms/${created.roomId}/${action}`;

  await jsonRequest(actionUrl("test-players"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, targetCount: 5 })
  });
  await jsonRequest(actionUrl("doglegs"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, count: 0 })
  });
  await jsonRequest(actionUrl("ready"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, ready: true })
  });
  await jsonRequest(actionUrl("start"), {
    method: "POST",
    body: JSON.stringify(credentials)
  });

  const before = await waitForHumanPlayingTurn(stateUrl, actionUrl, credentials);
  const expectedIds = expectedAutoCards(before).map((card) => card.id).sort();
  assert.ok(expectedIds.length > 0);

  await jsonRequest(actionUrl("auto-play"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, enabled: true })
  });

  const spectatorTarget = before.players.find((player) => player.test);
  const spectator = await jsonRequest(actionUrl("spectate"), {
    method: "POST",
    body: JSON.stringify({ targetPlayerId: spectatorTarget.id })
  });
  assert.equal(
    spectator.snapshot.players.find((player) => player.id === created.playerId)?.autoPlayEnabled,
    true,
    "其他玩家视角应能看到托管状态"
  );

  const afterPlay = await waitForState(
    stateUrl,
    (state) => state.hand.length < before.hand.length,
    "托管开启后没有自动出牌"
  );
  const remainingIds = new Set(afterPlay.hand.map((card) => card.id));
  const playedIds = before.hand.filter((card) => !remainingIds.has(card.id)).map((card) => card.id).sort();
  assert.deepEqual(playedIds, expectedIds);

  await jsonRequest(actionUrl("auto-play"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, enabled: false })
  });
  const waitingAgain = await waitForState(
    stateUrl,
    (state) => state.stage === "playing" && state.currentTrick?.currentTurnPlayerId === created.playerId,
    "取消托管后机器人没有继续推进到真人"
  );
  assert.equal(waitingAgain.players.find((player) => player.id === created.playerId)?.autoPlayEnabled, false);
  const handCountAfterCancel = waitingAgain.hand.length;
  await new Promise((resolve) => setTimeout(resolve, 450));
  const stillWaiting = await jsonRequest(stateUrl);
  assert.equal(stillWaiting.currentTrick?.currentTurnPlayerId, created.playerId);
  assert.equal(stillWaiting.hand.length, handCountAfterCancel, "取消托管后不应继续自动出牌");
});

test("动态狗腿跳过庄家选牌，并以最终实时排名结算", async (t) => {
  const server = await startServer({ AI_SETUP_DELAY_MS: "0", AI_PLAY_DELAY_MS: "0" });
  t.after(() => server.child.kill());

  const created = await jsonRequest(`${server.baseUrl}/api/rooms`, {
    method: "POST",
    body: JSON.stringify({ profileId: "player-benlei" })
  });
  const credentials = { playerId: created.playerId, token: created.token };
  const stateParams = new URLSearchParams(credentials);
  const stateUrl = `${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`;
  const actionUrl = (action) => `${server.baseUrl}/api/rooms/${created.roomId}/${action}`;

  await jsonRequest(actionUrl("test-players"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, targetCount: 5 })
  });
  await jsonRequest(actionUrl("dogleg-mode"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, mode: "dynamic" })
  });
  await jsonRequest(actionUrl("doglegs"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, count: 1 })
  });
  await jsonRequest(actionUrl("ready"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, ready: true })
  });
  await jsonRequest(actionUrl("start"), {
    method: "POST",
    body: JSON.stringify(credentials)
  });

  const playing = await waitForHumanPlayingTurn(stateUrl, actionUrl, credentials);
  assert.equal(playing.stage, "playing", "动态狗腿不应停在庄家选狗腿牌阶段");
  assert.equal(playing.setup.doglegMode, "dynamic");
  if (playing.setup.bankerId === credentials.playerId) {
    assert.equal(playing.setup.doglegMarkedCardId, null, "庄家不应获得动态狗腿牌");
  } else {
    assert.ok(playing.hand.some((card) => card.id === playing.setup.doglegMarkedCardId));
  }

  await jsonRequest(actionUrl("auto-play"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, enabled: true })
  });
  const finished = await waitForState(
    stateUrl,
    (snapshot) => snapshot.stage === "finished",
    "动态狗腿托管牌局没有在预期时间内结束",
    20_000
  );

  const markByPlayerId = new Map(finished.result.doglegMarks.map((item) => [item.playerId, item.count]));
  assert.equal(markByPlayerId.get(finished.setup.bankerId), 0);
  finished.players
    .filter((player) => player.id !== finished.setup.bankerId)
    .forEach((player) => assert.ok(markByPlayerId.get(player.id) >= 1, `${player.name} 应至少打出初始狗腿牌`));
  assert.equal(finished.setup.doglegPlayerIds.length, 1);
  assert.notEqual(finished.setup.doglegPlayerIds[0], finished.setup.bankerId);
  const winnerCount = markByPlayerId.get(finished.setup.doglegPlayerIds[0]);
  assert.equal(winnerCount, Math.max(...[...markByPlayerId.entries()]
    .filter(([playerId]) => playerId !== finished.setup.bankerId)
    .map(([, count]) => count)));
  assert.equal(finished.result.bankerScoreMode, "banker-remainder");
  const bankerResult = finished.result.playerResults.find((player) => player.role === "庄家");
  const doglegResult = finished.result.playerResults.find((player) => player.role === "狗腿");
  const idleResults = finished.result.playerResults.filter((player) => player.role === "闲家");
  assert.equal(doglegResult.gameScore, -idleResults[0].gameScore);
  assert.equal(
    Math.round(finished.result.playerResults.reduce((sum, player) => sum + player.gameScore, 0) * 100) / 100,
    0
  );
  assert.equal(
    bankerResult.gameScore,
    Math.round((-idleResults[0].gameScore * idleResults.length - doglegResult.gameScore) * 100) / 100
  );
});

test("暗狗腿仅向本人暴露专属牌，打出后公开并按固定身份结算", async (t) => {
  const server = await startServer({ AI_SETUP_DELAY_MS: "0", AI_PLAY_DELAY_MS: "0" });
  t.after(() => server.child.kill());

  const created = await jsonRequest(`${server.baseUrl}/api/rooms`, {
    method: "POST",
    body: JSON.stringify({ profileId: "player-benlei" })
  });
  const credentials = { playerId: created.playerId, token: created.token };
  const stateParams = new URLSearchParams(credentials);
  const stateUrl = `${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`;
  const actionUrl = (action) => `${server.baseUrl}/api/rooms/${created.roomId}/${action}`;

  await jsonRequest(actionUrl("test-players"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, targetCount: 5 })
  });
  await jsonRequest(actionUrl("dogleg-mode"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, mode: "hidden" })
  });
  await jsonRequest(actionUrl("doglegs"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, count: 1 })
  });
  await jsonRequest(actionUrl("ready"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, ready: true })
  });
  await jsonRequest(actionUrl("start"), {
    method: "POST",
    body: JSON.stringify(credentials)
  });

  const playing = await waitForHumanPlayingTurn(stateUrl, actionUrl, credentials);
  assert.equal(playing.stage, "playing", "暗狗腿不应停在庄家选狗腿牌阶段");
  assert.equal(playing.setup.doglegMode, "hidden");
  const self = playing.players.find((player) => player.id === credentials.playerId);
  const selfHasHiddenCard = Boolean(playing.setup.doglegMarkedCardId);
  if (selfHasHiddenCard) {
    assert.equal(self.role, "狗腿", "暗狗腿本人应从开局知道自己的身份");
    assert.ok(playing.hand.some((card) => card.id === playing.setup.doglegMarkedCardId));
    assert.equal(playing.setup.doglegPlayerIds.includes(credentials.playerId), false, "未打出专属牌前不应公开身份");
  } else {
    assert.notEqual(self.role, "狗腿", "非暗狗腿玩家不应看到隐藏身份");
  }
  assert.ok(playing.events.some((event) => event.text.includes("已随机确定 1 名暗狗腿")));

  const spectator = await jsonRequest(actionUrl("spectate"), {
    method: "POST",
    body: JSON.stringify({ targetPlayerId: credentials.playerId })
  });
  const spectatorParams = new URLSearchParams({
    spectatorId: spectator.spectatorId,
    token: spectator.token
  });
  const spectatorState = await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/state?${spectatorParams.toString()}`);
  assert.equal(spectatorState.setup.doglegMarkedCardId, null, "观战者不能看到目标玩家的暗狗腿牌标记");
  if (selfHasHiddenCard) {
    assert.equal(spectatorState.players.find((player) => player.id === credentials.playerId)?.role, "闲家");
  }

  await jsonRequest(actionUrl("auto-play"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, enabled: true })
  });
  const finished = await waitForState(
    stateUrl,
    (snapshot) => snapshot.stage === "finished",
    "暗狗腿托管牌局没有在预期时间内结束",
    20_000
  );

  assert.equal(finished.setup.doglegPlayerIds.length, 1);
  assert.notEqual(finished.setup.doglegPlayerIds[0], finished.setup.bankerId);
  assert.deepEqual(finished.result.bankerTeamIds, [finished.setup.bankerId, finished.setup.doglegPlayerIds[0]]);
  assert.equal(finished.result.playerResults.filter((player) => player.role === "狗腿").length, 1);
  assert.ok(finished.events.some((event) => event.text.includes("公开狗腿身份")));
  assert.equal(
    Math.round(finished.result.playerResults.reduce((sum, player) => sum + player.gameScore, 0) * 100) / 100,
    0
  );
});

test("顺位狗腿公开同色同点牌组与随机顺位，并按有效打出顺序确定狗腿", async (t) => {
  const server = await startServer({ AI_SETUP_DELAY_MS: "0", AI_PLAY_DELAY_MS: "0" });
  t.after(() => server.child.kill());

  const created = await jsonRequest(`${server.baseUrl}/api/rooms`, {
    method: "POST",
    body: JSON.stringify({ profileId: "player-benlei" })
  });
  const credentials = { playerId: created.playerId, token: created.token };
  const stateParams = new URLSearchParams(credentials);
  const stateUrl = `${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`;
  const actionUrl = (action) => `${server.baseUrl}/api/rooms/${created.roomId}/${action}`;

  await jsonRequest(actionUrl("test-players"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, targetCount: 5 })
  });
  await jsonRequest(actionUrl("dogleg-mode"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, mode: "random-order" })
  });
  await jsonRequest(actionUrl("doglegs"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, count: 2 })
  });
  await jsonRequest(actionUrl("ready"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, ready: true })
  });
  await jsonRequest(actionUrl("start"), {
    method: "POST",
    body: JSON.stringify(credentials)
  });

  const playing = await waitForHumanPlayingTurn(stateUrl, actionUrl, credentials);
  assert.equal(playing.stage, "playing", "顺位狗腿不应停在庄家选狗腿牌阶段");
  assert.equal(playing.setup.doglegMode, "random-order");
  assert.equal(playing.setup.doglegCard.type, "normal");
  assert.equal(playing.setup.doglegCard.suits.length, 2);
  assert.equal(new Set(playing.setup.doglegTargetPositions).size, playing.setup.doglegTargetPositions.length);
  assert.equal(playing.setup.doglegTargetCount, Math.min(2, playing.setup.doglegCandidateCount));
  assert.ok(playing.setup.doglegTargetPositions.every((position) => position >= 1 && position <= playing.setup.doglegCandidateCount));
  assert.ok(playing.events.some((event) => event.text.includes("本局使用顺位狗腿")));

  await jsonRequest(actionUrl("auto-play"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, enabled: true })
  });
  const finished = await waitForState(
    stateUrl,
    (snapshot) => snapshot.stage === "finished",
    "顺位狗腿托管牌局没有在预期时间内结束",
    20_000
  );

  assert.equal(finished.setup.doglegPlayerIds.length, finished.setup.doglegTargetCount);
  assert.equal(finished.setup.doglegPlayerIds.includes(finished.setup.bankerId), false);
  assert.deepEqual(finished.result.bankerTeamIds, [finished.setup.bankerId, ...finished.setup.doglegPlayerIds]);
  assert.equal(finished.result.playerResults.filter((player) => player.role === "狗腿").length, finished.setup.doglegTargetCount);
  assert.ok(finished.setup.doglegHitSequence >= Math.max(...finished.setup.doglegTargetPositions));
  assert.equal(
    Math.round(finished.result.playerResults.reduce((sum, player) => sum + player.gameScore, 0) * 100) / 100,
    0
  );
});

test("players leave a finished result independently and auto-ready for the next game", async (t) => {
  const server = await startServer({ AI_PLAY_DELAY_MS: "0" });
  t.after(() => server.child.kill());

  const created = await jsonRequest(`${server.baseUrl}/api/rooms`, {
    method: "POST",
    body: JSON.stringify({ profileId: "player-benlei" })
  });
  const credentials = { playerId: created.playerId, token: created.token };
  const stateParams = new URLSearchParams(credentials);
  const stateUrl = `${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`;
  const actionUrl = (action) => `${server.baseUrl}/api/rooms/${created.roomId}/${action}`;

  await jsonRequest(actionUrl("test-players"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, targetCount: 5 })
  });
  await jsonRequest(actionUrl("doglegs"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, count: 0 })
  });
  await jsonRequest(actionUrl("ready"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, ready: true })
  });
  await jsonRequest(actionUrl("start"), {
    method: "POST",
    body: JSON.stringify(credentials)
  });

  await waitForHumanPlayingTurn(stateUrl, actionUrl, credentials);
  await jsonRequest(actionUrl("auto-play"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, enabled: true })
  });
  const finished = await waitForState(
    stateUrl,
    (snapshot) => snapshot.stage === "finished",
    "托管牌局没有在预期时间内结束",
    20_000
  );
  assert.equal(finished.status, "lobby");
  assert.ok(finished.result);
  assert.ok(finished.trickHistory.length > 0);

  const nextPlayer = await jsonRequest(actionUrl("join"), {
    method: "POST",
    body: JSON.stringify({ profileId: "player-biesan" })
  });
  assert.equal(nextPlayer.snapshot.viewer.host, false);
  assert.equal(nextPlayer.snapshot.viewer.nextRoundEntered, true);
  assert.equal(nextPlayer.snapshot.viewer.ready, true);
  assert.equal(nextPlayer.snapshot.stage, "finished");
  await jsonRequest(actionUrl("again"), {
    method: "POST",
    body: JSON.stringify({ playerId: nextPlayer.playerId, token: nextPlayer.token })
  });
  const hostStillOnResult = await jsonRequest(stateUrl);
  assert.equal(hostStillOnResult.status, "lobby");
  assert.equal(hostStillOnResult.stage, "finished");
  assert.ok(hostStillOnResult.result);
  assert.equal(hostStillOnResult.viewer.nextRoundEntered, false);
  assert.equal(hostStillOnResult.viewer.ready, false);

  await jsonRequest(actionUrl("opening-bid-percent"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, percent: 20 })
  });
  const hostConfiguredLobby = await jsonRequest(stateUrl);
  assert.equal(hostConfiguredLobby.callMode, "score");
  assert.equal(hostConfiguredLobby.openingBidPercent, 20);

  await jsonRequest(actionUrl("again"), {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  const nextLobby = await jsonRequest(stateUrl);
  assert.equal(nextLobby.stage, "lobby");
  assert.equal(nextLobby.result, null);
  assert.equal(nextLobby.startedAt, null);
  assert.deepEqual(nextLobby.trickHistory, []);
  assert.deepEqual(nextLobby.hand, []);
  assert.equal(nextLobby.viewer.ready, true);
  assert.equal(nextLobby.players.filter((player) => player.ready).length, 6);

  await jsonRequest(actionUrl("again"), {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  const idempotentLobby = await jsonRequest(stateUrl);
  assert.equal(idempotentLobby.stage, "lobby");
  assert.equal(idempotentLobby.viewer.ready, true);
});

test("preset taunts are validated, visible to the room, and expire", async (t) => {
  const server = await startServer({
    TAUNT_DURATION_MS: "350",
    TAUNT_COOLDOWN_MS: "20"
  });
  t.after(() => server.child.kill());

  const created = await jsonRequest(`${server.baseUrl}/api/rooms`, {
    method: "POST",
    body: JSON.stringify({ profileId: "player-benlei" })
  });
  const credentials = { playerId: created.playerId, token: created.token };
  const stateParams = new URLSearchParams(credentials);
  const stateUrl = `${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`;
  const actionUrl = (action) => `${server.baseUrl}/api/rooms/${created.roomId}/${action}`;

  assert.ok(created.snapshot.tauntPresets.length >= 4);
  assert.deepEqual(created.snapshot.taunts, []);

  const lobbyResponse = await fetch(actionUrl("taunt"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...credentials, presetId: created.snapshot.tauntPresets[0].id })
  });
  assert.equal(lobbyResponse.status, 409);

  await jsonRequest(actionUrl("test-players"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, targetCount: 5 })
  });
  await jsonRequest(actionUrl("doglegs"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, count: 0 })
  });
  await jsonRequest(actionUrl("ready"), {
    method: "POST",
    body: JSON.stringify({ ...credentials, ready: true })
  });
  await jsonRequest(actionUrl("start"), {
    method: "POST",
    body: JSON.stringify(credentials)
  });

  const playing = await waitForHumanPlayingTurn(stateUrl, actionUrl, credentials);
  const spectatorTarget = playing.players.find((player) => player.test);
  const spectator = await jsonRequest(actionUrl("spectate"), {
    method: "POST",
    body: JSON.stringify({ targetPlayerId: spectatorTarget.id })
  });
  const spectatorParams = new URLSearchParams({
    spectatorId: spectator.spectatorId,
    token: spectator.token
  });
  const spectatorStateUrl = `${server.baseUrl}/api/rooms/${created.roomId}/state?${spectatorParams.toString()}`;

  const invalidResponse = await fetch(actionUrl("taunt"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...credentials, presetId: "custom", text: "客户端伪造内容" })
  });
  assert.equal(invalidResponse.status, 400);

  const preset = playing.tauntPresets.find((item) => item.id === "dare-play");
  assert.ok(preset);
  await jsonRequest(actionUrl("taunt"), {
    method: "POST",
    body: JSON.stringify({
      ...credentials,
      presetId: preset.id,
      text: "客户端伪造内容"
    })
  });

  const playerView = await jsonRequest(stateUrl);
  const spectatorView = await jsonRequest(spectatorStateUrl);
  assert.equal(playerView.taunts.length, 1);
  assert.equal(playerView.taunts[0].playerId, created.playerId);
  assert.equal(playerView.taunts[0].text, preset.text);
  assert.equal(spectatorView.taunts[0].text, preset.text);

  const expired = await waitForState(
    spectatorStateUrl,
    (snapshot) => snapshot.taunts.length === 0,
    "嘲讽气泡没有按时消失",
    2000
  );
  assert.deepEqual(expired.taunts, []);
});
