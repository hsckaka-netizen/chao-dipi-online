import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyShenBenleiCardRules, applyShenBiesanCardRules, isShenBenleiTrump } from "../public/replacement-rank-rules.js";
import { calculateHeroSkillReward, createBattleHeroSnapshot, drawHomeUnit, SSR_HERO_UNITS, boardHeroSkillState } from "../hero-home.js";
import { calculateGameDiamondReward } from "../diamond-rewards.js";
import { forcedProtectedFiveIds } from "../dragged-five-attribution.js";
import { __heroCardRulesTesting as rules, __aiPlayTesting as ai } from "../server.js";

let serial = 0;
function card(suit, rank, hero = false, replacement = null) {
  return applyShenBenleiCardRules(applyShenBiesanCardRules({ id: `card-${++serial}`, type: "normal", suit, rank, label: `${suit}${rank}`, deck: 1 }, replacement), hero);
}
function pairs(suit, ranks, hero = false, replacement = null) {
  return ranks.flatMap((rank) => [card(suit, rank, hero, replacement), card(suit, rank, hero, replacement)]);
}
function player(id, hand = [], heroId = null) {
  return { id, name: id, accountId: `account-${id}`, test: false, hand, score: 0, battleHeroSnapshot: heroId ? createBattleHeroSnapshot(heroId, 3) : null };
}
function room(players, trumpSuit = "S") {
  return { id: "rules-room", gameMode: "pvp", playMode: "brawl", status: "dealt", stage: "playing", players,
    bankerId: players[0].id, trumpSuit, currentTrick: { number: 1, leaderId: players[0].id, plays: [] },
    doglegMode: "traditional", doglegNeeded: 0, doglegPlayerIds: [], events: [], trickHistory: [], kitty: [], removedCards: [],
    boardHeroEffects: { uses: [] }, setup: { fry: { history: [] } }, heroRoundState: {} };
}

test("神奔雷仅提升同色另一花色6，四种主花色均为最小主牌并可连拖拉机", () => {
  for (const [trump, peer] of [["S","C"], ["C","S"], ["H","D"], ["D","H"]]) {
    const promoted = pairs(peer, ["6"], true);
    assert.equal(rules.playSuit(promoted[0], trump), "TRUMP");
    assert.ok(rules.mainCardPower(promoted[0], trump) > rules.mainCardPower(card(trump,"4"), trump));
    assert.equal(rules.detectPlayPattern([...pairs(trump,["4"],true), ...promoted], trump)?.type, "tractor");
    assert.equal(rules.playSuit(card(peer,"6"), trump), peer, "other owners keep their side six");
    for (const suit of ["S","H","C","D"]) {
      if (suit !== peer) assert.equal(isShenBenleiTrump(card(suit,"6",true),trump), false);
    }
    assert.equal(isShenBenleiTrump(promoted[0], null), false);
  }
});

test("个人牌路跳过被移走的点数，拖拉机按实体最大牌比较且同大不顶替先手", () => {
  const lead = pairs("C",["5","7"],true);
  const smaller = pairs("C",["5","6"]);
  const equal = pairs("C",["6","7"]);
  assert.equal(rules.detectPlayPattern(lead,"S")?.type,"tractor");
  assert.equal(rules.detectPlayPattern(pairs("C",["5","7"]),"S"),null,"missing a card alone never changes adjacency");
  assert.ok(rules.playPower(lead,"S") < rules.playPower(smaller,"S"));
  assert.equal(rules.playPower(lead,"S"),rules.playPower(equal,"S"));
  const r = room([player("a"),player("b"),player("c")]);
  r.currentTrick.plays = [{playerId:"a",cards:lead},{playerId:"b",cards:smaller},{playerId:"c",cards:equal}];
  assert.equal(rules.settleTrick(r,r.currentTrick).winnerId,"a");
  r.currentTrick.plays = [{playerId:"b",cards:equal},{playerId:"a",cards:lead}];
  assert.equal(rules.settleTrick(r,r.currentTrick).winnerId,"b");
  const pattern = rules.detectPlayPattern(lead,"S");
  assert.equal(rules.exactPatternCandidates(lead,pattern,"S").length,1,"AI and throw matching can assemble the personal tractor");
});

test("主6兼容比牌替换，原2降级时与最小普通主牌相连", () => {
  const sixAsTwo = card("C","6",true,"6");
  assert.equal(isShenBenleiTrump(sixAsTwo,"S"),false);
  assert.equal(rules.mainCardPower(sixAsTwo,"S"),7);
  assert.equal(rules.detectPlayPattern(pairs("C",["5","7"],true,"6"),"S")?.type,"tractor");
  const lowest = pairs("S",["2"],true,"9");
  const promoted = pairs("C",["6"],true,"9");
  assert.equal(rules.detectPlayPattern([...lowest,...promoted],"S")?.type,"tractor");
  const global = pairs("C",["8","10"],false,"9");
  assert.equal(rules.detectPlayPattern(global,"H")?.type,"tractor","global rank replacement also skips removed ranks");
});

test("开始出牌按最终持有者标记牌，不把原持有人的技能传给其他玩家", () => {
  const a = player("a",[card("C","6")],"shen-benlei");
  const b = player("b",[card("C","6",true)]);
  const r = room([a,b]);
  rules.beginPlaying(r);
  assert.equal(rules.playSuit(a.hand[0],"S"),"TRUMP");
  assert.equal(rules.playSuit(b.hand[0],"S"),"C");
  assert.equal(rules.publicCard(a.hand[0]).rulesShenBenlei,true);
  assert.equal(rules.publicCard(b.hand[0]).rulesShenBenlei,undefined);
  assert.equal(rules.publicCard(a.hand[0]).rank,"6");
});

test("跟牌和毙牌使用每个玩家自己的牌路，主6不能混作副牌", () => {
  const a = player("a");
  const b = player("b",[card("C","6",true),card("D","8")],"shen-benlei");
  const r = room([a,b]);
  r.currentTrick.plays = [{playerId:"a",cards:[card("S","A")]}];
  assert.match(rules.validatePlay(r,b,[b.hand[1]]),/必须.*主牌/);
  assert.equal(rules.validatePlay(r,b,[b.hand[0]]),null);
  r.currentTrick.plays = [{playerId:"a",cards:[card("C","A")]}];
  const info = rules.leadInfo(r.currentTrick,"S");
  assert.equal(rules.playComparisonAgainstLead(info,[b.hand[0]],"S").level,2);
  const promoted = pairs("C",["6"],true);
  const trumpLead = [...pairs("S",["4"],true),...promoted];
  assert.equal(rules.detectPlayPattern(trumpLead,"S")?.type,"tractor");
  assert.equal(rules.detectPlayPattern([...pairs("C",["6"],true),...pairs("C",["7"],true)],"S"),null);
});

test("主6计入可跟主牌，避免把本可选择的红五误判为强制被拖", () => {
  const six = card("C","6",true);
  const redFive = card("H","5",true);
  assert.deepEqual(forcedProtectedFiveIds({hand:[six,redFive],selected:[redFive],leadCards:[card("S","A")],trumpSuit:"S"}),[]);
});

test("含6赢轮只按本人实体出牌判断，整局只奖励一次并使用冻结星级", () => {
  const win = {winnerId:"a",plays:[{playerId:"a",cards:[card("D","6")]},{playerId:"b",cards:[card("H","K")]}]};
  for (let stars=1;stars<=5;stars++) {
    const snapshot = createBattleHeroSnapshot("shen-benlei",stars);
    assert.equal(snapshot.paidSkill,undefined);
    const calc = (history) => calculateHeroSkillReward({snapshot,playerId:"a",playerResult:{gameScore:-2},trickHistory:history});
    const reward = calc([win,win]);
    assert.equal(reward.amount,20*stars);
    assert.equal(reward.scoreBonus,stars/10);
    assert.equal(reward.matchedCount,1);
    assert.equal(calc([{...win,winnerId:"b"}]).amount,0);
    assert.equal(calc([{winnerId:"a",plays:[{playerId:"a",cards:[card("D","7")]},{playerId:"b",cards:[card("D","6")]}]}]).amount,0);
    assert.equal(calc([]).scoreBonus,0);
    assert.equal(calculateGameDiamondReward({team:"idle",heroSkillReward:reward}).heroBonus,30*stars);
    assert.equal(calculateGameDiamondReward({gameMode:"pve",team:"banker",winnerTeam:"banker",heroSkillReward:reward}).heroBonus,10*stars);
    assert.equal(calculateGameDiamondReward({gameMode:"pve",team:"banker",winnerTeam:"idle",heroSkillReward:reward}).heroBonus,0);
  }
});

test("神奔雷结算追加个人积分，保留原始胜负口径", () => {
  const a = player("a",[],"shen-benlei");
  const b = player("b");
  const r = room([a,b]);
  r.trickHistory=[{number:1,leaderId:"a",winnerId:"a",points:0,plays:[{playerId:"a",cards:[card("C","6",true)]},{playerId:"b",cards:[card("S","A")]}]}];
  rules.finishGame(r,r.trickHistory[0]);
  const result=r.result.playerResults.find((p)=>p.playerId==="a");
  assert.equal(result.heroScoreDelta,0.3);
  assert.equal(result.gameScore,Math.round((result.baseGameScore+0.3)*100)/100);
  assert.equal(result.heroSkillReward.amount,60);
  assert.equal(r.result.heroScoreAdjustments.length,1);
});

test("神奔雷在常规SSR池，旧CD归零且保留每局次数", async () => {
  const count=SSR_HERO_UNITS.filter((hero)=>!hero.advancementFrom).length;
  const outcomes = new Set(Array.from({length:count},(_,i)=>drawHomeUnit({forceRarity:"ssr",randomFloat:()=>i/count+0.00001}).id));
  assert.ok(outcomes.has("shen-benlei"));
  for (const hero of SSR_HERO_UNITS) for (let stars=1;stars<=5;stars++) {
    const skill=boardHeroSkillState(stars,5,hero.id);
    assert.equal(skill.cooldown,0);
    assert.equal(skill.cooldownAfterUse,0);
    assert.equal(skill.cost,0);
    assert.equal(skill.maxUsesPerGame,hero.id==="yokoyama-yui"?[1,1,2,2,3][stars-1]:1);
  }
  const migration=await readFile(new URL("../db/migrations/042_remove_ssr_cooldowns.sql",import.meta.url),"utf8");
  assert.match(migration,/UPDATE cdp_hero_units SET skill_cooldown = 0/);
  assert.match(migration,/UPDATE cdp_game_hero_hires SET skill_cooldown = 0/);
});

test("托管采样按模拟持有者赋予主6规则，不读取其他玩家实际手牌", () => {
  const observer=player("a",[card("D","K")]);
  const hero=player("b",[card("H","A"),card("H","K")],"shen-benlei");
  const r=room([observer,hero]);
  const context={knowledge:{voidRoutesByPlayerId:new Map()},unseenCards:[card("C","6"),card("C","7")]};
  const world=ai.aiSampleHiddenHands(r,observer,context,()=>0.5);
  assert.ok(world);
  assert.equal(rules.playSuit(world.hands.get("b").find(c=>c.rank==="6"),"S"),"TRUMP");
  hero.hand=[card("S","A"),card("S","K")];
  const changed=ai.aiSampleHiddenHands(r,observer,context,()=>0.5);
  assert.deepEqual(changed.hands.get("b").map(c=>c.id),world.hands.get("b").map(c=>c.id));
  hero.battleHeroSnapshot=null;
  const ordinary=ai.aiSampleHiddenHands(r,observer,context,()=>0.5);
  assert.equal(rules.playSuit(ordinary.hands.get("b").find(c=>c.rank==="6"),"S"),"C");
});
