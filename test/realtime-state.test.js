import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { applyStatePatch } from "../public/state-patch.js";

const projectDir = fileURLToPath(new URL("..", import.meta.url));

function withTimeout(promise, message, timeoutMs = 5000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function startServer(env = {}) {
  const port = 43000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(port), AI_SETUP_DELAY_MS: "5000", AI_PLAY_DELAY_MS: "5000", ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("已启动")) resolve();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => reject(new Error(`测试服务提前退出 (${code})\n${output}`)));
  });
  await withTimeout(ready, "测试服务启动超时");
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

function createSseReader(response, initialState = null) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentState = initialState;
  async function nextUpdate() {
    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const type = block.match(/^event: (.+)$/m)?.[1] || "message";
        const data = block.match(/^data: (.+)$/m)?.[1] || "";
        if (type === "state") currentState = JSON.parse(data);
        else if (type === "patch") currentState = applyStatePatch(currentState, JSON.parse(data));
        else continue;
        if (!currentState) throw new Error("收到无法应用的实时状态补丁");
        return { type, state: currentState, bytes: Buffer.byteLength(block) + 2 };
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error("实时状态连接提前结束");
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  }
  return {
    nextUpdate,
    async nextState() {
      return (await nextUpdate()).state;
    },
    close() {
      return reader.cancel();
    }
  };
}

test("web server starts even when the history database URL is invalid", async (t) => {
  const server = await startServer({ DATABASE_URL: "not-a-database-url" });
  t.after(() => server.child.kill());

  const response = await fetch(`${server.baseUrl}/`);
  assert.equal(response.status, 200);
});

test("room snapshots stay monotonic and visual assets are cached", async (t) => {
  const server = await startServer();
  t.after(() => server.child.kill());

  const historyStatus = await jsonRequest(`${server.baseUrl}/api/history/status`);
  assert.equal(historyStatus.configured, false);
  assert.equal(historyStatus.enabled, false);
  assert.equal(historyStatus.connected, false);

  const created = await jsonRequest(`${server.baseUrl}/api/rooms`, {
    method: "POST",
    body: JSON.stringify({ profileId: "player-benlei" })
  });
  const credentials = {
    playerId: created.playerId,
    token: created.token
  };
  const eventParams = new URLSearchParams({ roomId: created.roomId, ...credentials });
  const eventResponse = await fetch(`${server.baseUrl}/events?${eventParams.toString()}`);
  assert.equal(eventResponse.status, 200);
  const events = createSseReader(eventResponse);
  t.after(() => events.close());

  const initialUpdate = await withTimeout(events.nextUpdate(), "没有收到初始房间状态");
  const initialState = initialUpdate.state;
  assert.equal(initialUpdate.type, "state");
  const resumedEventParams = new URLSearchParams({
    ...credentials,
    roomId: created.roomId,
    snapshotVersion: String(initialState.snapshotVersion)
  });
  const secondEventResponse = await fetch(`${server.baseUrl}/events?${resumedEventParams.toString()}`);
  assert.equal(secondEventResponse.status, 200);
  const secondEvents = createSseReader(secondEventResponse, initialState);
  t.after(() => secondEvents.close());

  const robotResponse = await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/robot`, {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  const [pushedUpdate, secondPushedUpdate] = await withTimeout(
    Promise.all([events.nextUpdate(), secondEvents.nextUpdate()]),
    "添加机器人后没有收到实时状态"
  );
  const pushedState = pushedUpdate.state;
  const secondPushedState = secondPushedUpdate.state;
  assert.equal(pushedUpdate.type, "patch");
  assert.equal(secondPushedUpdate.type, "patch");
  assert.ok(pushedState.snapshotVersion > initialState.snapshotVersion);
  assert.equal(pushedState.snapshotVersion, secondPushedState.snapshotVersion);
  assert.equal(pushedState.players.length, 2);
  assert.equal(robotResponse.snapshotVersion, pushedState.snapshotVersion);

  const stateParams = new URLSearchParams(credentials);
  const refreshedState = await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`);
  assert.equal(refreshedState.snapshotVersion, pushedState.snapshotVersion);
  assert.equal(refreshedState.players.length, pushedState.players.length);
  assert.ok(pushedUpdate.bytes < Buffer.byteLength(JSON.stringify(refreshedState)));

  const assetResponse = await fetch(`${server.baseUrl}/assets/avatars/benlei.png`);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get("cache-control") || "", /max-age=604800/);
  assert.equal(assetResponse.headers.get("content-type"), "image/png");

  const indexResponse = await fetch(`${server.baseUrl}/`);
  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.headers.get("cache-control"), "no-store");
  assert.equal(indexResponse.headers.get("content-type"), "text/html; charset=utf-8");

  await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/test-players`, {
    method: "POST",
    body: JSON.stringify({ ...credentials, targetCount: 5 })
  });
  await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/ready`, {
    method: "POST",
    body: JSON.stringify({ ...credentials, ready: true })
  });
  const startedAck = await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/start`, {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  const started = await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`);
  assert.equal(startedAck.snapshotVersion, started.snapshotVersion);
  assert.equal(started.stage, "bidding", "开局请求应先返回，不应同步跑完机器人准备流程");
  assert.equal(started.kittySize, 5);
  assert.deepEqual(started.removedCards, []);

  const spectate = await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/spectate`, {
    method: "POST",
    body: JSON.stringify({ targetPlayerId: created.playerId })
  });
  assert.equal(spectate.snapshot.spectator.targetPlayerId, created.playerId);
  assert.equal(spectate.snapshot.viewer.id, created.playerId);
  assert.equal(spectate.snapshot.hand.length, 53);

  const spectatorParams = new URLSearchParams({
    spectatorId: spectate.spectatorId,
    token: spectate.token
  });
  const spectatorState = await jsonRequest(
    `${server.baseUrl}/api/rooms/${created.roomId}/state?${spectatorParams.toString()}`
  );
  assert.equal(spectatorState.spectator.targetPlayerId, created.playerId);
  assert.equal(spectatorState.hand.length, 53);

  const spectatorEventParams = new URLSearchParams({
    roomId: created.roomId,
    spectatorId: spectate.spectatorId,
    token: spectate.token
  });
  const spectatorEventResponse = await fetch(`${server.baseUrl}/events?${spectatorEventParams.toString()}`);
  assert.equal(spectatorEventResponse.status, 200);
  const spectatorEvents = createSseReader(spectatorEventResponse);
  const spectatorPush = await withTimeout(spectatorEvents.nextState(), "观战者没有收到实时房间状态");
  assert.equal(spectatorPush.spectator.targetPlayerId, created.playerId);
  await spectatorEvents.close();

  const forbiddenAction = await fetch(`${server.baseUrl}/api/rooms/${created.roomId}/bid-pass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: spectate.spectatorId, token: spectate.token })
  });
  assert.equal(forbiddenAction.status, 401, "观战身份不得通过玩家操作接口");

  await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/spectate-leave`, {
    method: "POST",
    body: JSON.stringify({ spectatorId: spectate.spectatorId, token: spectate.token })
  });

  for (const playerCount of [6, 7, 8, 9]) {
    const countRoom = await jsonRequest(`${server.baseUrl}/api/rooms`, {
      method: "POST",
      body: JSON.stringify({ profileId: "player-benlei" })
    });
    const countAuth = { playerId: countRoom.playerId, token: countRoom.token };
    await jsonRequest(`${server.baseUrl}/api/rooms/${countRoom.roomId}/test-players`, {
      method: "POST",
      body: JSON.stringify({ ...countAuth, targetCount: playerCount })
    });
    await jsonRequest(`${server.baseUrl}/api/rooms/${countRoom.roomId}/ready`, {
      method: "POST",
      body: JSON.stringify({ ...countAuth, ready: true })
    });
    const countStartedAck = await jsonRequest(`${server.baseUrl}/api/rooms/${countRoom.roomId}/start`, {
      method: "POST",
      body: JSON.stringify(countAuth)
    });
    const countStateParams = new URLSearchParams(countAuth);
    const countStarted = await jsonRequest(`${server.baseUrl}/api/rooms/${countRoom.roomId}/state?${countStateParams.toString()}`);
    assert.equal(countStartedAck.snapshotVersion, countStarted.snapshotVersion);
    assert.equal(countStarted.players.length, playerCount);
    const expectedKittySize = Math.min(playerCount, 6);
    const expectedRemovedCount = Math.max(0, playerCount - 6);
    assert.equal(countStarted.kittySize, expectedKittySize);
    assert.equal(countStarted.kittyCount, expectedKittySize);
    assert.equal(countStarted.removedCards.length, expectedRemovedCount);
    assert.ok(countStarted.removedCards.every((card) => card.rank === "4"));
    assert.equal(new Set(countStarted.removedCards.map((card) => card.suit)).size, expectedRemovedCount);
    assert.equal(countStarted.hand.length, 53);
    assert.equal(countStarted.stage, "bidding");

    const countSpectate = await jsonRequest(`${server.baseUrl}/api/rooms/${countRoom.roomId}/spectate`, {
      method: "POST",
      body: JSON.stringify({ targetPlayerId: countRoom.playerId })
    });
    assert.equal(countSpectate.snapshot.players.length, playerCount);
    assert.equal(countSpectate.snapshot.hand.length, 53);
    await jsonRequest(`${server.baseUrl}/api/rooms/${countRoom.roomId}/spectate-leave`, {
      method: "POST",
      body: JSON.stringify({ spectatorId: countSpectate.spectatorId, token: countSpectate.token })
    });
  }
});
