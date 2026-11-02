import test from 'node:test';
import assert from 'node:assert/strict';
import { __dailyTaskBonusTesting as storage } from '../game-history.js';

const complete = { games_completed: 3, games_won: 1, banker_games: 1, bottom_wins: 1, trick_score: 500 };
const now = '2026-11-02T00:00:00Z';
function store(summary = complete) {
  const data = { summary, claims: [], inventory: {}, ledger: [], failLedger: false };
  let queue = Promise.resolve();
  function client() {
    let unlock, checkpoint;
    return { async query(sql, args = []) {
      const rows = (value = []) => ({ rows: value });
      if (sql === 'BEGIN') return rows();
      if (sql.includes('SELECT account_id FROM cdp_hero_profiles')) {
        const previous = queue;
        queue = new Promise((resolve) => { unlock = resolve; });
        await previous;
        checkpoint = structuredClone({ claims: data.claims, inventory: data.inventory, ledger: data.ledger });
        return rows([{ account_id: args[0] }]);
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        if (sql === 'ROLLBACK' && checkpoint) Object.assign(data, checkpoint);
        unlock?.();
        return rows();
      }
      if (sql.includes('INSERT INTO cdp_hero_profiles') || sql.includes('INSERT INTO cdp_home_regions')) return rows();
      if (sql.includes('FROM cdp_game_players player')) return rows([data.summary]);
      if (sql.includes('FROM cdp_daily_task_claims')) return rows();
      if (sql.includes('FROM cdp_daily_task_bonus_claims')) {
        const matches = data.claims.filter((claim) => claim.account_id === args[0] && (claim.refresh_key === args[1] || (args[2] && claim.request_id === args[2])));
        if (sql.includes('ORDER BY')) matches.sort((a, b) => Number(b.request_id === args[2]) - Number(a.request_id === args[2]));
        return rows(matches);
      }
      if (sql.includes('INSERT INTO cdp_consumable_inventory')) {
        const key = `${args[0]}:${args[1]}`;
        data.inventory[key] ||= { available_quantity: 0, reserved_quantity: 2 };
        data.inventory[key].available_quantity++;
        return rows([data.inventory[key]]);
      }
      if (sql.includes('INSERT INTO cdp_daily_task_bonus_claims')) {
        assert.ok(!data.claims.some((c) => c.account_id === args[0] && (c.refresh_key === args[1] || c.request_id === args[2])));
        data.claims.push({ account_id: args[0], refresh_key: args[1], request_id: args[2], item_id: args[3] });
        return rows();
      }
      if (sql.includes('INSERT INTO cdp_consumable_ledger')) {
        if (data.failLedger) throw new Error('ledger unavailable');
        assert.ok(!data.ledger.some((entry) => entry.key === args[4]));
        data.ledger.push({ accountId: args[0], itemId: args[1], available: args[2], reserved: args[3], key: args[4] });
        return rows();
      }
      assert.fail(`Unexpected query: ${sql}`);
    } };
  }
  return { data, client };
}

test('six completed tasks grant exactly one of the three cards without requiring normal reward claims', async () => {
  for (const [index, id] of ['colorful-card', 'war-god-card', 'restart-card'].entries()) {
    const current = store();
    const result = await storage.claimDailyTaskBonusFromClient(current.client(), 'account', 'request', now, (size) => { assert.equal(size, 3); return index; });
    assert.equal(result.rewardItemId, id);
    assert.equal(result.quantity, 1);
    assert.deepEqual(current.data.inventory[`account:${id}`], { available_quantity: 1, reserved_quantity: 2 });
    assert.equal(current.data.ledger.length, 1);
    assert.equal(current.data.claims.length, 1);
  }
});

test('five tasks or a newly refreshed day cannot claim the completion bonus', async () => {
  for (const summary of [{ ...complete, banker_games: 0 }, {}]) {
    const current = store(summary);
    await assert.rejects(storage.claimDailyTaskBonusFromClient(current.client(), 'account', 'request', now), /全部6个/);
    assert.deepEqual(current.data.inventory, {});
    assert.deepEqual(current.data.claims, []);
  }
});

test('concurrent and repeated requests share one result and never reroll or grant twice', async () => {
  const current = store();
  let rolls = 0;
  const random = () => { rolls++; return 1; };
  const results = await Promise.all(['first', 'second'].map((id) => storage.claimDailyTaskBonusFromClient(current.client(), 'account', id, now, random)));
  assert.equal(rolls, 1);
  assert.equal(results.filter((result) => result.repeated).length, 1);
  assert.ok(results.every((result) => result.rewardItemId === 'war-god-card'));
  assert.equal(current.data.inventory['account:war-god-card'].available_quantity, 1);
  assert.equal(current.data.ledger.length, 1);
  const retry = await storage.claimDailyTaskBonusFromClient(current.client(), 'account', 'first', '2026-11-02T22:00:00Z', () => { throw new Error('must not reroll'); });
  assert.equal(retry.repeated, true, 'a retry crossing 06:00 returns its original receipt');
  await storage.claimDailyTaskBonusFromClient(current.client(), 'account', 'next-day', '2026-11-02T22:00:00Z', () => 2);
  assert.equal(current.data.inventory['account:restart-card'].available_quantity, 1);
  const oldRetry = await storage.claimDailyTaskBonusFromClient(current.client(), 'account', 'first', '2026-11-02T22:00:00Z', () => { throw new Error('must not reroll'); });
  assert.equal(oldRetry.rewardItemId, 'war-god-card', 'original request wins even if the new day already has a different reward');
});

test('inventory, receipt and ledger roll back together and allow a clean retry', async () => {
  const current = store();
  current.data.failLedger = true;
  await assert.rejects(storage.claimDailyTaskBonusFromClient(current.client(), 'account', 'retry', now, () => 0), /ledger unavailable/);
  assert.deepEqual(current.data.inventory, {});
  assert.deepEqual(current.data.claims, []);
  assert.deepEqual(current.data.ledger, []);
  current.data.failLedger = false;
  await storage.claimDailyTaskBonusFromClient(current.client(), 'account', 'retry', now, () => 2);
  assert.equal(current.data.inventory['account:restart-card'].available_quantity, 1);
});
