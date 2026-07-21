import test from "node:test";
import assert from "node:assert/strict";

import { applyStatePatch, createStatePatch } from "../public/state-patch.js";

function card(id, rank) {
  return { id, rank, suit: "S", label: `${rank}♠` };
}

test("state patches reproduce appended history, prepended events, and changed hands", () => {
  const before = {
    snapshotVersion: 12,
    roomId: "PATCH1",
    stage: "playing",
    players: [
      { id: "p1", score: 0, cardCount: 3 },
      { id: "p2", score: 0, cardCount: 3 }
    ],
    hand: [card("c1", "A"), card("c2", "K"), card("c3", "Q")],
    currentTrick: {
      number: 1,
      plays: [
        { playerId: "p1", played: false, cards: [] },
        { playerId: "p2", played: false, cards: [] }
      ]
    },
    trickHistory: [],
    events: [{ id: "e1", text: "开始" }]
  };
  const completedTrick = {
    number: 1,
    plays: [
      { playerId: "p1", played: true, cards: [card("c1", "A")] },
      { playerId: "p2", played: true, cards: [card("d1", "K")] }
    ]
  };
  const after = {
    ...before,
    snapshotVersion: 13,
    players: [
      { id: "p1", score: 15, cardCount: 2 },
      { id: "p2", score: 0, cardCount: 2 }
    ],
    hand: [card("c2", "K"), card("c3", "Q")],
    currentTrick: {
      number: 2,
      plays: [
        { playerId: "p1", played: false, cards: [] },
        { playerId: "p2", played: false, cards: [] }
      ]
    },
    trickHistory: [completedTrick],
    events: [
      { id: "e2", text: "第一轮结束" },
      ...before.events
    ]
  };

  const patch = createStatePatch(before, after);
  const patched = applyStatePatch(before, patch);

  assert.deepEqual(patched, after);
  assert.ok(JSON.stringify(patch).length < JSON.stringify(after).length);
  assert.equal(applyStatePatch({ ...before, snapshotVersion: 11 }, patch), null);
});

test("event patches prepend new entries and trim capped history", () => {
  const oldEvents = Array.from({ length: 700 }, (_, index) => ({ id: `e${700 - index}`, text: `事件 ${index}` }));
  const before = { snapshotVersion: 20, events: oldEvents, trickHistory: [] };
  const after = {
    snapshotVersion: 21,
    events: [{ id: "e701", text: "新事件" }, ...oldEvents].slice(0, 700),
    trickHistory: []
  };

  const patch = createStatePatch(before, after);
  assert.deepEqual(applyStatePatch(before, patch), after);
  assert.ok(JSON.stringify(patch).length < JSON.stringify(after).length / 20);
});
