import test from "node:test";
import assert from "node:assert/strict";

import { createSeededRandom, shuffleWithRandom, stableAiSeed } from "../ai-random.js";

test("seeded AI randomness is repeatable", () => {
  const source = [1, 2, 3, 4, 5, 6, 7, 8];
  const first = shuffleWithRandom(source, createSeededRandom("same-deal"));
  const second = shuffleWithRandom(source, createSeededRandom("same-deal"));

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, shuffleWithRandom(source, createSeededRandom("other-deal")));
  assert.equal(stableAiSeed("same-deal"), stableAiSeed("same-deal"));
});
