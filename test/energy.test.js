import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  consumePveStartEnergy,
  ENERGY_RULES,
  purchaseEnergy,
  recoverEnergy
} from "../energy.js";

test("energy rules keep the PVE cost, recovery, cap, and purchase together", () => {
  assert.deepEqual({
    maximum: ENERGY_RULES.maximum,
    pveStartCost: ENERGY_RULES.pveStartCost,
    recoveryIntervalMs: ENERGY_RULES.recoveryIntervalMs,
    purchaseAmount: ENERGY_RULES.purchaseAmount,
    purchaseDiamondCost: ENERGY_RULES.purchaseDiamondCost
  }, {
    maximum: 24,
    pveStartCost: 6,
    recoveryIntervalMs: 3_600_000,
    purchaseAmount: 6,
    purchaseDiamondCost: 200
  });
});

test("energy recovers one point per complete hour and preserves partial progress", () => {
  const state = recoverEnergy(
    { energy: 10, refreshedAt: "2026-09-10T00:00:00.000Z" },
    "2026-09-10T03:30:00.000Z"
  );
  assert.equal(state.energy, 13);
  assert.equal(state.recovered, 3);
  assert.equal(state.refreshedAt, "2026-09-10T03:00:00.000Z");
  assert.equal(state.nextRecoveryAt, "2026-09-10T04:00:00.000Z");
});

test("PVE start spends six only when sufficient and never blocks an insufficient player", () => {
  const sufficient = consumePveStartEnergy(
    { energy: 24, refreshedAt: "2026-09-09T00:00:00.000Z" },
    "2026-09-10T00:00:00.000Z"
  );
  assert.equal(sufficient.eligible, true);
  assert.equal(sufficient.energySpent, 6);
  assert.equal(sufficient.energy, 18);
  assert.equal(sufficient.nextRecoveryAt, "2026-09-10T01:00:00.000Z");

  const insufficient = consumePveStartEnergy(
    { energy: 5, refreshedAt: "2026-09-10T00:00:00.000Z" },
    "2026-09-10T00:10:00.000Z"
  );
  assert.equal(insufficient.eligible, false);
  assert.equal(insufficient.energySpent, 0);
  assert.equal(insufficient.energy, 5);
  assert.equal(insufficient.reason, "insufficient-energy");
});

test("energy purchase adds six without exceeding the cap", () => {
  const purchased = purchaseEnergy(
    { energy: 18, refreshedAt: "2026-09-10T00:00:00.000Z" },
    "2026-09-10T00:10:00.000Z"
  );
  assert.equal(purchased.purchased, true);
  assert.equal(purchased.energy, 24);
  assert.equal(purchased.canPurchase, false);

  const rejected = purchaseEnergy(
    { energy: 19, refreshedAt: "2026-09-10T00:00:00.000Z" },
    "2026-09-10T00:10:00.000Z"
  );
  assert.equal(rejected.purchased, false);
  assert.equal(rejected.reason, "would-exceed-maximum");
});

test("energy persistence records each start once and keeps reward eligibility on the player record", async () => {
  const [migration, historySource, serverSource, appSource] = await Promise.all([
    readFile(new URL("../db/migrations/034_energy_and_achievements.sql", import.meta.url), "utf8"),
    readFile(new URL("../game-history.js", import.meta.url), "utf8"),
    readFile(new URL("../server.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ]);
  assert.match(migration, /PRIMARY KEY \(start_id, account_id\)/);
  assert.match(migration, /pve_energy_eligible boolean NOT NULL DEFAULT true/);
  assert.match(historySource, /energy_purchase/);
  assert.match(historySource, /connectPoolWithTimeout/);
  assert.match(historySource, /SET LOCAL statement_timeout = '3000ms'/);
  assert.match(historySource, /AND \(game\.game_mode <> 'pve' OR player\.pve_energy_eligible\)/);
  assert.match(serverSource, /preparePveEnergyForDeal\(room, energyStartId\)/);
  assert.match(serverSource, /if \(room\.startInFlight\)/);
  assert.match(serverSource, /room\.startInFlight && pathParts\[3\] !== "start"/);
  assert.match(appSource, /PVE 已消耗的体力不返还/);
});
