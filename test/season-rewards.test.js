import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  calculateSeasonReward,
  SEASON_REWARD_RULES,
  seasonRankAmount
} from "../season-rewards.js";

test("season rank rewards follow the confirmed champion and leaderboard tiers", () => {
  assert.equal(seasonRankAmount(1), 15_000);
  assert.equal(seasonRankAmount(2), 12_000);
  assert.equal(seasonRankAmount(3), 10_000);
  assert.equal(seasonRankAmount(4), 5_000);
  assert.equal(seasonRankAmount(10), 5_000);
  assert.equal(seasonRankAmount(11), 2_000);
  assert.equal(seasonRankAmount(100), 2_000);
  assert.throws(() => seasonRankAmount(0), /赛季名次/);
});

test("only positive season totals receive the additional 2000 diamonds", () => {
  assert.deepEqual(calculateSeasonReward({ rank: 1, totalScore: 1 }), {
    rankAmount: 15_000,
    positiveScoreBonus: 2_000,
    totalAmount: 17_000
  });
  assert.equal(calculateSeasonReward({ rank: 4, totalScore: 0 }).totalAmount, 5_000);
  assert.equal(calculateSeasonReward({ rank: 11, totalScore: -1 }).totalAmount, 2_000);
});

test("the verified 18-player second-season leaderboard totals 104000 diamonds", () => {
  const totalScores = [
    306.93, 236.19, 171.10, 86.20, 43.01, 29.91, 13.33, 4.00,
    -2.00, -29.83, -33.58, -35.81, -45.00, -87.80, -93.59, -104.90,
    -155.30, -302.90
  ];
  const total = totalScores.reduce((sum, totalScore, index) => (
    sum + calculateSeasonReward({ rank: index + 1, totalScore }).totalAmount
  ), 0);
  assert.equal(total, 104_000);
  assert.equal(totalScores.filter((score) => score > 0).length, 8);
});

test("season settlement storage and runtime checks are idempotent and start at season two", async () => {
  const [migration, historySource] = await Promise.all([
    readFile(fileURLToPath(new URL("../db/migrations/031_season_ranking_rewards.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../game-history.js", import.meta.url)), "utf8")
  ]);

  assert.equal(SEASON_REWARD_RULES.firstEligibleSeasonNumber, 2);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_season_reward_settlements/);
  assert.match(migration, /PRIMARY KEY \(season_id, account_id\)/);
  assert.match(historySource, /season\.season_number >= \$1/);
  assert.match(historySource, /'season_reward'/);
  assert.match(historySource, /season_reward:\$\{current\.season_id\}:\$\{row\.account_id\}/);
  assert.match(historySource, /pg_advisory_xact_lock/);
  assert.match(historySource, /scheduleSeasonRewardChecks\(\)/);
  assert.match(historySource, /lifetime_earned = lifetime_earned \+ \$2/);
});
