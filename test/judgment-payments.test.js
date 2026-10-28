import test from 'node:test';
import assert from 'node:assert/strict';
import { chargeJudgmentEntryFromClient, refundSuccessfulJudgmentEntries } from '../judgment-payments.js';
import { createJudgmentSession, beginJudgmentTarget, finishJudgmentTarget, advanceJudgments, judgmentSnapshot } from '../shen-yingwu.js';
import { createBattleHeroSnapshot } from '../hero-home.js';
import { __judgmentTesting as game } from '../server.js';

function walletStore(balance = 300) {
  const wallets = new Map([['account0', balance]]), ledger = new Map(), statements = [];
  return { wallets, ledger, statements, async query(sql, args = []) {
    statements.push(sql);
    if (sql.startsWith('INSERT INTO cdp_diamond_wallets')) { if (!wallets.has(args[0])) wallets.set(args[0], 0); }
    else if (sql.startsWith('SELECT balance FROM cdp_diamond_wallets')) return { rows: wallets.has(args[0]) ? [{ balance: wallets.get(args[0]) }] : [] };
    else if (sql.includes('FROM cdp_diamond_ledger')) return { rows: ledger.has(args[0]) ? [ledger.get(args[0])] : [] };
    else if (sql.startsWith('UPDATE cdp_diamond_wallets')) {
      const [account, amount] = args, value = wallets.get(account);
      if (value == null || (sql.includes('balance - $2') && value < amount)) return { rows: [] };
      wallets.set(account, value + (sql.includes('balance - $2') ? -amount : amount));
      assert.doesNotMatch(sql, /lifetime_earned/, 'principal never counts as earned diamonds');
      return { rows: [{ balance: wallets.get(account) }] };
    } else if (sql.startsWith('INSERT INTO cdp_diamond_ledger')) {
      const isRefund = sql.includes("'judgment_entry_refund'");
      const key = args[isRefund ? 5 : 4]; assert.equal(ledger.has(key), false);
      ledger.set(key, { amount: args[1], balance_after: args[2], detail: JSON.parse(args[isRefund ? 6 : 5]) });
    } else assert.fail(`Unexpected query ${sql}`);
    return { rows: [] };
  } };
}
const params = { accountId: 'account0', gameId: 'game', trialId: 'trial', targetPlayerId: 'p1' };
const record = (passed = true, entryFeePaid = 200) => ({ gameId: 'game', players: [{ accountId: 'account0', roomPlayerId: 'p0' }],
  result: { judgments: { trials: [{ id: 'trial', ownerId: 'p0', targetId: 'p1', passed, entryFeePaid }] } } });

test('entry costs 200 exactly once; a receipt cannot be reused for a different target', async () => {
  const store = walletStore();
  assert.deepEqual(await chargeJudgmentEntryFromClient(store, params), { cost: 200, balanceAfter: 100 });
  assert.equal((await chargeJudgmentEntryFromClient(store, params)).repeated, true);
  assert.equal(store.wallets.get('account0'), 100); assert.equal(store.ledger.size, 1);
  await assert.rejects(chargeJudgmentEntryFromClient(store, { ...params, targetPlayerId: 'p2' }), /另一场审判/);
  assert.match(store.statements[1], /FOR UPDATE/, 'wallet lock precedes receipt lookup');
});

test('insufficient balance produces neither a negative wallet nor a payment receipt', async () => {
  const store = walletStore(199);
  await assert.rejects(chargeJudgmentEntryFromClient(store, params), /余额不足/);
  assert.equal(store.wallets.get('account0'), 199); assert.equal(store.ledger.size, 0);
});

test('successful trial refunds principal once separately from rewards; failure retains the fee', async () => {
  for (const passed of [true, false]) {
    const store = walletStore(); await chargeJudgmentEntryFromClient(store, params);
    await refundSuccessfulJudgmentEntries(store, record(passed));
    await refundSuccessfulJudgmentEntries(store, record(passed));
    assert.equal(store.wallets.get('account0'), passed ? 300 : 100);
    assert.equal(store.ledger.size, passed ? 2 : 1);
  }
  const store = walletStore(); await chargeJudgmentEntryFromClient(store, params);
  await refundSuccessfulJudgmentEntries(store, record(true, 0));
  assert.equal(store.wallets.get('account0'), 100, 'unpaid trials cannot obtain a refund');
  await assert.rejects(refundSuccessfulJudgmentEntries(walletStore(), record()), /记录不匹配/);
});

function fixture() {
  const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, accountId: `account${i}`, name: `玩家${i}`, hand: [], test: false }));
  players[0].battleHeroSnapshot = createBattleHeroSnapshot('shen-yingwu', 1);
  return { id: 'FEE', gameRecordId: 'game', gameMode: 'pvp', stage: 'finished', status: 'lobby', players,
    result: { winnerTeam: 'idle', playerResults: players.map((p, i) => ({ playerId: p.id, team: i ? 'idle' : 'banker', gameScore: i ? 10 : -10 })) },
    events: [], clients: new Set(), spectators: new Map(), trickHistory: [], setup: {} };
}

test('a charge in flight cannot expire, be retargeted or accept a vote; voting gets a full 30 seconds', () => {
  const room = fixture(), session = createJudgmentSession(room, 1000), body = { trialId: session.trials[0].id, targetPlayerId: 'p1' };
  assert.equal(beginJudgmentTarget(session, 'p0', body, 2000).ok, true);
  advanceJudgments(session, 50000);
  assert.equal(session.complete, false); assert.equal(session.trials[0].status, 'charging');
  assert.equal(judgmentSnapshot(session, 'p0').trials[0].canChoose, false);
  assert.equal(judgmentSnapshot(session, 'p2').trials[0].canVote, false);
  assert.equal(beginJudgmentTarget(session, 'p0', { ...body, targetPlayerId: 'p2' }, 50000).status, 409);
  finishJudgmentTarget(session, body.trialId, { cost: 200 }, 50000);
  assert.equal(Date.parse(session.trials[0].deadlineAt), 80000);
  for (const id of ['p0', 'p1']) {
    const snapshot = judgmentSnapshot(session, id).trials[0];
    assert.equal(snapshot.targetName, '玩家1'); assert.equal(snapshot.ownerName, '玩家0'); assert.equal(snapshot.canVote, false);
  }
});

test('failed charge restores selection or skips on timeout, without any success refund', () => {
  for (const endAt of [3000, 50000]) {
    const session = createJudgmentSession(fixture(), 1000), body = { trialId: session.trials[0].id, targetPlayerId: 'p1' };
    beginJudgmentTarget(session, 'p0', body, 2000); finishJudgmentTarget(session, body.trialId, null, endAt);
    assert.equal(session.trials[0].entryFeePaid, 0);
    assert.equal(session.trials[0].status, endAt < 21000 ? 'choosing' : 'skipped');
  }
});

test('server checks authorization before charging and deduplicates simultaneous clicks', async t => {
  const room = fixture(), at = Date.now(); game.beginRoomJudgment(room, at);
  t.after(() => clearTimeout(room.judgmentContext.timer));
  const body = { gameId: 'game', trialId: room.judgmentContext.session.trials[0].id, action: 'target', targetPlayerId: 'p1' };
  let charges = 0, resolvePayment;
  const charge = () => { charges++; return new Promise(resolve => { resolvePayment = resolve; }); };
  assert.equal((await game.submitRoomJudgment(room, room.players[2], body, at, charge)).status, 403);
  const first = game.submitRoomJudgment(room, room.players[0], body, at, charge);
  assert.equal((await game.submitRoomJudgment(room, room.players[0], body, at, charge)).status, 409);
  assert.equal(charges, 1);
  resolvePayment({ cost: 200, balanceAfter: 100 }); await first;
  assert.equal((await game.submitRoomJudgment(room, room.players[0], body, at, charge)).repeated, true);
  assert.equal(charges, 1);
});

test('server keeps the choice available after insufficient balance and never starts voting', async t => {
  const room = fixture(), at = Date.now(); game.beginRoomJudgment(room, at);
  t.after(() => clearTimeout(room.judgmentContext.timer));
  const body = { gameId: 'game', trialId: room.judgmentContext.session.trials[0].id, action: 'target', targetPlayerId: 'p1' };
  const result = await game.submitRoomJudgment(room, room.players[0], body, at, async () => { throw Object.assign(new Error('余额不足'), { status: 409 }); });
  assert.equal(result.status, 409); assert.equal(room.judgmentContext.session.trials[0].status, 'choosing');
});
