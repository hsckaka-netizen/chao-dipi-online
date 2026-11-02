import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleHeroSnapshot, calculateHeroSkillReward, drawHomeUnit } from '../hero-home.js';
import { __kaxiangTesting as game, __heroLeadTesting as base } from '../server.js';
import { buildGameRecord } from '../game-history.js';
const card = (id, rank='4') => ({ id, type:'normal', rank, suit:'C', label:rank, color:'black' });
function room() {
  const players = ['a','b','c','d','e'].map(id => ({ id, name:id, accountId:id, hand:Array.from({length:4},(_,i)=>card(`${id}-${i}`)), score:0 }));
  players[1].battleHeroSnapshot=createBattleHeroSnapshot('shen-kaxiang',5);
  return { id:'KAXIANG', gameRecordId:'game', status:'dealt', stage:'playing', gameMode:'pvp', playMode:'brawl', players,
    bankerId:'a', trumpSuit:'H', doglegMode:'traditional', doglegNeeded:1, doglegPlayerIds:['b'], doglegCard:card('dogleg','A'),
    kitty:[], kittySize:0, setup:base.emptySetup(), boardHeroSkills:base.emptyBoardHeroSkills(), boardHeroEffects:base.emptyBoardHeroEffects(),
    gameItems:{uses:[]}, heroRoundState:{}, ranchenRoleLocks:{}, events:[], trickHistory:[], settledTrickHistory:[],
    provisionalWinnerPlayerIds:[], spectators:new Map(), currentTrick:{number:1,leaderId:'a',plays:[]} };
}
function play(r,id,rank='4') { const p=r.players.find(p=>p.id===id);p.hand[0].rank=rank;assert.equal(base.playCards(r,p,[p.hand[0].id]).ok,true); }

test('new regular SSR has frozen identity, no paid skill, and joins the ordinary SSR pool',()=>{
  const hero=createBattleHeroSnapshot('shen-kaxiang',3);
  assert.equal(hero.name,'神 · 卡翔');assert.equal(hero.stars,3);assert.equal(hero.skillName,'逆转未来');assert.equal(hero.paidSkill,undefined);
  assert.ok(Array.from({length:100},(_,i)=>drawHomeUnit({forceRarity:'ssr',randomFloat:()=>i/100}).id).includes('shen-kaxiang'));
});

test('reversal before first play preserves the leader, reverses every remaining seat, and resets next trick',()=>{
  const r=room();assert.equal(game.activateShenKaxiangSkill(r,r.players[1]).ok,true);
  assert.equal(game.expectedPlayerId(r),'a');assert.equal(r.currentTrick.direction,-1);
  for(const id of ['a','e','d','c','b']) { assert.equal(game.expectedPlayerId(r),id);play(r,id); }
  assert.deepEqual(r.trickHistory[0].plays.map(p=>p.playerId),['a','e','d','c','b']);
  assert.equal(r.currentTrick.direction || 1,1);assert.equal(game.expectedPlayerId(r),'a');
  assert.equal(game.activateShenKaxiangSkill(r,r.players[1]).status,409);
});

test('mid-trick reversal starts from the last played seat, skips prior actors and empty hands, and publishes actual order',()=>{
  const r=room();play(r,'a');play(r,'b');r.players[4].hand=[];
  assert.equal(game.expectedPlayerId(r),'c');assert.equal(game.activateShenKaxiangSkill(r,r.players[1]).ok,true);
  assert.equal(game.expectedPlayerId(r),'d');
  const snap=game.trickSnapshot(r,r.currentTrick,r.players[1]);
  assert.equal(snap.direction,-1);assert.equal(snap.currentTurnPlayerId,'d');
  assert.ok(snap.plays.find(p=>p.playerId==='a').turnIndex < snap.plays.find(p=>p.playerId==='b').turnIndex);
  assert.ok(snap.plays.find(p=>p.playerId==='d').turnIndex < snap.plays.find(p=>p.playerId==='c').turnIndex);
  assert.equal(base.playCards(r,r.players[2],[r.players[2].hand[0].id]).status,409);
  play(r,'d');assert.equal(game.expectedPlayerId(r),'c');play(r,'c');
  assert.deepEqual(r.currentTrick.plays.map(p=>p.playerId),['a','b','d','c']);
  const full=room();play(full,'a');play(full,'b');game.activateShenKaxiangSkill(full,full.players[1]);
  for(const id of ['e','d','c']) play(full,id);
  assert.deepEqual(full.trickHistory[0].plays.map(p=>p.playerId),['a','b','e','d','c']);
});

test('different Kaxiang players can reverse independently without replaying seats',()=>{
  const r=room();r.players[3].battleHeroSnapshot=createBattleHeroSnapshot('shen-kaxiang',1);
  play(r,'a');game.activateShenKaxiangSkill(r,r.players[1]);assert.equal(game.expectedPlayerId(r),'e');
  play(r,'e');game.activateShenKaxiangSkill(r,r.players[3]);assert.equal(game.expectedPlayerId(r),'b');
  play(r,'b');play(r,'c');play(r,'d');
  assert.deepEqual(r.trickHistory[0].plays.map(p=>p.playerId),['a','e','b','c','d']);
});

test('frying reversal preserves current player and clock, spans burying, and repeated passers cannot end early',()=>{
  const r=room();r.stage='frying';r.setup.fry={currentPlayerId:'c',lastFryerId:'a',lastBid:{count:2,suit:'H'},passIds:['b'],passesSinceLast:1,deadlineAt:new Date(Date.now()+10000).toISOString()};
  const deadline=r.setup.fry.deadlineAt;game.activateShenKaxiangSkill(r,r.players[1]);
  assert.equal(r.setup.fry.currentPlayerId,'c');assert.equal(r.setup.fry.deadlineAt,deadline);
  for(const id of ['c','b','a','e']) {assert.equal(r.setup.fry.currentPlayerId,id);assert.equal(game.passFry(r,r.players.find(p=>p.id===id)).ok,true);assert.equal(r.stage,'frying');}
  assert.equal(r.setup.fry.currentPlayerId,'d');
  assert.equal(game.passFry(r,r.players[3]).ok,true);assert.notEqual(r.stage,'frying');
  // Both normal and direct skill bury continue in the reversed direction.
  for(const direct of [false,true]) {
    const f=room();f.stage='fry-burying';f.setup.fry={direction:-1,pendingBid:{count:3,suit:'S'},directSkillPendingPlayerId:direct?'c':null,lastBid:{count:2,suit:'H'}};
    game.continueFryingAfterBury(f,f.players[2]);assert.equal(f.setup.fry.currentPlayerId,'b');assert.equal(f.setup.fry.direction,-1);
    assert.deepEqual(f.setup.fry.passIds,[]);
  }
  assert.equal(game.activateShenKaxiangSkill(r,r.players[1]).status,409);
});

test('skill rejects wrong identity, spectators, invalid games, paused tricks and non-action stages',()=>{
  for(const change of [r=>r.status='waiting',r=>r.stage='finished',r=>r.stage='fry-burying',r=>r.players[1].test=true,r=>r.players[2].accountId=null,r=>r.players[2].accountId='b',r=>r.playPauseUntil=new Date(Date.now()+5000).toISOString()]) {
    const r=room();change(r);assert.equal(game.activateShenKaxiangSkill(r,r.players[1]).status,409);assert.equal(r.boardHeroEffects.uses.length,0);
  }
  const r=room();assert.equal(game.activateShenKaxiangSkill(r,null).status,409);assert.equal(game.activateShenKaxiangSkill(r,r.players[0]).status,409);
});

test('passive awards once for a completed led trick won by a final teammate, independent of victory or activation',()=>{
  for(let stars=1;stars<=5;stars++) for(const score of [-5,0,5]) {
    const input={snapshot:createBattleHeroSnapshot('shen-kaxiang',stars),playerId:'b',playerResult:{team:'banker',baseGameScore:score},playerResults:[{playerId:'b',team:'banker'},{playerId:'a',team:'banker'},{playerId:'c',team:'idle'}]};
    const r=calculateHeroSkillReward({...input,trickHistory:[{leaderId:'b',winnerId:'a'},{leaderId:'b',winnerId:'a'}]});
    assert.equal(r.scoreBonus,[.3,.6,.9,1.2,1.5][stars-1]);assert.equal(r.matchedCount,1);assert.equal(r.amount,0);
    for(const trick of [{leaderId:'c',winnerId:'a'},{leaderId:'b',winnerId:'b'},{leaderId:'b',winnerId:'c'},{leaderId:'b'}]) assert.equal(calculateHeroSkillReward({...input,trickHistory:[trick]}).scoreBonus,0);
  }
});

test('settlement appends personal score once and history keeps original victory intact',()=>{
  const r=room();r.trickHistory=[{number:1,leaderId:'b',winnerId:'a',points:0,plays:r.players.map(p=>({playerId:p.id,cards:[p.hand[0]]}))}];
  base.finishGame(r,r.trickHistory[0]);const results=r.result;const b=results.playerResults.find(p=>p.playerId==='b');
  assert.equal(b.heroScoreDelta,1.5);assert.equal(b.gameScore,Math.round((b.baseGameScore+1.5)*100)/100);
  assert.equal(b.heroSkillReward.amount,0);assert.equal(results.heroScoreAdjustments.length,1);
  const record=buildGameRecord(r);assert.ok(record.players.find(p=>p.roomPlayerId==='b'));
  base.finishGame(r,r.trickHistory[0]);assert.equal(r.result,results);
});


test('reversed last-hand automatic following settles exactly once in the changed order',()=>{
  const r=room();r.players.forEach(p=>p.hand=[p.hand[0]]);
  assert.equal(game.activateShenKaxiangSkill(r,r.players[1]).ok,true);
  play(r,'a');
  assert.equal(r.stage,'finished');assert.equal(r.trickHistory.length,1);
  assert.deepEqual(r.trickHistory[0].plays.map(p=>p.playerId),['a','e','d','c','b']);
});
