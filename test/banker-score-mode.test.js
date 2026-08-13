import test from "node:test";
import assert from "node:assert/strict";

import {
  allocateBankerTeamScores,
  BANKER_SCORE_MODE_AVERAGE,
  BANKER_SCORE_MODE_REMAINDER,
  DEFAULT_BANKER_SCORE_MODE,
  normalizeBankerScoreMode
} from "../banker-score-mode.js";

test("庄家承余是默认模式，狗腿只取得闲家单人扣分的相反数", () => {
  assert.equal(DEFAULT_BANKER_SCORE_MODE, BANKER_SCORE_MODE_REMAINDER);
  assert.equal(normalizeBankerScoreMode("unknown"), BANKER_SCORE_MODE_REMAINDER);
  assert.deepEqual(allocateBankerTeamScores({
    idleEachScore: -2,
    idleCount: 3,
    doglegCount: 1
  }), {
    mode: BANKER_SCORE_MODE_REMAINDER,
    bankerTeamTotal: 6,
    bankerScore: 4,
    doglegEachScore: 2
  });
});

test("庄家承余在多狗腿和闲家得分时仍保持零和", () => {
  const result = allocateBankerTeamScores({
    idleEachScore: 3,
    idleCount: 4,
    doglegCount: 2
  });
  assert.deepEqual(result, {
    mode: BANKER_SCORE_MODE_REMAINDER,
    bankerTeamTotal: -12,
    bankerScore: -6,
    doglegEachScore: -3
  });
  assert.equal(3 * 4 + result.bankerScore + result.doglegEachScore * 2, 0);
});

test("房主可切回庄队均摊模式", () => {
  assert.deepEqual(allocateBankerTeamScores({
    idleEachScore: 2,
    idleCount: 3,
    doglegCount: 1,
    mode: BANKER_SCORE_MODE_AVERAGE
  }), {
    mode: BANKER_SCORE_MODE_AVERAGE,
    bankerTeamTotal: -6,
    bankerScore: -3,
    doglegEachScore: -3
  });
});
