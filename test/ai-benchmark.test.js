import test from "node:test";
import assert from "node:assert/strict";

import { createAiBenchmarkRoom, runAiBenchmarkGame } from "../ai-benchmark.js";

test("AI benchmark deals are repeatable and keep both teams on identical cards", () => {
  const first = createAiBenchmarkRoom({ seed: "paired-deal", playerCount: 9, bankerSeat: 2, doglegSeat: 4 });
  const second = createAiBenchmarkRoom({ seed: "paired-deal", playerCount: 9, bankerSeat: 2, doglegSeat: 4 });

  assert.deepEqual(
    first.players.map((player) => player.hand.map((card) => card.id)),
    second.players.map((player) => player.hand.map((card) => card.id))
  );
  assert.deepEqual(first.kitty.map((card) => card.id), second.kitty.map((card) => card.id));
  assert.deepEqual(first.removedCards.map((card) => card.id), second.removedCards.map((card) => card.id));
  assert.deepEqual(first.removedCards.map((card) => `${card.suit}${card.rank}`), ["H5", "H5", "D5"]);
});

test("AI benchmark completes a legal full game and reports both strategy costs", () => {
  const result = runAiBenchmarkGame({
    seed: "complete-game",
    playerCount: 5,
    bankerSeat: 0,
    doglegSeat: 2,
    trumpSuit: "H",
    candidateTeam: "idle"
  });

  assert.ok(["banker", "idle"].includes(result.winnerTeam));
  assert.equal(typeof result.candidateWon, "boolean");
  assert.equal(result.candidateWon, result.winnerTeam === result.candidateTeam);
  assert.equal(Math.sign(result.candidateScoreMargin), result.candidateWon ? 1 : -1);
  assert.ok(["banker", "idle"].includes(result.cardPointWinnerTeam));
  assert.ok(result.strategyStats["monte-carlo-v3"].decisions > 0);
  assert.ok(result.strategyStats["monte-carlo-v4"].decisions > 0);
  assert.ok(result.strategyStats["monte-carlo-v4"].decisionDiagnostics.overrides >= 0);
});
