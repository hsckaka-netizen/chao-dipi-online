import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __heroGachaStorageTesting as storage } from '../game-history.js';

function store(points = 1000, balance = 100000) {
  const data = { profiles: { account: { gacha_points: points, universal_fragments: 0, non_hero_pity_count: 0, non_ssr_pity_count: 0, building_materials: 0, first_pull_completed: false, free_pull_used_at: null } }, wallets: { account: balance }, units: {}, draws: {}, exchanges: {}, unlocked: {}, ledger: [] };
  const queues = new Map();
  let failReceipt = false;
  function client() {
    let unlock, checkpoint, lockedAccount;
    return { async query(sql, args = []) {
      const rows = (value = []) => ({ rows: structuredClone(value) });
      const [account, value, amount] = args;
      const key = `${account}:${value}`;
      if (sql === 'BEGIN') return rows();
      if (sql.includes('FROM cdp_hero_profiles') && sql.includes('FOR UPDATE')) {
        const previous = queues.get(account) || Promise.resolve();
        queues.set(account, new Promise((resolve) => { unlock = resolve; }));
        await previous;
        lockedAccount = account;
        checkpoint = structuredClone(data);
        return rows([data.profiles[account]]);
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        if (sql === 'ROLLBACK' && checkpoint) Object.assign(data, checkpoint);
        unlock?.(); return rows();
      }
      if (sql.includes('INSERT INTO cdp_hero_profiles') || sql.includes('INSERT INTO cdp_home_regions') || sql.includes('INSERT INTO cdp_diamond_wallets')) return rows();
      assert.equal(lockedAccount, account, 'account must be locked before reading or mutating transaction state');
      if (sql.includes('FROM cdp_hero_point_exchanges')) return rows(data.exchanges[key] ? [data.exchanges[key]] : []);
      if (sql.includes('FROM cdp_hero_gacha_requests')) return rows(data.draws[key] ? [{ result_data: data.draws[key] }] : []);
      if (sql.includes('FROM cdp_hero_advancements')) return rows(value ? (data.unlocked[key] ? [{ claimed_at: 'claimed' }] : []) : Object.keys(data.unlocked).filter((k) => k.startsWith(`${account}:`)).map((k) => ({ sr_unit_id: k.slice(account.length + 1) })));
      if (sql.includes('SELECT unit_id, stars, exclusive_fragments')) return rows(Object.entries(data.units).filter(([k]) => k.startsWith(`${account}:`)).map(([k, v]) => ({ unit_id: k.slice(account.length + 1), ...v })));
      if (sql.includes('SELECT stars FROM cdp_hero_units')) return rows(data.units[key] ? [data.units[key]] : []);
      if (sql.includes('SET gacha_points = gacha_points -')) {
        if (data.profiles[account].gacha_points < value) return rows();
        data.profiles[account].gacha_points -= value; return rows([data.profiles[account]]);
      }
      if (sql.includes('SET universal_fragments = $2')) {
        Object.assign(data.profiles[account], { universal_fragments: value, non_hero_pity_count: args[2], non_ssr_pity_count: args[3], building_materials: args[4], first_pull_completed: true });
        if (args[5]) data.profiles[account].free_pull_used_at = new Date().toISOString();
        data.profiles[account].gacha_points += args[6]; return rows([data.profiles[account]]);
      }
      if (sql.includes('SET universal_fragments = universal_fragments +')) { data.profiles[account].universal_fragments += value; return rows(); }
      if (sql.includes('INSERT INTO cdp_hero_units')) { assert.ok(!data.units[key]); data.units[key] = { stars: 1, exclusive_fragments: 0 }; return rows(); }
      if (sql.includes('UPDATE cdp_hero_units')) { data.units[key].exclusive_fragments += amount; return rows(); }
      if (sql.includes('SELECT balance FROM cdp_diamond_wallets')) return rows([{ balance: data.wallets[account] }]);
      if (sql.includes('UPDATE cdp_diamond_wallets')) {
        if (data.wallets[account] < value) return rows();
        data.wallets[account] -= value; return rows([{ balance: data.wallets[account] }]);
      }
      if (sql.includes('INSERT INTO cdp_hero_point_exchanges')) {
        if (failReceipt) throw new Error('receipt unavailable');
        assert.ok(!data.exchanges[key]); data.exchanges[key] = { unit_id: amount, result_data: JSON.parse(args[6]) }; return rows();
      }
      if (sql.includes('INSERT INTO cdp_hero_gacha_requests')) {
        if (failReceipt) throw new Error('receipt unavailable');
        assert.ok(!data.draws[key]); data.draws[key] = JSON.parse(args[5]); return rows();
      }
      if (sql.includes('INSERT INTO cdp_diamond_ledger')) { data.ledger.push(args); return rows(); }
      assert.fail(`Unexpected query: ${sql}`);
    } };
  }
  return { data, client, failReceipt: (value) => { failReceipt = value; } };
}

const exchange = (s, unit = 'shen-biesan', request = 'request') => storage.exchangeHeroPointsFromClient(s.client(), 'account', unit, request);
const draw = (s, count, request = 'request') => storage.pullHeroGachaFromClient(s.client(), 'account', count, request);

test('free single, paid single, ten and hundred draws grant exactly one point per result', async () => {
  for (const count of [1, 10, 100]) {
    const s = store(0);
    const result = await draw(s, count);
    assert.equal(result.pointsAwarded, count);
    assert.equal(result.gachaPoints, count);
    assert.equal(result.results.length, count);
    assert.equal(result.price, count === 1 ? 0 : count === 10 ? 2700 : 27000);
    assert.equal(s.data.wallets.account, 100000 - result.price);
    const before = structuredClone(s.data);
    assert.equal((await draw(s, count)).repeated, true);
    assert.deepEqual(s.data, before);
  }
  const s = store(0);
  s.data.profiles.account.free_pull_used_at = new Date().toISOString();
  assert.equal((await draw(s, 1)).price, 300);
  assert.equal(s.data.profiles.account.gacha_points, 1);
});

test('exchange debits 1000 and grants a one-star SSR, with no gacha or pity changes', async () => {
  const s = store(1020);
  s.data.profiles.account.non_hero_pity_count = 12;
  s.data.profiles.account.non_ssr_pity_count = 110;
  const result = await exchange(s);
  assert.equal(result.gachaPoints, 20);
  assert.equal(result.conversion.type, 'new');
  assert.equal(s.data.units['account:shen-biesan'].stars, 1);
  assert.equal(s.data.profiles.account.non_hero_pity_count, 12);
  assert.equal(s.data.profiles.account.non_ssr_pity_count, 110);
  assert.equal(s.data.profiles.account.first_pull_completed, false);
  assert.deepEqual(s.data.draws, {});
  assert.equal(s.data.wallets.account, 100000);
  const before = structuredClone(s.data);
  assert.equal((await exchange(s)).repeated, true);
  assert.deepEqual(s.data, before);
  await assert.rejects(exchange(s, 'shen-jiangwen'), /其他英雄/);
});

test('SSR duplicates use existing fragments, including max-star conversion', async () => {
  for (const stars of [1, 4, 5]) {
    const s = store();
    s.data.units['account:shen-biesan'] = { stars, exclusive_fragments: 7 };
    const result = await exchange(s);
    assert.equal(result.conversion.amount, stars === 5 ? 200 : 40);
    assert.equal(s.data.units['account:shen-biesan'].exclusive_fragments, stars === 5 ? 7 : 47);
    assert.equal(s.data.profiles.account.universal_fragments, stars === 5 ? 200 : 0);
  }
});

test('server rejects insufficient points, non-SSR, missing request id and locked advancement without spending', async () => {
  const s = store(999);
  const before = structuredClone(s.data);
  await assert.rejects(exchange(s), /积分不足/);
  await assert.rejects(exchange(s, 'jiang-zha'), /请选择 SSR/);
  await assert.rejects(exchange(s, 'unknown'), /请选择 SSR/);
  await assert.rejects(exchange(s, 'shen-biesan', ''), /请求编号/);
  await assert.rejects(exchange(s, 'jie-jiangzha'), /进阶/);
  assert.deepEqual(s.data, before);
  s.data.profiles.account.gacha_points = 1000;
  s.data.unlocked['account:jiang-zha'] = true;
  assert.equal((await exchange(s, 'jie-jiangzha')).conversion.type, 'new');
});

test('failed receipts roll back points, diamonds, ownership and fragments together', async () => {
  for (const action of [(s) => exchange(s), (s) => draw(s, 10)]) {
    const s = store(); const before = structuredClone(s.data);
    s.failReceipt(true);
    await assert.rejects(action(s), /receipt unavailable/);
    assert.deepEqual(s.data, before);
    s.failReceipt(false);
    await action(s);
  }
});

test('concurrent repeats grant once; distinct exchanges cannot overdraw; draw and exchange share one account lock', async () => {
  const s = store();
  const repeated = await Promise.all([exchange(s), exchange(s)]);
  assert.equal(repeated.filter((r) => r.repeated).length, 1);
  assert.equal(s.data.profiles.account.gacha_points, 0);
  assert.equal(s.data.units['account:shen-biesan'].exclusive_fragments, 0);
  const other = store();
  const distinct = await Promise.allSettled([exchange(other), exchange(other, 'shen-jiangwen', 'second')]);
  assert.equal(distinct.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(other.data.profiles.account.gacha_points, 0);
  const mixed = store();
  await Promise.all([draw(mixed, 10), exchange(mixed)]);
  assert.equal(mixed.data.profiles.account.gacha_points, 10);
  assert.equal(Object.keys(mixed.data.exchanges).length, 1);
  assert.equal(Object.keys(mixed.data.draws).length, 1);
});

test('migration backfills all recorded draw counts and protects nonnegative balances and account-scoped receipts', async () => {
  const migration = await readFile(new URL('../db/migrations/048_hero_gacha_points.sql', import.meta.url), 'utf8');
  assert.match(migration, /sum\(pull_count\)::bigint/);
  assert.match(migration, /GROUP BY account_id/);
  assert.match(migration, /CHECK \(gacha_points >= 0\)/);
  assert.match(migration, /PRIMARY KEY \(account_id, request_id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /price\s*[>=]/);
});
