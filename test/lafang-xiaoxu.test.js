import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHeroSkillReward, createBattleHeroSnapshot, drawHomeUnit, scoringSourcePlayerIds, HERO_HOME_RULES } from '../hero-home.js';
import { HERO_ADVANCEMENTS, advancementGameDelta, advancementProgress, eligibleAdvancementSrIds } from '../hero-advancement.js';
import { __heroAdvancementTesting as game } from '../server.js';
import { buildGameRecord, __heroAdvancementStorageTesting as storage } from '../game-history.js';
const card = (id, rank = 'K', suit = 'C') => ({ id, type: 'normal', rank, suit, label: `${suit}${rank}`, color: ['H','D'].includes(suit) ? 'red' : 'black', deck: 1 });
const joker = (id, size = 'big') => ({ id, type: 'joker', joker: size, rank: size, label: size === 'big' ? '大王' : '小王', sort: 0 });
function room(heroId = 'shen-xiaoxu', stars = 5) {
  const players = ['banker','hero','other','p4','p5'].map(id => ({ id, name: id, accountId: id, test: false, hand: Array.from({ length: 15 }, (_, i) => card(`${id}-${i}`, '4')), score: 0 }));
  players[1].battleHeroSnapshot = createBattleHeroSnapshot(heroId, stars);
  return { id: 'NEWSSR', gameRecordId: 'game', status: 'dealt', stage: 'playing', gameMode: 'pvp', playMode: 'brawl',
    players, bankerId: 'banker', trumpSuit: 'H', doglegMode: 'traditional', doglegNeeded: 2, doglegPlayerIds: [], doglegCard: card('dogleg','A','S'),
    kitty: [card('kitty','5','D')], kittySize: 1, setup: game.emptySetup(), boardHeroSkills: game.emptyBoardHeroSkills(), boardHeroEffects: { uses: [] },
    gameItems: { uses: [] }, heroRoundState: {}, ranchenRoleLocks: {}, events: [], trickHistory: [], settledTrickHistory: [], provisionalWinnerPlayerIds: [], spectators: new Map(),
    currentTrick: { number: 1, leaderId: 'banker', plays: [] } };
}
function reserve(r, ids) {
  game.beginPlaying(r);
  assert.equal(r.stage, 'shen-xiaoxu-skill');
  assert.equal(game.submitAdvancedHeroChoice(r, r.players[1], 'shen-xiaoxu-reserve', ids).ok, true);
  assert.equal(r.stage, 'playing');
}
function fryRoom(stars = 1, bid = 300) {
  const r = room('shen-lafang', stars); r.bankerId = 'hero'; r.stage = 'frying';
  r.players[1].hand = [card('s1','2','S'), card('s2','2','S'), card('h1','2','H'),card('h2','2','H'),card('extra')];
  r.setup.scoreBid = { current: { score: bid, playerId: 'hero' } };
  r.setup.fry = { currentPlayerId: 'hero', lastBid: { playerId: 'other', count: 2, suit: 'S' }, history: [], passesSinceLast: 0 };
  return r;
}

test('Lafang 60% permits identical fry, preserves turn/ownership/rank validation and normal bury', () => {
  const r = fryRoom(); const h = r.players[1]; const before = h.hand.length;
  assert.equal(game.submitFry(r, r.players[2], ['s1','s2']).status, 409);
  assert.equal(game.submitFry(r, h, ['missing','s2']).status, 400);
  assert.equal(game.submitFry(r, h, ['s1','s1']).status, 400);
  assert.equal(game.submitFry(r, h, ['extra']).status, 400);
  assert.equal(game.submitFry(r, h, ['h1','h2']).status, 400, 'strictly weaker cannot fry');
  assert.equal(game.submitFry(r, h, ['s1','s2']).ok, true);
  assert.equal(r.stage, 'fry-burying'); assert.equal(h.hand.length, before + 1); assert.equal(r.kitty.length, 0);
  assert.equal(r.setup.fry.pendingBid.count, 2); assert.equal(r.setup.fry.pendingBid.suit, 'S');
  assert.equal(game.buryCards(r, h, ['kitty']).ok, true);
  assert.equal(r.stage, 'frying'); assert.equal(h.hand.length, before); assert.equal(r.kitty.length, 1);
  assert.equal(r.setup.fry.lastBid.playerId, h.id);
});

test('Lafang same-size fry is gated by final banker, exact threshold and valid human game', () => {
  for (const change of [r => r.setup.scoreBid.current.score = 299, r => r.bankerId = 'banker', r => r.players[1].battleHeroSnapshot = createBattleHeroSnapshot('xiaoxu',5), r => r.players[2].test = true, r => r.players[2].accountId = null, r => r.setup.scoreBid = null]) {
    const r = fryRoom(); change(r); assert.equal(game.submitFry(r, r.players[1], ['s1','s2']).status, 400);
  }
  for (const mode of ['traditional','dynamic','hidden','random-order']) {
    const r = fryRoom(); r.doglegMode = mode; assert.equal(game.submitFry(r, r.players[1], ['s1','s2']).ok, true);
  }
  const first = fryRoom(); first.setup.fry.lastBid = { direct: true, count: 0, suit: 'S' };
  assert.equal(game.submitFry(first, first.players[1], ['s1']).status, 400);
  assert.equal(game.submitFry(first, first.players[1], ['s1','s2']).ok, true);
  const replaced = fryRoom(); replaced.players[1].hand.filter(c => c.rank === '2').forEach(c => { c.rank = '8'; c.rulesRank = '2'; });
  assert.equal(game.submitFry(replaced, replaced.players[1], ['s1','s2']).ok, true);
});

test('Lafang 70% accepts any owned compare card, distinguishes jokers and preserves locked roles/slots', () => {
  for (const chosen of [joker('big'), card('two','2'), card('red','5','H'),card('diamond','5','D'),card('adviser','3','D')]) {
    const r = fryRoom(5,350); const h = r.players[1]; r.stage = 'dogleg'; h.hand.push(chosen);
    r.ranchenRoleLocks.other = 'idle'; r.ranchenRoleLocks.p4 = 'dogleg';
    assert.equal(game.selectDogleg(r, h, [chosen.id]).ok, true);
    assert.equal(r.doglegCard.type, chosen.type); assert.deepEqual(r.doglegPlayerIds, ['p4']);
    game.revealDoglegIfNeeded(r, r.players[2], [chosen]); assert.deepEqual(r.doglegPlayerIds, ['p4']);
    if (chosen.type === 'joker') { game.revealDoglegIfNeeded(r, r.players[4], [joker('small','small')]); assert.deepEqual(r.doglegPlayerIds, ['p4']); }
    game.revealDoglegIfNeeded(r, r.players[4], [chosen]); assert.deepEqual(r.doglegPlayerIds, ['p4','p5']);
  }
  const r = fryRoom(5,349); r.stage = 'dogleg';
  assert.equal(game.selectDogleg(r,r.players[1],['s1']).status,400);
  r.setup.scoreBid.current.score = 350;
  assert.equal(game.selectDogleg(r,r.players[1],['not-owned']).status,400);
  r.doglegMode = 'dynamic'; assert.equal(game.setupSnapshot(r,r.players[1]).lafang.canChooseAnyCard,false);
});

test('Lafang star rewards require 50%, original victory and banker role', () => {
  for (let stars = 1; stars <= 5; stars++) {
    const reward = (score, bid, role='庄家') => calculateHeroSkillReward({ snapshot: createBattleHeroSnapshot('shen-lafang',stars), playerId:'hero',playerResult:{role,baseGameScore:score,gameScore:99},bankerBidScore:bid,totalGamePoints:500 });
    assert.equal(reward(1,250).scoreBonus,[0.5,1,1.5,2,3][stars-1]);
    assert.equal(reward(1,249).scoreBonus,0); assert.equal(reward(-1,350).scoreBonus,0); assert.equal(reward(0,350).scoreBonus,0); assert.equal(reward(1,350,'狗腿').scoreBonus,0);
  }
});

test('Xiaoxu has 1/2/3/4/5 upper limits, exact physical conservation, ownership and privacy', () => {
  assert.deepEqual([...HERO_HOME_RULES.shenXiaoxuReserveCount],[1,2,3,4,5]);
  for (let stars=1; stars<=5; stars++) {
    const r=room('shen-xiaoxu',stars); const h=r.players[1]; const ids=h.hand.slice(0,stars).map(c=>c.id);
    game.beginPlaying(r);
    assert.equal(game.boardHeroSkillsSnapshot(r,h).advanced.reserveCount,stars);
    assert.equal(game.submitAdvancedHeroChoice(r,r.players[2],'shen-xiaoxu-reserve',ids).status,403);
    assert.equal(game.submitAdvancedHeroChoice(r,h,'shen-xiaoxu-reserve',h.hand.slice(0,stars+1).map(c=>c.id)).status,400);
    assert.equal(game.submitAdvancedHeroChoice(r,h,'shen-xiaoxu-reserve',['missing']).status,400);
    assert.equal(game.submitAdvancedHeroChoice(r,h,'shen-xiaoxu-reserve',['hero-0','hero-0']).status,400);
    assert.equal(game.submitAdvancedHeroChoice(r,h,'shen-xiaoxu-reserve',ids).ok,true);
    assert.equal(h.hand.length,15-stars); assert.equal(r.heroRoundState.hero.reservedCards.length,stars);
    assert.deepEqual([...h.hand,...r.heroRoundState.hero.reservedCards].map(c=>c.id).sort(),Array.from({length:15},(_,i)=>`hero-${i}`).sort());
    assert.equal(game.setupSnapshot(r,h).reservedCards.length,stars);
    assert.deepEqual(game.setupSnapshot(r,r.players[0]).reservedCards,[]); assert.deepEqual(game.setupSnapshot(r,null).reservedCards,[]);
    assert.equal(game.playCards(r,h,ids).status,409); // Not his turn; cannot submit reserve cards.
    r.currentTrick.leaderId=h.id; assert.equal(game.playCards(r,h,ids).status,400);
    assert.equal(game.submitAdvancedHeroChoice(r,h,'shen-xiaoxu-reserve',['hero-5']).status,409);
  }
});

test('Xiaoxu can choose below maximum; pass/timeout do not reserve or reward', async () => {
  const r=room(); reserve(r,['hero-0']); assert.equal(r.heroRoundState.hero.reservedCards.length,1);
  for (const timeout of [false,true]) {
    const r=room(); game.beginPlaying(r);
    if (timeout) { r.boardHeroSkills.advanced.deadlineAt=new Date(0).toISOString(); assert.equal(await game.autoAdvanceExpiredBoardHeroSkill(r),true); }
    else assert.equal(game.submitAdvancedHeroChoice(r,r.players[1],'shen-xiaoxu-pass').ok,true);
    assert.equal(r.stage,'playing'); assert.equal(r.players[1].hand.length,15); assert.equal(r.heroRoundState.hero,undefined);
  }
});

test('reserved cards do not impose follow suit or block an otherwise successful throw', () => {
  const r=room(); const h=r.players[1]; h.hand[0]=card('hero-0','A','S'); reserve(r,['hero-0']);
  r.currentTrick.plays=[{ playerId:'banker',cards:[card('lead','K','S')] }];
  assert.equal(game.validatePlay(r,h,[h.hand[0]]),null,'reserved spade does not require following spades');
  assert.equal(game.playCards(r,h,[h.hand[0].id]).ok,true); assert.equal(r.heroRoundState.hero.reservedCards.length,1,'void is not insufficient card count');
  const t=room(); t.players[1].hand=[card('hero-0','A','C'), ...Array.from({length:8},(_,i)=>card(`d${i}`,'4','D'))]; reserve(t,['hero-0']);
  const leader=t.players[0]; leader.hand=[card('k','K'),card('q','Q'),card('left','4')];
  for (const p of t.players.slice(2)) p.hand=[card(`${p.id}-low`,'4','D')];
  const result=game.prepareThrowLeadPlay(t,leader,leader.hand.slice(0,2),[['k'],['q']]);
  assert.equal(result.failed,false,'reserved ace cannot stop a throw');
  game.returnXiaoxuReserves(t,t.players[1],'test');
  assert.equal(game.prepareThrowLeadPlay(t,leader,leader.hand.slice(0,2),[['k'],['q']]).failed,true,'returned ace participates again');
});

test('insufficient card count returns all reserves before legal following; rejected play does not mutate reserves', () => {
  const r=room(); const h=r.players[1]; h.hand=[card('hero-0','A','C'),card('hero-1','K','C'),card('left','4','D')]; reserve(r,['hero-0','hero-1']);
  r.players[0].hand=[card('k1','K'),card('k2','K'),card('b-left','4')];
  assert.equal(game.playCards(r,r.players[0],['k1','missing']).status,400); assert.equal(r.heroRoundState.hero.reservedCards.length,2);
  assert.equal(game.playCards(r,r.players[0],['k1','k2']).ok,true); assert.equal(r.heroRoundState.hero.reservedCards.length,0); assert.equal(h.hand.length,3);
  assert.match(game.validatePlay(r,h,[h.hand.find(c=>c.id==='left'),h.hand.find(c=>c.id==='hero-0')]),/必须/);
  assert.equal(game.playCards(r,h,['hero-0','hero-1']).ok,true); assert.equal(r.heroRoundState.hero.playedBeforeReturn,0);
});

test('Xiaoxu returns only after real trick victory and includes that winning play in pre-return count', () => {
  const r=room(); const h=r.players[1]; h.hand[0]=card('hero-0','K','S'); h.hand[1]=card('hero-1','A'); reserve(r,['hero-0']);
  for (const p of r.players) {
    const id=p===h?'hero-1':p.hand[0].id;
    assert.equal(game.playCards(r,p,[id]).ok,true);
    if (p===h) { assert.equal(r.heroRoundState.hero.reservedCards.length,1,'provisional lead is not a win'); assert.equal(r.heroRoundState.hero.playedBeforeReturn,1); }
  }
  assert.equal(r.trickHistory[0].winnerId,h.id); assert.equal(r.heroRoundState.hero.reservedCards.length,0); assert.equal(r.currentTrick.leaderId,h.id);
  assert.equal(game.playCards(r,h,[h.hand[0].id]).ok,true); assert.equal(r.heroRoundState.hero.playedBeforeReturn,1);
  const opening=room(); opening.bankerId='hero'; reserve(opening,['hero-0']); assert.equal(opening.heroRoundState.hero.reservedCards.length,1,'banker opening lead is not an acquired win');
});

test('failed throw counts only landed cards and last-active-hand does not prematurely auto-follow or finish', () => {
  const r=room(); const h=r.players[1]; h.hand=[card('reserve','9','S'),card('attempt1','K'),card('attempt2','Q'),card('left','4','D')]; reserve(r,['reserve']);
  r.currentTrick.leaderId=h.id; r.players[2].hand[0]=card('beater','A');
  const result=game.playCards(r,h,['attempt1','attempt2'],{throwPlay:true,throwComponents:[['attempt1'],['attempt2']]});
  assert.equal(result.ok,true); assert.equal(r.heroRoundState.hero.playedBeforeReturn,1); assert.equal(r.currentTrick.plays[0].cards.length,1);
  const e=room(); e.players[1].hand=[card('hero-0','4'),card('remaining','4')]; reserve(e,['hero-0']);
  assert.equal(game.playCards(e,e.players[0],[e.players[0].hand[0].id]).ok,true);
  assert.equal(game.playCards(e,e.players[1],['remaining']).ok,true);
  assert.equal(e.stage,'playing'); assert.equal(e.currentTrick.plays.length,2); assert.equal(e.players[1].hand.length,1); assert.equal(e.heroRoundState.hero.reservedCards.length,0);
});

test('Xiaoxu per-ten rewards use original victory, star values and floor incomplete groups', () => {
  for (let stars=1;stars<=5;stars++) for (const count of [0,9,10,19,20,27]) {
    const reward=(score)=>calculateHeroSkillReward({snapshot:createBattleHeroSnapshot('shen-xiaoxu',stars),playerId:'hero',playerResult:{baseGameScore:score,gameScore:20},xiaoxuPlayedBeforeReturn:count});
    assert.equal(reward(1).scoreBonus,Math.round(Math.floor(count/10)*[.1,.2,.3,.4,.5][stars-1]*100)/100);
    assert.equal(reward(1).amount,0); assert.equal(reward(-1).scoreBonus,0); assert.equal(reward(0).scoreBonus,0);
  }
});

test('source collection excludes self, bottom and non-scoring cards, deduplicates per game and advances unequipped five-star SR', () => {
  const history=[{winnerId:'hero',plays:[{playerId:'hero',cards:[card('own','K')]},{playerId:'other',cards:[card('k','K')]},{playerId:'p4',cards:[card('4','4')]}]},
    {winnerId:'hero',plays:[{playerId:'other',cards:[card('10','10')]},{playerId:'p5',cards:[card('5','5')]}]},
    {winnerId:'other',plays:[{playerId:'p4',cards:[card('no','K')]}]}];
  assert.deepEqual(scoringSourcePlayerIds(history,'hero'),['other','p5']);
  const p={roomPlayerId:'hero',advancementSrIds:eligibleAdvancementSrIds({xiaoxu:{stars:5}}),scoringSourcePlayerIds:['other','other','p5','hero']};
  assert.deepEqual(advancementGameDelta(p),{xiaoxu:{scoringSources:2}});
  const d=HERO_ADVANCEMENTS.find(d=>d.srId==='xiaoxu'); assert.equal(advancementProgress(d,{scoringSources:99}).complete,false); assert.equal(advancementProgress(d,{scoringSources:100}).complete,true);
  assert.deepEqual(advancementGameDelta({...p,advancementSrIds:[]}),{});
  const r=room(); r.trickHistory=history; game.finishGame(r,{winnerId:'hero',plays:[]});
  assert.deepEqual(buildGameRecord(r).players.find(p=>p.roomPlayerId==='hero').scoringSourcePlayerIds,['other','p5']);
});

test('Xiaoxu progress is receipt-idempotent, counts a source again in another game and caps at 100', async () => {
  const receipts=new Set(); let progress={scoringSources:97};
  const client={async query(sql,args=[]) {
    if(sql.includes('INSERT INTO cdp_hero_advancement_games')) { if(receipts.has(args[2])) return {rows:[]}; receipts.add(args[2]); return {rows:[{}]}; }
    if(sql.includes('SELECT progress, claimed_at')) return {rows:[{progress,claimed_at:null}]};
    if(sql.includes('UPDATE cdp_hero_advancements SET progress')) progress=JSON.parse(args[2]);
    return {rows:[]};
  }};
  const record={gameId:'one',gameMode:'pvp',advancementEligible:true,players:[{accountId:'a',roomPlayerId:'hero',advancementSrIds:['xiaoxu'],scoringSourcePlayerIds:['other','p5']}]};
  await storage.settleHeroAdvancement(client,record); assert.equal(progress.scoringSources,99);
  await storage.settleHeroAdvancement(client,record); assert.equal(progress.scoringSources,99);
  await storage.settleHeroAdvancement(client,{...record,gameId:'two'}); assert.equal(progress.scoringSources,100);
});

test('new ordinary SSR is drawable; Xiaoxu SSR requires claim and grants SSR plus forty fragments once', async () => {
  const seen=new Set(); const unlocked=new Set();
  for(let i=0;i<200;i++) { seen.add(drawHomeUnit({forceRarity:'ssr',randomFloat:()=>i/200}).id); unlocked.add(drawHomeUnit({forceRarity:'ssr',unlockedSsrIds:['shen-xiaoxu'],randomFloat:()=>i/200}).id); }
  assert.ok(seen.has('shen-lafang')); assert.ok(!seen.has('shen-xiaoxu')); assert.ok(unlocked.has('shen-xiaoxu'));
  const definition=HERO_ADVANCEMENTS.find(d=>d.srId==='xiaoxu'); const row={progress:{scoringSources:100},claimed_at:null}; let grants=0;
  const client={async query(sql,args=[]) {
    if(sql.includes('SELECT stars FROM cdp_hero_units')) return {rows:[{stars:args[1]==='xiaoxu'?5:1}]};
    if(sql.includes('SELECT progress, claimed_at')) return {rows:[row]};
    if(sql.includes('INSERT INTO cdp_hero_units')) {assert.equal(args[1],'shen-xiaoxu'); assert.match(sql,/VALUES \(\$1::uuid, \$2, 40\)/);grants++;}
    if(sql.includes('UPDATE cdp_hero_advancements SET claimed_at')) row.claimed_at='claimed';
    return {rows:[]};
  }};
  await storage.claimHeroAdvancementFromClient(client,'a',definition); await storage.claimHeroAdvancementFromClient(client,'a',definition); assert.equal(grants,1);
});

test('final personal score path adds each new reward once, preserves raw score and outcome', () => {
  for(const heroId of ['shen-lafang','shen-xiaoxu']) {
    const r=room(heroId); r.bankerId='hero'; r.setup.scoreBid={current:{score:350,playerId:'hero'}};
    r.heroRoundState.hero={playedBeforeReturn:20,reservedCards:[]};
    const last={number:1,leaderId:'hero',winnerId:'hero',points:0,plays:r.players.map(p=>({playerId:p.id,cards:[p.hand[0]]}))};r.trickHistory=[last];
    game.finishGame(r,last); const result=r.result; const p=result.playerResults.find(p=>p.playerId==='hero');
    assert.ok(p.baseGameScore>0); assert.equal(p.heroScoreDelta,heroId==='shen-lafang'?3:1); assert.equal(p.gameScore,p.baseGameScore+p.heroScoreDelta);
    assert.equal(result.heroScoreAdjustments.length,1); game.finishGame(r,last); assert.equal(r.result,result);
  }
});

test('multiple Xiaoxus choose sequentially once and an entire game conserves every card through recall', () => {
  const r=room(); r.players[2].battleHeroSnapshot=createBattleHeroSnapshot('shen-xiaoxu',2);
  game.beginPlaying(r); assert.equal(r.boardHeroSkills.advanced.currentPlayerId,'hero');
  assert.equal(game.submitAdvancedHeroChoice(r,r.players[1],'shen-xiaoxu-reserve',r.players[1].hand.slice(0,5).map(c=>c.id)).ok,true);
  assert.equal(r.boardHeroSkills.advanced.currentPlayerId,'other');
  assert.equal(game.submitAdvancedHeroChoice(r,r.players[2],'shen-xiaoxu-reserve',[r.players[2].hand[0].id]).ok,true);
  assert.equal(r.stage,'playing');
  let steps=0;
  while(r.stage==='playing' && steps++<100) {
    const start=r.players.findIndex(p=>p.id===r.currentTrick.leaderId);
    const order=[...r.players.slice(start),...r.players.slice(0,start)];
    const next=order.find(p=>p.hand.length&&!r.currentTrick.plays.some(play=>play.playerId===p.id));
    assert.ok(next,'every unfinished trick has a legal next player');
    assert.equal(game.playCards(r,next,[next.hand[0].id]).ok,true);
  }
  assert.equal(r.stage,'finished');
  const ids=r.trickHistory.flatMap(t=>t.plays.flatMap(p=>p.cards.map(c=>c.id)));
  assert.equal(ids.length,75); assert.equal(new Set(ids).size,75); assert.ok(r.players.every(p=>p.hand.length===0));
  assert.ok(Object.values(r.heroRoundState).every(s=>s.reservedCards.length===0));
});
