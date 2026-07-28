import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  availableTauntPresets,
  normalizeTauntPreset,
  tauntAvailableToAccount,
  validateTauntText
} from "../taunt-presets.js";

test("taunt availability supports public and per-account presets", () => {
  const presets = [
    {
      id: "public",
      text: "所有人可用",
      enabled: true,
      availableToAll: true,
      availableAccountIds: [],
      sortOrder: 20
    },
    {
      id: "exclusive",
      text: "专属嘲讽",
      enabled: true,
      availableToAll: false,
      availableAccountIds: ["account-a"],
      sortOrder: 10
    },
    {
      id: "disabled",
      text: "已停用",
      enabled: false,
      availableToAll: true,
      availableAccountIds: [],
      sortOrder: 30
    }
  ];

  assert.equal(tauntAvailableToAccount(presets[0], null), true);
  assert.equal(tauntAvailableToAccount(presets[1], "account-a"), true);
  assert.equal(tauntAvailableToAccount(presets[1], "account-b"), false);
  assert.equal(tauntAvailableToAccount(presets[2], "account-a"), false);

  assert.deepEqual(availableTauntPresets(presets, "account-a"), [
    { id: "exclusive", text: "专属嘲讽" },
    { id: "public", text: "所有人可用" }
  ]);
  assert.deepEqual(availableTauntPresets(presets, "account-b"), [
    { id: "public", text: "所有人可用" }
  ]);
});

test("taunt input is normalized and length-limited", () => {
  assert.deepEqual(validateTauntText("  别急，  好戏在后头。  "), {
    text: "别急， 好戏在后头。"
  });
  assert.match(validateTauntText("x".repeat(41)).error, /40/);

  assert.deepEqual(
    normalizeTauntPreset({
      id: "sample",
      text: " 测试 ",
      availableToAll: false,
      availableAccountIds: ["a", "a", "", "b"],
      sortOrder: "12"
    }).availableAccountIds,
    ["a", "b"]
  );
});

test("taunt migration persists presets and per-account access", async () => {
  const migrationPath = fileURLToPath(new URL("../db/migrations/012_taunt_presets.sql", import.meta.url));
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_taunt_presets/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS cdp_taunt_preset_access/);
  assert.match(migration, /PRIMARY KEY \(taunt_id, account_id\)/);
  assert.match(migration, /INSERT INTO cdp_taunt_presets/);
  assert.match(migration, /ON CONFLICT \(taunt_id\) DO NOTHING/);
});

test("admin taunt routes cover create, update, delete, and player filtering", async () => {
  const serverPath = fileURLToPath(new URL("../server.js", import.meta.url));
  const source = await readFile(serverPath, "utf8");

  assert.match(source, /pathParts\[2\] === "taunts"[\s\S]*?req\.method === "POST"/);
  assert.match(source, /pathParts\[2\] === "taunts"[\s\S]*?req\.method === "PATCH"/);
  assert.match(source, /pathParts\[2\] === "taunts"[\s\S]*?req\.method === "DELETE"/);
  assert.match(source, /availableTauntPresets\(tauntPresets, viewer\?\.accountId/);
  assert.match(source, /tauntAvailableToAccount\(preset, player\.accountId/);
});
