import test from "node:test";
import assert from "node:assert/strict";

import { detectNewLargePlayEffects } from "../public/gameplay-effects.js";

function playState(cardCount, options = {}) {
  return {
    roomId: "ROOM01",
    players: [{ id: "player-1", playEffect: options.playEffect ?? "fireworks" }],
    trickHistory: [],
    currentTrick: {
      number: 3,
      plays: cardCount == null ? [] : [{
        playerId: "player-1",
        played: true,
        winning: options.winning ?? true,
        throwFailed: Boolean(options.throwFailed),
        at: "2026-07-21T10:00:00.000Z",
        cards: Array.from({ length: cardCount }, (_, index) => ({ id: `card-${index}` }))
      }]
    }
  };
}

test("fireworks trigger for a newly played hand of at least eight cards that is currently winning", () => {
  const before = playState(null);
  const effects = detectNewLargePlayEffects(before, playState(8), 1000);
  assert.deepEqual(effects, [{
    key: "3:player-1:2026-07-21T10:00:00.000Z",
    trickNumber: 3,
    playerId: "player-1",
    until: 2800
  }]);

  assert.deepEqual(detectNewLargePlayEffects(before, playState(7), 1000), []);
  assert.deepEqual(detectNewLargePlayEffects(before, playState(12, { winning: false }), 1000), []);
  assert.deepEqual(detectNewLargePlayEffects(before, playState(12, { throwFailed: true }), 1000), []);
  assert.deepEqual(detectNewLargePlayEffects(before, playState(12, { playEffect: "" }), 1000), []);
  assert.deepEqual(detectNewLargePlayEffects(playState(9), playState(9), 1000), []);
});

test("successful winning throws use their total played card count", () => {
  const next = playState(15);
  next.currentTrick.plays[0].throwPlay = true;
  next.currentTrick.plays[0].throwComponents = [
    { cards: next.currentTrick.plays[0].cards.slice(0, 6) },
    { cards: next.currentTrick.plays[0].cards.slice(6) }
  ];
  assert.equal(detectNewLargePlayEffects(playState(null), next, 2000)[0].until, 3800);
});
