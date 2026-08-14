import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  calculateHeroSkillReward,
  createBattleHeroSnapshot,
  drawHomeUnit,
  previewHomeRegion,
  starUpgradeCost,
  unitProductionRate
} from "../hero-home.js";

test("home production uses star rates, keeps fractions, and stops at six hours", () => {
  const preview = previewHomeRegion({
    regionId: "boka",
    unitId: "zhao-yun",
    stars: 2,
    productionValue: 0.25,
    productionSeconds: 5 * 3600,
    settledAt: "2026-08-14T00:00:00.000Z"
  }, "2026-08-14T03:00:00.000Z");

  assert.equal(unitProductionRate("zhao-yun", 2), 4);
  assert.equal(preview.productionHours, 6);
  assert.equal(preview.productionValue, 4.25);
  assert.equal(preview.collectableDiamonds, 4);
  assert.equal(preview.fractionalValue, 0.25);
  assert.equal(preview.isFull, true);
});

test("minions use their own production and upgrade curves", () => {
  assert.equal(unitProductionRate("trainee", 4), 1.75);
  assert.equal(starUpgradeCost("trainee", 1), 10);
  assert.equal(starUpgradeCost("xiaoxu", 4), 80);
  assert.equal(starUpgradeCost("xiaoxu", 5), null);
});

test("first-ten guarantee selection can prefer an unowned hero", () => {
  const drawn = drawHomeUnit({
    forceHero: true,
    preferredUnownedHeroIds: ["watanabe-mayu"],
    randomFloat: () => 0
  });
  assert.equal(drawn.id, "watanabe-mayu");
});

test("xiaoxu counts distinct other scoring-card sources and excludes self", () => {
  const reward = calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("xiaoxu", 2),
    playerId: "self",
    playerResult: { playerId: "self", evaluationTags: [] },
    trickHistory: [
      {
        winnerId: "self",
        plays: [
          { playerId: "self", cards: [{ type: "normal", rank: "K" }] },
          { playerId: "a", cards: [{ type: "normal", rank: "5" }] },
          { playerId: "b", cards: [{ type: "normal", rank: "A" }] }
        ]
      },
      {
        winnerId: "self",
        plays: [
          { playerId: "a", cards: [{ type: "normal", rank: "10" }] },
          { playerId: "c", cards: [{ type: "normal", rank: "K" }] }
        ]
      }
    ]
  });

  assert.equal(reward.matchedCount, 2);
  assert.equal(reward.amount, 2);
});

test("gelu uses personal won-trick points without bottom or team additions", () => {
  const reward = calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("gelu", 3),
    playerId: "gelu-player",
    playerResult: { playerId: "gelu-player", evaluationTags: [] },
    trickHistory: [
      { winnerId: "gelu-player", points: 40, plays: [] },
      { winnerId: "gelu-player", points: 65, plays: [] },
      { winnerId: "other", points: 100, plays: [] }
    ]
  });
  assert.equal(reward.matchedCount, 2);
  assert.equal(reward.amount, 2);
});

test("direct, last-trick, and positive-title hero skills follow snapshot stars", () => {
  const history = [{ winnerId: "p", points: 0, plays: [] }];
  assert.equal(calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("zhao-yun", 5),
    playerId: "p",
    playerResult: { role: "狗腿", baseGameScore: 1, evaluationTags: [] },
    trickHistory: history
  }).amount, 6);
  assert.equal(calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("lin-chong", 4),
    playerId: "p",
    playerResult: { role: "闲家", baseGameScore: -1, evaluationTags: [] },
    trickHistory: history
  }).amount, 4);
  assert.equal(calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("maeda-atsuko", 2),
    playerId: "p",
    playerResult: { role: "庄家", baseGameScore: 1, evaluationTags: [] },
    trickHistory: history
  }).amount, 3);
  assert.equal(calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("watanabe-mayu", 3),
    playerId: "p",
    playerResult: {
      role: "闲家",
      evaluationTags: [
        { code: "mvp" }, { code: "god" }, { code: "heaven" },
        { code: "mvp" }, { code: "pit" }
      ]
    },
    trickHistory: history
  }).amount, 3);
});

test("hero migration stores home, gacha, snapshots, and hero bonus", async () => {
  const migration = await readFile(
    fileURLToPath(new URL("../db/migrations/019_hero_home_system.sql", import.meta.url)),
    "utf8"
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_hero_profiles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_home_regions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_hero_gacha_requests/);
  assert.match(migration, /battle_hero_snapshot jsonb/);
  assert.match(migration, /hero_bonus integer/);
});
