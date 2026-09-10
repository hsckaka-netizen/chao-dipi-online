import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_TITLE_BY_ID,
  buildModeAchievementMetrics,
  buildAchievementState,
  calculateStreaks,
  fryActionCount,
  maximumLeadPlayCards
} from "../achievements.js";

test("career streaks track best winning and losing runs independently", () => {
  assert.deepEqual(calculateStreaks([true, true, false, false, false, true, true, true, false]), {
    maxWinStreak: 3,
    maxLossStreak: 3
  });
});

test("achievement catalogue has separate long-term PVP and PVE goals", () => {
  assert.equal(ACHIEVEMENTS.length, 100);
  assert.deepEqual(ACHIEVEMENT_CATEGORIES.map((category) => category.id), [
    "pvp-career", "pvp-performance", "pvp-special", "pvp-collection",
    "pve-career", "pve-performance", "pve-special", "pve-collection"
  ]);
  assert.deepEqual(
    new Set(ACHIEVEMENTS.map((item) => item.category)),
    new Set(ACHIEVEMENT_CATEGORIES.map((category) => category.id))
  );
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pvpGamesPlayed" && item.target === 2000));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pveGamesPlayed" && item.target === 2000));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pvpMaxWinStreak" && item.target === 10));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pveMaxWinStreak" && item.target === 20));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pvpMaxLossStreak" && item.target === 10));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pveBankerGames" && item.target === 500));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pvpTotalTrickScore" && item.target === 50000));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pveTotalFryActions" && item.target === 500));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pvpMaxLeadPlayCards" && item.target === 21));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "pveMaxDraggedRedFives" && item.target === 5));
  assert.ok(ACHIEVEMENTS.every((item) => item.metric.startsWith("pvp") || item.metric.startsWith("pve")));
  assert.ok(ACHIEVEMENT_TITLE_BY_ID.size >= 50);
  assert.equal(new Set(ACHIEVEMENTS.map((item) => item.id)).size, ACHIEVEMENTS.length);
  assert.equal(
    new Set(ACHIEVEMENTS.filter((item) => item.title).map((item) => item.title.id)).size,
    ACHIEVEMENTS.filter((item) => item.title).length
  );
});

test("completed rewards remain claimable and only claimed titles can be equipped", () => {
  const beforeClaim = buildAchievementState({ pvpGamesPlayed: 1 }, [], "pvp-rookie");
  assert.equal(beforeClaim.claimableCount, 1);
  assert.equal(beforeClaim.equippedTitleId, "");

  const afterClaim = buildAchievementState(
    { pvpGamesPlayed: 1 },
    [{ achievementId: "pvp-games-1", claimedAt: "2026-09-10T00:00:00.000Z" }],
    "pvp-rookie"
  );
  assert.equal(afterClaim.claimedCount, 1);
  assert.equal(afterClaim.equippedTitleId, "pvp-rookie");
  assert.equal(afterClaim.equippedTitle.name, "牌桌新秀");
});

test("special achievements count only actual lead cards and successful fry actions", () => {
  const trickHistory = [
    {
      leaderId: "self",
      plays: [
        { playerId: "self", cards: Array.from({ length: 21 }, (_, index) => `lead-${index}`) },
        { playerId: "other", cards: Array.from({ length: 21 }, (_, index) => `follow-${index}`) }
      ]
    },
    {
      leaderId: "other",
      plays: [
        { playerId: "other", cards: Array.from({ length: 25 }, (_, index) => `lead-other-${index}`) },
        { playerId: "self", cards: Array.from({ length: 25 }, (_, index) => `follow-self-${index}`) }
      ]
    },
    {
      leaderId: "self",
      plays: [{
        playerId: "self",
        cards: ["failed-component-1", "failed-component-2", "failed-component-3"],
        throw: { result: "failed", attempt: Array.from({ length: 30 }, (_, index) => `attempt-${index}`) }
      }]
    }
  ];
  assert.equal(maximumLeadPlayCards(trickHistory, "self"), 21);
  assert.equal(maximumLeadPlayCards(trickHistory.slice(1), "self"), 3);
  assert.equal(fryActionCount({ fry: { history: [
    { playerId: "self" }, { playerId: "other" }, { playerId: "self" }
  ] } }, "self"), 2);
});

test("PVP and PVE achievement metrics are calculated independently", () => {
  const games = [
    {
      game_id: "pvp-1", game_mode: "pvp", room_player_id: "self", won: true, role: "庄家",
      bottom_win: true, enemy_red_fives: 2, dragged_red_fives: 0, trick_score: 0,
      trick_history: [{ leaderId: "self", plays: [{ playerId: "self", cards: Array(21).fill("card") }] }],
      setup_data: { fry: { history: Array(5).fill({ playerId: "self" }) } }
    },
    {
      game_id: "pvp-2", game_mode: "pvp", room_player_id: "self", won: false, role: "闲家",
      bottom_win: false, enemy_red_fives: 5, dragged_red_fives: 5, trick_score: 20,
      trick_history: [], setup_data: {}
    },
    {
      game_id: "pve-1", game_mode: "pve", room_player_id: "self", won: true, role: "庄家",
      bottom_win: false, enemy_red_fives: 1, dragged_red_fives: 2, trick_score: 10,
      trick_history: [], setup_data: {}
    }
  ];
  const tags = [
    { game_id: "pvp-1", game_mode: "pvp", tag_code: "mvp" },
    { game_id: "pvp-1", game_mode: "pvp", tag_code: "support" },
    { game_id: "pvp-2", game_mode: "pvp", tag_code: "mvp" },
    { game_id: "pve-1", game_mode: "pve", tag_code: "support" }
  ];
  assert.deepEqual(buildModeAchievementMetrics(games, tags, "pvp"), {
    pvpGamesPlayed: 2,
    pvpWins: 1,
    pvpMaxWinStreak: 1,
    pvpMaxLossStreak: 1,
    pvpBankerGames: 1,
    pvpBottomWins: 1,
    pvpTotalTrickScore: 20,
    pvpTotalEnemyRedFives: 7,
    pvpMaxEnemyRedFives: 5,
    pvpMaxDraggedRedFives: 5,
    pvpMvpCount: 2,
    pvpSupportCount: 1,
    pvpEvaluationTitleCount: 3,
    pvpDistinctEvaluationTitles: 2,
    pvpMaxEvaluationTitlesInGame: 2,
    pvpMaxLeadPlayCards: 21,
    pvpMaxFryActions: 5,
    pvpTotalFryActions: 5,
    pvpZeroTrickScoreWins: 1
  });
  const pve = buildModeAchievementMetrics(games, tags, "pve");
  assert.equal(pve.pveGamesPlayed, 1);
  assert.equal(pve.pveWins, 1);
  assert.equal(pve.pveTotalEnemyRedFives, 1);
  assert.equal(pve.pveMvpCount, 0);
  assert.equal(pve.pveSupportCount, 1);
});

test("achievement claims and title equipment are server-authoritative and idempotent", async () => {
  const [migration, historySource, serverSource, appSource] = await Promise.all([
    readFile(new URL("../db/migrations/034_energy_and_achievements.sql", import.meta.url), "utf8"),
    readFile(new URL("../game-history.js", import.meta.url), "utf8"),
    readFile(new URL("../server.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ]);
  assert.match(migration, /PRIMARY KEY \(account_id, achievement_id\)/);
  assert.match(migration, /equipped_title varchar\(48\)/);
  assert.match(historySource, /pg_advisory_xact_lock/);
  assert.match(historySource, /'achievement'/);
  assert.match(historySource, /只能装备已经领取的称号/);
  assert.match(historySource, /game\.game_mode <> 'pve' OR player\.pve_energy_eligible/);
  assert.match(historySource, /game\.trick_history/);
  assert.match(historySource, /player\.dragged_red_fives/);
  assert.match(serverSource, /pathParts\[1\] === "achievements"/);
  assert.match(appSource, /data-action="claim-achievement"/);
  assert.match(appSource, /data-action="equip-title"/);
});
