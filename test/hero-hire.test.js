import test from "node:test";
import assert from "node:assert/strict";
import { chargeHeroHire, refundHeroHires, hiredSkillOwnership } from "../hero-hire.js";
import { __heroHireStorageTesting as storage } from "../game-history.js";

function store(balance = 1000) {
  let checkpoint;
  const data = { balance, hires: {}, ledger: [], skillUses: [], failLedger: false, queries: [] };
  return {
    data,
    async query(sql, args = []) {
      data.queries.push(sql);
      const key = `${args[0]}:${args[1]}`;
      if (sql === "BEGIN") checkpoint = structuredClone({ balance: data.balance, hires: data.hires, ledger: data.ledger, skillUses: data.skillUses });
      else if (sql === "ROLLBACK") Object.assign(data, checkpoint);
      else if (sql.startsWith("SET LOCAL") || sql === "COMMIT" || sql.includes("cdp_hero_profiles") || sql.includes("cdp_home_regions") || sql.includes("INSERT INTO cdp_diamond_wallets")) { /* transaction or account lock */ }
      else if (sql.includes("FROM cdp_game_hero_skill_uses")) return { rows: [] };
      else if (sql.includes("INSERT INTO cdp_game_hero_skill_uses")) data.skillUses.push(args);
      else if (sql.includes("SET skill_cooldown")) data.hires[key].skill_cooldown = args[2];
      else if (sql.includes("SELECT unit_id, cost")) return { rows: data.hires[key] ? [data.hires[key]] : [] };
      else if (sql.includes("balance = balance -")) {
        if (data.balance < args[1]) return { rows: [] };
        data.balance -= args[1];
        return { rows: [{ balance: data.balance }] };
      } else if (sql.includes("INSERT INTO cdp_game_hero_hires")) {
        assert.equal(data.hires[key], undefined);
        data.hires[key] = { game_id: args[0], account_id: args[1], unit_id: args[2], cost: args[3], balance_after: args[4], skill_cooldown: 0, refunded_at: null };
      } else if (sql.includes("INSERT INTO cdp_diamond_ledger")) {
        if (data.failLedger) throw new Error("simulated ledger failure");
        assert.ok(!data.ledger.some((row) => row.idempotencyKey === args[4]));
        data.ledger.push({ amount: args[1], balanceAfter: args[2], idempotencyKey: args[4] });
      } else if (sql.includes("SELECT account_id, unit_id, cost")) {
        return { rows: Object.values(data.hires).filter((row) => row.game_id === args[0] && !row.refunded_at) };
      } else if (sql.includes("balance = balance +")) {
        data.balance += args[1];
        return { rows: [{ balance: data.balance }] };
      } else if (sql.includes("SET refunded_at")) data.hires[key].refunded_at = "refunded";
      else if (sql.includes("SELECT skill_cooldown")) {
        const row = data.hires[key];
        return { rows: row && !row.refunded_at && row.unit_id === args[2] ? [row] : [] };
      } else assert.fail(`Unexpected query: ${sql}`);
      return { rows: [] };
    }
  };
}

test("hire atomically debits exactly 300 with a durable idempotent receipt and ledger, without granting a card", async () => {
  const client = store();
  const result = await chargeHeroHire(client, "account", "round", "shen-biesan");
  assert.equal(result.cost, 300);
  assert.equal(result.balanceAfter, 700);
  assert.equal(client.data.ledger.length, 1);
  assert.equal(client.data.ledger[0].amount, -300);
  assert.equal((await chargeHeroHire(client, "account", "round", "shen-biesan")).repeated, true);
  assert.equal(client.data.balance, 700);
  assert.equal(client.data.ledger.length, 1);
  await assert.rejects(chargeHeroHire(client, "account", "round", "jiang-zha"), /已锁定/);
  assert.ok(client.data.queries.every((sql) => !sql.includes("cdp_hero_units")), "rental never writes permanent ownership");
});

test("insufficient balance or a failed ledger rolls back the entire hire, allowing a safe retry", async () => {
  const insufficient = store(299);
  await assert.rejects(chargeHeroHire(insufficient, "account", "round", "jiang-zha"), /钻石不足/);
  assert.equal(insufficient.data.balance, 299);
  assert.deepEqual(insufficient.data.hires, {});
  const client = store(300);
  client.data.failLedger = true;
  await assert.rejects(chargeHeroHire(client, "account", "round", "jiang-zha"), /ledger failure/);
  assert.equal(client.data.balance, 300);
  assert.deepEqual(client.data.hires, {});
  client.data.failLedger = false;
  assert.equal((await chargeHeroHire(client, "account", "round", "jiang-zha")).balanceAfter, 0);
});

test("void refund is atomic and idempotent, and the refunded rental cannot authorize active skills", async () => {
  const client = store();
  await chargeHeroHire(client, "account", "round", "shen-biesan");
  assert.deepEqual(await hiredSkillOwnership(client, "account", "round", "shen-biesan"), { stars: 1, skill_cooldown: 0 });
  await assert.rejects(hiredSkillOwnership(client, "other-account", "round", "shen-biesan"), /失效/);
  await assert.rejects(hiredSkillOwnership(client, "account", "wrong-round", "shen-biesan"), /失效/);
  await assert.rejects(hiredSkillOwnership(client, "account", "round", "shen-haohao"), /失效/);
  client.data.failLedger = true;
  await assert.rejects(refundHeroHires(client, "round"), /ledger failure/);
  assert.equal(client.data.balance, 700);
  assert.equal(client.data.hires["round:account"].refunded_at, null);
  client.data.failLedger = false;
  assert.equal((await refundHeroHires(client, "round")).refunded, 1);
  assert.equal(client.data.balance, 1000);
  assert.equal((await refundHeroHires(client, "round")).refunded, 0);
  assert.equal(client.data.ledger.length, 2);
  await assert.rejects(hiredSkillOwnership(client, "account", "round", "shen-biesan"), /失效/);
  await assert.rejects(chargeHeroHire(client, "account", "round", "shen-biesan"), /已锁定/);
});

test("a hired SSR can activate its one-star skill using isolated rental cooldown, even if the permanent card is absent", async () => {
  const client = store();
  await chargeHeroHire(client, "account", "round", "shen-biesan");
  const effect = { hireGameId: "round", skillStars: 5 };
  const paid = await storage.chargeBoardHeroSkillFromClient(client, "account", "new-restart-game", "shen-biesan", "hire-skill-1", effect);
  assert.equal(paid.effectData.skillStars, 1);
  assert.equal(paid.cost, 0);
  assert.equal(paid.cooldownAfter, 5);
  assert.equal(client.data.balance, 700);
  assert.equal(client.data.hires["round:account"].skill_cooldown, 5);
  await assert.rejects(storage.chargeBoardHeroSkillFromClient(client, "account", "new-restart-game", "shen-biesan", "hire-skill-2", effect), /冷却/);
  assert.equal(client.data.skillUses.length, 1);
  assert.ok(client.data.queries.every((sql) => !sql.includes("cdp_hero_units")));
  const noWrites = { async query() { assert.fail("settling a rental must not alter permanent cooldown"); } };
  await storage.settleBoardHeroCooldown(noWrites, { players: [{ accountId: "account", battleHeroSnapshot: { heroId: "shen-biesan", hired: true } }] });
});
