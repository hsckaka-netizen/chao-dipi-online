import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  calculateHeroSkillReward,
  createBattleHeroSnapshot,
  drawHomeUnit,
  freeHeroPullState,
  heroGachaCharge,
  HOME_UNIT_BY_ID,
  previewHomeRegion,
  starUpgradeCost,
  unitProductionRate
} from "../hero-home.js";

test("home production uses star rates, keeps fractions, and stops at six hours", () => {
  const preview = previewHomeRegion({
    regionId: "boka",
    unitId: "jiang-zha",
    stars: 2,
    productionValue: 0.25,
    productionSeconds: 5 * 3600,
    settledAt: "2026-08-14T00:00:00.000Z"
  }, "2026-08-14T03:00:00.000Z");

  assert.equal(unitProductionRate("jiang-zha", 2), 4);
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

test("first-pull guarantee selection can prefer an unowned hero", () => {
  const drawn = drawHomeUnit({
    forceHero: true,
    preferredUnownedHeroIds: ["watanabe-mayu"],
    randomFloat: () => 0
  });
  assert.equal(drawn.id, "watanabe-mayu");
});

test("free single pull starts available and refreshes 24 hours after use", () => {
  assert.deepEqual(freeHeroPullState(null, "2026-08-14T00:00:00.000Z"), {
    available: true,
    nextFreePullAt: null
  });
  assert.deepEqual(
    freeHeroPullState("2026-08-14T00:00:00.000Z", "2026-08-14T23:59:59.000Z"),
    { available: false, nextFreePullAt: "2026-08-15T00:00:00.000Z" }
  );
  assert.deepEqual(
    freeHeroPullState("2026-08-14T00:00:00.000Z", "2026-08-15T00:00:00.000Z"),
    { available: true, nextFreePullAt: null }
  );
});

test("free pull applies only to a single draw and never discounts ten draws", () => {
  assert.deepEqual(heroGachaCharge(1, true), { price: 0, freePullUsed: true });
  assert.deepEqual(heroGachaCharge(1, false), { price: 30, freePullUsed: false });
  assert.deepEqual(heroGachaCharge(10, true), { price: 300, freePullUsed: false });
});

test("boka roster uses jiang zha and deng huang with the supplied card identities", () => {
  const jiangZha = createBattleHeroSnapshot("jiang-zha", 3);
  const dengHuang = createBattleHeroSnapshot("deng-huang", 2);
  assert.equal(jiangZha.name, "蒋渣");
  assert.equal(jiangZha.skillName, "渣代思维");
  assert.equal(jiangZha.cardImage, "/assets/heroes/jiang-zha-card.jpg");
  assert.equal(dengHuang.name, "灯皇");
  assert.equal(dengHuang.skillName, "倒买倒卖");
  assert.equal(dengHuang.cardImage, "/assets/heroes/deng-huang-card.jpg");
  assert.equal(createBattleHeroSnapshot("zhao-yun", 1), null);
  assert.equal(createBattleHeroSnapshot("lin-chong", 1), null);
});

test("all hero skill descriptions expose concrete per-star diamond values", () => {
  const expectedValues = {
    "jiang-zha": "2/3/4/5/6",
    "deng-huang": "1/2/3/4/5",
    xiaoxu: "1/2/3/4/5",
    gelu: "1/2/3/4/5",
    "maeda-atsuko": "2/3/4/5/6",
    "watanabe-mayu": "1/2/3/4/5"
  };
  Object.entries(expectedValues).forEach(([unitId, values]) => {
    const description = HOME_UNIT_BY_ID.get(unitId)?.skillDescription || "";
    assert.match(description, new RegExp(values.replaceAll("/", "\\/")));
    assert.match(description, /钻石/);
  });
});

test("home UI renders full hero cards and a large skill preview", async () => {
  const appSource = await readFile(
    fileURLToPath(new URL("../public/app.js", import.meta.url)),
    "utf8"
  );
  const styleSource = await readFile(
    fileURLToPath(new URL("../public/styles.css", import.meta.url)),
    "utf8"
  );
  assert.match(appSource, /data-action="open-hero-card-preview"/);
  assert.match(appSource, /点击查看大图与技能/);
  assert.match(appSource, /hero-card-preview-skill/);
  assert.match(styleSource, /\.home-hero-card-art[\s\S]*aspect-ratio:\s*707\s*\/\s*1000/);
  assert.match(styleSource, /\.hero-card-preview-modal/);
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
    snapshot: createBattleHeroSnapshot("jiang-zha", 5),
    playerId: "p",
    playerResult: { role: "狗腿", baseGameScore: 1, evaluationTags: [] },
    trickHistory: history
  }).amount, 6);
  assert.equal(calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("deng-huang", 4),
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

  const renameMigration = await readFile(
    fileURLToPath(new URL("../db/migrations/020_rename_boka_heroes.sql", import.meta.url)),
    "utf8"
  );
  assert.match(renameMigration, /WHEN 'zhao-yun' THEN 'jiang-zha'/);
  assert.match(renameMigration, /WHEN 'lin-chong' THEN 'deng-huang'/);
  assert.match(renameMigration, /UPDATE cdp_home_regions/);
  assert.match(renameMigration, /UPDATE cdp_hero_profiles/);

  const gachaMigration = await readFile(
    fileURLToPath(new URL("../db/migrations/021_first_and_free_hero_pull.sql", import.meta.url)),
    "utf8"
  );
  assert.match(gachaMigration, /first_pull_completed boolean/);
  assert.match(gachaMigration, /free_pull_used_at timestamptz/);
  assert.match(gachaMigration, /CHECK \(price >= 0\)/);
});
