import test from 'node:test';
import assert from 'node:assert/strict';
import { __homeSlotStorageTesting as storage } from '../game-history.js';

const now = '2026-11-02T00:00:00Z';
function client(level = 200) {
  const data = {
    region: { region_id: 'boka', level, unit_id: 'jiang-zha', extra_unit_id: 'deng-huang', second_extra_unit_id: null, production_value: 0.25, production_seconds: 0, settled_at: '2026-11-01T23:00:00Z' },
    units: { 'jiang-zha': 1, 'deng-huang': 5, 'shen-biesan': 5 }, balance: 0, ledger: [], failAssignment: false
  };
  let checkpoint;
  const row = () => ({ ...data.region, stars: data.units[data.region.unit_id], extra_stars: data.units[data.region.extra_unit_id], second_extra_stars: data.units[data.region.second_extra_unit_id] });
  return { data, async query(sql, args = []) {
    const rows = (values = []) => ({ rows: values });
    if (sql === 'BEGIN') checkpoint = structuredClone({ region: data.region, balance: data.balance, ledger: data.ledger });
    else if (sql === 'ROLLBACK') Object.assign(data, checkpoint);
    else if (sql === 'COMMIT' || sql.includes('INSERT INTO cdp_hero_profiles') || sql.includes('INSERT INTO cdp_home_regions') || sql.includes('INSERT INTO cdp_diamond_wallets')) { /* account setup */ }
    else if (sql.includes('SELECT account_id FROM cdp_hero_profiles')) return rows([{ account_id: args[0] }]);
    else if (sql.includes('SELECT level, unit_id')) return rows([data.region]);
    else if (sql.includes('SELECT stars FROM cdp_hero_units')) return rows(data.units[args[1]] ? [{ stars: data.units[args[1]] }] : []);
    else if (sql.includes('SELECT region_id, unit_id, extra_unit_id')) return rows([data.region].filter((r) => [r.unit_id, r.extra_unit_id, r.second_extra_unit_id].includes(args[1])));
    else if (sql.includes('FROM cdp_home_regions region')) return rows([row()]);
    else if (sql.includes('SET production_value = $3')) Object.assign(data.region, { production_value: args[2], production_seconds: args[3], settled_at: new Date().toISOString() });
    else if (sql.includes('SET second_extra_unit_id = $3') || sql.includes('SET extra_unit_id = $3') || sql.includes('SET unit_id = $3')) {
      if (data.failAssignment) throw new Error('assignment failed');
      const column = sql.match(/SET (\w+) = \$3/)[1];
      Object.assign(data.region, { [column]: args[2], production_value: args[3], production_seconds: 0, settled_at: new Date().toISOString() });
    }
    else if (sql.includes('UPDATE cdp_diamond_wallets')) { data.balance += args[1]; return rows([{ balance: data.balance }]); }
    else if (sql.includes('SELECT balance FROM cdp_diamond_wallets')) return rows([{ balance: data.balance }]);
    else if (sql.includes('INSERT INTO cdp_diamond_ledger')) data.ledger.push(args);
    else if (sql.includes('SELECT universal_fragments')) return rows([{ building_materials: 0 }]);
    else if (sql.includes('SELECT unit_id, stars, exclusive_fragments')) return rows(Object.entries(data.units).map(([unit_id, stars]) => ({ unit_id, stars })));
    else if (sql.includes('cdp_hero_tasks') || sql.includes('cdp_daily_task_claims') || sql.includes('cdp_daily_task_bonus_claims') || sql.includes('cdp_hero_advancements') || sql.includes('FROM cdp_game_players player') || sql.includes('SET battle_unit_id = NULL')) return rows();
    else assert.fail(`Unexpected query: ${sql}`);
    return rows();
  } };
}
const request = 'second-slot-request';

test('second extra slot enforces level, hero type, ownership, region, unique occupancy and the slot whitelist', async () => {
  const locked = client(199);
  await assert.rejects(storage.assignHomeUnitFromClient(locked, 'account', 'boka', 'shen-biesan', request, 'extra2'), /200级/);
  const current = client();
  await assert.rejects(storage.assignHomeUnitFromClient(current, 'account', 'boka', 'boka-youth', request, 'extra2'), /只能安排英雄/);
  await assert.rejects(storage.assignHomeUnitFromClient(current, 'account', 'boka', 'xiaoxu', request, 'extra2'), /只能放入/);
  await assert.rejects(storage.assignHomeUnitFromClient(current, 'account', 'boka', 'shen-haohao', request, 'extra2'), /尚未拥有/);
  await assert.rejects(storage.assignHomeUnitFromClient(current, 'account', 'boka', 'jiang-zha', request, 'extra2'), /已经安排/);
  for (const slot of ['__proto__', 'toString', 'unknown']) await assert.rejects(storage.assignHomeUnitFromClient(current, 'account', 'boka', 'shen-biesan', request, slot), /栏位不存在/);
  assert.equal(current.data.region.second_extra_unit_id, null);
});

test('assigning and removing the second extra hero settles old production and updates the returned state', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
  const current = client();
  const assigned = await storage.assignHomeUnitFromClient(current, 'account', 'boka', 'shen-biesan', request, 'extra2');
  assert.equal(assigned.autoCollectedAmount, 78, 'new hero cannot accelerate the past hour');
  assert.equal(current.data.balance, 78);
  assert.equal(assigned.state.regions[0].secondExtraOwnedUnit.id, 'shen-biesan');
  assert.equal(assigned.state.regions[0].secondExtraRatePerHour, 80);
  assert.equal(assigned.state.regions[0].ratePerHour, 158);
  assert.equal(current.data.region.production_value, 0.25);
  t.mock.timers.tick(3600 * 1000);
  const removed = await storage.assignHomeUnitFromClient(current, 'account', 'boka', null, 'remove-second', 'extra2');
  assert.equal(removed.autoCollectedAmount, 158);
  assert.equal(current.data.balance, 236);
  assert.equal(removed.state.regions[0].secondExtraUnitId, null);
  assert.equal(removed.state.regions[0].ratePerHour, 78);
});

test('a failed assignment rolls back the auto-collected diamonds and original production snapshot', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
  const current = client();
  current.data.failAssignment = true;
  await assert.rejects(storage.assignHomeUnitFromClient(current, 'account', 'boka', 'shen-biesan', request, 'extra2'), /assignment failed/);
  assert.equal(current.data.balance, 0);
  assert.equal(current.data.region.production_value, 0.25);
  assert.equal(current.data.region.settled_at, '2026-11-01T23:00:00Z');
  assert.equal(current.data.region.second_extra_unit_id, null);
  assert.deepEqual(current.data.ledger, []);
});
