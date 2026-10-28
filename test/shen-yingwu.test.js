import test from 'node:test';
import assert from 'node:assert/strict';
import { createJudgmentSession, submitJudgment, advanceJudgments, judgmentSnapshot, applyJudgmentOutcomes } from '../shen-yingwu.js';
import { createBattleHeroSnapshot, unitProductionRate, drawHomeUnit, SSR_HERO_UNITS } from '../hero-home.js';
import { attachDiamondRewards, calculateGameDiamondReward } from '../diamond-rewards.js';
import { buildGameRecord } from '../game-history.js';
import { __judgmentTesting as game } from '../server.js';

const at = Date.parse('2026-10-28T01:00:00Z');
function fixture(n = 5, stars = 1) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, accountId: `account${i}`, profileId: `profile${i}`, name: `玩家${i}`, test: false, hand: [], nextRoundEntered: false }));
  players[0].battleHeroSnapshot = createBattleHeroSnapshot('shen-yingwu', stars);
  return { id: 'COURT', gameRecordId: 'game-1', stage: 'finished', status: 'lobby', gameMode: 'pvp', playMode: 'brawl', players,
    events: [], spectators: new Map(), clients: new Set(), setup: {}, kitty: [], removedCards: [], trickHistory: [],
    result: { winnerTeam: 'idle', finishedAt: new Date(at).toISOString(), playerCount: n,
      playerResults: players.map((p, i) => ({ playerId: p.id, name: p.name, role: i === 0 ? '庄家' : '闲家',
        team: i === 0 ? 'banker' : 'idle', baseGameScore: i === 0 ? -10 : 10, gameScore: i === 0 ? -10 : 10,
        heroScoreDelta: 0, evaluationTags: [], trickScore: 0 })) } };
}
function start(room, target = 'p1') {
  const session = createJudgmentSession(room, at);
  assert.ok(session);
  assert.equal(submitJudgment(session, 'p0', { trialId: session.trials[0].id, action: 'target', targetPlayerId: target }, at + 1000).ok, true);
  return session;
}
const vote = (session, id, choice, time = at + 2000, index = 0) => submitJudgment(session, id, { trialId: session.trials[index].id, action: 'vote', choice }, time);

test('new SSR has normal production and an independent frozen battle snapshot', () => {
  const snapshot = createBattleHeroSnapshot('shen-yingwu', 5);
  assert.equal(snapshot.name, '神 · 鹦鹉');
  assert.equal(snapshot.skillName, '战犯审判');
  assert.equal(snapshot.stars, 5);
  assert.equal(unitProductionRate('shen-yingwu', 5), 80);
  const pool = SSR_HERO_UNITS.filter(unit => !unit.advancementFrom);
  const index = pool.findIndex(unit => unit.id === 'shen-yingwu');
  assert.equal(drawHomeUnit({ forceRarity: 'ssr', randomFloat: () => (index + 0.5) / pool.length }).id, 'shen-yingwu');
});

test('only distinct logged-in PVP humans on the losing team can initiate', () => {
  for (const mutate of [r => r.gameMode = 'pve', r => r.players[1].test = true,
    r => r.players[1].accountId = null, r => r.players[1].accountId = r.players[0].accountId,
    r => r.result.winnerTeam = null, r => r.result.playerResults[0].team = 'idle']) {
    const room = fixture(); mutate(room); assert.equal(createJudgmentSession(room, at), null);
  }
  const room = fixture(); room.result.playerResults[0].gameScore = 2;
  assert.ok(createJudgmentSession(room, at), 'team defeat, rather than personal negative score, gates initiation');
});

test('exactly half passes but a support/opposition tie pays no voting bonus', () => {
  const room = fixture(4); const session = start(room);
  assert.equal(vote(session, 'p2', 'support').ok, true);
  assert.equal(vote(session, 'p3', 'oppose').ok, true);
  applyJudgmentOutcomes(room.result, session);
  assert.equal(session.complete, true);
  assert.equal(session.trials[0].passed, true);
  assert.equal(room.result.playerResults[0].gameScore, -8);
  assert.equal(room.result.playerResults[0].baseGameScore, -10);
  assert.equal(room.result.playerResults[0].judgmentReward.amount, 100);
  assert.equal(room.result.playerResults[2].judgmentReward, undefined);
  assert.equal(room.result.winnerTeam, 'idle');
});

test('abstentions stay in the denominator and timeout at exactly 30 seconds rejects late votes', () => {
  const room = fixture(); const session = start(room);
  assert.equal(Date.parse(session.trials[0].deadlineAt), at + 31000);
  vote(session, 'p2', 'support');
  assert.equal(vote(session, 'p3', 'support', at + 31000).status, 409);
  applyJudgmentOutcomes(room.result, session);
  assert.equal(session.trials[0].passed, false);
  assert.equal(session.trials[0].abstainCount, 2);
  assert.equal(room.result.playerResults[0].gameScore, -10);
  assert.equal(room.result.playerResults[2].judgmentReward.amount, 30, 'larger voting side is paid even if judgment fails');
});

test('opposing majority wins the fixed voting bonus; abstainers receive nothing', () => {
  const room = fixture(); const session = start(room);
  vote(session, 'p2', 'oppose'); vote(session, 'p3', 'oppose'); vote(session, 'p4', 'abstain');
  applyJudgmentOutcomes(room.result, session);
  assert.equal(session.trials[0].passed, false);
  assert.equal(room.result.playerResults[2].judgmentReward.amount, 30);
  assert.equal(room.result.playerResults[3].judgmentReward.amount, 30);
  assert.equal(room.result.playerResults[4].judgmentReward, undefined);
});

test('all five star rates and diamond amounts use the original loss, with cents rounding and no positive conversion', () => {
  for (const [i, expected] of [100,120,140,160,200].entries()) {
    const room = fixture(4, i + 1); room.result.playerResults[0].gameScore = -1.23;
    const session = start(room); vote(session, 'p2', 'support'); vote(session, 'p3', 'support');
    applyJudgmentOutcomes(room.result, session);
    assert.equal(room.result.playerResults[0].judgmentReward.amount, expected);
    assert.equal(room.result.playerResults[0].gameScore, Math.round((-1.23 + Math.round(1.23 * [0.2,0.3,0.4,0.5,0.6][i] * 100) / 100) * 100) / 100);
    assert.ok(room.result.playerResults[0].gameScore < 0);
  }
  const room = fixture(4); room.result.playerResults[0].gameScore = 2;
  const session = start(room); vote(session, 'p2', 'support'); vote(session, 'p3', 'support'); applyJudgmentOutcomes(room.result, session);
  assert.equal(room.result.playerResults[0].gameScore, 2);
});

test('authorization, target validation, vote immutability, replay protection and private unfinished votes', () => {
  const room = fixture(); const session = createJudgmentSession(room, at); const trialId = session.trials[0].id;
  assert.equal(submitJudgment(session, 'p2', { trialId, action: 'target', targetPlayerId: 'p1' }, at).status, 403);
  for (const targetPlayerId of ['p0', 'outsider']) assert.equal(submitJudgment(session, 'p0', { trialId, action: 'target', targetPlayerId }, at).status, 400);
  submitJudgment(session, 'p0', { trialId, action: 'target', targetPlayerId: 'p1' }, at);
  for (const id of ['p0','p1','outsider']) assert.equal(vote(session, id, 'support').status, 403);
  assert.equal(vote(session, 'p2', 'invalid').status, 400);
  vote(session, 'p2', 'support'); assert.equal(vote(session, 'p2', 'support').ok, true);
  assert.equal(vote(session, 'p2', 'oppose').status, 409);
  assert.equal(judgmentSnapshot(session, 'p3').trials[0].viewerVote, null);
  assert.equal(judgmentSnapshot(session, null).trials[0].canVote, false);
  assert.equal(judgmentSnapshot(session, 'p3').trials[0].supportCount, undefined);
  assert.equal(submitJudgment(session, 'p0', { trialId, action: 'target', targetPlayerId: 'p3' }, at + 2000).status, 409);
  vote(session, 'p3', 'support'); vote(session, 'p4', 'support');
  applyJudgmentOutcomes(room.result, session);
  const before = JSON.stringify(room.result);
  applyJudgmentOutcomes(room.result, session); vote(session, 'p2', 'support'); applyJudgmentOutcomes(room.result, session);
  assert.equal(JSON.stringify(room.result), before);
});

test('selection expiry skips without blocking settlement; stars, roster and loss freeze before later edits', () => {
  const room = fixture(); const session = createJudgmentSession(room, at);
  room.players[0].battleHeroSnapshot.stars = 5;
  room.players.push({id:'late',name:'迟到玩家'});
  assert.equal(session.participants.length, 5);
  assert.equal(session.trials[0].successDiamonds, 100);
  advanceJudgments(session, at + 20000);
  assert.equal(session.complete, true);
  assert.equal(session.trials[0].status, 'skipped');
});

test('multiple parrots have independent concurrent trials and only apply each outcome once', () => {
  const room = fixture(); room.players[1].battleHeroSnapshot = createBattleHeroSnapshot('shen-yingwu', 5);
  room.result.playerResults[1].team = 'banker'; room.result.playerResults[1].gameScore = -10;
  const session = start(room);
  submitJudgment(session, 'p1', { trialId: session.trials[1].id, action: 'target', targetPlayerId:'p0' }, at + 1000);
  for (let index = 0; index < 2; index++) for (const id of ['p2','p3','p4']) vote(session,id,'support',at+2000,index);
  applyJudgmentOutcomes(room.result,session);
  assert.equal(session.complete,true);
  assert.equal(room.result.playerResults[0].gameScore,-8);
  assert.equal(room.result.playerResults[1].gameScore,-4);
  assert.equal(room.result.playerResults[2].judgmentReward.amount,60);
});

test('judgment diamonds are exact and do not inherit idle multiplier or change other hero rewards', () => {
  const reward = calculateGameDiamondReward({gameMode:'pvp',playMode:'brawl',team:'idle',heroSkillReward:{amount:20},judgmentReward:{amount:130}});
  assert.equal(reward.baseAmount,150); assert.equal(reward.heroBonus,30); assert.equal(reward.judgmentBonus,130); assert.equal(reward.totalAmount,310);
  assert.equal(calculateGameDiamondReward({gameMode:'pve',team:'idle',winnerTeam:'idle',judgmentReward:{amount:130}}).judgmentBonus,undefined);
});

test('server preserves final roster through departures, prevents premature persistence and finalizes exactly once', t => {
  const room = fixture(4); attachDiamondRewards(room);
  assert.equal(game.beginRoomJudgment(room, at),true);
  const ctx=room.judgmentContext; t.after(()=>clearTimeout(ctx.timer));
  assert.throws(()=>buildGameRecord(room),/审判尚未完成/);
  assert.equal(game.finalizeNextRoundLobby(room),false);
  const body={gameId:room.gameRecordId,trialId:ctx.session.trials[0].id,action:'target',targetPlayerId:'p1'};
  assert.equal(game.submitRoomJudgment(room,room.players[0],{...body,gameId:'stale'},at+1000).status,409);
  assert.equal(game.submitRoomJudgment(room,room.players[0],body,at+1000).ok,true);
  assert.equal(game.beginRoomJudgment(room,at),true);
  game.submitRoomJudgment(room,room.players[2],{...body,action:'vote',choice:'support'},at+2000);
  room.players.pop(); // A departure remains part of the frozen denominator and saved account roster.
  game.advanceRoomJudgment(ctx,at+31000);
  assert.equal(ctx.settled,true);
  const record=buildGameRecord(ctx.recordRoom);
  assert.equal(record.players.length,4);
  assert.equal(record.players[0].baseGameScore,-10);
  assert.equal(record.players[0].gameScore,-8);
  assert.equal(record.players[0].won,false);
  assert.equal(record.players[2].diamondReward.judgmentBonus,30);
  const before=JSON.stringify(record);
  game.advanceRoomJudgment(ctx,at+99999);
  assert.equal(JSON.stringify(buildGameRecord(ctx.recordRoom)),before);
});

test('late persistence cannot change next-game rewards but still updates the frozen judgment result', () => {
  const room = fixture();
  attachDiamondRewards(room);
  const recordRoom = { ...room, result: structuredClone(room.result) };
  room.gameRecordId = 'game-2';
  const persistence = { status: 'saved', diamondRewards: [{ accountId: 'account0',
    status: 'awarded', awardedAmount: 100, balanceAfter: 500 }] };
  game.applyFinishedGamePersistence(room, room, 'game-1', persistence);
  assert.equal(room.result.playerResults[0].diamondReward.status, 'pending');
  game.applyFinishedGamePersistence(recordRoom, room, 'game-1', persistence);
  assert.equal(recordRoom.result.playerResults[0].diamondReward.status, 'awarded');
  assert.equal(recordRoom.result.playerResults[0].diamondReward.balanceAfter, 500);
  assert.equal(room.result.playerResults[0].diamondReward.status, 'pending');
});
