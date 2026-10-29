import test from 'node:test';
import assert from 'node:assert/strict';
import { countLeadLosses, canTransferLead } from '../hero-lead-control.js';
import { createBattleHeroSnapshot, calculateHeroSkillReward } from '../hero-home.js';
import { __heroLeadTesting as game } from '../server.js';
import { buildGameRecord } from '../game-history.js';
import { allocateBankerTeamScores, draggedFiveReductionTransfers } from '../banker-score-mode.js';
import { applyHeroBoardScoreAdjustments } from '../shop-and-items.js';

const card = (id, rank = 'K', suit = 'C') => ({ id, type: 'normal', rank, suit, label: `${suit}${rank}`, color: ['H','D'].includes(suit) ? 'red' : 'black' });
function makeRoom(heroId = 'shen-jiangwen', stars = 5) {
  const players = ['banker','hero','other','p4','p5'].map((id) => ({ id, name: id, accountId: id, test: false, hand: [card(`${id}-a`),card(`${id}-b`, '9')], score: 0 }));
  players[1].battleHeroSnapshot = createBattleHeroSnapshot(heroId, stars);
  return { id: 'LEAD', gameRecordId: 'game', status: 'dealt', stage: 'playing', gameMode: 'pvp', playMode: 'brawl',
    players, bankerId: 'banker', trumpSuit: 'H', doglegMode: 'traditional', doglegNeeded: 2, doglegPlayerIds: ['hero'], doglegCard: card('dogleg', 'A', 'S'),
    kitty: [], kittySize: 0, setup: game.emptySetup(), boardHeroSkills: game.emptyBoardHeroSkills(), boardHeroEffects: game.emptyBoardHeroEffects(),
    gameItems: { uses: [] }, heroRoundState: {}, ranchenRoleLocks: {}, events: [], trickHistory: [], settledTrickHistory: [], provisionalWinnerPlayerIds: [], spectators: new Map(),
    currentTrick: { number: 1, leaderId: 'hero', plays: [] } };
}
function wonRound(r) { r.trickHistory.push({ number: 1, leaderId: 'banker', winnerId: 'hero', plays: [], points: 0 }); r.currentTrick.number = 2; }

test('Jiangwen cannot transfer opening lead or a lead before actually winning a completed trick', () => {
  const r = makeRoom(); const hero = r.players[1];
  r.bankerId = hero.id;
  assert.equal(game.shenJiangwenCanTransfer(r, hero), false);
  assert.equal(game.transferShenJiangwenLead(r, hero, 'other').status, 409);
  r.currentTrick.plays = [{ playerId: hero.id, cards: [card('played')] }];
  assert.equal(canTransferLead(r, hero.id), false);
  r.currentTrick.plays = []; wonRound(r);
  assert.equal(game.shenJiangwenCanTransfer(r, hero), true);
  r.currentTrick.leaderId = 'other';
  assert.equal(game.shenJiangwenCanTransfer(r, hero), false);
});

test('banker must lose and regain the lead, rather than retain it through consecutive wins', () => {
  const r = makeRoom(); const hero = r.players[1];
  r.bankerId = hero.id;
  // Enough cards to exercise several real rounds without triggering final-follow.
  for (const player of r.players) {
    player.hand = Array.from({ length: 6 }, (_, i) => card(`${player.id}-${i}`, '4'));
  }
  function playRound(winnerId) {
    const start = r.players.findIndex((player) => player.id === r.currentTrick.leaderId);
    for (let i = 0; i < r.players.length; i++) {
      const player = r.players[(start + i) % r.players.length];
      const played = player.hand[0];
      Object.assign(played, card(played.id, player.id === winnerId ? 'A' : '4'));
      assert.equal(game.playCards(r, player, [played.id]).ok, true);
    }
    assert.equal(r.trickHistory.at(-1).winnerId, winnerId);
    assert.equal(r.currentTrick.leaderId, winnerId);
  }
  function assertBlocked() {
    const leaderBefore = r.currentTrick.leaderId;
    assert.equal(game.shenJiangwenCanTransfer(r, hero), false);
    assert.equal(game.boardHeroSkillsSnapshot(r, hero).shenJiangwen.canActivate, false);
    assert.equal(game.transferShenJiangwenLead(r, hero, 'other').status, 409);
    assert.equal(r.currentTrick.leaderId, leaderBefore);
    assert.equal(r.boardHeroEffects.uses.length, 0);
  }
  assertBlocked();
  playRound(hero.id); assertBlocked();
  playRound(hero.id); assertBlocked();
  playRound('other'); assertBlocked();
  playRound(hero.id);
  assert.equal(game.shenJiangwenCanTransfer(r, hero), true);
  assert.equal(game.boardHeroSkillsSnapshot(r, hero).shenJiangwen.canActivate, true);
  // Eligibility remains available when the acquired lead is subsequently retained.
  playRound(hero.id);
  assert.equal(game.transferShenJiangwenLead(r, hero, 'other').ok, true);
  assert.equal(r.currentTrick.leaderId, 'other');
  assert.equal(r.boardHeroEffects.uses.length, 1);
});

test('temporary following wins and history without a leader do not establish acquired lead', () => {
  const r = makeRoom(); const hero = r.players[1];
  r.bankerId = hero.id;
  r.trickHistory = [{ number: 1, winnerId: hero.id }];
  assert.equal(canTransferLead(r, hero.id), false);
  r.currentTrick = { number: 2, leaderId: 'other', winnerId: hero.id,
    plays: [{ playerId: 'other', cards: [card('lead', '4')] },
      { playerId: hero.id, cards: [card('follow', 'A')] }] };
  assert.equal(game.shenJiangwenCanTransfer(r, hero), false);
  // Only completed history counts, even if the next lead has been set prematurely.
  r.currentTrick = { number: 3, leaderId: hero.id, plays: [] };
  assert.equal(game.shenJiangwenCanTransfer(r, hero), false);
});

test('transfer validates hero, target and turn, changes only the next lead, and cannot repeat', () => {
  const r = makeRoom(); const hero = r.players[1]; wonRound(r);
  for (const target of ['hero','missing',null]) assert.equal(game.transferShenJiangwenLead(r, hero, target).status, 400);
  assert.equal(game.transferShenJiangwenLead(r, r.players[2], 'hero').status, 409);
  const before = r.players.map((p) => p.hand.map((c) => c.id));
  const setupBefore = JSON.stringify(r.setup); const historyBefore = JSON.stringify(r.trickHistory);
  assert.equal(game.transferShenJiangwenLead(r, hero, 'other').ok, true);
  assert.equal(r.currentTrick.leaderId, 'other'); assert.deepEqual(r.currentTrick.plays, []);
  assert.deepEqual(r.players.map((p) => p.hand.map((c) => c.id)), before);
  assert.equal(JSON.stringify(r.setup), setupBefore); assert.equal(JSON.stringify(r.trickHistory), historyBefore);
  assert.equal(game.playCards(r, hero, [hero.hand[0].id]).status, 409);
  const other = r.players[2]; assert.equal(game.playCards(r, other, [other.hand[0].id]).ok, true);
  assert.equal(r.currentTrick.plays[0].playerId, 'other');
  r.currentTrick = { number: 3, leaderId: hero.id, plays: [] };
  assert.equal(game.transferShenJiangwenLead(r, hero, 'banker').status, 409);
  assert.equal(r.boardHeroEffects.uses.length, 1);
  assert.equal(countLeadLosses(r.trickHistory, r.boardHeroEffects.uses, hero.id), 1);
});

test('no invalid game, spectator, paused trick or different hero can transfer', () => {
  for (const change of [r => { r.players[2].test = true; }, r => { r.players[2].accountId = null; }, r => { r.players[2].accountId = r.players[1].accountId; }, r => { r.stage = 'frying'; }, r => { r.playPauseUntil = new Date(Date.now()+30000).toISOString(); }, r => { r.players[1].battleHeroSnapshot = createBattleHeroSnapshot('shen-gelu'); }]) {
    const r = makeRoom(); wonRound(r); change(r);
    assert.equal(game.shenJiangwenCanTransfer(r, r.players[1]), false);
  }
  const r = makeRoom(); wonRound(r);
  assert.equal(game.shenJiangwenCanTransfer(r, null), false);
  r.players[2].hand = [];
  assert.equal(game.transferShenJiangwenLead(r, r.players[1], 'other').status, 400);
});

test('lead loss counts completed led losses plus voluntary transfers, never temporary wins or following losses', () => {
  const history = [
    { leaderId: 'p', winnerId: 'q' }, { leaderId: 'p', winnerId: 'p' },
    { leaderId: 'q', winnerId: 'q' }, { leaderId: 'p', winnerId: null }
  ];
  const uses = [{ playerId: 'p', heroId: 'shen-jiangwen', effect: { leadTransfer: true } },
    { playerId: 'q', heroId: 'shen-jiangwen', effect: { leadTransfer: true } },
    { playerId: 'p', heroId: 'shen-gelu', effect: { directFry: true } }];
  assert.equal(countLeadLosses(history, uses, 'p'), 2);
  assert.equal(countLeadLosses([], [], 'p'), 0);
});

test('Jiangwen rewards use original victory, frozen stars and five losses maximum', () => {
  for (let stars = 1; stars <= 5; stars++) for (const losses of [0,1,4,5,9]) {
    const reward = (baseGameScore) => calculateHeroSkillReward({ snapshot: createBattleHeroSnapshot('shen-jiangwen', stars), playerId: 'p', playerResult: { baseGameScore, gameScore: 99 }, shenJiangwenLeadLosses: losses });
    const n = Math.min(losses,5); const r = reward(1);
    assert.equal(r.matchedCount,n); assert.equal(r.cap,5);
    assert.equal(r.amount,n*[10,12,15,20,25][stars-1]);
    assert.equal(r.scoreBonus,Math.round(n*[0.1,0.12,0.15,0.2,0.25][stars-1]*100)/100);
    for (const score of [0,-1]) { assert.equal(reward(score).amount,0); assert.equal(reward(score).scoreBonus,0); }
  }
});

test('Gelu inherits the first-offer-only free fry; Jiangwen no longer gets the old window', async () => {
  const r = makeRoom('shen-gelu'); const hero = r.players[1];
  r.stage = 'frying'; r.setup.fry = { currentPlayerId: hero.id, skillHistory: [], history: [], lastBid: { count: 4, suit: 'S' } }; r.kitty = [card('kitty')];
  const before = JSON.stringify(r.setup.fry.lastBid);
  assert.equal(game.shenGeluCanActivate(r, hero), true);
  let charges = 0;
  const result = await game.activateShenGeluSkill(r,hero,'request',false,async (room, account, gameId, heroId) => {
    charges++; assert.equal(heroId,'shen-gelu'); return { cost:0,cooldownBefore:0,cooldownAfter:0 };
  });
  assert.equal(result.ok,true); assert.equal(charges,1); assert.equal(r.stage,'fry-burying');
  assert.equal(r.kitty.length,0); assert.equal(hero.hand.length,3); assert.equal(r.setup.fry.history.length,0);
  assert.equal(r.setup.fry.skillHistory[0].heroId,'shen-gelu'); assert.equal(JSON.stringify(r.setup.fry.lastBid),before);
  r.stage='frying'; assert.equal(game.shenGeluCanActivate(r,hero),false);
  const passed=makeRoom('shen-gelu'); passed.stage='frying'; passed.setup.fry={currentPlayerId:'hero'};
  game.completeShenGeluOffer(passed,passed.players[1]); assert.equal(game.shenGeluCanActivate(passed,passed.players[1]),false);
  const old=makeRoom(); old.stage='frying'; old.setup.fry={currentPlayerId:'hero'};
  assert.equal(game.shenGeluCanActivate(old,old.players[1]),false);
});

function scoreCase({team='banker', mode='banker-remainder', idleCount=3, doglegCount=1, reduction=2}={}) {
  const raw = allocateBankerTeamScores({ idleEachScore: 7, idleCount, doglegCount, mode });
  const players = [{ playerId:'banker',team:'banker',gameScore:raw.bankerScore },...Array.from({length:doglegCount},(_,i)=>({playerId:`d${i}`,team:'banker',gameScore:raw.doglegEachScore})),...Array.from({length:idleCount},(_,i)=>({playerId:`i${i}`,team:'idle',gameScore:7}))];
  const owner = players.find((p)=>p.team===team);
  owner.heroSkillReward = { hero:{heroId:'shen-haohao'},scoreBonus:reduction };
  const transfers = draggedFiveReductionTransfers(players,{idleEachScore:7,bankerId:'banker',mode});
  const actual = applyHeroBoardScoreAdjustments(players,{teamTransfers:transfers}).playerResults;
  const expectedIdle=7+(team==='idle'?reduction:-reduction);
  const expected=allocateBankerTeamScores({idleEachScore:expectedIdle,idleCount,doglegCount,mode});
  actual.forEach((p)=>assert.equal(p.gameScore,p.team==='idle'?expectedIdle:p.playerId==='banker'?expected.bankerScore:expected.doglegEachScore));
  return actual;
}

test('Haohao reduction restores the actual per-idle-player penalty and banker allocation, including uneven teams',()=>{
  for(const team of ['idle','banker']) for(const mode of ['banker-remainder','team-average']) for(const [idleCount,doglegCount] of [[3,1],[2,2],[4,2],[3,2]]) scoreCase({team,mode,idleCount,doglegCount});
  const result=scoreCase();
  assert.deepEqual(result.map(p=>p.heroScoreDelta),[4,2,-2,-2,-2]);
});

test('Haohao multiple owners settle sequentially against the same role allocation',()=>{
  const r=makeRoom('shen-haohao',1); r.players[0].battleHeroSnapshot=createBattleHeroSnapshot('shen-haohao',1);
  r.players[3].battleHeroSnapshot=createBattleHeroSnapshot('shen-haohao',1);
  // Each actor owns a separate drag; no card may qualify for two reductions.
  r.trickHistory=[{number:1,leaderId:'hero',winnerId:'hero',points:10,plays:[{playerId:'hero',cards:[card('h','5','H')]},{playerId:'banker',cards:[card('b','5','D')]}]},
    {number:2,leaderId:'banker',winnerId:'banker',points:10,plays:[{playerId:'banker',cards:[card('b2','5','H')]},{playerId:'hero',cards:[card('h2','5','D')]}]},
    {number:3,leaderId:'p4',winnerId:'p4',points:10,plays:[{playerId:'p4',cards:[card('p4','5','H')]},{playerId:'p5',cards:[card('p5','5','D')]}]}];
  r.players[0].draggedDiamondFives=1;r.players[1].draggedDiamondFives=1;r.players[4].draggedDiamondFives=1;
  game.finishGame(r,r.trickHistory.at(-1));
  const delta=r.result.playerResults.map(p=>p.heroScoreDelta);
  assert.deepEqual(delta,[2,1,-1,-1,-1]);
  assert.equal(r.result.heroScoreAdjustments.length,15);
});

test('final settlement awards Jiangwen and Doudou from recorded transfer, keeps original results and saves progress without bottom points',()=>{
  const r=makeRoom();const hero=r.players[1];r.players[2].battleHeroSnapshot=createBattleHeroSnapshot('jie-doudou',1);
  wonRound(r);game.transferShenJiangwenLead(r,hero,'other');
  r.trickHistory.push({number:2,leaderId:'other',winnerId:'hero',points:25,plays:r.players.map(p=>({playerId:p.id,cards:[p.hand[0]]}))});
  r.players[1].score=25;r.kitty=[card('bottom','K')];
  game.finishGame(r,r.trickHistory.at(-1));
  const result=r.result.playerResults.find(p=>p.playerId==='hero');
  assert.equal(result.heroSkillReward.amount,25);assert.equal(result.heroScoreDelta,0.25);assert.equal(result.gameScore,Math.round((result.baseGameScore+0.25)*100)/100);
  assert.equal(r.result.playerResults.find(p=>p.playerId==='other').heroSkillReward.amount,30);
  const record=buildGameRecord(r);assert.equal(record.players.find(p=>p.roomPlayerId==='hero').wonTrickPoints,25);
  const original=r.result;game.finishGame(r,r.trickHistory.at(-1));assert.equal(r.result,original);
});
