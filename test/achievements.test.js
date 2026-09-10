import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_TITLE_BY_ID,
  buildAchievementState,
  calculateStreaks
} from "../achievements.js";

test("career streaks track best winning and losing runs independently", () => {
  assert.deepEqual(calculateStreaks([true, true, false, false, false, true, true, true, false]), {
    maxWinStreak: 3,
    maxLossStreak: 3
  });
});

test("achievement catalogue covers career, victory, highlights, and identity goals", () => {
  assert.equal(ACHIEVEMENTS.length, 22);
  assert.deepEqual(new Set(ACHIEVEMENTS.map((item) => item.category)), new Set([
    "career", "victory", "performance", "identity"
  ]));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "gamesPlayed"));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "maxWinStreak"));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "maxLossStreak"));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "maxEnemyRedFives"));
  assert.ok(ACHIEVEMENTS.some((item) => item.metric === "distinctEvaluationTitles"));
  assert.ok(ACHIEVEMENT_TITLE_BY_ID.size >= 10);
  assert.equal(new Set(ACHIEVEMENTS.map((item) => item.id)).size, ACHIEVEMENTS.length);
  assert.equal(
    new Set(ACHIEVEMENTS.filter((item) => item.title).map((item) => item.title.id)).size,
    ACHIEVEMENTS.filter((item) => item.title).length
  );
});

test("completed rewards remain claimable and only claimed titles can be equipped", () => {
  const beforeClaim = buildAchievementState({ gamesPlayed: 1 }, [], "rookie");
  assert.equal(beforeClaim.claimableCount, 1);
  assert.equal(beforeClaim.equippedTitleId, "");

  const afterClaim = buildAchievementState(
    { gamesPlayed: 1 },
    [{ achievementId: "career-1", claimedAt: "2026-09-10T00:00:00.000Z" }],
    "rookie"
  );
  assert.equal(afterClaim.claimedCount, 1);
  assert.equal(afterClaim.equippedTitleId, "rookie");
  assert.equal(afterClaim.equippedTitle.name, "初出茅庐");
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
  assert.match(serverSource, /pathParts\[1\] === "achievements"/);
  assert.match(appSource, /data-action="claim-achievement"/);
  assert.match(appSource, /data-action="equip-title"/);
});
