import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  calculateHeroSkillReward,
  createBattleHeroSnapshot,
  createHeroTaskDefinition,
  createHeroTaskRequirements,
  drawHeroGachaResult,
  drawHomeUnit,
  freeHeroPullState,
  heroGachaCharge,
  HERO_HOME_RULES,
  homeRegionMaxHours,
  HOME_UNIT_BY_ID,
  missingDailyHeroTaskSlots,
  paidBoardSkillState,
  previewHomeRegion,
  regionUpgradeCost,
  selectHeroTaskUnits,
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

  assert.equal(unitProductionRate("jiang-zha", 2), 28);
  assert.equal(preview.productionHours, 6);
  assert.equal(preview.productionValue, 28.25);
  assert.equal(preview.collectableDiamonds, 28);
  assert.equal(preview.fractionalValue, 0.25);
  assert.equal(preview.isFull, true);
});

test("minions use their own production and upgrade curves", () => {
  assert.equal(unitProductionRate("trainee", 4), 14);
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

test("free single pull refreshes at 06:00 Beijing time every day", () => {
  assert.deepEqual(freeHeroPullState(null, "2026-08-14T00:00:00.000Z"), {
    available: true,
    nextFreePullAt: "2026-08-14T22:00:00.000Z"
  });
  assert.deepEqual(
    freeHeroPullState("2026-08-14T10:00:00.000Z", "2026-08-14T21:59:59.000Z"),
    { available: false, nextFreePullAt: "2026-08-14T22:00:00.000Z" }
  );
  assert.deepEqual(
    freeHeroPullState("2026-08-14T10:00:00.000Z", "2026-08-14T22:00:00.000Z"),
    { available: true, nextFreePullAt: "2026-08-15T22:00:00.000Z" }
  );
  assert.deepEqual(
    freeHeroPullState("2026-08-14T22:00:00.000Z", "2026-08-14T22:00:00.000Z"),
    { available: false, nextFreePullAt: "2026-08-15T22:00:00.000Z" }
  );
});

test("free pull applies only to a single draw and ten draws cost 10 percent less", () => {
  assert.deepEqual(heroGachaCharge(1, true), { price: 0, freePullUsed: true });
  assert.deepEqual(heroGachaCharge(1, false), { price: 300, freePullUsed: false });
  assert.deepEqual(heroGachaCharge(10, true), { price: 2700, freePullUsed: false });
});

test("gacha draws building materials as an independent pool result", () => {
  const ssr = drawHeroGachaResult({ randomFloat: () => 0 });
  const sr = drawHeroGachaResult({ randomFloat: () => 0.05 });
  const materials = drawHeroGachaResult({ randomFloat: () => 0.2 });
  const minion = drawHeroGachaResult({ randomFloat: () => 0.5 });
  assert.equal(ssr.type, "unit");
  assert.equal(ssr.unit.rarity, "ssr");
  assert.equal(sr.type, "unit");
  assert.equal(sr.unit.rarity, "sr");
  assert.deepEqual(materials, { type: "materials", amount: 50 });
  assert.equal(minion.type, "unit");
  assert.equal(minion.unit.rarity, "minion");
  assert.equal(
    HERO_HOME_RULES.materialChance + HERO_HOME_RULES.minionChance
      + HERO_HOME_RULES.srChance + HERO_HOME_RULES.ssrChance,
    1
  );
});

test("gacha persistence credits materials only when the material result is drawn", async () => {
  const historySource = await readFile(
    fileURLToPath(new URL("../game-history.js", import.meta.url)),
    "utf8"
  );
  assert.match(historySource, /if \(draw\.type === "materials"\)/);
  assert.match(historySource, /buildingMaterialsAwarded \+= draw\.amount/);
  assert.doesNotMatch(historySource, /pullCount \* HERO_HOME_RULES\.buildingMaterialsPerPull/);
});

test("boka roster uses jiang zha and deng huang with the supplied card identities", () => {
  const jiangZha = createBattleHeroSnapshot("jiang-zha", 3);
  const dengHuang = createBattleHeroSnapshot("deng-huang", 2);
  assert.equal(jiangZha.name, "蒋渣");
  assert.equal(jiangZha.skillName, "渣代思维");
  assert.match(jiangZha.skillDescription, /狗腿/);
  assert.equal(jiangZha.cardImage, "/assets/heroes/jiang-zha-card-v2.png");
  assert.equal(dengHuang.name, "灯皇");
  assert.equal(dengHuang.skillName, "倒买倒卖");
  assert.equal(dengHuang.cardImage, "/assets/heroes/deng-huang-card-v2.png");
  assert.equal(createBattleHeroSnapshot("zhao-yun", 1), null);
  assert.equal(createBattleHeroSnapshot("lin-chong", 1), null);
});

test("all hero skill descriptions expose concrete per-star diamond values", () => {
  const expectedValues = {
    "jiang-zha": "150/185/220/255/290",
    "deng-huang": "120/150/180/210/240",
    xiaoxu: "7/9/11/12/14",
    gelu: "100/90/80/70/60",
    "maeda-atsuko": "185/230/280/325/370",
    "watanabe-mayu": "55/70/85/100/115"
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

test("gacha and table UI expose the daily refresh, discount, stable hero art, and skill dialog", async () => {
  const appSource = await readFile(
    fileURLToPath(new URL("../public/app.js", import.meta.url)),
    "utf8"
  );
  const styleSource = await readFile(
    fileURLToPath(new URL("../public/styles.css", import.meta.url)),
    "utf8"
  );
  assert.match(appSource, /data-hero-free-pull-countdown/);
  assert.match(appSource, /北京时间 06:00 更新/);
  assert.match(appSource, /十连 · \$\{tenPullPrice\}💎 <small>9折<\/small>/);
  assert.match(appSource, /data-action="open-battle-hero-preview"/);
  assert.match(appSource, /data-persistent-hero-image/);
  assert.match(appSource, /app\.replaceChildren\(nextShell\.content\)/);
  assert.match(appSource, /snapshot\.skillDescription/);
  assert.match(appSource, /result\.type === "materials"/);
  assert.match(styleSource, /\.battle-hero-mark:hover/);
  assert.match(styleSource, /\.gacha-free-pull-status time/);
  assert.match(styleSource, /\.gacha-result-card\.materials/);
});

test("daily task UI exposes compact hero cards, relaxed conditions, and one-click dispatch", async () => {
  const [appSource, styleSource] = await Promise.all([
    readFile(fileURLToPath(new URL("../public/app.js", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../public/styles.css", import.meta.url)), "utf8")
  ]);
  assert.match(appSource, /满足条件后，其余名额可任意补足/);
  assert.match(appSource, /data-auto-select="true"/);
  assert.match(appSource, /hero-task-choice-card/);
  assert.match(appSource, /一键派遣/);
  assert.match(styleSource, /\.hero-task-grid\s*\{[\s\S]*align-items:\s*start/);
  assert.match(styleSource, /\.hero-task-choice > input:checked \+ \.hero-task-choice-card/);
  assert.match(styleSource, /@media \(max-width: 520px\)[\s\S]*\.hero-task-actions/);
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
  assert.equal(reward.amount, 18);
});

test("xiaoxu does not cap distinct scoring-card sources even in a nine-player game", () => {
  const reward = calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("xiaoxu", 5),
    playerId: "self",
    playerResult: { playerId: "self", evaluationTags: [] },
    trickHistory: Array.from({ length: 8 }, (_, index) => ({
      winnerId: "self",
      plays: [{ playerId: `other-${index + 1}`, cards: [{ type: "normal", rank: "5" }] }]
    }))
  });
  assert.equal(reward.matchedCount, 8);
  assert.equal(reward.cap, null);
  assert.equal(reward.amount, 112);
});

test("gelu uses the star score threshold and rewards thirty-two diamonds per trigger", () => {
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
  assert.equal(reward.matchedCount, 1);
  assert.equal(reward.cap, null);
  assert.equal(reward.amount, 32);
  assert.equal(reward.rulesVersion, "2026-08-24-skill-v6");
});

test("gelu has no trigger or diamond cap at five stars", () => {
  const reward = calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("gelu", 5),
    playerId: "gelu-player",
    playerResult: { playerId: "gelu-player", evaluationTags: [] },
    trickHistory: [{ winnerId: "gelu-player", points: 400, plays: [] }]
  });
  assert.equal(reward.matchedCount, 6);
  assert.equal(reward.cap, null);
  assert.equal(reward.amount, 192);
  assert.match(reward.detail, /无次数和奖励上限/);
});

test("gelu improves the score threshold at every star and keeps integer trigger rewards", () => {
  const thresholds = [100, 90, 80, 70, 60];
  thresholds.forEach((threshold, index) => {
    const stars = index + 1;
    const oneTrigger = calculateHeroSkillReward({
      snapshot: createBattleHeroSnapshot("gelu", stars),
      playerId: "gelu-player",
      playerResult: { playerId: "gelu-player", evaluationTags: [] },
      trickHistory: [{ winnerId: "gelu-player", points: threshold, plays: [] }]
    });
    const repeated = calculateHeroSkillReward({
      snapshot: createBattleHeroSnapshot("gelu", stars),
      playerId: "gelu-player",
      playerResult: { playerId: "gelu-player", evaluationTags: [] },
      trickHistory: [{ winnerId: "gelu-player", points: threshold * 7, plays: [] }]
    });
    assert.equal(oneTrigger.amount, 32);
    assert.equal(repeated.matchedCount, 7);
    assert.equal(repeated.cap, null);
    assert.equal(repeated.amount, 224);
  });
});

test("direct, last-trick, and positive-title hero skills follow snapshot stars", () => {
  const history = [{ winnerId: "p", points: 0, plays: [] }];
  assert.equal(calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("jiang-zha", 5),
    playerId: "p",
    playerResult: { role: "狗腿", baseGameScore: 1, evaluationTags: [] },
    trickHistory: history
  }).amount, 290);
  assert.equal(calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("deng-huang", 4),
    playerId: "p",
    playerResult: { role: "闲家", baseGameScore: -1, evaluationTags: [] },
    trickHistory: history
  }).amount, 210);
  assert.equal(calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("maeda-atsuko", 2),
    playerId: "p",
    playerResult: { role: "庄家", baseGameScore: 1, evaluationTags: [] },
    trickHistory: history
  }).amount, 230);
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
  }).amount, 255);
});

test("watanabe mayu scales each positive title without a total cap", () => {
  const reward = calculateHeroSkillReward({
    snapshot: createBattleHeroSnapshot("watanabe-mayu", 5),
    playerId: "p",
    playerResult: {
      role: "闲家",
      evaluationTags: ["mvp", "support", "precision", "god", "heaven", "exhausted", "pillar"]
        .map((code) => ({ code }))
    },
    trickHistory: []
  });
  assert.equal(reward.matchedCount, 7);
  assert.equal(reward.cap, null);
  assert.equal(reward.amount, 805);
});

test("SSR roster, probabilities, production, and paid skill heat use the settled values", () => {
  const shenBiesan = createBattleHeroSnapshot("shen-biesan", 5, 2.5);
  const shenJiangwen = createBattleHeroSnapshot("shen-jiangwen", 1, 1);
  const yokoyama = createBattleHeroSnapshot("yokoyama-yui", 3);
  assert.equal(shenBiesan.name, "神 · 瘪三");
  assert.equal(shenBiesan.namePrefix, "神");
  assert.equal(shenBiesan.baseName, "瘪三");
  assert.equal(shenBiesan.skillName, "玉面雷神");
  assert.equal(shenBiesan.paidSkill.cost, 3100);
  assert.equal(shenJiangwen.skillName, "排骨之王");
  assert.equal(shenJiangwen.paidSkill.cost, 2500);
  assert.equal(yokoyama.skillName, "全能偶像");
  assert.equal(yokoyama.paidSkill.cost, 100);
  assert.equal(unitProductionRate("shen-biesan", 5), 60);
  assert.equal(drawHomeUnit({ randomFloat: () => 0 }).rarity, "ssr");
  assert.equal(drawHomeUnit({ randomFloat: () => 0.05 }).rarity, "sr");
  assert.equal(drawHomeUnit({ randomFloat: () => 0.5 }).rarity, "minion");
  assert.deepEqual(paidBoardSkillState(5, 3), {
    stars: 5,
    heat: 3,
    maxHeat: 3,
    baseCost: 600,
    heatCost: 1000,
    cost: 3600,
    coolingPerUnusedGame: 0.5
  });
});

test("region levels increase output every level and unlock capacity on milestones", () => {
  assert.equal(regionUpgradeCost(0), 120);
  assert.equal(regionUpgradeCost(9), 120);
  assert.equal(regionUpgradeCost(10), 130);
  assert.equal(regionUpgradeCost(99), 210);
  assert.equal(regionUpgradeCost(100), null);
  const totalCost = Array.from({ length: 100 }, (_, level) => regionUpgradeCost(level)).reduce((sum, cost) => sum + cost, 0);
  const expectedDailyMaterials = 3 * 58.4 + 5 * 0.4 * 50;
  assert.equal(totalCost, 16_500);
  assert.ok(Math.abs(totalCost / expectedDailyMaterials - 60) < 0.1);
  assert.equal(homeRegionMaxHours(0), 6);
  assert.equal(homeRegionMaxHours(10), 6.5);
  assert.equal(homeRegionMaxHours(100), 11);
  const preview = previewHomeRegion({
    regionId: "stage",
    unitId: "yokoyama-yui",
    stars: 1,
    level: 20,
    settledAt: "2026-08-14T00:00:00.000Z"
  }, "2026-08-14T01:00:00.000Z");
  assert.equal(preview.productionMultiplier, 1.1);
  assert.ok(Math.abs(preview.ratePerHour - 39.6) < 1e-9);
  assert.equal(preview.maxProductionHours, 7);
  assert.equal(preview.extraSlotUnlocked, false);
});

test("daily hero task slots never refill after a task starts or is collected", () => {
  assert.deepEqual(missingDailyHeroTaskSlots([]), [1, 2, 3]);
  assert.deepEqual(missingDailyHeroTaskSlots([
    { slot_index: 1, status: "available" },
    { slot_index: 2, status: "running" },
    { slot_index: 3, status: "collected" }
  ]), []);
  assert.deepEqual(missingDailyHeroTaskSlots([{ slotIndex: 2, status: "completed" }]), [1, 3]);
});

test("daily hero tasks use the five settled tiers and feasible owned-hero requirements", () => {
  const orange = createHeroTaskDefinition(
    ["jiang-zha", "deng-huang", "xiaoxu", "maeda-atsuko", "watanabe-mayu"],
    () => 0.999
  );
  assert.equal(orange.color, "orange");
  assert.equal(orange.heroCount, 5);
  assert.equal(orange.durationSeconds, 12 * 3600);
  assert.equal(orange.rewardMaterials, 320);
  assert.equal(Object.keys(orange.requirements.regions).length, 1);
  assert.equal(Object.values(orange.requirements.regions)[0], 1);
  assert.equal(Object.keys(orange.requirements.genders).length, 1);
  assert.equal(Object.values(orange.requirements.genders)[0], 2);
  assert.ok(Object.keys(orange.requirements.regions).every((regionId) => ["boka", "brick", "stage"].includes(regionId)));
  assert.ok(Object.keys(orange.requirements.genders).every((gender) => ["male", "female"].includes(gender)));
});

test("one-click hero dispatch skips occupied heroes and finds a valid relaxed lineup", () => {
  const selected = selectHeroTaskUnits(
    ["jiang-zha", "deng-huang", "shen-biesan", "xiaoxu", "gelu", "shen-jiangwen", "maeda-atsuko", "watanabe-mayu", "yokoyama-yui"],
    ["jiang-zha"],
    5,
    { regions: { boka: 1 }, genders: { female: 2 } }
  );
  assert.equal(selected.length, 5);
  assert.ok(!selected.includes("jiang-zha"));
  assert.ok(selected.some((unitId) => HOME_UNIT_BY_ID.get(unitId)?.regionId === "boka"));
  assert.ok(selected.filter((unitId) => HOME_UNIT_BY_ID.get(unitId)?.gender === "female").length >= 2);
  assert.equal(selectHeroTaskUnits(["jiang-zha", "xiaoxu"], [], 2, { genders: { female: 1 } }), null);
});

test("existing five-person task requirements can be relaxed without changing the task tier", () => {
  const requirements = createHeroTaskRequirements(
    ["jiang-zha", "deng-huang", "xiaoxu", "maeda-atsuko", "watanabe-mayu"],
    5,
    () => 0.25
  );
  assert.equal(Object.values(requirements.regions).reduce((sum, count) => sum + count, 0), 1);
  assert.equal(Object.values(requirements.genders).reduce((sum, count) => sum + count, 0), 2);
});

test("server and table UI expose all three SSR board skill stages", async () => {
  const [serverSource, appSource] = await Promise.all([
    readFile(fileURLToPath(new URL("../server.js", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../public/app.js", import.meta.url)), "utf8")
  ]);
  assert.match(serverSource, /beginShenBiesanSkillStage/);
  assert.match(serverSource, /resolveShenBiesanSkillStage/);
  assert.match(serverSource, /beginYokoyamaSkillStage/);
  assert.match(serverSource, /activateShenJiangwenSkill/);
  assert.match(serverSource, /pathParts\[3\] === "board-hero-skill"/);
  assert.match(serverSource, /rulesRank = "LOW_2"/);
  assert.match(serverSource, /directSkillPendingPlayerId/);
  assert.match(appSource, /data-action="shen-biesan-activate"/);
  assert.match(appSource, /data-action="yokoyama-swap"/);
  assert.match(appSource, /data-action="shen-jiangwen-activate"/);
  assert.match(appSource, /!isBid && shenJiangwenSkill\.canActivate/);
  assert.match(appSource, /英雄技能 · 发动排骨之王/);
  assert.match(appSource, /每天北京时间06:00生成最多3个新任务；当天完成或领取后不补位/);
  assert.match(appSource, /建材 40%（50个）/);
  assert.match(appSource, /function gameCardRank/);
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

  const expansionMigration = await readFile(
    fileURLToPath(new URL("../db/migrations/022_ssr_economy_and_home_progression.sql", import.meta.url)),
    "utf8"
  );
  assert.match(expansionMigration, /non_ssr_pity_count/);
  assert.match(expansionMigration, /building_materials/);
  assert.match(expansionMigration, /skill_heat/);
  assert.match(expansionMigration, /CREATE TABLE IF NOT EXISTS cdp_hero_tasks/);
  assert.match(expansionMigration, /CREATE TABLE IF NOT EXISTS cdp_game_hero_skill_uses/);
  assert.match(expansionMigration, /board_hero_effects/);
  assert.match(expansionMigration, /diamond_denomination:2026-08-24/);

  const rebalanceMigration = await readFile(
    fileURLToPath(new URL("../db/migrations/023_hero_economy_rebalance.sql", import.meta.url)),
    "utf8"
  );
  assert.match(rebalanceMigration, /home_production_before_rebalance/);
  assert.match(rebalanceMigration, /ARRAY\[36, 48, 60, 72, 84\]/);
  assert.match(rebalanceMigration, /region\.level \* 0\.01/);
  assert.match(rebalanceMigration, /settled_at = CURRENT_TIMESTAMP/);
});
