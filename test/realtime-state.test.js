import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

async function startServer() {
  const port = 43000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(port) },
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

function createSseReader(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async nextState() {
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const type = block.match(/^event: (.+)$/m)?.[1] || "message";
          const data = block.match(/^data: (.+)$/m)?.[1] || "";
          if (type === "state") return JSON.parse(data);
          continue;
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error("实时状态连接提前结束");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
    close() {
      return reader.cancel();
    }
  };
}

test("room snapshots stay monotonic and visual assets are cached", async (t) => {
  const server = await startServer();
  t.after(() => server.child.kill());

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

  const initialState = await withTimeout(events.nextState(), "没有收到初始房间状态");
  const secondEventResponse = await fetch(`${server.baseUrl}/events?${eventParams.toString()}`);
  assert.equal(secondEventResponse.status, 200);
  const secondEvents = createSseReader(secondEventResponse);
  t.after(() => secondEvents.close());
  const [firstConnectionState, secondConnectionState] = await withTimeout(
    Promise.all([events.nextState(), secondEvents.nextState()]),
    "第二个连接没有收到一致的房间状态"
  );
  assert.ok(firstConnectionState.snapshotVersion > initialState.snapshotVersion);
  assert.equal(firstConnectionState.snapshotVersion, secondConnectionState.snapshotVersion);

  const robotResponse = await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/robot`, {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  const [pushedState, secondPushedState] = await withTimeout(
    Promise.all([events.nextState(), secondEvents.nextState()]),
    "添加机器人后没有收到实时状态"
  );
  assert.ok(pushedState.snapshotVersion > firstConnectionState.snapshotVersion);
  assert.equal(pushedState.snapshotVersion, secondPushedState.snapshotVersion);
  assert.equal(pushedState.players.length, 2);
  assert.equal(robotResponse.snapshotVersion, pushedState.snapshotVersion);

  const stateParams = new URLSearchParams(credentials);
  const refreshedState = await jsonRequest(`${server.baseUrl}/api/rooms/${created.roomId}/state?${stateParams.toString()}`);
  assert.equal(refreshedState.snapshotVersion, pushedState.snapshotVersion);
  assert.equal(refreshedState.players.length, pushedState.players.length);

  const assetResponse = await fetch(`${server.baseUrl}/assets/avatars/benlei.png`);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get("cache-control") || "", /max-age=604800/);
  assert.equal(assetResponse.headers.get("content-type"), "image/png");

  const indexResponse = await fetch(`${server.baseUrl}/`);
  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.headers.get("cache-control"), "no-store");
  assert.equal(indexResponse.headers.get("content-type"), "text/html; charset=utf-8");
});
