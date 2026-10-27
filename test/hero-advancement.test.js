import test from "node:test";
import assert from "node:assert/strict";
import { HERO_ADVANCEMENTS, advancementGameDelta, advancementProgress } from "../hero-advancement.js";
import { calculateHeroSkillReward, createBattleHeroSnapshot, drawHomeUnit, drawHeroGachaResult } from "../hero-home.js";
import { __heroAdvancementTesting as game } from "../server.js";

const card = (id, suit = "C", rank = "K") => ({ id, type: "normal", suit, rank, label: `${suit}${rank}`, color: suit === "D" || suit === "H" ? "red" : "black" });
function room(heroId = "jie-denghuang", stars = 5) {
  const players = ["banker", "hero", "other", "p4", "p5"].map((id) => ({ id, name: id, accountId: id, test: false, hand: [card(`${id}-a`), card(`${id}-b`, "S", "9")], score: 0 }));
  players[1].battleHeroSnapshot = createBattleHeroSnapshot(heroId, stars);
  return { id: "ADV", gameRecordId: "game", status: "dealt", gameMode: "pvp", playMode: "brawl", players, bankerId: "banker", trumpSuit: "H", doglegMode: "traditional", doglegNeeded: 2, doglegPlayerIds: [], doglegCard: card("public", "D", "9"), kitty: [card("k1"), card("k2", "D", "A"), card("k3", "S", "7")], kittySize: 3, setup: game.emptySetup(), boardHeroSkills: game.emptyBoardHeroSkills(), heroRoundState: {}, ranchenRoleLocks: {}, events: [], trickHistory: [], spectators: new Map() };
}

test("SSR rewards inherit SR amounts by frozen stars; score conditions use original results", () => {
  for (let stars = 1; stars <= 5; stars++) {
    const reward = (id, role = "狗腿", score = 2, history = [{ winnerId: "p" }]) => calculateHeroSkillReward({ snapshot: createBattleHeroSnapshot(id, stars), playerId: "p", playerResult: { role, baseGameScore: score, gameScore: 10 }, trickHistory: history });
    assert.equal(reward("jie-jiangzha").amount, [150,185,220,255,290][stars-1]);
    assert.equal(reward("jie-jiangzha").scoreBonus, [1,1.2,1.5,2,3][stars-1]);
    assert.equal(reward("jie-jiangzha", "狗腿", 2, []).scoreBonus, 0);
    assert.equal(reward("jie-jiangzha", "狗腿", 2, []).amount, [150,185,220,255,290][stars-1]);
    for (const [role, score] of [["闲家",2], ["庄家",2], ["狗腿",0], ["狗腿",-2]]) {
      assert.equal(reward("jie-jiangzha", role, score).scoreBonus, 0);
      assert.equal(reward("jie-jiangzha", role, score).amount, 0);
    }
    assert.equal(reward("jie-denghuang", "闲家", -2).amount, [120,150,180,210,240][stars-1]);
    assert.equal(reward("jie-denghuang", "闲家", -2).scoreBonus, [1,1.2,1.5,2,3][stars-1]);
    assert.equal(reward("jie-denghuang", "闲家", 2, [{ winnerId: "p" }, { winnerId: "q" }]).amount, 0);
    assert.equal(createBattleHeroSnapshot("jie-denghuang", stars).paidSkill, undefined);
  }
});

test("account SSR pool excludes advanced heroes until individually unlocked, including guaranteed SSR", () => {
  for (let index = 0; index < 100; index++) {
    const randomFloat = () => index / 100;
    assert.ok(!drawHomeUnit({ forceRarity: "ssr", randomFloat }).advancementFrom);
    assert.notEqual(drawHomeUnit({ forceRarity: "ssr", unlockedSsrIds: ["jie-jiangzha"], randomFloat }).id, "jie-denghuang");
  }
  assert.equal(drawHeroGachaResult({ forceRarity: "ssr", unlockedSsrIds: ["jie-jiangzha"], randomFloat: () => 0 }).unit.id, "jie-jiangzha");
  const rolls = [0, 0];
  assert.equal(drawHeroGachaResult({ unlockedSsrIds: ["jie-denghuang"], randomFloat: () => rolls.shift() }).unit.id, "jie-denghuang");
});

test("progress requires the corresponding frozen five-star SR and original hero-specific facts", () => {
  const player = { roomPlayerId: "p", role: "狗腿", baseGameScore: 2, battleHeroSnapshot: createBattleHeroSnapshot("jiang-zha", 5) };
  assert.deepEqual(advancementGameDelta(player, { wonTrickPlayerIds: ["p"] }), { doglegWins: 1 });
  assert.deepEqual(advancementGameDelta(player, {}), { doglegWins: 1 });
  player.battleHeroSnapshot.stars = 4;
  assert.equal(advancementGameDelta(player), null);
  player.battleHeroSnapshot = createBattleHeroSnapshot("deng-huang", 5);
  player.tags = [];
  assert.deepEqual(advancementGameDelta(player, { bottomWinnerRoomPlayerId: "p" }), { bottomWins: 1 });
  assert.deepEqual(advancementGameDelta(player, { bottomWinnerRoomPlayerId: "other" }), { bottomWins: 0 });
  for (const [definition, key] of [[HERO_ADVANCEMENTS[0], "doglegWins"], [HERO_ADVANCEMENTS[1], "bottomWins"]]) {
    assert.equal(definition.tasks.length, 1);
    assert.equal(advancementProgress(definition, { [key]: 9 }).complete, false);
    assert.equal(advancementProgress(definition, { [key]: 10 }).complete, true);
    const legacy = advancementProgress(definition, { [key]: 12, activeDoglegWins: 0, precisionBottomWins: 0 });
    assert.equal(legacy.complete, true);
    assert.equal(legacy.tasks[0].progress, 10);
  }
});

test("Denghuang exchanges exact physical cards once, validates count and ownership, preserving the deck", () => {
  const r = room(); const hero = r.players[1];
  const originalIds = [...r.kitty, ...r.players.flatMap(p => p.hand)].map(c => c.id).sort();
  assert.equal(game.beginAdvancedHeroStage(r, "denghuang"), true);
  assert.equal(game.submitAdvancedHeroChoice(r, r.players[2], "jie-denghuang-draw").status, 403);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-draw").ok, true);
  assert.equal(hero.hand.length, 4); assert.equal(r.kitty.length, 1);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-draw").status, 409);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-pass").status, 409);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", ["missing", "hero-a"]).status, 400);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", ["hero-a"]).status, 400);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", ["hero-a", "hero-a"]).status, 400);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-bury", ["hero-a", "hero-b"]).ok, true);
  assert.equal(r.stage, "dogleg"); assert.equal(hero.hand.length, 2); assert.equal(r.kitty.length, 3);
  assert.deepEqual([...r.kitty, ...r.players.flatMap(p => p.hand)].map(c => c.id).sort(), originalIds);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-draw").status, 409);
});

test("Denghuang timeout returns the newly drawn cards and processes multiple heroes in seat order", async () => {
  const r = room(); const hero = r.players[1]; const second = r.players[2];
  second.battleHeroSnapshot = createBattleHeroSnapshot("jie-denghuang", 1);
  const kittyBefore = r.kitty.map(c => c.id).sort(); const handBefore = hero.hand.map(c => c.id).sort();
  game.beginAdvancedHeroStage(r, "denghuang"); game.submitAdvancedHeroChoice(r, hero, "jie-denghuang-draw");
  r.boardHeroSkills.advanced.deadlineAt = new Date(0).toISOString();
  assert.equal(await game.autoAdvanceExpiredBoardHeroSkill(r), true);
  assert.equal(r.boardHeroSkills.advanced.currentPlayerId, second.id);
  assert.deepEqual(hero.hand.map(c => c.id).sort(), handBefore); assert.deepEqual(r.kitty.map(c => c.id).sort(), kittyBefore);
  assert.equal(game.submitAdvancedHeroChoice(r, second, "jie-denghuang-draw").ok, true);
  assert.equal(second.hand.length, 3);
  r.boardHeroSkills.advanced.deadlineAt = new Date(0).toISOString(); await game.autoAdvanceExpiredBoardHeroSkill(r);
  assert.equal(r.stage, "dogleg"); assert.equal(second.hand.length, 2);
});

test("Jiangzha privately replaces only his criterion; the public card cannot trigger him afterward", () => {
  const r = room("jie-jiangzha"); const hero = r.players[1]; const other = r.players[2];
  const publicCard = r.doglegCard;
  assert.equal(game.beginAdvancedHeroStage(r, "jiangzha"), true);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-jiangzha-select", ["hero-a"]).ok, true);
  assert.equal(r.stage, "playing"); assert.equal(r.doglegCard, publicCard);
  assert.equal(game.setupSnapshot(r, hero).personalDoglegCard.id, "hero-a");
  assert.equal(game.setupSnapshot(r, other).personalDoglegCard, null);
  assert.equal(game.setupSnapshot(r, null).personalDoglegCard, null);
  game.revealDoglegIfNeeded(r, hero, [publicCard]); assert.deepEqual(r.doglegPlayerIds, []);
  game.revealDoglegIfNeeded(r, other, [hero.hand[0]]); assert.deepEqual(r.doglegPlayerIds, []);
  game.revealDoglegIfNeeded(r, hero, [hero.hand[0]]); assert.deepEqual(r.doglegPlayerIds, [hero.id]);
  game.revealDoglegIfNeeded(r, other, [publicCard]); assert.deepEqual(r.doglegPlayerIds, [hero.id, other.id]);
});

test("Jiangzha cannot choose compare cards or bypass traditional-mode, banker, or locked-role limits", () => {
  for (const mode of ["dynamic", "hidden", "random-order"]) { const r = room("jie-jiangzha"); r.doglegMode = mode; assert.equal(game.beginAdvancedHeroStage(r, "jiangzha"), false); }
  const r = room("jie-jiangzha"); const hero = r.players[1];
  hero.hand.push(card("red-five", "H", "5")); game.beginAdvancedHeroStage(r, "jiangzha");
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-jiangzha-select", ["red-five"]).status, 400);
  assert.equal(game.submitAdvancedHeroChoice(r, hero, "jie-jiangzha-pass").ok, true);
  assert.equal(game.personalDoglegCard(r, hero), r.doglegCard);
  r.ranchenRoleLocks[hero.id] = "idle"; assert.equal(game.beginAdvancedHeroStage(r, "jiangzha"), false);
  delete r.ranchenRoleLocks[hero.id]; r.bankerId = hero.id; assert.equal(game.beginAdvancedHeroStage(r, "jiangzha"), false);
});


test("final settlement adds advanced personal score once while preserving original outcome, identity, titles and diamonds", () => {
  for (const [ssrId, srId] of [["jie-jiangzha", "jiang-zha"], ["jie-denghuang", "deng-huang"]]) {
    const settle = (id) => {
      const r = room(id);
      r.gameItems = { uses: [] };
      r.boardHeroEffects = { uses: [] };
      r.doglegPlayerIds = ["hero"];
      const lastTrick = { number: 1, winnerId: "hero", leaderId: "hero", points: 0, plays: r.players.map(p => ({ playerId: p.id, cards: [p.hand[0]] })) };
      r.trickHistory = [lastTrick];
      game.finishGame(r, lastTrick);
      return r;
    };
    const before = settle(srId); const after = settle(ssrId);
    const sr = before.result.playerResults.find(p => p.playerId === "hero");
    const ssr = after.result.playerResults.find(p => p.playerId === "hero");
    assert.equal(ssr.gameScore, sr.gameScore + 3);
    assert.equal(ssr.baseGameScore, sr.baseGameScore);
    assert.equal(ssr.role, sr.role);
    assert.deepEqual(ssr.evaluationTags, sr.evaluationTags);
    assert.equal(after.result.winnerTeam, before.result.winnerTeam);
    assert.equal(ssr.diamondReward.totalAmount, sr.diamondReward.totalAmount);
    assert.equal(after.result.heroScoreAdjustments.length, 1);
    const firstResult = after.result;
    game.finishGame(after, after.trickHistory[0]);
    assert.equal(after.result, firstResult);
    assert.equal(ssr.gameScore, sr.gameScore + 3);
  }
});

test("no bot, guest or duplicate-account setup can activate advanced preparation skills", () => {
  for (const corrupt of [r => { r.players[2].test = true; }, r => { r.players[2].accountId = null; }, r => { r.players[2].accountId = r.players[1].accountId; }]) {
    const r = room(); corrupt(r);
    assert.equal(game.beginAdvancedHeroStage(r, "denghuang"), false);
  }
});
