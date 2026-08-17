import test from "node:test";
import assert from "node:assert/strict";

import { removeSpectatorsForAccount, roomPlayerForAccount } from "../room-identities.js";

test("one account keeps only one spectator identity in a room", () => {
  const room = {
    spectators: new Map([
      ["old-a", { id: "old-a", accountId: "account-a", targetPlayerId: "player-1" }],
      ["new-a", { id: "new-a", accountId: "account-a", targetPlayerId: "player-2" }],
      ["other", { id: "other", accountId: "account-b", targetPlayerId: "player-1" }]
    ])
  };
  const disconnected = [];

  const removed = removeSpectatorsForAccount(room, "account-a", (spectator) => {
    disconnected.push(spectator.id);
  });

  assert.deepEqual(removed.map((spectator) => spectator.id), ["old-a", "new-a"]);
  assert.deepEqual(disconnected, ["old-a", "new-a"]);
  assert.deepEqual([...room.spectators.keys()], ["other"]);
});

test("player identity lookup uses the account within the current room", () => {
  const room = {
    players: [
      { id: "player-a", accountId: "account-a" },
      { id: "player-b", accountId: "account-b" }
    ]
  };

  assert.equal(roomPlayerForAccount(room, "account-a")?.id, "player-a");
  assert.equal(roomPlayerForAccount(room, "account-c"), null);
  assert.equal(roomPlayerForAccount(room, ""), null);
});

test("missing account identity never removes anonymous spectators", () => {
  const room = {
    spectators: new Map([["anonymous", { id: "anonymous", accountId: null }]])
  };

  assert.deepEqual(removeSpectatorsForAccount(room, null), []);
  assert.equal(room.spectators.has("anonymous"), true);
});
