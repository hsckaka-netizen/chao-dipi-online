import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  calculateWarEffortDrops,
  WAR_EFFORT_RULES,
  warEffortCampaignStatus,
  warEffortContribution
} from "../server-war-effort.js";

function gameRecord(overrides = {}) {
  return {
    gameMode: "pvp",
    setup: { fry: { history: [] } },
    trickHistory: [],
    ...overrides
  };
}

function player(overrides = {}) {
  return {
    accountId: "account-1",
    roomPlayerId: "player-1",
    isAi: false,
    pveEnergyEligible: true,
    trickScore: 0,
    evaluation: {},
    ...overrides
  };
}

test("war effort drops use settled card behavior and apply every per-game cap", () => {
  const record = gameRecord({
    setup: {
      fry: {
        history: [
          { playerId: "player-1" },
          { playerId: "player-1" },
          { playerId: "player-1" }
        ],
        skillHistory: [{ playerId: "player-1" }]
      }
    },
    trickHistory: [
      { leaderId: "player-1", winnerId: "player-1", plays: [{ playerId: "player-1", cards: [1, 2, 3, 4, 5, 6] }] },
      { leaderId: "player-1", winnerId: "player-1", plays: [{ playerId: "player-1", cards: [1, 2, 3, 4, 5, 6, 7] }] },
      { leaderId: "player-1", winnerId: "player-2", plays: [{ playerId: "player-1", cards: [1, 2, 3, 4, 5, 6] }] }
    ]
  });
  assert.deepEqual(calculateWarEffortDrops(record, player({
    trickScore: 240,
    evaluation: { enemyDraggedRedFives: 2, enemyDraggedDiamondFives: 2 }
  })), {
    red_cloth: 5,
    bounty_order: 5,
    dreamleaf: 2,
    dark_iron: 2
  });
});

test("PVE loss still earns event items while an energy-ineligible game does not", () => {
  const pveLoss = gameRecord({ gameMode: "pve" });
  assert.deepEqual(calculateWarEffortDrops(pveLoss, player({ won: false, trickScore: 80 })), {
    red_cloth: 2,
    bounty_order: 0,
    dreamleaf: 0,
    dark_iron: 0
  });
  assert.equal(calculateWarEffortDrops(pveLoss, player({ pveEnergyEligible: false, trickScore: 80 })), null);
  assert.equal(calculateWarEffortDrops(pveLoss, player({ isAi: true, trickScore: 80 })), null);
});

test("campaign targets and contribution conversions match the confirmed launch rules", () => {
  assert.equal(WAR_EFFORT_RULES.resources.red_cloth.target, 6000);
  assert.equal(WAR_EFFORT_RULES.resources.bounty_order.target, 1500);
  assert.equal(WAR_EFFORT_RULES.resources.dreamleaf.target, 1300);
  assert.equal(WAR_EFFORT_RULES.resources.dark_iron.target, 1500);
  assert.equal(WAR_EFFORT_RULES.resources.diamonds.target, 120000);
  assert.equal(WAR_EFFORT_RULES.resources.universal_fragments.target, 1000);
  assert.equal(WAR_EFFORT_RULES.resources.building_materials.target, 80000);
  assert.equal(warEffortContribution("red_cloth", 3), 3);
  assert.equal(warEffortContribution("bounty_order", 3), 12);
  assert.equal(warEffortContribution("dreamleaf", 3), 15);
  assert.equal(warEffortContribution("dark_iron", 3), 12);
  assert.equal(warEffortContribution("diamonds", 40), 2);
  assert.equal(warEffortContribution("universal_fragments", 3), 18);
  assert.equal(warEffortContribution("building_materials", 50), 4);
});

test("campaign opens at the current season boundary and remains active for 28 days", () => {
  const campaign = {
    starts_at: WAR_EFFORT_RULES.startsAt,
    ends_at: WAR_EFFORT_RULES.endsAt,
    completed_at: null
  };
  assert.equal(warEffortCampaignStatus(campaign, "2026-09-30T18:59:59.999Z"), "upcoming");
  assert.equal(warEffortCampaignStatus(campaign, WAR_EFFORT_RULES.startsAt), "active");
  assert.equal(warEffortCampaignStatus(campaign, WAR_EFFORT_RULES.endsAt), "ended");
  assert.equal(
    new Date(WAR_EFFORT_RULES.endsAt).getTime() - new Date(WAR_EFFORT_RULES.startsAt).getTime(),
    28 * 24 * 60 * 60 * 1000
  );
});

test("war effort storage and donation ledger are server-owned and idempotent", async () => {
  const [migration, historySource] = await Promise.all([
    readFile(fileURLToPath(new URL("../db/migrations/037_server_war_effort.sql", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("../game-history.js", import.meta.url)), "utf8")
  ]);
  assert.match(migration, /PRIMARY KEY \(campaign_id, game_id, account_id\)/);
  assert.match(migration, /PRIMARY KEY \(account_id, request_id\)/);
  assert.match(historySource, /FOR UPDATE/);
  assert.match(historySource, /saveWarEffortGameRewards/);
  assert.match(historySource, /war_effort_donation/);
});
