import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  attachDiamondRewards,
  calculateDiamondReward,
  diamondRewardDate,
  DIAMOND_REWARD_RULES,
  isDiamondEligibleGame,
  isDiamondEligiblePlayer
} from "../diamond-rewards.js";

test("diamond rewards combine the base amount and positive title bonuses", () => {
  const loser = calculateDiamondReward({ gameScore: -2, tags: [] });
  const winner = calculateDiamondReward({ gameScore: 2, tags: [] });
  const mvpWinner = calculateDiamondReward({
    gameScore: 2,
    tags: [{ code: "mvp", label: "MVP" }]
  });

  assert.equal(loser.totalAmount, 10);
  assert.equal(winner.totalAmount, 10);
  assert.equal(mvpWinner.totalAmount, 13);
  assert.equal(mvpWinner.titleBonus, 3);
  assert.equal(Object.hasOwn(DIAMOND_REWARD_RULES, "dailyRewardGameLimit"), false);
});

test("negative titles do not earn diamonds and duplicate tags count once", () => {
  const reward = calculateDiamondReward({
    gameScore: -1,
    tags: [
      { code: "pit", label: "坑" },
      { code: "god-pit", label: "神坑" },
      { code: "mvp", label: "MVP" },
      { code: "mvp", label: "MVP" }
    ]
  });

  assert.deepEqual(reward.titleRewards, [{ code: "mvp", label: "MVP", amount: 3 }]);
  assert.equal(reward.totalAmount, 13);
});

test("title rewards stack incrementally but respect the per-game cap", () => {
  const reward = calculateDiamondReward({
    gameScore: 3,
    tags: [
      { code: "mvp", label: "MVP" },
      { code: "support", label: "辅" },
      { code: "precision", label: "精" },
      { code: "god", label: "神" },
      { code: "heaven", label: "天之上" }
    ]
  });

  assert.equal(reward.titleBonusBeforeCap, 9);
  assert.equal(reward.titleBonus, DIAMOND_REWARD_RULES.titleBonusCap);
  assert.equal(reward.totalAmount, 15);
});

test("hero skill diamonds are added outside the existing title cap", () => {
  const reward = calculateDiamondReward({
    gameScore: 3,
    tags: [
      { code: "mvp", label: "MVP" },
      { code: "support", label: "辅" }
    ],
    heroSkillReward: { amount: 4, skillName: "倒买倒卖" }
  });

  assert.equal(reward.titleBonus, 5);
  assert.equal(reward.heroBonus, 4);
  assert.equal(reward.totalAmount, 19);
});

test("daily reward dates use the game finish time in Asia/Shanghai", () => {
  assert.equal(diamondRewardDate("2026-07-28T15:59:59.999Z"), "2026-07-28");
  assert.equal(diamondRewardDate("2026-07-28T16:00:00.000Z"), "2026-07-29");
});

test("only unique logged-in human accounts are diamond eligible", () => {
  const room = {
    players: [
      { id: "a", accountId: "account-a", test: false },
      { id: "b", accountId: "account-b", test: false }
    ],
    result: {
      playerResults: [
        { playerId: "a", gameScore: 2, evaluationTags: [] },
        { playerId: "b", gameScore: -2, evaluationTags: [] }
      ]
    }
  };

  assert.equal(isDiamondEligibleGame(room), true);
  attachDiamondRewards(room);
  assert.equal(room.result.playerResults[0].diamondReward.status, "pending");
  assert.equal(room.result.playerResults[0].diamondReward.totalAmount, 10);

  room.players[1].accountId = "account-a";
  assert.equal(isDiamondEligibleGame(room), false);
});

test("win bonuses remain disabled after item-adjusted score changes", () => {
  const room = {
    players: [
      { id: "a", accountId: "account-a", test: false },
      { id: "b", accountId: "account-b", test: false }
    ],
    result: {
      playerResults: [
        { playerId: "a", baseGameScore: -2, itemScoreDelta: 4, gameScore: 2, evaluationTags: [] },
        { playerId: "b", baseGameScore: 2, itemScoreDelta: -4, gameScore: -2, evaluationTags: [] }
      ]
    }
  };

  attachDiamondRewards(room);
  assert.equal(room.result.playerResults[0].diamondReward.winBonus, 0);
  assert.equal(room.result.playerResults[1].diamondReward.winBonus, 0);
});

test("an account actively spectating the room cannot receive a player diamond reward", () => {
  const room = {
    players: [
      { id: "a", accountId: "account-a", test: false },
      { id: "b", accountId: "account-b", test: false }
    ],
    spectators: new Map([
      ["spectator-a", { id: "spectator-a", accountId: "account-a", targetPlayerId: "b" }]
    ]),
    result: {
      playerResults: [
        { playerId: "a", gameScore: 2, evaluationTags: [] },
        { playerId: "b", gameScore: -2, evaluationTags: [] }
      ]
    }
  };

  assert.equal(isDiamondEligibleGame(room), true);
  assert.equal(isDiamondEligiblePlayer(room, room.players[0]), false);
  assert.equal(isDiamondEligiblePlayer(room, room.players[1]), true);

  attachDiamondRewards(room);
  assert.equal(room.result.playerResults[0].diamondReward.status, "ineligible");
  assert.equal(room.result.playerResults[0].diamondReward.reason, "spectator");
  assert.equal(room.result.playerResults[0].diamondReward.totalAmount, 0);
  assert.equal(room.result.playerResults[1].diamondReward.status, "pending");
});

test("diamond migration defines wallets, per-game rewards, and idempotent ledger", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/011_diamond_rewards.sql", import.meta.url));
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_diamond_wallets/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_game_diamond_rewards/);
  assert.match(migration, /PRIMARY KEY \(game_id, account_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_diamond_ledger/);
  assert.match(migration, /idempotency_key varchar\(160\) NOT NULL UNIQUE/);
});

test("administrator diamond grants are idempotent and recorded in the wallet ledger", async () => {
  const [historySource, serverSource, appSource] = await Promise.all([
    readFile(fileURLToPath(new URL("../game-history.js", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../server.js", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../public/app.js", import.meta.url)), "utf8")
  ]);

  assert.match(historySource, /export async function grantDiamondsByAdmin/);
  assert.match(historySource, /pg_advisory_xact_lock/);
  assert.match(historySource, /'admin_grant'/);
  assert.match(historySource, /lifetime_earned = lifetime_earned \+ \$2/);
  assert.match(serverSource, /pathParts\[2\] === "diamonds" && pathParts\[3\] === "grants"/);
  assert.match(appSource, /data-form="grant-diamonds"/);
  assert.match(appSource, /发放后会立即到账并写入流水/);
  assert.doesNotMatch(historySource, /dailyRewardGameLimit/);
  assert.doesNotMatch(historySource, /daily-capped/);
  assert.doesNotMatch(appSource, /今日奖励局数已满/);
});
